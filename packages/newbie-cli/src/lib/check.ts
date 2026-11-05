import fs from "node:fs/promises";
import path from "node:path";

import { envValues, parseEnv } from "../core/env-file";
import { ENV_PATH } from "../constants/paths";
import { readInstalledManifest } from "./module-install";

/**
 * Collect missing .env variables per installed module.
 * Returns a map moduleKey -> missing keys. Empty map means everything is set.
 */
export async function collectMissingEnv(cwd: string, enabledKeys: string[]): Promise<Record<string, string[]>> {
  let raw = "";
  try {
    raw = await fs.readFile(path.resolve(cwd, ENV_PATH), "utf8");
  } catch {
    // Missing .env: every required variable is missing.
  }
  const present = new Set(Object.keys(envValues(parseEnv(raw))));

  const missing: Record<string, string[]> = {};

  for (const key of enabledKeys) {
    const manifest = await readInstalledManifest(cwd, key);
    if (!manifest?.requires?.env) continue;

    const absent = Object.keys(manifest.requires.env).filter((envKey) => !present.has(envKey));
    if (absent.length > 0) missing[key] = absent;
  }

  return missing;
}
