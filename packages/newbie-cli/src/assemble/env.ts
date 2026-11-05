import fs from "node:fs/promises";
import path from "node:path";

import {
  EnvLine,
  compareStrings,
  normalizeSections,
  parseEnv,
  pruneEmptySections,
  removeEnvKeys,
  replaceMarkedBlock,
  serializeEnv,
  upsertEnvSection,
} from "../core/env-file";
import { ENV_EXAMPLE_PATH, ENV_PATH } from "../constants/paths";
import { EnvDeclaration } from "../core/module-manifest";
import { IssueBag, reportIssue } from "../lib/issues";
import { readInstalledManifest } from "../lib/module-install";
import { Sink } from "../lib/sink";

function sectionTitle(key: string): string {
  return key.length === 0 ? key : key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * Manifests may declare a plain example value (a string) or a typed descriptor
 * (`{ type, example, description }`). Both collapse to the value written into
 * `.env` / `.env.example`; descriptors without an explicit example render as an
 * empty value so the operator fills it in.
 *
 * The rendered value is scaffolding only — every environment still has to
 * declare each key explicitly (ADR-033), so this must never be read at runtime.
 */
export function envExampleValues(env: Record<string, EnvDeclaration> | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, declaration] of Object.entries(env ?? {})) {
    if (typeof declaration === "string") {
      result[key] = declaration;
      continue;
    }
    result[key] = declaration?.example === undefined ? "" : String(declaration.example);
  }
  return result;
}

/**
 * Structurally edit .env: add missing variables under per-module sections
 * (comments/blank lines survive), delete variables of removed modules.
 */
export async function assembleEnv(params: {
  cwd: string;
  sink: Sink;
  issues: IssueBag;
  added: string[];
  removed: string[];
  /** Module keys that stay enabled after this change. */
  enabled: string[];
}): Promise<void> {
  const { cwd, sink, issues, added, removed, enabled } = params;

  let raw = "";
  try {
    raw = await fs.readFile(path.resolve(cwd, ENV_PATH), "utf8");
  } catch {
    reportIssue(issues, sink, `${ENV_PATH} not found; a new file will be created with module variables only.`);
  }

  let lines: EnvLine[] = parseEnv(raw);

  for (const key of added) {
    const manifest = await readInstalledManifest(cwd, key);
    if (manifest === null) {
      reportIssue(issues, sink, `Missing newbie.module.json for '${key}'; its env variables were not added.`);
      continue;
    }
    lines = upsertEnvSection(lines, sectionTitle(key), envExampleValues(manifest.requires?.env));
  }

  // Variables still declared by an enabled module must survive even when a
  // removed module happened to declare the same name (e.g. a shared
  // DATABASE_URL): deletion is per module key, not per raw env name.
  const retainedKeys = new Set<string>();
  for (const key of enabled) {
    const manifest = await readInstalledManifest(cwd, key);
    if (manifest === null) continue;
    for (const envKey of Object.keys(manifest.requires?.env ?? {})) retainedKeys.add(envKey);
  }

  const removedKeys = new Set<string>();
  for (const key of removed) {
    const manifest = await readInstalledManifest(cwd, key);
    if (manifest === null) continue;
    for (const envKey of Object.keys(manifest.requires?.env ?? {})) {
      if (!retainedKeys.has(envKey)) removedKeys.add(envKey);
    }
  }
  if (removedKeys.size > 0) {
    lines = pruneEmptySections(removeEnvKeys(lines, removedKeys));
  }

  // Canonical section order (ADR-005): same alphabetical order .env.example
  // uses, so a module set renders identically in both files.
  lines = normalizeSections(lines);

  const serialized = serializeEnv(lines);
  if (serialized !== raw) {
    await sink.writeText(ENV_PATH, serialized);
  }
}

/**
 * Regenerate the CLI-managed block inside .env.example. All enabled modules
 * contribute their full variable list; sections are ordered by module key and
 * variables alphabetically within each section (ADR-005), so the same module
 * set always renders byte-identical content. Hand-written content outside the
 * @@newbie-modules markers is preserved.
 */
export async function assembleEnvExample(params: {
  cwd: string;
  sink: Sink;
  issues: IssueBag;
  enabled: string[];
}): Promise<void> {
  const { cwd, sink, issues, enabled } = params;

  const decoration = "# ----------------------------------------------------------------------------------";
  const sectionLines: string[] = [];
  for (const key of [...enabled].sort(compareStrings)) {
    const manifest = await readInstalledManifest(cwd, key);
    if (manifest === null) {
      reportIssue(issues, sink, `Missing newbie.module.json for '${key}'; excluded from ${ENV_EXAMPLE_PATH}.`);
      continue;
    }
    sectionLines.push(decoration, `# ! ${sectionTitle(key)} variables`, decoration);
    const entries = Object.entries(envExampleValues(manifest.requires?.env));
    entries.sort(([a], [b]) => compareStrings(a, b));
    for (const [envKey, value] of entries) {
      sectionLines.push(`${envKey}=${value}`);
    }
  }

  const body =
    sectionLines.length > 0
      ? `# Variables below are managed by @devbie/newbie-cli. Do not edit between the markers.\n${sectionLines.join("\n")}\n`
      : "";

  let raw = "";
  try {
    raw = await fs.readFile(path.resolve(cwd, ENV_EXAMPLE_PATH), "utf8");
  } catch {
    // Missing .env.example: create with markers only.
  }

  const next = replaceMarkedBlock(raw, body);
  if (next !== raw) {
    await sink.writeText(ENV_EXAMPLE_PATH, next);
  }
}
