import semver from "semver";

import { CliError } from "@devbie/cli-kit";
// Published package version; the contract's framework range must admit it.
import pkg from "../../package.json";
import type { ItemLayer, ModuleContract, ModuleLayerContract, ModuleState, RegistryManifest } from "./types";

/**
 * Executable contract validation (ADR-057). The manifest's `contract` block is
 * the part of a module's `types.ts` interface the CLI can verify without
 * compiling the item: version, framework range, entry point and the label,
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
const LAYERS: ItemLayer[] = ["features", "widgets", "components", "lib"];

function fail(itemName: string, message: string): never {
  throw new CliError(`Registry item '${itemName}': contract.${message}`);
}

function assertNonEmptyString(itemName: string, field: string, value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    fail(itemName, `${field} must be a non-empty string.`);
  }
  return value;
}

function assertStringList(itemName: string, field: string, value: unknown, allowEmpty = false): string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    fail(itemName, `${field} must be ${allowEmpty ? "an" : "a non-empty"} array of strings.`);
  }
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string" || entry.trim() === "") {
      fail(itemName, `${field} must contain non-empty strings.`);
    }
    if (seen.has(entry)) fail(itemName, `${field} contains duplicate '${entry}'.`);
    seen.add(entry);
  }
  return value as string[];
}

/**
 * Parse the optional `layers` breakdown of a block. Each layer names its own
 * `types.ts`, so a merged block keeps per-layer type truth while the host still
 * receives one adapter over the union (ADR-069 D5).
 */
function parseLayers(itemName: string, value: unknown, version: string): ModuleLayerContract[] {
  if (!Array.isArray(value) || value.length === 0) {
    fail(itemName, "layers must be a non-empty array.");
  }
  if (semver.major(version) < 2) {
    fail(itemName, `layers require contract version 2.0.0 or later (got '${version}').`);
  }
  const seenTypes = new Set<string>();
  return value.map((entry: unknown) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      fail(itemName, "layers entries must be objects.");
    }
    const raw = entry as Record<string, unknown>;
    const layer = assertNonEmptyString(itemName, "layers[].layer", raw.layer);
    if (!LAYERS.includes(layer as ItemLayer)) {
      fail(itemName, `layers[].layer '${layer}' must be one of ${LAYERS.join(", ")}.`);
    }

    const types = assertNonEmptyString(itemName, `layers.${layer}.types`, raw.types);
    if (!types.startsWith(`src/${layer}/`)) {
      fail(itemName, `layers.${layer}.types '${types}' must land under src/${layer}/.`);
    }
    // A layer may contribute several source groups (login and forgot password
    // both live in `features`); each group still needs its own types file.
    if (seenTypes.has(types)) fail(itemName, `layers declares '${types}' more than once.`);
    seenTypes.add(types);
    const labels = assertStringList(itemName, `layers.${layer}.labels`, raw.labels);
    const ports = assertStringList(itemName, `layers.${layer}.ports`, raw.ports, true);
    for (const port of ports) {
      if (!PORT_METHOD.test(port)) fail(itemName, `layers.${layer}.ports entry '${port}' is not a valid method name.`);
    }
    const states = assertStringList(itemName, `layers.${layer}.states`, raw.states, true);
    for (const state of states) {
      if (!ALLOWED_STATES.includes(state as ModuleState)) {
        fail(itemName, `layers.${layer}.states entry '${state}' must be one of ${ALLOWED_STATES.join(", ")}.`);
      }
    }
    return {
      layer: layer as ItemLayer,
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
  itemName: string,
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
      fail(itemName, `${field} key(s) ${[...repeated].join(", ")} are declared by more than one layer.`);
    }
  }
  const missing = union.filter((key) => !declared.includes(key));
  const extra = declared.filter((key) => !union.includes(key));
  if (missing.length > 0) fail(itemName, `${field} is missing layer key(s) ${missing.join(", ")}.`);
  if (extra.length > 0) fail(itemName, `${field} lists ${extra.join(", ")} that no layer declares.`);
}

/** Validate one contract object; throws a CliError naming the failing rule. */
export function parseModuleContract(value: unknown, itemName: string): ModuleContract {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(itemName, "must be an object.");
  }
  const raw = value as Record<string, unknown>;

  const version = assertNonEmptyString(itemName, "version", raw.version);
  if (semver.valid(version) === null) {
    fail(itemName, `version '${version}' is not a valid semver version.`);
  }

  const framework = assertNonEmptyString(itemName, "framework", raw.framework);
  if (semver.validRange(framework) === null) {
    fail(itemName, `framework '${framework}' is not a valid semver range.`);
  }
  // A range alone only proves the declaration is well-formed. An older CLI must
  // refuse an item that expects a newer framework instead of installing it into
  // a host whose runtime surface it does not have (R82-07).
  if (!semver.satisfies(pkg.version, framework)) {
    fail(itemName, `requires framework '${framework}' but this CLI is ${pkg.version}. Upgrade @devbie/fewbie-cli.`);
  }

  const entry = assertNonEmptyString(itemName, "entry", raw.entry);
  const labels = assertStringList(itemName, "labels", raw.labels);
  // A presentational item may need no host transport and no shadcn primitive;
  // an empty list then states that surface truthfully instead of inventing a
  // fake port to satisfy the parser (R83-11).
  const ports = assertStringList(itemName, "ports", raw.ports, true);
  for (const port of ports) {
    if (!PORT_METHOD.test(port)) fail(itemName, `ports entry '${port}' is not a valid method name.`);
  }

  const ui = assertStringList(itemName, "ui", raw.ui, true);
  for (const atom of ui) {
    if (!ALLOWED_UI.has(atom)) fail(itemName, `ui entry '${atom}' is not an allowed shadcn primitive.`);
  }

  const states = assertStringList(itemName, "states", raw.states);
  for (const state of states) {
    if (!ALLOWED_STATES.includes(state as ModuleState)) {
      fail(itemName, `states entry '${state}' must be one of ${ALLOWED_STATES.join(", ")}.`);
    }
  }

  const layers = raw.layers === undefined ? undefined : parseLayers(itemName, raw.layers, version);
  if (layers !== undefined) {
    assertLayerUnion(itemName, "labels", layers, labels);
    assertLayerUnion(itemName, "ports", layers, ports);
    assertLayerUnion(itemName, "states", layers, states);
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
 * Contract of an authored manifest, or undefined when the item predates
 * ADR-057. `entry` must name one of the files the item installs, otherwise
 * the contract cannot describe how the host mounts it.
 */
export function validateManifestContract(
  manifest: Pick<RegistryManifest, "name" | "files" | "contract">,
): ModuleContract | undefined {
  if (manifest.contract === undefined) return undefined;

  const contract = parseModuleContract(manifest.contract, manifest.name);
  if (!manifest.files.includes(contract.entry)) {
    fail(manifest.name, `entry '${contract.entry}' must be one of the item's files (${manifest.files.join(", ")}).`);
  }
  for (const layer of contract.layers ?? []) {
    if (!manifest.files.includes(layer.types)) {
      fail(
        manifest.name,
        `layers.${layer.layer}.types '${layer.types}' must be one of the item's files (${manifest.files.join(", ")}).`,
      );
    }
  }
  return contract;
}
