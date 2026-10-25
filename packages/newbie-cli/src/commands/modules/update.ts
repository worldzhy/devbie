import figlet from "figlet";
import { checkbox, select } from "@inquirer/prompts";
import { bold, cyan, green, inverse, yellow } from "colorette";
import { MODULES_DIR, moduleKeys } from "@devbie/modules-state";

import { describeMissingDependencies, expandRegistryClosure } from "../../assemble/module-graph";
import { collectMissingRegistrySources } from "../../assemble/modules-copy";
import { ModuleSourceDrift, diffModuleSources } from "../../assemble/module-source-drift";
import { runSteps } from "../../assemble/pipeline";
import { diffSnapshots, driftPatchIds } from "../../core/drift";
import { snapshotInstalledModule, snapshotPristineModule } from "../../lib/drift";
import { CliError } from "../../lib/errors";
import { fileExists } from "../../lib/fs-util";
import { writeModulesState } from "../../lib/modules-state";

import { createContext, GlobalOptions } from "../shared";

type UpdateStatus = "missing" | "missing-in-registry" | "drifted" | "update-available" | "up-to-date";

interface UpdateInspection {
  key: string;
  status: UpdateStatus;
  fromCommit: string | null;
  toCommit: string | null;
  patchIds: string[];
}

const short = (commit: string | null): string => (commit ? commit.slice(0, 7) : "unknown");

/** Whether the process can prompt the user. */
function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

export interface ModulesUpdateOptions extends GlobalOptions {
  yes?: boolean;
  force?: boolean;
  /** CI gate: verify installed copies against the registry checkout, write nothing. */
  check?: boolean;
  /** Positional module selector; undefined means every module with an update. */
  keys?: string[];
}

export async function runUpdate(options: ModulesUpdateOptions): Promise<void> {
  if (options.check) {
    if (options.keys && options.keys.length > 0) {
      throw new CliError("`modules update --check` inspects every enabled module and does not accept module keys.");
    }
    await runUpdateCheck(options);
    return;
  }

  console.info(
    figlet.textSync("Newbie", {
      font: "Epic",
      width: 80,
      whitespaceBreak: true,
    }),
  );

  const { ctx } = await createContext(options, { fetch: true });
  const { cwd, sink, registry, state } = ctx;

  const keys = moduleKeys(state);
  if (keys.length === 0) {
    console.info("\n[info] No modules are enabled.\n");
    return;
  }

  const targetCommit = registry.sourceCommit;
  const inspections: UpdateInspection[] = [];

  for (const key of keys) {
    process.stdout.write(`Checking ${key}...\r`);
    const record = state.modules.find((entry) => entry.key === key);
    const fromCommit = record?.sourceCommit ?? null;
    const base: UpdateInspection = {
      key,
      status: "up-to-date",
      fromCommit,
      toCommit: targetCommit,
      patchIds: [],
    };

    if (!(await fileExists(cwd, `${MODULES_DIR}/${key}`))) {
      inspections.push({ ...base, status: "missing" });
      continue;
    }
    if (fromCommit && targetCommit && fromCommit === targetCommit) {
      inspections.push(base);
      continue;
    }

    // Guard local customisation: compare the copy with its pinned pristine tree.
    if (fromCommit && !options.force) {
      const pristine = await snapshotPristineModule(registry, key, fromCommit);
      if (pristine) {
        const drift = diffSnapshots(await snapshotInstalledModule(cwd, key), pristine);
        if (!drift.clean) {
          inspections.push({
            ...base,
            status: "drifted",
            patchIds: driftPatchIds(drift),
          });
          continue;
        }
      }
    }

    // Never schedule a copy the current registry checkout cannot serve: the
    // copy step deletes the installed directory before reading the source.
    const missingSources = await collectMissingRegistrySources(registry.root, [key]);
    if (missingSources.length > 0) {
      inspections.push({ ...base, status: "missing-in-registry" });
      continue;
    }

    inspections.push({ ...base, status: "update-available" });
  }
  process.stdout.write("\x1b[2K\r");

  for (const result of inspections) {
    if (result.status === "missing") {
      console.info(yellow(`[skip] ${result.key}: directory missing; run 'newbie modules apply'.`));
    } else if (result.status === "missing-in-registry") {
      console.info(
        yellow(
          `[skip] ${result.key}: not present in registry checkout ${short(registry.sourceCommit)}; set NEWBIE_MODULES_REF to a ref that carries it, then run 'newbie modules apply'.`,
        ),
      );
    } else if (result.status === "drifted") {
      console.info(
        yellow(
          `[skip] ${result.key}: local changes detected (${result.patchIds.length} file(s)); re-run with --force to overwrite.`,
        ),
      );
    }
  }

  const updatable = inspections.filter((result) => result.status === "update-available");
  if (updatable.length === 0) {
    const skipped = inspections.filter((result) => result.status !== "up-to-date").length;
    if (skipped === 0) {
      console.info(green("\n[info] All modules are up to date.\n"));
    } else {
      console.info(yellow(`\n[info] Nothing to update: ${skipped} module(s) skipped (see above).\n`));
    }
    return;
  }

  let selected: UpdateInspection[];
  if (options.keys && options.keys.length > 0) {
    const enabled = new Set(keys);
    const unknown = options.keys.filter((key) => !enabled.has(key));
    if (unknown.length > 0) {
      throw new CliError(`Unknown or disabled module(s): ${unknown.join(", ")}. Enabled: ${keys.join(", ")}`);
    }
    const updatableKeys = new Set(updatable.map((result) => result.key));
    for (const key of options.keys) {
      if (!updatableKeys.has(key)) {
        const inspection = inspections.find((result) => result.key === key);
        if (inspection?.status === "up-to-date") {
          console.info(green(`[info] ${key}: already up to date.`));
        }
      }
    }
    selected = updatable.filter((result) => options.keys!.includes(result.key));
    if (selected.length === 0) {
      console.info(green("\n[info] Nothing to update for the given modules.\n"));
      return;
    }
  } else if (options.dryRun || !isInteractive()) {
    selected = updatable;
  } else {
    const selectedKeys = await checkbox({
      message: "Which modules do you want to update:",
      choices: updatable.map((result) => ({
        value: result.key,
        name: `${result.key} ${inverse(short(result.fromCommit))} -> ${cyan(short(result.toCommit))}`,
        checked: true,
      })),
      pageSize: 100,
      loop: true,
    });
    selected = updatable.filter((result) => selectedKeys.includes(result.key));
  }

  if (selected.length === 0) {
    console.info("\n[info] No modules selected.\n");
    return;
  }

  const selectedKeys = selected.map((result) => result.key);

  // Updated manifests may gain moduleDependencies; pull those modules in too,
  // treating every currently enabled module as already satisfied.
  const closure = await expandRegistryClosure(ctx.registry.root, selectedKeys, {
    satisfied: new Set(keys),
  });
  const missing = describeMissingDependencies(closure);
  if (missing.length > 0) {
    throw new CliError(`Cannot resolve module dependencies:\n  - ${missing.join("\n  - ")}`);
  }
  const addedKeys = [...selectedKeys, ...closure.added];
  const enabledKeys = [...keys, ...closure.added.filter((key) => !keys.includes(key))];
  for (const key of closure.added) {
    console.info(cyan(`[info] ${key} is a new module dependency and will also be enabled.`));
  }

  if (!options.yes && !options.dryRun) {
    const confirmed = await select({
      message: `Do you want to UPDATE ${cyan(addedKeys.join(", "))}?`,
      choices: [
        { name: "Yes", value: "yes" },
        { name: "No", value: "no" },
      ],
    });
    if (confirmed !== "yes") {
      console.info("\n[info] Update cancelled.\n");
      return;
    }
  }

  await runSteps(ctx, {
    added: addedKeys,
    removed: [],
    enabledKeys,
  });
  if (!sink.dryRun) {
    await writeModulesState(cwd, sink, ctx.state);
  }

  ctx.issues.assertEmpty();
  console.info(bold(green("\nC O M P L E T E\n")));
}

/** Print one installed module whose sources diverge from the registry checkout. */
function printSourceDrift(drift: ModuleSourceDrift): void {
  const verdict = drift.report === null ? "absent from" : "differs from";
  console.info(bold(`\n# ${drift.installedPath} (${verdict} ${drift.registryPath})`));
  if (drift.report === null) return;
  for (const file of drift.report.added) console.info(`  added: ${file}`);
  for (const file of drift.report.changed) console.info(`  changed: ${file}`);
  for (const file of drift.report.removed) console.info(`  removed: ${file}`);
}

/**
 * CI gate (ADR-024 F7): every installed module copy must stay byte-identical to
 * the registry checkout it was back-ported from (ADR-019/ADR-021). Runs
 * offline: CI points NEWBIE_MODULES_PATH at a local checkout, so no fetch.
 */
async function runUpdateCheck(options: ModulesUpdateOptions): Promise<void> {
  const { ctx } = await createContext(options, { fetch: false });
  const enabledKeys = moduleKeys(ctx.state);
  if (enabledKeys.length === 0) {
    console.info(green(bold("✓ No modules are enabled.")));
    return;
  }

  const drifts = await diffModuleSources({
    cwd: ctx.cwd,
    registryRoot: ctx.registry.root,
    enabledKeys,
  });
  if (drifts.length === 0) {
    console.info(green(bold("✓ Installed module sources match the registry checkout.")));
    return;
  }

  for (const drift of drifts) printSourceDrift(drift);
  const keys = drifts.map((drift) => drift.key).join(", ");
  throw new CliError(
    `${drifts.length} installed module(s) differ from the registry checkout (${keys}); ` +
      "back-port the host changes to newbie-modules, or run `newbie modules update` to adopt the registry version.",
  );
}
