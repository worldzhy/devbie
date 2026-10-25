import { Command } from "commander";

// Published package version (package.json sits one level above both src/
// during development and dist/ in the published tarball).
import pkg from "../package.json";

import { runCreate } from "./commands/create";
import { runDoctor } from "./commands/doctor";
import { runAdd } from "./commands/modules/add";
import { runApply } from "./commands/modules/apply";
import { runModules } from "./commands/modules/default";
import { runLint } from "./commands/modules/lint";
import { runRemove } from "./commands/modules/remove";
import { runUpdate } from "./commands/modules/update";
import { runWatch } from "./commands/modules/watch";
import { runStatus } from "./commands/status";
import { runTemplateUpdate } from "./commands/template/update";
import { GlobalOptions } from "./commands/shared";
import { run } from "./lib/cli-runner";
import { parseModuleSelector } from "./lib/module-selector";

export const VERSION: string = pkg.version;

/**
 * Reject unrecognized command names and surplus positional arguments instead
 * of silently degrading to the parent action (commander is lenient by
 * default). A retired name such as `modules install` must fail loudly: a
 * silent no-op would let stale automation report success (ADR-029).
 */
export function enforceStrictArguments(command: Command): void {
  command.allowExcessArguments(false);
  for (const child of command.commands) enforceStrictArguments(child);
}

/**
 * The static command surface (ADR-024). Module-provided namespaces are
 * attached at runtime by `registerModuleCommands` and stay outside this
 * strictness rule: their arity is owned by the module package.
 */
export function buildProgram(): Command {
  const program = new Command();

  program
    .name("newbie")
    .description("Newbie framework CLI: manage modules from the newbie-modules registry and sync project files")
    .version(VERSION)
    .option("-C, --cwd <dir>", "project root directory", process.cwd())
    .option("--dry-run", "print planned changes without writing files or running mutating commands", false)
    .option("--skip-prisma-generate", "skip `npx prisma generate` after schema changes", false);

  /**
   * Merge values of options registered on the root program regardless of
   * whether the user placed them before or after the subcommand name.
   */
  function collectOptions(command: Command): GlobalOptions {
    const globals = command.optsWithGlobals();
    return {
      cwd: (globals.cwd as string) ?? process.cwd(),
      dryRun: Boolean(globals.dryRun),
      skipPrismaGenerate: Boolean(globals.skipPrismaGenerate),
    };
  }

  // Current project lifecycle verbs: the project is the CLI's implicit
  // default resource, so they sit at the program root (ADR-024 clause 5).
  program
    .command("create <project-name>")
    .description("Scaffold a new project from the basic template")
    .option("--template-path <dir>", "use a local template directory instead of cloning newbie-starter")
    .option("--template-ref <ref>", "git ref of newbie-starter to clone the template from")
    .option("--no-git-init", "skip 'git init' in the new project", undefined)
    .action(function (this: Command, name: string) {
      const flags = this.opts();
      return run(() =>
        runCreate({
          ...collectOptions(this),
          name,
          templatePath: flags.templatePath as string | undefined,
          templateRef: flags.templateRef as string | undefined,
          gitInit: flags.gitInit as boolean | undefined,
        }),
      );
    });

  program
    .command("doctor")
    .description("Audit the installation: registry pins, copied modules, drift, env and prisma wiring")
    .option("--json", "print findings as JSON", false)
    .action(function (this: Command) {
      const flags = this.opts();
      return run(() => runDoctor({ ...collectOptions(this), json: Boolean(flags.json) }));
    });

  program
    .command("status")
    .description("Print machine-readable project state as JSON")
    .option("--drift", "include content drift against pinned pristine copies", false)
    .action(function (this: Command) {
      const flags = this.opts();
      return run(() => runStatus({ ...collectOptions(this), drift: Boolean(flags.drift) }));
    });

  const modules = program
    .command("modules")
    .description("Inspect and manage the enabled module set (bare invocation opens the picker on a TTY)")
    .option("--json", "print the module inventory as JSON", false);

  modules.action(function (this: Command) {
    const flags = this.opts();
    return run(() => runModules({ ...collectOptions(this), json: Boolean(flags.json) }));
  });

  modules
    .command("add <keys...>")
    .description("Declare modules in modules.json and install them (npm-style add)")
    .option("-y, --yes", "skip confirmation prompts", false)
    .action(function (this: Command, keys: string[]) {
      const flags = this.opts();
      return run(() =>
        runAdd({
          ...collectOptions(this),
          yes: Boolean(flags.yes),
          keys: parseModuleSelector(keys) ?? [],
        }),
      );
    });

  modules
    .command("apply")
    .description("Reconcile the project with modules.json; --check is the CI gate")
    .option("--check", "CI gate: verify module copies and generated wiring without writing anything", false)
    .option("-y, --yes", "skip confirmation prompts", false)
    .action(function (this: Command) {
      const flags = this.opts();
      return run(() =>
        runApply({
          ...collectOptions(this),
          check: Boolean(flags.check),
          yes: Boolean(flags.yes),
        }),
      );
    });

  modules
    .command("remove <keys...>")
    .description("Remove modules from the enabled set (blocked while another enabled module still requires them)")
    .option("-y, --yes", "skip confirmation prompts", false)
    .action(function (this: Command, keys: string[]) {
      const flags = this.opts();
      return run(() =>
        runRemove({
          ...collectOptions(this),
          yes: Boolean(flags.yes),
          keys: parseModuleSelector(keys) ?? [],
        }),
      );
    });

  modules
    .command("update [keys...]")
    .description(
      "Update enabled module copies to the registry HEAD commit; --check is the offline drift gate against the registry checkout",
    )
    .option("--check", "CI gate: verify installed copies against the registry checkout without writing anything", false)
    .option("-y, --yes", "skip confirmation prompts", false)
    .option("--force", "overwrite locally drifted module copies", false)
    .action(function (this: Command, keys: string[]) {
      const flags = this.opts();
      return run(() =>
        runUpdate({
          ...collectOptions(this),
          check: Boolean(flags.check),
          yes: Boolean(flags.yes),
          force: Boolean(flags.force),
          keys: parseModuleSelector(keys),
        }),
      );
    });

  modules
    .command("watch [keys...]")
    .description("Watch the local newbie-modules registry and sync installed module sources into the project on change")
    .option("--all", "watch every registry module instead of only installed ones", false)
    .action(function (this: Command, keys: string[]) {
      const flags = this.opts();
      return run(() =>
        runWatch({
          ...collectOptions(this),
          all: Boolean(flags.all),
          keys: parseModuleSelector(keys),
        }),
      );
    });

  modules
    .command("lint")
    .description(
      "Enforce the module layering rules (feature -> capability -> infrastructure -> datastore) across registry sources; registry checkouts only",
    )
    .action(function (this: Command) {
      return run(() => runLint(collectOptions(this)));
    });

  const template = program.command("template").description("Manage the framework-owned part of the project template");

  template.action(() => {
    template.outputHelp();
  });

  template
    .command("update [paths...]")
    .description(
      "Update framework-owned template files (ADR-009 ownership registry: main.ts, tsconfig*, nest-cli.json, prisma.config.ts, prisma framework block, .env.example/.gitignore framework blocks, deploy/*) from the template; pass path prefixes to restrict the scope",
    )
    .option("--template-path <dir>", "use a local template directory instead of cloning newbie-starter")
    .option("--template-ref <ref>", "git ref (e.g. a template tag) of newbie-starter to sync from")
    .option("--check", "CI gate: print the diff and exit non-zero when skeleton files drift", false)
    .action(function (this: Command, paths: string[]) {
      const flags = this.opts();
      return run(() =>
        runTemplateUpdate({
          ...collectOptions(this),
          templatePath: flags.templatePath as string | undefined,
          templateRef: flags.templateRef as string | undefined,
          check: Boolean(flags.check),
          paths,
        }),
      );
    });

  // Bare invocation: help + version line, exit 0 (ADR-024 clause 6).
  program.action(() => {
    program.outputHelp();
    console.info(`\nnewbie v${VERSION}`);
  });

  enforceStrictArguments(program);

  return program;
}
