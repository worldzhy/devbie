import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { CliError } from "@devbie/cli-kit";

import {
  formatRegistryLocation,
  REGISTRY_CACHE_DIR_ENV,
  REGISTRY_PATH_ENV,
  REGISTRY_REF_ENV,
  resolveRegistry,
} from "../src/lib/registry";

/**
 * R7-01: newbie-modules.json#registry.ref/url must actually govern resolution.
 * Before the fix the block was write-only metadata — the cache clone silently
 * followed the remote default branch (main), and local checkouts ignored the
 * declared ref entirely.
 */

const directories: string[] = [];
const originalEnv = {
  path: process.env[REGISTRY_PATH_ENV],
  ref: process.env[REGISTRY_REF_ENV],
  cache: process.env[REGISTRY_CACHE_DIR_ENV],
};

afterEach(async () => {
  restoreEnv(REGISTRY_PATH_ENV, originalEnv.path);
  restoreEnv(REGISTRY_REF_ENV, originalEnv.ref);
  restoreEnv(REGISTRY_CACHE_DIR_ENV, originalEnv.cache);
  await Promise.all(directories.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

async function makeTemp(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  directories.push(dir);
  return dir;
}

function git(root: string, ...args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

/** A local registry checkout with the modules subtree, on branch `main`. */
async function makeLocalRegistry(): Promise<{ root: string; head: string }> {
  const root = await makeTemp("newbie-reg-local-");
  await fs.mkdir(path.join(root, "packages", "modules"), { recursive: true });
  git(root, "init", "-q", "-b", "main");
  git(root, "add", "-A");
  git(
    root,
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.invalid",
    "commit",
    "-q",
    "-m",
    "seed",
    "--allow-empty",
  );
  return { root, head: git(root, "rev-parse", "HEAD") };
}

/** A consumer project whose newbie-modules.json declares the given registry block. */
async function makeProject(registryBlock: unknown): Promise<string> {
  const cwd = await makeTemp("newbie-reg-project-");
  await fs.writeFile(
    path.join(cwd, "newbie-modules.json"),
    JSON.stringify({ registry: registryBlock, modules: [] }),
    "utf8",
  );
  return cwd;
}

async function captureWarnings(run: () => Promise<unknown>): Promise<string[]> {
  const original = console.warn;
  const warnings: string[] = [];
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  };
  try {
    await run();
  } finally {
    console.warn = original;
  }
  return warnings;
}

describe("R7-01: registry resolution honors declared ref/url", () => {
  it("newbie-modules.json#registry.ref governs when NEWBIE_MODULES_REF is absent", async () => {
    const { root } = await makeLocalRegistry();
    const cwd = await makeProject({ url: "https://example.invalid/registry.git", ref: "origin/dev" });
    process.env[REGISTRY_PATH_ENV] = root;
    delete process.env[REGISTRY_REF_ENV];

    const location = await resolveRegistry({ fetch: false, cwd });
    assert.equal(location?.ref, "origin/dev");
    assert.equal(location?.url, "https://example.invalid/registry.git");
  });

  it("NEWBIE_MODULES_REF wins over newbie-modules.json#registry.ref", async () => {
    const { root } = await makeLocalRegistry();
    const cwd = await makeProject({ ref: "origin/dev" });
    process.env[REGISTRY_PATH_ENV] = root;
    process.env[REGISTRY_REF_ENV] = "origin/release";

    const location = await resolveRegistry({ fetch: false, cwd });
    assert.equal(location?.ref, "origin/release");
  });

  it("an invalid newbie-modules.json#registry.ref is a hard error, not a silent fallback", async () => {
    const { root } = await makeLocalRegistry();
    const cwd = await makeProject({ ref: "-oops" });
    process.env[REGISTRY_PATH_ENV] = root;
    delete process.env[REGISTRY_REF_ENV];

    await assert.rejects(() => resolveRegistry({ fetch: false, cwd }), CliError);
  });

  it("warns when the local checkout does not match the declared ref", async () => {
    const { root, head } = await makeLocalRegistry();
    // A second commit on another branch makes origin/dev differ from HEAD.
    git(root, "checkout", "-q", "-b", "dev");
    git(
      root,
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.invalid",
      "commit",
      "-q",
      "-m",
      "dev",
      "--allow-empty",
    );
    const devHead = git(root, "rev-parse", "HEAD");
    git(root, "checkout", "-q", "main");
    assert.notEqual(head, devHead);

    const cwd = await makeProject({ ref: "dev" });
    process.env[REGISTRY_PATH_ENV] = root;
    delete process.env[REGISTRY_REF_ENV];

    const warnings = await captureWarnings(() => resolveRegistry({ fetch: false, cwd }));
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /local registry checkout/);
    assert.match(warnings[0], /'dev'/);
  });

  it("stays silent when the local checkout matches the declared ref", async () => {
    const { root } = await makeLocalRegistry();
    const cwd = await makeProject({ ref: "main" });
    process.env[REGISTRY_PATH_ENV] = root;
    delete process.env[REGISTRY_REF_ENV];

    const warnings = await captureWarnings(() => resolveRegistry({ fetch: false, cwd }));
    assert.deepEqual(warnings, []);
  });

  it("fetch mode clones the declared url and checks out the declared ref", async () => {
    // An "upstream" repo with diverging main and dev branches.
    const upstream = await makeTemp("newbie-reg-upstream-");
    await fs.mkdir(path.join(upstream, "packages", "modules"), { recursive: true });
    // Git never tracks empty directories; the modules tree needs a real file.
    await fs.writeFile(path.join(upstream, "packages", "modules", ".gitkeep"), "", "utf8");
    git(upstream, "init", "-q", "-b", "main");
    git(upstream, "add", "-A");
    git(
      upstream,
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.invalid",
      "commit",
      "-q",
      "-m",
      "main",
      "--allow-empty",
    );
    const mainHead = git(upstream, "rev-parse", "HEAD");
    git(upstream, "checkout", "-q", "-b", "dev");
    git(
      upstream,
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.invalid",
      "commit",
      "-q",
      "-m",
      "dev",
      "--allow-empty",
    );
    const devHead = git(upstream, "rev-parse", "HEAD");
    assert.notEqual(mainHead, devHead);

    // No local checkout: force the cache path via an unusable env path.
    process.env[REGISTRY_PATH_ENV] = path.join(os.tmpdir(), "newbie-reg-nonexistent-");
    delete process.env[REGISTRY_REF_ENV];
    process.env[REGISTRY_CACHE_DIR_ENV] = await makeTemp("newbie-reg-cache-parent-");

    const cwd = await makeProject({ url: upstream, ref: "dev" });
    const location = await resolveRegistry({ fetch: true, cwd });

    assert.equal(location?.local, false);
    assert.equal(location?.sourceCommit, devHead);
    assert.equal(location?.ref, "dev");
    assert.equal(location?.refreshed, true);
    // The cache clone carries the modules tree from the dev snapshot.
    assert.ok(location);
    await fs.stat(path.join(location.root, "packages", "modules"));
    assert.equal(
      formatRegistryLocation(location),
      `cache ${location.root} @ ${devHead.slice(0, 7)} (refreshed from dev)`,
    );

    // Offline reads of the same cache are snapshots, and must say so.
    const offline = await resolveRegistry({ fetch: false, cwd });
    assert.ok(offline);
    assert.equal(offline.refreshed, false);
    assert.equal(
      formatRegistryLocation(offline),
      `cache ${offline.root} @ ${devHead.slice(0, 7)} (offline snapshot, not refreshed)`,
    );
  });

  it("fetch mode fails closed when the declared ref does not resolve", async () => {
    const { root } = await makeLocalRegistry();
    process.env[REGISTRY_PATH_ENV] = path.join(os.tmpdir(), "newbie-reg-nonexistent-");
    delete process.env[REGISTRY_REF_ENV];
    process.env[REGISTRY_CACHE_DIR_ENV] = await makeTemp("newbie-reg-cache-parent-");

    const cwd = await makeProject({ url: root, ref: "origin/no-such-branch" });
    await assert.rejects(() => resolveRegistry({ fetch: true, cwd }), /could not be resolved/);
  });

  it("formatRegistryLocation renders source, ref and commit", async () => {
    const { root, head } = await makeLocalRegistry();
    const cwd = await makeProject({ ref: "main" });
    process.env[REGISTRY_PATH_ENV] = root;
    delete process.env[REGISTRY_REF_ENV];

    const location = await resolveRegistry({ fetch: false, cwd });
    assert.ok(location);
    assert.equal(formatRegistryLocation(location), `local ${root} @ main (${head.slice(0, 7)})`);
  });
});
