import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { diffModuleSources } from "../src/assemble/module-source-drift";
import { RegistryLocation } from "../src/lib/registry";
import { ModulesState } from "@devbie/modules-state";

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

/** Commit everything in `root` and return the resulting commit id. */
function commitAll(root: string, message = "seed"): string {
  const git = (...args: string[]): string => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  git("init", "-q");
  git("add", "-A");
  git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-q", "-m", message, "--allow-empty");
  return git("rev-parse", "HEAD");
}

function registryAt(root: string, sourceCommit: string | null): RegistryLocation {
  return { root, url: "https://example.invalid/registry.git", sourceCommit, local: true, refreshed: false };
}

function stateWith(key: string, sourceCommit: string | null): ModulesState {
  return {
    registry: { url: "https://example.invalid/registry.git", sourceCommit },
    modules: [{ key, version: null, sourceCommit, localPatches: [] }],
  };
}

/**
 * Build a project (`src/modules/<key>`) and a committed registry checkout
 * (`packages/modules/<key>`); `null` skips that side. Returns the registry
 * location plus the commit that carries the registry files.
 */
async function makeTrees(params: {
  key: string;
  project?: Record<string, string> | null;
  registry?: Record<string, string> | null;
}): Promise<{ cwd: string; registry: RegistryLocation; commit: string }> {
  const cwd = await makeTemp("newbie-drift-project-");
  const registryRoot = await makeTemp("newbie-drift-registry-");
  if (params.project) await writeFiles(path.join(cwd, "src", "modules", params.key), params.project);
  if (params.registry) await writeFiles(path.join(registryRoot, "packages", "modules", params.key), params.registry);
  const commit = commitAll(registryRoot);
  return { cwd, registry: registryAt(registryRoot, commit), commit };
}

describe("diffModuleSources", () => {
  it("reports nothing for byte-identical module sources", async () => {
    const files = { "newbie.module.json": '{"key":"account"}', "src/account.service.ts": "export class A {}\n" };
    const { cwd, registry, commit } = await makeTrees({ key: "account", project: files, registry: files });

    assert.deepEqual(
      await diffModuleSources({ cwd, registry, state: stateWith("account", commit), enabledKeys: ["account"] }),
      [],
    );
  });

  it("reports changed, added and removed files separately", async () => {
    const { cwd, registry, commit } = await makeTrees({
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

    const drifts = await diffModuleSources({
      cwd,
      registry,
      state: stateWith("account", commit),
      enabledKeys: ["account"],
    });

    assert.equal(drifts.length, 1);
    assert.equal(drifts[0].key, "account");
    assert.equal(drifts[0].installedPath, "src/modules/account");
    assert.equal(drifts[0].registryPath, "packages/modules/account");
    assert.equal(drifts[0].baselineCommit, commit);
    assert.deepEqual(drifts[0].report?.changed, ["src/account.service.ts"]);
    assert.deepEqual(drifts[0].report?.added, ["src/host-only.ts"]);
    assert.deepEqual(drifts[0].report?.removed, ["src/registry-only.ts"]);
  });

  it("reports a missing sourceCommit pin instead of skipping the copy", async () => {
    const { cwd, registry } = await makeTrees({
      key: "account",
      project: { "newbie.module.json": '{"key":"account"}' },
      registry: { "newbie.module.json": '{"key":"account"}' },
    });

    const drifts = await diffModuleSources({
      cwd,
      registry,
      state: stateWith("account", null),
      enabledKeys: ["account"],
    });

    assert.equal(drifts.length, 1);
    assert.equal(drifts[0].reason, "missing-pin");
    assert.equal(drifts[0].report, null);
  });

  it("reports a pin the registry checkout cannot serve", async () => {
    const { cwd, registry } = await makeTrees({
      key: "account",
      project: { "newbie.module.json": '{"key":"account"}' },
      registry: { "newbie.module.json": '{"key":"account"}' },
    });

    const drifts = await diffModuleSources({
      cwd,
      registry,
      state: stateWith("account", "0".repeat(40)),
      enabledKeys: ["account"],
    });

    assert.equal(drifts.length, 1);
    assert.equal(drifts[0].reason, "unavailable-pin");
    assert.equal(drifts[0].report, null);
  });

  it("ignores uncommitted registry worktree edits (baseline is the pin)", async () => {
    const files = { "newbie.module.json": '{"key":"account"}', "src/account.service.ts": "export class A {}\n" };
    const { cwd, registry, commit } = await makeTrees({ key: "account", project: files, registry: files });
    await fs.writeFile(
      path.join(registry.root, "packages", "modules", "account", "src/account.service.ts"),
      "host edit\n",
    );

    assert.deepEqual(
      await diffModuleSources({ cwd, registry, state: stateWith("account", commit), enabledKeys: ["account"] }),
      [],
    );
  });

  it("ignores modules that are not enabled", async () => {
    const { cwd, registry, commit } = await makeTrees({
      key: "account",
      project: { "src/account.service.ts": "export class A {}\n" },
      registry: { "src/account.service.ts": "export class B {}\n" },
    });

    assert.deepEqual(
      await diffModuleSources({ cwd, registry, state: stateWith("account", commit), enabledKeys: [] }),
      [],
    );
  });

  it("ignores enabled modules whose copy is not assembled yet", async () => {
    const { cwd, registry, commit } = await makeTrees({
      key: "account",
      project: null,
      registry: { "newbie.module.json": '{"key":"account"}' },
    });

    assert.deepEqual(
      await diffModuleSources({ cwd, registry, state: stateWith("account", commit), enabledKeys: ["account"] }),
      [],
    );
  });
});
