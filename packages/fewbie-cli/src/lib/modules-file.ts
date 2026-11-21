import fs from "node:fs/promises";
import path from "node:path";

import { CliError } from "@devbie/cli-kit";

/** Declaration file that lists the registry modules a project enables. */
export const MODULES_FILE = "fewbie.json";

/** External registry a project installs modules from. */
export interface RegistryDeclaration {
  /** Git URL of the registry repository. */
  url: string;
  /** Branch, tag or commit the CLI checks out; defaults to the remote HEAD. */
  ref?: string;
}

type DeclarationDocument = Record<string, unknown>;

/** Parsed declaration document; null when the file is absent. */
async function readDeclarationDocument(projectRoot: string): Promise<DeclarationDocument | null> {
  const target = path.join(projectRoot, MODULES_FILE);
  let raw: string;
  try {
    raw = await fs.readFile(target, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new CliError(`Invalid JSON in ${MODULES_FILE}: ${(error as Error).message}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CliError(`${MODULES_FILE} must be a JSON object.`);
  }
  return parsed as DeclarationDocument;
}

/** Declared module names, sorted; null when the declaration file is absent. */
export async function readModulesFile(projectRoot: string): Promise<string[] | null> {
  const document = await readDeclarationDocument(projectRoot);
  if (document === null) return null;

  const names = document.modules;
  if (!Array.isArray(names) || names.some((name) => typeof name !== "string")) {
    throw new CliError(`${MODULES_FILE} must be an object of the form { "modules": ["name", ...] }.`);
  }
  return normalizeNames(names as string[]);
}

/**
 * External registry declaration (`{ "registry": { "url": "...", "ref": "..." } }`).
 * Null when the project pins no registry and the CLI's built-in one applies.
 */
export async function readRegistryDeclaration(projectRoot: string): Promise<RegistryDeclaration | null> {
  const document = await readDeclarationDocument(projectRoot);
  const registry = document?.registry;
  if (registry === undefined) return null;
  if (registry === null || typeof registry !== "object" || Array.isArray(registry)) {
    throw new CliError(`${MODULES_FILE}: "registry" must be an object with a "url" string.`);
  }

  const { url, ref } = registry as { url?: unknown; ref?: unknown };
  if (typeof url !== "string" || url.trim() === "") {
    throw new CliError(`${MODULES_FILE}: "registry.url" must be a non-empty string.`);
  }
  if (ref !== undefined && (typeof ref !== "string" || ref.trim() === "")) {
    throw new CliError(`${MODULES_FILE}: "registry.ref" must be a non-empty string when set.`);
  }
  return ref === undefined ? { url } : { url, ref };
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

/**
 * Write the declared module set, preserving keys this CLI does not own
 * (`registry`, host annotations), so a module change never erases them.
 */
export async function writeModulesFile(projectRoot: string, names: string[]): Promise<void> {
  const document = { ...((await readDeclarationDocument(projectRoot)) ?? {}), modules: normalizeNames(names) };
  await fs.writeFile(path.join(projectRoot, MODULES_FILE), `${JSON.stringify(document, null, 2)}\n`);
}

function normalizeNames(names: string[]): string[] {
  return [...new Set(names)].sort();
}
