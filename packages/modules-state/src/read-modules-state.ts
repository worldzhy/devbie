import fs from "node:fs/promises";
import path from "node:path";

import { createEmptyModulesState, ModulesState, normalizeModulesState } from "./modules-state";
import { MODULES_JSON } from "./paths";

/**
 * Read and normalize the project-root `modules.json`.
 *
 * Returns an empty state when the file does not exist. Invalid JSON surfaces
 * as the raw `SyntaxError` from `JSON.parse` — callers decide how to present
 * it (the CLI wraps it in a CliError; the runtime reporter treats it as an
 * empty snapshot).
 */
export async function readModulesState(cwd: string): Promise<ModulesState> {
  const target = path.resolve(cwd, MODULES_JSON);
  let content: string;
  try {
    content = await fs.readFile(target, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return createEmptyModulesState();
    }
    throw error;
  }

  return normalizeModulesState(JSON.parse(content));
}
