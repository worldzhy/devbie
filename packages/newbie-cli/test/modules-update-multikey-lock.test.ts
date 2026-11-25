import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { runUpdate } from "../src/commands/modules/update";
import { REGISTRY_PATH_ENV } from "../src/lib/registry";

const directories: string[] = [];
const originalEnv = process.env[REGISTRY_PATH_ENV];
const originalInfo = console.info;
const originalError = console.error;

afterEach(async () => {
  console.info = originalInfo;
  console.error = originalError;
  if (originalEnv === undefined) delete process.env[REGISTRY_PATH_ENV];
  else process.env[REGISTRY_PATH_ENV] = originalEnv;
  await Promise.all(directories.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function makeTemp(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  directories.push(dir);
  return dir;
}

function commitAll(root: string): string {
  const git = (...args: string[]): string => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  git("init", "-q");
  git("add", "-A");
  git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-q", "-m", "seed", "--allow-empty");
  return git("rev-parse", "HEAD");
}

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Regression guard: updating several modules in a single `modules update`
 * invocation must refresh the provenance lock for every selected module and
 * the top-level registry sourceCommit, not only the first key. This invariant
 * was verified end-to-end against a real consumer after a drift incident
 * (files byte-identical to the registry but the lock pin left stale); the test
 * pins the correct behaviour so a future refactor cannot silently regress it.
 */
describe("multi-key modules update refreshes every selected lock entry", () => {
  it("advances sourceCommit for all selected modules after a registry advance", async () => {
    console.info = () => undefined;

    // Module payloads are the single source of truth: registry commit C1 and
    // the installed copies + lock hashes are all derived from these objects,
    // so `copy-modified` is clean before the update. `wiring` is required by
    // the manifest validator reached during env/nestjs assembly.
    const alphaFiles = {
      "newbie.module.json": '{"key":"alpha","wiring":{"file":"alpha.module","className":"AlphaModule"}}\n',
      "src/alpha.service.ts": "export class AlphaService {}\n",
    };
    const betaFiles = {
      "newbie.module.json": '{"key":"beta","wiring":{"file":"beta.module","className":"BetaModule"}}\n',
      "src/beta.service.ts": "export class BetaService {}\n",
    };
    const writeTree = async (root: string, files: Record<string, string>) => {
      for (const [rel, content] of Object.entries(files)) {
        const target = path.join(root, rel);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, content);
      }
    };

    // --- Registry: two modules, committed at C1 ---
    const registry = await makeTemp("newbie-mk-registry-");
    await writeTree(path.join(registry, "packages/modules/alpha"), alphaFiles);
    await writeTree(path.join(registry, "packages/modules/beta"), betaFiles);
    const c1 = commitAll(registry);

    // --- Project: both modules installed + lock pinned at C1 ---
    const project = await makeTemp("newbie-mk-project-");
    await writeTree(path.join(project, "src/modules/alpha"), alphaFiles);
    await writeTree(path.join(project, "src/modules/beta"), betaFiles);

    const lockEntry = (key: string, files: Record<string, string>) => ({
      key,
      version: null,
      sourceCommit: c1,
      files: Object.fromEntries(Object.entries(files).map(([rel, content]) => [rel, sha256(content)])),
    });
    await fs.writeFile(
      path.join(project, "newbie-modules.lock.json"),
      JSON.stringify({ lockVersion: 1, modules: [lockEntry("alpha", alphaFiles), lockEntry("beta", betaFiles)] }),
      "utf8",
    );
    await fs.writeFile(
      path.join(project, "newbie-modules.json"),
      JSON.stringify({
        registry: { url: "https://example.invalid/reg.git", ref: "origin/dev", sourceCommit: c1 },
        modules: [{ key: "alpha" }, { key: "beta" }],
      }),
      "utf8",
    );
    await fs.writeFile(
      path.join(project, "package.json"),
      JSON.stringify({ name: "fixture", dependencies: {} }),
      "utf8",
    );
    await fs.mkdir(path.join(project, "prisma"), { recursive: true });
    await fs.writeFile(
      path.join(project, "prisma/schema.prisma"),
      'datasource db {\n  provider = "postgresql"\n  url      = env("DATABASE_URL")\n}\n',
      "utf8",
    );

    // --- Advance registry to C2 (change a file in each module) ---
    await fs.writeFile(
      path.join(registry, "packages/modules/alpha/src/alpha.service.ts"),
      "export class AlphaService { v2 = true; }\n",
    );
    await fs.writeFile(
      path.join(registry, "packages/modules/beta/src/beta.service.ts"),
      "export class BetaService { v2 = true; }\n",
    );
    const c2 = commitAll(registry);
    assert.notEqual(c1, c2, "registry must have advanced");

    // --- Run a SINGLE multi-key update ---
    process.env[REGISTRY_PATH_ENV] = registry;
    await runUpdate({ cwd: project, keys: ["alpha", "beta"], force: true, yes: true, skipPrismaGenerate: true });

    // --- Assert every selected lock entry advanced to C2 ---
    const lock = JSON.parse(await fs.readFile(path.join(project, "newbie-modules.lock.json"), "utf8"));
    const alpha = lock.modules.find((m: { key: string }) => m.key === "alpha");
    const beta = lock.modules.find((m: { key: string }) => m.key === "beta");
    assert.equal(alpha.sourceCommit, c2, "alpha lock sourceCommit should advance to C2");
    assert.equal(beta.sourceCommit, c2, "beta lock sourceCommit should advance to C2");

    const state = JSON.parse(await fs.readFile(path.join(project, "newbie-modules.json"), "utf8"));
    assert.equal(state.registry.sourceCommit, c2, "top-level registry sourceCommit should advance to C2");

    // Installed copies must reflect C2 content (the update actually copied).
    const alphaInstalled = await fs.readFile(path.join(project, "src/modules/alpha/src/alpha.service.ts"), "utf8");
    assert.equal(alphaInstalled, "export class AlphaService { v2 = true; }\n");
  });
});
