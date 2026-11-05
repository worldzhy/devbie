/**
 * Pure parsing/normalisation of `newbie.module.json`, the per-module manifest
 * that replaced the legacy `.newbie/<key>.settings.json` bundle.
 *
 * The manifest lives at the root of every module directory, both inside the
 * newbie-modules registry and in the consuming project (`src/modules/<key>`).
 *
 * Schema (ADR-034):
 *   key / layer          — identity domain (2 keys)
 *   wiring               — functional: NestJS entry + Prisma fragment + CLI namespace
 *   requires             — functional: module deps + env + config + npm packages
 *   collector            — metadata: collector-protocol participation + peer SDK
 *   deprecated           — metadata: end-of-life notice
 *
 * Unknown top-level or nested fields fail loudly (strict whitelist, not
 * fail-open). Empty child objects are omitted so the JSON stays minimal.
 */

/** Architectural layer of a module. */
const VALID_LAYERS = new Set(["datastore", "infrastructure", "capability", "feature"]);

export interface EnvDescriptor {
  type?: string;
  /** Sample value written to `.env` / `.env.example`; never a runtime default. */
  example?: string | number | boolean;
  description?: string;
}

export type EnvDeclaration = string | EnvDescriptor;

/** Fields an object-form env declaration may carry (ADR-033). */
const ENV_DECLARATION_FIELDS = ["type", "example", "description"] as const;

export interface ModuleWiring {
  /** NestJS module file without extension, e.g. "account.module". */
  file: string;
  /** Exported NestJS module class name, e.g. "AccountModule". */
  className: string;
  /** Project-relative path of the Prisma model fragment; absent = no models. */
  prismaSchema?: string;
  /**
   * Namespace this module registers under the Newbie CLI. When declared,
   * `newbie modules apply` loads `<modulesDir>/<key>/cli/index.ts` at
   * startup and registers the exported `register(parent, options)` hook
   * under this namespace. Produces `newbie <namespace> <subcommand>`.
   */
  newbieCli?: string;
}

export interface ModuleRequires {
  /** Registry module keys this module imports via `@modules/<key>`. */
  modules?: string[];
  env?: Record<string, EnvDeclaration>;
  /**
   * Arbitrary config object that the consumer's config-service should inject.
   * May reference `process.env.<VAR>` — every referenced key must also be
   * declared in `env` (bidirectional guard, ADR-033).
   */
  config?: Record<string, unknown>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export interface ModuleCollector {
  /**
   * Package name of the companion SDK that ships with this module's side of
   * the collector protocol, or `null` when the SDK package has not been
   * published yet (e.g. backend-monitor). Omit the whole object entirely
   * when the module does not participate in the collector protocol.
   */
  peerSdk: string | null;
}

export interface ModuleManifest {
  key: string;
  /** Architectural layer of the module; absent for framework-special modules. */
  layer?: string;
  wiring: ModuleWiring;
  requires?: ModuleRequires;
  collector?: ModuleCollector;
  /**
   * Deprecation notice. When declared (non-empty string), the module is at
   * end-of-life: the interactive picker (`newbie modules`) hides it and
   * `newbie modules add` refuses to install it into a project
   * that does not already have it, and `newbie doctor` emits a notice for
   * hosts where it is still enabled. Already-installed hosts keep working —
   * deprecation gates new adoption, not existing deployments. The string is
   * the reason / successor guidance surfaced in those messages.
   */
  deprecated?: string;
}

// — Strict whitelists —

const VALID_TOP_LEVEL = new Set<keyof ModuleManifest>([
  "key",
  "layer",
  "wiring",
  "requires",
  "collector",
  "deprecated",
]);

const VALID_WIRING_FIELDS = new Set<keyof ModuleWiring>(["file", "className", "prismaSchema", "newbieCli"]);

const VALID_REQUIRES_FIELDS = new Set<keyof ModuleRequires>([
  "modules",
  "env",
  "config",
  "dependencies",
  "devDependencies",
]);

// — Guards —

function assertTopLevelKeys(data: Record<string, unknown>, key: string): void {
  for (const field of Object.keys(data)) {
    if (!VALID_TOP_LEVEL.has(field as keyof ModuleManifest)) {
      throw new Error(
        `Invalid newbie.module.json for '${key}': unknown top-level field '${field}'. ` +
          `Supported fields: ${[...VALID_TOP_LEVEL].join(", ")}.`,
      );
    }
  }
}

function assertWiringFieldKeys(data: Record<string, unknown>, key: string): void {
  for (const field of Object.keys(data)) {
    if (!VALID_WIRING_FIELDS.has(field as keyof ModuleWiring)) {
      throw new Error(
        `Invalid newbie.module.json for '${key}': wiring.${field} is not supported. ` +
          `Supported wiring fields: ${[...VALID_WIRING_FIELDS].join(", ")}.`,
      );
    }
  }
}

function assertRequiresFieldKeys(data: Record<string, unknown>, key: string): void {
  for (const field of Object.keys(data)) {
    if (!VALID_REQUIRES_FIELDS.has(field as keyof ModuleRequires)) {
      throw new Error(
        `Invalid newbie.module.json for '${key}': requires.${field} is not supported. ` +
          `Supported requires fields: ${[...VALID_REQUIRES_FIELDS].join(", ")}.`,
      );
    }
  }
}

function assertStringMap(value: unknown, fieldPath: string, key: string): void {
  if (value === undefined) return;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      `Invalid newbie.module.json for '${key}': '${fieldPath}' must be a string → version map when declared.`,
    );
  }
  for (const [pkg, version] of Object.entries(value as Record<string, unknown>)) {
    if (typeof version !== "string" || version.length === 0) {
      throw new Error(
        `Invalid newbie.module.json for '${key}': '${fieldPath}.${pkg}' must be a non-empty string when declared.`,
      );
    }
  }
}

function assertOptionalString(value: unknown, field: string, key: string): void {
  if (value === undefined) return;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid newbie.module.json for '${key}': '${field}' must be a non-empty string when declared.`);
  }
}

function assertOptionalLayer(value: unknown, key: string): void {
  if (value === undefined) return;
  if (typeof value !== "string" || !VALID_LAYERS.has(value)) {
    throw new Error(
      `Invalid newbie.module.json for '${key}': 'layer' must be one of ${[...VALID_LAYERS].join(", ")} when declared.`,
    );
  }
}

/** Validate and normalise the optional `requires.modules` declaration. */
function normalizeModuleDependencies(raw: unknown, key: string): string[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || !raw.every((item) => typeof item === "string" && item.trim().length > 0)) {
    throw new Error(`Invalid newbie.module.json for '${key}': requires.modules must be an array of non-empty strings.`);
  }
  return [...new Set(raw.map((item) => (item as string).trim()))];
}

/**
 * Validate and normalise the optional `env` declaration map (ADR-033).
 *
 * Object declarations accept exactly `type`, `example` and `description`.
 * The pre-ADR-033 field name `default` is rejected loudly rather than
 * silently ignored: it read as a runtime fallback while it only ever seeded
 * `.env.example`, which is how a required production key ends up missing
 * from the secret.
 */
function normalizeEnvDeclarations(raw: unknown, key: string): Record<string, EnvDeclaration> | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`Invalid newbie.module.json for '${key}': 'env' must map variable names to declarations.`);
  }

  const result: Record<string, EnvDeclaration> = {};
  for (const [envKey, declaration] of Object.entries(raw as Record<string, unknown>)) {
    if (envKey.trim().length === 0) {
      throw new Error(`Invalid newbie.module.json for '${key}': 'env' contains an empty variable name.`);
    }
    if (typeof declaration === "string") {
      result[envKey] = declaration;
      continue;
    }
    if (!declaration || typeof declaration !== "object" || Array.isArray(declaration)) {
      throw new Error(
        `Invalid newbie.module.json for '${key}': env '${envKey}' must be a string or an object declaration.`,
      );
    }

    const fields = declaration as Record<string, unknown>;
    for (const field of Object.keys(fields)) {
      if ((ENV_DECLARATION_FIELDS as readonly string[]).includes(field)) continue;
      const hint =
        field === "default"
          ? " 'default' was renamed to 'example' (ADR-033): it seeds .env.example only, never a runtime value."
          : "";
      throw new Error(
        `Invalid newbie.module.json for '${key}': env '${envKey}' declares unsupported field '${field}'. ` +
          `Supported fields: ${ENV_DECLARATION_FIELDS.join(", ")}.${hint}`,
      );
    }

    assertOptionalString(fields.type, `env '${envKey}'.type`, key);
    assertOptionalString(fields.description, `env '${envKey}'.description`, key);
    const example = fields.example;
    if (example !== undefined && !["string", "number", "boolean"].includes(typeof example)) {
      throw new Error(
        `Invalid newbie.module.json for '${key}': env '${envKey}'.example must be a string, number or boolean when declared.`,
      );
    }
    result[envKey] = fields as EnvDescriptor;
  }
  return result;
}

/** Matches a `process.env.<NAME>` reference inside a config expression. */
const ENV_REFERENCE = /process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g;

/**
 * Collect every environment variable a config block reads. Used by the guards
 * that keep the two manifest blocks in sync: a referenced key must be declared
 * in `env`, and an undeclared reference means the key never reaches
 * `.env.example` or the per-environment secret check (ADR-033).
 */
export function collectEnvReferences(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (typeof value === "string") {
    for (const match of value.matchAll(ENV_REFERENCE)) into.add(match[1]);
    return into;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectEnvReferences(item, into);
    return into;
  }
  if (value && typeof value === "object") {
    collectEnvReferences(Object.values(value), into);
  }
  return into;
}

/**
 * Reject a config block that reads an env key the same manifest never
 * declares: the expression would render into `modules.config.ts`, but the key
 * would be missing from `.env.example` and from every environment's secret —
 * a boot-time failure that only surfaces in production (ADR-033).
 */
function assertEnvReferencesDeclared(
  config: unknown,
  env: Record<string, EnvDeclaration> | undefined,
  key: string,
): void {
  const referenced = collectEnvReferences(config);
  const declared = new Set(Object.keys(env ?? {}));
  const undeclared = [...referenced].filter((name) => !declared.has(name));
  if (undeclared.length === 0) return;
  throw new Error(
    `Invalid newbie.module.json for '${key}': requires.config references environment variable(s) 'env' does not declare: ` +
      `${undeclared.join(", ")}. Declare each one so it reaches .env.example and the secret check (ADR-033).`,
  );
}

function normalizeWiring(raw: unknown, key: string): ModuleWiring {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`Invalid newbie.module.json for '${key}': 'wiring' must be an object.`);
  }
  assertWiringFieldKeys(raw as Record<string, unknown>, key);

  const w = raw as Record<string, unknown>;
  const file = w.file;
  const className = w.className;
  if (typeof file !== "string" || file.length === 0 || typeof className !== "string" || className.length === 0) {
    throw new Error(
      `Invalid newbie.module.json for '${key}': wiring.file and wiring.className are required non-empty strings.`,
    );
  }

  const result: ModuleWiring = { file, className };
  if (typeof w.prismaSchema === "string" && w.prismaSchema.length > 0) {
    result.prismaSchema = w.prismaSchema;
  }
  assertOptionalString(w.newbieCli, "wiring.newbieCli", key);
  if (typeof w.newbieCli === "string" && w.newbieCli.length > 0) {
    result.newbieCli = w.newbieCli;
  }
  return result;
}

function normalizeRequires(raw: unknown, key: string): ModuleRequires | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`Invalid newbie.module.json for '${key}': 'requires' must be an object.`);
  }
  assertRequiresFieldKeys(raw as Record<string, unknown>, key);

  const r = raw as Record<string, unknown>;
  const result: ModuleRequires = {};

  const modules = normalizeModuleDependencies(r.modules, key);
  if (modules) result.modules = modules;

  const env = normalizeEnvDeclarations(r.env, key);
  if (env) result.env = env;

  if (r.config !== undefined) {
    if (!r.config || typeof r.config !== "object" || Array.isArray(r.config)) {
      throw new Error(`Invalid newbie.module.json for '${key}': requires.config must be an object when declared.`);
    }
    result.config = r.config as Record<string, unknown>;
    assertEnvReferencesDeclared(result.config, env, key);
  }

  assertStringMap(r.dependencies, "requires.dependencies", key);
  if (r.dependencies !== undefined) result.dependencies = r.dependencies as Record<string, string>;

  assertStringMap(r.devDependencies, "requires.devDependencies", key);
  if (r.devDependencies !== undefined) result.devDependencies = r.devDependencies as Record<string, string>;

  return result;
}

function normalizeCollector(raw: unknown, key: string): ModuleCollector | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`Invalid newbie.module.json for '${key}': 'collector' must be an object.`);
  }
  const c = raw as Record<string, unknown>;
  if (Object.keys(c).length !== 1 || !("peerSdk" in c)) {
    throw new Error(
      `Invalid newbie.module.json for '${key}': collector must contain exactly one key 'peerSdk' (string or null).`,
    );
  }
  const peerSdk = c.peerSdk;
  if (peerSdk !== null && (typeof peerSdk !== "string" || peerSdk.length === 0)) {
    throw new Error(
      `Invalid newbie.module.json for '${key}': collector.peerSdk must be a non-empty string or null when declared.`,
    );
  }
  return { peerSdk: peerSdk as string | null };
}

export function normalizeModuleManifest(raw: unknown, expectedKey?: string): ModuleManifest {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid newbie.module.json: expected an object.");
  }
  const data = raw as Record<string, unknown>;

  // Strict whitelist: unknown top-level fields fail loudly.
  assertTopLevelKeys(data, data.key as string);

  if (typeof data.key !== "string" || data.key.length === 0) {
    throw new Error("Invalid newbie.module.json: string 'key' is required.");
  }
  if (expectedKey && data.key !== expectedKey) {
    throw new Error(`Invalid newbie.module.json: key '${data.key}' does not match directory '${expectedKey}'.`);
  }

  assertOptionalLayer(data.layer, data.key);
  assertOptionalString(data.deprecated, "deprecated", data.key);

  const wiring = normalizeWiring(data.wiring, data.key);
  const requires = normalizeRequires(data.requires, data.key);
  const collector = normalizeCollector(data.collector, data.key);

  const result: ModuleManifest = {
    key: data.key,
    wiring,
  };
  if (data.layer !== undefined) result.layer = data.layer as string;
  if (requires !== undefined) result.requires = requires;
  if (collector !== undefined) result.collector = collector;
  if (data.deprecated !== undefined) result.deprecated = data.deprecated as string;

  return result;
}

/** Import statement emitted into the generated modules.module.ts. */
export function moduleImportLine(key: string, manifest: ModuleManifest): string {
  return `import {${manifest.wiring.className}} from './${key}/${manifest.wiring.file}';`;
}

/** Validate/sanitise user-supplied module keys against a known key set. */
export function sanitizeModuleNames(names: string[], knownKeys: ReadonlySet<string>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of names.map((name) => name.trim())) {
    if (!knownKeys.has(name) || seen.has(name)) continue;
    seen.add(name);
    result.push(name);
  }
  return result;
}
