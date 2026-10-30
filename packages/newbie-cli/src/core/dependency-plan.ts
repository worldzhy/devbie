/**
 * Pure dependency planning extracted from the legacy assemble-dependencies:
 * a dependency declared by a removed module is only uninstalled when no other
 * still-enabled module (nor the removal set processed earlier) declares it.
 */

export interface DependencyDecls {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export function planDependencyRemovals(
  removedDeclarations: DependencyDecls[],
  enabledDeclarations: DependencyDecls[],
): { dependencies: string[]; devDependencies: string[] } {
  const keptDependencies = new Set<string>();
  const keptDevDependencies = new Set<string>();

  for (const decl of enabledDeclarations) {
    Object.keys(decl.dependencies ?? {}).forEach((name) => keptDependencies.add(name));
    Object.keys(decl.devDependencies ?? {}).forEach((name) => keptDevDependencies.add(name));
  }

  const removedDependencies = new Set<string>();
  const removedDevDependencies = new Set<string>();

  for (const decl of removedDeclarations) {
    for (const name of Object.keys(decl.dependencies ?? {})) {
      if (!keptDependencies.has(name)) removedDependencies.add(name);
    }
    for (const name of Object.keys(decl.devDependencies ?? {})) {
      if (!keptDevDependencies.has(name)) removedDevDependencies.add(name);
    }
  }

  return {
    dependencies: [...removedDependencies],
    devDependencies: [...removedDevDependencies],
  };
}

/** Build `name@range` install specs from settings declarations. */
export function buildInstallSpecs(decls: DependencyDecls[]): {
  dependencies: string[];
  devDependencies: string[];
} {
  const dependencies: string[] = [];
  const devDependencies: string[] = [];

  for (const decl of decls) {
    for (const [name, range] of Object.entries(decl.dependencies ?? {})) {
      dependencies.push(`${name}@${range}`);
    }
    for (const [name, range] of Object.entries(decl.devDependencies ?? {})) {
      devDependencies.push(`${name}@${range}`);
    }
  }

  return { dependencies, devDependencies };
}

export interface DependencyConflict {
  name: string;
  /** Distinct ranges declared for this dependency across enabled modules. */
  ranges: string[];
}

/**
 * Reconcile the npm dependencies of ALL enabled modules against the
 * project's package.json. Unlike an "added-only" install, this is safe to
 * re-run after an interrupted assembly: a dependency is installed whenever it
 * is declared but missing from package.json, regardless of whether this run
 * newly added the owning module.
 *
 * Distinct ranges declared for the same package are returned as conflicts
 * (the first range in sorted order is used for the install spec) so the CLI
 * can surface them instead of letting npm pick a silent winner.
 */
export function planDependencyInstalls(
  enabledDeclarations: DependencyDecls[],
  installed: DependencyDecls,
): {
  dependencies: string[];
  devDependencies: string[];
  conflicts: DependencyConflict[];
} {
  const mergeDecls = (
    pick: (decl: DependencyDecls) => Record<string, string> | undefined,
    otherKind: Record<string, string> | undefined,
  ) => {
    // name -> declared ranges (insertion order preserved, de-duplicated).
    const ranges = new Map<string, Set<string>>();
    for (const decl of enabledDeclarations) {
      for (const [name, range] of Object.entries(pick(decl) ?? {})) {
        if (!ranges.has(name)) ranges.set(name, new Set<string>());
        ranges.get(name)!.add(range);
      }
    }

    // A package declared under either dependency kind counts as present.
    const present = new Set([...Object.keys(pick(installed) ?? {}), ...Object.keys(otherKind ?? {})]);

    const specs: string[] = [];
    const conflicts: DependencyConflict[] = [];
    for (const [name, declared] of ranges) {
      const ordered = [...declared].sort();
      if (ordered.length > 1) conflicts.push({ name, ranges: ordered });
      if (!present.has(name)) specs.push(`${name}@${ordered[0]}`);
    }
    return { specs, conflicts };
  };

  const deps = mergeDecls((decl) => decl.dependencies, installed.devDependencies);
  const devDeps = mergeDecls((decl) => decl.devDependencies, installed.dependencies);

  return {
    dependencies: deps.specs,
    devDependencies: devDeps.specs,
    conflicts: [...deps.conflicts, ...devDeps.conflicts],
  };
}
