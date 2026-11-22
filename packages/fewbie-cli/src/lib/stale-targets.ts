import path from "node:path";

import { readTextIfExists } from "@devbie/cli-kit";

import { hashContent } from "./hashes";
import type { Lockfile } from "./lockfile";

/**
 * A file the lockfile still attributes to a declared module, but which the
 * module's manifest no longer ships (the registry renamed or deleted it).
 *
 * `apply` and `update` both need this: neither one iterates the manifest for
 * these paths, so without an explicit scan a renamed target is left on disk
 * forever while the gates stay green (R82-08).
 */
export interface StaleTarget {
  /** Declared module whose lockfile entry still names the target. */
  module: string;
  /** Project-relative path. */
  target: string;
  /** True when the bytes on disk still match the locked baseline. */
  pristine: boolean;
}

/**
 * Locked targets that no declared module claims any more. Files missing from
 * disk are not reported: there is nothing to clean up. A target claimed by any
 * declared module is live, even when a different module used to own it.
 *
 * `declaredNames` covers the case where `items` is a subset (a scoped
 * `modules update`): lockfile modules outside it are orphans from a declaration
 * that was edited by hand, and their files would otherwise never be reported
 * (R83-12). Omitting it treats every lockfile module as declared.
 */
export async function findStaleTargets(
  projectRoot: string,
  items: ReadonlyArray<{ name: string; targets: readonly string[] }>,
  lockfile: Lockfile | null,
  declaredNames?: readonly string[],
): Promise<StaleTarget[]> {
  if (lockfile === null) return [];
  const live = new Set(items.flatMap((item) => item.targets));
  const declared = new Set(declaredNames ?? items.map((item) => item.name));
  const entries = [
    ...items.map((item) => ({ name: item.name, locked: lockfile.modules[item.name]?.files ?? {} })),
    ...Object.entries(lockfile.modules)
      .filter(([name]) => !declared.has(name))
      .map(([name, entry]) => ({ name, locked: entry.files })),
  ];
  const stale: StaleTarget[] = [];
  for (const entry of entries) {
    for (const [target, lockedHash] of Object.entries(entry.locked)) {
      if (live.has(target)) continue;
      const current = await readTextIfExists(path.join(projectRoot, target));
      if (current === null) continue;
      stale.push({ module: entry.name, target, pristine: hashContent(current) === lockedHash });
    }
  }
  return stale;
}
