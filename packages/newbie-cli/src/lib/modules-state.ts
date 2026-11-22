import fs from "node:fs/promises";
import path from "node:path";

import {
  createEmptyModulesState,
  MODULES_JSON,
  ModulesState,
  readModulesState as readSharedModulesState,
} from "@devbie/modules-state";

import { CliError } from "@devbie/cli-kit";
import { Sink } from "./sink";

export async function stateExists(cwd: string): Promise<boolean> {
  try {
    await fs.stat(path.resolve(cwd, MODULES_JSON));
    return true;
  } catch {
    return false;
  }
}

export async function readModulesState(cwd: string): Promise<ModulesState> {
  try {
    return await readSharedModulesState(cwd);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new CliError(`Invalid JSON in ${MODULES_JSON}: ${error.message}`);
    }
    throw error;
  }
}

/** Create an empty newbie-modules.json on first use. */
export async function ensureModulesState(cwd: string, sink: Sink): Promise<void> {
  if (await stateExists(cwd)) return;
  await sink.writeJson(MODULES_JSON, createEmptyModulesState());
}

export async function writeModulesState(cwd: string, sink: Sink, state: ModulesState): Promise<void> {
  await sink.writeJson(MODULES_JSON, state);
}

/**
 * Read the per-module pins an older CLI wrote into `newbie-modules.json`
 * (ADR-041 §6 migration): they are the only baseline available when the
 * project has no lock yet, so `modules apply` uses them once to verify the
 * existing copies before dropping the field on the next write.
 *
 * Tolerant by design: absent/malformed files yield no pins, and the caller
 * falls back to "unverifiable".
 */
export async function readLegacyModulePins(cwd: string): Promise<Map<string, string>> {
  const pins = new Map<string, string>();
  let raw: string;
  try {
    raw = await fs.readFile(path.resolve(cwd, MODULES_JSON), "utf8");
  } catch {
    return pins;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return pins;
  }
  const modules = (parsed as { modules?: unknown } | null)?.modules;
  if (!Array.isArray(modules)) return pins;
  for (const entry of modules) {
    if (!entry || typeof entry !== "object") continue;
    const key = (entry as { key?: unknown }).key;
    const commit = (entry as { sourceCommit?: unknown }).sourceCommit;
    if (typeof key === "string" && key.length > 0 && typeof commit === "string" && commit.length > 0) {
      pins.set(key, commit);
    }
  }
  return pins;
}
