#!/usr/bin/env node
import { red } from "colorette";

import { buildProgram, VERSION } from "./program";
import { registerModuleCommands } from "./lib/module-cli";

export { VERSION };

/**
 * Inspect argv for the global `--cwd`/`-C` flag before commander parses the
 * full option set. The module-CLI loader needs the project root to discover
 * manifests, and it runs before `program.parseAsync`.
 */
function findCwdInArgv(): string {
  const argv = process.argv;
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--cwd" || arg === "-C") {
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) return next;
    } else if (arg.startsWith("--cwd=")) {
      return arg.slice(6);
    } else if (arg.startsWith("-C") && arg.length > 2) {
      return arg.slice(2);
    } else if (!arg.startsWith("-")) {
      // First positional is the subcommand name; subsequent --cwd values
      // would belong to that subcommand, so we stop scanning here.
      break;
    }
  }
  return process.cwd();
}

const program = buildProgram();

void (async () => {
  try {
    await registerModuleCommands(program, {
      cwd: findCwdInArgv(),
      dryRun: false,
      skipPrismaGenerate: false,
    });
  } catch (error) {
    console.error(red(`\nFailed to load module CLIs: ${(error as Error).message}\n`));
    if (process.env.NEWBIE_DEBUG && (error as Error).stack) {
      console.error((error as Error).stack);
    }
    process.exit(1);
  }
  await program.parseAsync(process.argv);
})();
