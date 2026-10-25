import { register } from "tsx/cjs/api";
import fs from "fs-extra";
import path from "path";
import prompt from "prompts";
import yargs from "yargs";
import { Config } from "./types";
import { dedent } from "./utils/dedent";
import { Generator } from "./generator";
import chalk from "chalk";
import * as logger from "./utils/logger";
import { formatContent } from "./utils/format";
import { spinner } from "./utils/spinner";
import { runSequentially, defineConfig } from "./helpers";

// Register the tsx loader so apits.config.ts / apits.config.local.ts can be
// required at runtime. tsx transpiles via esbuild (no type-checking) and
// reads tsconfig.json automatically, so no compilerOptions are needed here.
register();

/** Flags accepted by the `gen` command. */
interface GenFlags {
  /** OpenAPI document URL or local file path. */
  input?: string;
  /** Output directory. */
  output?: string;
  /** File base name (CLI mode) or name filter (config-file mode). */
  name?: string;
  /** Runtime baseURL (string; `[code]:` prefix supported). */
  baseUrl?: string;
  /** Whether to scaffold the default request.ts client. */
  client?: boolean;
  /** Watch local input files and regenerate on change. */
  watch?: boolean;
}

// Config file candidates in priority order; the first match wins.
const CONFIG_FILE_CANDIDATES = [
  "apits.config.local.ts",
  "apits.config.ts",
  "apits.config.local.json",
  "apits.config.json",
];

interface DiscoveredConfig {
  filePath: string;
  kind: "ts" | "json" | "package";
}

/** Raised when neither a CLI input nor a config file can be found. */
class NoInputError extends Error {}

function isHttpInput(input: string): boolean {
  return /^https?:\/\//i.test(input);
}

/** Normalize a single config or an array into a config array. */
function normalizeConfig(raw: Config | Config[]): Config[] {
  return defineConfig(Array.isArray(raw) ? raw : [raw]);
}

/**
 * Discover the optional config file. Supports TS/JSON config files and the
 * `apits` field inside package.json. Returns undefined when nothing exists.
 */
async function discoverConfigFile(cwd: string = process.cwd()): Promise<DiscoveredConfig | undefined> {
  for (const fileName of CONFIG_FILE_CANDIDATES) {
    const filePath = path.join(cwd, fileName);
    if (await fs.pathExists(filePath)) {
      return { filePath, kind: fileName.endsWith(".json") ? "json" : "ts" };
    }
  }

  const packageJsonPath = path.join(cwd, "package.json");
  if (await fs.pathExists(packageJsonPath)) {
    try {
      const pkg = JSON.parse(await fs.readFile(packageJsonPath, "utf-8"));
      if (pkg.apits) {
        return { filePath: packageJsonPath, kind: "package" };
      }
    } catch {
      // A malformed package.json should not crash config discovery.
    }
  }

  return undefined;
}

/** Load configs from a discovered file. */
function loadConfigFile(discovered: DiscoveredConfig): Config[] {
  const { filePath, kind } = discovered;

  if (kind === "ts") {
    // tsx is registered at module load time.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- user config files are loaded dynamically at runtime
    const mod = require(filePath);
    return normalizeConfig(mod.default ?? mod);
  }

  if (kind === "json") {
    return normalizeConfig(JSON.parse(fs.readFileSync(filePath, "utf-8")));
  }

  const pkg = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return normalizeConfig(pkg.apits);
}

/** Build a single ad-hoc config from CLI flags (no config file needed). */
function buildCliConfig(flags: GenFlags): Config {
  const config: Config = {
    input: flags.input!,
    output: flags.output || "src/api",
  };
  if (flags.name) {
    config.name = flags.name;
  }
  if (flags.baseUrl !== undefined) {
    config.baseURL = flags.baseUrl;
  }
  // CLI mode has no custom import template, so the scaffolded client is on
  // unless `--no-client` was passed. Defaults to true when unspecified.
  config.client = flags.client ?? true;
  return defineConfig(config)[0];
}

/**
 * Ensure every config has a name. Explicit names win; missing names are
 * derived from the input. A duplicated derived name gets an index suffix
 * so generated files never overwrite each other.
 */
function assignUniqueNames(configs: Config[]) {
  const counts = new Map<string, number>();
  configs.forEach((item) => {
    const base = item.name || Generator.deriveName(item.input);
    const seen = counts.get(base) ?? 0;
    counts.set(base, seen + 1);
    if (!item.name) {
      item.name = seen === 0 ? base : `${base}_${seen + 1}`;
    }
  });
}

/**
 * Resolve the effective config list.
 * Precedence: CLI flags > config file > built-in defaults.
 */
async function resolveConfigs(
  flags: GenFlags,
): Promise<{ configs: Config[]; source: "cli" | "file"; configFile?: string }> {
  // 1. Positional input — the zero-config path.
  if (flags.input) {
    const configs = [buildCliConfig(flags)];
    assignUniqueNames(configs);
    return { configs, source: "cli" };
  }

  // 2. Optional config file.
  const discovered = await discoverConfigFile();
  if (discovered) {
    let configs = loadConfigFile(discovered);

    // In config-file mode `--name` filters which source(s) to run.
    if (flags.name) {
      configs = configs.filter((item) => item.name === flags.name);
      if (configs.length === 0) {
        throw new Error(`No config found with name: ${flags.name}`);
      }
    }

    // CLI flags override config-file values. `--client` forces true,
    // `--no-client` forces false; omitting the flag keeps the config value.
    configs = configs.map((item) => ({
      ...item,
      ...(flags.output ? { output: flags.output } : {}),
      ...(flags.baseUrl !== undefined ? { baseURL: flags.baseUrl } : {}),
      ...(flags.client !== undefined ? { client: flags.client } : {}),
    }));

    assignUniqueNames(configs);
    return { configs, source: "file", configFile: discovered.filePath };
  }

  // 3. Nothing to generate from.
  throw new NoInputError();
}

/** Print an actionable hint when no input is available. */
function printNoInputHint() {
  logger.error(
    [
      "No OpenAPI input found. Use one of:",
      "",
      "  1. Pass document URL or path directly (no config file needed):",
      "     apits gen http://localhost:3041/api-json -o src/api",
      "     apits gen ./openapi.yaml",
      "",
      "  2. Generate a config file (multi-source / function-based customization):",
      "     apits init",
    ].join("\n"),
  );
}

/** Scaffold an optional apits.config.ts template. */
export async function genConfig(prefill?: { input?: string }) {
  const cwd = process.cwd();
  const configTSFile = path.join(cwd, "apits.config.ts");

  if (await fs.pathExists(configTSFile)) {
    logger.tips(`Config file already exists: ${configTSFile}`);
    const answers = await prompt({
      message: "Overwrite existing config file?",
      name: "override",
      type: "confirm",
    });
    if (!answers.override) return;
  }

  const configAnswers = await prompt([
    {
      message: "API document URL or local JSON/YAML file path",
      name: "input",
      type: "text",
      initial: prefill?.input || "",
    },
    {
      message: "Generated file name (optional, derived from input if blank)",
      name: "name",
      type: "text",
      initial: "",
    },
  ]);

  // User cancelled the questionnaire (Ctrl+C / empty input).
  if (!configAnswers || !configAnswers.input) {
    return logger.tips("Cancelled, config file not written");
  }

  const nameLine = configAnswers?.name ? `  name: '${configAnswers.name}',\n` : "";

  await fs.outputFile(
    configTSFile,
    await formatContent(dedent`
      import { defineConfig } from '@devbie/apits'

      export default defineConfig([{
        input: '${configAnswers?.input || ""}',
        output: 'src/api',
      ${nameLine}  baseURL: '[code]:process.env.BASE_API_URL',
        clientImportTemplate: () => "${`import request from './request'`}",
        // Keep the scaffolded request.ts because the import above points at it.
        client: true,
      }])
    `),
  );
  logger.success("Config file written");
}

async function startGenerate(config: Config, index = 0) {
  const { output: outputDir } = config;

  const label = chalk.green(`${config.input} elapsed`);
  console.time(label);
  spinner.start();
  const generator = new Generator(config);
  const output = await generator.generate();
  await generator.write(output);
  spinner.clear();
  logger.log(chalk.yellowBright(`\n${index + 1}.-------------------------`));
  logger.success(`Code generated, output: ${outputDir}`);
  console.timeEnd(label);
  logger.log(chalk.yellowBright("---------------------------\n"));
  return true;
}

/** Run generation once for every resolved config. */
async function runAll(configs: Config[]) {
  await runSequentially(
    configs.map((configItem, index) => {
      return async () => {
        await startGenerate(configItem, index);
      };
    }),
  );
}

/**
 * Watch local input files and regenerate the affected config on change.
 * Remote inputs are not watchable; a hint is printed instead.
 */
function watchConfigs(configs: Config[]) {
  const localConfigs = configs.filter((item) => !isHttpInput(item.input));

  if (localConfigs.length === 0) {
    logger.tips("--watch only supports local files; remote URLs are ignored");
    return;
  }

  // Simple debounce so editors that save twice only trigger one rebuild.
  const timers = new Map<string, NodeJS.Timeout>();

  localConfigs.forEach((configItem) => {
    const filePath = path.resolve(configItem.input);
    fs.watch(filePath, async (eventType) => {
      // Handle both 'change' and 'rename' — macOS atomic save (e.g. vim's
      // write-and-rename) triggers 'rename', and the watcher may need to be
      // re-established after the inode changes. Re-create the watcher on
      // rename to avoid silently losing subsequent changes.
      if (eventType === "rename") {
        try {
          fs.watch(filePath, async (ev) => {
            scheduleRebuild(filePath, ev);
          });
        } catch {
          // File may not exist yet during the rename window; the next save
          // will re-establish the watcher.
        }
      }
      scheduleRebuild(filePath, eventType);
    });
  });

  function scheduleRebuild(filePath: string, eventType: string) {
    if (eventType !== "change" && eventType !== "rename") return;
    const oldTimer = timers.get(filePath);
    if (oldTimer) clearTimeout(oldTimer);
    timers.set(
      filePath,
      setTimeout(async () => {
        const configItem = localConfigs.find((c) => path.resolve(c.input) === filePath);
        if (!configItem) return;
        const idx = localConfigs.indexOf(configItem);
        logger.tips(`Detected change, regenerating: ${filePath}`);
        try {
          await startGenerate(configItem, idx);
        } catch (err) {
          logger.error(`Regeneration failed: ${(err as Error).message || err}`);
        }
      }, 200),
    );
  }

  logger.tips(`Watching ${localConfigs.length} local document(s), Ctrl+C to exit`);
}

export async function start(flags: GenFlags = {}) {
  const timeLabel = chalk.green("Total elapsed");
  console.time(timeLabel);

  let resolved: { configs: Config[]; source: "cli" | "file"; configFile?: string };
  try {
    resolved = await resolveConfigs(flags);
  } catch (err) {
    if (err instanceof NoInputError) {
      printNoInputHint();
      return;
    }
    spinner.stop();
    logger.error(`Config resolution failed: ${(err as Error).message || err}`);
    return;
  }

  logger.tips(
    resolved.source === "cli" ? `Using CLI input: ${flags.input}` : `Found config file: ${resolved.configFile}`,
  );

  try {
    spinner.start("Generating code...\n");
    await runAll(resolved.configs);
    spinner.stop();
  } catch (err) {
    spinner.stop();
    logger.error("Execution failed:");
    logger.error(`Error: ${(err as Error).message || err}`);
    if ((err as Error).stack) {
      logger.error(`Stack: ${(err as Error).stack}`);
    }
    if ((err as any).cause) {
      logger.error(`Cause: ${(err as any).cause}`);
    }
    return logger.error("Code generation failed, see error details above");
  }

  console.timeEnd(timeLabel);

  if (flags.watch) {
    watchConfigs(resolved.configs);
  }

  return null;
}

/** Map parsed yargs argv into GenFlags. */
function toFlags(argv: any): GenFlags {
  return {
    input: typeof argv.input === "string" && argv.input ? argv.input : undefined,
    output: typeof argv.output === "string" ? argv.output : undefined,
    name: typeof argv.name === "string" ? argv.name : undefined,
    baseUrl: typeof argv.baseUrl === "string" ? argv.baseUrl : undefined,
    client: typeof argv.client === "boolean" ? argv.client : undefined,
    watch: Boolean(argv.watch),
  };
}

export default class CLI {
  run(args: string[]) {
    const cli = this.init();

    if (args.length === 0) {
      cli.showHelp();
    }
    return cli.parse(args);
  }

  private genBuilder(y: yargs.Argv) {
    return y
      .positional("input", {
        type: "string",
        describe: "OpenAPI document URL or local JSON/YAML file path",
      })
      .option("output", {
        alias: "o",
        type: "string",
        describe: "Output directory (default: src/api)",
      })
      .option("name", {
        alias: "n",
        type: "string",
        describe: "Generated file name; filters by name in config-file mode",
      })
      .option("base-url", {
        type: "string",
        describe: "Runtime baseURL (supports [code]: prefix for code emission)",
      })
      .option("client", {
        type: "boolean",
        describe: "Generate default request.ts (use --no-client to disable, --client to force-enable)",
      })
      .option("watch", {
        alias: "w",
        type: "boolean",
        default: false,
        describe: "Watch local document for changes and auto-regenerate",
      });
  }

  init() {
    return (
      yargs
        .scriptName("apits")
        .usage("Usage: $0 [gen] [input] [options]")
        // `init` must be declared before the default command so it is not
        // captured as the `input` positional.
        .command<any>(
          "init [input]",
          "Scaffold an optional apits.config.ts file",
          (y) => {
            y.positional("input", {
              type: "string",
              describe: "Prefilled document URL or local file path",
            });
          },
          async (argv: any) => {
            await genConfig({ input: typeof argv.input === "string" ? argv.input : undefined });
          },
        )
        // `gen` is also the default command: `apits <input>` works.
        // The default-command alias is hidden from help to keep it clean.
        .command<any>(
          "gen [input]",
          "Generate TypeScript types and request functions from an OpenAPI document",
          (y: any) => this.genBuilder(y),
          (argv: any) => {
            start(toFlags(argv));
          },
        )
        .command<any>(
          "$0 [input]",
          false,
          (y: any) => this.genBuilder(y),
          (argv: any) => {
            start(toFlags(argv));
          },
        )
        .help()
    );
  }
}
