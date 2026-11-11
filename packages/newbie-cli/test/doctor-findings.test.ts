import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { runDoctor } from "../src/commands/doctor";
import { REGISTRY_CACHE_DIR_ENV, REGISTRY_PATH_ENV, REGISTRY_REF_ENV } from "../src/lib/registry";

interface DoctorJson {
  registry: { available: boolean; refreshed?: boolean };
  errors: string[];
  notices: string[];
}

const directories: string[] = [];

async function makeTemp(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  directories.push(dir);
  return dir;
}

function git(root: string, ...args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

/** A cached registry clone whose modules tree does not carry `ghost`. */
async function makeCachedRegistry(): Promise<string> {
  const root = await makeTemp("newbie-doctor-cache-");
  const moduleDir = path.join(root, "packages", "modules", "present");
  await fs.mkdir(moduleDir, { recursive: true });
  await fs.writeFile(path.join(moduleDir, "newbie.module.json"), JSON.stringify({ key: "present" }), "utf8");
  git(root, "init", "-q", "-b", "main");
  git(root, "add", "-A");
  git(root, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-q", "-m", "seed");
  return root;
}

/** A consumer project declaring a module that the registry never carried. */
async function makeProject(): Promise<string> {
  const cwd = await makeTemp("newbie-doctor-project-");
  await fs.writeFile(
    path.join(cwd, "newbie-modules.json"),
    JSON.stringify({ registry: null, modules: [{ key: "ghost" }] }),
    "utf8",
  );
  return cwd;
}

/** No local checkout, so resolution can only use the cache configured by the test. */
function hideLocalCheckout(): void {
  process.env[REGISTRY_PATH_ENV] = path.join(os.tmpdir(), "newbie-doctor-no-checkout-");
}

async function runJsonDoctor(cwd: string): Promise<DoctorJson> {
  const originalLog = console.info;
  const lines: string[] = [];
  console.info = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  try {
    await runDoctor({ cwd, json: true });
  } finally {
    console.info = originalLog;
    process.exitCode = 0;
  }
  const payload = lines.find((line) => line.trimStart().startsWith("{"));
  assert.ok(payload, `doctor --json printed no payload:\n${lines.join("\n")}`);
  return JSON.parse(payload) as DoctorJson;
}

describe("doctor names the registry tree its findings came from", () => {
  afterEach(async () => {
    delete process.env[REGISTRY_PATH_ENV];
    delete process.env[REGISTRY_CACHE_DIR_ENV];
    delete process.env[REGISTRY_REF_ENV];
    await Promise.all(directories.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("attributes a missing module to the cached snapshot and names the refresh command", async () => {
    hideLocalCheckout();
    process.env[REGISTRY_CACHE_DIR_ENV] = await makeCachedRegistry();
    const cwd = await makeProject();

    const result = await runJsonDoctor(cwd);

    assert.equal(result.registry.refreshed, false);
    const finding = result.errors.find((message) => message.includes("Module 'ghost'"));
    assert.ok(finding, `expected a missing-module finding, got ${JSON.stringify(result.errors)}`);
    assert.match(finding, /not present in the cached snapshot @ [0-9a-f]{7};/);
    assert.match(finding, /newbie modules update ghost/);
  });

  it("skips registry key checks instead of reporting every module missing when no registry resolves", async () => {
    hideLocalCheckout();
    process.env[REGISTRY_CACHE_DIR_ENV] = path.join(os.tmpdir(), "newbie-doctor-no-cache-");
    const cwd = await makeProject();

    const result = await runJsonDoctor(cwd);

    assert.equal(result.registry.available, false);
    assert.equal(
      result.errors.some((message) => message.includes("not present in the")),
      false,
    );
    assert.ok(result.notices.some((message) => message.includes("registry checks skipped")));
  });
});
