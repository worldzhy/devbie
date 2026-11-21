import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { CliError, execCapture, pathExists } from "@devbie/cli-kit";
import { readRegistryDeclaration } from "../lib/modules-file";
import { registryCommit } from "../lib/git-commit";

/** Local registry checkout, overriding any declaration (development override). */
const REGISTRY_PATH_ENV = "FEWBIE_REGISTRY_PATH";
/** Base directory for cloned registries (`<base>/<url hash>`). */
const REGISTRY_CACHE_ENV = "FEWBIE_REGISTRY_CACHE_DIR";

/** Container directory holding every authored item inside a checkout (ADR-059). */
export const REGISTRY_ITEMS_DIR = "packages/modules";

/**
 * A candidate directory is only a valid registry root if it contains at
 * least one `<name>/item.json`. Merely existing is not enough: when this
 * module runs uncompiled via tsx, the first candidate resolves to the
 * src/registry directory itself (which holds code, not items).
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
    const hasItem = await fs
      .access(path.join(candidate, entry.name, "item.json"))
      .then(() => true)
      .catch(() => false);
    if (hasItem) return true;
  }
  return false;
}

/**
 * Item directory inside a registry checkout. `packages/modules` wins; a flat
 * checkout (items at its root) stays supported for older registries and for
 * the CLI's own built-in snapshot. Null when neither shape holds.
 */
export async function locateItemsDir(checkout: string): Promise<string | null> {
  const container = path.join(checkout, REGISTRY_ITEMS_DIR);
  if (await isRegistryRoot(container)) return container;
  if (await isRegistryRoot(checkout)) return checkout;
  return null;
}

/** Both accepted registry shapes, for error messages. */
function expectedRegistryShape(): string {
  return `${path.join(REGISTRY_ITEMS_DIR, "<item>", "item.json")} or <item>/item.json`;
}

/**
 * Reject refs that could be read as git options or that smuggle whitespace:
 * `execCapture` already avoids a shell, but an argument such as `--upload-pack`
 * would still change git's behavior.
 */
function assertSafeRef(ref: string): void {
  if (ref.startsWith("-") || /\s/.test(ref)) {
    throw new CliError(`Invalid registry ref '${ref}': pass a branch, tag or commit without whitespace.`);
  }
}

function registryCacheDir(url: string): string {
  const base = process.env[REGISTRY_CACHE_ENV] ?? path.join(os.homedir(), ".fewbie", "registry");
  const digest = crypto.createHash("sha1").update(url).digest("hex").slice(0, 12);
  return path.join(base, digest);
}

/**
 * Materialize a registry repository at `ref` into a per-URL cache directory.
 * A fresh clone is shallow; later runs fetch and hard-checkout the ref so the
 * working tree always matches the declared revision.
 */
async function syncGitRegistry(url: string, ref: string | undefined): Promise<string> {
  if (ref) assertSafeRef(ref);
  const cacheDir = registryCacheDir(url);

  try {
    if (!(await pathExists(path.join(cacheDir, ".git")))) {
      if (await pathExists(cacheDir)) await fs.rm(cacheDir, { recursive: true, force: true });
      await fs.mkdir(path.dirname(cacheDir), { recursive: true });
      await execCapture("git", ["clone", "--quiet", "--depth", "1", url, cacheDir]);
    }
    // Fetching a branch, tag or reachable commit all land in FETCH_HEAD.
    const revision = ref ?? "HEAD";
    await execCapture("git", ["-C", cacheDir, "fetch", "--quiet", "--depth", "1", "origin", revision]);
    await execCapture("git", ["-C", cacheDir, "checkout", "--quiet", "--force", "FETCH_HEAD"]);
  } catch (error) {
    throw new CliError(`Failed to fetch registry ${url}${ref ? `#${ref}` : ""}: ${(error as Error).message}`);
  }

  const itemsDir = await locateItemsDir(cacheDir);
  if (itemsDir === null) {
    throw new CliError(`Registry ${url}${ref ? `#${ref}` : ""} has no items (expected ${expectedRegistryShape()}).`);
  }
  return itemsDir;
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
  const override = process.env[REGISTRY_PATH_ENV];
  if (override) {
    const candidate = path.resolve(override);
    const itemsDir = await locateItemsDir(candidate);
    if (itemsDir === null) {
      throw new CliError(`${REGISTRY_PATH_ENV} '${candidate}' is not a registry root (no ${expectedRegistryShape()}).`);
    }
    return itemsDir;
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
      return candidate;
    }
  }
  throw new CliError("Registry not found (expected dist/registry or registry/).");
}

/** Registry root plus the revision the lockfile should record (ADR-057 D4). */
export interface RegistryContext {
  root: string;
  /** Resolved commit, `dev` for a local override, `unknown` when git cannot answer. */
  commit: string;
}

/** Resolve the registry root and the commit its files came from. */
export async function resolveRegistryContext(projectRoot?: string): Promise<RegistryContext> {
  const root = await resolveRegistryRoot(projectRoot);
  return { root, commit: await registryCommit(root, Boolean(process.env[REGISTRY_PATH_ENV])) };
}
