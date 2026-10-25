import path from "node:path";

import { MODULES_DIR, moduleKeys } from "@devbie/modules-state";

import { DriftReport } from "../core/drift";
import { diffSnapshots } from "../core/drift";
import { collectMissingEnv } from "../lib/check";
import { snapshotInstalledModule, snapshotPristineModule } from "../lib/drift";
import { fileExists } from "@devbie/cli-kit";
import { readInstalledManifest } from "../lib/module-install";
import { readModulesState } from "../lib/modules-state";
import { resolveRegistry } from "../lib/registry";

import { GlobalOptions } from "./shared";

export interface StatusModuleEntry {
  key: string;
  version: string | null;
  sourceCommit: string | null;
  localPatches: string[];
  installed: boolean;
  hasSchema: boolean;
  missingEnv: string[];
  updateAvailable: boolean;
  drift?: DriftReport;
}

/** Machine-readable project state. */
export interface StatusReport {
  cwd: string;
  registry: { available: true; local: boolean; path: string; sourceCommit: string | null } | { available: false };
  modules: StatusModuleEntry[];
}

/**
 * Collect the project state without printing anything. Never mutates anything
 * and never touches the network.
 */
export async function collectStatus(cwd: string, options?: { drift?: boolean }): Promise<StatusReport> {
  const state = await readModulesState(cwd);
  const registry = await resolveRegistry({ fetch: false });
  const keys = moduleKeys(state);
  const missingEnv = await collectMissingEnv(cwd, keys);
  const modules: StatusModuleEntry[] = [];
  for (const record of state.modules) {
    const key = record.key;
    const installed = await fileExists(cwd, `${MODULES_DIR}/${key}`);
    const manifest = installed ? await readInstalledManifest(cwd, key) : null;

    const entry: StatusModuleEntry = {
      key,
      version: record.version,
      sourceCommit: record.sourceCommit,
      localPatches: record.localPatches,
      installed,
      hasSchema: Boolean(manifest?.schema),
      missingEnv: missingEnv[key] ?? [],
      updateAvailable: Boolean(
        registry?.sourceCommit && record.sourceCommit && registry.sourceCommit !== record.sourceCommit,
      ),
    };

    if (options?.drift && installed && registry && record.sourceCommit) {
      const pristine = await snapshotPristineModule(registry, key, record.sourceCommit);
      if (pristine) {
        entry.drift = diffSnapshots(await snapshotInstalledModule(cwd, key), pristine);
      }
    }

    modules.push(entry);
  }

  return {
    cwd,
    registry: registry
      ? {
          available: true,
          local: registry.local,
          path: registry.root,
          sourceCommit: registry.sourceCommit,
        }
      : { available: false },
    modules,
  };
}

/**
 * Machine-readable project state for scripts and CI.
 * This command never mutates anything and never touches the network.
 */
export async function runStatus(options: GlobalOptions & { drift?: boolean }): Promise<void> {
  const report = await collectStatus(path.resolve(options.cwd), { drift: options.drift });
  console.info(JSON.stringify(report, null, 2));
}
