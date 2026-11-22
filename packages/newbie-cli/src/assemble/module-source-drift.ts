import { bold } from "colorette";
import { MODULES_DIR, ModulesState } from "@devbie/modules-state";

import { REGISTRY_MODULES_DIR } from "../constants/paths";
import { diffSnapshots, DriftReport } from "../core/drift";
import { filesToSnapshot, lockEntryFor, ModuleLock } from "../core/module-lock";
import { readModuleLock } from "../lib/module-lock";
import { fetchRegistryCommit, snapshotInstalledModule, snapshotPristineModule } from "../lib/drift";
import { RegistryLocation } from "../lib/registry";

/**
 * Why a module copy cannot be proven against its provenance lock (ADR-041).
 *
 * - `lock-missing`: the copy exists but the lock has no entry (installed
 *   without going through the CLI); `modules apply` seeds it after verifying.
 * - `copy-modified`: the installed copy differs from the lock manifest.
 * - `lock-tampered`: the lock manifest differs from the registry tree at its
 *   `sourceCommit`.
 * - `unverifiable-lock`: the `sourceCommit` object is missing locally and
 *   could not be fetched.
 * - `missing-copy`: the key is enabled but `src/modules/<key>` is gone; only
 *   reported when the caller asks for it (`modules update --check`).
 *
 * A project without `newbie-modules.lock.json` still uses the legacy pin in
 * `newbie-modules.json` (`missing-pin` / `unavailable-pin`) until the next
 * `modules apply` writes the lock.
 */
export type ModuleDriftReason =
  | "lock-missing"
  | "copy-modified"
  | "lock-tampered"
  | "unverifiable-lock"
  | "missing-copy"
  | "missing-pin"
  | "unavailable-pin";

/**
 * One installed module whose sources do not match the provenance lock.
 *
 * The installed copy under `src/modules/<key>` is registry-owned wholesale
 * (ADR-019: module sources must stay byte-identical to the host copy, the
 * diff-empty back-port rule). This plan is the read-only side of the
 * `modules apply --check` / `modules update --check` drift gate (ADR-021,
 * refined by ADR-024 and ADR-041): nothing here can repair the drift, because
 * the fix lives in whichever repository carries the newer version.
 */
export interface ModuleSourceDrift {
  key: string;
  /** Project-relative directory of the installed copy. */
  installedPath: string;
  /** Registry-relative directory the copy is compared against. */
  registryPath: string;
  /** Commit recorded for the installed copy (lock, or legacy pin); null when absent. */
  baselineCommit: string | null;
  /** null when the comparison cannot run (see `reason`). */
  report: DriftReport | null;
  /** Set when `report` is null: why no comparison could run. */
  reason: ModuleDriftReason | null;
}

/** Legacy path: projects without a lock still compare against the pin. */
async function legacyDrift(params: {
  cwd: string;
  registry: RegistryLocation;
  state: ModulesState;
  enabledKeys: string[];
  requireInstalled: boolean;
}): Promise<ModuleSourceDrift[]> {
  const { cwd, registry, state, enabledKeys, requireInstalled } = params;
  const drifts: ModuleSourceDrift[] = [];
  for (const key of enabledKeys) {
    const record = state.modules.find((entry) => entry.key === key);
    const pin = record?.sourceCommit ?? null;
    const base: ModuleSourceDrift = {
      key,
      installedPath: `${MODULES_DIR}/${key}`,
      registryPath: `${REGISTRY_MODULES_DIR}/${key}`,
      baselineCommit: pin,
      report: null,
      reason: null,
    };
    if (!pin) {
      drifts.push({ ...base, reason: "missing-pin" });
      continue;
    }
    const installed = await snapshotInstalledModule(cwd, key);
    if (installed === null) {
      if (requireInstalled) drifts.push({ ...base, reason: "missing-copy" });
      continue;
    }
    const pristine = await snapshotPristineModule(registry, key, pin);
    if (pristine === null) {
      drifts.push({ ...base, reason: "unavailable-pin" });
      continue;
    }
    const report = diffSnapshots(installed, pristine);
    if (!report.clean) drifts.push({ ...base, report });
  }
  return drifts;
}

/** Lock path: copy = manifest, then manifest = registry tree at sourceCommit. */
async function lockDrift(params: {
  cwd: string;
  registry: RegistryLocation;
  lock: ModuleLock;
  enabledKeys: string[];
  requireInstalled: boolean;
}): Promise<ModuleSourceDrift[]> {
  const { cwd, registry, lock, enabledKeys, requireInstalled } = params;
  const drifts: ModuleSourceDrift[] = [];
  for (const key of enabledKeys) {
    const entry = lockEntryFor(lock, key);
    const base: ModuleSourceDrift = {
      key,
      installedPath: `${MODULES_DIR}/${key}`,
      registryPath: `${REGISTRY_MODULES_DIR}/${key}`,
      baselineCommit: entry?.sourceCommit ?? null,
      report: null,
      reason: null,
    };
    const installed = await snapshotInstalledModule(cwd, key);
    if (installed === null) {
      if (requireInstalled) drifts.push({ ...base, reason: "missing-copy" });
      continue;
    }
    if (!entry) {
      drifts.push({ ...base, reason: "lock-missing" });
      continue;
    }
    const manifest = filesToSnapshot(entry.files);
    const copyReport = diffSnapshots(installed, manifest);
    if (!copyReport.clean) {
      drifts.push({ ...base, report: copyReport, reason: "copy-modified" });
      continue;
    }
    let pristine = await snapshotPristineModule(registry, key, entry.sourceCommit);
    if (pristine === null && (await fetchRegistryCommit(registry, entry.sourceCommit))) {
      pristine = await snapshotPristineModule(registry, key, entry.sourceCommit);
    }
    if (pristine === null) {
      drifts.push({ ...base, reason: "unverifiable-lock" });
      continue;
    }
    const lockReport = diffSnapshots(manifest, pristine);
    if (!lockReport.clean) drifts.push({ ...base, report: lockReport, reason: "lock-tampered" });
  }
  return drifts;
}

/**
 * Compare every installed module against its provenance lock (ADR-041). The
 * comparison is content-only (file hashes, POSIX-relative paths): empty
 * directories and OS metadata never register as drift.
 *
 * "Upstream moved on" is deliberately not a gate failure: the gate asserts
 * `copy = manifest` and `manifest = registry @ sourceCommit`, so a consumer
 * parked on an older but self-consistent commit stays green.
 */
export async function diffModuleSources(params: {
  cwd: string;
  registry: RegistryLocation;
  state: ModulesState;
  enabledKeys: string[];
  /**
   * Report enabled modules whose copy is absent. `modules apply --check`
   * reports that through planReconcile and leaves this off; `modules update
   * --check` has no reconcile pass and must not stay green (R6-03).
   */
  requireInstalled?: boolean;
}): Promise<ModuleSourceDrift[]> {
  const { cwd, registry, state, enabledKeys, requireInstalled = false } = params;
  const lock = await readModuleLock(cwd);
  if (lock === null) {
    return legacyDrift({ cwd, registry, state, enabledKeys, requireInstalled });
  }
  return lockDrift({ cwd, registry, lock, enabledKeys, requireInstalled });
}

const short = (commit: string | null): string => (commit ? commit.slice(0, 7) : "unknown");

/** Print one drift entry; shared by `apply --check` and `update --check`. */
export function printSourceDrift(drift: ModuleSourceDrift): void {
  if (drift.reason === "missing-pin") {
    console.info(bold(`\n# ${drift.installedPath} (no sourceCommit pin in newbie-modules.json)`));
    return;
  }
  if (drift.reason === "lock-missing") {
    console.info(bold(`\n# ${drift.installedPath} (installed copy has no entry in newbie-modules.lock.json)`));
    return;
  }
  if (drift.reason === "missing-copy") {
    console.info(bold(`\n# ${drift.installedPath} (enabled in newbie-modules.json but the copy is missing)`));
    return;
  }
  if (drift.reason === "unavailable-pin") {
    console.info(
      bold(`\n# ${drift.installedPath} (cannot read ${drift.registryPath} at ${short(drift.baselineCommit)})`),
    );
    return;
  }
  if (drift.reason === "unverifiable-lock") {
    console.info(
      bold(
        `\n# ${drift.installedPath} (cannot read the locked commit ${short(drift.baselineCommit)}; ` +
          `run \`git -C "$NEWBIE_MODULES_PATH" fetch origin ${drift.baselineCommit ?? "<sha>"}\`)`,
      ),
    );
    return;
  }
  if (drift.reason === "copy-modified") {
    console.info(bold(`\n# ${drift.installedPath} (copy differs from its provenance lock)`));
  } else if (drift.reason === "lock-tampered") {
    console.info(
      bold(
        `\n# ${drift.installedPath} (lock manifest differs from ${drift.registryPath} @ ${short(drift.baselineCommit)})`,
      ),
    );
  } else {
    console.info(
      bold(`\n# ${drift.installedPath} (differs from ${drift.registryPath} @ ${short(drift.baselineCommit)})`),
    );
  }
  if (!drift.report) return;
  for (const file of drift.report.added) console.info(`  added: ${file}`);
  for (const file of drift.report.changed) console.info(`  changed: ${file}`);
  for (const file of drift.report.removed) console.info(`  removed: ${file}`);
}
