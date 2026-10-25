import fs from "node:fs/promises";
import path from "node:path";

import { yellow } from "colorette";
import { Command } from "commander";
import { moduleKeys } from "@devbie/modules-state";

import { installedModuleDir } from "./module-install";
import { readInstalledManifest } from "./module-install";
import { CliError } from "@devbie/cli-kit";
import { readModulesState, stateExists } from "./modules-state";
import { ModuleManifest } from "../core/module-manifest";
import { GlobalOptions } from "../commands/shared";

/**
 * Path of the module CLI entry inside the installed module directory. The
 * entry is a TypeScript file so iteration on a module CLI does not require a
 * rebuild of the consuming project.
 */
const CLI_ENTRY_RELATIVE = path.posix.join("cli", "index.ts");

/**
 * Hook a module exposes to attach its own subcommands to a namespace parent
 * (e.g. `newbie secrets pull` -> parent `secrets`, subcommand `pull`).
 *
 * The parent command is already created with the namespace declared in the
 * manifest's `cli` field; implementations only register descendants.
 */
export type ModuleCliRegister = (parent: Command, options: GlobalOptions) => void | Promise<void>;

interface ModuleCliEntry {
  register: ModuleCliRegister;
}

interface TsxCjsApi {
  register(): void;
}

let tsxRegistered = false;

/**
 * Register tsx's CommonJS hooks globally (idempotent) so the module CLI entry
 * — a `.ts` file in the host project — can be loaded with a plain `require`.
 *
 * We deliberately use the CJS API instead of tsx's ESM `tsImport`: this file
 * compiles to CommonJS, and entries are TS files treated as CommonJS by tsx,
 * so `tsImport` ends up driving an ESM resolution chain in which the entry's
 * own relative imports (e.g. "./deploy-rotation") fail with
 * ERR_MODULE_NOT_FOUND. The CJS hooks resolve extensionless sibling imports
 * correctly from the entry's directory.
 */
function ensureTsxRegistered(): void {
  if (tsxRegistered) return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const api = require("tsx/cjs/api") as TsxCjsApi;
  api.register();
  tsxRegistered = true;
}

/** Load the module CLI entry (a TypeScript file) via the registered hooks. */
function loadEntryModule(entryPath: string): Record<string, unknown> {
  ensureTsxRegistered();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(entryPath) as Record<string, unknown>;
}

/**
 * Load and validate a module's CLI entry. Returns null when the module does
 * not declare a CLI namespace; throws a CliError when the entry is missing or
 * malformed so the user can fix the manifest instead of debugging silence.
 */
export async function loadModuleCliEntry(
  cwd: string,
  key: string,
  manifest: ModuleManifest,
): Promise<{ namespace: string; entry: ModuleCliEntry } | null> {
  if (!manifest.cli) return null;

  const entryPath = path.join(installedModuleDir(cwd, key), CLI_ENTRY_RELATIVE);
  try {
    await fs.access(entryPath);
  } catch {
    throw new CliError(
      `Module '${key}' declares cli='${manifest.cli}' but entry 'src/modules/${key}/${CLI_ENTRY_RELATIVE}' is missing.`,
    );
  }

  let mod: Record<string, unknown>;
  try {
    mod = loadEntryModule(entryPath);
  } catch (error) {
    throw new CliError(`Failed to load cli entry for module '${key}' (${manifest.cli}): ${(error as Error).message}`);
  }

  if (typeof mod.register !== "function") {
    throw new CliError(`Module '${key}' cli entry must export a 'register(parent, options)' function.`);
  }
  return { namespace: manifest.cli, entry: { register: mod.register as ModuleCliRegister } };
}

/**
 * Walk the enabled module list in `modules.json`, load any manifest that
 * declares a `cli` namespace, and let each entry register its subcommands
 * under that namespace on the root program.
 *
 * Called before `program.parseAsync` so the dynamically-attached subcommands
 * are visible to argv parsing.
 *
 * A broken module CLI (missing entry, malformed exports, throwing `register`)
 * degrades to a warning instead of failing startup: diagnostic commands
 * (`doctor`, `status`) must stay runnable, and invoking the broken namespace
 * surfaces commander's "unknown command" rather than a half-registered tree.
 */
export async function registerModuleCommands(program: Command, options: GlobalOptions): Promise<void> {
  if (!(await stateExists(options.cwd))) return;
  const state = await readModulesState(options.cwd);
  for (const key of moduleKeys(state)) {
    // Manifest reading stays inside the per-module guard: an installed copy
    // can temporarily lag behind this CLI (e.g. an enum value renamed in a
    // newer CLI before `newbie update` copies the new manifests). Failing
    // startup here would deadlock every command, including update itself.
    let manifest: ModuleManifest | null = null;
    try {
      manifest = await readInstalledManifest(options.cwd, key);
      if (!manifest) continue;
      const loaded = await loadModuleCliEntry(options.cwd, key, manifest);
      if (!loaded) continue;
      // Register against a detached parent first and attach to the program
      // only after success, so a throwing register cannot leave a
      // half-registered namespace behind.
      const detached = new Command(loaded.namespace);
      await loaded.entry.register(detached, options);
      program.addCommand(detached);
    } catch (error) {
      console.error(
        yellow(
          `[warn] Skipped CLI namespace '${manifest?.cli ?? key}' of module '${key}': ${(error as Error).message}`,
        ),
      );
      if (process.env.NEWBIE_DEBUG && (error as Error).stack) {
        console.error((error as Error).stack);
      }
    }
  }
}
