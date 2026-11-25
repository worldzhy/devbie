import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { runApply } from "../src/commands/modules/apply";
import { runDrift, DRIFT_EXIT_DRIFT } from "../src/commands/modules/drift";
import { REGISTRY_CACHE_DIR_ENV, REGISTRY_PATH_ENV } from "../src/lib/registry";

/**
 * ADR-078: `modules drift` is the pre-commit gate. It is offline-only, proves
 * the installed copy against the provenance lock, and signals drift with exit
 * code 2 (so the hook can distinguish drift from a tooling error). It must
 * never require a registry checkout or git: when the registry is unavailable
 * the lock-tampered step is skipped, not failed.
 */
describe("modules drift: exit code contract (ADR-078)", () => {
  let project: string;
  let registry: string;
  let emptyCache: string;
  const originalEnv = {
    path: process.env[REGISTRY_PATH_ENV],
    cache: process.env[REGISTRY_CACHE_DIR_ENV],
  };
  const originalInfo = console.info;
  const originalWarn = console.warn;
  const originalError = console.error;

  function silence(): void {
    console.info = () => undefined;
    console.warn = () => undefined;
    console.error = () => undefined;
  }

  before(async () => {
    project = await fs.mkdtemp(path.join(os.tmpdir(), "newbie-drift-project-"));
    registry = await fs.mkdtemp(path.join(os.tmpdir(), "newbie-drift-registry-"));
    emptyCache = await fs.mkdtemp(path.join(os.tmpdir(), "newbie-drift-cache-"));

    const manifest = { key: "alpha", wiring: { file: "alpha.module", className: "AlphaModule" } };
    await fs.mkdir(path.join(registry, "packages/modules/alpha"), { recursive: true });
    await fs.writeFile(
      path.join(registry, "packages/modules/alpha/newbie.module.json"),
      JSON.stringify(manifest),
      "utf8",
    );
    await fs.writeFile(
      path.join(registry, "packages/modules/alpha/alpha.module.ts"),
      "export class AlphaModule {}\n",
      "utf8",
    );

    execFileSync("git", ["init", "-q"], { cwd: registry });
    execFileSync("git", ["add", "-A"], { cwd: registry });
    execFileSync("git", ["-c", "user.email=test@example.com", "-c", "user.name=test", "commit", "-qm", "fixture"], {
      cwd: registry,
    });
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: registry }).toString().trim();

    await fs.writeFile(path.join(project, "package.json"), JSON.stringify({ name: "fixture" }), "utf8");
    await fs.mkdir(path.join(project, "prisma"), { recursive: true });
    await fs.writeFile(
      path.join(project, "prisma/schema.prisma"),
      'datasource db {\n  provider = "postgresql"\n  url      = env("DATABASE_URL")\n}\n',
      "utf8",
    );
    await fs.writeFile(
      path.join(project, "newbie-modules.json"),
      JSON.stringify({ registry: null, modules: [{ key: "alpha", version: null, sourceCommit: head }] }),
      "utf8",
    );

    process.env[REGISTRY_PATH_ENV] = registry;
    silence();
    // Seed the lock and generated wiring with a real apply; the fixture has no
    // prisma client to build.
    await runApply({ cwd: project, yes: true, skipPrismaGenerate: true });
  });

  after(async () => {
    process.exitCode = 0;
    console.info = originalInfo;
    console.warn = originalWarn;
    console.error = originalError;
    if (originalEnv.path === undefined) delete process.env[REGISTRY_PATH_ENV];
    else process.env[REGISTRY_PATH_ENV] = originalEnv.path;
    if (originalEnv.cache === undefined) delete process.env[REGISTRY_CACHE_DIR_ENV];
    else process.env[REGISTRY_CACHE_DIR_ENV] = originalEnv.cache;
    await fs.rm(project, { recursive: true, force: true });
    await fs.rm(registry, { recursive: true, force: true });
    await fs.rm(emptyCache, { recursive: true, force: true });
  });

  it("exits 0 when installed copies match the lock", async () => {
    process.exitCode = 0;
    await runDrift({ cwd: project });
    assert.equal(process.exitCode, 0);
  });

  it("exits 2 on a copy-modified installed file", async () => {
    await fs.writeFile(path.join(project, "src/modules/alpha/alpha.module.ts"), "export class Tampered {}\n", "utf8");
    process.exitCode = 0;
    await runDrift({ cwd: project });
    assert.equal(process.exitCode, DRIFT_EXIT_DRIFT);
    // restore for subsequent tests
    await fs.writeFile(
      path.join(project, "src/modules/alpha/alpha.module.ts"),
      "export class AlphaModule {}\n",
      "utf8",
    );
  });

  it("exits 2 when a declared copy is missing", async () => {
    await fs.rm(path.join(project, "src/modules/alpha"), { recursive: true, force: true });
    process.exitCode = 0;
    await runDrift({ cwd: project });
    assert.equal(process.exitCode, DRIFT_EXIT_DRIFT);
    // restore: re-apply to bring the copy back
    await runApply({ cwd: project, yes: true, skipPrismaGenerate: true });
  });

  it("exits 2 when the lock has no entry for an installed copy (lock-missing)", async () => {
    await fs.rm(path.join(project, "newbie-modules.lock.json"), { force: true });
    process.exitCode = 0;
    await runDrift({ cwd: project });
    assert.equal(process.exitCode, DRIFT_EXIT_DRIFT);
    // restore the lock
    await runApply({ cwd: project, yes: true, skipPrismaGenerate: true });
  });

  it("stays green (exit 0) when the registry is unavailable, and still catches copy-modified (exit 2)", async () => {
    // Force resolveRegistry to return null: point NEWBIE_MODULES_PATH at a
    // nonexistent path and the cache dir at an empty one.
    process.env[REGISTRY_PATH_ENV] = path.join(project, "does-not-exist");
    process.env[REGISTRY_CACHE_DIR_ENV] = emptyCache;

    process.exitCode = 0;
    await runDrift({ cwd: project });
    assert.equal(process.exitCode, 0, "clean tree must stay green without a registry");

    await fs.writeFile(path.join(project, "src/modules/alpha/alpha.module.ts"), "export class Tampered {}\n", "utf8");
    process.exitCode = 0;
    await runDrift({ cwd: project });
    assert.equal(process.exitCode, DRIFT_EXIT_DRIFT, "copy-modified must be caught without a registry");

    // restore file + env
    await fs.writeFile(
      path.join(project, "src/modules/alpha/alpha.module.ts"),
      "export class AlphaModule {}\n",
      "utf8",
    );
    process.env[REGISTRY_PATH_ENV] = registry;
    delete process.env[REGISTRY_CACHE_DIR_ENV];
  });
});
