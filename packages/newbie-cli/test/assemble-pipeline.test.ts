import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { normalizeModulesState } from "@devbie/modules-state";

import { applyModuleKeys, planReconcile, PipelineContext } from "../src/assemble/pipeline";
import { addModules } from "../src/assemble/modules-copy";
import { CliError } from "../src/lib/errors";
import { IssueBag } from "../src/lib/issues";
import { createSink } from "../src/lib/sink";

const REGISTRY_COMMIT = "registry-commit";
const directories: string[] = [];

async function makeRegistry(modules: Record<string, Record<string, unknown>>): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "newbie-pipeline-registry-"));
  directories.push(root);
  for (const [key, extra] of Object.entries(modules)) {
    const dir = path.join(root, "packages", "modules", key);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, "newbie.module.json"),
      JSON.stringify({ key, module: { file: `${key}.module`, className: `${key}Module` }, ...extra }),
      "utf8",
    );
  }
  return root;
}

async function makeProject(params: {
  modules: Array<{ key: string; sourceCommit?: string | null }>;
  copied?: string[];
  dryRun?: boolean;
}): Promise<string> {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "newbie-pipeline-project-"));
  directories.push(cwd);

  await fs.writeFile(
    path.join(cwd, "modules.json"),
    JSON.stringify(
      {
        registry: null,
        modules: params.modules.map((entry) => ({
          key: entry.key,
          version: null,
          sourceCommit: entry.sourceCommit === undefined ? "installed-commit" : entry.sourceCommit,
          localPatches: [],
        })),
      },
      null,
      2,
    ),
    "utf8",
  );

  for (const key of params.copied ?? []) {
    const dir = path.join(cwd, "src", "modules", key);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, "newbie.module.json"),
      JSON.stringify({ key, module: { file: `${key}.module`, className: `${key}Module` } }),
      "utf8",
    );
  }

  return cwd;
}

function context(cwd: string, registryRoot: string, dryRun = false): PipelineContext {
  return {
    cwd,
    sink: createSink(cwd, dryRun),
    issues: new IssueBag(),
    state: normalizeModulesState(null),
    registry: {
      root: registryRoot,
      url: "https://example.invalid/registry.git",
      sourceCommit: REGISTRY_COMMIT,
      local: true,
    },
  };
}

async function readState(cwd: string): Promise<{ modules: Array<{ key: string; sourceCommit: string | null }> }> {
  return JSON.parse(await fs.readFile(path.join(cwd, "modules.json"), "utf8"));
}

/** The pipeline prints step banners; keep test output readable. */
function silenceConsole<T>(run: () => Promise<T>): Promise<T> {
  const original = { info: console.info, warn: console.warn };
  console.info = () => undefined;
  console.warn = () => undefined;
  return run().finally(() => {
    console.info = original.info;
    console.warn = original.warn;
  });
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("planReconcile", () => {
  it("adopts the transitive closure, repairs interrupted copies and removes stale modules", async () => {
    const registryRoot = await makeRegistry({
      account: {},
      audit: { moduleDependencies: ["security"] },
      security: {},
    });
    const cwd = await makeProject({
      modules: [
        { key: "account", sourceCommit: "installed-commit" },
        { key: "audit", sourceCommit: null },
      ],
      copied: ["account", "audit", "orphan"],
    });
    const ctx = context(cwd, registryRoot);
    ctx.state = normalizeModulesState(await readState(cwd));

    const plan = await silenceConsole(() => planReconcile(ctx));

    assert.deepEqual(plan.enabledKeys, ["account", "audit", "security"]);
    // audit lacks a registry pin (interrupted install); security is new.
    assert.deepEqual(plan.installed, ["audit", "security"]);
    assert.deepEqual(plan.added, ["audit", "security"]);
    // A copied module no longer declared is removed.
    assert.deepEqual(plan.uninstalled, ["orphan"]);
    assert.deepEqual(plan.removed, ["orphan"]);
    assert.deepEqual(plan.closureAdded, [{ key: "security", requiredBy: ["audit"] }]);
  });

  it("refuses to install a deprecated module the project does not carry yet", async () => {
    const registryRoot = await makeRegistry({
      legacy: { deprecated: "use 'account' instead" },
    });
    const cwd = await makeProject({ modules: [{ key: "legacy" }] });
    const ctx = context(cwd, registryRoot);
    ctx.state = normalizeModulesState(await readState(cwd));

    await assert.rejects(
      silenceConsole(() => planReconcile(ctx)),
      (error: unknown) => {
        assert.ok(error instanceof CliError);
        assert.match(error.message, /Cannot install deprecated module\(s\): 'legacy'/);
        return true;
      },
    );
  });

  it("still repairs a deprecated module that is already installed", async () => {
    const registryRoot = await makeRegistry({
      legacy: { deprecated: "use 'account' instead" },
    });
    const cwd = await makeProject({
      modules: [{ key: "legacy", sourceCommit: null }],
      copied: ["legacy"],
    });
    const ctx = context(cwd, registryRoot);
    ctx.state = normalizeModulesState(await readState(cwd));

    const plan = await silenceConsole(() => planReconcile(ctx));
    assert.deepEqual(plan.installed, ["legacy"]);
  });

  it("fails early when a declared dependency is absent from the registry", async () => {
    const registryRoot = await makeRegistry({
      audit: { moduleDependencies: ["ghost"] },
    });
    const cwd = await makeProject({ modules: [{ key: "audit" }], copied: ["audit"] });
    const ctx = context(cwd, registryRoot);
    ctx.state = normalizeModulesState(await readState(cwd));

    await assert.rejects(
      silenceConsole(() => planReconcile(ctx)),
      (error: unknown) => {
        assert.ok(error instanceof CliError);
        assert.match(error.message, /module 'audit' depends on missing registry module 'ghost'/);
        return true;
      },
    );
  });
});

describe("applyModuleKeys", () => {
  it("expands the requested set to its dependency closure before diffing", async () => {
    const registryRoot = await makeRegistry({
      account: {},
      audit: { moduleDependencies: ["security"] },
      security: {},
    });
    const cwd = await makeProject({ modules: [{ key: "account" }], copied: ["account"] });
    const ctx = context(cwd, registryRoot, true);
    ctx.state = normalizeModulesState(await readState(cwd));

    const diff = await silenceConsole(() => applyModuleKeys(ctx, ["account", "audit"]));

    assert.deepEqual(diff, { added: ["audit", "security"], removed: [] });
    // Dry run must not persist the enabled set.
    const persisted = await readState(cwd);
    assert.deepEqual(
      persisted.modules.map((entry) => entry.key),
      ["account"],
    );
  });

  it("refuses an unknown module before touching modules.json", async () => {
    const registryRoot = await makeRegistry({ account: {} });
    const cwd = await makeProject({ modules: [{ key: "account" }], copied: ["account"] });
    const ctx = context(cwd, registryRoot);
    ctx.state = normalizeModulesState(await readState(cwd));

    await assert.rejects(
      silenceConsole(() => applyModuleKeys(ctx, ["account", "ghost"])),
      (error: unknown) => {
        assert.ok(error instanceof CliError);
        assert.match(error.message, /module 'ghost' is not present in the registry/);
        return true;
      },
    );

    const persisted = await readState(cwd);
    assert.deepEqual(
      persisted.modules.map((entry) => entry.key),
      ["account"],
    );
  });
});

describe("addModules", () => {
  it("keeps the installed copy when the registry source is missing", async () => {
    const registryRoot = await makeRegistry({ account: {} });
    const cwd = await makeProject({ modules: [{ key: "ghost" }], copied: ["ghost"] });
    const marker = path.join(cwd, "src", "modules", "ghost", "local.txt");
    await fs.writeFile(marker, "keep me", "utf8");

    await assert.rejects(
      silenceConsole(() =>
        addModules({
          cwd,
          sink: createSink(cwd, false),
          registry: {
            root: registryRoot,
            url: "https://example.invalid/registry.git",
            sourceCommit: REGISTRY_COMMIT,
            local: true,
          },
          keys: ["ghost"],
        }),
      ),
      (error: unknown) => {
        assert.ok(error instanceof CliError);
        assert.match(error.message, /missing module source\(s\):[\s\S]*ghost/);
        return true;
      },
    );

    assert.equal(await fs.readFile(marker, "utf8"), "keep me");
  });

  it("copies nothing when one of the requested sources is missing", async () => {
    const registryRoot = await makeRegistry({ account: {} });
    const cwd = await makeProject({
      modules: [{ key: "account" }, { key: "ghost" }],
      copied: ["account", "ghost"],
    });
    const marker = path.join(cwd, "src", "modules", "account", "local.txt");
    await fs.writeFile(marker, "keep me", "utf8");

    await assert.rejects(
      silenceConsole(() =>
        addModules({
          cwd,
          sink: createSink(cwd, false),
          registry: {
            root: registryRoot,
            url: "https://example.invalid/registry.git",
            sourceCommit: REGISTRY_COMMIT,
            local: true,
          },
          keys: ["account", "ghost"],
        }),
      ),
      (error: unknown) => {
        assert.ok(error instanceof CliError);
        assert.match(error.message, /ghost/);
        return true;
      },
    );

    assert.equal(await fs.readFile(marker, "utf8"), "keep me");
  });
});
