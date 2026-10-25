/**
 * Pure resolution of module-to-module dependencies declared via the
 * `moduleDependencies` manifest field.
 *
 * Enabling a module must transitively enable every module it imports, and a
 * required module must not be removed while a dependent stays enabled. These
 * helpers work on plain `key -> dependency keys` graphs so they can be unit
 * tested without touching the registry or the file system.
 */

export type DependencyGraph = ReadonlyMap<string, readonly string[]>;

export interface MissingModuleDependency {
  module: string;
  dependency: string;
}

export interface ModuleClosure {
  /**
   * Every key required by the roots: roots first (input order, de-duplicated),
   * followed by transitive additions sorted alphabetically for stable output.
   */
  keys: string[];
  /** Transitive dependencies not named directly by the roots. */
  added: string[];
  /** Declared edges whose target module is absent from the graph. */
  missing: MissingModuleDependency[];
}

/**
 * Expand `roots` with their transitive module dependencies.
 *
 * Cycles are tolerated (they are rejected separately by `newbie modules lint`):
 * a visited node is never traversed twice. Unknown roots are kept in `keys`
 * untouched; callers are expected to validate root keys beforehand.
 */
export function expandModuleClosure(rootsInput: readonly string[], graph: DependencyGraph): ModuleClosure {
  const roots = [...new Set(rootsInput)];
  const visited = new Set<string>();
  const missing: MissingModuleDependency[] = [];
  const queue = [...roots];

  while (queue.length > 0) {
    const key = queue.shift()!;
    if (visited.has(key)) continue;
    visited.add(key);
    const deps = graph.get(key);
    if (!deps) continue;
    for (const dep of deps) {
      if (!graph.has(dep)) {
        if (!missing.some((item) => item.module === key && item.dependency === dep)) {
          missing.push({ module: key, dependency: dep });
        }
        continue;
      }
      if (!visited.has(dep)) queue.push(dep);
    }
  }

  const rootSet = new Set(roots);
  const added = [...visited].filter((key) => !rootSet.has(key)).sort();
  const keys = [...roots, ...added];
  return { keys, added, missing };
}

/** Modules declaring `target` as a dependency, optionally restricted to a set. */
export function directDependents(target: string, graph: DependencyGraph, among?: ReadonlySet<string>): string[] {
  const result: string[] = [];
  for (const [key, deps] of graph) {
    if (among && !among.has(key)) continue;
    if (deps.includes(target)) result.push(key);
  }
  return result.sort();
}

export interface RemovalBlock {
  /** Module the user asked to remove. */
  key: string;
  /** Enabled modules (within the closure of the kept set) that still need it. */
  requiredBy: string[];
}

/**
 * Find removal requests that would break a still-enabled dependent.
 * The check is performed against the transitive closure of the kept roots, so
 * a dependency required only indirectly (kept -> A -> target) is caught too.
 */
export function findRemovalBlocks(
  removed: readonly string[],
  keptRoots: readonly string[],
  graph: DependencyGraph,
): RemovalBlock[] {
  const closure = expandModuleClosure(keptRoots, graph);
  const among = new Set(closure.keys);
  const blocks: RemovalBlock[] = [];
  for (const key of removed) {
    const requiredBy = directDependents(key, graph, among);
    if (requiredBy.length > 0) blocks.push({ key, requiredBy });
  }
  return blocks.sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Declared dependencies of enabled modules that are not enabled themselves.
 * Used by `newbie doctor` on the copied project manifests.
 */
export function findMissingEnabledModules(
  enabled: readonly string[],
  graph: DependencyGraph,
): MissingModuleDependency[] {
  const enabledSet = new Set(enabled);
  const missing: MissingModuleDependency[] = [];
  for (const key of enabled) {
    const deps = graph.get(key);
    if (!deps) continue;
    for (const dependency of deps) {
      if (!enabledSet.has(dependency)) missing.push({ module: key, dependency });
    }
  }
  return missing;
}
