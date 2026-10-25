import fs from "node:fs/promises";
import path from "node:path";

import { MODULES_DIR, MODULE_MANIFEST_FILE, ModulesState, readModulesState } from "@devbie/modules-state";

/**
 * Runtime module snapshot reader for the module-hub reporter.
 *
 * The CLI's `newbie status --json` is the canonical source for the module
 * inventory shape, but the running process cannot invoke the CLI. This module
 * reads the project-root `modules.json` via the shared `@devbie/modules-state`
 * package and enriches each record with disk probes:
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
  localPatches: string[];
  installed: boolean;
  hasSchema: boolean;
}

/**
 * Read the project's `modules.json` and produce a snapshot array in the same
 * shape as `newbie status --json` modules[] entries.
 *
 * Returns an empty array when `modules.json` is absent or unparseable — the
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
        const manifest = JSON.parse(manifestRaw) as { schema?: unknown };
        hasSchema = typeof manifest.schema === "string";
      } catch {
        hasSchema = false;
      }
    }

    entries.push({
      key: record.key,
      version: record.version,
      sourceCommit: record.sourceCommit,
      localPatches: record.localPatches,
      installed,
      hasSchema,
    });
  }

  return entries;
}
