import fs from "node:fs/promises";
import path from "node:path";
import { bold, cyan, green, yellow } from "colorette";

import { listRegistryItemNames, loadItem } from "../../registry/store";
import { resolveRegistryRoot } from "../../registry/source";
import { CliError, readTextIfExists } from "@devbie/cli-kit";
import {
  assetCoversPath,
  assetMarkers,
  buildFrameworkManifest,
  findAmbiguousTemplatePaths,
  findUnclassifiedTemplateFiles,
  FRAMEWORK_DEPENDENCIES,
  FRAMEWORK_MANIFEST_PATH,
  isTemplateScanIgnored,
  normalizeAssetPath,
  parseFrameworkManifest,
  planTemplateUpdate,
  resolveTemplateAsset,
  serializeFrameworkManifest,
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
  /**
   * Pre-manifest project: record the template framework copy as the baseline
   * instead of refusing. Files the host edited then surface as
   * modified-framework conflicts and stay untouched (R82-02).
   */
  adopt?: boolean;
  templatePath?: string;
  templateRef?: string;
}

/**
 * True when an asset matches a filter prefix.
 *
 * `filePath` is the asset path from the ownership registry, which may be a
 * `<dir>/**` glob; `filter` is a concrete path (or directory) the user passed.
 * The filter is applied before assets are expanded, so a concrete file inside a
 * glob asset (`src/components/ui/button.tsx`) must match `src/components/ui/**`
 * (R82-11).
 */
function matchesPathFilter(filePath: string, filter: string): boolean {
  const normalized = filter.replace(/^\.\//, "").replace(/\/+$/, "");
  if (normalized === "") return true;
  if (filePath.endsWith("/**")) {
    const prefix = filePath.slice(0, -3);
    return normalized === prefix || normalized.startsWith(`${prefix}/`);
  }
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
 * Narrow expanded assets to the concrete paths the user asked for (R83-06).
 * A filter such as `src/components/ui/button.tsx` selects that glob entry, but
 * expanding `src/components/ui/**` would otherwise act on every sibling: the
 * command reports one file and writes many.
 */
function filterExpandedAssets(assets: readonly TemplateAsset[], paths: string[] | undefined): readonly TemplateAsset[] {
  if (!paths || paths.length === 0) return assets;
  return assets.filter((asset) =>
    paths.some((filter) => {
      const normalized = filter.replace(/^\.\//, "").replace(/\/+$/, "");
      if (normalized === "") return true;
      return asset.path === normalized || asset.path.startsWith(`${normalized}/`);
    }),
  );
}

/**
 * Every file a registry item owns. Template update must never manage one of
 * these (ADR-025 clause 4); an overlap is a classification defect.
 */
async function collectRegistryTargets(projectRoot: string): Promise<Set<string>> {
  const registryRoot = await resolveRegistryRoot(projectRoot);
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
export async function listTemplateFiles(root: string): Promise<string[]> {
  const found: string[] = [];

  async function walk(relativeDir: string): Promise<void> {
    const entries = await fs.readdir(path.join(root, relativeDir), { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = relativeDir === "" ? entry.name : `${relativeDir}/${entry.name}`;
      // A symlink is a workspace mount (e.g. `.trae/skills` → a sibling repo),
      // never a template asset; create does not copy it either (R34-08).
      if (entry.isSymbolicLink()) continue;
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

/**
 * Expand `/**` subtree assets into one entry per template file (ADR-056 D1), so
 * `src/components/ui/**` ships and syncs concrete files instead of a literal
 * directory path. Files only the project has are left alone: template update
 * never deletes host content.
 */
function expandGlobAssets(assets: readonly TemplateAsset[], templateFiles: readonly string[]): TemplateAsset[] {
  const expanded: TemplateAsset[] = [];
  for (const asset of assets) {
    if (!asset.path.endsWith("/**")) {
      expanded.push(asset);
      continue;
    }
    for (const filePath of templateFiles) {
      if (assetCoversPath(asset, filePath)) expanded.push({ ...asset, path: filePath });
    }
  }
  return expanded;
}

/**
 * ADR-056 D2 / acceptance 3: two registry entries with the same normalized
 * root make longest-prefix resolution undecidable, so the CLI refuses to run
 * instead of silently picking one.
 */
function assertTemplateOwnershipUnambiguous(): void {
  const ambiguous = findAmbiguousTemplatePaths();
  if (ambiguous.length === 0) return;
  throw new CliError(
    `Template ownership registry is ambiguous (ADR-056):\n  - ${ambiguous
      .map((entry) => `${entry.path} (${entry.ownerships.join(", ")})`)
      .join("\n  - ")}\n` +
      "Longest-prefix resolution cannot decide between them. " +
      "Fix TEMPLATE_ASSETS in packages/fewbie-cli/src/lib/template-ownership.ts.",
  );
}

/**
 * The framework baseline the project last received (ADR-056 D3). Undefined for
 * a pre-manifest host: conflict detection had no baseline to compare against,
 * so `planTemplateUpdate` keeps the legacy upgrade behavior for that run; the
 * manifest shipped by this update takes effect from the next one.
 */
async function readProjectBaseline(projectRoot: string): Promise<Record<string, string> | undefined> {
  const raw = await readTextIfExists(path.join(projectRoot, FRAMEWORK_MANIFEST_PATH));
  if (raw === null) return undefined;
  const manifest = parseFrameworkManifest(raw);
  if (manifest === null) {
    throw new CliError(
      `${FRAMEWORK_MANIFEST_PATH} is malformed or was edited outside the CLI (its digest does not match). ` +
        "Restore the template copy, or delete it to re-adopt the framework files and lose the ability to " +
        "detect host edits.",
    );
  }
  return manifest.files;
}

/**
 * Template repository self-check (ADR-056 D3): the baseline manifest must match
 * the framework files currently in the template. `--check` fails when it is
 * stale; an apply run regenerates it, so `check:template` keeps the template
 * repository honest without a separate command.
 */
async function syncTemplateBaseline(templateRoot: string, check: boolean): Promise<void> {
  const manifest = buildFrameworkManifest(await readTemplateFrameworkFiles(templateRoot));
  const count = Object.keys(manifest.files).length;
  const desired = serializeFrameworkManifest(manifest);
  const target = path.join(templateRoot, FRAMEWORK_MANIFEST_PATH);
  const current = await readTextIfExists(target);

  if (current === desired) {
    console.info(green(`✓ Framework baseline covers ${count} file(s)`));
    return;
  }
  if (check) {
    throw new CliError(
      `${FRAMEWORK_MANIFEST_PATH} is stale (${count} framework file(s) in the template). ` +
        "Regenerate it with `fewbie template update --template-path .` and commit the result.",
    );
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, desired);
  console.info(green(`✓ Regenerated ${FRAMEWORK_MANIFEST_PATH} for ${count} framework file(s).`));
}

/**
 * Read one asset's content with the channel its declaration requires
 * (ADR-061): binary assets stay raw bytes, text assets are decoded as strict
 * UTF-8. A text asset holding non-UTF-8 bytes is a registry defect, not a host
 * problem, so it fails closed instead of being silently replaced with U+FFFD.
 */
async function readAssetContent(root: string, assetPath: string, binary: boolean): Promise<string | Buffer | null> {
  let bytes: Buffer;
  try {
    bytes = await fs.readFile(path.join(root, assetPath));
  } catch {
    return null;
  }
  if (binary) return bytes;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new CliError(
      `${assetPath} is a text framework asset but is not valid UTF-8. ` +
        "Declare it with `binary: true` in TEMPLATE_ASSETS " +
        "(packages/fewbie-cli/src/lib/template-ownership.ts) so template update copies its bytes.",
    );
  }
}

/**
 * Framework asset contents the template ships, keyed by asset path. Every
 * baseline is derived from these bytes, never from a host tree: a host scan
 * records host edits as the baseline, so the next update treats them as
 * unmodified and overwrites them silently (R83-01). Binary assets are read as
 * bytes so the baseline hashes the real file (ADR-061).
 */
async function readTemplateFrameworkFiles(templateRoot: string): Promise<Map<string, string | Buffer | null>> {
  const files = new Map<string, string | Buffer | null>();
  for (const filePath of await listTemplateFiles(templateRoot)) {
    const asset = resolveTemplateAsset(filePath);
    if (asset?.ownership !== "framework") continue;
    files.set(filePath, await readAssetContent(templateRoot, filePath, Boolean(asset.binary)));
  }
  return files;
}

/**
 * Record the framework baseline a project receives (ADR-060 D3). `create` uses
 * it so a new project never starts without a baseline (R82-02); `--adopt` and
 * the first apply run use it to give a pre-manifest host one without
 * overwriting anything. The bytes come from the template, so a host edit stays
 * a modified-framework conflict on every later run instead of becoming the
 * recorded baseline (R83-01).
 */
export async function recordFrameworkBaseline(projectRoot: string, templateRoot: string): Promise<void> {
  const manifest = buildFrameworkManifest(await readTemplateFrameworkFiles(templateRoot));
  const target = path.join(projectRoot, FRAMEWORK_MANIFEST_PATH);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, serializeFrameworkManifest(manifest));
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

  if (change.kind === "modified-framework") {
    const baseline = change.baselineHash ? change.baselineHash.slice(0, 12) : "none recorded";
    const label = change.asset.path;
    console.warn(
      yellow(
        `! ${label}: modified-framework conflict — the host copy diverged from the framework baseline ` +
          `(${baseline}). Template update never overwrites it, and there is no --force.`,
      ),
    );
    console.warn(
      yellow(
        "  Resolve it by porting the host change into fewbie-starter (then regenerate the baseline with " +
          "`fewbie template update --template-path .`) or by restoring the framework copy by hand, then re-run.",
      ),
    );
    if (!change.asset.binary && change.templateComparable !== null) {
      process.stdout.write(
        unifiedDiff(change.currentComparable ?? "", change.templateComparable, `a/${label}`, `b/${label}`),
      );
    }
    return;
  }

  // ADR-061: bytes have no line diff, so binary assets are reported by name.
  if (change.asset.binary) {
    const kindLabel = change.kind === "create" ? "missing in project" : "differs from template";
    console.info(bold(`\n# ${change.asset.path} (${kindLabel}, binary asset)`));
    console.info(yellow("  Binary asset: template update writes the template bytes; no line diff is shown."));
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
  assertTemplateOwnershipUnambiguous();
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

    const registryTargets = await collectRegistryTargets(projectRoot);
    // Registry targets are concrete files while template assets may be
    // subtrees (`src/lib/api-client/**`), so exact-path comparison misses a
    // real overlap (ADR-056 D2).
    const overlap = assets.filter((asset) =>
      [...registryTargets].some((target) => assetCoversPath(asset, normalizeAssetPath(target))),
    );
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
      await syncTemplateBaseline(template.root, Boolean(options.check));
      console.warn(
        yellow(
          "Template source is the project root itself, so content drift cannot be detected by comparing a tree " +
            "with itself. This run only enforced " +
            (options.registryComplete
              ? "the ownership registry, baseline and overlap guards"
              : "the ownership-overlap and baseline guards") +
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

    const templateFileList = await listTemplateFiles(template.root);
    const syncAssets = filterExpandedAssets(expandGlobAssets(assets, templateFileList), options.paths);
    const projectFiles = new Map<string, string | Buffer | null>();
    const templateFiles = new Map<string, string | Buffer | null>();
    for (const asset of syncAssets) {
      const binary = Boolean(asset.binary);
      projectFiles.set(asset.path, await readAssetContent(projectRoot, asset.path, binary));
      templateFiles.set(asset.path, await readAssetContent(template.root, asset.path, binary));
    }

    let baseline = await readProjectBaseline(projectRoot);
    let changes: TemplateChange[];
    try {
      changes = planTemplateUpdate(projectFiles, templateFiles, syncAssets, baseline);
    } catch (error) {
      throw new CliError((error as Error).message);
    }

    // R82-02: a pre-manifest project cannot prove an existing framework file
    // is unmodified, so overwriting it may destroy host edits. Refuse until the
    // host adopts a baseline — `create` writes one, `--adopt` adds one here.
    const overwrites = changes.filter((change) => change.asset.ownership === "framework" && change.kind === "update");
    let adopted = false;
    if (baseline === undefined && overwrites.length > 0) {
      if (!options.adopt) {
        throw new CliError(
          `No ${FRAMEWORK_MANIFEST_PATH} in this project, so host edits of framework files cannot be ` +
            `distinguished from template changes (would overwrite: ${overwrites
              .map((change) => change.asset.path)
              .join(", ")}). Run \`fewbie template update --adopt\` to record the template framework copy as ` +
            "the baseline; files you edited then appear as modified-framework conflicts and stay untouched.",
        );
      }
      baseline = buildFrameworkManifest(await readTemplateFrameworkFiles(template.root)).files;
      changes = planTemplateUpdate(projectFiles, templateFiles, syncAssets, baseline);
      adopted = true;
    } else if (
      baseline === undefined &&
      changes.some((change) => change.asset.ownership === "framework" && change.kind !== "modified-framework")
    ) {
      console.warn(
        yellow(
          `! No ${FRAMEWORK_MANIFEST_PATH} in this project: host edits of framework files cannot be detected on ` +
            "this run. Review the diff before committing; the manifest written by this update protects later runs.",
        ),
      );
    }

    if (changes.length === 0) {
      // A project already matching the template still needs a baseline for the
      // next run; `--check` and `--dry-run` never write (R82-02).
      if (!options.check && !options.dryRun && (adopted || baseline === undefined)) {
        await recordFrameworkBaseline(projectRoot, template.root);
      }
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
      // Only create/update are auto-fixable. Telling a red CI to "run update"
      // for a missing marker pair or a scaffold that lost its entry point would
      // loop: the apply run warns, writes nothing and exits 0 (R83-05).
      const countOf = (kind: TemplateChange["kind"]): number => changes.filter((change) => change.kind === kind).length;
      const manual: string[] = [];
      const conflicts = countOf("modified-framework");
      if (conflicts > 0) {
        manual.push(`${conflicts} modified-framework conflict(s) must be resolved by hand (no --force).`);
      }
      const missingMarkers = countOf("missing-markers");
      if (missingMarkers > 0) {
        manual.push(`${missingMarkers} file(s) lost the framework marker pair; restore it by hand.`);
      }
      const scaffoldOutdated = countOf("scaffold-outdated");
      if (scaffoldOutdated > 0) {
        manual.push(`${scaffoldOutdated} scaffold file(s) lost the required framework snippet; add it by hand.`);
      }
      const apply =
        actionable.length > 0 ? `Run \`${command}\` to apply the ${actionable.length} auto-fixable file(s).` : "";
      const resolution = [apply, ...manual].filter((part) => part !== "").join(" ");
      throw new CliError(
        `${changes.length} template file(s) drift from the template (${actionable.length} auto-fixable). ${resolution}`,
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
    // Record the baseline whenever this run started without one, so the next
    // update can tell host edits from template changes (R82-02).
    if (adopted || baseline === undefined) await recordFrameworkBaseline(projectRoot, template.root);
    const skipped = changes.length - actionable.length;
    if (skipped > 0) {
      console.warn(yellow(`\n${skipped} file(s) left untouched (conflicts, missing markers or host adoption).`));
    }
    console.info(green(bold("\n✓ Template files updated.")));
    console.info("Review with `git diff`, then commit on a branch and open a PR.");
  } finally {
    await template.cleanup?.();
  }
}
