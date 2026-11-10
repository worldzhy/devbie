import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

import { resolveTemplate, runCreate } from "../src/commands/create";

async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("resolveTemplate", () => {
  it("uses an explicit template path when given", async () => {
    const templateDir = await makeTempDir("fewbie-test-template-");
    after(async () => fs.rm(templateDir, { recursive: true, force: true }));
    await fs.writeFile(path.join(templateDir, "package.json"), "{}");

    const resolved = await resolveTemplate({ templatePath: templateDir });
    assert.equal(resolved.root, path.resolve(templateDir));
  });

  it("resolves a relative template path against the project cwd (R20-29)", async () => {
    const parent = await makeTempDir("fewbie-test-create-");
    after(async () => fs.rm(parent, { recursive: true, force: true }));
    const templateDir = path.join(parent, "templates", "basic");
    await fs.mkdir(templateDir, { recursive: true });
    await fs.writeFile(path.join(templateDir, "package.json"), "{}");

    const resolved = await resolveTemplate({ templatePath: "./templates/basic", cwd: parent });

    assert.equal(resolved.root, templateDir);
  });
});

async function writeTemplateFixture(root: string): Promise<void> {
  await fs.mkdir(path.join(root, "src", "app"), { recursive: true });
  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify(
      {
        name: "fewbie-basic-template",
        version: "0.1.0",
        scripts: {
          "check:template": "FEWBIE_TEMPLATE_REGISTRY_COMPLETE=1 fewbie template update --check --template-path .",
        },
      },
      null,
      2,
    ),
  );
  await fs.writeFile(path.join(root, ".env.example"), "HEARTBEAT_ENDPOINT=\n");
  await fs.writeFile(path.join(root, "src", "app", "page.tsx"), "export default function Page() { return null; }\n");
}

describe("runCreate", () => {
  it("rejects invalid project names without touching the filesystem", async () => {
    await assert.rejects(runCreate({ name: "Bad Name" }), /Invalid project name/);
    await assert.rejects(runCreate({ name: "" }), /Invalid project name/);
  });

  it("rejects a non-empty target directory", async () => {
    const parent = await makeTempDir("fewbie-test-create-");
    after(async () => fs.rm(parent, { recursive: true, force: true }));
    await fs.mkdir(path.join(parent, "proj"));
    await fs.writeFile(path.join(parent, "proj", "keep.txt"), "x");

    await assert.rejects(runCreate({ name: "proj", cwd: parent }), /not empty/);
  });

  it("copies the template and rewrites the package name", async () => {
    const parent = await makeTempDir("fewbie-test-create-");
    const templateDir = await makeTempDir("fewbie-test-template-");
    after(async () => fs.rm(parent, { recursive: true, force: true }));
    after(async () => fs.rm(templateDir, { recursive: true, force: true }));
    await writeTemplateFixture(templateDir);

    await runCreate({ name: "my-app", cwd: parent, gitInit: false, templatePath: templateDir });

    const target = path.join(parent, "my-app");
    const pkg = JSON.parse(await fs.readFile(path.join(target, "package.json"), "utf8")) as {
      name?: string;
      scripts?: Record<string, string>;
    };
    assert.equal(pkg.name, "my-app");
    // The template repository's registry-completeness gate must not demand
    // that the project's own business files be classified.
    assert.equal(pkg.scripts?.["check:template"], "fewbie template update --check --template-path .");
    const declaration = JSON.parse(await fs.readFile(path.join(target, "fewbie.json"), "utf8")) as {
      modules?: string[];
    };
    assert.deepEqual(declaration.modules, []);
    await assert.doesNotReject(() => fs.access(path.join(target, "src", "app", "page.tsx")));
    await assert.doesNotReject(() => fs.access(path.join(target, ".env.example")));
    await assert.rejects(() => fs.access(path.join(target, "node_modules")));
  });

  it("does not ship symlinked workspace mounts (R34-08)", async () => {
    const parent = await makeTempDir("fewbie-test-create-");
    const templateDir = await makeTempDir("fewbie-test-template-");
    after(async () => fs.rm(parent, { recursive: true, force: true }));
    after(async () => fs.rm(templateDir, { recursive: true, force: true }));
    await writeTemplateFixture(templateDir);
    await fs.mkdir(path.join(templateDir, ".trae"), { recursive: true });
    await fs.symlink("../../knowledge/skills", path.join(templateDir, ".trae", "skills"));

    await runCreate({ name: "my-app", cwd: parent, gitInit: false, templatePath: templateDir });

    await assert.rejects(() => fs.lstat(path.join(parent, "my-app", ".trae", "skills")), /ENOENT/);
  });
});
