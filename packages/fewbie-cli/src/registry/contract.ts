import semver from "semver";

import { CliError } from "@devbie/cli-kit";
// Published package version; the contract's framework range must admit it.
import pkg from "../../package.json";
import type { ModuleLayer, ModuleContract, ModuleLayerContract, ModuleState, RegistryManifest } from "./types";

/**
 * Executable contract validation (ADR-057). The manifest's `contract` block is
 * the part of a module's `types.ts` interface the CLI can verify without
 * compiling the module: version, framework range, entry point and the label,
 * port, ui and state surfaces the host must satisfy.
 */

/** shadcn/ui primitives a module may declare; anything else is a typo or a host-coupled import. */
const ALLOWED_UI = new Set([
  "accordion",
  "alert",
  "alert-dialog",
  "avatar",
  "badge",
  "breadcrumb",
  "button",
  "calendar",
  "card",
  "checkbox",
  "collapsible",
  "command",
  "dialog",
  "dropdown-menu",
  "form",
  "input",
  "label",
  "popover",
  "progress",
  "radio-group",
  "scroll-area",
  "select",
  "separator",
  "sheet",
  "skeleton",
  "switch",
  "table",
  "tabs",
  "textarea",
  "toast",
  "tooltip",
]);

const ALLOWED_STATES: ModuleState[] = ["loading", "error", "empty", "success", "ready"];

const PORT_METHOD = /^[A-Za-z_$][\w$]*$/;

/** Layers a block payload may occupy (ADR-069 D1). */
const LAYERS: ModuleLayer[] = ["features", "widgets", "components", "lib"];

function fail(moduleName: string, message: string): never {
  throw new CliError(`Registry module '${moduleName}': contract.${message}`);
}

function assertNonEmptyString(moduleName: string, field: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    fail(moduleName, `${field} must be a non-empty string.`);
  }
  return value;
}

function assertStringList(moduleName: string, field: string, value: unknown, allowEmpty = false): string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    fail(moduleName, `${field} must be ${allowEmpty ? "an" : "a non-empty"} array of strings.`);
  }
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string" || entry.trim() === "") {
      fail(moduleName, `${field} must contain non-empty strings.`);
    }
    if (seen.has(entry)) fail(moduleName, `${field} contains duplicate '${entry}'.`);
    seen.add(entry);
  }
  return value as string[];
}

/**
 * Parse the optional `layers` breakdown of a block. Each layer names its own
 * `types.ts`, so a merged block keeps per-layer type truth while the host still
 * receives one adapter over the union (ADR-069 D5).
 */
function parseLayers(moduleName: string, value: unknown, version: string): ModuleLayerContract[] {
  if (!Array.isArray(value) || value.length === 0) {
    fail(moduleName, "layers must be a non-empty array.");
  }
  if (semver.major(version) < 2) {
    fail(moduleName, `layers require contract version 2.0.0 or later (got '${version}').`);
  }
  const seenTypes = new Set<string>();
  return value.map((entry: unknown) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      fail(moduleName, "layers entries must be objects.");
    }
    const raw = entry as Record<string, unknown>;
    const layer = assertNonEmptyString(moduleName, "layers[].layer", raw.layer);
    if (!LAYERS.includes(layer as ModuleLayer)) {
      fail(moduleName, `layers[].layer '${layer}' must be one of ${LAYERS.join(", ")}.`);
    }

    const types = assertNonEmptyString(moduleName, `layers.${layer}.types`, raw.types);
    if (!types.startsWith(`src/fewbie/modules/${moduleName}/${layer}/`)) {
      fail(moduleName, `layers.${layer}.types '${types}' must land under src/fewbie/modules/${moduleName}/${layer}/.`);
    }
    // A layer may contribute several source groups (login and forgot password
    // both live in `features`); each group still needs its own types file.
    if (seenTypes.has(types)) fail(moduleName, `layers declares '${types}' more than once.`);
    seenTypes.add(types);
    const labels = assertStringList(moduleName, `layers.${layer}.labels`, raw.labels);
    const ports = assertStringList(moduleName, `layers.${layer}.ports`, raw.ports, true);
    for (const port of ports) {
      if (!PORT_METHOD.test(port))
        fail(moduleName, `layers.${layer}.ports entry '${port}' is not a valid method name.`);
    }
    const states = assertStringList(moduleName, `layers.${layer}.states`, raw.states, true);
    for (const state of states) {
      if (!ALLOWED_STATES.includes(state as ModuleState)) {
        fail(moduleName, `layers.${layer}.states entry '${state}' must be one of ${ALLOWED_STATES.join(", ")}.`);
      }
    }
    return {
      layer: layer as ModuleLayer,
      types,
      labels,
      ports,
      states: states as ModuleState[],
    };
  });
}

/**
 * Top-level lists are the union of the layers. A key declared by two layers is
 * a hard failure: the generated adapter binds one key set, so a duplicate would
 * silently overwrite the other layer's translation (ADR-069 D5).
 */
function assertLayerUnion(
  moduleName: string,
  field: "labels" | "ports" | "states",
  layers: ModuleLayerContract[],
  declared: readonly string[],
): void {
  // Labels are translation keys: the adapter binds one key set, so a duplicate
  // would silently overwrite the other layer's copy. Ports and states may
  // repeat across layers — the host implements a port once and states are
  // enums, so they are deduplicated.
  const union = [...new Set(layers.flatMap((layer) => layer[field] as readonly string[]))];
  if (field === "labels") {
    const repeated = new Set<string>();
    const seen = new Set<string>();
    for (const key of layers.flatMap((layer) => layer.labels)) {
      if (seen.has(key)) repeated.add(key);
      seen.add(key);
    }
    if (repeated.size > 0) {
      fail(moduleName, `${field} key(s) ${[...repeated].join(", ")} are declared by more than one layer.`);
    }
  }
  const missing = union.filter((key) => !declared.includes(key));
  const extra = declared.filter((key) => !union.includes(key));
  if (missing.length > 0) fail(moduleName, `${field} is missing layer key(s) ${missing.join(", ")}.`);
  if (extra.length > 0) fail(moduleName, `${field} lists ${extra.join(", ")} that no layer declares.`);
}

/** Validate one contract object; throws a CliError naming the failing rule. */
export function parseModuleContract(value: unknown, moduleName: string): ModuleContract {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(moduleName, "must be an object.");
  }
  const raw = value as Record<string, unknown>;

  const version = assertNonEmptyString(moduleName, "version", raw.version);
  if (semver.valid(version) === null) {
    fail(moduleName, `version '${version}' is not a valid semver version.`);
  }

  const framework = assertNonEmptyString(moduleName, "framework", raw.framework);
  if (semver.validRange(framework) === null) {
    fail(moduleName, `framework '${framework}' is not a valid semver range.`);
  }
  // A range alone only proves the declaration is well-formed. An older CLI must
  // refuse a module that expects a newer framework instead of installing it into
  // a host whose runtime surface it does not have (R82-07).
  if (!semver.satisfies(pkg.version, framework)) {
    fail(moduleName, `requires framework '${framework}' but this CLI is ${pkg.version}. Upgrade @devbie/fewbie-cli.`);
  }

  const entry = assertNonEmptyString(moduleName, "entry", raw.entry);
  const labels = assertStringList(moduleName, "labels", raw.labels);
  // A presentational module may need no host transport and no shadcn primitive;
  // an empty list then states that surface truthfully instead of inventing a
  // fake port to satisfy the parser (R83-11).
  const ports = assertStringList(moduleName, "ports", raw.ports, true);
  for (const port of ports) {
    if (!PORT_METHOD.test(port)) fail(moduleName, `ports entry '${port}' is not a valid method name.`);
  }

  const ui = assertStringList(moduleName, "ui", raw.ui, true);
  for (const atom of ui) {
    if (!ALLOWED_UI.has(atom)) fail(moduleName, `ui entry '${atom}' is not an allowed shadcn primitive.`);
  }

  const states = assertStringList(moduleName, "states", raw.states);
  for (const state of states) {
    if (!ALLOWED_STATES.includes(state as ModuleState)) {
      fail(moduleName, `states entry '${state}' must be one of ${ALLOWED_STATES.join(", ")}.`);
    }
  }

  const layers = raw.layers === undefined ? undefined : parseLayers(moduleName, raw.layers, version);
  if (layers !== undefined) {
    assertLayerUnion(moduleName, "labels", layers, labels);
    assertLayerUnion(moduleName, "ports", layers, ports);
    assertLayerUnion(moduleName, "states", layers, states);
  }

  return {
    version,
    framework,
    entry,
    labels,
    ports,
    ui,
    states: states as ModuleState[],
    ...(layers === undefined ? {} : { layers }),
  };
}

/**
 * Contract of an authored manifest, or undefined when the module predates
 * ADR-057. `entry` must name one of the files the module installs, otherwise
 * the contract cannot describe how the host mounts it.
 */
export function validateManifestContract(
  manifest: Pick<RegistryManifest, "name" | "files" | "contract">,
): ModuleContract | undefined {
  if (manifest.contract === undefined) return undefined;

  const contract = parseModuleContract(manifest.contract, manifest.name);
  if (!manifest.files.includes(contract.entry)) {
    fail(manifest.name, `entry '${contract.entry}' must be one of the module's files (${manifest.files.join(", ")}).`);
  }
  for (const layer of contract.layers ?? []) {
    if (!manifest.files.includes(layer.types)) {
      fail(
        manifest.name,
        `layers.${layer.layer}.types '${layer.types}' must be one of the module's files (${manifest.files.join(", ")}).`,
      );
    }
  }
  return contract;
}
