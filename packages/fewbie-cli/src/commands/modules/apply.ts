import fs from "node:fs/promises";
import path from "node:path";
import { bold, cyan, green, yellow } from "colorette";

import {
  LoadedModule,
  listRegistryModuleNames,
  loadModule,
  readModuleFileContent,
  resolveInstallSet,
} from "../../registry/store";
import { resolveRegistryContext, resolveRegistryRoot, RegistryContext } from "../../registry/source";
import { confirm } from "../../lib/confirm";
import { CliError, execLive, pathExists, readTextIfExists } from "@devbie/cli-kit";
import { hashContent } from "../../lib/hashes";
import {
  declaredDependencies,
  LOCKFILE_VERSION,
  Lockfile,
  LockfileModule,
  readLockfile,
  writeLockfile,
} from "../../lib/lockfile";
import { findStaleTargets } from "../../lib/stale-targets";
import { readRegistryDeclaration, requireModulesFile, writeModulesFile } from "../../lib/modules-file";
import { missingPackages } from "../../lib/npm-spec";
import { assertProjectRoot } from "../../lib/project";

export interface ModulesApplyOptions {
  /** Project root (global --cwd). */
  cwd: string;
  /** CI gate: verify the declared set, its files and its dependencies; write nothing. */
  check?: boolean;
  yes?: boolean;
  force?: boolean;
  skipInstall?: boolean;
  dryRun?: boolean;
}

/**
 * Reconcile the project with the declared set in fewbie.json (ADR-029): restore
 * missing files, land dependency closure members, install npm dependencies.
 * `--check` is the CI gate (ADR-024 F7 for fewbie): prove the declaration is
 * complete, every declared file exists, and every declared npm dependency is
 * installed. Content drift is `modules update --check`'s job.
 */
export async function runApply(options: ModulesApplyOptions): Promise<void> {
  const projectRoot = path.resolve(options.cwd);
  await assertProjectRoot(projectRoot);

  if (options.check) {
    await runApplyCheck(projectRoot);
    return;
  }

  const declared = await requireModulesFile(projectRoot);
  const registryRoot = await resolveRegistryRoot(projectRoot);
  const modules = await resolveInstallSet(registryRoot, declared);
  const declaredClosure = new Set(declared);
  const additions = modules.map((module) => module.manifest.name).filter((name) => !declaredClosure.has(name));

  if (additions.length > 0) {
    console.info(cyan(`Installing ${additions.join(", ")} into ${projectRoot}...`));
    const confirmed = await confirm(`Do you want to INSTALL ${additions.join(", ")}?`, options);
    if (!confirmed) {
      console.info("[info] Cancelled.");
      return;
    }
  }

  const result = await applyModuleSelection({
    projectRoot,
    current: declared,
    next: declared,
    force: options.force,
    skipInstall: options.skipInstall,
    dryRun: options.dryRun,
  });

  if (result.written.length === 0 && result.deleted.length === 0 && additions.length === 0) {
    console.info(green("[info] Project is in sync with fewbie.json."));
  } else if (options.dryRun) {
    console.info("[dry-run] no files were modified");
  } else {
    console.info(bold(green("\n✓ Modules installed.")));
  }
}

/** CI gate: the declared set is complete, its files exist, its dependencies are installed. */
async function runApplyCheck(projectRoot: string): Promise<void> {
  const declared = await requireModulesFile(projectRoot);
  const registryRoot = await resolveRegistryRoot(projectRoot);
  const modules = await resolveInstallSet(registryRoot, declared);

  const closure = modules.map((module) => module.manifest.name);
  const undeclared = closure.filter((name) => !declared.includes(name));

  const missingFiles: string[] = [];
  for (const module of modules) {
    for (const file of module.files) {
      if (!(await pathExists(path.join(projectRoot, file.target)))) {
        missingFiles.push(`${module.manifest.name}: ${file.target}`);
      }
    }
  }

  const specs = [...new Set(modules.flatMap((module) => module.manifest.dependencies ?? []))];
  const missingDependencies = await missingPackages(projectRoot, specs);

  if (undeclared.length > 0 || missingFiles.length > 0 || missingDependencies.length > 0) {
    const lines = [
      ...undeclared.map((name) => `  - ${name}: required by the declared set but missing from fewbie.json`),
      ...missingFiles.map((entry) => `  - ${entry}: file missing`),
      ...missingDependencies.map((spec) => `  - ${spec}: npm dependency not installed`),
    ];
    throw new CliError(
      `Declared module set is incomplete:\n${lines.join("\n")}\n` + "Run `fewbie modules apply` to converge it.",
    );
  }

  // Read every declared file once so an unreadable registry module fails the gate
  // rather than silently passing.
  for (const module of modules) {
    for (const file of module.files) await readModuleFileContent(file);
  }

  const available = await listRegistryModuleNames(registryRoot);
  for (const name of declared) {
    if (!available.includes(name)) throw new CliError(`Registry module '${name}' not found.`);
  }

  console.info(green(bold("✓ Declared modules, their files and dependencies match fewbie.json.")));
}

export interface ApplySelectionOptions {
  /** Project root. */
  projectRoot: string;
  /** Declared module set before this change. */
  current: string[];
  /** Requested declared set; registryDependencies are expanded before writing. */
  next: string[];
  /** Overwrite files that exist but were not installed by a declared module. */
  force?: boolean;
  /** Do not run `npm install` for missing dependencies. */
  skipInstall?: boolean;
  dryRun?: boolean;
}

export interface ApplySelectionResult {
  /** Declaration written to fewbie.json (dependency closure, sorted). */
  declared: string[];
  written: string[];
  deleted: string[];
  /** Files kept because the host modified them. */
  kept: string[];
}

/**
 * Load the previously declared set. A module the registry has since deleted
 * cannot be resolved, but its installed files still need cleanup; skipping the
 * name here lets the pass below clean them from the lockfile (R83-12).
 */
async function loadDeclaredModules(root: string, names: readonly string[]): Promise<LoadedModule[]> {
  const available = new Set(await listRegistryModuleNames(root));
  const modules: LoadedModule[] = [];
  for (const name of names) {
    if (available.has(name)) modules.push(await loadModule(root, name));
  }
  return modules;
}

/**
 * Converge a project to a declared module set (ADR-024 clause 10: the
 * declaration file is the only automation entry point).
 *
 * - Files of newly declared modules that are missing are written; existing
 *   files installed by an already-declared module are left untouched.
 * - A target that exists but belongs to no declared module is a conflict
 *   unless `force` is set: the template may ship the same path.
 * - Files owned solely by removed modules are deleted only while byte-identical
 *   to the registry copy; host edits are preserved and reported.
 */
export async function applyModuleSelection(options: ApplySelectionOptions): Promise<ApplySelectionResult> {
  const { projectRoot, dryRun } = options;
  const context = await resolveRegistryContext(projectRoot);
  // Removal must keep working after the module leaves the registry: resolve what
  // is still there and let the lockfile drive the rest (R83-12).
  const currentModules = await loadDeclaredModules(context.root, options.current);
  const nextModules = await resolveInstallSet(context.root, options.next);
  const lockfile = await readLockfile(projectRoot);

  const currentClosure = currentModules.map((module) => module.manifest.name);
  const nextClosure = nextModules.map((module) => module.manifest.name);
  const currentTargets = new Set(currentModules.flatMap((module) => module.files.map((file) => file.target)));
  const added = nextClosure.filter((name) => !currentClosure.includes(name));

  // Plan writes and conflicts before touching the working tree, so a failed
  // run never leaves a half-written project behind.
  const writes: Array<{ target: string; content: string }> = [];
  const conflicts: string[] = [];
  for (const module of nextModules) {
    for (const file of module.files) {
      const exists = await pathExists(path.join(projectRoot, file.target));
      if (!exists) {
        writes.push({ target: file.target, content: await readModuleFileContent(file) });
        continue;
      }
      // Idempotent re-install of an already-declared module: leave it alone.
      if (currentTargets.has(file.target)) continue;
      const content = await readModuleFileContent(file);
      // An interrupted earlier install may have landed files before recording
      // the declaration; identical bytes are already the end state this run
      // wants, so finishing the install is not a conflict.
      if ((await readTextIfExists(path.join(projectRoot, file.target))) === content) continue;
      if (options.force) {
        writes.push({ target: file.target, content });
      } else {
        conflicts.push(file.target);
      }
    }
  }

  if (conflicts.length > 0) {
    throw new CliError(
      `The following files already exist (re-run with --force to overwrite):\n  ${conflicts.join("\n  ")}`,
    );
  }

  const nextTargets = new Set(nextModules.flatMap((module) => module.files.map((file) => file.target)));
  const deletions: string[] = [];
  const kept: string[] = [];
  for (const module of currentModules) {
    if (nextClosure.includes(module.manifest.name)) continue;
    for (const file of module.files) {
      if (nextTargets.has(file.target)) continue;
      const target = path.join(projectRoot, file.target);
      const current = await readTextIfExists(target);
      if (current === null) continue;
      // Never destroy host customization silently; report it instead. With a
      // lockfile the baseline is the installed bytes, without one fall back to
      // comparing against the registry copy (1.8 behavior).
      const lockedHash = lockfile?.modules[module.manifest.name]?.files[file.target];
      const pristine =
        lockedHash === undefined
          ? current === (await readModuleFileContent(file))
          : hashContent(current) === lockedHash;
      if (pristine) deletions.push(file.target);
      else kept.push(file.target);
    }
  }

  // A module the registry no longer ships cannot be resolved above, so its
  // files come from the lockfile; only the recorded hash can prove a copy is
  // untouched (R83-12).
  const resolvedNames = new Set(currentModules.map((module) => module.manifest.name));
  for (const name of options.current) {
    if (nextClosure.includes(name) || resolvedNames.has(name)) continue;
    const entry = lockfile?.modules[name];
    if (!entry) continue;
    for (const [target, lockedHash] of Object.entries(entry.files)) {
      if (nextTargets.has(target) || deletions.includes(target)) continue;
      const current = await readTextIfExists(path.join(projectRoot, target));
      if (current === null) continue;
      if (hashContent(current) === lockedHash) deletions.push(target);
      else kept.push(target);
    }
  }

  // A registry rename or deletion leaves the old target behind even though its
  // module is still declared; the manifest no longer names it, so the loops
  // above never see it (R82-08).
  const staleTargets = await findStaleTargets(
    projectRoot,
    nextModules.map((module) => ({ name: module.manifest.name, targets: module.files.map((file) => file.target) })),
    lockfile,
  );
  for (const file of staleTargets) {
    if (deletions.includes(file.target) || kept.includes(file.target)) continue;
    if (file.pristine) deletions.push(file.target);
    else kept.push(file.target);
  }

  if (dryRun) {
    for (const write of writes) console.info(`[dry-run] write ${write.target}`);
    for (const target of deletions) console.info(`[dry-run] remove ${target}`);
    for (const target of kept) console.info(`[dry-run] keep modified ${target}`);
    return { declared: [...nextClosure].sort(), written: [], deleted: [], kept };
  }

  for (const write of writes) {
    const target = path.join(projectRoot, write.target);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, write.content);
  }
  for (const target of deletions) {
    await fs.rm(path.join(projectRoot, target), { force: true });
  }

  await writeModulesFile(projectRoot, nextClosure);
  await writeModuleLockfile(projectRoot, context, nextModules, new Set(writes.map((write) => write.target)), lockfile);

  for (const target of writes) console.info(`  ${green("added")} ${target.target}`);
  for (const target of deletions) console.info(`  ${green("removed")} ${target}`);
  for (const target of kept) console.info(`  ${yellow("kept")} ${target} (modified locally)`);

  const specs = [...new Set(nextModules.flatMap((module) => module.manifest.dependencies ?? []))];
  const missing = await missingPackages(projectRoot, specs);
  if (missing.length > 0) {
    if (options.skipInstall) {
      console.info(yellow(`\nSkipped npm install. Add manually: npm install ${missing.join(" ")}`));
    } else {
      console.info(`\nInstalling dependencies: ${missing.join(", ")}`);
      await execLive("npm", ["install", ...missing], { cwd: projectRoot });
    }
  }

  const hints = nextModules
    .filter((module: LoadedModule) => added.includes(module.manifest.name))
    .map((module) => module.manifest.postInstall)
    .filter((hint): hint is string => Boolean(hint));
  if (hints.length > 0) {
    console.info(`\n${bold("Next steps")}:`);
    for (const hint of hints) console.info(`  - ${hint}`);
  }

  if (added.length > 0) console.info(cyan(`\nEnabled: ${added.join(", ")}`));
  return {
    declared: [...nextClosure].sort(),
    written: writes.map((write) => write.target),
    deleted: deletions,
    kept,
  };
}

/**
 * Record what was installed: the registry revision and the hash of every
 * installed file. These hashes are the baseline `modules update` compares
 * against once the registry moves (ADR-057 D4).
 *
 * The baseline is the bytes the host received, never the registry's current
 * bytes: a file this run did not write keeps its previous hash even when the
 * registry moved on (R82-01). Recording the registry copy for an untouched file
 * would make the next `modules update --check` call it host-modified and push
 * the host toward `--force`, which overwrites real edits.
 */
async function writeModuleLockfile(
  projectRoot: string,
  context: RegistryContext,
  loaded: LoadedModule[],
  writtenTargets: ReadonlySet<string>,
  previous: Lockfile | null,
): Promise<void> {
  const declaration = await readRegistryDeclaration(projectRoot);
  const modules: Record<string, LockfileModule> = {};
  for (const module of loaded) {
    const files: Record<string, string> = {};
    for (const file of module.files) {
      const recorded = previous?.modules[module.manifest.name]?.files[file.target];
      if (recorded !== undefined && !writtenTargets.has(file.target)) {
        files[file.target] = recorded;
        continue;
      }
      // A file this run wrote gets the registry bytes; one that already existed
      // without a lock entry keeps the bytes now on disk as its baseline.
      const installed = writtenTargets.has(file.target)
        ? null
        : await readTextIfExists(path.join(projectRoot, file.target));
      files[file.target] = hashContent(installed ?? (await readModuleFileContent(file)));
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
