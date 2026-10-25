import fs from "node:fs/promises";

import { MODULES_DIR } from "@devbie/modules-state";

import { REGISTRY_MODULES_DIR } from "../constants/paths";
import { diffSnapshots, DriftReport } from "../core/drift";
import { snapshotDirectory, snapshotInstalledModule } from "../lib/drift";
import { moduleRootInRegistry } from "../lib/registry";

/**
 * One installed module whose sources do not match the registry checkout.
 *
 * The installed copy under `src/modules/<key>` is registry-owned wholesale
 * (ADR-019: module sources must stay byte-identical to the host copy, the
 * diff-empty back-port rule). This plan is the read-only side of the
 * `assemble --check` drift gate (ADR-021): nothing here can repair the
 * drift, because the fix lives in whichever repository carries the newer
 * version.
 */
export interface ModuleSourceDrift {
  key: string;
  /** Project-relative directory of the installed copy. */
  installedPath: string;
  /** Registry-relative directory the copy is compared against. */
  registryPath: string;
  /** null when the registry checkout does not ship this module at all. */
  report: DriftReport | null;
}

async function isDirectory(dir: string): Promise<boolean> {
  try {
    return (await fs.stat(dir)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Compare every installed module against the registry checkout resolved for
 * this run. The comparison is content-only (file hashes, POSIX-relative
 * paths): empty directories and OS metadata never register as drift, so a
 * checkout that still carries leftovers from an earlier layout stays clean.
 *
 * The baseline is the registry *working tree*, not the `sourceCommit` pinned
 * in modules.json: CI checks out the registry with `--depth 1`, and a
 * hand-copied back-port does not move the pin. `newbie doctor` keeps the
 * pinned-commit comparison for the local "did I patch an installed copy"
 * question.
 */
export async function diffModuleSources(params: {
  cwd: string;
  registryRoot: string;
  enabledKeys: string[];
}): Promise<ModuleSourceDrift[]> {
  const { cwd, registryRoot, enabledKeys } = params;
  const drifts: ModuleSourceDrift[] = [];

  for (const key of enabledKeys) {
    const registryDir = moduleRootInRegistry(registryRoot, key);
    const drift: ModuleSourceDrift = {
      key,
      installedPath: `${MODULES_DIR}/${key}`,
      registryPath: `${REGISTRY_MODULES_DIR}/${key}`,
      report: null,
    };

    if (await isDirectory(registryDir)) {
      const report = diffSnapshots(await snapshotInstalledModule(cwd, key), await snapshotDirectory(registryDir));
      if (report.clean) continue;
      drift.report = report;
    }

    drifts.push(drift);
  }

  return drifts;
}
