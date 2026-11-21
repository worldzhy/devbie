/**
 * Template ownership registry (ADR-025).
 *
 * Every file the starter template ships is classified explicitly:
 *
 * - framework: the template owns the whole file; template update overwrites the
 *   host copy.
 * - mixed: the framework owns the marked block only; everything outside the
 *   markers belongs to the host and is never rewritten. A missing marker pair
 *   is a defect in the host copy, not something to guess around.
 * - host: shipped once by `fewbie create`, then owned by the host; template
 *   update never touches it.
 * - scaffold: created when missing, then owned by the host; template update
 *   never rewrites its content and only reports a copy that lost the required
 *   snippet (the framework entry point). Adoption is by hand, like Rails'
 *   `app:update` writing `.new` files (ADR-035).
 *
 * Registry items are not listed here: `modules add` / `modules update` own
 * those paths, and template update refuses to run if the two sets ever overlap
 * (see `assertNoRegistryOverlap`).
 *
 * Symlinks are never template assets: a symlink in the template tree is a
 * workspace mount (e.g. `.trae/skills` pointing at a sibling knowledge repo),
 * so `fewbie create` does not copy it and the completeness scan skips it
 * instead of shipping a dangling link (R34-08).
 *
 * Framework runtime dependencies are declared in the same file so the file
 * classification, `template update` and `doctor` read one source instead of
 * each keeping its own copy.
 *
 * Overlapping entries are allowed: a parent subtree (e.g. `src/components/**`,
 * host) and a nested framework subtree (e.g. `src/components/ui/**`) both match
 * the same file, and the longest path wins (ADR-056 D2). Two entries that
 * normalize to the same root are ambiguous, which is a template defect and is
 * rejected at startup rather than resolved silently.
 *
 * Framework files are protected against silent host edits by a baseline
 * manifest shipped with the template (`.fewbie/framework.json`, ADR-056 D3):
 * path -> sha256 of the framework copy the host last received. `template update`
 * updates a framework file silently only when the host copy still matches the
 * baseline; any other divergence is reported as a `modified-framework` conflict
 * that can only be resolved by porting the host change into the template or
 * restoring the framework copy. There is deliberately no `--force`.
 */
import { createHash } from "node:crypto";

export const FRAMEWORK_MARKER_START = "/* fewbie:framework:start */";
export const FRAMEWORK_MARKER_END = "/* fewbie:framework:end */";

/** Baseline manifest shipped inside every project (ADR-056 D3). */
export const FRAMEWORK_MANIFEST_PATH = ".fewbie/framework.json";
export const FRAMEWORK_MANIFEST_VERSION = 1;

/** Marker pair delimiting the framework-owned block of a mixed file. */
export interface TemplateMarkers {
  start: string;
  end: string;
}

const DEFAULT_MARKERS: TemplateMarkers = { start: FRAMEWORK_MARKER_START, end: FRAMEWORK_MARKER_END };

export type TemplateOwnership = "framework" | "mixed" | "host" | "scaffold";

export interface TemplateAsset {
  /** POSIX-style path relative to the project / template root. */
  path: string;
  ownership: TemplateOwnership;
  note?: string;
  /** Marker pair of a mixed file; defaults to the CSS comment markers. */
  markers?: TemplateMarkers;
  /**
   * Required for `scaffold` assets: a snippet every adopted copy must contain.
   * One substring check decides adoption, so no TypeScript is parsed.
   */
  requiredSnippet?: string;
}

/** Marker pair of an asset: the explicit override or the default CSS markers. */
export function assetMarkers(asset: TemplateAsset): TemplateMarkers {
  return asset.markers ?? DEFAULT_MARKERS;
}

export const TEMPLATE_ASSETS: readonly TemplateAsset[] = [
  // Scaffold: created once, then owned by the host. Its content is never
  // rewritten; template update only reports a copy that lost the framework
  // entry point, so the framework's defaults and invariants can keep reaching
  // existing hosts through next.config.framework.ts (ADR-035).
  {
    path: "next.config.ts",
    ownership: "scaffold",
    requiredSnippet: 'from "./next.config.framework"',
    note: "host config calls withFewbie(); defaults and invariants live in next.config.framework.ts",
  },

  // Framework-owned: the template version wins.
  { path: "next.config.framework.ts", ownership: "framework" },
  { path: "tsconfig.json", ownership: "framework" },
  { path: "postcss.config.mjs", ownership: "framework" },
  { path: "eslint.config.mjs", ownership: "framework" },
  { path: "components.json", ownership: "framework" },
  { path: "src/instrumentation.ts", ownership: "framework" },
  { path: "src/lib/utils.ts", ownership: "framework" },

  // Mixed: the marked block is framework-owned, the rest is host content.
  {
    path: "src/app/globals.css",
    ownership: "mixed",
    note: "design tokens live inside the marker block; host-specific tokens stay outside it",
  },
  {
    path: "AGENTS.md",
    ownership: "mixed",
    note: "the framework block carries the agent usage contract; project instructions stay outside it",
    markers: { start: "<!-- fewbie:framework:start -->", end: "<!-- fewbie:framework:end -->" },
  },
  {
    path: ".prettierignore",
    ownership: "mixed",
    note: "build outputs and dependency directories live inside the marker block; host ignores (e.g. .trae) stay outside it",
    markers: { start: "# fewbie:framework:start", end: "# fewbie:framework:end" },
  },
  {
    path: ".env.example",
    ownership: "mixed",
    note: "the framework block lists variables framework-owned files read; host and registry-module variables stay outside it",
    markers: { start: "# fewbie:framework:start", end: "# fewbie:framework:end" },
  },

  // Framework-owned UI and layout assets (ADR-056 D1). The host keeps its
  // business components and host copy under the same parent paths, so these
  // nested entries rely on longest-prefix resolution (D2).
  { path: "src/components/ui/**", ownership: "framework" },
  { path: "src/framework/**", ownership: "framework" },
  { path: "src/lib/api-client/**", ownership: "framework" },
  {
    path: "src/i18n/config.ts",
    ownership: "framework",
    note: "locale list and message loading are framework policy",
  },
  { path: "src/i18n/request.ts", ownership: "framework" },
  {
    path: "src/i18n/messages/framework.en.json",
    ownership: "framework",
    note: "framework namespace; host messages live in src/i18n/messages/<host>.*.json",
  },
  { path: "src/i18n/messages/framework.zh.json", ownership: "framework" },
  {
    path: "src/app/layout.tsx",
    ownership: "framework",
    note: "root layout is framework-owned; hosts inject widgets through slots (ADR-056 D5)",
  },
  // Baseline of the framework files above (ADR-056 D3). It is never compared
  // against itself, so update always takes the template copy.
  { path: FRAMEWORK_MANIFEST_PATH, ownership: "framework" },

  // Host-owned: distributed once by create, then never touched by template update.
  // Workspace metadata rather than framework content: the agent-session ledger
  // is copied once, and `.trae/skills` is a symlink the scan and create both
  // skip (see the file header).
  { path: ".trae/**", ownership: "host", note: "workspace ledger and skill mount; symlinks are never copied" },
  { path: "src/app/page.tsx", ownership: "host" },
  { path: "src/app/favicon.ico", ownership: "host" },
  { path: "src/components/**", ownership: "host" },
  { path: "src/i18n/**", ownership: "host" },
  { path: "src/smoke.test.ts", ownership: "host" },
  { path: "package.json", ownership: "host" },
  { path: "README.md", ownership: "host" },
  { path: "next-env.d.ts", ownership: "host" },
  { path: "CLAUDE.md", ownership: "host" },
  { path: ".gitignore", ownership: "host" },
  { path: ".githooks/**", ownership: "host" },
  { path: ".github/**", ownership: "host" },
  // Build contract for the production image. Shipped once: hosts layer in
  // their own image recipes (dev images, extra stages), so template update
  // must not overwrite them. The framework's standalone requirement lives in
  // the framework-owned next.config.ts instead.
  { path: "Dockerfile", ownership: "host" },
  { path: ".dockerignore", ownership: "host" },
];

/** Template files template update manages (creates, or keeps in sync). */
export function isSyncableAsset(asset: TemplateAsset): boolean {
  return asset.ownership === "framework" || asset.ownership === "mixed" || asset.ownership === "scaffold";
}

export const SYNCABLE_ASSETS: readonly TemplateAsset[] = TEMPLATE_ASSETS.filter(isSyncableAsset);

/** A framework runtime dependency declared by framework-owned files. */
export interface FrameworkDependency {
  /** npm package name (version is owned by the template's package.json). */
  name: string;
  /** Framework-owned file(s) that import it; shown by template update and doctor. */
  importedBy: string;
}

/**
 * Non-baseline npm packages imported by framework-owned runtime/build files
 * (ADR-025). package.json stays host-owned, so `template update` / `doctor`
 * can only detect these through this list. `next` / `react` are the baseline
 * of any Next.js project and deliberately excluded. Packages are declared
 * without versions: the template's package.json owns those.
 */
export const FRAMEWORK_DEPENDENCIES: readonly FrameworkDependency[] = [
  { name: "next-intl", importedBy: "next.config.ts, src/i18n/config.ts, src/app/layout.tsx" },
  { name: "@devbie/heartbeat-sdk", importedBy: "src/instrumentation.ts" },
  { name: "cn", importedBy: "src/lib/utils.ts" },
  { name: "babel-plugin-react-compiler", importedBy: "next.config.framework.ts (reactCompiler)" },
  { name: "@tailwindcss/postcss", importedBy: "postcss.config.mjs" },
  { name: "tailwindcss", importedBy: "src/app/globals.css" },
  { name: "tw-animate-css", importedBy: "src/app/globals.css" },
  { name: "shadcn", importedBy: "src/app/globals.css (shadcn/tailwind.css)" },
];

/**
 * True when a registry path matches `filePath`: a path ending in `/**` owns its
 * whole subtree, any other path is an exact file.
 */
export function assetCoversPath(asset: TemplateAsset, filePath: string): boolean {
  if (asset.path.endsWith("/**")) {
    const prefix = asset.path.slice(0, -3);
    return filePath === prefix || filePath.startsWith(`${prefix}/`);
  }
  return filePath === asset.path;
}

/** Normalize a registry path: drop a leading `./` and trailing slashes. */
export function normalizeAssetPath(assetPath: string): string {
  return assetPath.replace(/^\.\//, "").replace(/\/+$/, "");
}

/** Path depth used for longest-prefix resolution (`a/**` and `a` are equal). */
function assetDepth(asset: TemplateAsset): number {
  const normalized = normalizeAssetPath(asset.path);
  return (normalized.endsWith("/**") ? normalized.slice(0, -3) : normalized).length;
}

/**
 * The asset that owns `filePath` (ADR-056 D2): the longest matching path wins,
 * so `src/components/ui/**` beats `src/components/**`. Returns null when no
 * entry matches (an unclassified template file).
 */
export function resolveTemplateAsset(
  filePath: string,
  assets: readonly TemplateAsset[] = TEMPLATE_ASSETS,
): TemplateAsset | null {
  const matches = assets.filter((asset) => assetCoversPath(asset, filePath));
  if (matches.length === 0) return null;
  return matches.reduce((best, candidate) => (assetDepth(candidate) > assetDepth(best) ? candidate : best));
}

export interface AmbiguousOwnership {
  /** Normalized path root shared by the conflicting entries. */
  path: string;
  ownerships: TemplateOwnership[];
}

/**
 * Registry entries whose normalized roots collide (e.g. `a` twice, or `a` and
 * `a/**`). Longest-prefix resolution cannot decide between them, so the
 * registry is a template defect (ADR-056 D2 / acceptance 3) and update refuses
 * to run instead of picking one silently.
 */
export function findAmbiguousTemplatePaths(assets: readonly TemplateAsset[] = TEMPLATE_ASSETS): AmbiguousOwnership[] {
  const byRoot = new Map<string, TemplateAsset[]>();
  for (const asset of assets) {
    const root = normalizeAssetPath(asset.path).replace(/\/\*\*$/, "");
    byRoot.set(root, [...(byRoot.get(root) ?? []), asset]);
  }
  return [...byRoot.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([path, entries]) => ({ path, ownerships: entries.map((entry) => entry.ownership) }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** sha256 of a file's text content, hex-encoded (ADR-056 D3 baseline). */
export function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/** Baseline manifest shipped as `.fewbie/framework.json` (ADR-056 D3). */
export interface FrameworkManifest {
  version: number;
  algorithm: "sha256";
  /** Asset path -> sha256 of the framework copy the host last received. */
  files: Record<string, string>;
}

/**
 * Build the baseline manifest from a map of concrete template file paths.
 * Ownership is resolved per path, so `/**` subtrees (e.g. `src/components/ui/**`)
 * are recorded file by file; the manifest itself is never listed.
 */
export function buildFrameworkManifest(
  templateFiles: ReadonlyMap<string, string | null>,
  assets: readonly TemplateAsset[] = TEMPLATE_ASSETS,
): FrameworkManifest {
  const files: Record<string, string> = {};
  for (const [filePath, content] of templateFiles) {
    if (content == null || filePath === FRAMEWORK_MANIFEST_PATH) continue;
    if (resolveTemplateAsset(filePath, assets)?.ownership !== "framework") continue;
    files[filePath] = hashContent(content);
  }
  return { version: FRAMEWORK_MANIFEST_VERSION, algorithm: "sha256", files };
}

/** Deterministic serialization: sorted keys, two-space indent, trailing newline. */
export function serializeFrameworkManifest(manifest: FrameworkManifest): string {
  const files = Object.fromEntries(Object.entries(manifest.files).sort(([a], [b]) => a.localeCompare(b)));
  return `${JSON.stringify({ ...manifest, files }, null, 2)}\n`;
}

/**
 * Parse a baseline manifest. Returns null for malformed content so callers can
 * report it as a project defect instead of crashing on JSON.parse.
 */
export function parseFrameworkManifest(raw: string): FrameworkManifest | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const candidate = parsed as { version?: unknown; algorithm?: unknown; files?: unknown };
  if (candidate.version !== FRAMEWORK_MANIFEST_VERSION || candidate.algorithm !== "sha256") return null;
  if (typeof candidate.files !== "object" || candidate.files === null || Array.isArray(candidate.files)) return null;
  const files: Record<string, string> = {};
  for (const [filePath, hash] of Object.entries(candidate.files)) {
    if (typeof hash !== "string" || hash.length === 0) return null;
    files[filePath] = hash;
  }
  return { version: FRAMEWORK_MANIFEST_VERSION, algorithm: "sha256", files };
}

/**
 * Directories and file names excluded from the ownership-completeness guard:
 * runtime outputs, VCS metadata and the per-project lockfile. Ignore entries
 * are matched against the basename, so a real template file must be classified
 * rather than ignored here (`.trae/documents/backlog.md` is covered by the
 * `.trae/**` host-owned entry).
 */
const SCAN_IGNORED_DIRECTORIES: ReadonlySet<string> = new Set([
  ".git",
  ".idea",
  ".vscode",
  ".next",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "storybook-static",
]);
const SCAN_IGNORED_FILES: ReadonlySet<string> = new Set([".DS_Store", ".env", ".env.local", "package-lock.json"]);
const SCAN_IGNORED_SUFFIXES: readonly string[] = [".tsbuildinfo"];

/** True for runtime outputs and per-project files excluded from the guard. */
export function isTemplateScanIgnored(filePath: string): boolean {
  const segments = filePath.split("/");
  if (segments.some((segment) => SCAN_IGNORED_DIRECTORIES.has(segment))) return true;
  const base = segments[segments.length - 1];
  if (SCAN_IGNORED_FILES.has(base)) return true;
  return SCAN_IGNORED_SUFFIXES.some((suffix) => base.endsWith(suffix));
}

/**
 * Strip block and whole-line comments before matching a required snippet.
 * A commented-out `import … from "./next.config.framework"` still contains the
 * snippet text, so plain `includes` counted it as adopted (R34-07).
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/**
 * Template files absent from the ownership registry (ADR-025: every shipped
 * file is classified). Runs against the template tree, so a newly added
 * framework file cannot ship unclassified.
 */
export function findUnclassifiedTemplateFiles(filePaths: Iterable<string>): string[] {
  return [...filePaths].filter((filePath) => resolveTemplateAsset(filePath) === null).sort();
}

/** Extract the framework marker block (markers included); null when absent. */
export function extractMarkerBlock(content: string, markers: TemplateMarkers = DEFAULT_MARKERS): string | null {
  const start = content.indexOf(markers.start);
  const end = content.indexOf(markers.end);
  if (start === -1 || end === -1 || end < start) return null;
  return content.slice(start, end + markers.end.length);
}

/** Replace the framework marker block inside `content`; null when absent. */
export function replaceMarkerBlock(
  content: string,
  block: string,
  markers: TemplateMarkers = DEFAULT_MARKERS,
): string | null {
  const current = extractMarkerBlock(content, markers);
  if (current === null) return null;
  return content.replace(current, block);
}

/** Content compared for an asset: the marker block for mixed files. */
function comparable(asset: TemplateAsset, content: string): string {
  if (asset.ownership !== "mixed") return content;
  const block = extractMarkerBlock(content, assetMarkers(asset));
  if (block === null) {
    throw new Error(`Template ${asset.path} is missing the framework block.`);
  }
  return block;
}

/**
 * `modified-framework` is a host edit of a framework-owned file: the host copy
 * diverges from the recorded baseline, so overwriting it would lose work and
 * there is no `--force` (ADR-056 D3). It is never auto-fixable.
 */
export type TemplateChangeKind = "create" | "update" | "missing-markers" | "scaffold-outdated" | "modified-framework";

export interface TemplateChange {
  asset: TemplateAsset;
  kind: TemplateChangeKind;
  /** Content the project file should have afterwards; null when not auto-fixable. */
  nextContent: string | null;
  /** "Current" side of the diff (normalized to the compared region). */
  currentComparable: string | null;
  /** "Template" side of the diff (same normalization). */
  templateComparable: string | null;
  /** Recorded baseline hash for a framework asset; null when none was recorded. */
  baselineHash?: string | null;
}

/**
 * Compute the update plan. `projectFiles` / `templateFiles` map each asset path
 * to its content, or null when absent.
 *
 * `baseline` is the framework baseline manifest (`path -> sha256`) the project
 * last received. It is optional so the older call shape keeps working, but
 * omitting it disables conflict detection: a project without a manifest is
 * treated as pre-manifest and upgraded like before. When it is provided, a
 * framework file whose host copy no longer matches its baseline becomes a
 * `modified-framework` conflict instead of an update (ADR-056 D3).
 *
 * Throws when the template itself is malformed (a mixed file lacks markers):
 * that is a template defect, not a project state.
 */
export function planTemplateUpdate(
  projectFiles: ReadonlyMap<string, string | null>,
  templateFiles: ReadonlyMap<string, string | null>,
  assets: readonly TemplateAsset[] = SYNCABLE_ASSETS,
  baseline?: Readonly<Record<string, string>>,
): TemplateChange[] {
  const changes: TemplateChange[] = [];

  for (const asset of assets) {
    const templateContent = templateFiles.get(asset.path);
    // The template dropped this file; nothing to update.
    if (templateContent == null) continue;

    const projectContent = projectFiles.get(asset.path);
    if (projectContent == null) {
      changes.push({
        asset,
        kind: "create",
        nextContent: templateContent,
        currentComparable: null,
        templateComparable: comparable(asset, templateContent),
      });
      continue;
    }

    // Scaffold content belongs to the host; only a copy that lost the required
    // snippet is reported, and it is never rewritten for the host.
    if (asset.ownership === "scaffold") {
      const snippet = asset.requiredSnippet;
      if (snippet && !withoutComments(projectContent).includes(snippet)) {
        changes.push({
          asset,
          kind: "scaffold-outdated",
          nextContent: null,
          currentComparable: null,
          templateComparable: templateContent,
        });
      }
      continue;
    }

    if (asset.ownership === "mixed") {
      const markers = assetMarkers(asset);
      const templateBlock = extractMarkerBlock(templateContent, markers);
      if (templateBlock === null) {
        throw new Error(
          `Template ${asset.path} is missing the framework markers ` + `(${markers.start} / ${markers.end}).`,
        );
      }
      const projectBlock = extractMarkerBlock(projectContent, markers);
      if (projectBlock === null) {
        changes.push({
          asset,
          kind: "missing-markers",
          nextContent: null,
          currentComparable: null,
          templateComparable: templateBlock,
        });
        continue;
      }
      if (projectBlock !== templateBlock) {
        changes.push({
          asset,
          kind: "update",
          nextContent: replaceMarkerBlock(projectContent, templateBlock, markers),
          currentComparable: projectBlock,
          templateComparable: templateBlock,
        });
      }
      continue;
    }

    if (projectContent === templateContent) continue;

    // ADR-056 D3: a framework file is upgraded silently only while the host
    // copy still matches the baseline it received. A project with no manifest
    // at all is pre-manifest (legacy host) and keeps the old update behavior;
    // once a manifest exists, any other divergence is a conflict. The manifest
    // itself is metadata about other files, never compared against itself.
    if (baseline !== undefined && asset.path !== FRAMEWORK_MANIFEST_PATH) {
      const projectHash = hashContent(projectContent);
      const recorded = baseline[asset.path];
      if (recorded !== projectHash) {
        changes.push({
          asset,
          kind: "modified-framework",
          nextContent: null,
          currentComparable: projectContent,
          templateComparable: templateContent,
          baselineHash: recorded ?? null,
        });
        continue;
      }
    }

    changes.push({
      asset,
      kind: "update",
      nextContent: templateContent,
      currentComparable: projectContent,
      templateComparable: templateContent,
    });
  }

  return changes;
}
