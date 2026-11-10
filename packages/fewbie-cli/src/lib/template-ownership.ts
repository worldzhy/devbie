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
 * Framework runtime dependencies are declared in the same file so the file
 * classification, `template update` and `doctor` read one source instead of
 * each keeping its own copy.
 */

export const FRAMEWORK_MARKER_START = "/* fewbie:framework:start */";
export const FRAMEWORK_MARKER_END = "/* fewbie:framework:end */";

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

  // Host-owned: distributed once by create, then never touched by template update.
  { path: "src/app/layout.tsx", ownership: "host" },
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

/**
 * Directories and file names excluded from the ownership-completeness guard:
 * runtime outputs, VCS metadata, the per-project lockfile and the agent-session
 * backlog (a workspace process ledger that exists in the template repo but is
 * not a shipped template asset).
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
const SCAN_IGNORED_FILES: ReadonlySet<string> = new Set([
  ".DS_Store",
  ".env",
  ".env.local",
  "backlog.md",
  "package-lock.json",
]);
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
  return [...filePaths].filter((filePath) => !TEMPLATE_ASSETS.some((asset) => assetCoversPath(asset, filePath))).sort();
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

export type TemplateChangeKind = "create" | "update" | "missing-markers" | "scaffold-outdated";

export interface TemplateChange {
  asset: TemplateAsset;
  kind: TemplateChangeKind;
  /** Content the project file should have afterwards; null when not auto-fixable. */
  nextContent: string | null;
  /** "Current" side of the diff (normalized to the compared region). */
  currentComparable: string | null;
  /** "Template" side of the diff (same normalization). */
  templateComparable: string | null;
}

/**
 * Compute the update plan. `projectFiles` / `templateFiles` map each asset path
 * to its content, or null when absent.
 *
 * Throws when the template itself is malformed (a mixed file lacks markers):
 * that is a template defect, not a project state.
 */
export function planTemplateUpdate(
  projectFiles: ReadonlyMap<string, string | null>,
  templateFiles: ReadonlyMap<string, string | null>,
  assets: readonly TemplateAsset[] = SYNCABLE_ASSETS,
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

    if (projectContent !== templateContent) {
      changes.push({
        asset,
        kind: "update",
        nextContent: templateContent,
        currentComparable: projectContent,
        templateComparable: templateContent,
      });
    }
  }

  return changes;
}
