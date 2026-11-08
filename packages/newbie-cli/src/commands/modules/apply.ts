import { select } from "@inquirer/prompts";
import { bold, cyan, green, inverse } from "colorette";
import { moduleKeys } from "@devbie/modules-state";

import { applyPlanned, planReconcile } from "../../assemble/pipeline";
import { diffModuleSources, printSourceDrift } from "../../assemble/module-source-drift";
import { ENV_PATH } from "../../constants/paths";
import { CliError } from "@devbie/cli-kit";
import { SinkFinding } from "../../lib/sink";
import { assertInteractive } from "../../lib/interactive";

import { createContext, GlobalOptions } from "../shared";

export interface ModulesApplyOptions extends GlobalOptions {
  yes?: boolean;
  /** CI gate: verify the declared module set and its derived files, write nothing. */
  check?: boolean;
}

export async function runApply(options: ModulesApplyOptions): Promise<void> {
  if (options.check) {
    await runApplyCheck(options);
    return;
  }
  await runApplyReconcile(options);
}

/**
 * CI gate (ADR-024 F7): prove that module copies, newbie-modules.json and every
 * generated wiring file match what a plain `modules apply` would write, and
 * that every installed copy still matches the registry tree pinned in
 * newbie-modules.json (R5-06/N-2). Runs offline (no registry fetch) so CI stays
 * deterministic.
 */
async function runApplyCheck(options: ModulesApplyOptions): Promise<void> {
  const { ctx } = await createContext(options, { check: true, fetch: false });
  const plan = await planReconcile(ctx);

  if (plan.installed.length > 0 || plan.uninstalled.length > 0) {
    const lines = [
      ...plan.installed.map((key) => `  - ${key}: copy missing from src/modules`),
      ...plan.uninstalled.map((key) => `  - ${key}: extra copy not declared in newbie-modules.json`),
    ];
    throw new CliError(
      `Module copies are out of sync with newbie-modules.json:\n${lines.join("\n")}\nRun \`newbie modules apply\`.`,
    );
  }

  const declared = moduleKeys(ctx.state);
  const undeclaredDependencies = plan.enabledKeys.filter((key) => !declared.includes(key));
  if (undeclaredDependencies.length > 0) {
    throw new CliError(
      `newbie-modules.json is missing module(s) required by the enabled set: ${undeclaredDependencies.join(", ")}. ` +
        "Run `newbie modules add` to declare them.",
    );
  }

  await applyPlanned(ctx, plan);
  // Issues collected while planning/rendering are failures a real apply would
  // also exit on; the gate must not stay green past them (R20-07).
  ctx.issues.assertEmpty();

  const findings = ctx.sink.findings.filter(isCountedFinding);
  if (findings.length > 0) {
    for (const finding of findings) {
      const detail = finding.kind === "action" ? finding.detail : finding.kind;
      console.info(`  - ${finding.path}: ${detail}`);
    }
    throw new CliError(
      `${findings.length} generated file(s) drift from the installed module set. ` +
        "Run `newbie modules apply` to regenerate them.",
    );
  }

  // Source drift: newbie-modules.json agreeing with src/modules does not prove the
  // copies are unmodified; only the pinned registry tree can (R5-06/N-2).
  const drifts = await diffModuleSources({
    cwd: ctx.cwd,
    registry: ctx.registry,
    state: ctx.state,
    enabledKeys: declared,
  });
  if (drifts.length > 0) {
    for (const drift of drifts) printSourceDrift(drift);
    const keys = drifts.map((drift) => drift.key).join(", ");
    throw new CliError(
      `${drifts.length} installed module(s) do not match the registry pin in newbie-modules.json (${keys}); ` +
        "back-port the host changes to newbie-modules, or run `newbie modules update` to adopt the registry version.",
    );
  }

  console.info(green(bold("✓ Module copies, sources and generated wiring match newbie-modules.json.")));
}

/**
 * Host-owned files the pipeline touches but that are not derived assets:
 * `.env` carries local secrets, and `prisma generate` only rebuilds the client.
 */
function isCountedFinding(finding: SinkFinding): boolean {
  if (finding.path === ENV_PATH) return false;
  if (finding.kind === "action" && finding.detail === "prisma generate") return false;
  return true;
}

/** No selector: reconcile the project with the declared newbie-modules.json set. */
async function runApplyReconcile(options: ModulesApplyOptions): Promise<void> {
  const { ctx } = await createContext(options, { fetch: true });

  const plan = await planReconcile(ctx);
  const { installed, uninstalled, closureAdded } = plan;

  for (const addition of closureAdded ?? []) {
    console.info(
      cyan(`[info] ${addition.key} is required by ${addition.requiredBy.join(", ")} and will also be enabled.`),
    );
  }

  // No copy/delete needed: still converge the generated wiring (idempotent),
  // which also repairs a previous apply interrupted mid-pipeline.
  if (installed.length === 0 && uninstalled.length === 0) {
    await applyPlanned(ctx, plan);
    ctx.issues.assertEmpty();
    console.info(green("[info] Project is in sync with newbie-modules.json; wiring refreshed."));
    return;
  }

  let message: string;
  if (!uninstalled.length && installed.length) {
    message = `Do you want to INSTALL ${cyan(installed.join(", "))}?`;
  } else if (uninstalled.length && !installed.length) {
    message = `Do you want to UNINSTALL ${inverse(uninstalled.join(", "))}?`;
  } else {
    message = `Do you want to UNINSTALL ${inverse(uninstalled.join(", "))} and INSTALL ${cyan(installed.join(", "))}?`;
  }

  if (!options.yes && !options.dryRun) {
    assertInteractive("apply the module changes");
    const confirmed = await select({
      message,
      choices: [
        { name: "Yes", value: "yes" },
        { name: "No", value: "no" },
      ],
    });
    if (confirmed !== "yes") {
      console.info("[info] Cancelled.");
      return;
    }
  }

  await applyPlanned(ctx, plan);
  ctx.issues.assertEmpty();
  console.info(bold(green("\n🍺 C O M P L E T E\n")));
}
