import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { MODULE_LOCK_FILE, MODULES_JSON } from "@devbie/modules-state";

import { readModuleSnapshot } from "../src/module-hub/snapshot";

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "newbie-snapshot-"));
}

async function writeFile(root: string, rel: string, content: string): Promise<void> {
  const full = path.resolve(root, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, "utf8");
}

describe("readModuleSnapshot", () => {
  let root: string;

  beforeEach(async () => {
    root = await makeTempDir();
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("returns empty array when newbie-modules.json is absent", async () => {
    const entries = await readModuleSnapshot(root);
    assert.deepEqual(entries, []);
  });

  it("returns empty array when newbie-modules.json is invalid JSON", async () => {
    await writeFile(root, MODULES_JSON, "{ not json");
    const entries = await readModuleSnapshot(root);
    assert.deepEqual(entries, []);
  });

  it("reads enabled keys, pairs them with lock identities and detects installed + hasSchema", async () => {
    await writeFile(root, MODULES_JSON, JSON.stringify({ modules: [{ key: "account" }, { key: "heartbeat" }] }));
    await writeFile(
      root,
      MODULE_LOCK_FILE,
      JSON.stringify({
        lockVersion: 1,
        modules: [
          { key: "account", sourceCommit: "abc123", files: [] },
          { key: "heartbeat", sourceCommit: null, files: [] },
        ],
      }),
    );
    // account: installed with schema
    await writeFile(
      root,
      "src/modules/account/newbie.module.json",
      JSON.stringify({
        key: "account",
        wiring: { file: "account.module", className: "AccountModule", prismaSchema: "prisma/schema.prisma" },
      }),
    );
    // heartbeat: installed without schema
    await writeFile(
      root,
      "src/modules/heartbeat/newbie.module.json",
      JSON.stringify({ key: "heartbeat", wiring: { file: "heartbeat.module", className: "HeartbeatModule" } }),
    );

    const entries = await readModuleSnapshot(root);
    assert.equal(entries.length, 2);

    const account = entries.find((e) => e.key === "account")!;
    assert.equal(account.sourceCommit, "abc123");
    assert.equal(account.installed, true);
    assert.equal(account.hasSchema, true);

    const heartbeat = entries.find((e) => e.key === "heartbeat")!;
    assert.equal(heartbeat.sourceCommit, null);
    assert.equal(heartbeat.installed, true);
    assert.equal(heartbeat.hasSchema, false);
  });

  it("marks uninstalled modules as installed=false", async () => {
    await writeFile(
      root,
      MODULES_JSON,
      JSON.stringify({
        modules: [{ key: "ghost" }],
      }),
    );

    const entries = await readModuleSnapshot(root);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].key, "ghost");
    assert.equal(entries[0].installed, false);
    assert.equal(entries[0].hasSchema, false);
  });

  it("skips records with missing or non-string key", async () => {
    await writeFile(
      root,
      MODULES_JSON,
      JSON.stringify({
        modules: [{ key: "valid" }, { key: "" }, { version: null }, { key: 123 }],
      }),
    );

    const entries = await readModuleSnapshot(root);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].key, "valid");
  });
});
