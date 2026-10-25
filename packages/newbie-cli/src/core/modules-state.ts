/**
 * CLI-side planning operations on the module list. The state shape,
 * normalization, and file IO live in `@devbie/modules-state` (shared with the
 * runtime module-hub reporter); this module only keeps the enable/disable
 * planning helpers that no other consumer needs.
 */

import { ModuleRecord, ModulesState } from "@devbie/modules-state";

export interface EnabledDiff {
  /** Keys present in `next` but not in `current`. */
  added: string[];
  /** Keys present in `current` but not in `next`. */
  removed: string[];
}

export function diffModuleKeys(current: string[], next: string[]): EnabledDiff {
  const currentSet = new Set(current);
  const nextSet = new Set(next);
  return {
    added: next.filter((key) => !currentSet.has(key)),
    removed: current.filter((key) => !nextSet.has(key)),
  };
}

/**
 * Produce the next state after changing the enabled module list.
 * Existing records of retained modules are preserved (pins/localPatches);
 * new keys get empty records that the assemble step fills with the registry
 * sourceCommit; removed modules drop their records entirely.
 */
export function withModuleKeys(state: ModulesState, nextKeys: string[]): ModulesState {
  const byKey = new Map(state.modules.map((record) => [record.key, record]));
  const seen = new Set<string>();
  const modules: ModuleRecord[] = [];
  for (const key of nextKeys) {
    if (seen.has(key)) continue;
    seen.add(key);
    modules.push(
      byKey.get(key) ?? {
        key,
        version: null,
        sourceCommit: null,
        localPatches: [],
      },
    );
  }
  return { ...state, modules };
}
