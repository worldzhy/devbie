import { checkbox, select } from "@inquirer/prompts";
import { bold, cyan, green, inverse } from "colorette";
import { moduleKeys } from "@devbie/modules-state";

import { applyModuleKeys } from "../../assemble/pipeline";
import { deprecatedNoticesOf, listRegistryModules, RegistryModule, resolveRegistry } from "../../lib/registry";
import { readModulesState } from "../../lib/modules-state";

import { createContext, GlobalOptions } from "../shared";

export interface ModulesDefaultOptions extends GlobalOptions {
  /** Print the module inventory as JSON instead of opening the picker. */
  json?: boolean;
}

interface ModuleEntry {
  key: string;
  enabled: boolean;
  deprecated: string | null;
}

/** Whether the process can prompt the user. */
function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

/**
 * Bare `newbie modules` (ADR-024 clause 6): the declaration surface. TTY runs
 * the interactive enable/disable flow; non-TTY degrades to a read-only
 * inventory and never writes.
 */
export async function runModules(options: ModulesDefaultOptions): Promise<void> {
  if (options.json) {
    await printJson(options.cwd);
    return;
  }
  if (!isInteractive()) {
    await printInventory(options.cwd);
    return;
  }
  await runPicker(options);
}

async function collectInventory(cwd: string): Promise<{
  registry: { available: true; local: boolean; path: string; sourceCommit: string | null } | { available: false };
  enabled: string[];
  modules: ModuleEntry[];
}> {
  const state = await readModulesState(cwd);
  const enabled = moduleKeys(state);
  const enabledSet = new Set(enabled);
  const registry = await resolveRegistry({ fetch: false });
  const registryModules: RegistryModule[] = registry ? await listRegistryModules(registry.root) : [];
  const deprecated = deprecatedNoticesOf(registryModules);

  const modules: ModuleEntry[] = registryModules.map((entry) => ({
    key: entry.key,
    enabled: enabledSet.has(entry.key),
    deprecated: deprecated.get(entry.key) ?? null,
  }));
  // Enabled modules missing from the resolved registry stay visible: the
  // inventory must describe the project, not only the current checkout.
  for (const key of enabled) {
    if (!modules.some((entry) => entry.key === key)) {
      modules.push({ key, enabled: true, deprecated: null });
    }
  }

  return {
    registry: registry
      ? { available: true, local: registry.local, path: registry.root, sourceCommit: registry.sourceCommit }
      : { available: false },
    enabled,
    modules,
  };
}

async function printJson(cwd: string): Promise<void> {
  console.info(JSON.stringify(await collectInventory(cwd), null, 2));
}

async function printInventory(cwd: string): Promise<void> {
  const inventory = await collectInventory(cwd);
  if (!inventory.registry.available) {
    console.info("Registry unavailable offline; showing enabled modules only.");
  }
  if (inventory.enabled.length === 0) {
    console.info("No modules are enabled.");
    return;
  }
  console.info(green("enabled modules:"));
  for (const key of inventory.enabled) {
    const entry = inventory.modules.find((module) => module.key === key);
    console.info(`  - ${key}${entry?.deprecated ? " [deprecated]" : ""}`);
  }
}

/** Interactive enable/disable flow; converges the project after confirmation. */
async function runPicker(options: ModulesDefaultOptions): Promise<void> {
  const { ctx } = await createContext(options, {
    ensureConfig: true,
    fetch: true,
  });

  const registryModules = await listRegistryModules(ctx.registry.root);
  const deprecatedNotices = deprecatedNoticesOf(registryModules);
  const enabled = moduleKeys(ctx.state).filter((key) => registryModules.some((entry) => entry.key === key));

  // Deprecated modules stay hidden unless already enabled (flagged, so they
  // can be unchecked) — deprecation gates new adoption, not removal.
  const chosen = await checkbox({
    message: "Which modules do you want to enable for your project:",
    choices: registryModules
      .filter((entry) => !deprecatedNotices.has(entry.key) || enabled.includes(entry.key))
      .map((entry) => {
        const checked = enabled.includes(entry.key);
        return {
          value: entry.key,
          name: `${entry.key}${checked ? (deprecatedNotices.has(entry.key) ? " (enabled, deprecated)" : " (enabled)") : ""}`,
          checked,
        };
      }),
    pageSize: 100,
    loop: true,
  });

  if (chosen.length === enabled.length && chosen.every((name) => enabled.includes(name))) {
    console.info("\n[info] You did not make any changes to the modules.\n");
    return;
  }

  const added = chosen.filter((name) => !enabled.includes(name));
  const removed = enabled.filter((name) => !chosen.includes(name));

  let message: string;
  if (!removed.length && added.length) {
    message = `Do you want to ENABLE ${cyan(added.join(", "))}?`;
  } else if (removed.length && !added.length) {
    message = `Do you want to DISABLE ${inverse(removed.join(", "))}?`;
  } else {
    message = `Do you want to DISABLE ${inverse(removed.join(", "))} and ENABLE ${cyan(added.join(", "))}?`;
  }

  const confirmed = await select({
    message,
    choices: [
      { name: "Yes", value: "yes" },
      { name: "No", value: "no" },
    ],
  });

  if (confirmed !== "yes") {
    console.info("\n[info] No changes applied.\n");
    return;
  }

  await applyModuleKeys(ctx, chosen);
  ctx.issues.assertEmpty();
  console.info(bold(green("\n🍺 C O M P L E T E\n")));
}
