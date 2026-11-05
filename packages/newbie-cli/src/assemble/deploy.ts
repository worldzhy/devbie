import fs from "node:fs/promises";
import path from "node:path";

import { MODULES_DIR } from "@devbie/modules-state";

import { buildComposeModulesYaml, ComposeModulesInput } from "../core/deploy-compose";
import { isRegisteredDatastore } from "../core/datastore-registry";
import { DEPLOY_COMPOSE_MODULES } from "../constants/paths";
import { CliError } from "@devbie/cli-kit";
import { IssueBag, reportIssue } from "../lib/issues";
import { readInstalledManifest } from "../lib/module-install";
import { Sink } from "../lib/sink";

/** One drifted deploy asset and the content it should have after applying. */
export interface DeployRenderPlan {
  /** Project-relative path (deploy/compose.modules.yml, deploy/Caddyfile.tmpl). */
  path: string;
  /** Current on-disk content; null when the file does not exist yet. */
  current: string | null;
  next: string;
}

async function readOrNull(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return null;
  }
}

/** Convention probe: a module ships a migration CLI when this file exists. */
async function hasMigrator(cwd: string, key: string): Promise<boolean> {
  try {
    await fs.stat(path.resolve(cwd, MODULES_DIR, key, "migration", "migrate-cli.ts"));
    return true;
  } catch {
    return false;
  }
}

/**
 * Compute the deploy assets drifting from the installed module set:
 * deploy/compose.modules.yml (datastore runtime values come from the CLI
 * registry, ADR-008 D3). Planning is read-only; only drifted files are
 * returned.
 *
 * deploy/Caddyfile.tmpl is deliberately not part of this plan: since ADR-034
 * dropped `publicNamespace`, no module claims a public URL namespace, so every
 * route goes through the unified `/api/*` strip block and the file is fully
 * framework-owned and static (ADR-008 D4 retired).
 */
export async function planDeployRenders(params: {
  cwd: string;
  sink: Sink;
  issues: IssueBag;
  enabledKeys: string[];
}): Promise<DeployRenderPlan[]> {
  const { cwd, sink, issues, enabledKeys } = params;

  const datastores: ComposeModulesInput[] = [];
  for (const key of enabledKeys) {
    const manifest = await readInstalledManifest(cwd, key);
    if (manifest === null) {
      // Expected in dry-run, where the copy step never materialised.
      reportIssue(issues, sink, `Missing newbie.module.json for '${key}'; it was skipped in the deploy asset render.`);
      continue;
    }
    if (manifest.layer === "datastore") {
      if (!isRegisteredDatastore(key)) {
        throw new CliError(
          `Module '${key}' declares layer "datastore" but is not listed in the CLI datastore registry (ADR-008 D3).`,
        );
      }
      datastores.push({ key, hasMigrator: await hasMigrator(cwd, key) });
    }
  }

  const plans: DeployRenderPlan[] = [];

  const composeNext = buildComposeModulesYaml(datastores);
  const composeCurrent = await readOrNull(path.resolve(cwd, DEPLOY_COMPOSE_MODULES));
  if (composeCurrent !== composeNext) {
    plans.push({ path: DEPLOY_COMPOSE_MODULES, current: composeCurrent, next: composeNext });
  }

  return plans;
}

/** Write every drifted deploy asset through the sink (prints in dry-run). */
export async function applyDeployRenders(sink: Sink, plans: DeployRenderPlan[]): Promise<void> {
  for (const plan of plans) {
    await sink.writeText(plan.path, plan.next);
  }
}
