import fs from "node:fs/promises";
import path from "node:path";
import { bold, green, yellow } from "colorette";

import { LoadedModule, readModuleFileContent, resolveInstallSet } from "../../registry/store";
import { RegistryContext, resolveRegistryContext } from "../../registry/source";
import { confirm } from "../../lib/confirm";
import { CliError, readTextIfExists } from "@devbie/cli-kit";
import { hashContent } from "../../lib/hashes";
import { declaredDependencies, LOCKFILE_VERSION, Lockfile, readLockfile, writeLockfile } from "../../lib/lockfile";
import { findStaleTargets } from "../../lib/stale-targets";
import { readRegistryDeclaration, requireModulesFile } from "../../lib/modules-file";
import { assertProjectRoot } from "../../lib/project";
import { unifiedDiff } from "../../lib/diff";

export interface ModulesUpdateOptions {
  /** Project root (global --cwd). */
  cwd: string;
  /** Specific declared module names; empty means all declared modules. */
  names?: string[];
  /** CI gate: fail when the host is behind the registry or conflicts; write nothing. */
  check?: boolean;
  /** Show the three-way classification without writing. */
  preview?: boolean;
  yes?: boolean;
  force?: boolean;
  dryRun?: boolean;
}

/**
 * `pristine`: the host still has the installed bytes, the registry moved.
 * `host-modified`: the host edited the file, the registry did not move.
 * `conflict`: both moved — only `--force` may resolve it.
 * `unlocked`: a lockfile exists but has no baseline for this file, so
 * ownership cannot be proven; only `--force` may overwrite it (R83-13).
 * `legacy`: the project has no lockfile yet; 1.8 behavior applies.
 */
type DriftKind = "pristine" | "host-modified" | "conflict" | "unlocked" | "legacy";

interface DriftedFile {
  module: string;
  target: string;
  current: string;
  latest: string;
  kind: DriftKind;
}

export async function runUpdate(options: ModulesUpdateOptions): Promise<void> {
  const projectRoot = path.resolve(options.cwd);
  await assertProjectRoot(projectRoot);

  if (options.check && options.names && options.names.length > 0) {
    throw new CliError("`modules update --check` inspects every declared module and does not accept module names.");
  }

  const declared = await requireModulesFile(projectRoot);
  const context = await resolveRegistryContext(projectRoot);
  const selected = await selectModules(context.root, declared, options.names ?? []);
  const lockfile = await readLockfile(projectRoot);
  const missing: string[] = [];
  const drifted: DriftedFile[] = [];

  for (const module of selected) {
    for (const file of module.files) {
      const current = await readTextIfExists(path.join(projectRoot, file.target));
      // A missing copy is apply's job, not update's; report it as a hint.
      if (current === null) {
        missing.push(`${module.manifest.name}: ${file.target}`);
        continue;
      }
      const latest = await readModuleFileContent(file);
      if (current === latest) continue;
      drifted.push({
        module: module.manifest.name,
        target: file.target,
        current,
        latest,
        kind: classify(module, file.target, current, latest, lockfile),
      });
    }
  }

  const pristine = drifted.filter((file) => file.kind === "pristine" || file.kind === "legacy");
  const modified = drifted.filter((file) => file.kind === "host-modified");
  const conflicts = drifted.filter((file) => file.kind === "conflict");
  const unlocked = drifted.filter((file) => file.kind === "unlocked");
  const stale = await findStaleTargets(
    projectRoot,
    selected.map((module) => ({ name: module.manifest.name, targets: module.files.map((file) => file.target) })),
    lockfile,
    declared,
  );

  for (const file of pristine) {
    console.info(bold(`# ${file.module} → ${file.target} (${describe(file.kind)})`));
    process.stdout.write(unifiedDiff(file.current, file.latest, `a/${file.target}`, `b/${file.target}`));
    console.info("");
  }
  for (const file of conflicts) {
    console.info(bold(yellow(`# ${file.module} → ${file.target} (conflict: registry and host both changed)`)));
    process.stdout.write(unifiedDiff(file.current, file.latest, `a/${file.target}`, `b/${file.target}`));
    console.info("");
  }
  for (const file of unlocked) {
    console.info(yellow(`kept ${file.target} (the lockfile has no baseline for it; restore the entry or use --force)`));
  }
  for (const file of modified) {
    console.info(yellow(`kept ${file.target} (modified locally; --force overwrites)`));
  }
  for (const file of stale) {
    console.info(
      file.pristine
        ? yellow(`${file.target} is no longer shipped by ${file.module}; update removes it`)
        : yellow(`kept ${file.target} (no longer shipped by ${file.module}; modified locally)`),
    );
  }

  if (options.check) {
    // The gate stays strict: module files are registry-owned, so every kind of
    // drift fails CI. The classification only explains how to fix it, and the
    // remedy must be reachable from the plain command (R82-05).
    const reasons: string[] = [];
    if (missing.length > 0) reasons.push(`${missing.length} file(s) are missing`);
    if (pristine.length > 0) reasons.push(`${pristine.length} file(s) are behind the registry`);
    if (modified.length > 0) reasons.push(`${modified.length} file(s) were modified locally`);
    if (conflicts.length > 0) reasons.push(`${conflicts.length} file(s) conflict with local changes`);
    if (unlocked.length > 0) reasons.push(`${unlocked.length} file(s) have no lockfile baseline`);
    const cleanable = stale.filter((file) => file.pristine).length;
    const staleModified = stale.length - cleanable;
    if (cleanable > 0) reasons.push(`${cleanable} obsolete file(s) are no longer shipped by their module`);
    if (staleModified > 0) reasons.push(`${staleModified} obsolete file(s) were modified locally`);
    if (reasons.length > 0) {
      throw new CliError(
        `${reasons.join("; ")}. Run \`fewbie modules apply\` to restore missing files and ` +
          "`fewbie modules update` to adopt registry changes (`--force` overwrites local edits).",
      );
    }
    console.info(green(bold("✓ Declared module files are up to date.")));
    return;
  }

  if (drifted.length === 0 && stale.length === 0) {
    // Files match the registry, but the lockfile may still miss the dependency
    // declaration the host lint reads (ADR-079 D5). Refresh only that metadata
    // so adopting the CLI does not require an unrelated file update.
    if (lockfile !== null && selected.some((module) => dependenciesDiffer(module, lockfile))) {
      await writeUpdatedLockfile(projectRoot, context, selected, [], lockfile);
    }
    console.info(green(bold("✓ Declared module files are up to date.")));
    if (missing.length > 0) {
      console.info(yellow(`Missing file(s); run 'fewbie modules apply' to restore them:\n  ${missing.join("\n  ")}`));
    }
    return;
  }

  const obsolete = stale.filter((file) => file.pristine).map((file) => file.target);
  if (options.preview || options.dryRun) {
    console.info(
      options.preview
        ? `[preview] ${pristine.length} update(s), ${modified.length} host-modified, ${conflicts.length} conflict(s), ${obsolete.length} obsolete`
        : "[dry-run] no files were modified",
    );
    return;
  }

  const writable = [...pristine, ...(options.force ? [...modified, ...conflicts, ...unlocked] : [])];
  if (writable.length === 0 && obsolete.length === 0) {
    console.info(yellow("Nothing to write: every drifted file is host-owned or conflicting (use --force)."));
    return;
  }

  const confirmed = await confirm(
    `Do you want to UPDATE ${writable.length} file(s) and REMOVE ${obsolete.length} obsolete file(s)?`,
    options,
  );
  if (!confirmed) {
    console.info("[info] Update cancelled.");
    return;
  }

  for (const file of writable) {
    const target = path.join(projectRoot, file.target);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, file.latest);
    console.info(`${green("updated")} ${file.target}`);
  }
  for (const target of obsolete) {
    await fs.rm(path.join(projectRoot, target), { force: true });
    console.info(`${green("removed")} ${target}`);
  }
  await writeUpdatedLockfile(projectRoot, context, selected, writable, lockfile);
  console.info(green(bold(`\n✓ Updated ${writable.length} file(s). Review with git diff.`)));
}

/** Three-way classification against the lockfile baseline (ADR-057 D4). */
function classify(
  module: LoadedModule,
  target: string,
  current: string,
  latest: string,
  lockfile: Lockfile | null,
): DriftKind {
  // A missing lockfile is the documented legacy path; a missing entry in an
  // existing lockfile is not. Treating it as legacy let one deleted line make
  // any host-modified file auto-writable without --force (R83-13).
  if (lockfile === null) return "legacy";
  const lockedHash = lockfile.modules[module.manifest.name]?.files[target];
  if (lockedHash === undefined) return "unlocked";
  if (hashContent(current) === lockedHash) return "pristine";
  if (hashContent(latest) === lockedHash) return "host-modified";
  return "conflict";
}

function describe(kind: DriftKind): string {
  if (kind === "legacy") return "no lockfile baseline";
  if (kind === "unlocked") return "no lockfile baseline for this file";
  return "registry moved";
}

/**
 * True when the lockfile records a different dependency list than the module
 * manifest. Files are unaffected, so only `modules update` refreshes it.
 */
function dependenciesDiffer(module: LoadedModule, lockfile: Lockfile): boolean {
  const recorded = lockfile.modules[module.manifest.name]?.dependencies ?? [];
  const declared = module.manifest.dependencies ?? [];
  return declared.length !== recorded.length || declared.some((name) => !recorded.includes(name));
}

/** Refresh the lockfile baseline for every file this run wrote. */
async function writeUpdatedLockfile(
  projectRoot: string,
  context: RegistryContext,
  loaded: LoadedModule[],
  written: DriftedFile[],
  lockfile: Lockfile | null,
): Promise<void> {
  const declaration = await readRegistryDeclaration(projectRoot);
  const modules = { ...(lockfile?.modules ?? {}) };
  for (const module of loaded) {
    const writtenTargets = new Set(
      written.filter((file) => file.module === module.manifest.name).map((file) => file.target),
    );
    const previousFiles = modules[module.manifest.name]?.files ?? {};
    // Rebuild the entry from the current manifest, so a target the registry
    // renamed or deleted does not linger in the baseline (R82-08).
    const files: Record<string, string> = {};
    for (const file of module.files) {
      if (writtenTargets.has(file.target)) {
        files[file.target] = hashContent(await readModuleFileContent(file));
        continue;
      }
      // A file this run did not write keeps its installed baseline. Recording
      // the registry or on-disk bytes would turn a host edit into a false
      // `pristine` on the next check (R82-06).
      const recorded = previousFiles[file.target];
      if (recorded !== undefined) {
        files[file.target] = recorded;
        continue;
      }
      const onDisk = await readTextIfExists(path.join(projectRoot, file.target));
      files[file.target] = hashContent(onDisk ?? (await readModuleFileContent(file)));
    }
    modules[module.manifest.name] = {
      version: module.manifest.contract?.version ?? "0.0.0",
      commit: context.commit,
      ...declaredDependencies(module.manifest.dependencies),
      files,
    };
  }
  await writeLockfile(projectRoot, {
    lockfileVersion: LOCKFILE_VERSION,
    registry: { url: declaration?.url ?? "", ref: declaration?.ref ?? "", commit: context.commit },
    modules,
  });
}

/** Load the requested declared modules (validated against the declaration). */
async function selectModules(registryRoot: string, declared: string[], names: string[]): Promise<LoadedModule[]> {
  if (names.length === 0) return resolveInstallSet(registryRoot, declared);

  const unknown = names.filter((name) => !declared.includes(name));
  if (unknown.length > 0) {
    throw new CliError(
      `Module(s) not declared in fewbie.json: ${unknown.join(", ")}. Declared: ${declared.join(", ") || "(none)"}.`,
    );
  }
  return resolveInstallSet(registryRoot, names);
}
