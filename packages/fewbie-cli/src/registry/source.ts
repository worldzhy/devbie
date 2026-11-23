import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { CliError, execCapture, pathExists } from "@devbie/cli-kit";
import { readRegistryDeclaration } from "../lib/modules-file";
import { registryCommit, LOCAL_REGISTRY_COMMIT } from "../lib/git-commit";
import { REGISTRY_MANIFEST_FILE } from "./types";

/** Local registry checkout, overriding any declaration (development override). */
const REGISTRY_PATH_ENV = "FEWBIE_REGISTRY_PATH";
/** Base directory for cloned registries (`<base>/<url hash>`). */
const REGISTRY_CACHE_ENV = "FEWBIE_REGISTRY_CACHE_DIR";

/** Container directory holding every authored module inside a checkout (ADR-059). */
export const REGISTRY_MODULES_DIR = "packages/modules";

/**
 * A candidate directory is only a valid registry root if it contains at
 * least one `<name>/fewbie.module.json`. Merely existing is not enough: when
 * this module runs uncompiled via tsx, the first candidate resolves to the
 * src/registry directory itself (which holds code, not modules).
 */
export async function isRegistryRoot(candidate: string): Promise<boolean> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(candidate, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const hasModule = await fs
      .access(path.join(candidate, entry.name, REGISTRY_MANIFEST_FILE))
      .then(() => true)
      .catch(() => false);
    if (hasModule) return true;
  }
  return false;
}

/**
 * Module directory inside a registry checkout. `packages/modules` wins; a flat
 * checkout (modules at its root) stays supported for older registries and for
 * the CLI's own built-in snapshot. Null when neither shape holds.
 */
export async function locateModulesDir(checkout: string): Promise<string | null> {
  const container = path.join(checkout, REGISTRY_MODULES_DIR);
  if (await isRegistryRoot(container)) return container;
  if (await isRegistryRoot(checkout)) return checkout;
  return null;
}

/** Both accepted registry shapes, for error messages. */
function expectedRegistryShape(): string {
  return `${path.join(REGISTRY_MODULES_DIR, "<module>", REGISTRY_MANIFEST_FILE)} or <module>/${REGISTRY_MANIFEST_FILE}`;
}

/**
 * Reject refs that could be read as git options or that smuggle whitespace:
 * `execCapture` already avoids a shell, but an argument such as `--upload-pack`
 * would still change git's behavior. Shared with `create --template-ref`, which
 * passes its ref to `git fetch` the same way (R83-08).
 */
export function assertSafeRef(ref: string): void {
  if (ref.startsWith("-") || /\s/.test(ref)) {
    throw new CliError(`Invalid registry ref '${ref}': pass a branch, tag or commit without whitespace.`);
  }
}

function registryCacheDir(url: string): string {
  const base = process.env[REGISTRY_CACHE_ENV] ?? path.join(os.homedir(), ".fewbie", "registry");
  const digest = crypto.createHash("sha1").update(url).digest("hex").slice(0, 12);
  return path.join(base, digest);
}

/** Wait this long for another process to release the cache before giving up. */
const CACHE_LOCK_TIMEOUT_MS = 60_000;
/** A lock older than this belongs to a crashed process and may be broken. */
const CACHE_LOCK_STALE_MS = 5 * 60_000;

/**
 * Serialize work on one shared registry checkout.
 *
 * The cache is a single mutable working tree: two concurrent commands (two CI
 * jobs, two terminals) both fetch and hard-checkout it, and the loser can read
 * a tree that no longer matches the commit it recorded (R82-09). A directory
 * lock is enough — the operations inside are short and already idempotent.
 */
async function withCacheLock<T>(cacheDir: string, run: () => Promise<T>): Promise<T> {
  const lockDir = `${cacheDir}.lock`;
  await fs.mkdir(path.dirname(lockDir), { recursive: true });
  const deadline = Date.now() + CACHE_LOCK_TIMEOUT_MS;
  for (;;) {
    try {
      await fs.mkdir(lockDir);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const stat = await fs.stat(lockDir).catch(() => null);
      if (stat !== null && Date.now() - stat.mtimeMs > CACHE_LOCK_STALE_MS) {
        await fs.rm(lockDir, { recursive: true, force: true });
        continue;
      }
      if (Date.now() > deadline) {
        throw new CliError(`Timed out waiting for the registry cache lock at ${lockDir}.`);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  try {
    return await run();
  } finally {
    await fs.rm(lockDir, { recursive: true, force: true });
  }
}

/**
 * Freeze the checked-out modules of one commit so reads cannot race a concurrent
 * fetch/checkout of the shared cache (R83-14). A snapshot is materialized once
 * per commit and never rewritten; `unknown` commits (git unavailable) keep the
 * old behavior because there is no stable name to key on.
 */
async function materializeSnapshot(cacheDir: string, modulesDir: string, commit: string): Promise<string> {
  if (commit === "unknown") return modulesDir;
  const base = `${cacheDir}.snapshots`;
  const target = path.join(base, commit);
  if (await pathExists(target)) return target;
  await fs.mkdir(base, { recursive: true });
  const temp = `${target}.tmp-${process.pid}`;
  await fs.rm(temp, { recursive: true, force: true });
  await fs.cp(modulesDir, temp, { recursive: true });
  try {
    await fs.rename(temp, target);
  } catch (error) {
    await fs.rm(temp, { recursive: true, force: true });
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EEXIST" && code !== "ENOTEMPTY") throw error;
  }
  return target;
}

/**
 * Materialize a registry repository at `ref` into a per-URL cache directory.
 * A fresh clone is shallow; later runs fetch and hard-checkout the ref so the
 * working tree always matches the declared revision. The returned modules come
 * from a per-commit snapshot taken inside the lock, so they stay stable while
 * another process checks out a different ref (R83-14).
 */
async function syncGitRegistry(url: string, ref: string | undefined): Promise<RegistryContext> {
  if (ref) assertSafeRef(ref);
  const cacheDir = registryCacheDir(url);

  try {
    return await withCacheLock(cacheDir, async () => {
      if (!(await pathExists(path.join(cacheDir, ".git")))) {
        if (await pathExists(cacheDir)) await fs.rm(cacheDir, { recursive: true, force: true });
        await execCapture("git", ["clone", "--quiet", "--depth", "1", url, cacheDir]);
      }
      // Fetching a branch, tag or reachable commit all land in FETCH_HEAD.
      const revision = ref ?? "HEAD";
      await execCapture("git", ["-C", cacheDir, "fetch", "--quiet", "--depth", "1", "origin", revision]);
      await execCapture("git", ["-C", cacheDir, "checkout", "--quiet", "--force", "FETCH_HEAD"]);

      const modulesDir = await locateModulesDir(cacheDir);
      if (modulesDir === null) {
        throw new CliError(
          `Registry ${url}${ref ? `#${ref}` : ""} has no modules (expected ${expectedRegistryShape()}).`,
        );
      }
      const { stdout } = await execCapture("git", ["-C", cacheDir, "rev-parse", "HEAD"]);
      const commit = stdout.trim() || "unknown";
      return { root: await materializeSnapshot(cacheDir, modulesDir, commit), commit };
    });
  } catch (error) {
    // A registry-shaped or missing-modules error already names the problem;
    // only git failures need the fetch context.
    if (error instanceof CliError) throw error;
    throw new CliError(`Failed to fetch registry ${url}${ref ? `#${ref}` : ""}: ${(error as Error).message}`);
  }
}

/** Registry root plus the revision its files came from (ADR-057 D4). */
async function resolveRegistry(projectRoot?: string): Promise<RegistryContext> {
  const override = process.env[REGISTRY_PATH_ENV];
  if (override) {
    const candidate = path.resolve(override);
    const modulesDir = await locateModulesDir(candidate);
    if (modulesDir === null) {
      throw new CliError(`${REGISTRY_PATH_ENV} '${candidate}' is not a registry root (no ${expectedRegistryShape()}).`);
    }
    return { root: modulesDir, commit: LOCAL_REGISTRY_COMMIT };
  }

  if (projectRoot) {
    const declaration = await readRegistryDeclaration(projectRoot);
    if (declaration) return syncGitRegistry(declaration.url, declaration.ref);
  }

  const candidates = [
    path.resolve(__dirname, "..", "registry"), // dist/registry (compiled)
    path.resolve(__dirname, "..", "..", "registry"), // packages/fewbie-cli/registry (authored)
  ];
  for (const candidate of candidates) {
    if (await isRegistryRoot(candidate)) {
      return { root: candidate, commit: await registryCommit(candidate, false) };
    }
  }
  throw new CliError("Registry not found (expected dist/registry or registry/).");
}

/**
 * Locate the registry root.
 *
 * - `FEWBIE_REGISTRY_PATH` points at a local checkout and wins over everything.
 * - A project's `fewbie.json` `registry` declaration is cloned and checked out.
 * - Published package: built manifests live in dist/registry.
 * - Monorepo checkout / tsx runs: fall back to the authored registry/ folder.
 */
export async function resolveRegistryRoot(projectRoot?: string): Promise<string> {
  return (await resolveRegistry(projectRoot)).root;
}

/** Registry root plus the revision the lockfile should record (ADR-057 D4). */
export interface RegistryContext {
  root: string;
  /** Resolved commit, `dev` for a local override, `unknown` when git cannot answer. */
  commit: string;
}

/** Resolve the registry root and the commit its files came from. */
export async function resolveRegistryContext(projectRoot?: string): Promise<RegistryContext> {
  return resolveRegistry(projectRoot);
}
