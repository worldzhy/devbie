import path from "node:path";
import { checkbox } from "@inquirer/prompts";
import { bold, cyan, green, yellow } from "colorette";

import { listRegistryItemNames, loadItem, resolveRegistryRoot } from "../../registry/store";
import { confirm, isInteractive } from "../../lib/confirm";
import { pathExists } from "@devbie/cli-kit";
import { readModulesFile } from "../../lib/modules-file";
import { assertProjectRoot } from "../../lib/project";
import { applyModuleSelection } from "./apply";

export interface ModulesDefaultOptions {
  /** Project root (global --cwd). */
  cwd: string;
  /** Print the module inventory as JSON instead of opening the picker. */
  json?: boolean;
  yes?: boolean;
  dryRun?: boolean;
}

interface ModuleEntry {
  name: string;
  declared: boolean;
  installed: boolean;
}

async function collectInventory(projectRoot: string): Promise<{ declared: string[]; modules: ModuleEntry[] }> {
  const declared = (await readModulesFile(projectRoot)) ?? [];
  const registryRoot = await resolveRegistryRoot();
  const names = await listRegistryItemNames(registryRoot);
  const modules: ModuleEntry[] = [];

  for (const name of names) {
    const item = await loadItem(registryRoot, name);
    const present = await Promise.all(item.files.map((file) => pathExists(path.join(projectRoot, file.target))));
    modules.push({ name, declared: declared.includes(name), installed: present.every(Boolean) });
  }
  // Declared modules absent from this registry checkout stay visible.
  for (const name of declared) {
    if (!modules.some((module) => module.name === name)) {
      modules.push({ name, declared: true, installed: false });
    }
  }

  return { declared, modules };
}

/**
 * Bare `fewbie modules` (ADR-024 clause 6): the declaration surface. TTY runs
 * the interactive enable/disable flow; non-TTY degrades to a read-only
 * inventory and never writes.
 */
export async function runModules(options: ModulesDefaultOptions): Promise<void> {
  const projectRoot = path.resolve(options.cwd);
  await assertProjectRoot(projectRoot);

  const inventory = await collectInventory(projectRoot);

  if (options.json) {
    console.info(JSON.stringify({ projectRoot, ...inventory }, null, 2));
    return;
  }

  if (!isInteractive()) {
    printInventory(inventory);
    return;
  }

  const declared = new Set(inventory.declared);
  const chosen = await checkbox({
    message: "Which modules do you want to enable for your project:",
    choices: inventory.modules.map((module) => ({
      value: module.name,
      name: `${module.name}${declared.has(module.name) ? " (enabled)" : ""}`,
      checked: declared.has(module.name),
    })),
    pageSize: 100,
    loop: true,
  });

  if (chosen.length === declared.size && chosen.every((name) => declared.has(name))) {
    console.info("\n[info] You did not make any changes to the modules.\n");
    return;
  }

  const added = chosen.filter((name) => !declared.has(name));
  const removed = inventory.declared.filter((name) => !chosen.includes(name));
  const summary = [
    added.length > 0 ? `enable ${cyan(added.join(", "))}` : null,
    removed.length > 0 ? `disable ${yellow(removed.join(", "))}` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" and ");

  const confirmed = await confirm(`Do you want to ${summary}?`, options);
  if (!confirmed) {
    console.info("\n[info] No changes applied.\n");
    return;
  }

  await applyModuleSelection({ projectRoot, current: inventory.declared, next: chosen, dryRun: options.dryRun });
  if (options.dryRun) console.info("[dry-run] no files were modified");
  else console.info(bold(green("\n✓ Module set applied.")));
}

function printInventory(inventory: { declared: string[]; modules: ModuleEntry[] }): void {
  if (inventory.declared.length === 0) {
    console.info("No modules are declared in fewbie.json.");
    return;
  }
  console.info(green("declared modules:"));
  for (const name of inventory.declared) {
    const entry = inventory.modules.find((module) => module.name === name);
    console.info(`  - ${name}${entry?.installed === false ? " [files missing]" : ""}`);
  }
}
