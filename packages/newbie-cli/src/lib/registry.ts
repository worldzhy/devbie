import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { MODULE_MANIFEST_FILE, readModulesState } from "@devbie/modules-state";

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
/** Pin a registry tag/commit/branch; takes precedence over newbie-modules.json#registry.ref. */
export const REGISTRY_REF_ENV = "NEWBIE_MODULES_REF";

/** Fallback local checkout discovered automatically when it exists. */
const DEFAULT_LOCAL_REGISTRY = path.join(os.homedir(), "src", "newbie-modules");
/** Override the cloned-cache location (tests, sandboxed CI). */
export const REGISTRY_CACHE_DIR_ENV = "NEWBIE_REGISTRY_CACHE_DIR";

function cacheDir(): string {
  const override = process.env[REGISTRY_CACHE_DIR_ENV];
  return override ? path.resolve(override) : path.join(os.homedir(), ".newbie", "registry");
}

/**
 * A ref is handed to `git checkout` as an argument, so anything starting with
 * `-` would be parsed as an option (e.g. `--orphan`) instead of a revision.
 * Accept only plain branch/tag/commit names.
 */
const REGISTRY_REF_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

/** Whether NEWBIE_MODULES_REF is safe to pass to git as a revision. */
export function isValidRegistryRef(ref: string): boolean {
  return REGISTRY_REF_RE.test(ref) && !ref.includes("..") && !ref.endsWith("/");
}

/** Read NEWBIE_MODULES_REF, rejecting values git could interpret as options. */
function registryRefFromEnv(): string | undefined {
  const ref = process.env[REGISTRY_REF_ENV];
  if (!ref) return undefined;
  if (!isValidRegistryRef(ref)) {
    throw new CliError(
      `Invalid ${REGISTRY_REF_ENV} value '${ref}': expected a branch, tag, or commit name (no leading '-' and no '..').`,
    );
  }
  return ref;
}

/** The registry block declared by the consumer's newbie-modules.json. */
interface DeclaredRegistry {
  url?: string;
  ref?: string | null;
}

/**
 * Read newbie-modules.json's registry block. A missing/broken newbie-modules.json is the
 * command's own concern — resolution stays best-effort and falls back to the
 * built-in defaults.
 */
async function declaredRegistry(cwd?: string): Promise<DeclaredRegistry> {
  if (!cwd) return {};
  try {
    const state = await readModulesState(cwd);
    return { url: state.registry?.url, ref: state.registry?.ref };
  } catch {
    return {};
  }
}

/**
 * Effective registry ref: NEWBIE_MODULES_REF wins (per-invocation override),
 * then newbie-modules.json#registry.ref (project-declared default), then the remote
 * default branch. A declared-but-invalid ref is a hard error — never silently
 * assemble a different line than the project asked for.
 */
function effectiveRef(declared: DeclaredRegistry): string | undefined {
  const envRef = registryRefFromEnv();
  if (envRef) return envRef;
  const ref = declared.ref?.trim();
  if (!ref) return undefined;
  if (!isValidRegistryRef(ref)) {
    throw new CliError(
      `Invalid registry.ref '${ref}' in newbie-modules.json: expected a branch, tag, or commit name (no leading '-' and no '..').`,
    );
  }
  return ref;
}

/** Effective registry url: newbie-modules.json#registry.url (forks) or the built-in default. */
function effectiveUrl(declared: DeclaredRegistry): string {
  const url = declared.url?.trim();
  return url ? url : REGISTRY_URL;
}

/** Resolve a ref to a commit inside a git working tree, also trying `origin/<ref>`. */
async function resolveRefCommit(root: string, ref: string): Promise<string | null> {
  for (const candidate of [ref, `origin/${ref}`]) {
    try {
      return trim(await execCapture("git", ["-C", root, "rev-parse", "--verify", `${candidate}^{commit}`]));
    } catch {
      // try the next candidate
    }
  }
  return null;
}

export interface RegistryLocation {
  /** Absolute path of a usable registry working tree. */
  root: string;
  url: string;
  sourceCommit: string | null;
  /** Local checkouts are never mutated; the cache is cloned/updated by us. */
  local: boolean;
  /** Whether this resolution fetched the cache; an unfetched cache is only a snapshot. */
  refreshed: boolean;
  /** Effective ref that governed resolution (env > newbie-modules.json), when declared. */
  ref?: string;
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
 * Warn when a local checkout does not match the declared ref. Local checkouts
 * are developer working trees, so this never fails — but a silent branch
 * mismatch is how the wrong line gets assembled (R7-01).
 */
async function warnIfLocalOffRef(root: string, ref: string): Promise<void> {
  const head = await gitHead(root);
  if (!head) return;
  const target = await resolveRefCommit(root, ref);
  if (!target) {
    console.warn(`[warn] registry ref '${ref}' does not resolve in local checkout ${root}; using it as-is.`);
    return;
  }
  if (target !== head) {
    console.warn(
      `[warn] local registry checkout ${root} is at ${head.slice(0, 7)}, but the declared registry ref ` +
        `'${ref}' points at ${target.slice(0, 7)}. Check out ${ref} or adjust ${REGISTRY_REF_ENV}/newbie-modules.json.`,
    );
  }
}

/**
 * Bring the cached registry clone to the requested ref (or remote HEAD).
 * The cache is a disposable clone: hard resets are safe.
 */
async function updateCachedClone(url: string, ref?: string): Promise<string> {
  const dir = cacheDir();
  let exists = true;
  try {
    await fs.stat(path.join(dir, ".git"));
  } catch {
    exists = false;
  }

  if (!exists) {
    await fs.mkdir(path.dirname(dir), { recursive: true });
    await execCapture("git", ["clone", url, dir]);
  }

  // Keep the cache pointed at the declared upstream, so a newbie-modules.json url
  // change (fork) takes effect without manual cache surgery.
  await execCapture("git", ["-C", dir, "remote", "set-url", "origin", url]);
  await execCapture("git", ["-C", dir, "fetch", "--quiet", "origin", "--tags"]);

  if (ref) {
    const commit = await resolveRefCommit(dir, ref);
    if (!commit) {
      throw new CliError(
        `Registry ref '${ref}' could not be resolved in ${url}. Fix newbie-modules.json#registry.ref or ${REGISTRY_REF_ENV}.`,
      );
    }
    await execCapture("git", ["-C", dir, "checkout", "--quiet", "--detach", commit]);
  } else {
    // Follow the remote default branch regardless of the clone vintage.
    await execCapture("git", ["-C", dir, "remote", "set-head", "origin", "-a"]);
    const symbolic = trim(await execCapture("git", ["-C", dir, "symbolic-ref", "--short", "refs/remotes/origin/HEAD"]));
    const branch = symbolic.replace(/^origin\//, "");
    await execCapture("git", ["-C", dir, "checkout", "--quiet", "-B", branch, `origin/${branch}`]);
  }

  return trim(await execCapture("git", ["-C", dir, "rev-parse", "HEAD"]));
}

/**
 * Resolve where module sources should be copied from.
 *
 * - `fetch: true` (install/update): update the cache clone; fails clearly when
 *   the registry cannot be reached.
 * - `fetch: false` (status/doctor): never touch the network; use a local
 *   checkout or the cache as-is, and report unavailable when neither exists.
 * - `cwd` (the consumer project root) lets resolution honor the registry
 *   block declared in newbie-modules.json (url + ref).
 */
export interface RegistryResolutionOptions {
  fetch?: boolean;
  cwd?: string;
}

export async function resolveRegistry(options?: RegistryResolutionOptions): Promise<RegistryLocation | null> {
  const declared = await declaredRegistry(options?.cwd);
  const ref = effectiveRef(declared);
  const url = effectiveUrl(declared);

  const localRoot = await resolveLocalRegistry();
  if (localRoot) {
    if (ref) await warnIfLocalOffRef(localRoot, ref);
    return {
      root: localRoot,
      url,
      sourceCommit: await gitHead(localRoot),
      local: true,
      refreshed: false,
      ref,
    };
  }

  if (options?.fetch) {
    const sourceCommit = await updateCachedClone(url, ref);
    return { root: cacheDir(), url, sourceCommit, local: false, refreshed: true, ref };
  }

  const cacheUsable = await pathIsUsable(cacheDir());
  if (!cacheUsable) return null;
  return {
    root: cacheDir(),
    url,
    sourceCommit: await gitHead(cacheDir()),
    local: false,
    refreshed: false,
    ref,
  };
}

/** Required registry variant; throws a guidance error when unavailable. */
export async function requireRegistry(options?: RegistryResolutionOptions): Promise<RegistryLocation> {
  const registry = await resolveRegistry(options);
  if (!registry) {
    throw new CliError(
      `The newbie-modules registry is not available. Set ${REGISTRY_PATH_ENV} to a local checkout, or run an online command once to clone ${REGISTRY_URL}.`,
    );
  }
  return registry;
}

/** One-line human-readable summary of a resolved registry, for command output. */
export function formatRegistryLocation(registry: RegistryLocation): string {
  const commit = registry.sourceCommit?.slice(0, 7) ?? "unknown";
  if (registry.local) return `local ${registry.root} @ ${registry.ref ?? "remote-default"} (${commit})`;
  // An unfetched cache holds whatever an earlier fetch left behind: report that
  // commit, never the requested ref, so a stale snapshot cannot read as current.
  const freshness = registry.refreshed ? "refreshed" : "offline snapshot, not refreshed";
  return `cache ${registry.root} @ ${commit} (${freshness})`;
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
