import fs from "node:fs/promises";
import path from "node:path";

import { cyan } from "colorette";
import { MODULES_DIR, MODULE_MANIFEST_FILE, MODULES_JSON, ModulesState, moduleKeys } from "@devbie/modules-state";

import { diffModuleKeys, withModuleKeys } from "../core/modules-state";
import { directDependents } from "../core/module-closure";
import { CliError } from "../lib/errors";
import { readRegistryModule } from "../lib/registry";
import { writeModulesState } from "../lib/modules-state";

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

/** Stamp freshly copied module records with the registry sourceCommit. */
function stampCopiedModules(
  state: ModulesState,
  addedKeys: string[],
  registry: { url: string; sourceCommit: string | null },
): ModulesState {
  const added = new Set(addedKeys);
  const stamped = state.modules.map((record) =>
    added.has(record.key)
      ? {
          ...record,
          version: null,
          sourceCommit: registry.sourceCommit,
          localPatches: [],
        }
      : record,
  );
  // Closure-expanded dependencies may have no modules.json record yet.
  const known = new Set(stamped.map((record) => record.key));
  for (const key of addedKeys) {
    if (!known.has(key)) {
      stamped.push({ key, version: null, sourceCommit: registry.sourceCommit, localPatches: [] });
    }
  }
  return {
    ...state,
    registry: {
      ...(state.registry ?? {}),
      url: registry.url,
      sourceCommit: registry.sourceCommit,
    },
    modules: stamped,
  };
}

export async function runSteps(ctx: PipelineContext, changes: PlannedChange): Promise<void> {
  const { cwd, sink, issues, registry, skipPrismaGenerate } = ctx;
  const { added, removed, enabledKeys } = changes;

  if (added.length > 0) {
    step("Copy modules from the registry");
    await addModules({ cwd, sink, registry, keys: added });
    if (!sink.dryRun) {
      ctx.state = stampCopiedModules(ctx.state, added, registry);
      await writeModulesState(cwd, sink, ctx.state);
    }
  }

  step("Update environment variables");
  await assembleEnv({ cwd, sink, issues, added, removed });

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
  await assembleDependencies({
    cwd,
    sink,
    issues,
    added,
    removed,
    enabled: enabledKeys,
  });

  if (removed.length > 0) {
    step("Delete module directories");
    await removeModules({ sink, keys: removed });
  }

  step("Update .env.example");
  await assembleEnvExample({ cwd, sink, issues, enabled: enabledKeys });
}

export async function applyPlanned(ctx: PipelineContext, changes: PlannedChange): Promise<void> {
  // Planning stays read-only: adopt the closure-expanded enabled set into
  // modules.json only when the plan is actually applied.
  if (changes.enabledKeys) {
    ctx.state = withModuleKeys(ctx.state, changes.enabledKeys);
    if (!ctx.sink.dryRun) {
      await writeModulesState(ctx.cwd, ctx.sink, ctx.state);
    }
  }
  await runSteps(ctx, changes);
}

/**
 * Interactive/`apply` flow: modules.json changes from old keys to next keys.
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

  ctx.state = withModuleKeys(ctx.state, expandedKeys);
  await writeModulesState(cwd, sink, ctx.state);

  await runSteps(ctx, {
    added: diff.added,
    removed: diff.removed,
    enabledKeys: expandedKeys,
    closureAdded: describeClosureAdditions(closure.added, closure.graph, expandedKeys),
  });
  return diff;
}

/**
 * `newbie modules apply` planning (read-only): modules.json is the source of truth;
 * modules missing from src/modules (or lacking a registry pin, e.g. after an
 * interrupted install) are reinstalled, extra copied modules are removed.
 *
 * The declared set is expanded to the transitive moduleDependencies closure:
 * dependencies added by a newer manifest (or missing since an interrupted
 * install) are adopted into modules.json when the plan is applied.
 */
export async function planReconcile(
  ctx: PipelineContext,
): Promise<PlannedChange & { installed: string[]; uninstalled: string[] }> {
  const inProject = new Set(await readProjectModuleDirs(ctx.cwd));
  const declared = moduleKeys(ctx.state);

  const closure = await assertClosureResolvable(ctx.registry.root, declared);
  const enabled = closure.keys;
  const enabledSet = new Set(enabled);
  const closureAdded = describeClosureAdditions(closure.added, closure.graph, enabled);

  const installed = enabled.filter((key) => {
    if (!inProject.has(key)) return true;
    const record = ctx.state.modules.find((entry) => entry.key === key);
    return !record?.sourceCommit;
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
