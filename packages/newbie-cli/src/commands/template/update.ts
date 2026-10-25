import fs from "node:fs/promises";
import path from "node:path";
import { bold, cyan, green, yellow } from "colorette";

import {
  findUnclassifiedTemplateFiles,
  frameworkMarkers,
  isUpdatableTemplateFile,
  planTemplateUpdate,
  TEMPLATE_FILES,
  TEMPLATE_SCAN_IGNORED_DIRECTORIES,
  TEMPLATE_SCAN_IGNORED_FILES,
  TEMPLATE_SCAN_IGNORED_SUFFIXES,
  TemplateChange,
  TemplateFile,
} from "../../core/template-update";
import { unifiedDiff } from "../../core/unified-diff";
import { CliError } from "@devbie/cli-kit";
import { createSink } from "../../lib/sink";
import { GlobalOptions } from "../shared";
import { resolveTemplate, TemplateReference } from "../create";

export interface TemplateUpdateOptions extends GlobalOptions, TemplateReference {
  /** CI gate mode: print the diff and exit non-zero when anything drifts. */
  check?: boolean;
  /**
   * Restrict the update scope to template files under these path prefixes
   * (e.g. ["deploy/"] guards only the ADR-006 deploy assets in CI).
   * Empty/undefined means every updatable template file.
   */
  paths?: string[];
}

/** True when a template file path is equal to or nested under a filter prefix. */
function matchesPathFilter(filePath: string, filter: string): boolean {
  const normalized = filter.replace(/^\.\//, "").replace(/\/+$/, "");
  if (normalized === "") return true;
  return filePath === normalized || filePath.startsWith(`${normalized}/`);
}

function filterTemplateFiles(paths: string[] | undefined): readonly TemplateFile[] {
  const updatable = TEMPLATE_FILES.filter(isUpdatableTemplateFile);
  if (!paths || paths.length === 0) return updatable;
  const selected = updatable.filter((file) => paths.some((p) => matchesPathFilter(file.path, p)));
  if (selected.length === 0) {
    throw new CliError(`No framework-managed template files match the path filter: ${paths.join(", ")}`);
  }
  return selected;
}

async function readOrNull(root: string, rel: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(root, rel), "utf8");
  } catch {
    return null;
  }
}

/** True for runtime outputs and per-project files excluded from the guard. */
function isScanIgnored(relPath: string): boolean {
  const segments = relPath.split("/");
  if (segments.some((segment) => TEMPLATE_SCAN_IGNORED_DIRECTORIES.has(segment))) return true;
  const base = segments[segments.length - 1];
  if (TEMPLATE_SCAN_IGNORED_FILES.has(base)) return true;
  return TEMPLATE_SCAN_IGNORED_SUFFIXES.some((suffix) => base.endsWith(suffix));
}

/** POSIX-style paths of every file the template ships, excluding runtime output. */
async function listTemplateFiles(root: string): Promise<string[]> {
  const found: string[] = [];

  async function walk(relDir: string): Promise<void> {
    const dirents = await fs.readdir(path.join(root, relDir), { withFileTypes: true });
    for (const dirent of dirents) {
      const relPath = relDir === "" ? dirent.name : `${relDir}/${dirent.name}`;
      if (dirent.isDirectory()) {
        if (TEMPLATE_SCAN_IGNORED_DIRECTORIES.has(dirent.name)) continue;
        await walk(relPath);
      } else if (dirent.isFile() && !isScanIgnored(relPath)) {
        found.push(relPath);
      }
    }
  }

  await walk("");
  return found;
}

/**
 * ADR-009 D4 guard: every template file must be classified in the ownership
 * registry. Runs against the template (newbie-starter CI passes its own root
 * via --template-path .), so a newly added template file cannot ship
 * unclassified.
 */
async function assertTemplateRegistryComplete(templateRoot: string): Promise<void> {
  const unclassified = findUnclassifiedTemplateFiles(await listTemplateFiles(templateRoot));
  if (unclassified.length === 0) return;
  throw new CliError(
    `Template file(s) missing from the ownership registry (ADR-009 D4):\n  - ${unclassified.join("\n  - ")}\n` +
      "Classify each one in TEMPLATE_FILES (packages/newbie-cli/src/core/template-update.ts).",
  );
}

function printChangeDiff(change: TemplateChange): void {
  const label = change.file.path;
  if (change.kind === "missing-markers") {
    const markers = frameworkMarkers(change.file.markerSyntax);
    console.warn(
      yellow(
        `! ${label}: framework markers (${markers.start} / ${markers.end}) ` +
          "not found; skipping. Add them back to re-enable template update.",
      ),
    );
    return;
  }

  const kindLabel = change.kind === "create" ? "missing in project" : "differs from template";
  console.info(bold(`\n# ${label} (${kindLabel})`));

  const aLabel = change.currentComparable === null ? "/dev/null" : `a/${label}`;
  const diff = unifiedDiff(change.currentComparable ?? "", change.templateComparable ?? "", aLabel, `b/${label}`);
  process.stdout.write(diff);
}

export async function runTemplateUpdate(options: TemplateUpdateOptions): Promise<void> {
  const cwd = path.resolve(options.cwd);
  const sink = createSink(cwd, options.dryRun);
  const templateFiles = filterTemplateFiles(options.paths);
  const scope = options.paths && options.paths.length > 0 ? options.paths.join(", ") : null;

  const template = await resolveTemplate(options);
  console.info(cyan(`Template source: ${template.source}`));
  if (scope) {
    console.info(cyan(`Scope: ${scope} (${templateFiles.length} template files)`));
  }

  await assertTemplateRegistryComplete(template.root);

  const projectFiles = new Map<string, string | null>();
  const templateContents = new Map<string, string | null>();
  for (const file of templateFiles) {
    projectFiles.set(file.path, await readOrNull(cwd, file.path));
    templateContents.set(file.path, await readOrNull(template.root, file.path));
  }

  let changes: TemplateChange[];
  try {
    changes = planTemplateUpdate(projectFiles, templateContents, templateFiles);
  } catch (error) {
    throw new CliError((error as Error).message);
  }

  if (changes.length === 0) {
    const suffix = scope ? ` (scope: ${scope})` : "";
    console.info(green(bold(`✓ Project template files are up to date with the template${suffix}.`)));
    return;
  }

  const actionable = changes.filter((c) => c.kind !== "missing-markers");
  for (const change of changes) {
    printChangeDiff(change);
  }

  console.info(
    `\n${actionable.length} template file(s) to update: ` +
      actionable.map((c) => `${c.file.path} (${c.kind})`).join(", "),
  );

  if (options.check) {
    const command = scope ? `newbie template update ${scope}` : "newbie template update";
    throw new CliError(
      `${changes.length} template file(s) drift from the template ` +
        `(${actionable.length} auto-fixable). ` +
        `Run \`${command}\` to apply the template version.`,
    );
  }

  for (const change of actionable) {
    if (change.nextContent !== null) {
      await sink.writeText(change.file.path, change.nextContent);
    }
  }
  if (options.dryRun) {
    console.info("[dry-run] no files were modified");
  } else {
    console.info(green(bold("\n✓ Template files updated.")));
    console.info("Review with `git diff`, then commit on a branch and open a PR.");
  }
}
