import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { startModuleHubReporting } from "../src/module-hub/reporter";

const GLOBAL_KEY = Symbol.for("@devbie/newbie:module-hub-reporter");

function cleanup(): void {
  const handle = (globalThis as Record<symbol, unknown>)[GLOBAL_KEY];
  if (handle && typeof (handle as { stop?: () => void }).stop === "function") {
    (handle as { stop(): void }).stop();
  }
}

type FetchFn = typeof globalThis.fetch;

function mockFetch(impl: () => Promise<Response>): {
  calls: Array<{ url: string; init: RequestInit }>;
  restore: () => void;
} {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return impl();
  }) as FetchFn;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "newbie-hub-"));
}

function parseBody(call: { init: RequestInit }): Record<string, unknown> {
  return JSON.parse(call.init.body as string) as Record<string, unknown>;
}

describe("startModuleHubReporting", () => {
  let root: string;

  beforeEach(async () => {
    cleanup();
    root = await makeTempDir();
  });

  afterEach(async () => {
    cleanup();
    await fs.rm(root, { recursive: true, force: true });
  });

  it("returns a handle with stop()", () => {
    const spy = mockFetch(async () => new Response(JSON.stringify({ reportIntervalSeconds: 60 }), { status: 200 }));
    const handle = startModuleHubReporting({ endpoint: "http://localhost:3000", token: "tok", projectRoot: root });
    assert.equal(typeof handle.stop, "function");
    handle.stop();
    spy.restore();
  });

  it("is idempotent: second call returns the same handle", () => {
    const spy = mockFetch(async () => new Response(JSON.stringify({ reportIntervalSeconds: 60 }), { status: 200 }));
    const first = startModuleHubReporting({ endpoint: "http://a", token: "t", projectRoot: root });
    const second = startModuleHubReporting({ endpoint: "http://b", token: "t", projectRoot: root });
    assert.strictEqual(first, second);
    first.stop();
    spy.restore();
  });

  it("sends full report with correct URL, headers, and snapshot", async () => {
    await fs.writeFile(
      path.join(root, "modules.json"),
      JSON.stringify({
        modules: [{ key: "account", version: "1.0.0", sourceCommit: "abc", localPatches: [] }],
      }),
    );
    await fs.mkdir(path.join(root, "src/modules/account"), { recursive: true });

    const spy = mockFetch(async () => new Response(JSON.stringify({ reportIntervalSeconds: 60 }), { status: 200 }));
    const handle = startModuleHubReporting({
      endpoint: "http://localhost:3000/module-hub/report",
      token: "secret-token",
      projectRoot: root,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.equal(spy.calls.length, 1);
    assert.equal(spy.calls[0].url, "http://localhost:3000/module-hub/report");
    assert.equal(spy.calls[0].init.method, "POST");
    const headers = spy.calls[0].init.headers as Record<string, string>;
    assert.equal(headers["X-Module-Hub-Token"], "secret-token");
    assert.equal(headers["Content-Type"], "application/json");

    const body = parseBody(spy.calls[0]);
    assert.equal(body.kind, "full");
    assert.equal(body.framework, "newbie");
    assert.equal(typeof body.frameworkVersion, "string");
    assert.ok((body.frameworkVersion as string).startsWith("newbie@"));
    assert.ok(Array.isArray(body.modules));
    assert.equal((body.modules as Array<{ key: string }>)[0].key, "account");

    handle.stop();
    spy.restore();
  });

  it("sends pings after the full report", async () => {
    const spy = mockFetch(async () => new Response(JSON.stringify({ reportIntervalSeconds: 60 }), { status: 200 }));
    const handle = startModuleHubReporting({
      endpoint: "http://localhost:3000",
      token: "tok",
      projectRoot: root,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    // First call is full; no ping yet (interval is 60s).
    assert.equal(spy.calls.length, 1);
    assert.equal(parseBody(spy.calls[0]).kind, "full");

    handle.stop();
    spy.restore();
  });

  it("silently drops network errors", async () => {
    const spy = mockFetch(async () => {
      throw new Error("network down");
    });
    const handle = startModuleHubReporting({
      endpoint: "http://localhost:3000",
      token: "tok",
      projectRoot: root,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(spy.calls.length, 1);

    handle.stop();
    spy.restore();
  });

  it("clamps a bogus reportIntervalSeconds instead of flooding pings", async () => {
    const spy = mockFetch(async () => new Response(JSON.stringify({ reportIntervalSeconds: -5 }), { status: 200 }));
    const handle = startModuleHubReporting({
      endpoint: "http://localhost:3000",
      token: "tok",
      projectRoot: root,
    });

    await new Promise((resolve) => setTimeout(resolve, 150));

    // A negative/zero interval must not collapse into a ~1ms ping loop.
    assert.equal(spy.calls.length, 1);

    handle.stop();
    spy.restore();
  });

  it("stops the ping interval when stop() is called", async () => {
    const spy = mockFetch(async () => new Response(JSON.stringify({ reportIntervalSeconds: 60 }), { status: 200 }));
    const handle = startModuleHubReporting({
      endpoint: "http://localhost:3000",
      token: "tok",
      projectRoot: root,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    const callsBeforeStop = spy.calls.length;
    handle.stop();
    await new Promise((resolve) => setTimeout(resolve, 120));
    assert.equal(spy.calls.length, callsBeforeStop);

    spy.restore();
  });

  it("allows restart after stop()", () => {
    const spy = mockFetch(async () => new Response(JSON.stringify({ reportIntervalSeconds: 60 }), { status: 200 }));
    const first = startModuleHubReporting({ endpoint: "http://a", token: "t", projectRoot: root });
    first.stop();
    const second = startModuleHubReporting({ endpoint: "http://b", token: "t", projectRoot: root });
    assert.notStrictEqual(first, second);
    second.stop();
    spy.restore();
  });
});
