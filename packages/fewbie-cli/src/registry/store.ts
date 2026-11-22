import fs from "node:fs/promises";
import path from "node:path";
import { yellow } from "colorette";

import { CliError } from "@devbie/cli-kit";
import { parseModuleContract, validateManifestContract } from "./contract";
import { REGISTRY_MANIFEST_FILE, type BuiltRegistryItem, type ModuleContract, type RegistryManifest } from "./types";

/** A loaded item plus the absolute paths its files should be copied from. */
export interface LoadedItem {
  manifest: RegistryManifest;
  /** Target path (project-relative) -> absolute source path / inline content. */
  files: Array<{ target: string; source?: string; content?: string }>;
}

async function readItemFile(root: string, name: string): Promise<RegistryManifest | BuiltRegistryItem> {
  const raw = await fs.readFile(path.join(root, name, REGISTRY_MANIFEST_FILE), "utf8");
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
      .access(path.join(root, entry.name, REGISTRY_MANIFEST_FILE))
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

const ITEM_TYPES: ReadonlySet<string> = new Set([
  "registry:lib",
  "registry:component",
  "registry:widget",
  "registry:feature",
]);

/**
 * Layer each type may install into. A feature stays a feature so the host's
 * layer lint sees it; a lib may ship a component payload beside its logic
 * (ADR-066). The registry gate applies the same table (R87-02, R87-24).
 */
const TYPE_TARGET_ROOTS: Record<string, readonly string[]> = {
  "registry:feature": ["features"],
  "registry:widget": ["widgets"],
  "registry:lib": ["lib", "components"],
  "registry:component": ["components", "lib"],
};

function assertStringArray(itemName: string, field: string, value: unknown): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry === "")) {
    throw new CliError(
      `Registry item '${itemName}' has a malformed ${REGISTRY_MANIFEST_FILE}: '${field}' must be an array of non-empty strings.`,
    );
  }
}

/** Reject a manifest whose shape would only fail later with an obscure error. */
function assertManifestShape(itemName: string, item: unknown): asserts item is RegistryManifest | BuiltRegistryItem {
  if (item === null || typeof item !== "object" || Array.isArray(item)) {
    throw new CliError(`Registry item '${itemName}' has a malformed ${REGISTRY_MANIFEST_FILE}: expected an object.`);
  }
  const raw = item as Record<string, unknown>;
  if (raw.name !== itemName) {
    throw new CliError(
      `Registry item '${itemName}' declares name '${String(raw.name)}' in ${REGISTRY_MANIFEST_FILE}; the directory and manifest names must match.`,
    );
  }
  if (typeof raw.type !== "string" || !ITEM_TYPES.has(raw.type)) {
    throw new CliError(
      `Registry item '${itemName}' declares unknown type '${String(raw.type)}'; expected one of ${[...ITEM_TYPES].join(", ")}.`,
    );
  }
  for (const field of ["title", "description", "postInstall"]) {
    if (raw[field] !== undefined && typeof raw[field] !== "string") {
      throw new CliError(
        `Registry item '${itemName}' has a malformed ${REGISTRY_MANIFEST_FILE}: '${field}' must be a string.`,
      );
    }
  }
  for (const field of ["dependencies", "registryDependencies"]) assertStringArray(itemName, field, raw[field]);
  if (!Array.isArray(raw.files) || raw.files.length === 0) {
    throw new CliError(
      `Registry item '${itemName}' has a malformed ${REGISTRY_MANIFEST_FILE}: 'files' must be a non-empty array.`,
    );
  }
}

/** A declared target must land in a layer its type owns. */
function assertTypeTargets(itemName: string, type: string, targets: string[]): void {
  const roots = TYPE_TARGET_ROOTS[type] ?? [];
  for (const target of targets) {
    const segments = target.split("/");
    if (segments[0] !== "src" || !roots.includes(segments[1]) || segments.length < 3) {
      throw new CliError(
        `Registry item '${itemName}' declares '${target}', which does not land under ` +
          `${roots.map((root) => `src/${root}/`).join(" or ")} for type '${type}'.`,
      );
    }
  }
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
  assertManifestShape(name, item);

  if (isBuilt(item)) {
    for (const file of item.files) {
      if (typeof file.path !== "string" || typeof file.content !== "string") {
        throw new CliError(`Registry item '${name}' has a built file entry without a path and content.`);
      }
      assertProjectRelativeTarget(name, file.path);
    }
    const targets = item.files.map((f) => f.path);
    assertTypeTargets(name, item.type, targets);
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
  for (const relative of manifest.files) {
    if (typeof relative !== "string" || relative === "") {
      throw new CliError(`Registry item '${name}' has a malformed ${REGISTRY_MANIFEST_FILE}: 'files' must hold paths.`);
    }
    assertProjectRelativeTarget(name, relative);
  }
  assertTypeTargets(name, manifest.type, manifest.files);
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
