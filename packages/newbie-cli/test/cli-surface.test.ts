import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Command, CommanderError } from "commander";

import { buildProgram } from "../src/program";

interface CommandShape {
  name: string;
  arguments: { name: string; required: boolean; variadic: boolean }[];
  options: string[];
  commands: CommandShape[];
}

/** Serializable projection of the command tree (ADR-024 verification). */
function describeCommand(command: Command): CommandShape {
  return {
    name: command.name(),
    arguments: command.registeredArguments.map((argument) => ({
      name: argument.name(),
      required: argument.required,
      variadic: argument.variadic,
    })),
    options: command.options
      // The implicit help option is not part of the contract.
      .filter((option) => !option.flags.includes("--help"))
      .map((option) => option.flags),
    commands: command.commands.map(describeCommand),
  };
}

/**
 * The executable form of the CLI contract (ADR-024): renaming or re-adding a
 * command/flag must be a deliberate edit of this snapshot, not an accident.
 */
describe("newbie CLI surface", () => {
  it("matches the ADR-024 command contract", () => {
    const expected: CommandShape = {
      name: "newbie",
      arguments: [],
      options: ["-V, --version", "-C, --cwd <dir>", "--dry-run", "--skip-prisma-generate"],
      commands: [
        {
          name: "create",
          arguments: [{ name: "project-name", required: true, variadic: false }],
          options: ["--template-path <dir>", "--template-ref <ref>", "--no-git-init"],
          commands: [],
        },
        {
          name: "doctor",
          arguments: [],
          options: ["--json"],
          commands: [],
        },
        {
          name: "status",
          arguments: [],
          options: ["--drift"],
          commands: [],
        },
        {
          name: "modules",
          arguments: [],
          options: ["--json"],
          commands: [
            {
              name: "add",
              arguments: [{ name: "keys", required: true, variadic: true }],
              options: ["-y, --yes"],
              commands: [],
            },
            {
              name: "apply",
              arguments: [],
              options: ["--check", "-y, --yes"],
              commands: [],
            },
            {
              name: "remove",
              arguments: [{ name: "keys", required: true, variadic: true }],
              options: ["-y, --yes"],
              commands: [],
            },
            {
              name: "update",
              arguments: [{ name: "keys", required: false, variadic: true }],
              options: ["--check", "-y, --yes", "--force"],
              commands: [],
            },
            {
              name: "watch",
              arguments: [{ name: "keys", required: false, variadic: true }],
              options: ["--all"],
              commands: [],
            },
            {
              name: "lint",
              arguments: [],
              options: [],
              commands: [],
            },
          ],
        },
        {
          name: "template",
          arguments: [],
          options: [],
          commands: [
            {
              name: "update",
              arguments: [{ name: "paths", required: false, variadic: true }],
              options: ["--template-path <dir>", "--template-ref <ref>", "--check"],
              commands: [],
            },
          ],
        },
      ],
    };

    assert.deepEqual(describeCommand(buildProgram()), expected);
  });

  it("has no retired command names", () => {
    const surface = describeCommand(buildProgram());
    const rootNames = new Set(surface.commands.map((command) => command.name));
    for (const retired of ["apply", "assemble", "agent", "config", "interactive", "dev", "sync-template", "install"]) {
      assert.equal(rootNames.has(retired), false, `retired root command '${retired}' must not exist`);
    }
    // ADR-029: `install` and `sync` are retired verbs; modules uses add/apply
    // and template uses update.
    const modules = surface.commands.find((command) => command.name === "modules");
    const modulesNames = new Set(modules?.commands.map((command) => command.name));
    assert.equal(modulesNames.has("install"), false, "retired modules command 'install' must not exist");
    assert.ok(modulesNames.has("add") && modulesNames.has("apply"));
    const template = surface.commands.find((command) => command.name === "template");
    const templateNames = new Set(template?.commands.map((command) => command.name));
    assert.equal(templateNames.has("sync"), false, "retired template command 'sync' must not exist");
    assert.ok(templateNames.has("update"));
  });

  /**
   * ADR-029: retired names and surplus arguments must exit non-zero. Without
   * strict arity commander treats them as extra operands and runs the parent
   * action, so a stale script would report success while doing nothing.
   */
  it("rejects retired commands and surplus arguments at runtime", () => {
    for (const argv of [
      ["modules", "install"],
      ["template", "sync"],
      ["modules", "apply", "extra"],
    ]) {
      const error = expectParseFailure(argv);
      assert.equal(error.exitCode, 1, `'newbie ${argv.join(" ")}' must exit 1`);
    }
  });
});

function expectParseFailure(argv: string[]): InstanceType<typeof CommanderError> {
  const program = buildProgram();
  silenceAndThrow(program);
  let error: unknown;
  try {
    program.parse(argv, { from: "user" });
  } catch (caught) {
    error = caught;
  }
  assert.ok(error instanceof CommanderError, `'newbie ${argv.join(" ")}' must be rejected by the parser`);
  return error;
}

/**
 * `exitOverride` is per-command: without it a subcommand calls process.exit
 * directly, which would take the test runner down instead of surfacing the
 * parse error.
 */
function silenceAndThrow(command: Command): void {
  command.exitOverride();
  command.configureOutput({ writeOut: () => {}, writeErr: () => {} });
  for (const child of command.commands) silenceAndThrow(child);
}
