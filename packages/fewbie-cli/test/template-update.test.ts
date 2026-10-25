import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

import { runTemplateUpdate } from "../src/commands/template/update";
import { FRAMEWORK_MARKER_END, FRAMEWORK_MARKER_START } from "../src/lib/template-ownership";

async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

function globalsCss(block: string, host: string): string {
  return `@import "tailwindcss";\n\n${host}\n\n${FRAMEWORK_MARKER_START}\n${block}\n${FRAMEWORK_MARKER_END}\n`;
}

async function writeFile(root: string, relativePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(path.join(root, relativePath)), { recursive: true });
  await fs.writeFile(path.join(root, relativePath), content);
}

async function makeTemplate(): Promise<string> {
  const root = await makeTempDir("fewbie-update-template-");
  await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ name: "fewbie-basic-template" }, null, 2));
  await writeFile(root, "next.config.ts", "// template next config\n");
  await writeFile(root, "src/lib/utils.ts", "export const cn = () => '';\n");
  await writeFile(root, "src/app/globals.css", globalsCss("--primary: template;", ""));
  // Host-owned: template update must never copy this.
  await writeFile(root, "src/app/page.tsx", "// template page\n");
  return root;
}

async function makeProject(): Promise<string> {
  const root = await makeTempDir("fewbie-update-project-");
  await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ name: "fixture" }, null, 2));
  await writeFile(root, "next.config.ts", "// host next config\n");
  await writeFile(root, "src/app/globals.css", globalsCss("--primary: host;", ":root { --host: 42; }"));
  await writeFile(root, "src/app/page.tsx", "// host page\n");
  return root;
}

describe("fewbie template update", () => {
  it("--check reports drift without writing files", async () => {
    const project = await makeProject();
    const template = await makeTemplate();
    after(async () => {
      await fs.rm(project, { recursive: true, force: true });
      await fs.rm(template, { recursive: true, force: true });
    });

    await assert.rejects(
      runTemplateUpdate({ cwd: project, check: true, templatePath: template }),
      /drift from the template/,
    );
    assert.equal(await fs.readFile(path.join(project, "next.config.ts"), "utf8"), "// host next config\n");
  });

  it("writes framework files, updates only the marked block and creates missing files", async () => {
    const project = await makeProject();
    const template = await makeTemplate();
    after(async () => {
      await fs.rm(project, { recursive: true, force: true });
      await fs.rm(template, { recursive: true, force: true });
    });

    await runTemplateUpdate({ cwd: project, templatePath: template });

    assert.equal(await fs.readFile(path.join(project, "next.config.ts"), "utf8"), "// template next config\n");
    const globals = await fs.readFile(path.join(project, "src/app/globals.css"), "utf8");
    assert.match(globals, /--primary: template;/);
    assert.match(globals, /--host: 42;/);
    assert.ok(await fs.stat(path.join(project, "src/lib/utils.ts")));
    // Host-owned file stays untouched even though the template ships one.
    assert.equal(await fs.readFile(path.join(project, "src/app/page.tsx"), "utf8"), "// host page\n");
  });

  it("refuses to guess when the project copy lost its markers", async () => {
    const project = await makeProject();
    const template = await makeTemplate();
    after(async () => {
      await fs.rm(project, { recursive: true, force: true });
      await fs.rm(template, { recursive: true, force: true });
    });
    await writeFile(project, "src/app/globals.css", ":root { --primary: host; }\n");

    await assert.rejects(
      runTemplateUpdate({ cwd: project, check: true, templatePath: template }),
      /drift from the template/,
    );
    assert.equal(await fs.readFile(path.join(project, "src/app/globals.css"), "utf8"), ":root { --primary: host; }\n");
  });

  it("restricts the scope to the requested path prefixes", async () => {
    const project = await makeProject();
    const template = await makeTemplate();
    after(async () => {
      await fs.rm(project, { recursive: true, force: true });
      await fs.rm(template, { recursive: true, force: true });
    });

    await runTemplateUpdate({ cwd: project, templatePath: template, paths: ["src/lib"] });

    assert.ok(await fs.stat(path.join(project, "src/lib/utils.ts")));
    assert.equal(await fs.readFile(path.join(project, "next.config.ts"), "utf8"), "// host next config\n");
  });
});
