import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import { WorklogApi, WorklogAuthError } from "../src/api";

describe("WorklogApi circuit breaker", () => {
  it("batches workspaces at the server-side cap", async () => {
    const calls: string[] = [];
    mock.method(globalThis, "fetch", async (url: string | URL) => {
      calls.push(String(url));
      return new Response("ok", { status: 200 });
    });
    const api = new WorklogApi("https://nw.example.com", "token");
    const workspaces = Array.from({ length: 250 }, (_, index) => ({
      workspaceKey: `w${index}`,
      rootPath: `/w/${index}`,
    }));

    await api.reportWorkspaces(workspaces);

    assert.equal(calls.length, 3); // 100 + 100 + 50
    mock.restoreAll();
  });

  it("stops asking after the first 401 and tells the member to rotate", async () => {
    let calls = 0;
    mock.method(globalThis, "fetch", async () => {
      calls += 1;
      return new Response("unauthorized", { status: 401 });
    });
    const api = new WorklogApi("https://nw.example.com", "token");

    await assert.rejects(() => api.reportWorkspaces([{ workspaceKey: "a", rootPath: "/a" }]), WorklogAuthError);
    assert.equal(calls, 1);

    await assert.rejects(
      () =>
        api.reportDocuments([
          { workspaceKey: "a", title: "t", refPath: "docs/t.md", content: "c", capturedAt: new Date().toISOString() },
        ]),
      (error: unknown) => {
        assert.ok(error instanceof WorklogAuthError);
        assert.match(error.message, /--profile/);
        return true;
      },
    );
    assert.equal(calls, 1); // no second request went out
    mock.restoreAll();
  });
});
