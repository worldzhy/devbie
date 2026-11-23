/**
 * Registry manifest types.
 *
 * The authored form (registry/<name>/fewbie.module.json) keeps files as
 * repo-relative path strings so the source tree stays the single source of
 * truth. The build step emits the shadcn-compatible form, where each file
 * carries its inlined content for `npx shadcn add <url>` consumption.
 */

/** Manifest filename inside an item directory, authored and generated alike. */
export const REGISTRY_MANIFEST_FILE = "fewbie.module.json";

/** shadcn registry item kinds fewbie uses (ADR-069). */
export type RegistryItemType = "registry:lib" | "registry:component" | "registry:block";

/** Layer a block file belongs to, derived from its target path (ADR-069 D1). */
export type ItemLayer = "features" | "widgets" | "components" | "lib";

/** File entry in the authored manifest: path relative to the item folder. */
export interface RegistryFileRef {
  path: string;
}

/** File entry in the built shadcn-compatible manifest. */
export interface RegistryFileEntry {
  /** Project-relative target path, e.g. src/lib/api-client.ts. */
  path: string;
  /** Inlined file content. */
  content: string;
  type: RegistryItemType;
}

/** UI states a module must be able to render, declared in its contract. */
export type ModuleState = "loading" | "error" | "empty" | "success" | "ready";

/**
 * Per-layer contract of a block (ADR-069 D5). A block ships files for several
 * layers; each layer's `types.ts` is the type truth for that layer's labels and
 * ports, while the top-level lists are their union for adapter generation.
 */
export interface ModuleLayerContract {
  /** Layer the entry file lands in; must match the target path. */
  layer: ItemLayer;
  /** Project-relative `types.ts` declaring this layer's interfaces. */
  types: string;
  /** Label keys this layer consumes. */
  labels: string[];
  /** Port method names this layer requires. */
  ports: string[];
  /** States this layer implements. */
  states: ModuleState[];
}

/**
 * Executable module contract (ADR-057, ADR-069). The `types.ts` interface of an
 * item is the type truth; this object restates the parts the CLI can verify
 * without a TypeScript build: version, framework range, entry point, and the
 * label, port, ui and state surfaces the module exposes.
 */
export interface ModuleContract {
  /** Module version, semver. Contracts with `layers` are v2 or later. */
  version: string;
  /** Compatible framework range, e.g. "^1.7.0". */
  framework: string;
  /** Project-relative entry file; must also appear in `files`. */
  entry: string;
  /** Label keys the host must supply, unique and non-empty. */
  labels: string[];
  /** Port method names the host must implement, unique and non-empty. */
  ports: string[];
  /** shadcn/ui primitives the module renders with. */
  ui: string[];
  /** States the module implements. */
  states: ModuleState[];
  /** Layer breakdown of a block; omitted by single-layer items (v1). */
  layers?: ModuleLayerContract[];
}

/** Authored fewbie.module.json (files are plain path strings). */
export interface RegistryManifest {
  name: string;
  type: RegistryItemType;
  title: string;
  description?: string;
  /** npm packages the item needs installed in the consuming project. */
  dependencies?: string[];
  /** Other fewbie registry items this item depends on. */
  registryDependencies?: string[];
  files: string[];
  /** Hint printed after installation (manual wiring steps). */
  postInstall?: string;
  /** Executable contract; validated by the CLI and the registry gate. */
  contract?: ModuleContract;
}

/** Built shadcn-compatible registry-item manifest. */
export interface BuiltRegistryItem {
  $schema: string;
  name: string;
  type: RegistryItemType;
  title: string;
  description?: string;
  dependencies?: string[];
  registryDependencies?: string[];
  files: RegistryFileEntry[];
  /** fewbie-specific hint (ignored by the official shadcn CLI). */
  postInstall?: string;
  /** fewbie-specific contract; also emitted as a `contract.json` sidecar. */
  "x-fewbie.contract"?: ModuleContract;
}
