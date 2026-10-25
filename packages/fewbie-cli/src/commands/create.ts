import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { bold, cyan, green } from "colorette";

import { CliError, execCapture } from "@devbie/cli-kit";
import { MODULES_FILE, modulesFileContent } from "../lib/modules-file";

/** Repository that ships the starter template at its root. */
export const TEMPLATE_REPOSITORY_URL = "https://github.com/worldzhy/fewbie-starter.git";
/** Explicit local template root; useful for offline/development runs. */
export const TEMPLATE_PATH_ENV = "FEWBIE_TEMPLATE_PATH";

/** Node/npm package-name rule (lowercase, scoped names allowed). */
const PACKAGE_NAME_RE = /^(?:@[a-z0-9][a-z0-9-._]*\/)?[a-z0-9][a-z0-9-._]*$/;

/** Directories/files never copied out of the template. */
const COPY_IGNORE = new Set(["node_modules", ".next", "dist", ".git", ".env"]);

export interface CreateOptions {
  name: string;
  templatePath?: string;
  templateRef?: string;
  /** Parent directory of the new project (global --cwd). */
  cwd?: string;
  gitInit?: boolean;
}

export interface ResolvedTemplate {
  root: string;
  /** Human-readable origin for reports. */
  source: string;
  /** Removes the temporary clone; absent for an explicit local template path. */
  cleanup?: () => Promise<void>;
}

/** Resolve the basic template: explicit path -> git clone of fewbie-starter. */
export async function resolveTemplate(
  options: Pick<CreateOptions, "templatePath" | "templateRef">,
): Promise<ResolvedTemplate> {
  const explicit = options.templatePath ?? process.env[TEMPLATE_PATH_ENV];
  if (explicit) {
    const root = path.resolve(explicit);
    await fs.access(path.join(root, "package.json"));
    return { root, source: root };
  }

  const ref = options.templateRef;
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "fewbie-template-"));
  const cloneArgs = ["clone", "--quiet"];
  if (!ref) cloneArgs.push("--depth", "1");
  if (ref) cloneArgs.push("--branch", ref);
  cloneArgs.push(TEMPLATE_REPOSITORY_URL, temp);
  await execCapture("git", cloneArgs);
  return {
    root: temp,
    source: `${TEMPLATE_REPOSITORY_URL}#${ref ?? "HEAD"}`,
    cleanup: () => fs.rm(temp, { recursive: true, force: true }),
  };
}

async function copyTemplate(from: string, to: string): Promise<void> {
  await fs.cp(from, to, {
    recursive: true,
    filter: (src) => !COPY_IGNORE.has(path.basename(src)) || src === from,
  });
}

export async function runCreate(options: CreateOptions): Promise<void> {
  const { name } = options;
  if (!PACKAGE_NAME_RE.test(name) || name.length > 214) {
    throw new CliError(
      `Invalid project name '${name}'. Use a lowercase npm package name, e.g. my-project or @scope/my-project.`,
    );
  }

  const targetDir = path.resolve(options.cwd ?? process.cwd(), name);
  const existing = await fs.readdir(targetDir).catch(() => null);
  if (existing && existing.length > 0) {
    throw new CliError(`Target directory ${targetDir} is not empty.`);
  }

  console.info(cyan(`Creating project '${name}' from the basic template...`));
  const template = await resolveTemplate(options);
  try {
    await copyTemplate(template.root, targetDir);
  } finally {
    await template.cleanup?.();
  }

  // The declaration file is the single entry point for every later module
  // operation (ADR-024 clause 10); a fresh project declares nothing.
  await fs.writeFile(path.join(targetDir, MODULES_FILE), modulesFileContent([]));

  const packageJsonPath = path.join(targetDir, "package.json");
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8")) as {
    name?: string;
    [key: string]: unknown;
  };
  packageJson.name = name;
  await fs.writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

  if (options.gitInit !== false) {
    await execCapture("git", ["init", "--quiet"], { cwd: targetDir });
  }

  console.info(green(bold("\n✓ Project created.\n")));
  console.info(`Next steps:\n  cd ${name}\n  npm install\n  npm run dev\n`);
}
