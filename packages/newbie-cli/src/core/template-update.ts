/**
 * Template file ownership registry (ADR-009 D4).
 *
 * Every file shipped by the starter template is classified explicitly:
 *
 * - framework-whole-file: the template owns the whole file and consuming
 *   projects receive it byte-identical (deploy stack, tsconfigs, main.ts...).
 * - framework-marker-block: only the @@newbie-framework block is updated; the
 *   host owns everything outside the markers (.env.example, .gitignore,
 *   prisma/schema.prisma).
 * - generated: rendered by `newbie modules apply` from the installed module set;
 *   template update must not compare or overwrite it.
 * - template-shipped-host-owned: distributed once by `newbie create`, then
 *   owned by the host; never overwritten by template update.
 *
 * A template file missing from this registry is a template defect and is
 * reported by the guard (ADR-009 D4: unlisted = error), mirroring the
 * check-template-deps convention.
 *
 * Two files carry fragments rendered by `newbie modules apply` inside otherwise
 * framework-owned content: the `schemas = [...]` line of prisma/schema.prisma
 * and the @@newbie-modules block of deploy/Caddyfile.tmpl. Those fragments are
 * ignored when comparing and preserved when applying the template version.
 */

import { compareStrings, MODULES_MARKER_END, MODULES_MARKER_START } from "./env-file";

/** Comment prefix of the @@newbie-framework markers in a given file type. */
export type MarkerSyntax = "//" | "#";

export interface FrameworkMarkers {
  start: string;
  end: string;
}

/** Marker lines of a file that carries a @@newbie-framework block. */
export function frameworkMarkers(syntax: MarkerSyntax = "//"): FrameworkMarkers {
  return {
    start: `${syntax} @@newbie-framework-start`,
    end: `${syntax} @@newbie-framework-end`,
  };
}

export type TemplateFileOwnership =
  "framework-whole-file" | "framework-marker-block" | "generated" | "template-shipped-host-owned";

/**
 * Fragment inside a framework-owned file rendered by `newbie modules apply`:
 * a whole marker block (Caddyfile route block) or a single line (prisma
 * datasource schemas array).
 */
export type RenderedFragment = { kind: "line"; pattern: RegExp } | { kind: "block"; start: string; end: string };

export interface TemplateFile {
  /** POSIX-style path relative to the project / template root. */
  path: string;
  ownership: TemplateFileOwnership;
  /** Marker syntax for framework-marker-block files. */
  markerSyntax?: MarkerSyntax;
  /** Assembly-rendered fragment; ignored in comparison, preserved on write. */
  rendered?: RenderedFragment;
}

/**
 * Full ownership registry of the 31 tracked starter-template files
 * (package-lock.json is per-project by nature and excluded, see
 * TEMPLATE_SCAN_IGNORED_FILES).
 */
export const TEMPLATE_FILES: readonly TemplateFile[] = [
  // Framework-owned, byte-identical in every consuming project.
  { path: "src/main.ts", ownership: "framework-whole-file" },
  { path: "tsconfig.json", ownership: "framework-whole-file" },
  { path: "tsconfig.build.json", ownership: "framework-whole-file" },
  { path: "nest-cli.json", ownership: "framework-whole-file" },
  { path: "prisma.config.ts", ownership: "framework-whole-file" },

  // Framework deploy stack (ADR-006 / ADR-008 D1): static files stay
  // byte-identical; only the module block of the Caddyfile is rendered.
  { path: "deploy/compose.framework.yml", ownership: "framework-whole-file" },
  {
    path: "deploy/Caddyfile.tmpl",
    ownership: "framework-whole-file",
    rendered: { kind: "block", start: MODULES_MARKER_START, end: MODULES_MARKER_END },
  },
  { path: "deploy/scripts/lib.sh", ownership: "framework-whole-file" },
  { path: "deploy/scripts/render-env.sh", ownership: "framework-whole-file" },
  { path: "deploy/scripts/deploy.sh", ownership: "framework-whole-file" },
  { path: "deploy/scripts/start.sh", ownership: "framework-whole-file" },
  { path: "deploy/scripts/backup.sh", ownership: "framework-whole-file" },
  { path: "deploy/scripts/provision.sh", ownership: "framework-whole-file" },

  // Framework block only; host content outside the markers is never touched.
  { path: ".env.example", ownership: "framework-marker-block", markerSyntax: "#" },
  { path: ".gitignore", ownership: "framework-marker-block", markerSyntax: "#" },
  {
    path: "prisma/schema.prisma",
    ownership: "framework-marker-block",
    markerSyntax: "//",
    // `schemas` is rendered by reconcileDatasourceSchemas (module namespaces).
    rendered: { kind: "line", pattern: /^\s*schemas\s*=.*$/m },
  },

  // Assembly products; rendered by `newbie modules apply` / `newbie modules update`.
  { path: "src/modules/modules.config.ts", ownership: "generated" },
  { path: "src/modules/modules.module.ts", ownership: "generated" },
  { path: "deploy/compose.modules.yml", ownership: "generated" },

  // Shipped once by `newbie create`; the host owns them afterwards.
  { path: "package.json", ownership: "template-shipped-host-owned" },
  { path: ".githooks/pre-commit", ownership: "template-shipped-host-owned" },
  { path: ".githooks/commit-msg", ownership: "template-shipped-host-owned" },
  { path: "README.md", ownership: "template-shipped-host-owned" },
  { path: ".prettierignore", ownership: "template-shipped-host-owned" },
  { path: "eslint.config.mjs", ownership: "template-shipped-host-owned" },
  { path: "prisma/seed.ts", ownership: "template-shipped-host-owned" },
  { path: "src/application/application.controller.ts", ownership: "template-shipped-host-owned" },
  { path: "src/application/application.module.ts", ownership: "template-shipped-host-owned" },
  { path: "deploy/compose.application.yml", ownership: "template-shipped-host-owned" },
  { path: "deploy/clickhouse/config.d/memory.xml", ownership: "template-shipped-host-owned" },
  { path: ".github/dependabot.yml", ownership: "template-shipped-host-owned" },
  { path: ".github/workflows/ci.yml", ownership: "template-shipped-host-owned" },
  { path: ".github/workflows/dependabot-triage.yml", ownership: "template-shipped-host-owned" },
];

/** Files that never participate in template update (owned by no one file class). */
export function isUpdatableTemplateFile(file: TemplateFile): boolean {
  return file.ownership === "framework-whole-file" || file.ownership === "framework-marker-block";
}

const UPDATABLE_FILES: readonly TemplateFile[] = TEMPLATE_FILES.filter(isUpdatableTemplateFile);

/**
 * Directories and file names excluded from the unclassified-file guard:
 * runtime outputs, VCS metadata and the per-project lockfile.
 */
export const TEMPLATE_SCAN_IGNORED_DIRECTORIES: ReadonlySet<string> = new Set([
  ".git",
  ".idea",
  ".vscode",
  ".newbie",
  "coverage",
  "dist",
  "generated",
  "node_modules",
]);
export const TEMPLATE_SCAN_IGNORED_FILES: ReadonlySet<string> = new Set([".DS_Store", ".env", "package-lock.json"]);
export const TEMPLATE_SCAN_IGNORED_SUFFIXES: readonly string[] = [".tsbuildinfo"];

/**
 * Template files absent from the ownership registry (ADR-009 D4: unlisted =
 * error). `paths` are POSIX-style paths relative to the template root, already
 * filtered by the caller against TEMPLATE_SCAN_IGNORED_*.
 */
export function findUnclassifiedTemplateFiles(paths: Iterable<string>): string[] {
  const registered = new Set(TEMPLATE_FILES.map((file) => file.path));
  return [...paths].filter((filePath) => !registered.has(filePath)).sort(compareStrings);
}

/** Extract the framework marker block (markers included); null when absent. */
export function extractMarkerBlock(content: string, syntax: MarkerSyntax = "//"): string | null {
  const markers = frameworkMarkers(syntax);
  const start = content.indexOf(markers.start);
  const end = content.indexOf(markers.end);
  if (start === -1 || end === -1 || end < start) return null;
  return content.slice(start, end + markers.end.length);
}

/**
 * Replace the framework marker block inside `content` with `block`.
 * Returns null when `content` has no complete marker block.
 */
export function replaceMarkerBlock(content: string, block: string, syntax: MarkerSyntax = "//"): string | null {
  const current = extractMarkerBlock(content, syntax);
  if (current === null) return null;
  return content.replace(current, block);
}

/** Extract the assembly-rendered fragment; null when absent. */
function extractRendered(content: string, fragment: RenderedFragment): string | null {
  if (fragment.kind === "line") {
    return content.match(fragment.pattern)?.[0] ?? null;
  }
  const start = content.indexOf(fragment.start);
  const end = content.indexOf(fragment.end);
  if (start === -1 || end === -1 || end < start) return null;
  return content.slice(start, end + fragment.end.length);
}

/** Replace the assembly-rendered fragment; null when absent. */
function replaceRendered(content: string, fragment: RenderedFragment, replacement: string): string | null {
  if (fragment.kind === "line") {
    if (content.match(fragment.pattern) === null) return null;
    return content.replace(fragment.pattern, () => replacement);
  }
  const start = content.indexOf(fragment.start);
  const end = content.indexOf(fragment.end);
  if (start === -1 || end === -1 || end < start) return null;
  return content.slice(0, start) + replacement + content.slice(end + fragment.end.length);
}

/** Drop the assembly-rendered fragment so rendered content never counts as drift. */
function stripRendered(content: string, fragment: RenderedFragment): string {
  if (fragment.kind === "line") {
    return content
      .split("\n")
      .filter((line) => line.match(fragment.pattern) === null)
      .join("\n");
  }
  const current = extractRendered(content, fragment);
  return current === null ? content : content.replace(current, "");
}

/**
 * Carry the project's rendered fragment over to the template version, so an
 * update never destroys assembly output.
 */
function carryRendered(
  templateContent: string,
  projectContent: string,
  fragment: RenderedFragment,
  filePath: string,
): string {
  const projectFragment = extractRendered(projectContent, fragment);
  if (projectFragment === null) return templateContent;
  const next = replaceRendered(templateContent, fragment, projectFragment);
  if (next === null) {
    throw new Error(`Template ${filePath} is missing the assembly-rendered fragment expected by the registry.`);
  }
  return next;
}

/** Content compared for a file, normalized to exclude assembly output. */
function comparable(file: TemplateFile, content: string): string {
  let next = content;
  if (file.rendered) next = stripRendered(next, file.rendered);
  if (file.ownership === "framework-marker-block") {
    const block = extractMarkerBlock(next, file.markerSyntax);
    if (block === null) {
      throw new Error(`Template ${file.path} is missing the framework block.`);
    }
    next = block;
  }
  return next;
}

export type TemplateChangeKind = "create" | "update" | "missing-markers";

export interface TemplateChange {
  file: TemplateFile;
  kind: TemplateChangeKind;
  /**
   * Content the project file should have after applying the change.
   * Null for "missing-markers" (nothing can be applied automatically).
   */
  nextContent: string | null;
  /** "Current" side of the diff (normalized: framework block / no rendered fragment). */
  currentComparable: string | null;
  /** "Template" side of the diff (same normalization). */
  templateComparable: string | null;
}

/**
 * Compute the update plan for `files` (defaults to every updatable registry
 * entry). `projectFiles` / `templateFiles` map each path to its content, or
 * null when the file does not exist.
 *
 * Throws when the template itself is malformed (missing framework block or
 * missing assembly-rendered fragment) — that is a template defect, not a
 * project state.
 */
export function planTemplateUpdate(
  projectFiles: ReadonlyMap<string, string | null>,
  templateFiles: ReadonlyMap<string, string | null>,
  files: readonly TemplateFile[] = UPDATABLE_FILES,
): TemplateChange[] {
  const changes: TemplateChange[] = [];

  for (const file of files) {
    const templateContent = templateFiles.get(file.path);
    // The template dropped this file; nothing to update.
    if (templateContent == null) continue;
    const projectContent = projectFiles.get(file.path);

    if (projectContent == null) {
      changes.push({
        file,
        kind: "create",
        nextContent: templateContent,
        currentComparable: null,
        templateComparable: comparable(file, templateContent),
      });
      continue;
    }

    if (file.ownership === "framework-marker-block") {
      const markers = frameworkMarkers(file.markerSyntax);
      const templateBlock = extractMarkerBlock(templateContent, file.markerSyntax);
      if (templateBlock === null) {
        throw new Error(
          `Template ${file.path} is missing the framework block ` + `(${markers.start} / ${markers.end}).`,
        );
      }
      const projectBlock = extractMarkerBlock(projectContent, file.markerSyntax);
      if (projectBlock === null) {
        changes.push({
          file,
          kind: "missing-markers",
          nextContent: null,
          currentComparable: null,
          templateComparable: comparable(file, templateContent),
        });
        continue;
      }
      const templateComparable = comparable(file, templateContent);
      const projectComparable = comparable(file, projectContent);
      if (projectComparable !== templateComparable) {
        const carried = file.rendered
          ? carryRendered(templateContent, projectContent, file.rendered, file.path)
          : templateContent;
        const nextBlock = extractMarkerBlock(carried, file.markerSyntax);
        const nextContent =
          nextBlock === null ? null : replaceMarkerBlock(projectContent, nextBlock, file.markerSyntax);
        changes.push({
          file,
          kind: "update",
          nextContent,
          currentComparable: projectComparable,
          templateComparable,
        });
      }
      continue;
    }

    // framework-whole-file strategy
    const projectComparable = comparable(file, projectContent);
    const templateComparable = comparable(file, templateContent);
    if (projectComparable !== templateComparable) {
      changes.push({
        file,
        kind: "update",
        nextContent: file.rendered
          ? carryRendered(templateContent, projectContent, file.rendered, file.path)
          : templateContent,
        currentComparable: projectComparable,
        templateComparable,
      });
    }
  }

  return changes;
}
