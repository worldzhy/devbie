import fs from "node:fs/promises";
import path from "node:path";
import { bold, cyan, green, yellow } from "colorette";

import { listRegistryItemNames, loadItem, resolveRegistryRoot } from "../../registry/store";
import { CliError, readTextIfExists } from "@devbie/cli-kit";
import {
  assetMarkers,
  findUnclassifiedTemplateFiles,
  FRAMEWORK_DEPENDENCIES,
  isTemplateScanIgnored,
  planTemplateUpdate,
  SYNCABLE_ASSETS,
  TemplateAsset,
  TemplateChange,
} from "../../lib/template-ownership";
import { missingPackages } from "../../lib/npm-spec";
import { unifiedDiff } from "../../lib/diff";
import { resolveTemplate } from "../create";

export interface TemplateUpdateOptions {
  /** Project root (global --cwd). */
  cwd: string;
  /** Path prefix filter (e.g. "src/app/"); empty means every syncable asset. */
  paths?: string[];
  /** CI gate: print the diff and exit non-zero when anything drifts. */
  check?: boolean;
  /**
   * Assert every template file is classified (ADR-025: unlisted = error).
   * Template repository CI opts in; a created project keeps its own business
   * files, which are not template assets, so its copied gate must not run this.
   */
  registryComplete?: boolean;
  dryRun?: boolean;
  templatePath?: string;
  templateRef?: string;
}

/** True when an asset path is equal to or nested under a filter prefix. */
function matchesPathFilter(filePath: string, filter: string): boolean {
  const normalized = filter.replace(/^\.\//, "").replace(/\/+$/, "");
  if (normalized === "") return true;
  return filePath === normalized || filePath.startsWith(`${normalized}/`);
}

function filterAssets(paths: string[] | undefined): readonly TemplateAsset[] {
  if (!paths || paths.length === 0) return SYNCABLE_ASSETS;
  const selected = SYNCABLE_ASSETS.filter((asset) => paths.some((prefix) => matchesPathFilter(asset.path, prefix)));
  if (selected.length === 0) {
    throw new CliError(`No framework-managed template files match the path filter: ${paths.join(", ")}`);
  }
  return selected;
}

/**
 * Every file a registry item owns. Template update must never manage one of
 * these (ADR-025 clause 4); an overlap is a classification defect.
 */
async function collectRegistryTargets(): Promise<Set<string>> {
  const registryRoot = await resolveRegistryRoot();
  const names = await listRegistryItemNames(registryRoot);
  const targets = new Set<string>();
  for (const name of names) {
    const item = await loadItem(registryRoot, name);
    for (const file of item.files) targets.add(file.target);
  }
  return targets;
}

/** True when the template root is the project root itself (template checkout). */
async function isSelfComparison(templateRoot: string, projectRoot: string): Promise<boolean> {
  try {
    const [templateReal, projectReal] = await Promise.all([fs.realpath(templateRoot), fs.realpath(projectRoot)]);
    return templateReal === projectReal;
  } catch {
    return false;
  }
}

/** POSIX-style paths of every file the template ships, excluding runtime output. */
async function listTemplateFiles(root: string): Promise<string[]> {
  const found: string[] = [];

  async function walk(relativeDir: string): Promise<void> {
    const entries = await fs.readdir(path.join(root, relativeDir), { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = relativeDir === "" ? entry.name : `${relativeDir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (isTemplateScanIgnored(relativePath)) continue;
        await walk(relativePath);
      } else if (entry.isFile() && !isTemplateScanIgnored(relativePath)) {
        found.push(relativePath);
      }
    }
  }

  await walk("");
  return found;
}

/**
 * ADR-025 guard: every template file must be classified in the ownership
 * registry (unclassified = error). Runs against the template tree, so the
 * template repository's CI catches a newly added, unclassified file before it
 * reaches any host.
 */
async function assertTemplateRegistryComplete(templateRoot: string): Promise<void> {
  const unclassified = findUnclassifiedTemplateFiles(await listTemplateFiles(templateRoot));
  if (unclassified.length === 0) return;
  throw new CliError(
    `Template file(s) missing from the ownership registry (ADR-025):\n  - ${unclassified.join("\n  - ")}\n` +
      "Classify each one in TEMPLATE_ASSETS (packages/fewbie-cli/src/lib/template-ownership.ts).",
  );
}

function printChange(change: TemplateChange): void {
  if (change.kind === "missing-markers") {
    const markers = assetMarkers(change.asset);
    console.warn(
      yellow(
        `! ${change.asset.path}: framework markers (${markers.start} / ${markers.end}) ` +
          "not found; cannot update this file. Add them back to re-enable template update.",
      ),
    );
    return;
  }

  if (change.kind === "scaffold-outdated") {
    console.warn(
      yellow(
        `! ${change.asset.path}: the host copy does not reference the framework entry point ` +
          `(${change.asset.requiredSnippet}). Template update never rewrites a scaffold file; adopt this ` +
          "shape by hand:",
      ),
    );
    if (change.templateComparable !== null) process.stdout.write(change.templateComparable);
    return;
  }

  const label = change.asset.path;
  const kindLabel = change.kind === "create" ? "missing in project" : "differs from template";
  console.info(bold(`\n# ${label} (${kindLabel})`));
  const aLabel = change.currentComparable === null ? "/dev/null" : `a/${label}`;
  process.stdout.write(
    unifiedDiff(change.currentComparable ?? "", change.templateComparable ?? "", aLabel, `b/${label}`),
  );
}

export async function runTemplateUpdate(options: TemplateUpdateOptions): Promise<void> {
  const projectRoot = path.resolve(options.cwd);
  const assets = filterAssets(options.paths);
  const scope = options.paths && options.paths.length > 0 ? options.paths.join(", ") : null;

  const template = await resolveTemplate({
    templatePath: options.templatePath,
    templateRef: options.templateRef,
    cwd: projectRoot,
  });
  try {
    console.info(cyan(`Template source: ${template.source}`));
    if (scope) console.info(cyan(`Scope: ${scope} (${assets.length} template files)`));

    if (options.registryComplete) await assertTemplateRegistryComplete(template.root);

    const registryTargets = await collectRegistryTargets();
    const overlap = assets.filter((asset) => registryTargets.has(asset.path));
    if (overlap.length > 0) {
      throw new CliError(
        `Template update and the registry both own: ${overlap.map((asset) => asset.path).join(", ")}. ` +
          "Reclassify them in ADR-025 before updating.",
      );
    }

    if (await isSelfComparison(template.root, projectRoot)) {
      if (options.registryComplete) {
        console.info(green(bold("✓ Ownership registry covers every template file")));
      }
      console.warn(
        yellow(
          "Template source is the project root itself, so content drift cannot be detected by comparing a tree " +
            "with itself. This run only enforced " +
            (options.registryComplete ? "the ownership registry and overlap guards" : "the ownership-overlap guard") +
            "; drift gates belong in consuming projects (`fewbie template update --check`).",
        ),
      );
      return;
    }

    // ADR-025: package.json stays host-owned, so framework dependencies can
    // only be reported here. Writing the framework files below without them
    // would leave a project that cannot build.
    const missingFrameworkDependencies = await missingPackages(
      projectRoot,
      FRAMEWORK_DEPENDENCIES.map((dependency) => dependency.name),
    );
    if (missingFrameworkDependencies.length > 0) {
      const detail = FRAMEWORK_DEPENDENCIES.filter((dependency) =>
        missingFrameworkDependencies.includes(dependency.name),
      ).map((dependency) => `${dependency.name} (required by ${dependency.importedBy})`);
      const install = `npm install ${missingFrameworkDependencies.join(" ")}`;
      if (options.check) {
        throw new CliError(`Missing framework dependencies:\n  - ${detail.join("\n  - ")}\nRun \`${install}\` first.`);
      }
      console.warn(
        yellow(
          `! Framework dependencies missing from package.json:\n  - ${detail.join("\n  - ")}\n  Run \`${install}\`.`,
        ),
      );
    }

    const projectFiles = new Map<string, string | null>();
    const templateFiles = new Map<string, string | null>();
    for (const asset of assets) {
      projectFiles.set(asset.path, await readTextIfExists(path.join(projectRoot, asset.path)));
      templateFiles.set(asset.path, await readTextIfExists(path.join(template.root, asset.path)));
    }

    let changes: TemplateChange[];
    try {
      changes = planTemplateUpdate(projectFiles, templateFiles, assets);
    } catch (error) {
      throw new CliError((error as Error).message);
    }

    if (changes.length === 0) {
      const suffix = scope ? ` (scope: ${scope})` : "";
      console.info(green(bold(`✓ Project template files are up to date with the template${suffix}.`)));
      return;
    }

    const actionable = changes.filter((change) => change.kind === "create" || change.kind === "update");
    for (const change of changes) printChange(change);

    console.info(
      `\n${actionable.length} template file(s) to update: ` +
        actionable.map((change) => `${change.asset.path} (${change.kind})`).join(", "),
    );

    if (options.check) {
      const command = scope ? `fewbie template update ${scope}` : "fewbie template update";
      throw new CliError(
        `${changes.length} template file(s) drift from the template (${actionable.length} auto-fixable). ` +
          `Run \`${command}\` to apply the template version.`,
      );
    }

    if (options.dryRun) {
      console.info("[dry-run] no files were modified");
      return;
    }

    for (const change of actionable) {
      if (change.nextContent === null) continue;
      const target = path.join(projectRoot, change.asset.path);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, change.nextContent);
    }
    const skipped = changes.length - actionable.length;
    if (skipped > 0) console.warn(yellow(`\n${skipped} file(s) left untouched (missing markers or host adoption).`));
    console.info(green(bold("\n✓ Template files updated.")));
    console.info("Review with `git diff`, then commit on a branch and open a PR.");
  } finally {
    await template.cleanup?.();
  }
}
