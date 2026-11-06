import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { loadModuleCliEntry } from "../src/lib/module-cli";
import { ModuleManifest } from "../src/core/module-manifest";

const manifestWithoutCli = {
  key: "account",
  wiring: { file: "account.module", className: "AccountModule" },
} as unknown as ModuleManifest;

const manifestWithCli = {
  key: "secrets",
  wiring: { file: "secrets.module", className: "SecretsModule", newbieCli: "secrets" },
} as unknown as ModuleManifest;

describe("loadModuleCliEntry", () => {
  it("returns null when the manifest does not declare a cli namespace", async () => {
    const loaded = await loadModuleCliEntry("/tmp", "account", manifestWithoutCli);
    assert.equal(loaded, null);
  });

  it("throws a CliError when the entry file is missing", async () => {
    await assert.rejects(
      () => loadModuleCliEntry("/tmp", "missing", manifestWithCli),
      /declares wiring\.newbieCli='secrets' but entry.*is missing/,
    );
  });
});

describe("registerModuleCommands", () => {
  it("is a no-op when the project has no newbie-modules.json", async () => {
    const { registerModuleCommands } = await import("../src/lib/module-cli");
    const { Command } = await import("commander");
    const program = new Command();
    // /nonexistent/path has no newbie-modules.json; the loader must skip silently.
    await registerModuleCommands(program, { cwd: "/nonexistent/path", dryRun: false, skipPrismaGenerate: false });
    assert.equal(program.commands.length, 0);
  });

  it("degrades broken module CLIs to warnings and still registers healthy namespaces", async () => {
    const { registerModuleCommands } = await import("../src/lib/module-cli");
    const { Command } = await import("commander");

    const project = await fs.mkdtemp(path.join(os.tmpdir(), "newbie-module-cli-"));
    try {
      // healthy: valid manifest + cli entry registering a subcommand.
      await fs.mkdir(path.join(project, "src", "modules", "healthy", "cli"), { recursive: true });
      await fs.writeFile(
        path.join(project, "src", "modules", "healthy", "newbie.module.json"),
        JSON.stringify({
          key: "healthy",
          wiring: { file: "healthy.module", className: "HealthyModule", newbieCli: "healthy" },
        }),
      );
      await fs.writeFile(
        path.join(project, "src", "modules", "healthy", "cli", "index.ts"),
        "export function register(parent) {\n  parent.command('ping').description('ping');\n}\n",
      );

      // broken: declares cli but the entry file is missing.
      await fs.mkdir(path.join(project, "src", "modules", "broken"), { recursive: true });
      await fs.writeFile(
        path.join(project, "src", "modules", "broken", "newbie.module.json"),
        JSON.stringify({
          key: "broken",
          wiring: { file: "broken.module", className: "BrokenModule", newbieCli: "broken" },
        }),
      );

      // throwing: entry exists but fails at load time.
      await fs.mkdir(path.join(project, "src", "modules", "throwing", "cli"), { recursive: true });
      await fs.writeFile(
        path.join(project, "src", "modules", "throwing", "newbie.module.json"),
        JSON.stringify({
          key: "throwing",
          wiring: { file: "throwing.module", className: "ThrowingModule", newbieCli: "throwing" },
        }),
      );
      await fs.writeFile(
        path.join(project, "src", "modules", "throwing", "cli", "index.ts"),
        "throw new Error('boom during load');\n",
      );

      await fs.writeFile(
        path.join(project, "newbie-modules.json"),
        JSON.stringify({
          registry: null,
          modules: [
            { key: "healthy", version: null, sourceCommit: "abc", localPatches: [] },
            { key: "broken", version: null, sourceCommit: "abc", localPatches: [] },
            { key: "throwing", version: null, sourceCommit: "abc", localPatches: [] },
          ],
        }),
      );

      const warnings: string[] = [];
      const originalError = console.error;
      console.error = (...args: unknown[]) => {
        warnings.push(args.join(" "));
      };
      const program = new Command();
      try {
        await registerModuleCommands(program, { cwd: project, dryRun: false, skipPrismaGenerate: false });
      } finally {
        console.error = originalError;
      }

      // Registration must not throw; only the healthy namespace is attached.
      const namespaces = program.commands.map((command) => command.name());
      assert.deepEqual(namespaces, ["healthy"]);
      assert.ok(program.commands[0].commands.some((sub) => sub.name() === "ping"));

      assert.equal(warnings.length, 2);
      assert.match(warnings[0], /Skipped CLI namespace 'broken' of module 'broken'/);
      assert.match(warnings[1], /Skipped CLI namespace 'throwing' of module 'throwing'/);
    } finally {
      await fs.rm(project, { recursive: true, force: true });
    }
  });

  it("does not deadlock startup when an installed manifest lags behind CLI enum values", async () => {
    const { registerModuleCommands } = await import("../src/lib/module-cli");
    const { Command } = await import("commander");

    const project = await fs.mkdtemp(path.join(os.tmpdir(), "newbie-module-cli-lag-"));
    try {
      // lagging: assembled copy still carries a legacy field this CLI rejects
      // (e.g. a top-level key removed by ADR-034 before `newbie update`).
      await fs.mkdir(path.join(project, "src", "modules", "lagging"), { recursive: true });
      await fs.writeFile(
        path.join(project, "src", "modules", "lagging", "newbie.module.json"),
        JSON.stringify({
          key: "lagging",
          legacyRole: "observer",
          wiring: { file: "lagging.module", className: "LaggingModule" },
        }),
      );

      // healthy: must still register despite the lagging neighbour.
      await fs.mkdir(path.join(project, "src", "modules", "healthy", "cli"), { recursive: true });
      await fs.writeFile(
        path.join(project, "src", "modules", "healthy", "newbie.module.json"),
        JSON.stringify({
          key: "healthy",
          wiring: { file: "healthy.module", className: "HealthyModule", newbieCli: "healthy" },
        }),
      );
      await fs.writeFile(
        path.join(project, "src", "modules", "healthy", "cli", "index.ts"),
        "export function register(parent) {\n  parent.command('ping').description('ping');\n}\n",
      );

      await fs.writeFile(
        path.join(project, "newbie-modules.json"),
        JSON.stringify({
          registry: null,
          modules: [
            { key: "lagging", version: null, sourceCommit: "abc", localPatches: [] },
            { key: "healthy", version: null, sourceCommit: "abc", localPatches: [] },
          ],
        }),
      );

      const warnings: string[] = [];
      const originalError = console.error;
      console.error = (...args: unknown[]) => {
        warnings.push(args.join(" "));
      };
      const program = new Command();
      try {
        await registerModuleCommands(program, { cwd: project, dryRun: false, skipPrismaGenerate: false });
      } finally {
        console.error = originalError;
      }

      // Startup succeeds and repair commands stay runnable; the lagging
      // module only costs a warning, the healthy namespace still attaches.
      assert.deepEqual(
        program.commands.map((command) => command.name()),
        ["healthy"],
      );
      assert.equal(warnings.length, 1);
      assert.match(warnings[0], /Skipped CLI namespace 'lagging' of module 'lagging'/);
    } finally {
      await fs.rm(project, { recursive: true, force: true });
    }
  });
});
