import type { Command } from "commander";

import { run } from "@devbie/newbie-cli/lib";
import type { GlobalOptions } from "@devbie/newbie-cli/lib";

import { runShow } from "./commands/show";
import { runVerify } from "./commands/verify";
import type { HubCommandOptions } from "./options";

/**
 * Register the `module-hub` subcommands on the parent namespace created by the
 * framework CLI loader (declared by `"cli": "module-hub"` in the module
 * manifest).
 *
 * Both commands authenticate with the installation report token that the
 * deployment already carries; the CLI stores no credentials and requires no
 * host user session.
 */
export function register(parent: Command, options: GlobalOptions): void {
  function collectOptions(command: Command): HubCommandOptions {
    const globals = command.optsWithGlobals();
    const flags = command.opts();
    return {
      cwd: (globals.cwd as string) ?? options.cwd,
      dryRun: Boolean(globals.dryRun),
      skipPrismaGenerate: Boolean(globals.skipPrismaGenerate),
      expectLabel: flags.expectLabel as string | undefined,
      modulesUrl: flags.modulesUrl as string | undefined,
      token: flags.token as string | undefined,
    };
  }

  parent
    .command("show")
    .description("Print this installation's runtime facts and the module snapshot the hub recorded")
    .option("--expect-label <label>", "abort when the token resolves to a different installation label")
    .option("--modules-url <url>", "override the derived caller-scoped modules URL")
    .option("--token <token>", "override the installation report token")
    .action(function (this: Command) {
      return run(() => runShow(collectOptions(this)));
    });

  parent
    .command("verify")
    .description("Fail when the hub's snapshot of this installation differs from the local modules.json")
    .option("--expect-label <label>", "abort when the token resolves to a different installation label")
    .option("--modules-url <url>", "override the derived caller-scoped modules URL")
    .option("--token <token>", "override the installation report token")
    .action(function (this: Command) {
      return run(() => runVerify(collectOptions(this)));
    });
}
