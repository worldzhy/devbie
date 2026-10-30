import fs from "node:fs/promises";
import path from "node:path";

import type { ManagedDependencies } from "@devbie/modules-state";

import {
  filterManagedRemovals,
  installSpecName,
  planDependencyInstalls,
  planDependencyRemovals,
} from "../core/dependency-plan";
import { PACKAGE_JSON_PATH } from "../constants/paths";
import { ModuleManifest } from "../core/module-manifest";
import { IssueBag, reportIssue } from "../lib/issues";
import { readInstalledManifest } from "../lib/module-install";
import { Sink } from "../lib/sink";

async function loadManifests(
  cwd: string,
  issues: IssueBag,
  sink: Sink,
  keys: string[],
  label: string,
): Promise<ModuleManifest[]> {
  const manifests: ModuleManifest[] = [];
  for (const key of keys) {
    const manifest = await readInstalledManifest(cwd, key);
    if (manifest === null) {
      reportIssue(
        issues,
        sink,
        `Missing newbie.module.json for '${key}'; dependencies of ${label} modules may be incomplete.`,
      );
      continue;
    }
    manifests.push(manifest);
  }
  return manifests;
}

export async function assembleDependencies(params: {
  cwd: string;
  sink: Sink;
  issues: IssueBag;
  added: string[];
  removed: string[];
  enabled: string[];
  /** Packages this CLI installed earlier; only they may be uninstalled. */
  managed?: ManagedDependencies;
}): Promise<ManagedDependencies> {
  const { cwd, sink, issues, removed, enabled, managed } = params;
  const emptyManaged: ManagedDependencies = { dependencies: [], devDependencies: [] };

  // [step 1] Reconcile dependencies of ALL enabled modules against
  // package.json. Scoping this to the enabled set (instead of only newly
  // added modules) makes the step idempotent and resumable: dependencies
  // missing because a previous run aborted mid-pipeline are installed on the
  // next run even when nothing new is added.
  const enabledDeclarations = await loadManifests(cwd, issues, sink, enabled, "enabled");

  let installed: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  } = {};
  try {
    installed = JSON.parse(await fs.readFile(path.resolve(cwd, PACKAGE_JSON_PATH), "utf8"));
  } catch {
    reportIssue(issues, sink, `Missing ${PACKAGE_JSON_PATH}; skipping module dependency reconciliation.`);
    return managed ?? emptyManaged;
  }

  const {
    dependencies: addSpecs,
    devDependencies: addDevSpecs,
    conflicts,
  } = planDependencyInstalls(enabledDeclarations, installed);

  for (const conflict of conflicts) {
    reportIssue(
      issues,
      sink,
      `Conflicting versions declared for '${conflict.name}': ${conflict.ranges.join(
        ", ",
      )} (using ${conflict.ranges[0]}).`,
    );
  }

  if (addSpecs.length > 0) {
    await sink.run("npm", ["install", ...addSpecs], "npm install");
  }
  if (addDevSpecs.length > 0) {
    await sink.run("npm", ["install", "--save-dev", ...addDevSpecs], "npm install --save-dev");
  }

  // [step 2] Uninstall deps that were only owned by removed modules — and
  // only when this CLI installed them. A dependency the host declared itself
  // is never touched, even if a removed module named the same package.
  const removedDeclarations = await loadManifests(cwd, issues, sink, removed, "removed");
  const { dependencies: removeDeps, devDependencies: removeDevDeps } = planDependencyRemovals(
    removedDeclarations,
    enabledDeclarations,
  );
  const uninstallNames = filterManagedRemovals({ dependencies: removeDeps, devDependencies: removeDevDeps }, managed);

  if (uninstallNames.length > 0) {
    await sink.run("npm", ["uninstall", ...uninstallNames], "npm uninstall");
  }

  // Track the CLI-owned set: installed names are added, uninstalled ones drop
  // out. This is what makes a later removal safe across runs.
  const dropped = new Set(uninstallNames);
  const merge = (previous: readonly string[], added: readonly string[]): string[] =>
    [...new Set([...previous, ...added])].filter((name) => !dropped.has(name)).sort();
  const previous = managed ?? emptyManaged;
  return {
    dependencies: merge(previous.dependencies, addSpecs.map(installSpecName)),
    devDependencies: merge(previous.devDependencies, addDevSpecs.map(installSpecName)),
  };
}
