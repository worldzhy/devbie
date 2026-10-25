import fs from "node:fs/promises";
import path from "node:path";

import { MODULES_DIR, MODULE_MANIFEST_FILE } from "@devbie/modules-state";

import { ModuleManifest, normalizeModuleManifest } from "../core/module-manifest";
import { CliError } from "./errors";

export function installedModuleDir(cwd: string, key: string): string {
  return path.resolve(cwd, MODULES_DIR, key);
}

/**
 * Read the manifest of a module already copied into the project.
 * Returns null when the module directory or manifest does not exist (e.g.
 * during a dry run where copies are only planned).
 */
export async function readInstalledManifest(cwd: string, key: string): Promise<ModuleManifest | null> {
  const file = path.join(installedModuleDir(cwd, key), MODULE_MANIFEST_FILE);
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  try {
    return normalizeModuleManifest(JSON.parse(raw), key);
  } catch (error) {
    throw new CliError(
      `Invalid ${path.posix.join(MODULES_DIR, key, MODULE_MANIFEST_FILE)}: ${(error as Error).message}`,
    );
  }
}

/** Absolute path of a module's Prisma fragment, or null when it has none. */
export function installedSchemaPath(cwd: string, key: string, manifest: ModuleManifest): string | null {
  if (!manifest.schema) return null;
  return path.join(installedModuleDir(cwd, key), manifest.schema);
}

/** Read the Prisma fragment; null means absent (missing file or no schema). */
export async function readInstalledSchema(cwd: string, key: string, manifest: ModuleManifest): Promise<string | null> {
  const file = installedSchemaPath(cwd, key, manifest);
  if (!file) return null;
  try {
    return await fs.readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
