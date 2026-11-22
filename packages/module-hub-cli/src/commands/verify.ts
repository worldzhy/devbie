import fs from "node:fs/promises";
import path from "node:path";

import { bold, gray, red } from "colorette";
import { CliError } from "@devbie/newbie-cli/lib";
import { MODULE_LOCK_FILE, readModulesState } from "@devbie/modules-state";

import { fetchInstallationInspection } from "../client";
import { resolveCredentials, resolveExpectedLabel } from "../env";
import type { HubCommandOptions } from "../options";
import { compareModules, type LocalModule } from "../verify";
import { assertExpectedLabel, formatTimestamp, renderMismatch, renderVerificationOk } from "./render";

/**
 * Tolerant `key -> sourceCommit` read of the lock. The CLI validates the
 * schema; verify only needs the locked commits, and a missing/unreadable lock
 * leaves every commit null (the comparison then skips commit mismatches).
 */
async function readLockedCommits(cwd: string): Promise<Map<string, string>> {
  const commits = new Map<string, string>();
  let raw: string;
  try {
    raw = await fs.readFile(path.resolve(cwd, MODULE_LOCK_FILE), "utf8");
  } catch {
    return commits;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return commits;
  }
  const modules = (parsed as { modules?: unknown } | null)?.modules;
  if (!Array.isArray(modules)) return commits;
  for (const entry of modules) {
    if (!entry || typeof entry !== "object") continue;
    const key = (entry as { key?: unknown }).key;
    const commit = (entry as { sourceCommit?: unknown }).sourceCommit;
    if (typeof key === "string" && key.length > 0 && typeof commit === "string" && commit.length > 0) {
      commits.set(key, commit);
    }
  }
  return commits;
}

/**
 * `newbie module-hub verify` — fail when the hub's snapshot of this
 * installation differs from the local newbie-modules.json.
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

  const state = await readModulesState(options.cwd);
  const lockedCommits = await readLockedCommits(options.cwd);
  const local: LocalModule[] = state.modules.map((record) => ({
    key: record.key,
    sourceCommit: lockedCommits.get(record.key) ?? null,
  }));
  const mismatches = compareModules(local, inspection.actual);

  console.log(bold(`Hub: ${credentials.modulesUrl}`));
  console.log(
    gray(
      `Installation: ${inspection.installation.label ?? "(unnamed)"} · ` +
        `snapshot reported ${formatTimestamp(inspection.reportedAt)}`,
    ),
  );

  if (mismatches.length === 0) {
    console.log();
    renderVerificationOk(local.length);
    return;
  }

  console.log();
  console.log(red(`${mismatches.length} mismatch(es) between local newbie-modules.json and the hub snapshot:`));
  for (const mismatch of mismatches) {
    renderMismatch(mismatch);
  }
  throw new CliError("Verification failed: the deployed module set does not match the local assembly.");
}
