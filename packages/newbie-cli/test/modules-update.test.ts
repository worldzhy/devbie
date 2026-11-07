import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { backupInstalledModules, runUpdate } from "../src/commands/modules/update";
import { REGISTRY_PATH_ENV } from "../src/lib/registry";
import { CliError } from "@devbie/cli-kit";

/** R5-12: an update may never overwrite a copy it cannot verify against a pin. */
describe("R5-12: modules update refuses unpinned overwrite", () => {
  let project: string;
  let registry: string;
  const originalEnv = process.env[REGISTRY_PATH_ENV];
  const originalInfo = console.info;
  const logs: string[] = [];

  before(async () => {
    project = await fs.mkdtemp(path.join(os.tmpdir(), "newbie-up-project-"));
    registry = await fs.mkdtemp(path.join(os.tmpdir(), "newbie-up-registry-"));
    // A usable registry needs the modules subtree to exist.
    await fs.mkdir(path.join(registry, "packages/modules"), { recursive: true });
    await fs.mkdir(path.join(project, "src/modules/alpha"), { recursive: true });
    await fs.writeFile(path.join(project, "src/modules/alpha/index.ts"), "// host copy\n", "utf8");
    // No sourceCommit: the installed copy has no pristine baseline.
    await fs.writeFile(
      path.join(project, "newbie-modules.json"),
      JSON.stringify({ registry: null, modules: [{ key: "alpha", version: null, sourceCommit: null }] }),
      "utf8",
    );
    process.env[REGISTRY_PATH_ENV] = registry;
    console.info = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };
  });

  after(async () => {
    console.info = originalInfo;
    if (originalEnv === undefined) delete process.env[REGISTRY_PATH_ENV];
    else process.env[REGISTRY_PATH_ENV] = originalEnv;
    await fs.rm(project, { recursive: true, force: true });
    await fs.rm(registry, { recursive: true, force: true });
  });

  it("skips the module instead of copying over it, and writes no backup", async () => {
    await runUpdate({ cwd: project, dryRun: false, yes: true });

    assert.ok(
      logs.some((line) => line.includes("alpha") && line.includes("no verifiable pinned source")),
      `expected an unpinned skip notice, got:\n${logs.join("\n")}`,
    );
    assert.equal(
      await fs.readFile(path.join(project, "src/modules/alpha/index.ts"), "utf8"),
      "// host copy\n",
      "the unpinned copy must stay untouched",
    );
    await assert.rejects(fs.access(path.join(project, ".newbie/backups")), "no backup should be written");
  });
});

describe("R6-03: modules update --check reports an enabled copy that is gone", () => {
  let project: string;
  let registry: string;
  const originalEnv = process.env[REGISTRY_PATH_ENV];
  const originalInfo = console.info;

  before(async () => {
    project = await fs.mkdtemp(path.join(os.tmpdir(), "newbie-up-check-project-"));
    registry = await fs.mkdtemp(path.join(os.tmpdir(), "newbie-up-check-registry-"));
    await fs.mkdir(path.join(registry, "packages/modules"), { recursive: true });
    // Pinned in newbie-modules.json, but the copy under src/modules is absent: until
    // R6-03 this path printed the green verdict and exited 0.
    await fs.writeFile(
      path.join(project, "newbie-modules.json"),
      JSON.stringify({ registry: null, modules: [{ key: "alpha", version: null, sourceCommit: "deadbeef" }] }),
      "utf8",
    );
    process.env[REGISTRY_PATH_ENV] = registry;
    console.info = () => undefined;
  });

  after(async () => {
    console.info = originalInfo;
    if (originalEnv === undefined) delete process.env[REGISTRY_PATH_ENV];
    else process.env[REGISTRY_PATH_ENV] = originalEnv;
    await fs.rm(project, { recursive: true, force: true });
    await fs.rm(registry, { recursive: true, force: true });
  });

  it("fails instead of printing a green verdict", async () => {
    await assert.rejects(runUpdate({ cwd: project, dryRun: true, check: true }), (error: unknown) => {
      assert.ok(error instanceof CliError);
      assert.match(error.message, /alpha/);
      assert.match(error.message, /cannot be verified/);
      return true;
    });
  });
});

describe("R5-12: forced overwrite keeps a byte copy", () => {
  let project: string;

  before(async () => {
    project = await fs.mkdtemp(path.join(os.tmpdir(), "newbie-up-backup-"));
    await fs.mkdir(path.join(project, "src/modules/alpha"), { recursive: true });
    await fs.writeFile(path.join(project, "src/modules/alpha/index.ts"), "// host copy\n", "utf8");
  });

  after(async () => {
    await fs.rm(project, { recursive: true, force: true });
  });

  it("copies installed modules under .newbie/backups and skips absent ones", async () => {
    const saved = await backupInstalledModules(project, ["alpha", "absent"]);

    assert.equal(saved.length, 1, "only the installed module is backed up");
    assert.match(saved[0], /^\.newbie\/backups\/alpha-/);
    assert.equal(
      await fs.readFile(path.join(project, saved[0], "index.ts"), "utf8"),
      "// host copy\n",
      "the backup must be byte-identical",
    );
    // The source tree stays in place: the backup is additive.
    assert.equal(await fs.readFile(path.join(project, "src/modules/alpha/index.ts"), "utf8"), "// host copy\n");
  });
});
