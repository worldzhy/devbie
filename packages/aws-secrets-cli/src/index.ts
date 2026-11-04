import type { Command } from "commander";

import { run } from "@devbie/newbie-cli/lib";
import type { GlobalOptions } from "@devbie/newbie-cli/lib";

import { runDeployRotation } from "./deploy-rotation";
import { runSecretsCheck } from "./check";
import { runSecretsPull, runSecretsPush } from "./pull-push";

/**
 * Register the `secrets` subcommands on the parent namespace created by the
 * framework CLI loader. Mirrors the option layout of the legacy `env` commands
 * so existing scripts and docs only need to swap `env` -> `secrets` and
 * `setup` -> `deploy-rotation`.
 */
export function register(parent: Command, options: GlobalOptions): void {
  function collectOptions(command: Command): GlobalOptions {
    const globals = command.optsWithGlobals();
    return {
      cwd: (globals.cwd as string) ?? options.cwd,
      dryRun: Boolean(globals.dryRun),
      skipPrismaGenerate: Boolean(globals.skipPrismaGenerate),
    };
  }

  parent
    .command("pull")
    .description("Pull environment variables from AWS Secrets Manager into .env")
    .option("-e, --environment <name>", "environment name from the env-tool config (skips the prompt)")
    .option("-y, --yes", "write .env without prompting; conflicting local values are replaced with AWS values", false)
    .option("--strict", "abort without writing .env when any secret fails to pull (for CI)", false)
    .action(function (this: Command) {
      const flags = this.opts();
      return run(() =>
        runSecretsPull({
          ...collectOptions(this),
          environment: flags.environment as string | undefined,
          yes: Boolean(flags.yes),
          strict: Boolean(flags.strict),
        }),
      );
    });

  parent
    .command("check")
    .description("Verify every .env.example variable exists in AWS Secrets Manager (CI guard)")
    .option("-e, --environment <name>", "environment name from the env-tool config (skips the prompt)")
    .action(function (this: Command) {
      const flags = this.opts();
      return run(() =>
        runSecretsCheck({
          ...collectOptions(this),
          environment: flags.environment as string | undefined,
        }),
      );
    });

  parent
    .command("push")
    .description("Push environment variables from .env to AWS Secrets Manager")
    .option("-e, --environment <name>", "environment name from the env-tool config (skips the prompt)")
    .option("-y, --yes", "create/update secrets without prompting (required in non-interactive mode)", false)
    .action(function (this: Command) {
      const flags = this.opts();
      return run(() =>
        runSecretsPush({
          ...collectOptions(this),
          environment: flags.environment as string | undefined,
          yes: Boolean(flags.yes),
        }),
      );
    });

  parent
    .command("deploy-rotation")
    .description("Provision the per-account Secrets Manager rotation Lambda and print its ARN")
    .option("-e, --environment <name>", "environment name from the env-tool config (skips the prompt)")
    .action(function (this: Command) {
      const flags = this.opts();
      return run(() =>
        runDeployRotation({
          ...collectOptions(this),
          environment: flags.environment as string | undefined,
        }),
      );
    });
}
