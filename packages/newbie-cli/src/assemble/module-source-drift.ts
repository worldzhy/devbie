import { bold } from "colorette";
import { MODULES_DIR, ModulesState } from "@devbie/modules-state";

import { REGISTRY_MODULES_DIR } from "../constants/paths";
import { diffSnapshots, DriftReport } from "../core/drift";
import { snapshotInstalledModule, snapshotPristineModule } from "../lib/drift";
import { RegistryLocation } from "../lib/registry";

/**
 * Why a module has no comparable registry baseline.
 *
 * - `missing-pin`: modules.json carries no `sourceCommit` for the key.
 * - `unavailable-pin`: the local registry clone cannot serve the pinned
 *   commit (shallow clone, pruned history, or the module did not exist yet).
 */
export type ModuleDriftReason = "missing-pin" | "unavailable-pin";

/**
 * One installed module whose sources do not match the registry baseline.
 *
 * The installed copy under `src/modules/<key>` is registry-owned wholesale
 * (ADR-019: module sources must stay byte-identical to the host copy, the
 * diff-empty back-port rule). This plan is the read-only side of the
 * `modules apply --check` / `modules update --check` drift gate (ADR-021,
 * refined by ADR-024): nothing here can repair the drift, because the fix
 * lives in whichever repository carries the newer version.
 */
export interface ModuleSourceDrift {
  key: string;
  /** Project-relative directory of the installed copy. */
  installedPath: string;
  /** Registry-relative directory the copy is compared against. */
  registryPath: string;
  /** `sourceCommit` pin recorded for the installed copy; null when absent. */
  baselineCommit: string | null;
  /** null when the baseline cannot be served (see `reason`). */
  report: DriftReport | null;
  /** Set when `report` is null: why no comparison could run. */
  reason: ModuleDriftReason | null;
}

/**
 * Compare every installed module against the registry tree pinned in
 * modules.json. The comparison is content-only (file hashes, POSIX-relative
 * paths): empty directories and OS metadata never register as drift.
 *
 * The baseline is `sourceCommit` (R5-06/N-2), not the registry working tree:
 * an uncommitted local edit must not change the verdict, and a copy without a
 * pin cannot be verified, so it is reported rather than silently skipped.
 */
export async function diffModuleSources(params: {
  cwd: string;
  registry: RegistryLocation;
  state: ModulesState;
  enabledKeys: string[];
}): Promise<ModuleSourceDrift[]> {
  const { cwd, registry, state, enabledKeys } = params;
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
    // Enabled but not assembled: `modules apply --check` owns that signal,
    // and an absent copy is not drift against the registry.
    if (installed === null) continue;

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

const short = (commit: string | null): string => (commit ? commit.slice(0, 7) : "unknown");

/** Print one drift entry; shared by `apply --check` and `update --check`. */
export function printSourceDrift(drift: ModuleSourceDrift): void {
  if (drift.reason === "missing-pin") {
    console.info(bold(`\n# ${drift.installedPath} (no sourceCommit pin in modules.json)`));
    return;
  }
  if (drift.reason === "unavailable-pin") {
    console.info(
      bold(`\n# ${drift.installedPath} (cannot read ${drift.registryPath} at ${short(drift.baselineCommit)})`),
    );
    return;
  }
  console.info(
    bold(`\n# ${drift.installedPath} (differs from ${drift.registryPath} @ ${short(drift.baselineCommit)})`),
  );
  if (!drift.report) return;
  for (const file of drift.report.added) console.info(`  added: ${file}`);
  for (const file of drift.report.changed) console.info(`  changed: ${file}`);
  for (const file of drift.report.removed) console.info(`  removed: ${file}`);
}
