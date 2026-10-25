import path from "node:path";

import { MODULES_DIR } from "@devbie/modules-state";

import { moduleRootInRegistry, RegistryLocation } from "../lib/registry";
import { CliError } from "../lib/errors";
import { pathExists } from "../lib/fs-util";
import { Sink } from "../lib/sink";

/**
 * Defense in depth: even though keys come from the registry listing, make
 * sure nothing can ever make the CLI copy/delete outside src/modules/.
 */
export function assertModuleKeySafe(key: string): void {
  const resolved = path.resolve(MODULES_DIR, key);
  const relative = path.relative(MODULES_DIR, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative) || relative.split(path.sep).length !== 1) {
    throw new CliError(`[Error] Refusing to operate outside ${MODULES_DIR}: ${key}`);
  }
}

/**
 * Registry source directories absent from the current checkout. Callers must
 * validate every key before the first copy: `Sink.copy` deletes the installed
 * directory first, so a missing source would wipe a working module and leave
 * the project half-updated with nothing to roll back to.
 */
export async function collectMissingRegistrySources(
  registryRoot: string,
  keys: readonly string[],
): Promise<Array<{ key: string; source: string }>> {
  const missing: Array<{ key: string; source: string }> = [];
  for (const key of keys) {
    const source = moduleRootInRegistry(registryRoot, key);
    if (!(await pathExists(source))) missing.push({ key, source });
  }
  return missing;
}

/**
 * Copy module sources from the newbie-modules registry into the project.
 * The module's newbie.module.json and prisma fragment travel with the copy,
 * so no separate settings synchronisation step is required.
 */
export async function addModules(params: {
  cwd: string;
  sink: Sink;
  registry: RegistryLocation;
  keys: string[];
}): Promise<void> {
  const { sink, registry, keys } = params;
  for (const key of keys) {
    assertModuleKeySafe(key);
  }

  const missing = await collectMissingRegistrySources(registry.root, keys);
  if (missing.length > 0) {
    const detail = missing.map(({ key, source }) => `  - ${key} (${source})`).join("\n");
    throw new CliError(
      `Registry checkout ${registry.sourceCommit ?? "unknown"} is missing module source(s):\n${detail}\n` +
        `Point NEWBIE_MODULES_REF at a ref that carries them, then run 'newbie modules apply'.`,
    );
  }

  for (const key of keys) {
    await sink.copy(moduleRootInRegistry(registry.root, key), path.posix.join(MODULES_DIR, key));
  }
}

/** Delete a copied module directory (plain folder, never a git submodule). */
export async function removeModules(params: { sink: Sink; keys: string[] }): Promise<void> {
  const { sink, keys } = params;
  for (const key of keys) {
    assertModuleKeySafe(key);
    await sink.remove(path.posix.join(MODULES_DIR, key));
  }
}
