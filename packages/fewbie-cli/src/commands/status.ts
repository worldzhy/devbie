import path from "node:path";

import { loadModule, listRegistryModuleNames } from "../registry/store";
import { resolveRegistryRoot } from "../registry/source";
import { pathExists } from "@devbie/cli-kit";
import { MODULES_FILE, readModulesFile } from "../lib/modules-file";
import { assertProjectRoot } from "../lib/project";

export interface StatusOptions {
  /** Project root (global --cwd). */
  cwd?: string;
}

/**
 * Machine-readable project state (ADR-024 F16). Always JSON, like
 * `newbie status`: automation reads this, humans read `fewbie doctor`.
 */
export async function runStatus(options: StatusOptions): Promise<void> {
  const projectRoot = path.resolve(options.cwd ?? process.cwd());
  await assertProjectRoot(projectRoot);

  const declaration = await readModulesFile(projectRoot);
  const declared = declaration ?? [];
  const warnings: string[] = [];

  const registryRoot = await resolveRegistryRoot(projectRoot);
  const available = new Set(await listRegistryModuleNames(registryRoot));
  const missing: Array<{ name: string; files: string[] }> = [];

  for (const name of declared) {
    if (!available.has(name)) {
      warnings.push(`Declared module '${name}' is not present in the registry.`);
      continue;
    }
    const module = await loadModule(registryRoot, name);
    const absent: string[] = [];
    for (const file of module.files) {
      if (!(await pathExists(path.join(projectRoot, file.target)))) absent.push(file.target);
    }
    if (absent.length > 0) missing.push({ name, files: absent });
  }

  const installed = declared.filter((name) => available.has(name) && !missing.some((entry) => entry.name === name));

  console.info(
    JSON.stringify(
      {
        projectRoot,
        declarationFile: MODULES_FILE,
        declarationPresent: declaration !== null,
        declared,
        installed,
        missing,
        warnings,
      },
      null,
      2,
    ),
  );
}
