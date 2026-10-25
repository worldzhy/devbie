import fs from "node:fs/promises";
import path from "node:path";

import { CliError } from "@devbie/cli-kit";

/** Declaration file that lists the registry modules a project enables. */
export const MODULES_FILE = "fewbie.json";

interface ModulesFile {
  modules?: unknown;
}

/** Declared module names, sorted; null when the declaration file is absent. */
export async function readModulesFile(projectRoot: string): Promise<string[] | null> {
  const target = path.join(projectRoot, MODULES_FILE);
  let raw: string;
  try {
    raw = await fs.readFile(target, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }

  let parsed: ModulesFile;
  try {
    parsed = JSON.parse(raw) as ModulesFile;
  } catch (error) {
    throw new CliError(`Invalid JSON in ${MODULES_FILE}: ${(error as Error).message}`);
  }

  const names = parsed.modules;
  if (!Array.isArray(names) || names.some((name) => typeof name !== "string")) {
    throw new CliError(`${MODULES_FILE} must be an object of the form { "modules": ["name", ...] }.`);
  }
  return normalizeNames(names as string[]);
}

/** Declared modules; throws when the declaration file is absent. */
export async function requireModulesFile(projectRoot: string): Promise<string[]> {
  const declared = await readModulesFile(projectRoot);
  if (declared === null) {
    throw new CliError(
      `No ${MODULES_FILE} found in ${projectRoot}. Run 'fewbie create' or add { "modules": [] } to the project root.`,
    );
  }
  return declared;
}

/** Deterministic declaration content: deduplicated and sorted. */
export function modulesFileContent(names: string[]): string {
  return `${JSON.stringify({ modules: normalizeNames(names) }, null, 2)}\n`;
}

export async function writeModulesFile(projectRoot: string, names: string[]): Promise<void> {
  await fs.writeFile(path.join(projectRoot, MODULES_FILE), modulesFileContent(names));
}

function normalizeNames(names: string[]): string[] {
  return [...new Set(names)].sort();
}
