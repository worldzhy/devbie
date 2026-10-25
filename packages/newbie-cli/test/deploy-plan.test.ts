import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { applyDeployRenders, planDeployRenders } from "../src/assemble/deploy";
import { buildComposeModulesYaml } from "../src/core/deploy-compose";
import { CliError } from "@devbie/cli-kit";
import { IssueBag } from "../src/lib/issues";
import { createSink, Sink } from "../src/lib/sink";

const CADDY_TEMPLATE = `nw.inceptionpad.com {
  encode gzip

  # @@newbie-modules-start
  # @@newbie-modules-end

  handle /api/* {
    reverse_proxy backend:3000
  }
}
`;

const directories: string[] = [];

async function makeProject(params: {
  modules: Record<string, Record<string, unknown>>;
  migrators?: string[];
  caddyfile?: string | null;
  existingCompose?: string;
}): Promise<string> {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "newbie-deploy-plan-"));
  directories.push(cwd);

  for (const [key, manifest] of Object.entries(params.modules)) {
    const moduleDir = path.join(cwd, "src", "modules", key);
    await fs.mkdir(moduleDir, { recursive: true });
    await fs.writeFile(
      path.join(moduleDir, "newbie.module.json"),
      JSON.stringify({ key, module: { file: `${key}.module`, className: `${key}Module` }, ...manifest }),
      "utf8",
    );
  }

  for (const key of params.migrators ?? []) {
    const migrationDir = path.join(cwd, "src", "modules", key, "migration");
    await fs.mkdir(migrationDir, { recursive: true });
    await fs.writeFile(path.join(migrationDir, "migrate-cli.ts"), "// migrator entry\n", "utf8");
  }

  if (params.caddyfile !== null) {
    await fs.mkdir(path.join(cwd, "deploy"), { recursive: true });
    await fs.writeFile(path.join(cwd, "deploy", "Caddyfile.tmpl"), params.caddyfile ?? CADDY_TEMPLATE, "utf8");
  }

  if (params.existingCompose !== undefined) {
    await fs.mkdir(path.join(cwd, "deploy"), { recursive: true });
    await fs.writeFile(path.join(cwd, "deploy", "compose.modules.yml"), params.existingCompose, "utf8");
  }

  return cwd;
}

async function plan(
  cwd: string,
  enabledKeys: string[],
): Promise<{ plans: Awaited<ReturnType<typeof planDeployRenders>>; issues: IssueBag; sink: Sink }> {
  const issues = new IssueBag();
  const sink = createSink(cwd, false);
  const plans = await planDeployRenders({ cwd, sink, issues, enabledKeys });
  return { plans, issues, sink };
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("planDeployRenders", () => {
  it("renders the compose module layer with datastore services and migrators", async () => {
    const cwd = await makeProject({
      modules: { mongo: { layer: "datastore" }, clickhouse: { layer: "datastore" }, account: {} },
      migrators: ["clickhouse"],
      caddyfile: null,
    });

    const { plans, issues } = await plan(cwd, ["mongo", "clickhouse", "account"]);

    assert.equal(issues.count, 0);
    assert.deepEqual(
      plans.map((entry) => entry.path),
      ["deploy/compose.modules.yml"],
    );
    const expected = buildComposeModulesYaml([
      { key: "mongo", hasMigrator: false },
      { key: "clickhouse", hasMigrator: true },
    ]);
    assert.equal(plans[0].current, null);
    assert.equal(plans[0].next, expected);
    assert.match(plans[0].next, /clickhouse-migrate/);
  });

  it("reports no drift once the rendered assets are applied", async () => {
    const cwd = await makeProject({
      modules: { mongo: { layer: "datastore" }, account: { publicNamespace: true } },
      caddyfile: CADDY_TEMPLATE,
    });

    const first = await plan(cwd, ["mongo", "account"]);
    assert.equal(first.plans.length, 2);
    await applyDeployRenders(first.sink, first.plans);

    const second = await plan(cwd, ["mongo", "account"]);
    assert.deepEqual(second.plans, []);
  });

  it("claims the public namespace of every module that declares one", async () => {
    const cwd = await makeProject({
      modules: { account: { publicNamespace: true }, internal: {} },
      caddyfile: CADDY_TEMPLATE,
    });

    const { plans } = await plan(cwd, ["account", "internal"]);
    const caddy = plans.find((entry) => entry.path === "deploy/Caddyfile.tmpl");
    assert.ok(caddy);
    assert.match(caddy.next, /# @@newbie-modules-start\n\thandle \/account\/\* \{/);
    assert.doesNotMatch(caddy.next, /\/internal\/\*/);
    assert.match(caddy.next, /handle \/api\/\*/);
  });

  it("reports a missing installed manifest and skips that module", async () => {
    const cwd = await makeProject({ modules: { mongo: { layer: "datastore" } }, caddyfile: null });

    const { plans, issues } = await plan(cwd, ["mongo", "ghost"]);

    assert.equal(issues.count, 1);
    assert.equal(plans.length, 1);
    assert.doesNotMatch(plans[0].next, /ghost/);
  });

  it("rejects a datastore module missing from the CLI registry", async () => {
    const cwd = await makeProject({ modules: { vault: { layer: "datastore" } }, caddyfile: null });

    await assert.rejects(plan(cwd, ["vault"]), (error: unknown) => {
      assert.ok(error instanceof CliError);
      assert.match(error.message, /not listed in the CLI datastore registry/);
      return true;
    });
  });

  it("reports a Caddyfile without markers but still plans compose", async () => {
    const cwd = await makeProject({
      modules: { mongo: { layer: "datastore" } },
      caddyfile: "nw.inceptionpad.com {\n  handle /api/* {\n    reverse_proxy backend:3000\n  }\n}\n",
    });

    const { plans, issues } = await plan(cwd, ["mongo"]);

    assert.equal(issues.count, 1);
    assert.deepEqual(
      plans.map((entry) => entry.path),
      ["deploy/compose.modules.yml"],
    );
  });

  it("writes planned assets only when the sink is not a dry run", async () => {
    const cwd = await makeProject({ modules: { mongo: { layer: "datastore" } }, caddyfile: null });
    const { plans } = await plan(cwd, ["mongo"]);
    const drySink = createSink(cwd, true);

    await applyDeployRenders(drySink, plans);
    await assert.rejects(fs.stat(path.join(cwd, "deploy", "compose.modules.yml")));

    await applyDeployRenders(createSink(cwd, false), plans);
    const written = await fs.readFile(path.join(cwd, "deploy", "compose.modules.yml"), "utf8");
    assert.equal(written, plans[0].next);
  });
});
