/**
 * Shared helper for the registry snapshot (ADR-058).
 *
 * The authored registry lives in the fewbie-modules repository. This package
 * ships a generated copy so a host that declares no `registry` sees the same
 * item set as one that declares it. The snapshot is always built from a
 * fewbie-modules checkout and never edited by hand.
 */
import fs from "node:fs/promises";
import path from "node:path";

import { CliError, execCapture } from "@devbie/cli-kit";

import { moduleStoragePath } from "../src/registry/store";
import { REGISTRY_MANIFEST_FILE } from "../src/registry/types";

export const SNAPSHOT_FILE = ".snapshot.json";
export const SOURCE_URL = "https://github.com/worldzhy/fewbie-modules.git";
export const SOURCE_REF = "main";

/** Container directory holding every authored item (ADR-059). */
const ITEMS_DIR = "packages/modules";
/** Root directories of a flat checkout that are tooling, not registry items. */
const INFRASTRUCTURE = new Set(["harness", "node_modules", "scripts"]);

export interface SnapshotMeta {
  source: string;
  ref: string;
  commit: string;
}

export async function readSnapshotMeta(root: string): Promise<SnapshotMeta> {
  const raw = await fs.readFile(path.join(root, SNAPSHOT_FILE), "utf8").catch(() => undefined);
  if (raw === undefined) throw new CliError(`${SNAPSHOT_FILE} is missing from '${root}'; run registry:sync.`);
  const meta = JSON.parse(raw) as Partial<SnapshotMeta>;
  if (!meta.source || !meta.ref || !meta.commit) {
    throw new CliError(`${SNAPSHOT_FILE} must record source, ref and commit.`);
  }
  return meta as SnapshotMeta;
}

export async function gitHead(root: string): Promise<string> {
  const { stdout } = await execCapture("git", ["-C", root, "rev-parse", "HEAD"]);
  return stdout.trim();
}

export async function gitDirty(root: string): Promise<boolean> {
  const { stdout } = await execCapture("git", ["-C", root, "status", "--porcelain"]);
  return stdout.trim().length > 0;
}

/** Items directory of a checkout: the `packages/modules` container wins, else its root. */
async function locateItemsRoot(sourceRoot: string): Promise<string> {
  const container = path.join(sourceRoot, ITEMS_DIR);
  const exists = await fs
    .access(container)
    .then(() => true)
    .catch(() => false);
  return exists ? container : sourceRoot;
}

/** Copy every authored item's manifest and declared payload into `outputRoot`. */
export async function buildSnapshot(sourceRoot: string, outputRoot: string): Promise<string[]> {
  const itemsRoot = await locateItemsRoot(sourceRoot);
  await fs.mkdir(outputRoot, { recursive: true });
  const names: string[] = [];

  for (const entry of await fs.readdir(itemsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".") || INFRASTRUCTURE.has(entry.name)) continue;
    const itemDir = path.join(itemsRoot, entry.name);
    const manifestRaw = await fs.readFile(path.join(itemDir, REGISTRY_MANIFEST_FILE), "utf8").catch(() => undefined);
    if (manifestRaw === undefined) continue;

    const manifest = JSON.parse(manifestRaw) as { name?: unknown; files?: unknown };
    if (manifest.name !== entry.name) {
      throw new CliError(`Registry folder '${entry.name}' does not match item name '${String(manifest.name)}'.`);
    }
    const files = Array.isArray(manifest.files) ? manifest.files : [];
    if (files.length === 0) throw new CliError(`Item '${entry.name}' declares no files.`);

    const target = path.join(outputRoot, entry.name);
    await fs.rm(target, { recursive: true, force: true });
    await fs.mkdir(target, { recursive: true });
    await fs.writeFile(path.join(target, REGISTRY_MANIFEST_FILE), manifestRaw);

    for (const file of files) {
      if (typeof file !== "string") throw new CliError(`Item '${entry.name}' has a non-string files entry.`);
      const storage = moduleStoragePath(entry.name, file);
      const resolved = path.resolve(itemDir, storage);
      if (!resolved.startsWith(path.resolve(itemDir) + path.sep)) {
        throw new CliError(`Item '${entry.name}' points outside its directory: ${file}`);
      }
      const destination = path.join(target, storage);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.copyFile(resolved, destination);
    }
    names.push(entry.name);
  }

  return names.sort();
}

/** Replace `targetRoot` with a fresh snapshot of `sourceRoot`. */
export async function writeSnapshot(sourceRoot: string, targetRoot: string): Promise<string[]> {
  const staging = `${targetRoot}.staging-${process.pid}`;
  await fs.rm(staging, { recursive: true, force: true });
  const names = await buildSnapshot(sourceRoot, staging);
  await fs.rm(targetRoot, { recursive: true, force: true });
  await fs.rename(staging, targetRoot);
  return names;
}

/** Relative POSIX paths of every file under `root`. */
export async function listFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(current: string): Promise<void> {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(target);
      else files.push(path.relative(root, target).split(path.sep).join("/"));
    }
  }
  await walk(root);
  return files.sort();
}

/** Byte-level differences between two snapshot trees; empty means identical. */
export async function diffSnapshots(expectedRoot: string, actualRoot: string): Promise<string[]> {
  const problems: string[] = [];
  const expected = await listFiles(expectedRoot);
  const actual = (await listFiles(actualRoot)).filter((file) => file !== SNAPSHOT_FILE);

  for (const file of expected) if (!actual.includes(file)) problems.push(`missing: ${file}`);
  for (const file of actual) if (!expected.includes(file)) problems.push(`unexpected: ${file}`);

  for (const file of expected) {
    if (!actual.includes(file)) continue;
    const [wanted, found] = await Promise.all([
      fs.readFile(path.join(expectedRoot, file)),
      fs.readFile(path.join(actualRoot, file)),
    ]);
    if (!wanted.equals(found)) problems.push(`differs: ${file}`);
  }

  return problems;
}
