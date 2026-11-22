import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { CliError } from "@devbie/cli-kit";

import { runApply } from "../src/commands/modules/apply";
import { REGISTRY_PATH_ENV } from "../src/lib/registry";

/** R20-07: `--check` is a CI gate, so it must fail where the real apply fails. */
describe("R20-07: modules apply --check counts fatal issues", () => {
  let project: string;
  let registry: string;
  const originalEnv = process.env[REGISTRY_PATH_ENV];
  const originalInfo = console.info;

  before(async () => {
    project = await fs.mkdtemp(path.join(os.tmpdir(), "newbie-apply-check-project-"));
    registry = await fs.mkdtemp(path.join(os.tmpdir(), "newbie-apply-check-registry-"));

    // The declared env key is never read by requires.config, which is exactly
    // the recoverable problem reported through the IssueBag during apply.
    const manifest = {
      key: "alpha",
      wiring: { file: "alpha.module", className: "AlphaModule" },
      requires: { env: { UNREAD_TOKEN: "" } },
    };
    await fs.mkdir(path.join(registry, "packages/modules/alpha"), { recursive: true });
    await fs.writeFile(
      path.join(registry, "packages/modules/alpha/newbie.module.json"),
      JSON.stringify(manifest),
      "utf8",
    );

    await fs.mkdir(path.join(project, "src/modules/alpha"), { recursive: true });
    await fs.writeFile(path.join(project, "src/modules/alpha/newbie.module.json"), JSON.stringify(manifest), "utf8");
    await fs.writeFile(
      path.join(project, "newbie-modules.json"),
      JSON.stringify({ registry: null, modules: [{ key: "alpha", version: null, sourceCommit: "deadbeef" }] }),
      "utf8",
    );
    await fs.writeFile(path.join(project, "package.json"), JSON.stringify({ name: "fixture" }), "utf8");
    await fs.mkdir(path.join(project, "prisma"), { recursive: true });
    await fs.writeFile(
      path.join(project, "prisma/schema.prisma"),
      'datasource db {\n  provider = "postgresql"\n  url      = env("DATABASE_URL")\n}\n',
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

  it("rejects instead of printing a dry-run skip", async () => {
    await assert.rejects(runApply({ cwd: project, dryRun: true, check: true }), (error: unknown) => {
      assert.ok(error instanceof CliError);
      assert.match(error.message, /1 error\(s\)/);
      return true;
    });
  });
});

/**
 * R70-05: a registry checkout that cannot read the pin is a stale cache, not
 * drift. Telling the reader to back-port against an unreadable commit sends them
 * to the wrong repo, so the gate names the refresh command instead.
 */
describe("R70-05: modules apply --check explains an unreadable registry pin", () => {
  let project: string;
  let registry: string;
  const originalEnv = process.env[REGISTRY_PATH_ENV];
  const originalInfo = console.info;

  before(async () => {
    project = await fs.mkdtemp(path.join(os.tmpdir(), "newbie-apply-pin-project-"));
    registry = await fs.mkdtemp(path.join(os.tmpdir(), "newbie-apply-pin-registry-"));

    const manifest = { key: "alpha", wiring: { file: "alpha.module", className: "AlphaModule" } };
    await fs.mkdir(path.join(registry, "packages/modules/alpha"), { recursive: true });
    await fs.writeFile(
      path.join(registry, "packages/modules/alpha/newbie.module.json"),
      JSON.stringify(manifest),
      "utf8",
    );

    await fs.mkdir(path.join(project, "src/modules/alpha"), { recursive: true });
    await fs.writeFile(path.join(project, "src/modules/alpha/newbie.module.json"), JSON.stringify(manifest), "utf8");
    await fs.writeFile(
      path.join(project, "newbie-modules.json"),
      JSON.stringify({ registry: null, modules: [{ key: "alpha", version: null, sourceCommit: "deadbeef" }] }),
      "utf8",
    );
    await fs.writeFile(path.join(project, "package.json"), JSON.stringify({ name: "fixture" }), "utf8");
    await fs.mkdir(path.join(project, "prisma"), { recursive: true });
    await fs.writeFile(
      path.join(project, "prisma/schema.prisma"),
      'datasource db {\n  provider = "postgresql"\n  url      = env("DATABASE_URL")\n}\n',
      "utf8",
    );

    process.env[REGISTRY_PATH_ENV] = registry;
    console.info = () => undefined;

    // A first real apply writes the generated wiring, so the `--check` run is
    // free of unrelated "generated files drift" noise and reaches the pin gate.
    // Prisma generation is skipped: the fixture has no client to build.
    await runApply({ cwd: project, skipPrismaGenerate: true });
  });

  after(async () => {
    console.info = originalInfo;
    if (originalEnv === undefined) delete process.env[REGISTRY_PATH_ENV];
    else process.env[REGISTRY_PATH_ENV] = originalEnv;
    await fs.rm(project, { recursive: true, force: true });
    await fs.rm(registry, { recursive: true, force: true });
  });

  it("names the stale checkout and how to make the pin readable", async () => {
    await assert.rejects(runApply({ cwd: project, dryRun: true, check: true }), (error: unknown) => {
      assert.ok(error instanceof CliError);
      assert.match(error.message, /cannot read the locked commit\(s\) deadbee/);
      assert.match(error.message, /local registry .* cannot fetch them/);
      return true;
    });
  });
});
