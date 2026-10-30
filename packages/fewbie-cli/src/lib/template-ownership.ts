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
 *
 * Registry items are not listed here: `modules add` / `modules update` own
 * those paths, and template update refuses to run if the two sets ever overlap
 * (see `assertNoRegistryOverlap`).
 */

export const FRAMEWORK_MARKER_START = "/* fewbie:framework:start */";
export const FRAMEWORK_MARKER_END = "/* fewbie:framework:end */";

/** Marker pair delimiting the framework-owned block of a mixed file. */
export interface TemplateMarkers {
  start: string;
  end: string;
}

const DEFAULT_MARKERS: TemplateMarkers = { start: FRAMEWORK_MARKER_START, end: FRAMEWORK_MARKER_END };

export type TemplateOwnership = "framework" | "mixed" | "host";

export interface TemplateAsset {
  /** POSIX-style path relative to the project / template root. */
  path: string;
  ownership: TemplateOwnership;
  note?: string;
  /** Marker pair of a mixed file; defaults to the CSS comment markers. */
  markers?: TemplateMarkers;
}

/** Marker pair of an asset: the explicit override or the default CSS markers. */
export function assetMarkers(asset: TemplateAsset): TemplateMarkers {
  return asset.markers ?? DEFAULT_MARKERS;
}

export const TEMPLATE_ASSETS: readonly TemplateAsset[] = [
  // Framework-owned: the template version wins.
  { path: "next.config.ts", ownership: "framework" },
  { path: "tsconfig.json", ownership: "framework" },
  { path: "postcss.config.mjs", ownership: "framework" },
  { path: "eslint.config.mjs", ownership: "framework" },
  { path: "components.json", ownership: "framework" },
  { path: ".prettierignore", ownership: "framework" },
  { path: ".env.example", ownership: "framework" },
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

  // Host-owned: distributed once by create, then never touched by template update.
  { path: "src/app/layout.tsx", ownership: "host" },
  { path: "src/app/page.tsx", ownership: "host" },
  { path: "src/components/**", ownership: "host" },
  { path: "package.json", ownership: "host" },
  { path: "README.md", ownership: "host" },
  { path: "next-env.d.ts", ownership: "host" },
  { path: "CLAUDE.md", ownership: "host" },
];

/** Template files whose content template update manages. */
export function isSyncableAsset(asset: TemplateAsset): boolean {
  return asset.ownership === "framework" || asset.ownership === "mixed";
}

export const SYNCABLE_ASSETS: readonly TemplateAsset[] = TEMPLATE_ASSETS.filter(isSyncableAsset);

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

export type TemplateChangeKind = "create" | "update" | "missing-markers";

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
