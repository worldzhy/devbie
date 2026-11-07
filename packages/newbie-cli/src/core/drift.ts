/**
 * Pure directory drift detection.
 *
 * A snapshot maps POSIX-style relative file paths to content hashes. The
 * consuming project module copy is "drifted" when it differs from the
 * pristine registry snapshot it was copied from. Hashing is done by the IO
 * layer (lib/drift.ts); this module only compares snapshots.
 */

export type FileSnapshot = ReadonlyMap<string, string>;

export interface DriftReport {
  /** Present locally but not in the pristine copy. */
  added: string[];
  /** Present in the pristine copy but removed locally. */
  removed: string[];
  /** Present on both sides with different content. */
  changed: string[];
  /** True when the three lists are all empty. */
  clean: boolean;
}

export function diffSnapshots(local: FileSnapshot, pristine: FileSnapshot): DriftReport {
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  for (const [file, hash] of local) {
    if (!pristine.has(file)) {
      added.push(file);
    } else if (pristine.get(file) !== hash) {
      changed.push(file);
    }
  }
  for (const file of pristine.keys()) {
    if (!local.has(file)) removed.push(file);
  }

  added.sort();
  removed.sort();
  changed.sort();
  return {
    added,
    removed,
    changed,
    clean: added.length === 0 && removed.length === 0 && changed.length === 0,
  };
}

/** Stable identifier list usable as the newbie-modules.json `localPatches` entries. */
export function driftPatchIds(report: DriftReport): string[] {
  return [...report.added, ...report.changed, ...report.removed].sort();
}
