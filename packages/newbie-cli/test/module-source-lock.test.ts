import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, it } from "node:test";

import { MODULE_LOCK_FILE } from "@devbie/modules-state";

import { diffModuleSources } from "../src/assemble/module-source-drift";
import { normalizeModuleLock, sortModuleLock } from "../src/core/module-lock";
import type { RegistryLocation } from "../src/lib/registry";
import type { ModulesState } from "@devbie/modules-state";

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

async function hashTree(root: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  async function walk(relative: string): Promise<void> {
    for (const entry of await fs.readdir(path.join(root, relative), { withFileTypes: true })) {
      const next = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(next);
      else if (entry.isFile()) {
        files[next] = createHash("sha256")
          .update(await fs.readFile(path.join(root, next)))
          .digest("hex");
      }
    }
  }
  await walk("");
  return files;
}

function commitAll(root: string): string {
  const git = (...args: string[]): string => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  git("init", "-q");
  git("add", "-A");
  git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-q", "-m", "seed", "--allow-empty");
  return git("rev-parse", "HEAD");
}

function stateWith(key: string, sourceCommit: string | null): ModulesState {
  return {
    registry: { url: "https://example.invalid/registry.git", sourceCommit },
    modules: [{ key, version: null, sourceCommit, localPatches: [] }],
  };
}

/** Project copy + committed registry tree, plus a lock manifest for the copy. */
async function makeLockedTrees(): Promise<{
  cwd: string;
  registry: RegistryLocation;
  commit: string;
  files: Record<string, string>;
}> {
  const files = { "newbie.module.json": '{"key":"account"}', "src/account.service.ts": "export class A {}\n" };
  const cwd = await makeTemp("newbie-lock-project-");
  const registryRoot = await makeTemp("newbie-lock-registry-");
  await writeFiles(path.join(cwd, "src", "modules", "account"), files);
  await writeFiles(path.join(registryRoot, "packages", "modules", "account"), files);
  const commit = commitAll(registryRoot);
  const lock = {
    lockVersion: 1,
    modules: [
      {
        key: "account",
        version: null,
        sourceCommit: commit,
        files: await hashTree(path.join(cwd, "src/modules/account")),
      },
    ],
  };
  await fs.writeFile(path.join(cwd, MODULE_LOCK_FILE), JSON.stringify(lock), "utf8");
  return {
    cwd,
    registry: {
      root: registryRoot,
      url: "https://example.invalid/r.git",
      sourceCommit: commit,
      local: true,
      refreshed: false,
    },
    commit,
    files,
  };
}

describe("provenance lock", () => {
  it("validates the on-disk shape and rejects duplicates", () => {
    assert.throws(() => normalizeModuleLock({ lockVersion: 2, modules: [] }), /lockVersion/);
    assert.throws(
      () =>
        normalizeModuleLock({
          lockVersion: 1,
          modules: [
            { key: "a", sourceCommit: "abc", files: {} },
            { key: "a", sourceCommit: "abc", files: {} },
          ],
        }),
      /duplicate entry for 'a'/,
    );
    assert.throws(
      () => normalizeModuleLock({ lockVersion: 1, modules: [{ key: "a", files: {} }] }),
      /needs a non-empty sourceCommit/,
    );
  });

  it("sorts entries and file keys for a stable diff", () => {
    const sorted = sortModuleLock({
      lockVersion: 1,
      modules: [
        { key: "b", version: null, sourceCommit: "2", files: { "z.ts": "1", "a.ts": "2" } },
        { key: "a", version: null, sourceCommit: "1", files: {} },
      ],
    });
    assert.deepEqual(
      sorted.modules.map((entry) => entry.key),
      ["a", "b"],
    );
    assert.deepEqual(Object.keys(sorted.modules[1].files), ["a.ts", "z.ts"]);
  });

  it("treats a copy matching its lock as clean", async () => {
    const { cwd, registry, commit } = await makeLockedTrees();
    assert.deepEqual(
      await diffModuleSources({ cwd, registry, state: stateWith("account", commit), enabledKeys: ["account"] }),
      [],
    );
  });

  it("reports copy-modified without touching the registry", async () => {
    const { cwd, registry, commit } = await makeLockedTrees();
    await fs.writeFile(path.join(cwd, "src/modules/account/src/account.service.ts"), "export class B {}\n", "utf8");
    const [drift] = await diffModuleSources({
      cwd,
      registry,
      state: stateWith("account", commit),
      enabledKeys: ["account"],
    });
    assert.equal(drift.reason, "copy-modified");
    assert.deepEqual(drift.report?.changed, ["src/account.service.ts"]);
  });

  it("reports lock-missing when the copy has no entry", async () => {
    const { cwd, registry, commit } = await makeLockedTrees();
    await fs.writeFile(path.join(cwd, MODULE_LOCK_FILE), JSON.stringify({ lockVersion: 1, modules: [] }), "utf8");
    const [drift] = await diffModuleSources({
      cwd,
      registry,
      state: stateWith("account", commit),
      enabledKeys: ["account"],
    });
    assert.equal(drift.reason, "lock-missing");
  });

  it("reports lock-tampered when the manifest disagrees with the pinned tree", async () => {
    // The copy matches its manifest, but the registry tree at the locked
    // commit carries one more file: the manifest was not taken from it.
    const cwd = await makeTemp("newbie-lock-project-");
    const registryRoot = await makeTemp("newbie-lock-registry-");
    await writeFiles(path.join(cwd, "src/modules/account"), { "newbie.module.json": '{"key":"account"}' });
    await writeFiles(path.join(registryRoot, "packages/modules/account"), {
      "newbie.module.json": '{"key":"account"}',
      "src/extra.ts": "export const extra = true;\n",
    });
    const commit = commitAll(registryRoot);
    const lock = {
      lockVersion: 1,
      modules: [
        {
          key: "account",
          version: null,
          sourceCommit: commit,
          files: await hashTree(path.join(cwd, "src/modules/account")),
        },
      ],
    };
    await fs.writeFile(path.join(cwd, MODULE_LOCK_FILE), JSON.stringify(lock), "utf8");
    const registry: RegistryLocation = {
      root: registryRoot,
      url: "https://example.invalid/r.git",
      sourceCommit: commit,
      local: true,
      refreshed: false,
    };
    const [drift] = await diffModuleSources({
      cwd,
      registry,
      state: stateWith("account", commit),
      enabledKeys: ["account"],
    });
    assert.equal(drift.reason, "lock-tampered");
    assert.deepEqual(drift.report?.removed, ["src/extra.ts"]);
  });
});
