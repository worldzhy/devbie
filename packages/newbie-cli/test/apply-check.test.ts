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
