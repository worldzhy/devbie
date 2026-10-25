import fs from "node:fs/promises";
import path from "node:path";

import { CliError } from "@devbie/cli-kit";
import type { BuiltRegistryItem, RegistryManifest } from "./types";

/** A loaded item plus the absolute paths its files should be copied from. */
export interface LoadedItem {
  manifest: RegistryManifest;
  /** Target path (project-relative) -> absolute source path / inline content. */
  files: Array<{ target: string; source?: string; content?: string }>;
}

/**
 * A candidate directory is only a valid registry root if it contains at
 * least one `<name>/item.json`. Merely existing is not enough: when this
 * module runs uncompiled via tsx, the first candidate resolves to the
 * src/registry directory itself (which holds code, not items).
 */
async function isRegistryRoot(candidate: string): Promise<boolean> {
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
 * Locate the registry root.
 *
 * - Published package: built manifests live in dist/registry.
 * - Monorepo checkout / tsx runs: fall back to the authored registry/ folder.
 */
export async function resolveRegistryRoot(): Promise<string> {
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

async function readItemFile(root: string, name: string): Promise<RegistryManifest | BuiltRegistryItem> {
  const raw = await fs.readFile(path.join(root, name, "item.json"), "utf8");
  return JSON.parse(raw) as RegistryManifest | BuiltRegistryItem;
}

/** Names of every authored item in the registry, sorted. */
export async function listRegistryItemNames(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const names: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const hasItem = await fs
      .access(path.join(root, entry.name, "item.json"))
      .then(() => true)
      .catch(() => false);
    if (hasItem) names.push(entry.name);
  }
  return names.sort();
}

/** Content one loaded item file should be copied from. */
export async function readItemFileContent(file: LoadedItem["files"][number]): Promise<string> {
  return file.content ?? (await fs.readFile(file.source as string, "utf8"));
}

function isBuilt(item: RegistryManifest | BuiltRegistryItem): item is BuiltRegistryItem {
  return Array.isArray(item.files) && item.files.length > 0 && typeof item.files[0] === "object";
}

/** Load one registry item, normalizing authored and built forms. */
export async function loadItem(root: string, name: string): Promise<LoadedItem> {
  const item = await readItemFile(root, name);

  if (isBuilt(item)) {
    return {
      manifest: {
        name: item.name,
        type: item.type,
        title: item.title,
        description: item.description,
        dependencies: item.dependencies,
        registryDependencies: item.registryDependencies,
        postInstall: item.postInstall,
        files: item.files.map((f) => f.path),
      },
      files: item.files.map((f) => ({
        target: f.path,
        content: f.content,
      })),
    };
  }

  const manifest = item;
  const files = manifest.files.map((relative) => ({
    target: relative,
    source: path.join(root, name, relative),
  }));
  return { manifest, files };
}

/**
 * Resolve requested items plus their registryDependencies into a
 * deduplicated install order (dependencies first).
 */
export async function resolveInstallSet(root: string, names: string[]): Promise<LoadedItem[]> {
  const ordered: LoadedItem[] = [];
  const seen = new Set<string>();
  const visiting = new Set<string>();

  async function visit(name: string): Promise<void> {
    if (seen.has(name)) return;
    if (visiting.has(name)) {
      throw new CliError(`Circular registry dependency involving '${name}'.`);
    }
    visiting.add(name);
    const loaded = await loadItem(root, name).catch(() => {
      throw new CliError(`Registry item '${name}' not found. Run 'fewbie modules add <name>' with a valid name.`);
    });
    for (const dep of loaded.manifest.registryDependencies ?? []) {
      await visit(dep);
    }
    visiting.delete(name);
    seen.add(name);
    ordered.push(loaded);
  }

  for (const name of names) {
    await visit(name);
  }
  return ordered;
}
