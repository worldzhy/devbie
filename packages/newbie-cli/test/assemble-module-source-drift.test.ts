import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { diffModuleSources } from "../src/assemble/module-source-drift";

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

/**
 * Build a project (`src/modules/<key>`) and a registry checkout
 * (`packages/modules/<key>`) side by side; `null` skips that side.
 */
async function makeTrees(params: {
  key: string;
  project?: Record<string, string> | null;
  registry?: Record<string, string> | null;
}): Promise<{ cwd: string; registryRoot: string }> {
  const cwd = await makeTemp("newbie-drift-project-");
  const registryRoot = await makeTemp("newbie-drift-registry-");
  if (params.project) await writeFiles(path.join(cwd, "src", "modules", params.key), params.project);
  if (params.registry) await writeFiles(path.join(registryRoot, "packages", "modules", params.key), params.registry);
  return { cwd, registryRoot };
}

describe("diffModuleSources", () => {
  it("reports nothing for byte-identical module sources", async () => {
    const files = { "newbie.module.json": '{"key":"account"}', "src/account.service.ts": "export class A {}\n" };
    const { cwd, registryRoot } = await makeTrees({ key: "account", project: files, registry: files });

    assert.deepEqual(await diffModuleSources({ cwd, registryRoot, enabledKeys: ["account"] }), []);
  });

  it("reports changed, added and removed files separately", async () => {
    const { cwd, registryRoot } = await makeTrees({
      key: "account",
      project: {
        "newbie.module.json": '{"key":"account"}',
        "src/account.service.ts": "export class A { patched(): void {} }\n",
        "src/host-only.ts": "export const hostOnly = 1;\n",
      },
      registry: {
        "newbie.module.json": '{"key":"account"}',
        "src/account.service.ts": "export class A {}\n",
        "src/registry-only.ts": "export const registryOnly = 1;\n",
      },
    });

    const drifts = await diffModuleSources({ cwd, registryRoot, enabledKeys: ["account"] });

    assert.equal(drifts.length, 1);
    assert.equal(drifts[0].key, "account");
    assert.equal(drifts[0].installedPath, "src/modules/account");
    assert.equal(drifts[0].registryPath, "packages/modules/account");
    assert.deepEqual(drifts[0].report?.changed, ["src/account.service.ts"]);
    assert.deepEqual(drifts[0].report?.added, ["src/host-only.ts"]);
    assert.deepEqual(drifts[0].report?.removed, ["src/registry-only.ts"]);
  });

  it("flags a module installed but absent from the registry checkout", async () => {
    const { cwd, registryRoot } = await makeTrees({
      key: "account",
      project: { "newbie.module.json": '{"key":"account"}' },
      registry: null,
    });

    const drifts = await diffModuleSources({ cwd, registryRoot, enabledKeys: ["account"] });

    assert.equal(drifts.length, 1);
    assert.equal(drifts[0].report, null);
  });

  it("ignores modules that are not enabled", async () => {
    const { cwd, registryRoot } = await makeTrees({
      key: "account",
      project: { "src/account.service.ts": "export class A {}\n" },
      registry: { "src/account.service.ts": "export class B {}\n" },
    });

    assert.deepEqual(await diffModuleSources({ cwd, registryRoot, enabledKeys: [] }), []);
  });

  it("ignores empty leftover directories and OS metadata in the registry checkout", async () => {
    const files = { "newbie.module.json": '{"key":"security"}' };
    const { cwd, registryRoot } = await makeTrees({ key: "security", project: files, registry: files });
    await fs.mkdir(path.join(registryRoot, "packages", "modules", "security", "self-only"), { recursive: true });
    await fs.writeFile(path.join(registryRoot, "packages", "modules", "security", ".DS_Store"), "junk", "utf8");

    assert.deepEqual(await diffModuleSources({ cwd, registryRoot, enabledKeys: ["security"] }), []);
  });

  it("ignores enabled modules whose copy is not assembled yet", async () => {
    const { cwd, registryRoot } = await makeTrees({
      key: "account",
      project: null,
      registry: { "newbie.module.json": '{"key":"account"}' },
    });

    assert.deepEqual(await diffModuleSources({ cwd, registryRoot, enabledKeys: ["account"] }), []);
  });
});
