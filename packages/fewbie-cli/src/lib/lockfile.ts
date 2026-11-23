import fs from "node:fs/promises";
import path from "node:path";

import { CliError } from "@devbie/cli-kit";

/**
 * Module lockfile (ADR-057 D4).
 *
 * `fewbie.json` is hand-written intent; this file is machine-owned state. It
 * records the registry revision each module was installed from and the hash of
 * every installed file, which is what makes the three-way drift classification
 * possible after the registry moves.
 */

export const LOCKFILE = "fewbie.lock.json";
export const LOCKFILE_VERSION = 1;

export interface LockfileRegistry {
  /** Declared registry URL; empty for the CLI's built-in registry. */
  url: string;
  /** Declared ref; empty when it follows the remote HEAD. */
  ref: string;
  /** Resolved commit, `dev` for a local override, `unknown` when unresolvable. */
  commit: string;
}

export interface LockfileModule {
  /** Module contract version, `0.0.0` when the module ships no contract. */
  version: string;
  /** Registry commit this module was installed from. */
  commit: string;
  /** Project-relative target -> `sha256-<hex>` of the installed bytes. */
  files: Record<string, string>;
}

export interface Lockfile {
  lockfileVersion: number;
  registry: LockfileRegistry;
  modules: Record<string, LockfileModule>;
}

/** Parsed lockfile, or null when the project has none (1.8 installs). */
export async function readLockfile(projectRoot: string): Promise<Lockfile | null> {
  const target = path.join(projectRoot, LOCKFILE);
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
    throw new CliError(`Invalid JSON in ${LOCKFILE}: ${(error as Error).message}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CliError(`${LOCKFILE} must be a JSON object.`);
  }

  const lockfile = parsed as Partial<Lockfile>;
  if (lockfile.lockfileVersion !== LOCKFILE_VERSION) {
    throw new CliError(
      `${LOCKFILE}: unsupported lockfileVersion ${String(lockfile.lockfileVersion)} (expected ${LOCKFILE_VERSION}).`,
    );
  }
  if (lockfile.registry === null || typeof lockfile.registry !== "object") {
    throw new CliError(`${LOCKFILE}: "registry" must be an object.`);
  }
  if (lockfile.modules === null || typeof lockfile.modules !== "object" || Array.isArray(lockfile.modules)) {
    throw new CliError(`${LOCKFILE}: "modules" must be an object.`);
  }
  // Reject a malformed entry instead of letting it fall through to the `legacy`
  // drift kind: legacy files are writable, so a corrupt baseline would turn a
  // conflict into a silent overwrite (R82-06).
  for (const [name, entry] of Object.entries(lockfile.modules as Record<string, unknown>)) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new CliError(`${LOCKFILE}: modules.${name} must be an object.`);
    }
    const record = entry as Record<string, unknown>;
    if (typeof record.version !== "string" || typeof record.commit !== "string") {
      throw new CliError(`${LOCKFILE}: modules.${name} must record a string version and commit.`);
    }
    if (record.files === null || typeof record.files !== "object" || Array.isArray(record.files)) {
      throw new CliError(`${LOCKFILE}: modules.${name}.files must be a target -> hash object.`);
    }
    for (const [target, hash] of Object.entries(record.files as Record<string, unknown>)) {
      if (typeof hash !== "string" || hash.length === 0) {
        throw new CliError(`${LOCKFILE}: modules.${name}.files['${target}'] must be a non-empty hash string.`);
      }
    }
  }
  return lockfile as Lockfile;
}

/** Write the lockfile deterministically: sorted modules and sorted file keys. */
export async function writeLockfile(projectRoot: string, lockfile: Lockfile): Promise<void> {
  const modules: Record<string, LockfileModule> = {};
  for (const name of Object.keys(lockfile.modules).sort()) {
    const entry = lockfile.modules[name];
    modules[name] = {
      version: entry.version,
      commit: entry.commit,
      files: Object.fromEntries(Object.entries(entry.files).sort(([a], [b]) => a.localeCompare(b))),
    };
  }
  const document: Lockfile = { ...lockfile, modules };
  await fs.writeFile(path.join(projectRoot, LOCKFILE), `${JSON.stringify(document, null, 2)}\n`);
}
