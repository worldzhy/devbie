import fs from "node:fs/promises";
import path from "node:path";

import {
  MODULES_DIR,
  MODULE_LOCK_FILE,
  MODULE_MANIFEST_FILE,
  ModulesState,
  readModulesState,
} from "@devbie/modules-state";

/**
 * Runtime module snapshot reader for the module-hub reporter.
 *
 * The CLI's `newbie status --json` is the canonical source for the module
 * inventory shape, but the running process cannot invoke the CLI. This module
 * reads the project-root `newbie-modules.json` via the shared `@devbie/modules-state`
 * package, pairs each key with its `newbie-modules.lock.json` entry (ADR-041:
 * the lock owns per-module provenance) and enriches the entry with disk probes:
 *   - whether the module directory exists under `src/modules/`
 *   - whether the installed module's `newbie.module.json` declares a Prisma
 *     schema fragment
 *
 * Fields that require CLI-only capabilities (registry comparison for
 * `updateAvailable`, env validation for `missingEnv`, pristine diff for
 * `drift`) are intentionally omitted — the hub stores the snapshot verbatim
 * and the host can recompute them if needed.
 */

/**
 * One entry in the module snapshot, matching the shape of
 * `newbie status --json` modules[] (subset — see file docstring).
 */
export interface ModuleSnapshotEntry {
  key: string;
  version: string | null;
  sourceCommit: string | null;
  installed: boolean;
  hasSchema: boolean;
}

/**
 * Minimal, tolerant read of the lock's per-module identity. The CLI owns the
 * schema and validation; the snapshot only needs `key` -> version/commit.
 */
async function readLockedIdentities(
  projectRoot: string,
): Promise<Map<string, { version: string | null; sourceCommit: string | null }>> {
  const identities = new Map<string, { version: string | null; sourceCommit: string | null }>();
  let raw: string;
  try {
    raw = await fs.readFile(path.resolve(projectRoot, MODULE_LOCK_FILE), "utf8");
  } catch {
    return identities;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return identities;
  }
  const modules = (parsed as { modules?: unknown } | null)?.modules;
  if (!Array.isArray(modules)) return identities;
  for (const entry of modules) {
    if (!entry || typeof entry !== "object") continue;
    const key = (entry as { key?: unknown }).key;
    if (typeof key !== "string" || key.length === 0) continue;
    const version = (entry as { version?: unknown }).version;
    const sourceCommit = (entry as { sourceCommit?: unknown }).sourceCommit;
    identities.set(key, {
      version: typeof version === "string" ? version : null,
      sourceCommit: typeof sourceCommit === "string" ? sourceCommit : null,
    });
  }
  return identities;
}

/**
 * Read the project's `newbie-modules.json` and produce a snapshot array in the same
 * shape as `newbie status --json` modules[] entries.
 *
 * Returns an empty array when `newbie-modules.json` is absent or unparseable — the
 * caller (reporter) still sends a `kind="full"` report, just without a module
 * list. This keeps the self-registration path resilient: a project that hasn't
 * been assembled via the CLI can still register its installation.
 */
export async function readModuleSnapshot(projectRoot: string): Promise<ModuleSnapshotEntry[]> {
  let state: ModulesState;
  try {
    state = await readModulesState(projectRoot);
  } catch {
    return [];
  }

  const entries: ModuleSnapshotEntry[] = [];
  const identities = await readLockedIdentities(projectRoot);

  for (const record of state.modules) {
    const moduleDir = path.resolve(projectRoot, MODULES_DIR, record.key);
    let installed = false;
    let hasSchema = false;

    try {
      await fs.stat(moduleDir);
      installed = true;
    } catch {
      installed = false;
    }

    if (installed) {
      try {
        const manifestRaw = await fs.readFile(path.join(moduleDir, MODULE_MANIFEST_FILE), "utf8");
        const manifest = JSON.parse(manifestRaw) as { wiring?: { prismaSchema?: unknown } };
        hasSchema = typeof manifest.wiring?.prismaSchema === "string";
      } catch {
        hasSchema = false;
      }
    }

    const identity = identities.get(record.key);
    entries.push({
      key: record.key,
      version: identity?.version ?? null,
      sourceCommit: identity?.sourceCommit ?? null,
      installed,
      hasSchema,
    });
  }

  return entries;
}
