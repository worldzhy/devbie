import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

import { runAdd } from "../src/commands/modules/add";
import { runAdapters, findOrphanAdapters } from "../src/commands/modules/adapters";
import { runApply } from "../src/commands/modules/apply";
import { runRemove } from "../src/commands/modules/remove";
import { runUpdate } from "../src/commands/modules/update";
import { MODULES_FILE, readModulesFile } from "../src/lib/modules-file";
import { readLockfile } from "../src/lib/lockfile";
import { loadModule, readModuleFileContent } from "../src/registry/store";
import { resolveRegistryRoot } from "../src/registry/source";
import { REGISTRY_MANIFEST_FILE } from "../src/registry/types";

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

    await runAdd({ cwd: root, names: ["account-access"], yes: true, skipInstall: true });

    assert.deepEqual(await readModulesFile(root), ["account-access", "password-checklist"]);
    assert.ok(await exists(root, "src/fewbie/modules/account-access/lib/auth.ts"));
    assert.ok(await exists(root, "src/fewbie/modules/account-access/features/login-page/login-page.tsx"));
  });

  it("repairs missing files from the declaration without naming modules", async () => {
    const root = await makeProject();
    after(async () => fs.rm(root, { recursive: true, force: true }));
    await runAdd({ cwd: root, names: ["data-table"], yes: true, skipInstall: true });
    await fs.rm(path.join(root, "src/fewbie/modules/data-table/components/data-table.tsx"));

    await runApply({ cwd: root, yes: true, skipInstall: true });

    assert.ok(await exists(root, "src/fewbie/modules/data-table/components/data-table.tsx"));
  });

  it("fails --check when a declared file is missing", async () => {
    const root = await makeProject();
    after(async () => fs.rm(root, { recursive: true, force: true }));
    await runAdd({ cwd: root, names: ["data-table"], yes: true, skipInstall: true });
    await fs.rm(path.join(root, "src/fewbie/modules/data-table/components/data-table.tsx"));

    await assert.rejects(runApply({ cwd: root, check: true }), /file missing/);
  });

  it("fails --check when the declaration lacks a required dependency", async () => {
    const root = await makeProject();
    after(async () => fs.rm(root, { recursive: true, force: true }));
    await runAdd({ cwd: root, names: ["account-access"], yes: true, skipInstall: true });
    await fs.writeFile(path.join(root, MODULES_FILE), `${JSON.stringify({ modules: ["account-access"] }, null, 2)}\n`);

    await assert.rejects(runApply({ cwd: root, check: true }), /required by the declared set/);
  });

  it("refuses to remove a module another declared module still requires", async () => {
    const root = await makeProject();
    after(async () => fs.rm(root, { recursive: true, force: true }));
    await runAdd({ cwd: root, names: ["account-access"], yes: true, skipInstall: true });

    await assert.rejects(runRemove({ cwd: root, names: ["password-checklist"], yes: true }), /still required/);
    assert.deepEqual(await readModulesFile(root), ["account-access", "password-checklist"]);
  });

  it("removes an unmodified module file and its declaration", async () => {
    const root = await makeProject();
    after(async () => fs.rm(root, { recursive: true, force: true }));
    await runAdd({ cwd: root, names: ["data-table"], yes: true, skipInstall: true });

    await runRemove({ cwd: root, names: ["data-table"], yes: true });

    assert.deepEqual(await readModulesFile(root), []);
    assert.ok(!(await exists(root, "src/fewbie/modules/data-table/components/data-table.tsx")));
  });

  it("keeps a locally modified file when its module is removed", async () => {
    const root = await makeProject();
    after(async () => fs.rm(root, { recursive: true, force: true }));
    await runAdd({ cwd: root, names: ["data-table"], yes: true, skipInstall: true });
    await fs.writeFile(path.join(root, "src/fewbie/modules/data-table/components/data-table.tsx"), "// customized\n");

    await runRemove({ cwd: root, names: ["data-table"], yes: true });

    assert.equal(await read(root, "src/fewbie/modules/data-table/components/data-table.tsx"), "// customized\n");
  });

  it("update --check gates drift; update keeps host edits unless forced", async () => {
    const root = await makeProject();
    after(async () => fs.rm(root, { recursive: true, force: true }));
    await runAdd({ cwd: root, names: ["data-table"], yes: true, skipInstall: true });
    const original = await read(root, "src/fewbie/modules/data-table/components/data-table.tsx");
    await fs.writeFile(path.join(root, "src/fewbie/modules/data-table/components/data-table.tsx"), "// drift\n");

    await assert.rejects(runUpdate({ cwd: root, check: true }), /modified locally/);

    await runUpdate({ cwd: root, yes: true });
    assert.equal(await read(root, "src/fewbie/modules/data-table/components/data-table.tsx"), "// drift\n");

    await runUpdate({ cwd: root, yes: true, force: true });
    assert.equal(await read(root, "src/fewbie/modules/data-table/components/data-table.tsx"), original);
  });

  it("conflicts on files that exist but belong to no declared module unless forced", async () => {
    const root = await makeProject();
    after(async () => fs.rm(root, { recursive: true, force: true }));
    await fs.mkdir(path.join(root, "src/fewbie/modules/data-table/components"), { recursive: true });
    await fs.writeFile(
      path.join(root, "src/fewbie/modules/data-table/components/data-table.tsx"),
      "// template copy\n",
    );

    await assert.rejects(runAdd({ cwd: root, names: ["data-table"], yes: true, skipInstall: true }), /already exist/);
    assert.equal(await read(root, "src/fewbie/modules/data-table/components/data-table.tsx"), "// template copy\n");

    await runAdd({ cwd: root, names: ["data-table"], yes: true, skipInstall: true, force: true });
    assert.notEqual(await read(root, "src/fewbie/modules/data-table/components/data-table.tsx"), "// template copy\n");
  });

  it("retries an interrupted install instead of conflicting on identical files (R20-28)", async () => {
    const root = await makeProject();
    after(async () => fs.rm(root, { recursive: true, force: true }));

    // Simulate a run that wrote the registry bytes, then died before
    // fewbie.json recorded the declaration.
    const module = await loadModule(await resolveRegistryRoot(), "data-table");
    for (const file of module.files) {
      const target = path.join(root, file.target);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, await readModuleFileContent(file));
    }

    await runAdd({ cwd: root, names: ["data-table"], yes: true, skipInstall: true });

    assert.deepEqual(await readModulesFile(root), ["data-table"]);
    assert.ok(await exists(root, "src/fewbie/modules/data-table/components/data-table.tsx"));
  });

  it("keeps the installed baseline when the registry moves without rewriting the file (R82-01)", async () => {
    const root = await makeProject();
    const registry = await fs.mkdtemp(path.join(os.tmpdir(), "fewbie-registry-"));
    after(async () => {
      delete process.env.FEWBIE_REGISTRY_PATH;
      await fs.rm(root, { recursive: true, force: true });
      await fs.rm(registry, { recursive: true, force: true });
    });

    // Work on a private registry copy so the move below never touches the repo.
    await fs.cp(await resolveRegistryRoot(), registry, { recursive: true });
    process.env.FEWBIE_REGISTRY_PATH = registry;

    const target = "src/fewbie/modules/data-table/components/data-table.tsx";
    await runAdd({ cwd: root, names: ["data-table"], yes: true, skipInstall: true });
    const installed = await read(root, target);
    const installedHash = (await readLockfile(root))?.modules["data-table"]?.files[target];
    assert.ok(installedHash);

    // The registry moves on; the host file still holds the installed bytes.
    const module = await loadModule(registry, "data-table");
    const source = module.files.find((file) => file.target === target)?.source;
    assert.ok(source);
    await fs.writeFile(source, `${installed}\n// registry v2\n`);

    // A plain apply must not adopt the new bytes into the baseline (it wrote
    // nothing), or the next update would misread the host as the modifier.
    await runApply({ cwd: root, yes: true, skipInstall: true });
    assert.equal((await readLockfile(root))?.modules["data-table"]?.files[target], installedHash);
    assert.equal(await read(root, target), installed);

    await assert.rejects(runUpdate({ cwd: root, check: true }), /behind the registry/);
  });

  it("removes a generated adapter whose module is no longer declared (R82-03)", async () => {
    const root = await makeProject();
    after(async () => fs.rm(root, { recursive: true, force: true }));
    await fs.writeFile(
      path.join(root, MODULES_FILE),
      JSON.stringify(
        {
          modules: ["forgot-password"],
          i18n: { library: "next-intl", messages: ["src/i18n/messages/en.json"], namespace: "modules" },
        },
        null,
        2,
      ),
    );
    await fs.mkdir(path.join(root, "src/fewbie/adapters"), { recursive: true });
    const adapter = path.join(root, "src/fewbie/adapters/forgot-password.tsx");
    await fs.writeFile(
      adapter,
      '"use client";\n\n// Generated by `fewbie modules adapters` from the forgot-password module contract.\n\n' +
        'import type { ForgotPasswordLabels } from "@/fewbie/modules/account-access/features/forgot-password";\n',
    );

    await runRemove({ cwd: root, names: ["forgot-password"], yes: true });

    assert.equal(await exists(root, "src/fewbie/adapters/forgot-password.tsx"), false);
  });

  it("keeps a multi-layer block adapter whose import targets a layer types module (ADR-069)", async () => {
    const root = await makeProject();
    after(async () => fs.rm(root, { recursive: true, force: true }));
    await fs.writeFile(
      path.join(root, MODULES_FILE),
      JSON.stringify(
        {
          modules: ["account-access"],
          i18n: { library: "next-intl", messages: ["src/i18n/messages/en.json"], namespace: "modules" },
        },
        null,
        2,
      ),
    );
    await fs.mkdir(path.join(root, "src/fewbie/adapters"), { recursive: true });
    await fs.writeFile(
      path.join(root, "src/fewbie/adapters/account-access.tsx"),
      '"use client";\n\n// Generated by `fewbie modules adapters` from the account-access module contract.\n\n' +
        'import type { LoginLabels } from "@/fewbie/modules/account-access/features/login-page/types";\n',
    );

    assert.deepEqual(await findOrphanAdapters(root), []);
  });

  it("fails adapters --check on an adapter for an undeclared module (R82-03)", async () => {
    const root = await makeProject();
    after(async () => fs.rm(root, { recursive: true, force: true }));
    await fs.writeFile(
      path.join(root, MODULES_FILE),
      JSON.stringify(
        { modules: [], i18n: { library: "next-intl", messages: ["src/i18n/messages/en.json"], namespace: "modules" } },
        null,
        2,
      ),
    );
    await fs.mkdir(path.join(root, "src/fewbie/adapters"), { recursive: true });
    await fs.writeFile(
      path.join(root, "src/fewbie/adapters/forgot-password.tsx"),
      '"use client";\n\n// Generated by `fewbie modules adapters` from the forgot-password module contract.\n\n' +
        'import type { ForgotPasswordLabels } from "@/fewbie/modules/account-access/features/forgot-password";\n',
    );

    await assert.rejects(runAdapters({ cwd: root, check: true }), /no longer declared/);
  });
});

describe("registry manifest targets", () => {
  it("rejects file targets that escape the project root", async () => {
    const registryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "fewbie-registry-"));
    after(async () => fs.rm(registryRoot, { recursive: true, force: true }));
    const itemDir = path.join(registryRoot, "escape");
    await fs.mkdir(itemDir);
    await fs.writeFile(
      path.join(itemDir, REGISTRY_MANIFEST_FILE),
      JSON.stringify({ name: "escape", type: "registry:component", title: "Escape", files: ["../../outside.ts"] }),
    );

    await assert.rejects(loadModule(registryRoot, "escape"), /unsafe file target/);
  });

  it("accepts normal project-relative targets", async () => {
    const registryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "fewbie-registry-"));
    after(async () => fs.rm(registryRoot, { recursive: true, force: true }));
    const itemDir = path.join(registryRoot, "ok");
    await fs.mkdir(itemDir);
    await fs.writeFile(
      path.join(itemDir, REGISTRY_MANIFEST_FILE),
      JSON.stringify({
        name: "ok",
        type: "registry:component",
        title: "Ok",
        files: ["src/fewbie/modules/ok/components/ok.tsx"],
      }),
    );

    const module = await loadModule(registryRoot, "ok");
    assert.deepEqual(
      module.files.map((file) => file.target),
      ["src/fewbie/modules/ok/components/ok.tsx"],
    );
  });

  async function loadManifest(manifest: unknown): Promise<void> {
    const registryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "fewbie-registry-"));
    after(async () => fs.rm(registryRoot, { recursive: true, force: true }));
    await fs.mkdir(path.join(registryRoot, "module"));
    await fs.writeFile(path.join(registryRoot, "module", REGISTRY_MANIFEST_FILE), JSON.stringify(manifest));
    await loadModule(registryRoot, "module");
  }

  it("rejects a manifest whose name does not match its directory (R87-24)", async () => {
    await assert.rejects(
      loadManifest({
        name: "other",
        type: "registry:component",
        title: "T",
        files: ["src/fewbie/modules/other/components/a.tsx"],
      }),
      /directory and manifest names must match/,
    );
  });

  it("rejects an unknown module type", async () => {
    await assert.rejects(
      loadManifest({
        name: "module",
        type: "registry:widget",
        title: "T",
        files: ["src/fewbie/modules/module/components/a.tsx"],
      }),
      /unknown type 'registry:widget'/,
    );
  });

  it("rejects files that do not land in a layer the type owns", async () => {
    await assert.rejects(
      loadManifest({
        name: "module",
        type: "registry:lib",
        title: "T",
        files: ["src/fewbie/modules/module/features/a.tsx"],
      }),
      /does not land under src\/fewbie\/modules\/module\/<lib\|components>\//,
    );
  });

  it("rejects a manifest without a files array", async () => {
    await assert.rejects(
      loadManifest({
        name: "module",
        type: "registry:component",
        title: "T",
        files: "src/fewbie/modules/module/components/a.tsx",
      }),
      /'files' must be a non-empty array/,
    );
  });
});
