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

/** Create an empty modules.json on first use. */
export async function ensureModulesState(cwd: string, sink: Sink): Promise<void> {
  if (await stateExists(cwd)) return;
  await sink.writeJson(MODULES_JSON, createEmptyModulesState());
}

export async function writeModulesState(cwd: string, sink: Sink, state: ModulesState): Promise<void> {
  await sink.writeJson(MODULES_JSON, state);
}
