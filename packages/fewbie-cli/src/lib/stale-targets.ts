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
 */
export async function findStaleTargets(
  projectRoot: string,
  items: ReadonlyArray<{ name: string; targets: readonly string[] }>,
  lockfile: Lockfile | null,
): Promise<StaleTarget[]> {
  if (lockfile === null) return [];
  const live = new Set(items.flatMap((item) => item.targets));
  const stale: StaleTarget[] = [];
  for (const item of items) {
    const locked = lockfile.modules[item.name]?.files ?? {};
    for (const [target, lockedHash] of Object.entries(locked)) {
      if (live.has(target)) continue;
      const current = await readTextIfExists(path.join(projectRoot, target));
      if (current === null) continue;
      stale.push({ module: item.name, target, pristine: hashContent(current) === lockedHash });
    }
  }
  return stale;
}
