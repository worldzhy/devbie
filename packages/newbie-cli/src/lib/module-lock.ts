import fs from "node:fs/promises";
import path from "node:path";

import { MODULE_LOCK_FILE } from "@devbie/modules-state";

import { CliError } from "@devbie/cli-kit";
import { emptyModuleLock, ModuleLock, normalizeModuleLock, sortModuleLock } from "../core/module-lock";
import { Sink } from "./sink";

/** Read the provenance lock; null when the project has none yet (ADR-041). */
export async function readModuleLock(cwd: string): Promise<ModuleLock | null> {
  const file = path.resolve(cwd, MODULE_LOCK_FILE);
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  try {
    return normalizeModuleLock(JSON.parse(raw));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new CliError(`Invalid JSON in ${MODULE_LOCK_FILE}: ${error.message}`);
    }
    throw error;
  }
}

/** Same as `readModuleLock`, but an absent file reads as an empty lock. */
export async function readModuleLockOrDefault(cwd: string): Promise<ModuleLock> {
  return (await readModuleLock(cwd)) ?? emptyModuleLock();
}

/** The lock is CLI-owned; every mutation goes through this writer. */
export async function writeModuleLock(cwd: string, sink: Sink, lock: ModuleLock): Promise<void> {
  await sink.writeJson(MODULE_LOCK_FILE, sortModuleLock(lock));
}
