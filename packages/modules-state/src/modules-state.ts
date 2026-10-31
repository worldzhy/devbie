/**
 * Pure operations on the project-root `modules.json` install manifest.
 *
 * Shape (registry-copy model):
 * {
 *   "registry": { "url": "...", "sourceCommit": "<sha>" },
 *   "modules": [
 *     { "key": "account", "version": null, "sourceCommit": "<sha>",
 *       "localPatches": [] }
 *   ]
 * }
 *
 * This module never touches the disk; see read-modules-state.ts for file IO.
 */

export interface ModuleRecord {
  key: string;
  /** Per-module version (changeset/directory tag); null until tags exist. */
  version: string | null;
  /** Registry commit the module files were copied from. */
  sourceCommit: string | null;
  /** Recorded drift (patch-ids); managed by `newbie doctor`. */
  localPatches: string[];
}

/**
 * npm packages the CLI installed on behalf of modules. Only names recorded
 * here may be uninstalled when their owning module is removed: a dependency
 * the host already declared (or added by hand) stays untouched.
 */
export interface ManagedDependencies {
  dependencies: string[];
  devDependencies: string[];
}

export interface ModulesState {
  registry: {
    url?: string;
    ref?: string | null;
    sourceCommit?: string | null;
  } | null;
  modules: ModuleRecord[];
  managedDependencies?: ManagedDependencies;
  [key: string]: unknown;
}

export function createEmptyModulesState(): ModulesState {
  return { registry: null, modules: [] };
}

function normalizeRecord(raw: unknown): ModuleRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.key !== "string" || record.key.length === 0) return null;
  const sourceCommit = typeof record.sourceCommit === "string" ? record.sourceCommit : null;
  const version = typeof record.version === "string" ? record.version : null;
  const localPatches = Array.isArray(record.localPatches)
    ? record.localPatches.filter((patch): patch is string => typeof patch === "string")
    : [];
  return { key: record.key, version, sourceCommit, localPatches };
}

function normalizeManagedDependencies(raw: unknown): ManagedDependencies | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const record = raw as Record<string, unknown>;
  const strings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  return {
    dependencies: strings(record.dependencies),
    devDependencies: strings(record.devDependencies),
  };
}

export function normalizeModulesState(raw: unknown): ModulesState {
  const data = (raw && typeof raw === "object" ? raw : {}) as Partial<ModulesState>;
  const registryData = data.registry && typeof data.registry === "object" ? data.registry : null;
  const registry = registryData
    ? {
        url: typeof registryData.url === "string" ? registryData.url : undefined,
        ref: typeof registryData.ref === "string" ? registryData.ref : null,
        sourceCommit: typeof registryData.sourceCommit === "string" ? registryData.sourceCommit : null,
      }
    : null;

  const records = Array.isArray(data.modules)
    ? data.modules.map(normalizeRecord).filter((record): record is ModuleRecord => record !== null)
    : [];

  const seen = new Set<string>();
  const modules: ModuleRecord[] = [];
  for (const record of records) {
    if (seen.has(record.key)) continue;
    seen.add(record.key);
    modules.push(record);
  }

  const managedDependencies = normalizeManagedDependencies(data.managedDependencies);

  return {
    ...(data as object),
    registry,
    modules,
    ...(managedDependencies ? { managedDependencies } : {}),
  };
}

export function moduleKeys(state: ModulesState): string[] {
  return state.modules.map((record) => record.key);
}
