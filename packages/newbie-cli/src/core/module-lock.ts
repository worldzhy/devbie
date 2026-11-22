/**
 * Provenance lock (ADR-041): the installed copy must prove itself against a
 * content manifest written at install time, so the drift gate does not depend
 * on the registry checkout still carrying the pinned commit.
 *
 * The lock is machine-owned: only the CLI writes it. The gate compares the
 * installed copy with `files` (`copy-modified`) and `files` with the registry
 * tree at `sourceCommit` (`lock-tampered`).
 */

import { CliError } from "@devbie/cli-kit";
import { MODULE_LOCK_FILE } from "@devbie/modules-state";

import { FileSnapshot } from "./drift";

export const LOCK_VERSION = 1;

export interface ModuleLockEntry {
  key: string;
  /** Recorded identity only; null until per-module tags exist (ADR-041). */
  version: string | null;
  /** Registry commit the file manifest was taken from. */
  sourceCommit: string;
  /** POSIX-relative path -> SHA-256 of the copied file. */
  files: Record<string, string>;
}

export interface ModuleLock {
  lockVersion: number;
  modules: ModuleLockEntry[];
}

export function emptyModuleLock(): ModuleLock {
  return { lockVersion: LOCK_VERSION, modules: [] };
}

function assertLockEntry(key: string, entry: unknown): ModuleLockEntry {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    throw new CliError(`Invalid ${MODULE_LOCK_FILE}: entry '${key}' must be an object.`);
  }
  const raw = entry as Record<string, unknown>;
  if (raw.key !== key) {
    throw new CliError(`Invalid ${MODULE_LOCK_FILE}: entry '${key}' declares key '${String(raw.key)}'.`);
  }
  if (typeof raw.sourceCommit !== "string" || raw.sourceCommit === "") {
    throw new CliError(`Invalid ${MODULE_LOCK_FILE}: entry '${key}' needs a non-empty sourceCommit.`);
  }
  if (raw.version !== undefined && raw.version !== null && typeof raw.version !== "string") {
    throw new CliError(`Invalid ${MODULE_LOCK_FILE}: entry '${key}' has a non-string version.`);
  }
  if (raw.files === null || typeof raw.files !== "object" || Array.isArray(raw.files)) {
    throw new CliError(`Invalid ${MODULE_LOCK_FILE}: entry '${key}' needs a files object.`);
  }
  const files: Record<string, string> = {};
  for (const [file, hash] of Object.entries(raw.files as Record<string, unknown>)) {
    if (typeof hash !== "string" || hash === "") {
      throw new CliError(`Invalid ${MODULE_LOCK_FILE}: entry '${key}' has a non-string hash for '${file}'.`);
    }
    files[file] = hash;
  }
  return { key, version: (raw.version as string | null | undefined) ?? null, sourceCommit: raw.sourceCommit, files };
}

/** Validate the on-disk shape; duplicates and stray keys fail closed. */
export function normalizeModuleLock(raw: unknown): ModuleLock {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new CliError(`Invalid ${MODULE_LOCK_FILE}: expected an object.`);
  }
  const data = raw as Record<string, unknown>;
  if (data.lockVersion !== LOCK_VERSION) {
    throw new CliError(
      `Unsupported ${MODULE_LOCK_FILE} lockVersion '${String(data.lockVersion)}'; expected ${LOCK_VERSION}.`,
    );
  }
  if (!Array.isArray(data.modules)) {
    throw new CliError(`Invalid ${MODULE_LOCK_FILE}: 'modules' must be an array.`);
  }
  const modules: ModuleLockEntry[] = [];
  const seen = new Set<string>();
  for (const entry of data.modules) {
    const key = (entry as Record<string, unknown> | null)?.key;
    if (typeof key !== "string" || key === "") {
      throw new CliError(`Invalid ${MODULE_LOCK_FILE}: every entry needs a non-empty key.`);
    }
    if (seen.has(key)) {
      throw new CliError(`Invalid ${MODULE_LOCK_FILE}: duplicate entry for '${key}'.`);
    }
    seen.add(key);
    modules.push(assertLockEntry(key, entry));
  }
  return { lockVersion: LOCK_VERSION, modules };
}

export function lockEntryFor(lock: ModuleLock | null, key: string): ModuleLockEntry | undefined {
  return lock?.modules.find((entry) => entry.key === key);
}

/** Stable lock serialization: entries and file keys sorted. */
export function sortModuleLock(lock: ModuleLock): ModuleLock {
  return {
    lockVersion: LOCK_VERSION,
    modules: [...lock.modules]
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((entry) => ({
        ...entry,
        files: Object.fromEntries(Object.entries(entry.files).sort(([a], [b]) => a.localeCompare(b))),
      })),
  };
}

export function snapshotToFiles(snapshot: FileSnapshot): Record<string, string> {
  return Object.fromEntries([...snapshot.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

export function filesToSnapshot(files: Record<string, string>): FileSnapshot {
  return new Map(Object.entries(files));
}
