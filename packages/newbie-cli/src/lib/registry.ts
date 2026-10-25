import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { MODULE_MANIFEST_FILE } from "@devbie/modules-state";

import { REGISTRY_MODULES_DIR } from "../constants/paths";
import { normalizeModuleManifest } from "../core/module-manifest";
import { CliError, execCapture, trim } from "@devbie/cli-kit";

/**
 * The newbie-modules monorepo is the single distribution channel:
 * https://github.com/worldzhy/newbie-modules
 */
export const REGISTRY_URL = "https://github.com/worldzhy/newbie-modules.git";

/** Override the cloned cache with a local checkout (the dev loop). */
export const REGISTRY_PATH_ENV = "NEWBIE_MODULES_PATH";
/** Pin a registry tag/commit/branch instead of the remote default branch. */
export const REGISTRY_REF_ENV = "NEWBIE_MODULES_REF";

/** Fallback local checkout discovered automatically when it exists. */
const DEFAULT_LOCAL_REGISTRY = path.join(os.homedir(), "src", "newbie-modules");
const CACHE_DIR = path.join(os.homedir(), ".newbie", "registry");

export interface RegistryLocation {
  /** Absolute path of a usable registry working tree. */
  root: string;
  url: string;
  sourceCommit: string | null;
  /** Local checkouts are never mutated; the cache is cloned/updated by us. */
  local: boolean;
}

async function pathIsUsable(root: string): Promise<boolean> {
  try {
    await fs.stat(path.join(root, REGISTRY_MODULES_DIR));
    return true;
  } catch {
    return false;
  }
}

async function gitHead(root: string): Promise<string | null> {
  try {
    return trim(await execCapture("git", ["-C", root, "rev-parse", "HEAD"]));
  } catch {
    return null;
  }
}

async function resolveLocalRegistry(): Promise<string | null> {
  const explicit = process.env[REGISTRY_PATH_ENV];
  const candidate = explicit ? path.resolve(explicit) : DEFAULT_LOCAL_REGISTRY;
  return (await pathIsUsable(candidate)) ? candidate : null;
}

/**
 * Bring the cached registry clone to the requested ref (or remote HEAD).
 * The cache is a disposable clone: hard resets are safe.
 */
async function updateCachedClone(ref?: string): Promise<string> {
  let exists = true;
  try {
    await fs.stat(path.join(CACHE_DIR, ".git"));
  } catch {
    exists = false;
  }

  if (!exists) {
    await fs.mkdir(path.dirname(CACHE_DIR), { recursive: true });
    await execCapture("git", ["clone", REGISTRY_URL, CACHE_DIR]);
  }

  await execCapture("git", ["-C", CACHE_DIR, "fetch", "--quiet", "origin", "--tags"]);

  if (ref) {
    await execCapture("git", ["-C", CACHE_DIR, "checkout", "--quiet", "--detach", ref]);
  } else {
    // Follow the remote default branch regardless of the clone vintage.
    await execCapture("git", ["-C", CACHE_DIR, "remote", "set-head", "origin", "-a"]);
    const symbolic = trim(
      await execCapture("git", ["-C", CACHE_DIR, "symbolic-ref", "--short", "refs/remotes/origin/HEAD"]),
    );
    const branch = symbolic.replace(/^origin\//, "");
    await execCapture("git", ["-C", CACHE_DIR, "checkout", "--quiet", "-B", branch, `origin/${branch}`]);
  }

  return trim(await execCapture("git", ["-C", CACHE_DIR, "rev-parse", "HEAD"]));
}

/**
 * Resolve where module sources should be copied from.
 *
 * - `fetch: true` (install/update): update the cache clone; fails clearly when
 *   the registry cannot be reached.
 * - `fetch: false` (status/doctor): never touch the network; use a local
 *   checkout or the cache as-is, and report unavailable when neither exists.
 */
export async function resolveRegistry(options?: { fetch?: boolean }): Promise<RegistryLocation | null> {
  const localRoot = await resolveLocalRegistry();
  if (localRoot) {
    return {
      root: localRoot,
      url: REGISTRY_URL,
      sourceCommit: await gitHead(localRoot),
      local: true,
    };
  }

  const ref = process.env[REGISTRY_REF_ENV];
  if (options?.fetch) {
    const sourceCommit = await updateCachedClone(ref);
    return { root: CACHE_DIR, url: REGISTRY_URL, sourceCommit, local: false };
  }

  const cacheUsable = await pathIsUsable(CACHE_DIR);
  if (!cacheUsable) return null;
  return {
    root: CACHE_DIR,
    url: REGISTRY_URL,
    sourceCommit: await gitHead(CACHE_DIR),
    local: false,
  };
}

/** Required registry variant; throws a guidance error when unavailable. */
export async function requireRegistry(options?: { fetch?: boolean }): Promise<RegistryLocation> {
  const registry = await resolveRegistry(options);
  if (!registry) {
    throw new CliError(
      `The newbie-modules registry is not available. Set ${REGISTRY_PATH_ENV} to a local checkout, or run an online command once to clone ${REGISTRY_URL}.`,
    );
  }
  return registry;
}

export function moduleRootInRegistry(registryRoot: string, key: string): string {
  return path.resolve(registryRoot, REGISTRY_MODULES_DIR, key);
}

/** List module keys present in a registry working tree. */
export async function listRegistryKeys(registryRoot: string): Promise<string[]> {
  const dir = path.resolve(registryRoot, REGISTRY_MODULES_DIR);
  let dirents: import("node:fs").Dirent[];
  try {
    dirents = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const keys: string[] = [];
  for (const dirent of dirents) {
    if (!dirent.isDirectory()) continue;
    if (
      await fs
        .stat(path.join(dir, dirent.name, MODULE_MANIFEST_FILE))
        .then(() => true)
        .catch(() => false)
    ) {
      keys.push(dirent.name);
    }
  }
  return keys.sort();
}

export interface RegistryModule {
  key: string;
  dir: string;
  manifest: import("../core/module-manifest").ModuleManifest;
}

/** Read the manifest of every module present in a registry working tree. */
export async function listRegistryModules(registryRoot: string): Promise<RegistryModule[]> {
  const keys = await listRegistryKeys(registryRoot);
  const modules: RegistryModule[] = [];
  for (const key of keys) {
    const resolved = await readRegistryModule(registryRoot, key);
    if (resolved) modules.push(resolved);
  }
  return modules;
}

/** Deprecation notices keyed by module key, from the manifests' `deprecated` field. */
export function deprecatedNoticesOf(modules: RegistryModule[]): Map<string, string> {
  return new Map(
    modules
      .filter((entry) => typeof entry.manifest.deprecated === "string")
      .map((entry) => [entry.key, entry.manifest.deprecated as string]),
  );
}

export async function readRegistryModule(registryRoot: string, key: string): Promise<RegistryModule | null> {
  const dir = moduleRootInRegistry(registryRoot, key);
  let raw: string;
  try {
    raw = await fs.readFile(path.join(dir, MODULE_MANIFEST_FILE), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new CliError(`Invalid newbie.module.json for registry module '${key}': ${(error as Error).message}`);
  }
  return { dir, key, manifest: normalizeModuleManifest(parsed, key) };
}
