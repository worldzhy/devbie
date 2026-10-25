import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { bold, cyan, green } from "colorette";

import { CliError, execCapture } from "@devbie/cli-kit";

/** Repository that ships the starter template at its root. */
export const TEMPLATE_REPOSITORY_URL = "https://github.com/worldzhy/newbie-starter.git";
/** Explicit local template root; useful for offline/development runs. */
export const TEMPLATE_PATH_ENV = "NEWBIE_TEMPLATE_PATH";

/** Node/npm package-name rule (lowercase, scoped names allowed). */
const PACKAGE_NAME_RE = /^(?:@[a-z0-9][a-z0-9-._]*\/)?[a-z0-9][a-z0-9-._]*$/;

/** Directories/files never copied out of the template. */
const COPY_IGNORE = new Set(["node_modules", "dist", "generated", ".git", ".env"]);

export interface TemplateReference {
  templatePath?: string;
  templateRef?: string;
}

export interface CreateOptions extends TemplateReference {
  name: string;
  /** Parent directory of the new project (global --cwd). */
  cwd?: string;
  gitInit?: boolean;
  dryRun?: boolean;
}

export interface ResolvedTemplate {
  root: string;
  /** Human-readable origin for reports. */
  source: string;
}

/** Resolve the basic template: explicit path -> git clone of newbie-starter. */
export async function resolveTemplate(options: TemplateReference): Promise<ResolvedTemplate> {
  const explicit = options.templatePath ?? process.env[TEMPLATE_PATH_ENV];
  if (explicit) {
    const root = path.resolve(explicit);
    await fs.access(path.join(root, "package.json"));
    return { root, source: root };
  }

  const ref = options.templateRef;
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "newbie-template-"));
  const cloneArgs = ["clone", "--quiet"];
  if (!ref) cloneArgs.push("--depth", "1");
  if (ref) cloneArgs.push("--branch", ref);
  cloneArgs.push(TEMPLATE_REPOSITORY_URL, temp);
  await execCapture("git", cloneArgs);
  return {
    root: temp,
    source: `${TEMPLATE_REPOSITORY_URL}#${ref ?? "HEAD"}`,
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
  const templateRoot = (await resolveTemplate(options)).root;

  if (options.dryRun) {
    console.info(`[dry-run] copy ${templateRoot} -> ${targetDir}`);
    console.info(`[dry-run] set package.json name to '${name}'`);
    if (options.gitInit !== false) console.info("[dry-run] git init");
    return;
  }

  await copyTemplate(templateRoot, targetDir);

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
  console.info(`Next steps:\n  cd ${name}\n  npm install\n  newbie modules\n`);
}
