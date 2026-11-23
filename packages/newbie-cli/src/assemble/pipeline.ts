import fs from "node:fs/promises";
import path from "node:path";

import { cyan } from "colorette";
import {
  MODULE_LOCK_FILE,
  MODULES_DIR,
  MODULE_MANIFEST_FILE,
  MODULES_JSON,
  ModulesState,
  moduleKeys,
} from "@devbie/modules-state";
import type { ManagedDependencies } from "@devbie/modules-state";

import { diffModuleKeys, withModuleKeys } from "../core/modules-state";
import { directDependents } from "../core/module-closure";
import { diffSnapshots } from "../core/drift";
import { LOCK_VERSION, lockEntryFor, snapshotToFiles } from "../core/module-lock";
import { CliError } from "@devbie/cli-kit";
import { readRegistryModule, type RegistryLocation } from "../lib/registry";
import { readModuleLock, readModuleLockOrDefault, writeModuleLock } from "../lib/module-lock";
import { readLegacyModulePins, writeModulesState } from "../lib/modules-state";
import { snapshotInstalledModule, snapshotPristineModule } from "../lib/drift";

import { assembleDependencies } from "./dependencies";
import { applyDeployRenders, planDeployRenders } from "./deploy";
import { assembleEnv, assembleEnvExample } from "./env";
import { describeMissingDependencies, expandRegistryClosure } from "./module-graph";
import { assembleNestJsModules } from "./modules";
import { addModules, removeModules } from "./modules-copy";
import { assembleSchemaFiles } from "./schema";
import { PipelineContext } from "./types";

export interface ClosureAddition {
  key: string;
  requiredBy: string[];
}

export interface PlannedChange {
  added: string[];
  removed: string[];
  enabledKeys: string[];
  /** Modules pulled in automatically by moduleDependencies. */
  closureAdded?: ClosureAddition[];
}

/** Fail early when declared module dependencies cannot be found in the registry. */
async function assertClosureResolvable(
  registryRoot: string,
  roots: readonly string[],
  options?: { satisfied?: ReadonlySet<string> },
): Promise<ReturnType<typeof expandRegistryClosure>> {
  const closure = await expandRegistryClosure(registryRoot, roots, options);
  const missing = describeMissingDependencies(closure);
  if (missing.length > 0) {
    throw new CliError(`Cannot resolve module dependencies:\n  - ${missing.join("\n  - ")}`);
  }
  return closure;
}

/** Explain why a transitive module dependency is being enabled. */
function describeClosureAdditions(
  added: readonly string[],
  graph: ReadonlyMap<string, readonly string[]>,
  enabledKeys: readonly string[],
): ClosureAddition[] {
  const among = new Set(enabledKeys);
  return added.map((key) => ({ key, requiredBy: directDependents(key, graph, among) }));
}

function step(title: string): void {
  console.info(`\n${cyan("→")} ${title}`);
}

/** True when the recorded CLI-owned dependency set would not change. */
function sameManagedDependencies(previous: ManagedDependencies | undefined, next: ManagedDependencies): boolean {
  const normalize = (value: ManagedDependencies | undefined) => ({
    dependencies: [...(value?.dependencies ?? [])].sort(),
    devDependencies: [...(value?.devDependencies ?? [])].sort(),
  });
  return JSON.stringify(normalize(previous)) === JSON.stringify(normalize(next));
}

/** Folder names currently present under src/modules (with a manifest). */
export async function readProjectModuleDirs(cwd: string): Promise<string[]> {
  try {
    const dirents = await fs.readdir(path.resolve(cwd, MODULES_DIR), {
      withFileTypes: true,
    });
    const keys: string[] = [];
    for (const dirent of dirents) {
      if (!dirent.isDirectory()) continue;
      try {
        await fs.stat(path.resolve(cwd, MODULES_DIR, dirent.name, MODULE_MANIFEST_FILE));
        keys.push(dirent.name);
      } catch {
        // Folder without a manifest: not CLI-managed, ignore it.
      }
    }
    return keys;
  } catch {
    return [];
  }
}

/**
 * Record freshly copied keys (closure-expanded dependencies included) and the
 * registry the copy came from. Per-module provenance is not written here: it
 * lives in the lock, which `syncModuleLock` seeds right after (ADR-041).
 */
function recordCopiedModules(
  state: ModulesState,
  addedKeys: string[],
  registry: { url: string; sourceCommit: string | null },
): ModulesState {
  const known = new Set(state.modules.map((record) => record.key));
  const modules = state.modules.map((record) => ({ key: record.key }));
  for (const key of addedKeys) {
    if (!known.has(key)) {
      known.add(key);
      modules.push({ key });
    }
  }
  return {
    ...state,
    registry: {
      ...(state.registry ?? {}),
      url: registry.url,
      sourceCommit: registry.sourceCommit,
    },
    modules,
  };
}

/**
 * Seed or refresh the provenance lock (ADR-041). Freshly copied keys are
 * re-hashed from the installed tree; keys that already have an entry are left
 * untouched so a later `--check` can still report `copy-modified`.
 *
 * Migration rule (ADR-041 §6): an existing copy without a lock entry is only
 * adopted when it matches its recorded registry tree. A dirty copy is named
 * and refused — seeding the current state would launder real drift.
 */
async function syncModuleLock(ctx: PipelineContext, enabledKeys: string[], copied: ReadonlySet<string>): Promise<void> {
  const { cwd, registry, sink } = ctx;
  const lockExists = (await readModuleLock(cwd)) !== null;
  const existing = await readModuleLockOrDefault(cwd);
  const entries = new Map(existing.modules.map((entry) => [entry.key, entry]));
  // Migration window (ADR-041 §6): a project assembled by an older CLI has no
  // lock, only the pins those versions stamped into newbie-modules.json.
  const pins = await readLegacyModulePins(cwd);
  let changed = false;

  for (const key of enabledKeys) {
    if (entries.has(key) && !copied.has(key)) continue;
    const installed = await snapshotInstalledModule(cwd, key);
    if (installed === null) {
      if (copied.has(key)) {
        throw new CliError(`Module '${key}' has no copy after installation; cannot write ${MODULE_LOCK_FILE}.`);
      }
      continue;
    }
    const commit = copied.has(key) ? registry.sourceCommit : (pins.get(key) ?? null);
    if (!commit) {
      throw new CliError(
        `Cannot record provenance for '${key}': no registry source commit. Use a git-backed registry ` +
          "(NEWBIE_MODULES_REGISTRY) or set NEWBIE_MODULES_REF.",
      );
    }
    if (!copied.has(key)) {
      const pristine = await snapshotPristineModule(registry, key, commit);
      if (pristine === null) {
        // Without a lock the legacy pin is the only baseline, and this checkout
        // cannot read it. Refuse instead of rewriting the declaration into a
        // state no later gate can verify (ADR-041 §6).
        if (!lockExists) {
          const hint = registry.local
            ? `a local registry (${registry.root}) cannot fetch them; point the project at a git-backed registry or check that commit out`
            : `fetch them with \`git -C ${registry.root} fetch origin\`, then re-run \`newbie modules apply\``;
          throw new CliError(
            `the registry checkout at ${registry.root} cannot read the locked commit(s) ${commit.slice(0, 7)}; ${hint}.`,
          );
        }
        // Unverifiable is not dirty: leave the entry out so the gate keeps
        // reporting `unverifiable-lock` instead of blessing an unchecked copy.
        continue;
      }
      const report = diffSnapshots(installed, pristine);
      if (!report.clean) {
        throw new CliError(
          `Refusing to write ${MODULE_LOCK_FILE} for '${key}': the installed copy does not match the registry ` +
            `tree at ${commit.slice(0, 7)}. Back-port it to the registry and run \`newbie modules update ${key}\`, ` +
            `or remove the copy and run \`newbie modules apply\`.`,
        );
      }
    }
    entries.set(key, { key, sourceCommit: commit, files: snapshotToFiles(installed) });
    changed = true;
  }

  const enabled = new Set(enabledKeys);
  for (const key of [...entries.keys()]) {
    if (!enabled.has(key)) {
      entries.delete(key);
      changed = true;
    }
  }

  if (!changed && lockExists) return;
  if (!lockExists && entries.size === 0) return;
  await writeModuleLock(cwd, sink, { lockVersion: LOCK_VERSION, modules: [...entries.values()] });
}

/**
 * A copy must be pinned: without a commit the drift gate can never verify it.
 * Callers run this before writing newbie-modules.json, so a refusal leaves both
 * newbie-modules.json and `src/modules` unchanged (R6-04).
 */
function assertRegistryCommitForCopy(registry: RegistryLocation, added: readonly string[]): void {
  if (added.length === 0 || registry.sourceCommit) return;
  throw new CliError(
    `Refusing to copy modules without a registry commit: ${MODULE_LOCK_FILE} needs a \`sourceCommit\` to record provenance. ` +
      "Use a git-backed registry (NEWBIE_MODULES_REGISTRY) or set NEWBIE_MODULES_REF.",
  );
}

export async function runSteps(ctx: PipelineContext, changes: PlannedChange): Promise<void> {
  const { cwd, sink, issues, registry, skipPrismaGenerate } = ctx;
  const { added, removed, enabledKeys } = changes;

  if (added.length > 0) {
    assertRegistryCommitForCopy(registry, added);
    step("Copy modules from the registry");
    await addModules({ cwd, sink, registry, keys: added });
    if (!sink.dryRun) ctx.state = recordCopiedModules(ctx.state, added, registry);
  }

  if (!sink.dryRun) {
    // Order matters during migration: the lock seeding reads the legacy pins
    // from newbie-modules.json, so it must run before that file is rewritten
    // without them.
    const hadLegacyPins = (await readLegacyModulePins(cwd)).size > 0;
    step(`Update ${MODULE_LOCK_FILE}`);
    await syncModuleLock(ctx, enabledKeys, new Set(added));
    // Rewrite the declaration so a pre-lock project drops its legacy pins;
    // callers persist their own enabled-set changes after this returns.
    if (hadLegacyPins) await writeModulesState(cwd, sink, ctx.state);
  }

  step("Update environment variables");
  await assembleEnv({ cwd, sink, issues, added, removed, enabled: enabledKeys });

  step("Update database schema");
  await assembleSchemaFiles({
    cwd,
    sink,
    issues,
    enabledKeys,
    skipPrismaGenerate,
  });

  // nest-cli.json assets are a fixed template glob (ADR-009 D2); no
  // per-module asset injection happens here, so the file stays byte-identical.
  step("Update nestjs modules");
  await assembleNestJsModules({ cwd, sink, issues, enabledKeys });

  step("Update deploy assets");
  await applyDeployRenders(sink, await planDeployRenders({ cwd, sink, issues, enabledKeys }));

  step("Update package dependencies");
  const managedDependencies = await assembleDependencies({
    cwd,
    sink,
    issues,
    added,
    removed,
    enabled: enabledKeys,
    managed: ctx.state.managedDependencies,
  });
  if (!sink.dryRun && !sameManagedDependencies(ctx.state.managedDependencies, managedDependencies)) {
    ctx.state = { ...ctx.state, managedDependencies };
    await writeModulesState(cwd, sink, ctx.state);
  }

  if (removed.length > 0) {
    step("Delete module directories");
    await removeModules({ sink, keys: removed });
  }

  step("Update .env.example");
  await assembleEnvExample({ cwd, sink, issues, enabled: enabledKeys });
}

export async function applyPlanned(ctx: PipelineContext, changes: PlannedChange): Promise<void> {
  // Same preflight as applyModuleKeys: never adopt an enabled set that cannot
  // be copied (R6-04).
  assertRegistryCommitForCopy(ctx.registry, changes.added);

  // Planning stays read-only: adopt the closure-expanded enabled set in memory
  // and persist it only after the pipeline has consumed the file, because the
  // lock seeding reads the legacy pins from it during migration (ADR-041 §6).
  if (changes.enabledKeys) ctx.state = withModuleKeys(ctx.state, changes.enabledKeys);
  await runSteps(ctx, changes);
  if (changes.enabledKeys && !ctx.sink.dryRun) {
    await writeModulesState(ctx.cwd, ctx.sink, ctx.state);
  }
}

/**
 * Interactive/`apply` flow: newbie-modules.json changes from old keys to next keys.
 * The requested set is expanded to the transitive moduleDependencies closure
 * before assembling. The new state is persisted before assembling.
 */
export async function applyModuleKeys(
  ctx: PipelineContext,
  nextKeys: string[],
): Promise<{ added: string[]; removed: string[] }> {
  const { cwd, sink } = ctx;
  const closure = await assertClosureResolvable(ctx.registry.root, nextKeys);
  const expandedKeys = closure.keys;
  const currentSet = new Set(moduleKeys(ctx.state));

  for (const key of closure.added) {
    const requiredBy = directDependents(key, closure.graph, new Set(expandedKeys));
    const suffix = `(required by: ${requiredBy.join(", ") || "?"})`;
    if (currentSet.has(key)) {
      console.info(cyan(`[info] keeping ${key} enabled ${suffix}`));
    } else {
      console.info(cyan(`[info] also enabling ${key} ${suffix}`));
    }
  }

  const diff = diffModuleKeys(moduleKeys(ctx.state), expandedKeys);

  // Refuse before rewriting newbie-modules.json: runSteps would throw after the
  // enabled set had been persisted (R6-04), leaving the file claiming modules
  // that were never copied.
  assertRegistryCommitForCopy(ctx.registry, diff.added);

  ctx.state = withModuleKeys(ctx.state, expandedKeys);

  await runSteps(ctx, {
    added: diff.added,
    removed: diff.removed,
    enabledKeys: expandedKeys,
    closureAdded: describeClosureAdditions(closure.added, closure.graph, expandedKeys),
  });
  // Persist after the pipeline: the lock seeding still needs the legacy pins.
  if (!sink.dryRun) await writeModulesState(cwd, sink, ctx.state);
  return diff;
}

/**
 * `newbie modules apply` planning (read-only): newbie-modules.json is the source of truth;
 * modules missing from src/modules (or lacking a registry pin, e.g. after an
 * interrupted install) are reinstalled, extra copied modules are removed.
 *
 * The declared set is expanded to the transitive moduleDependencies closure:
 * dependencies added by a newer manifest (or missing since an interrupted
 * install) are adopted into newbie-modules.json when the plan is applied.
 */
export async function planReconcile(
  ctx: PipelineContext,
): Promise<PlannedChange & { installed: string[]; uninstalled: string[] }> {
  const inProject = new Set(await readProjectModuleDirs(ctx.cwd));
  const declared = moduleKeys(ctx.state);
  const lock = await readModuleLock(ctx.cwd);

  const closure = await assertClosureResolvable(ctx.registry.root, declared);
  const enabled = closure.keys;
  const enabledSet = new Set(enabled);
  const closureAdded = describeClosureAdditions(closure.added, closure.graph, enabled);

  // Migration window: a project without a lock may still carry the pins older
  // CLIs stamped into newbie-modules.json. A pinned copy is adopted by the lock
  // instead of being recopied, so `apply` verifies it before writing provenance.
  const legacyPins = lock === null ? await readLegacyModulePins(ctx.cwd) : new Map<string, string>();
  const installed = enabled.filter((key) => {
    if (!inProject.has(key)) return true;
    // A copy that predates the lock (or lost its entry) is reinstalled: the
    // copy step writes code and provenance together (ADR-041 §3).
    if (lock === null) return !legacyPins.has(key);
    return lockEntryFor(lock, key) === undefined;
  });
  const uninstalled = [...inProject].filter((key) => !enabledSet.has(key));

  // Hard gate: refuse to copy a deprecated module into a project that does not
  // have it yet. Hosts that already carry it keep installing/repairing.
  const newlyInstalled = installed.filter((key) => !inProject.has(key));
  const deprecated: string[] = [];
  for (const key of newlyInstalled) {
    const resolved = await readRegistryModule(ctx.registry.root, key);
    if (resolved?.manifest.deprecated) {
      deprecated.push(`'${key}' (${resolved.manifest.deprecated})`);
    }
  }
  if (deprecated.length > 0) {
    throw new CliError(
      `Cannot install deprecated module(s): ${deprecated.join(", ")}. Remove them from ${MODULES_JSON} first.`,
    );
  }

  return {
    added: installed,
    removed: uninstalled,
    enabledKeys: enabled,
    closureAdded,
    installed,
    uninstalled,
  };
}
