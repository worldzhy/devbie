import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { promisify } from "node:util";

import { runAdd } from "../src/commands/modules/add";
import { MODULES_FILE, readModulesFile, readRegistryDeclaration } from "../src/lib/modules-file";
import { resolveRegistryRoot } from "../src/registry/source";

const execFileAsync = promisify(execFile);

/** Commit with an explicit identity so CI machines without git config pass. */
async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync(
    "git",
    ["-c", "user.email=test@example.com", "-c", "user.name=Fewbie Test", "-c", "commit.gpgsign=false", ...args],
    { cwd },
  );
}

/** A one-item registry repository, usable both as a git URL and a local root. */
async function makeRegistryRepo(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fewbie-registry-repo-"));
  await fs.mkdir(path.join(root, "hello", "src", "components"), { recursive: true });
  await fs.writeFile(
    path.join(root, "hello", "item.json"),
    JSON.stringify(
      { name: "hello", type: "registry:component", title: "Hello", files: ["src/components/hello.tsx"] },
      null,
      2,
    ),
  );
  await fs.writeFile(
    path.join(root, "hello", "src", "components", "hello.tsx"),
    "export function Hello() {\n  return null;\n}\n",
  );
  await git(root, ["init", "-q", "-b", "main"]);
  await git(root, ["add", "--", "."]);
  await git(root, ["commit", "-q", "-m", "add hello"]);
  return root;
}

async function makeProject(declaration?: { url: string; ref?: string }): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fewbie-project-"));
  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: "fixture", private: true, dependencies: {} }, null, 2),
  );
  const document = declaration ? { modules: [], registry: declaration } : { modules: [] };
  await fs.writeFile(path.join(root, MODULES_FILE), `${JSON.stringify(document, null, 2)}\n`);
  return root;
}

function fileUrl(target: string): string {
  return `file://${target}`;
}

describe("external registry source", () => {
  it("clones the declared registry, installs its item and preserves the registry key", async () => {
    const repo = await makeRegistryRepo();
    after(async () => fs.rm(repo, { recursive: true, force: true }));
    const cache = await fs.mkdtemp(path.join(os.tmpdir(), "fewbie-cache-"));
    after(async () => fs.rm(cache, { recursive: true, force: true }));
    const project = await makeProject({ url: fileUrl(repo), ref: "main" });
    after(async () => fs.rm(project, { recursive: true, force: true }));

    const previousCache = process.env.FEWBIE_REGISTRY_CACHE_DIR;
    process.env.FEWBIE_REGISTRY_CACHE_DIR = cache;
    try {
      await runAdd({ cwd: project, names: ["hello"], yes: true, skipInstall: true });
    } finally {
      if (previousCache === undefined) delete process.env.FEWBIE_REGISTRY_CACHE_DIR;
      else process.env.FEWBIE_REGISTRY_CACHE_DIR = previousCache;
    }

    assert.deepEqual(await readModulesFile(project), ["hello"]);
    assert.equal(
      await fs.readFile(path.join(project, "src/components/hello.tsx"), "utf8"),
      "export function Hello() {\n  return null;\n}\n",
    );
    const document = JSON.parse(await fs.readFile(path.join(project, MODULES_FILE), "utf8")) as {
      registry?: unknown;
    };
    assert.deepEqual(document.registry, { url: fileUrl(repo), ref: "main" });
  });

  it("lets FEWBIE_REGISTRY_PATH override the declared registry", async () => {
    const local = await makeRegistryRepo();
    after(async () => fs.rm(local, { recursive: true, force: true }));
    const project = await makeProject({ url: "file:///nonexistent/registry" });
    after(async () => fs.rm(project, { recursive: true, force: true }));

    const previousPath = process.env.FEWBIE_REGISTRY_PATH;
    process.env.FEWBIE_REGISTRY_PATH = local;
    try {
      assert.equal(await resolveRegistryRoot(project), local);
    } finally {
      if (previousPath === undefined) delete process.env.FEWBIE_REGISTRY_PATH;
      else process.env.FEWBIE_REGISTRY_PATH = previousPath;
    }
  });

  it("rejects a ref that could be read as a git option", async () => {
    const project = await makeProject({ url: "file:///nonexistent/registry", ref: "--upload-pack=evil" });
    after(async () => fs.rm(project, { recursive: true, force: true }));

    await assert.rejects(resolveRegistryRoot(project), /Invalid registry ref/);
  });

  it("rejects a registry declaration without a url", async () => {
    const project = await makeProject();
    after(async () => fs.rm(project, { recursive: true, force: true }));
    await fs.writeFile(
      path.join(project, MODULES_FILE),
      `${JSON.stringify({ modules: [], registry: { ref: "main" } })}\n`,
    );

    await assert.rejects(readRegistryDeclaration(project), /registry\.url/);
  });
});
