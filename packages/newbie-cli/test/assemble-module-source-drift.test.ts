import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { diffModuleSources } from "../src/assemble/module-source-drift";
import { RegistryLocation } from "../src/lib/registry";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function makeTemp(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  directories.push(dir);
  return dir;
}

async function writeFiles(root: string, files: Record<string, string>): Promise<void> {
  for (const [relative, content] of Object.entries(files)) {
    const file = path.join(root, relative);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content, "utf8");
  }
}

function registryAt(root: string): RegistryLocation {
  return {
    root,
    url: "https://example.invalid/registry.git",
    sourceCommit: "0".repeat(40),
    local: true,
    refreshed: false,
  };
}

/**
 * Build a project copy (`src/modules/<key>`) and a registry checkout
 * (`packages/modules/<key>`); `null` skips that side. Neither side is locked:
 * these cases cover the migration window before `modules apply` seeds
 * `newbie-modules.lock.json`.
 */
async function makeTrees(params: {
  key: string;
  project?: Record<string, string> | null;
  registry?: Record<string, string> | null;
}): Promise<{ cwd: string; registry: RegistryLocation }> {
  const cwd = await makeTemp("newbie-drift-project-");
  const registryRoot = await makeTemp("newbie-drift-registry-");
  if (params.project) await writeFiles(path.join(cwd, "src", "modules", params.key), params.project);
  if (params.registry) await writeFiles(path.join(registryRoot, "packages", "modules", params.key), params.registry);
  return { cwd, registry: registryAt(registryRoot) };
}

describe("diffModuleSources without a lock", () => {
  it("reports lock-missing for every existing copy", async () => {
    const { cwd, registry } = await makeTrees({
      key: "account",
      project: { "newbie.module.json": '{"key":"account"}' },
      registry: { "newbie.module.json": '{"key":"account"}' },
    });

    const [drift] = await diffModuleSources({ cwd, registry, enabledKeys: ["account"] });

    assert.equal(drift.key, "account");
    assert.equal(drift.installedPath, "src/modules/account");
    assert.equal(drift.registryPath, "packages/modules/account");
    assert.equal(drift.reason, "lock-missing");
    assert.equal(drift.baselineCommit, null);
    assert.equal(drift.report, null);
  });

  it("stays quiet for enabled modules whose copy is not assembled yet", async () => {
    const { cwd, registry } = await makeTrees({
      key: "account",
      project: null,
      registry: { "newbie.module.json": '{"key":"account"}' },
    });

    assert.deepEqual(await diffModuleSources({ cwd, registry, enabledKeys: ["account"] }), []);
  });

  it("reports missing-copy when the caller requires installed modules", async () => {
    const { cwd, registry } = await makeTrees({
      key: "account",
      project: null,
      registry: { "newbie.module.json": '{"key":"account"}' },
    });

    const [drift] = await diffModuleSources({ cwd, registry, enabledKeys: ["account"], requireInstalled: true });

    assert.equal(drift.reason, "missing-copy");
  });

  it("ignores modules that are not enabled", async () => {
    const { cwd, registry } = await makeTrees({
      key: "account",
      project: { "src/account.service.ts": "export class A {}\n" },
      registry: { "src/account.service.ts": "export class B {}\n" },
    });

    assert.deepEqual(await diffModuleSources({ cwd, registry, enabledKeys: [] }), []);
  });
});
