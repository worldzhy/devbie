import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

import { runAdd } from "../src/commands/modules/add";
import { runApply } from "../src/commands/modules/apply";
import { runRemove } from "../src/commands/modules/remove";
import { runUpdate } from "../src/commands/modules/update";
import { MODULES_FILE, readModulesFile } from "../src/lib/modules-file";

async function makeProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fewbie-modules-"));
  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: "fixture", private: true, dependencies: {} }, null, 2),
  );
  return root;
}

async function read(projectRoot: string, relativePath: string): Promise<string> {
  return fs.readFile(path.join(projectRoot, relativePath), "utf8");
}

async function exists(projectRoot: string, relativePath: string): Promise<boolean> {
  return fs
    .access(path.join(projectRoot, relativePath))
    .then(() => true)
    .catch(() => false);
}

describe("fewbie modules", () => {
  it("adds named modules, expands the dependency closure and writes fewbie.json", async () => {
    const root = await makeProject();
    after(async () => fs.rm(root, { recursive: true, force: true }));

    await runAdd({ cwd: root, names: ["auth"], yes: true, skipInstall: true });

    assert.deepEqual(await readModulesFile(root), ["api-client", "auth"]);
    assert.ok(await exists(root, "src/lib/auth.ts"));
    assert.ok(await exists(root, "src/lib/api-client.ts"));
  });

  it("repairs missing files from the declaration without naming modules", async () => {
    const root = await makeProject();
    after(async () => fs.rm(root, { recursive: true, force: true }));
    await runAdd({ cwd: root, names: ["page-header"], yes: true, skipInstall: true });
    await fs.rm(path.join(root, "src/components/page-header.tsx"));

    await runApply({ cwd: root, yes: true, skipInstall: true });

    assert.ok(await exists(root, "src/components/page-header.tsx"));
  });

  it("fails --check when a declared file is missing", async () => {
    const root = await makeProject();
    after(async () => fs.rm(root, { recursive: true, force: true }));
    await runAdd({ cwd: root, names: ["page-header"], yes: true, skipInstall: true });
    await fs.rm(path.join(root, "src/components/page-header.tsx"));

    await assert.rejects(runApply({ cwd: root, check: true }), /file missing/);
  });

  it("fails --check when the declaration lacks a required dependency", async () => {
    const root = await makeProject();
    after(async () => fs.rm(root, { recursive: true, force: true }));
    await runAdd({ cwd: root, names: ["auth"], yes: true, skipInstall: true });
    await fs.writeFile(path.join(root, MODULES_FILE), `${JSON.stringify({ modules: ["auth"] }, null, 2)}\n`);

    await assert.rejects(runApply({ cwd: root, check: true }), /required by the declared set/);
  });

  it("refuses to remove a module another declared module still requires", async () => {
    const root = await makeProject();
    after(async () => fs.rm(root, { recursive: true, force: true }));
    await runAdd({ cwd: root, names: ["auth"], yes: true, skipInstall: true });

    await assert.rejects(runRemove({ cwd: root, names: ["api-client"], yes: true }), /still required/);
    assert.deepEqual(await readModulesFile(root), ["api-client", "auth"]);
  });

  it("removes an unmodified module file and its declaration", async () => {
    const root = await makeProject();
    after(async () => fs.rm(root, { recursive: true, force: true }));
    await runAdd({ cwd: root, names: ["page-header"], yes: true, skipInstall: true });

    await runRemove({ cwd: root, names: ["page-header"], yes: true });

    assert.deepEqual(await readModulesFile(root), []);
    assert.ok(!(await exists(root, "src/components/page-header.tsx")));
  });

  it("keeps a locally modified file when its module is removed", async () => {
    const root = await makeProject();
    after(async () => fs.rm(root, { recursive: true, force: true }));
    await runAdd({ cwd: root, names: ["page-header"], yes: true, skipInstall: true });
    await fs.writeFile(path.join(root, "src/components/page-header.tsx"), "// customized\n");

    await runRemove({ cwd: root, names: ["page-header"], yes: true });

    assert.equal(await read(root, "src/components/page-header.tsx"), "// customized\n");
  });

  it("update --check gates drift and update writes the registry version", async () => {
    const root = await makeProject();
    after(async () => fs.rm(root, { recursive: true, force: true }));
    await runAdd({ cwd: root, names: ["page-header"], yes: true, skipInstall: true });
    const original = await read(root, "src/components/page-header.tsx");
    await fs.writeFile(path.join(root, "src/components/page-header.tsx"), "// drift\n");

    await assert.rejects(runUpdate({ cwd: root, check: true }), /drift from the registry/);

    await runUpdate({ cwd: root, yes: true });
    assert.equal(await read(root, "src/components/page-header.tsx"), original);
  });

  it("conflicts on files that exist but belong to no declared module unless forced", async () => {
    const root = await makeProject();
    after(async () => fs.rm(root, { recursive: true, force: true }));
    await fs.mkdir(path.join(root, "src/components"), { recursive: true });
    await fs.writeFile(path.join(root, "src/components/page-header.tsx"), "// template copy\n");

    await assert.rejects(runAdd({ cwd: root, names: ["page-header"], yes: true, skipInstall: true }), /already exist/);
    assert.equal(await read(root, "src/components/page-header.tsx"), "// template copy\n");

    await runAdd({ cwd: root, names: ["page-header"], yes: true, skipInstall: true, force: true });
    assert.notEqual(await read(root, "src/components/page-header.tsx"), "// template copy\n");
  });
});
