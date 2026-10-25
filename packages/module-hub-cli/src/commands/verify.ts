import { bold, gray, red } from "colorette";
import { CliError } from "@devbie/newbie-cli/lib";
import { readModulesState } from "@devbie/modules-state";

import { fetchInstallationInspection } from "../client";
import { resolveCredentials, resolveExpectedLabel } from "../env";
import type { HubCommandOptions } from "../options";
import { compareModules } from "../verify";
import { assertExpectedLabel, formatTimestamp, renderMismatch, renderVerificationOk } from "./render";

/**
 * `newbie module-hub verify` — fail when the hub's snapshot of this
 * installation differs from the local modules.json.
 *
 * Exit semantics (for CI and post-deploy checks):
 *   - no snapshot yet           -> failure (the instance never reported)
 *   - key set mismatch          -> failure
 *   - sourceCommit mismatch     -> failure (deployment lags the assembly)
 *   - everything consistent     -> success
 */
export async function runVerify(options: HubCommandOptions): Promise<void> {
  const credentials = await resolveCredentials({
    cwd: options.cwd,
    modulesUrl: options.modulesUrl,
    token: options.token,
  });
  const expectedLabel = await resolveExpectedLabel(options.cwd, options.expectLabel);
  const inspection = await fetchInstallationInspection(credentials);

  assertExpectedLabel(inspection, expectedLabel);

  if (!inspection.actual || inspection.actual.length === 0) {
    throw new CliError(
      `The hub has no snapshot for '${inspection.installation.label ?? "(unnamed)"}' ` +
        `(lastSeenAt: ${formatTimestamp(inspection.reportedAt)}). Start the process so it self-registers, then re-run.`,
    );
  }

  const local = await readModulesState(options.cwd);
  const mismatches = compareModules(local.modules, inspection.actual);

  console.log(bold(`Hub: ${credentials.modulesUrl}`));
  console.log(
    gray(
      `Installation: ${inspection.installation.label ?? "(unnamed)"} · ` +
        `snapshot reported ${formatTimestamp(inspection.reportedAt)}`,
    ),
  );

  if (mismatches.length === 0) {
    console.log();
    renderVerificationOk(local.modules.length);
    return;
  }

  console.log();
  console.log(red(`${mismatches.length} mismatch(es) between local modules.json and the hub snapshot:`));
  for (const mismatch of mismatches) {
    renderMismatch(mismatch);
  }
  throw new CliError("Verification failed: the deployed module set does not match the local assembly.");
}
