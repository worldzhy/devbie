import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Command, CommanderError } from "commander";

import { buildProgram } from "../src/program";

interface SerializedCommand {
  name: string;
  arguments: Array<{ name: string; required: boolean; variadic: boolean }>;
  options: string[];
  commands: SerializedCommand[];
}

function describeCommand(command: Command): SerializedCommand {
  return {
    name: command.name(),
    arguments: command.registeredArguments.map((argument) => ({
      name: argument.name(),
      required: argument.required,
      variadic: argument.variadic,
    })),
    options: command.options.filter((option) => option.long !== "--help").map((option) => option.flags),
    commands: command.commands.map(describeCommand),
  };
}

/**
 * ADR-024 command-surface snapshot (amended by ADR-029). Any change here must
 * come with an ADR update first: the CLI surface is a contract, not an
 * implementation detail.
 */
describe("fewbie CLI surface", () => {
  it("matches the ADR-024/ADR-029 command tree", () => {
    const surface = describeCommand(buildProgram());
    assert.deepEqual(surface, {
      name: "fewbie",
      arguments: [],
      options: ["-V, --version", "-C, --cwd <dir>", "--dry-run"],
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
          // Always JSON (ADR-024 F16); no flag needed.
          name: "status",
          arguments: [],
          options: [],
          commands: [],
        },
        {
          name: "modules",
          arguments: [],
          options: ["--json"],
          commands: [
            {
              name: "add",
              arguments: [{ name: "names", required: true, variadic: true }],
              options: ["-y, --yes", "-f, --force", "--skip-install", "--with-login-form"],
              commands: [],
            },
            {
              name: "apply",
              arguments: [],
              options: ["--check", "-y, --yes", "-f, --force", "--skip-install"],
              commands: [],
            },
            {
              name: "remove",
              arguments: [{ name: "names", required: true, variadic: true }],
              options: ["-y, --yes"],
              commands: [],
            },
            {
              name: "update",
              arguments: [{ name: "names", required: false, variadic: true }],
              options: ["--check", "-y, --yes"],
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
        {
          name: "apits",
          arguments: [{ name: "input", required: false, variadic: false }],
          options: ["-n, --name <name>", "-w, --watch", "--skip-install"],
          commands: [],
        },
      ],
    });
  });

  it("retires the pre-ADR command names", () => {
    const program = buildProgram();
    const rootNames = program.commands.map((command) => command.name());
    for (const retired of [
      "assemble",
      "agent",
      "config",
      "interactive",
      "dev",
      "sync-template",
      "install",
      // ADR-029: add/apply live under `modules`, never at the root.
      "add",
      "apply",
    ]) {
      assert.ok(!rootNames.includes(retired), `retired root command '${retired}' must not exist`);
    }
    assert.ok(rootNames.includes("modules"));
    assert.ok(rootNames.includes("template"));
    assert.deepEqual(
      program.commands.find((command) => command.name() === "modules")?.commands.map((command) => command.name()),
      ["add", "apply", "remove", "update"],
    );
    assert.deepEqual(
      program.commands.find((command) => command.name() === "template")?.commands.map((command) => command.name()),
      ["update"],
    );
  });

  it("does not expose retired flags", () => {
    const flags: string[] = [];
    const walk = (command: Command): void => {
      for (const option of command.options) flags.push(option.flags);
      for (const child of command.commands) walk(child);
    };
    walk(buildProgram());

    for (const retired of ["--write", "-w, --write", "--keys <keys>", "--all"]) {
      assert.ok(!flags.includes(retired), `retired flag '${retired}' must not exist`);
    }
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
      assert.equal(error.exitCode, 1, `'fewbie ${argv.join(" ")}' must exit 1`);
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
  assert.ok(error instanceof CommanderError, `'fewbie ${argv.join(" ")}' must be rejected by the parser`);
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
