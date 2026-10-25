import type { ModuleRecord } from "@devbie/modules-state";

import type { RemoteModule } from "./client";

/**
 * Pure comparison between the locally assembled module set and the snapshot
 * the hub recorded for this installation.
 *
 * This is the remote counterpart of `newbie status`: it answers "does the
 * hub's view of this deployment match the modules.json I have on disk?", not
 * "did the host's target spec land?" — the latter is the hub's own
 * target-vs-actual view and is already rendered by the UI.
 */

export type MismatchReason =
  /** Enabled locally but absent from the hub snapshot. */
  | "missing-on-hub"
  /** Recorded by the hub but no longer in the local modules.json. */
  | "missing-locally"
  /** Same module, different registry commit — the deployment lags the assembly. */
  | "source-commit-differs";

export interface ModuleMismatch {
  key: string;
  reason: MismatchReason;
  localSourceCommit?: string | null;
  remoteSourceCommit?: string | null;
}

function readRecord(module: RemoteModule): { key: string; sourceCommit: string | null } | null {
  const key = module.key;
  if (typeof key !== "string" || key.length === 0) return null;
  const sourceCommit = typeof module.sourceCommit === "string" ? module.sourceCommit : null;
  return { key, sourceCommit };
}

/**
 * Compare local records with the hub snapshot.
 *
 * `source-commit-differs` is only reported when both sides carry a commit:
 * a null on either side means the snapshot predates the field, which is not
 * evidence of drift and would otherwise fail verify for old deployments.
 */
export function compareModules(local: ModuleRecord[], remote: RemoteModule[]): ModuleMismatch[] {
  const localByKey = new Map(local.map((record) => [record.key, record]));
  const remoteByKey = new Map<string, { key: string; sourceCommit: string | null }>();
  for (const entry of remote) {
    const record = readRecord(entry);
    if (record) remoteByKey.set(record.key, record);
  }

  const mismatches: ModuleMismatch[] = [];

  for (const record of local) {
    const remoteRecord = remoteByKey.get(record.key);
    if (!remoteRecord) {
      mismatches.push({ key: record.key, reason: "missing-on-hub", localSourceCommit: record.sourceCommit });
      continue;
    }
    if (
      record.sourceCommit !== null &&
      remoteRecord.sourceCommit !== null &&
      record.sourceCommit !== remoteRecord.sourceCommit
    ) {
      mismatches.push({
        key: record.key,
        reason: "source-commit-differs",
        localSourceCommit: record.sourceCommit,
        remoteSourceCommit: remoteRecord.sourceCommit,
      });
    }
  }

  for (const key of remoteByKey.keys()) {
    if (!localByKey.has(key)) {
      mismatches.push({ key, reason: "missing-locally", remoteSourceCommit: remoteByKey.get(key)?.sourceCommit });
    }
  }

  return mismatches.sort((left, right) => left.key.localeCompare(right.key));
}
