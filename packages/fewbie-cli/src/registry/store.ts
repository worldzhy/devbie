import fs from "node:fs/promises";
import path from "node:path";
import { yellow } from "colorette";

import { CliError } from "@devbie/cli-kit";
import { parseModuleContract, validateManifestContract } from "./contract";
import type { BuiltRegistryItem, ModuleContract, RegistryManifest } from "./types";

/** A loaded item plus the absolute paths its files should be copied from. */
export interface LoadedItem {
  manifest: RegistryManifest;
  /** Target path (project-relative) -> absolute source path / inline content. */
  files: Array<{ target: string; source?: string; content?: string }>;
}

async function readItemFile(root: string, name: string): Promise<RegistryManifest | BuiltRegistryItem> {
  const raw = await fs.readFile(path.join(root, name, "item.json"), "utf8");
  return JSON.parse(raw) as RegistryManifest | BuiltRegistryItem;
}

/** Warn once per item that predates the executable contract (ADR-057). */
function warnMissingContract(name: string): void {
  console.warn(yellow(`Registry item '${name}' has no contract; pinning is unavailable until the module ships one.`));
}

/**
 * Built items carry the contract inline; the sidecar is the fallback for
 * consumers whose tooling strips unknown manifest keys.
 */
async function readBuiltContract(
  root: string,
  name: string,
  item: BuiltRegistryItem,
): Promise<ModuleContract | undefined> {
  if (item["x-fewbie.contract"] !== undefined) return item["x-fewbie.contract"];
  const sidecar = path.join(root, name, "contract.json");
  const raw = await fs.readFile(sidecar, "utf8").catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  });
  if (raw === undefined) return undefined;
  return parseModuleContract(JSON.parse(raw), name);
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

/**
 * Manifest targets are project-relative by contract; an absolute path or a
 * `..` segment would let an item write outside the project root.
 */
function assertProjectRelativeTarget(itemName: string, target: string): void {
  if (!target || path.isAbsolute(target) || target.split(/[/\\]/).includes("..")) {
    throw new CliError(
      `Registry item '${itemName}' declares an unsafe file target '${target}': ` +
        "targets must be relative and stay inside the project.",
    );
  }
}

/** Load one registry item, normalizing authored and built forms. */
export async function loadItem(root: string, name: string): Promise<LoadedItem> {
  const item = await readItemFile(root, name);

  if (isBuilt(item)) {
    for (const file of item.files) assertProjectRelativeTarget(name, file.path);
    const targets = item.files.map((f) => f.path);
    const declared = await readBuiltContract(root, name, item);
    if (declared === undefined) warnMissingContract(name);
    return {
      manifest: {
        name: item.name,
        type: item.type,
        title: item.title,
        description: item.description,
        dependencies: item.dependencies,
        registryDependencies: item.registryDependencies,
        postInstall: item.postInstall,
        files: targets,
        contract:
          declared === undefined ? undefined : validateManifestContract({ name, files: targets, contract: declared }),
      },
      files: item.files.map((f) => ({
        target: f.path,
        content: f.content,
      })),
    };
  }

  const manifest = item;
  for (const relative of manifest.files) assertProjectRelativeTarget(name, relative);
  if (manifest.contract === undefined) warnMissingContract(name);
  const files = manifest.files.map((relative) => ({
    target: relative,
    source: path.join(root, name, relative),
  }));
  return { manifest: { ...manifest, contract: validateManifestContract(manifest) }, files };
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
    const loaded = await loadItem(root, name).catch((error: unknown) => {
      // Only a genuinely missing item becomes "not found"; IO/parse/validation
      // failures must surface with their own message instead of being masked.
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new CliError(`Registry item '${name}' not found. Run 'fewbie modules add <name>' with a valid name.`);
      }
      throw error;
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
