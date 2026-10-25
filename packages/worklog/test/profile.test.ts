import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { upsertConfigFromProfile } from "../src/profile";

function configPath(): string {
  return join(mkdtempSync(join(tmpdir(), "worklog-profile-")), "config.json");
}

describe("upsertConfigFromProfile", () => {
  it("writes a config carrying the profile credentials", () => {
    const path = configPath();

    upsertConfigFromProfile({ endpoint: "https://nw.example.com/", token: "token-1" }, path);

    const written = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(written.endpoint, "https://nw.example.com");
    assert.equal(written.token, "token-1");
    assert.deepEqual(written.workspaces, []);
  });

  it("keeps declared workspaces when the profile is re-applied after a token rotation", () => {
    const path = configPath();
    upsertConfigFromProfile({ endpoint: "https://nw.example.com", token: "token-1" }, path);
    const existing = JSON.parse(readFileSync(path, "utf8"));
    existing.workspaces = [{ workspaceKey: "app", rootPath: "/Users/w/app" }];
    writeFileSync(path, JSON.stringify(existing), "utf8");

    upsertConfigFromProfile({ endpoint: "https://nw.example.com", token: "token-2" }, path);

    const written = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(written.token, "token-2");
    assert.deepEqual(written.workspaces, [{ workspaceKey: "app", rootPath: "/Users/w/app" }]);
  });

  it("rejects an incomplete profile", () => {
    assert.throws(() => upsertConfigFromProfile({ endpoint: "", token: "token-1" }, configPath()));
  });
});
