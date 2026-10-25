import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { bold, cyan, green, yellow } from "colorette";

import { CliError, execLive } from "@devbie/cli-kit";
import {
  ADAPTER_CONTENT,
  ADAPTER_PROJECT_PATH,
  API_CLIENT_PROJECT_PATH,
  CONFIG_PROJECT_PATH,
  DEFAULT_GENERATED_NAME,
  DEFAULT_OUTPUT_DIR,
  GENERATOR_BIN_RELATIVE,
  GENERATOR_PACKAGE_NAME,
  GENERATOR_PACKAGE_SPEC,
  PUBLIC_BASE_URL_ENV,
  renderApitsConfig,
} from "./apits-templates";

export interface ApitsOptions {
  /** OpenAPI URL or local file; only used to scaffold the first config. */
  input?: string;
  /** Config source name filter, forwarded as `apits gen -n <name>`. */
  name?: string;
  /** Watch the local document and regenerate on change. */
  watch?: boolean;
  /** Do not run `npm install -D` for the generator. */
  skipInstall?: boolean;
  /** Project root (global --cwd). */
  cwd?: string;
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
}

async function exists(target: string): Promise<boolean> {
  return fs
    .access(target)
    .then(() => true)
    .catch(() => false);
}

async function readPackageJson(projectRoot: string): Promise<PackageJson> {
  return JSON.parse(await fs.readFile(path.join(projectRoot, "package.json"), "utf8")) as PackageJson;
}

/** Run the project-local generator binary through the current Node runtime. */
function runGenerator(projectRoot: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: projectRoot,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`apits exited with code ${code}`));
    });
  });
}

export async function runApits(options: ApitsOptions): Promise<void> {
  const projectRoot = path.resolve(options.cwd ?? process.cwd());

  if (!(await exists(path.join(projectRoot, "package.json")))) {
    throw new CliError(`No package.json found in ${projectRoot}. Run 'fewbie apits' inside a fewbie project.`);
  }

  // The generated adapter imports the fewbie api client.
  if (!(await exists(path.join(projectRoot, API_CLIENT_PROJECT_PATH)))) {
    throw new CliError(`'fewbie apits' requires the api-client item. Run 'fewbie modules add api-client' first.`);
  }

  // First run: scaffold apits.config.ts from the positional input. The
  // config file stays the single source of truth afterwards — note that the
  // upstream generator ignores the config (and its clientImportTemplate)
  // when a positional input is passed, so we refuse that combination.
  const configPath = path.join(projectRoot, CONFIG_PROJECT_PATH);
  const hasConfig = await exists(configPath);
  if (!hasConfig) {
    if (!options.input) {
      throw new CliError(
        `No OpenAPI input and no ${CONFIG_PROJECT_PATH} found.\n` +
          `  First run: fewbie apits <openapi-url-or-json-file>\n` +
          `  Afterwards: edit ${CONFIG_PROJECT_PATH} to manage sources.`,
      );
    }
  } else if (options.input) {
    throw new CliError(
      `${CONFIG_PROJECT_PATH} already exists. Update its \`input\` directly (or pass -n <name> to select a source) instead of passing a positional input.`,
    );
  }

  // Scaffold the project-owned adapter once; never overwrite user edits.
  const adapterPath = path.join(projectRoot, ADAPTER_PROJECT_PATH);
  if (!(await exists(adapterPath))) {
    await fs.mkdir(path.dirname(adapterPath), { recursive: true });
    await fs.writeFile(adapterPath, ADAPTER_CONTENT);
    console.info(`  ${green("added")} ${ADAPTER_PROJECT_PATH}`);
  }

  if (!hasConfig) {
    await fs.writeFile(configPath, renderApitsConfig(options.input as string));
    console.info(`  ${green("added")} ${CONFIG_PROJECT_PATH}`);
  }

  // Ensure the generator is available as a project dev dependency.
  const pkg = await readPackageJson(projectRoot);
  const declared = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]);
  if (!declared.has(GENERATOR_PACKAGE_NAME)) {
    if (options.skipInstall) {
      throw new CliError(`Generator not installed. Run: npm install -D ${GENERATOR_PACKAGE_SPEC}`);
    }
    console.info(`\nInstalling dev dependency: ${GENERATOR_PACKAGE_SPEC}`);
    await execLive("npm", ["install", "-D", GENERATOR_PACKAGE_SPEC], { cwd: projectRoot });
  }

  const binPath = path.join(projectRoot, GENERATOR_BIN_RELATIVE);
  if (!(await exists(binPath))) {
    throw new CliError(`Generator binary not found at ${GENERATOR_BIN_RELATIVE}. Run 'npm install' and retry.`);
  }

  const genArgs = [binPath, "gen"];
  if (options.name) genArgs.push("-n", options.name);
  if (options.watch) genArgs.push("--watch");

  // The upstream generator exits 0 even when generation fails, so verify
  // success via refreshed mtimes (skipped in watch mode, where the generator
  // keeps running). With -n only the named output counts; otherwise any
  // refreshed .ts file in the default output dir counts, so additional
  // sources scaffolded into that dir cannot fail silently.
  const outputDir = path.join(projectRoot, DEFAULT_OUTPUT_DIR);
  const namedOutput = path.join(outputDir, `${options.name ?? DEFAULT_GENERATED_NAME}.ts`);
  const beforeStat = await fs.stat(namedOutput).catch(() => null);
  const beforeDirMtimes = new Map<string, number>();
  if (!options.name) {
    const entries = await fs.readdir(outputDir).catch(() => [] as string[]);
    for (const entry of entries.filter((name) => name.endsWith(".ts"))) {
      const stat = await fs.stat(path.join(outputDir, entry)).catch(() => null);
      if (stat) beforeDirMtimes.set(entry, stat.mtimeMs);
    }
  }

  console.info(cyan(`\nGenerating API code (${DEFAULT_OUTPUT_DIR})...`));
  await runGenerator(projectRoot, genArgs);

  if (!options.watch) {
    let refreshed: boolean;
    if (options.name) {
      const afterStat = await fs.stat(namedOutput).catch(() => null);
      refreshed = afterStat !== null && (beforeStat === null || afterStat.mtimeMs > beforeStat.mtimeMs);
    } else {
      const entries = await fs.readdir(outputDir).catch(() => [] as string[]);
      refreshed = false;
      for (const entry of entries.filter((name) => name.endsWith(".ts"))) {
        const stat = await fs.stat(path.join(outputDir, entry)).catch(() => null);
        if (stat && stat.mtimeMs > (beforeDirMtimes.get(entry) ?? 0)) {
          refreshed = true;
          break;
        }
      }
    }
    if (!refreshed) {
      throw new CliError(
        `Code generation failed: no file in ${DEFAULT_OUTPUT_DIR} was produced or updated. See the generator output above.`,
      );
    }
  }

  console.info(`\n${bold("Next steps")}:`);
  console.info(`  - Set ${yellow(PUBLIC_BASE_URL_ENV)} in .env.local (generated requests read it at runtime).`);
  console.info(
    `  - Import generated functions from ${DEFAULT_OUTPUT_DIR}/api.ts (re-run after schema changes, or use --watch).`,
  );
}
