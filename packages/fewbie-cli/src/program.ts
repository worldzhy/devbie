import { Command } from "commander";
import { bold } from "colorette";

// Published package version (package.json sits one level above both src/
// during development and dist/ in the published tarball).
import pkg from "../package.json";

import { runApits } from "./commands/apits";
import { runCreate } from "./commands/create";
import { doctorCommand } from "./commands/doctor";
import { runModules } from "./commands/modules/default";
import { runAdd } from "./commands/modules/add";
import { runApply } from "./commands/modules/apply";
import { runRemove } from "./commands/modules/remove";
import { runUpdate } from "./commands/modules/update";
import { runStatus } from "./commands/status";
import { runTemplateUpdate } from "./commands/template/update";

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

interface GlobalOptions {
  cwd: string;
  dryRun: boolean;
}

/**
 * The static command surface (ADR-024, amended by ADR-029). Registry/project
 * nouns are namespaces; the current project's lifecycle verbs sit at the root.
 */
export function buildProgram(): Command {
  const program = new Command();

  program
    .name("fewbie")
    .description(
      "Fewbie frontend framework CLI: scaffold Next.js projects, manage registry modules and update framework template files",
    )
    .version(VERSION)
    .option("-C, --cwd <dir>", "project root directory", process.cwd())
    .option("--dry-run", "print planned changes without writing files", false);

  /** Merge root options regardless of whether they precede the subcommand. */
  function globals(command: Command): GlobalOptions {
    const flags = command.optsWithGlobals();
    return {
      cwd: (flags.cwd as string) ?? process.cwd(),
      dryRun: Boolean(flags.dryRun),
    };
  }

  program
    .command("create <project-name>")
    .description("create a new project from the fewbie basic template")
    .option("--template-path <dir>", "use a local template directory instead of cloning fewbie-starter")
    .option("--template-ref <ref>", "git ref of fewbie-starter to clone the template from")
    .option("--no-git-init", "skip 'git init' in the new project", undefined)
    .action(function (this: Command, projectName: string) {
      const flags = this.opts();
      return runCreate({
        name: projectName,
        ...globals(this),
        templatePath: flags.templatePath as string | undefined,
        templateRef: flags.templateRef as string | undefined,
        gitInit: flags.gitInit as boolean | undefined,
      });
    });

  program
    .command("doctor")
    .description("check project health (structure, declared modules, dependencies, design tokens)")
    .option("--json", "emit machine-readable JSON", false)
    .action(function (this: Command) {
      const flags = this.opts();
      return doctorCommand({ ...globals(this), json: Boolean(flags.json) });
    });

  program
    .command("status")
    .description("print machine-readable project state as JSON")
    .action(function (this: Command) {
      return runStatus(globals(this));
    });

  const modules = program
    .command("modules")
    .description(
      "inspect and manage the registry modules declared in fewbie.json (bare invocation opens the picker on a TTY)",
    )
    .option("--json", "print the module inventory as JSON", false);

  modules.action(function (this: Command) {
    const flags = this.opts();
    return runModules({ ...globals(this), json: Boolean(flags.json) });
  });

  modules
    .command("add <names...>")
    .description("declare the named modules in fewbie.json (npm-style add) and land their files")
    .option("-y, --yes", "skip confirmation prompts", false)
    .option("-f, --force", "overwrite files that already exist but belong to no declared module", false)
    .option("--skip-install", "do not run npm install for missing dependencies", false)
    .option(
      "--with-login-form",
      "also install the login-form block (e.g. `fewbie modules add auth --with-login-form`)",
      false,
    )
    .action(function (this: Command, names: string[]) {
      const flags = this.opts();
      return runAdd({
        ...globals(this),
        names,
        yes: Boolean(flags.yes),
        force: Boolean(flags.force),
        skipInstall: Boolean(flags.skipInstall),
        withLoginForm: Boolean(flags.withLoginForm),
      });
    });

  modules
    .command("apply")
    .description(
      "reconcile the project with fewbie.json (restore missing files, land dependency closure members). --check is the CI gate",
    )
    .option("--check", "CI gate: verify the declared set, its files and dependencies without writing anything", false)
    .option("-y, --yes", "skip confirmation prompts", false)
    .option("-f, --force", "overwrite files that already exist but belong to no declared module", false)
    .option("--skip-install", "do not run npm install for missing dependencies", false)
    .action(function (this: Command) {
      const flags = this.opts();
      return runApply({
        ...globals(this),
        check: Boolean(flags.check),
        yes: Boolean(flags.yes),
        force: Boolean(flags.force),
        skipInstall: Boolean(flags.skipInstall),
      });
    });

  modules
    .command("remove <names...>")
    .description("remove modules from the declared set and their unmodified files")
    .option("-y, --yes", "skip confirmation prompts", false)
    .action(function (this: Command, names: string[]) {
      const flags = this.opts();
      return runRemove({ ...globals(this), names, yes: Boolean(flags.yes) });
    });

  modules
    .command("update [names...]")
    .description("update declared module files to the registry source; --check is the drift gate")
    .option("--check", "CI gate: verify installed files against the registry without writing anything", false)
    .option("-y, --yes", "skip confirmation prompts", false)
    .action(function (this: Command, names: string[]) {
      const flags = this.opts();
      return runUpdate({ ...globals(this), names, check: Boolean(flags.check), yes: Boolean(flags.yes) });
    });

  const template = program.command("template").description("manage the framework-owned part of the project template");

  template.action(() => {
    template.outputHelp();
  });

  template
    .command("update [paths...]")
    .description(
      "update framework-owned template files (ADR-025 ownership registry: framework configs, instrumentation, utils and the globals.css marker block) from the template; pass path prefixes to restrict the scope",
    )
    .option("--template-path <dir>", "use a local template directory instead of cloning fewbie-starter")
    .option("--template-ref <ref>", "git ref of fewbie-starter to update the template from")
    .option("--check", "CI gate: print the diff and exit non-zero when template files drift", false)
    .action(function (this: Command, paths: string[]) {
      const flags = this.opts();
      return runTemplateUpdate({
        ...globals(this),
        paths,
        check: Boolean(flags.check),
        templatePath: flags.templatePath as string | undefined,
        templateRef: flags.templateRef as string | undefined,
      });
    });

  program
    .command("apits [input]")
    .description(
      "generate typed API request code from an OpenAPI document (URL or local JSON/YAML); the first run scaffolds apits.config.ts",
    )
    .option("-n, --name <name>", "only generate the config source with this name")
    .option("-w, --watch", "watch a local OpenAPI document and regenerate on change", false)
    .option("--skip-install", "do not install the generator dev dependency", false)
    .action(function (this: Command, input: string) {
      const flags = this.opts();
      return runApits({
        ...globals(this),
        input,
        name: flags.name as string | undefined,
        watch: Boolean(flags.watch),
        skipInstall: Boolean(flags.skipInstall),
      });
    });

  // Bare invocation: help + version line, exit 0 (ADR-024 clause 6).
  program.action(() => {
    program.outputHelp();
    console.info(`\n${bold("@devbie/fewbie-cli")} ${VERSION}`);
  });

  enforceStrictArguments(program);

  return program;
}
