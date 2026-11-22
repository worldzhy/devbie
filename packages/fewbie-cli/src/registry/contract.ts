import semver from "semver";

import { CliError } from "@devbie/cli-kit";
// Published package version; the contract's framework range must admit it.
import pkg from "../../package.json";
import type { ModuleContract, ModuleState, RegistryManifest } from "./types";

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

  return {
    version,
    framework,
    entry,
    labels,
    ports,
    ui,
    states: states as ModuleState[],
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
  return contract;
}
