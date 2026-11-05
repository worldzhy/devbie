import { expandModuleClosure } from "../core/module-closure";
import { readRegistryModule } from "../lib/registry";

export interface RegistryClosure {
  /** Roots plus every transitive module dependency (roots first, additions sorted). */
  keys: string[];
  /** Transitive dependencies the roots did not name directly. */
  added: string[];
  /** Visited manifest dependency edges, keyed by module key. */
  graph: Map<string, string[]>;
  /** Module keys that could not be found in the registry (roots or edge targets). */
  missingModules: string[];
  /** Declared edges pointing at a missing module. */
  missingEdges: { module: string; dependency: string }[];
}

/**
 * Walk the registry starting at `roots`, following `moduleDependencies`
 * declarations, and return the transitive closure.
 *
 * Keys in `satisfied` name already-enabled modules whose own dependencies are
 * assumed present (targeted updates): they are neither traversed nor reported
 * as additions.
 */
export async function expandRegistryClosure(
  registryRoot: string,
  rootsInput: readonly string[],
  options: { satisfied?: ReadonlySet<string> } = {},
): Promise<RegistryClosure> {
  const satisfied = options.satisfied ?? new Set<string>();
  const roots = [...new Set(rootsInput)].filter((key) => !satisfied.has(key));
  const graph = new Map<string, string[]>();
  const missingModules = new Set<string>();
  const visited = new Set<string>();
  const queue = [...roots];

  while (queue.length > 0) {
    const key = queue.shift()!;
    if (visited.has(key)) continue;
    visited.add(key);
    const resolved = await readRegistryModule(registryRoot, key);
    if (!resolved) {
      missingModules.add(key);
      continue;
    }
    const deps = resolved.manifest.requires?.modules ?? [];
    graph.set(key, deps);
    for (const dep of deps) {
      if (!satisfied.has(dep) && !visited.has(dep)) queue.push(dep);
    }
  }

  const closure = expandModuleClosure(roots, graph);
  for (const edge of closure.missing) missingModules.add(edge.dependency);

  return {
    keys: closure.keys,
    added: closure.added,
    graph,
    missingModules: [...missingModules].sort(),
    missingEdges: closure.missing,
  };
}

/** Human-readable lines explaining why a closure cannot be satisfied. */
export function describeMissingDependencies(closure: RegistryClosure): string[] {
  const lines = closure.missingEdges.map(
    ({ module, dependency }) => `module '${module}' depends on missing registry module '${dependency}'`,
  );
  const edgeTargets = new Set(closure.missingEdges.map((edge) => edge.dependency));
  for (const key of closure.missingModules) {
    if (!edgeTargets.has(key)) lines.push(`module '${key}' is not present in the registry`);
  }
  return lines.sort();
}
