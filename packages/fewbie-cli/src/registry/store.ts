import fs from "node:fs/promises";
import path from "node:path";
import { yellow } from "colorette";

import { CliError } from "@devbie/cli-kit";
import { parseModuleContract, validateManifestContract } from "./contract";
import { REGISTRY_MANIFEST_FILE, type BuiltRegistryModule, type ModuleContract, type RegistryManifest } from "./types";

/** A loaded module plus the absolute paths its files should be copied from. */
export interface LoadedModule {
  manifest: RegistryManifest;
  /** Target path (project-relative) -> absolute source path / inline content. */
  files: Array<{ target: string; source?: string; content?: string }>;
}

async function readModuleFile(root: string, name: string): Promise<RegistryManifest | BuiltRegistryModule> {
  const raw = await fs.readFile(path.join(root, name, REGISTRY_MANIFEST_FILE), "utf8");
  return JSON.parse(raw) as RegistryManifest | BuiltRegistryModule;
}

/** Warn once per module that predates the executable contract (ADR-057). */
function warnMissingContract(name: string): void {
  console.warn(yellow(`Registry module '${name}' has no contract; pinning is unavailable until the module ships one.`));
}

/**
 * Built modules carry the contract inline; the sidecar is the fallback for
 * consumers whose tooling strips unknown manifest keys.
 */
async function readBuiltContract(
  root: string,
  name: string,
  module: BuiltRegistryModule,
): Promise<ModuleContract | undefined> {
  if (module["x-fewbie.contract"] !== undefined) return module["x-fewbie.contract"];
  const sidecar = path.join(root, name, "contract.json");
  const raw = await fs.readFile(sidecar, "utf8").catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  });
  if (raw === undefined) return undefined;
  return parseModuleContract(JSON.parse(raw), name);
}

/** Names of every authored module in the registry, sorted. */
export async function listRegistryModuleNames(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const names: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const hasModule = await fs
      .access(path.join(root, entry.name, REGISTRY_MANIFEST_FILE))
      .then(() => true)
      .catch(() => false);
    if (hasModule) names.push(entry.name);
  }
  return names.sort();
}

/** Content one loaded module file should be copied from. */
export async function readModuleFileContent(file: LoadedModule["files"][number]): Promise<string> {
  return file.content ?? (await fs.readFile(file.source as string, "utf8"));
}

function isBuilt(module: RegistryManifest | BuiltRegistryModule): module is BuiltRegistryModule {
  return Array.isArray(module.files) && module.files.length > 0 && typeof module.files[0] === "object";
}

const MODULE_TYPES: ReadonlySet<string> = new Set(["registry:lib", "registry:component", "registry:block"]);

/**
 * Layers each type may install into (ADR-069), and the module-first target shape
 * (ADR-070): `src/fewbie/modules/<module>/<layer>/…`. A block is one distribution unit that
 * may carry several layers at once; the layer of each file, not the module type,
 * drives the host's layer lint. The registry gate applies the same table.
 */
const TYPE_LAYERS: Record<string, readonly string[]> = {
  "registry:block": ["features", "widgets", "components", "lib"],
  "registry:lib": ["lib", "components"],
  "registry:component": ["components", "lib"],
};

/**
 * Registry-storage path of a declared install target (ADR-071). Authored
 * `files` keep the installation path; the payload sits at that path minus the
 * module's install root.
 */
export function moduleStoragePath(moduleName: string, target: string): string {
  const prefix = `src/fewbie/modules/${moduleName}/`;
  if (!target.startsWith(prefix)) {
    throw new CliError(`Registry module '${moduleName}' declares '${target}', which does not land under ${prefix}`);
  }
  return target.slice(prefix.length);
}

function assertStringArray(moduleName: string, field: string, value: unknown): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry === "")) {
    throw new CliError(
      `Registry module '${moduleName}' has a malformed ${REGISTRY_MANIFEST_FILE}: '${field}' must be an array of non-empty strings.`,
    );
  }
}

/** Reject a manifest whose shape would only fail later with an obscure error. */
function assertManifestShape(
  moduleName: string,
  module: unknown,
): asserts module is RegistryManifest | BuiltRegistryModule {
  if (module === null || typeof module !== "object" || Array.isArray(module)) {
    throw new CliError(
      `Registry module '${moduleName}' has a malformed ${REGISTRY_MANIFEST_FILE}: expected an object.`,
    );
  }
  const raw = module as Record<string, unknown>;
  if (raw.name !== moduleName) {
    throw new CliError(
      `Registry module '${moduleName}' declares name '${String(raw.name)}' in ${REGISTRY_MANIFEST_FILE}; the directory and manifest names must match.`,
    );
  }
  if (typeof raw.type !== "string" || !MODULE_TYPES.has(raw.type)) {
    throw new CliError(
      `Registry module '${moduleName}' declares unknown type '${String(raw.type)}'; expected one of ${[...MODULE_TYPES].join(", ")}.`,
    );
  }
  for (const field of ["title", "description", "postInstall"]) {
    if (raw[field] !== undefined && typeof raw[field] !== "string") {
      throw new CliError(
        `Registry module '${moduleName}' has a malformed ${REGISTRY_MANIFEST_FILE}: '${field}' must be a string.`,
      );
    }
  }
  for (const field of ["dependencies", "registryDependencies"]) assertStringArray(moduleName, field, raw[field]);
  if (!Array.isArray(raw.files) || raw.files.length === 0) {
    throw new CliError(
      `Registry module '${moduleName}' has a malformed ${REGISTRY_MANIFEST_FILE}: 'files' must be a non-empty array.`,
    );
  }
}

/** A declared target must land in the module's own module-first layer tree. */
function assertTypeTargets(moduleName: string, type: string, targets: string[]): void {
  const layers = TYPE_LAYERS[type] ?? [];
  for (const target of targets) {
    const [scope, fewbieSegment, modulesSegment, moduleSegment, layer, ...rest] = target.split("/");
    if (
      scope !== "src" ||
      fewbieSegment !== "fewbie" ||
      modulesSegment !== "modules" ||
      moduleSegment !== moduleName ||
      !layers.includes(layer) ||
      rest.length === 0
    ) {
      throw new CliError(
        `Registry module '${moduleName}' declares '${target}', which does not land under ` +
          `src/fewbie/modules/${moduleName}/<${layers.join("|")}>/ for type '${type}'.`,
      );
    }
  }
}

/**
 * Manifest targets are project-relative by contract; an absolute path or a
 * `..` segment would let a module write outside the project root.
 */
function assertProjectRelativeTarget(moduleName: string, target: string): void {
  if (!target || path.isAbsolute(target) || target.split(/[/\\]/).includes("..")) {
    throw new CliError(
      `Registry module '${moduleName}' declares an unsafe file target '${target}': ` +
        "targets must be relative and stay inside the project.",
    );
  }
}

/** Load one registry module, normalizing authored and built forms. */
export async function loadModule(root: string, name: string): Promise<LoadedModule> {
  const module = await readModuleFile(root, name);
  assertManifestShape(name, module);

  if (isBuilt(module)) {
    for (const file of module.files) {
      if (typeof file.path !== "string" || typeof file.content !== "string") {
        throw new CliError(`Registry module '${name}' has a built file entry without a path and content.`);
      }
      assertProjectRelativeTarget(name, file.path);
    }
    const targets = module.files.map((f) => f.path);
    assertTypeTargets(name, module.type, targets);
    const declared = await readBuiltContract(root, name, module);
    if (declared === undefined) warnMissingContract(name);
    return {
      manifest: {
        name: module.name,
        type: module.type,
        title: module.title,
        description: module.description,
        dependencies: module.dependencies,
        registryDependencies: module.registryDependencies,
        postInstall: module.postInstall,
        files: targets,
        contract:
          declared === undefined ? undefined : validateManifestContract({ name, files: targets, contract: declared }),
      },
      files: module.files.map((f) => ({
        target: f.path,
        content: f.content,
      })),
    };
  }

  const manifest = module;
  for (const relative of manifest.files) {
    if (typeof relative !== "string" || relative === "") {
      throw new CliError(
        `Registry module '${name}' has a malformed ${REGISTRY_MANIFEST_FILE}: 'files' must hold paths.`,
      );
    }
    assertProjectRelativeTarget(name, relative);
  }
  assertTypeTargets(name, manifest.type, manifest.files);
  if (manifest.contract === undefined) warnMissingContract(name);
  const files = manifest.files.map((relative) => ({
    target: relative,
    source: path.join(root, name, moduleStoragePath(name, relative)),
  }));
  return { manifest: { ...manifest, contract: validateManifestContract(manifest) }, files };
}

/**
 * Resolve requested modules plus their registryDependencies into a
 * deduplicated install order (dependencies first).
 */
export async function resolveInstallSet(root: string, names: string[]): Promise<LoadedModule[]> {
  const ordered: LoadedModule[] = [];
  const seen = new Set<string>();
  const visiting = new Set<string>();

  async function visit(name: string): Promise<void> {
    if (seen.has(name)) return;
    if (visiting.has(name)) {
      throw new CliError(`Circular registry dependency involving '${name}'.`);
    }
    visiting.add(name);
    const loaded = await loadModule(root, name).catch((error: unknown) => {
      // Only a genuinely missing module becomes "not found"; IO/parse/validation
      // failures must surface with their own message instead of being masked.
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new CliError(`Registry module '${name}' not found. Run 'fewbie modules add <name>' with a valid name.`);
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
