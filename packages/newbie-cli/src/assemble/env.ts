import fs from "node:fs/promises";
import path from "node:path";

import {
  EnvLine,
  compareStrings,
  normalizeSections,
  parseEnv,
  pruneEmptySections,
  relocateSharedEnvKeys,
  removeEnvKeys,
  replaceMarkedBlock,
  serializeEnv,
  upsertEnvSection,
} from "../core/env-file";
import { ENV_EXAMPLE_PATH, ENV_PATH } from "../constants/paths";
import { EnvDeclaration, ModuleManifest } from "../core/module-manifest";
import { IssueBag, reportIssue } from "../lib/issues";
import { readInstalledManifest } from "../lib/module-install";
import { Sink } from "../lib/sink";

function sectionTitle(key: string): string {
  return key.length === 0 ? key : key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * Ownership of env declarations (R29-01): a key declared by several enabled
 * modules belongs to the alphabetically first declarer, so exactly one
 * generated section carries it — an empty example in a later section can
 * never blank the real value (dotenv last-wins).
 */
async function readEnvOwnership(
  cwd: string,
  enabled: string[],
): Promise<{ manifests: Map<string, ModuleManifest | null>; declarers: Map<string, string[]> }> {
  const manifests = new Map<string, ModuleManifest | null>();
  const declarers = new Map<string, string[]>();
  for (const key of [...enabled].sort(compareStrings)) {
    const manifest = await readInstalledManifest(cwd, key);
    manifests.set(key, manifest);
    for (const envKey of Object.keys(manifest?.requires?.env ?? {})) {
      const list = declarers.get(envKey) ?? [];
      list.push(key);
      declarers.set(envKey, list);
    }
  }
  return { manifests, declarers };
}

function ownsEnvKey(declarers: ReadonlyMap<string, string[]>, envKey: string, moduleKey: string): boolean {
  return (declarers.get(envKey) ?? [moduleKey])[0] === moduleKey;
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
    // A missing .env is the normal first-run state: `create` copies the
    // template without .env, and only .env.example ships. This step creates
    // the file with the enabled modules' declared variables, so it must not
    // be reported as an issue — a fatal entry here made the first
    // `modules add`/`apply` exit non-zero after every write had landed.
  }

  let lines: EnvLine[] = parseEnv(raw);

  // Shared-key ownership (R29-01): converge existing duplicates onto the
  // owner section before any upsert, migrating the best value found, then
  // upsert each added module with only the keys it owns.
  const { manifests, declarers } = await readEnvOwnership(cwd, enabled);

  const ownerTitles = new Map<string, string>();
  for (const [envKey, list] of declarers) {
    if (list.length > 1) ownerTitles.set(envKey, sectionTitle(list[0]));
  }
  let migrated = new Map<string, string>();
  if (ownerTitles.size > 0) {
    const relocated = relocateSharedEnvKeys(lines, ownerTitles);
    lines = pruneEmptySections(relocated.lines);
    migrated = relocated.migrated;
  }

  for (const key of added) {
    const manifest = manifests.has(key) ? manifests.get(key)! : await readInstalledManifest(cwd, key);
    if (manifest === null) {
      reportIssue(issues, sink, `Missing newbie.module.json for '${key}'; its env variables were not added.`);
      continue;
    }
    const owned: Record<string, string> = {};
    for (const [envKey, example] of Object.entries(envExampleValues(manifest.requires?.env))) {
      if (!ownsEnvKey(declarers, envKey, key)) continue;
      owned[envKey] = migrated.get(envKey) ?? example;
    }
    lines = upsertEnvSection(lines, sectionTitle(key), owned);
  }

  // Variables still declared by an enabled module must survive even when a
  // removed module happened to declare the same name (e.g. a shared
  // DATABASE_URL): deletion is per module key, not per raw env name.
  const retainedKeys = new Set<string>();
  for (const manifest of manifests.values()) {
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
 * contribute the variables they own (a key shared by several modules renders
 * once, under the alphabetically first declarer — same ownership as .env,
 * R29-01); sections are ordered by module key and variables alphabetically
 * within each section (ADR-005), so the same module set always renders
 * byte-identical content. Hand-written content outside the @@newbie-modules
 * markers is preserved.
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
  const { manifests, declarers } = await readEnvOwnership(cwd, enabled);
  for (const key of [...enabled].sort(compareStrings)) {
    const manifest = manifests.get(key) ?? null;
    if (manifest === null) {
      reportIssue(issues, sink, `Missing newbie.module.json for '${key}'; excluded from ${ENV_EXAMPLE_PATH}.`);
      continue;
    }
    const declared = envExampleValues(manifest.requires?.env);
    const entries = Object.entries(declared).filter(([envKey]) => ownsEnvKey(declarers, envKey, key));
    // A module whose declared keys are all owned by earlier declarers renders
    // no section; modules declaring no env keep their (empty) header as before.
    if (entries.length === 0 && Object.keys(declared).length > 0) continue;
    sectionLines.push(decoration, `# ! ${sectionTitle(key)} variables`, decoration);
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
