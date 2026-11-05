import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { assembleSchemaFiles } from "../src/assemble/schema";
import { readDatasourceSchemas } from "../src/core/prisma-schema";
import { IssueBag } from "../src/lib/issues";
import { createSink } from "../src/lib/sink";

const MAIN_SCHEMA = `datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  schemas  = ["application"]
}

generator client {
  provider = "prisma-client-js"
}
`;

const ACCOUNT_FRAGMENT = `model User {
  id    String @id
  email String?

  @@schema("module/account")
}
`;

const directories: string[] = [];

async function makeProject(params: {
  modules: Record<string, { manifest: Record<string, unknown>; fragment?: string }>;
  additions?: Record<string, string>;
  mainSchema?: string | null;
  existingModels?: Record<string, string>;
}): Promise<string> {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "newbie-schema-assemble-"));
  directories.push(cwd);

  const mainSchema = params.mainSchema === undefined ? MAIN_SCHEMA : params.mainSchema;
  if (mainSchema !== null) {
    await fs.mkdir(path.join(cwd, "prisma"), { recursive: true });
    await fs.writeFile(path.join(cwd, "prisma", "schema.prisma"), mainSchema, "utf8");
  }

  for (const [key, { manifest, fragment }] of Object.entries(params.modules)) {
    const moduleDir = path.join(cwd, "src", "modules", key);
    await fs.mkdir(moduleDir, { recursive: true });
    await fs.writeFile(path.join(moduleDir, "newbie.module.json"), JSON.stringify(manifest), "utf8");
    if (fragment !== undefined) {
      const relative = String((manifest.wiring as Record<string, unknown>).prismaSchema);
      const file = path.join(moduleDir, relative);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, fragment, "utf8");
    }
  }

  for (const [key, content] of Object.entries(params.additions ?? {})) {
    const file = path.join(cwd, "prisma-additions", `${key}.prisma`);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content, "utf8");
  }

  for (const [file, content] of Object.entries(params.existingModels ?? {})) {
    const target = path.join(cwd, "prisma", "models", file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, "utf8");
  }

  return cwd;
}

/** Manifest preamble shared by every fixture. */
function manifest(key: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const { wiring: ew, requires: er, schema, ...rest } = extra;
  const mergedWiring: Record<string, unknown> = {
    file: `${key}.module`,
    className: `${key}Module`,
    ...((ew as object) ?? {}),
  };
  if (schema !== undefined) mergedWiring.prismaSchema = schema;
  return {
    key,
    wiring: mergedWiring,
    ...(er !== undefined ? { requires: er } : {}),
    ...rest,
  };
}

async function assemble(cwd: string, enabledKeys: string[]): Promise<{ issues: IssueBag }> {
  const issues = new IssueBag();
  await assembleSchemaFiles({
    cwd,
    sink: createSink(cwd, false),
    issues,
    enabledKeys,
    skipPrismaGenerate: true,
  });
  return { issues };
}

async function readIfExists(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return null;
  }
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("assembleSchemaFiles", () => {
  it("renders enabled fragments, merges host additions and reconciles the datasource", async () => {
    const cwd = await makeProject({
      modules: {
        account: { manifest: manifest("account", { schema: "prisma/schema.prisma" }), fragment: ACCOUNT_FRAGMENT },
      },
      additions: {
        account: `model User {
  displayName String?
}
`,
      },
      existingModels: {
        "stale.prisma": "// leftovers from an out-of-band removal\n",
      },
    });

    const { issues } = await assemble(cwd, ["account"]);

    assert.equal(issues.count, 0);
    const rendered = (await readIfExists(path.join(cwd, "prisma", "models", "account.prisma"))) ?? "";
    assert.match(rendered, /^\/\/ THIS FILE IS MANAGED BY @devbie\/newbie-cli/);
    assert.match(rendered, /displayName String\?/);
    assert.match(rendered, /@@schema\("module\/account"\)/);

    // Orphan model files converge away, not just files of removed keys.
    assert.equal(await readIfExists(path.join(cwd, "prisma", "models", "stale.prisma")), null);

    const main = (await readIfExists(path.join(cwd, "prisma", "schema.prisma"))) ?? "";
    assert.deepEqual(readDatasourceSchemas(main), ["application", "module/account"]);
  });

  it("keeps the module fragment and reports a conflicting addition", async () => {
    const cwd = await makeProject({
      modules: {
        account: { manifest: manifest("account", { schema: "prisma/schema.prisma" }), fragment: ACCOUNT_FRAGMENT },
      },
      additions: {
        account: `model User {
  email String?
}
`,
      },
    });

    const { issues } = await assemble(cwd, ["account"]);

    assert.equal(issues.count, 1);
    const rendered = (await readIfExists(path.join(cwd, "prisma", "models", "account.prisma"))) ?? "";
    // The module's own declaration wins; the conflicting addition is not applied.
    assert.equal(rendered.match(/email/g)?.length, 1);
  });

  it("reports additions that target models the module does not declare", async () => {
    const cwd = await makeProject({
      modules: {
        account: { manifest: manifest("account", { schema: "prisma/schema.prisma" }), fragment: ACCOUNT_FRAGMENT },
      },
      additions: {
        account: `model Ghost {
  id String @id
}
`,
      },
    });

    const { issues } = await assemble(cwd, ["account"]);

    assert.equal(issues.count, 1);
    const rendered = (await readIfExists(path.join(cwd, "prisma", "models", "account.prisma"))) ?? "";
    assert.doesNotMatch(rendered, /model Ghost/);
  });

  it("reports a declared-but-missing fragment and leaves that namespace out", async () => {
    const cwd = await makeProject({
      modules: {
        broken: { manifest: manifest("broken", { schema: "prisma/schema.prisma" }) },
      },
    });

    const { issues } = await assemble(cwd, ["broken"]);

    assert.equal(issues.count, 1);
    assert.equal(await readIfExists(path.join(cwd, "prisma", "models", "broken.prisma")), null);
    const main = (await readIfExists(path.join(cwd, "prisma", "schema.prisma"))) ?? "";
    assert.deepEqual(readDatasourceSchemas(main), ["application"]);
  });

  it("skips modules without a Prisma fragment", async () => {
    const cwd = await makeProject({
      modules: {
        plain: { manifest: manifest("plain") },
      },
    });

    const { issues } = await assemble(cwd, ["plain"]);

    assert.equal(issues.count, 0);
    assert.equal(await readIfExists(path.join(cwd, "prisma", "models", "plain.prisma")), null);
    const main = (await readIfExists(path.join(cwd, "prisma", "schema.prisma"))) ?? "";
    assert.deepEqual(readDatasourceSchemas(main), ["application"]);
  });

  it("is idempotent across repeated runs", async () => {
    const cwd = await makeProject({
      modules: {
        account: { manifest: manifest("account", { schema: "prisma/schema.prisma" }), fragment: ACCOUNT_FRAGMENT },
      },
      additions: { account: "model User {\n  displayName String?\n}\n" },
    });

    await assemble(cwd, ["account"]);
    const firstModel = await readIfExists(path.join(cwd, "prisma", "models", "account.prisma"));
    const firstMain = await readIfExists(path.join(cwd, "prisma", "schema.prisma"));

    await assemble(cwd, ["account"]);

    assert.equal(await readIfExists(path.join(cwd, "prisma", "models", "account.prisma")), firstModel);
    assert.equal(await readIfExists(path.join(cwd, "prisma", "schema.prisma")), firstMain);
  });

  it("reports a missing datasource schema instead of failing the step", async () => {
    const cwd = await makeProject({
      modules: {
        account: { manifest: manifest("account", { schema: "prisma/schema.prisma" }), fragment: ACCOUNT_FRAGMENT },
      },
      mainSchema: null,
    });

    const { issues } = await assemble(cwd, ["account"]);

    assert.equal(issues.count, 1);
    // The fragment is still rendered; only the datasource update is skipped.
    assert.ok(await readIfExists(path.join(cwd, "prisma", "models", "account.prisma")));
  });
});
