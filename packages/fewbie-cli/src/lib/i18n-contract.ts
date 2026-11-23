import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import { CliError } from "@devbie/cli-kit";
import { LoadedModule, readModuleFileContent } from "../registry/store";
import type { ModuleContract } from "../registry/types";
import { MODULES_FILE } from "./modules-file";

/**
 * i18n declaration and label-adapter generation (ADR-057 D7).
 *
 * The module contract already names every label the host must supply, so the
 * host's label adapter is a mechanical projection of that list. Generation
 * keeps the key set in lockstep with the registry module; `modules adapters
 * --check` is the drift gate.
 */

/** Translation library the adapter generator understands. */
const SUPPORTED_LIBRARIES = ["next-intl"] as const;

export interface I18nDeclaration {
  library: (typeof SUPPORTED_LIBRARIES)[number];
  /** Project-relative message dictionary paths, one per locale. */
  messages: string[];
  /** Top-level message namespace that holds one sub-tree per module. */
  namespace: string;
}

const DEFAULT_NAMESPACE = "modules";

/**
 * Read the optional `i18n` block of fewbie.json. Null when the project does
 * not opt into generated adapters.
 */
export async function readI18nDeclaration(projectRoot: string): Promise<I18nDeclaration | null> {
  const raw = await fs.readFile(path.join(projectRoot, MODULES_FILE), "utf8").catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new CliError(`No ${MODULES_FILE} found in ${projectRoot}.`);
    }
    throw error;
  });

  let document: unknown;
  try {
    document = JSON.parse(raw);
  } catch (error) {
    throw new CliError(`Invalid JSON in ${MODULES_FILE}: ${(error as Error).message}`);
  }
  if (document === null || typeof document !== "object" || Array.isArray(document)) {
    throw new CliError(`${MODULES_FILE} must be a JSON object.`);
  }

  const i18n = (document as Record<string, unknown>).i18n;
  if (i18n === undefined) return null;
  if (i18n === null || typeof i18n !== "object" || Array.isArray(i18n)) {
    throw new CliError(`${MODULES_FILE}: "i18n" must be an object.`);
  }

  const { library, messages, namespace } = i18n as Record<string, unknown>;
  if (typeof library !== "string" || !SUPPORTED_LIBRARIES.includes(library as never)) {
    throw new CliError(
      `${MODULES_FILE}: "i18n.library" must be one of ${SUPPORTED_LIBRARIES.join(", ")} (got ${String(library)}).`,
    );
  }
  if (!Array.isArray(messages) || messages.length === 0 || messages.some((entry) => typeof entry !== "string")) {
    throw new CliError(`${MODULES_FILE}: "i18n.messages" must be a non-empty array of project-relative paths.`);
  }
  for (const messagePath of messages as string[]) {
    assertProjectRelative(`i18n.messages entry '${messagePath}'`, messagePath);
  }
  if (namespace !== undefined && (typeof namespace !== "string" || namespace.trim() === "")) {
    throw new CliError(`${MODULES_FILE}: "i18n.namespace" must be a non-empty string when set.`);
  }

  return {
    library: library as I18nDeclaration["library"],
    messages: messages as string[],
    namespace: (namespace as string | undefined) ?? DEFAULT_NAMESPACE,
  };
}

function assertProjectRelative(label: string, value: string): void {
  if (!value || path.isAbsolute(value) || value.split(/[/\\]/).includes("..")) {
    throw new CliError(`${MODULES_FILE}: ${label} must stay inside the project.`);
  }
}

/** Install target of a module's generated adapter (CLI-owned surface, ADR-070 D3). */
export function adapterTarget(name: string): string {
  return `src/fewbie/adapters/${name}.tsx`;
}

/** `preferences-settings` -> `PreferencesSettings`. */
export function pascalCase(name: string): string {
  return name
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/** Host import specifier of a module entry, e.g. `@/fewbie/modules/account-access/features/login-page`. */
export function moduleSpecifier(entry: string, moduleName: string): string {
  if (!entry.startsWith("src/")) {
    throw new CliError(
      `Registry module '${moduleName}': contract.entry '${entry}' must live under src/ so the adapter can import it.`,
    );
  }
  const withoutExtension = entry.replace(/\.(ts|tsx)$/, "");
  const withoutIndex = withoutExtension.endsWith("/index")
    ? withoutExtension.slice(0, -"/index".length)
    : withoutExtension;
  return `@/${withoutIndex.slice("src/".length)}`;
}

/** Interface body with comments removed, so key extraction sees only members. */
function stripComments(body: string): string {
  return body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/** Member names of an interface body (`name?: string;` -> `name`). */
function memberNames(body: string): string[] {
  return [...stripComments(body).matchAll(/^\s*([A-Za-z_$][\w$]*)\s*\??\s*:/gm)].map((match) => match[1]);
}

/**
 * Locate a labels interface by matching its member set against the expected
 * keys. The name cannot be derived from the module name (`login-page` exports
 * `LoginLabels`), so the sources decide. `targets` narrows the scan to the
 * files of one contract layer (ADR-069).
 */
export async function detectLabelsType(module: LoadedModule, labels?: string[], targets?: string[]): Promise<string> {
  const name = module.manifest.name;
  const contract = module.manifest.contract;
  if (contract === undefined) {
    throw new CliError(
      `Registry module '${name}' has no contract; add one before generating its i18n adapter (ADR-057).`,
    );
  }
  const expected = new Set(labels ?? contract.labels);
  const candidates: Array<{ type: string; keys: string[] }> = [];

  const files = targets === undefined ? module.files : module.files.filter((file) => targets.includes(file.target));
  for (const file of files) {
    if (!/\.(ts|tsx)$/.test(file.target)) continue;
    const source = await readModuleFileContent(file);
    for (const match of source.matchAll(/export\s+interface\s+(\w+)\s*\{([^{}]*)\}/g)) {
      candidates.push({ type: match[1], keys: memberNames(match[2]) });
    }
  }

  const match = candidates.find(
    (candidate) =>
      candidate.keys.length === expected.size &&
      candidate.keys.every((key) => expected.has(key)) &&
      expected.size === new Set(candidate.keys).size,
  );
  if (match === undefined) {
    throw new CliError(
      `Registry module '${name}': no exported interface in the module's sources declares exactly the contract labels ` +
        `(${[...expected].join(", ")}). Fix the registry module or its contract.`,
    );
  }
  return match.type;
}

/** One layer of a block payload; each layer contributes its own labels type. */
export interface AdapterLayer {
  labelsType: string;
  entry: string;
}

export interface AdapterInput {
  name: string;
  labels: string[];
  namespace: string;
  layers: AdapterLayer[];
  /** Merged locale defaults from the contract layers (ADR-074); absent when none are declared. */
  defaults?: Record<string, Record<string, string>>;
}

/**
 * Merge the per-layer `defaults` of a contract into one locale map. Labels are
 * unique across layers (ADR-069 D5), so the merge cannot collide; order follows
 * the contract so the generated adapter is deterministic.
 */
export function mergeLayerDefaults(contract: ModuleContract): Record<string, Record<string, string>> | undefined {
  let merged: Record<string, Record<string, string>> | undefined;
  for (const layer of contract.layers ?? []) {
    for (const [locale, copy] of Object.entries(layer.defaults ?? {})) {
      merged ??= {};
      merged[locale] ??= {};
      Object.assign(merged[locale], copy);
    }
  }
  return merged;
}

/** Emit the locale→copy literal the generated adapter carries (ADR-074). */
function defaultsLiteral(defaults: Record<string, Record<string, string>>): string {
  const locales = Object.keys(defaults).map((locale) => {
    const entries = Object.entries(defaults[locale])
      .map(([key, copy]) => `    ${key}: ${JSON.stringify(copy)},`)
      .join("\n");
    return `  ${JSON.stringify(locale)}: {\n${entries}\n  },`;
  });
  return `const DEFAULTS: Record<string, Record<string, string | undefined> | undefined> = {\n${locales.join(
    "\n",
  )}\n};\n`;
}

/** Deterministic adapter source; already formatted for the ecosystem style guide. */
export function adapterSource(input: AdapterInput): string {
  const hook = `use${pascalCase(input.name)}Labels`;
  const qualifiedNamespace = `${input.namespace}.${input.name}`;
  const single = input.layers.length === 1 ? input.layers[0] : undefined;
  const defaults = input.defaults;

  const imports = single
    ? `import type { ${single.labelsType} } from "${moduleSpecifier(single.entry, input.name)}";`
    : input.layers
        .map((layer) => `import type { ${layer.labelsType} } from "${moduleSpecifier(layer.entry, input.name)}";`)
        .join("\n");
  const labelsType = single ? single.labelsType : `${pascalCase(input.name)}ModuleLabels`;
  const alias = single
    ? ""
    : `\n/** Union of the block's layer label types; the host fills one namespace. */\nexport type ${labelsType} = ${input.layers
        .map((layer) => layer.labelsType)
        .join(" & ")};\n`;

  const nextIntl =
    defaults === undefined
      ? `import { useTranslations } from "next-intl";`
      : `import { useLocale, useTranslations } from "next-intl";`;

  const entries = input.labels
    .map((label) => `    ${label}: ${defaults === undefined ? `t("${label}")` : `label("${label}")`},`)
    .join("\n");

  const defaultsBlock =
    defaults === undefined
      ? ""
      : `\n/**\n * Default copy declared by the module contract (ADR-074). The host dictionary\n * wins; these values fill the labels the host leaves out.\n */\n${defaultsLiteral(defaults)}\n`;

  const resolution =
    defaults === undefined
      ? `  const t = useTranslations("${qualifiedNamespace}");`
      : `  const t = useTranslations("${qualifiedNamespace}");
  const locale = useLocale();
  const defaults = DEFAULTS[locale];
  if (defaults === undefined) {
    throw new Error(
      "Module '${input.name}' has no default copy for locale '" + locale + "'. Add its defaults to the registry module.",
    );
  }
  /**
   * The contract keys are a superset of the typed host dictionary: a label the
   * host omits comes from DEFAULTS, so it cannot be part of the message-key
   * union. Read through a loose signature instead of narrowing the key type.
   */
  const translate = t as unknown as (key: string) => string;
  const has = t.has as unknown as (key: string) => boolean;
  /** Host copy wins; a label the host omits falls back to the module default. */
  const label = (key: string): string => {
    if (has(key)) return translate(key);
    const copy = defaults[key];
    if (copy === undefined) {
      throw new Error("Module '${input.name}' is missing copy for '" + key + "' in locale '" + locale + "'.");
    }
    return copy;
  };`;

  return `"use client";

// Generated by \`fewbie modules adapters\` from the ${input.name} module contract.
// Regenerate after \`fewbie modules update\`; edit the registry module instead.

${nextIntl}

${imports}
${alias}${defaultsBlock}
/** Labels for the \`${input.name}\` module, resolved from the \`${qualifiedNamespace}\` namespace. */
export function ${hook}(): ${labelsType} {
${resolution}
  return {
${entries}
  };
}
`;
}

export interface AdapterPlan {
  name: string;
  target: string;
  content: string;
}

/** Build the generated adapter for one loaded module. */
export async function planAdapter(module: LoadedModule, namespace: string): Promise<AdapterPlan> {
  const contract = module.manifest.contract;
  if (contract === undefined) {
    throw new CliError(
      `Registry module '${module.manifest.name}' has no contract; add one before generating its i18n adapter (ADR-057).`,
    );
  }

  // A block declares its layers (ADR-069 D5); v1 modules scan the whole payload.
  const layers: AdapterLayer[] = [];
  for (const layer of contract.layers ?? []) {
    layers.push({
      labelsType: await detectLabelsType(module, layer.labels, [layer.types]),
      entry: layer.types,
    });
  }
  if (layers.length === 0) {
    layers.push({ labelsType: await detectLabelsType(module), entry: contract.entry });
  }
  const typeNames = layers.map((layer) => layer.labelsType);
  if (new Set(typeNames).size !== typeNames.length) {
    throw new CliError(
      `Registry module '${module.manifest.name}': layers export the same labels type twice ` +
        `(${typeNames.join(", ")}); give each layer's labels interface a distinct name.`,
    );
  }

  const defaults = mergeLayerDefaults(contract);
  return {
    name: module.manifest.name,
    target: adapterTarget(module.manifest.name),
    content: adapterSource({
      name: module.manifest.name,
      labels: contract.labels,
      layers,
      namespace,
      ...(defaults === undefined ? {} : { defaults }),
    }),
  };
}

interface PrettierLike {
  resolveConfig(file: string): Promise<Record<string, unknown> | null>;
  format(source: string, options: Record<string, unknown>): string;
}

/** The project's own prettier, or null when it is not installed there. */
function loadProjectPrettier(projectRoot: string): PrettierLike | null {
  try {
    const projectRequire = createRequire(path.join(projectRoot, "package.json"));
    return projectRequire("prettier") as PrettierLike;
  } catch {
    return null;
  }
}

/**
 * Normalize a source file for comparison: prettier with the project's own
 * config when available, otherwise a conservative whitespace normalization
 * (EOL, trailing spaces, blank-line runs, final newline).
 */
async function normalizeSource(projectRoot: string, source: string, target: string): Promise<string> {
  const prettier = loadProjectPrettier(projectRoot);
  if (prettier !== null) {
    const file = path.join(projectRoot, target);
    const options = (await prettier.resolveConfig(file)) ?? {};
    return prettier.format(source, { ...options, filepath: file });
  }
  return (
    source
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => line.replace(/\s+$/, ""))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trimEnd() + "\n"
  );
}

/** Compare generated and on-disk adapter content after normalization. */
export async function adapterMatches(projectRoot: string, plan: AdapterPlan, disk: string): Promise<boolean> {
  const generated = await normalizeSource(projectRoot, plan.content, plan.target);
  const current = await normalizeSource(projectRoot, disk, plan.target);
  return generated === current;
}

function readPath(root: unknown, segments: string[]): unknown {
  let node = root;
  for (const segment of segments) {
    if (node === null || typeof node !== "object" || Array.isArray(node)) return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return node;
}

/**
 * Locale set the host must cover (ADR-074 D3). The framework message files own
 * the language set; a project that predates them falls back to the declared
 * dictionaries' file stems so the gate keeps working during an upgrade.
 */
async function hostLocales(projectRoot: string, declaration: I18nDeclaration): Promise<string[]> {
  const directory = path.dirname(declaration.messages[0]);
  const entries = await fs.readdir(path.join(projectRoot, directory)).catch(() => [] as string[]);
  const framework = entries
    .map((entry) => /^framework\.([^/]+)\.json$/.exec(entry)?.[1])
    .filter((locale): locale is string => locale !== undefined)
    .sort();
  if (framework.length > 0) return framework;
  return declaration.messages.map((file) => path.basename(file, ".json")).sort();
}

/** Dictionary path declared for one locale, or undefined when the host lacks it. */
function messagePathForLocale(declaration: I18nDeclaration, locale: string): string | undefined {
  return declaration.messages.find((file) => path.basename(file, ".json") === locale);
}

/** Problems found in one module's message sub-tree, across every host locale. */
export async function messageKeyProblems(
  projectRoot: string,
  declaration: I18nDeclaration,
  name: string,
  contract: ModuleContract,
): Promise<string[]> {
  const problems: string[] = [];
  const expected = new Set(contract.labels);
  const defaults = mergeLayerDefaults(contract);
  const namespace = [...declaration.namespace.split("."), name].join(".");

  for (const locale of await hostLocales(projectRoot, declaration)) {
    const messagePath = messagePathForLocale(declaration, locale);
    if (messagePath === undefined) {
      problems.push(`No dictionary declared for locale '${locale}': add it to "${MODULES_FILE}" i18n.messages.`);
      continue;
    }
    const raw = await fs.readFile(path.join(projectRoot, messagePath), "utf8").catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new CliError(`${MODULES_FILE}: i18n message file '${messagePath}' does not exist.`);
      }
      throw error;
    });
    let messages: unknown;
    try {
      messages = JSON.parse(raw);
    } catch (error) {
      throw new CliError(`Invalid JSON in ${messagePath}: ${(error as Error).message}`);
    }

    const subtree = readPath(messages, [...declaration.namespace.split("."), name]);
    if (subtree === undefined) {
      problems.push(`${messagePath}: missing namespace "${namespace}".`);
      continue;
    }
    if (subtree === null || typeof subtree !== "object" || Array.isArray(subtree)) {
      problems.push(`${messagePath}: "${namespace}" must be an object of label keys.`);
      continue;
    }

    // A module that carries defaults commits to every framework locale
    // (ADR-074 §5): a new host language must add its module defaults rather
    // than fall through to English at runtime.
    if (defaults !== undefined && defaults[locale] === undefined) {
      problems.push(
        `${messagePath}: the module contract has no '${locale}' defaults; add a '${locale}' block to its layer defaults (ADR-074).`,
      );
    }

    const present = new Set(Object.keys(subtree as Record<string, unknown>));
    const missing = [...expected].filter((key) => !present.has(key));
    const uncovered = missing.filter((key) => defaults?.[locale]?.[key] === undefined);
    const extra = [...present].filter((key) => !expected.has(key));
    if (uncovered.length > 0) {
      problems.push(`${messagePath}: missing label key(s) ${uncovered.join(", ")} in "${namespace}".`);
    }
    if (extra.length > 0) {
      problems.push(
        `${messagePath}: unexpected key(s) ${extra.join(", ")} in "${namespace}" ` +
          "(move host-only copy to another namespace).",
      );
    }
  }

  return problems;
}
