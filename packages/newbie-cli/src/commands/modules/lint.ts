import fs from "node:fs/promises";
import path from "node:path";
import { gray, green, red, yellow } from "colorette";

import { REGISTRY_MODULES_DIR } from "../../constants/paths";
import { LayeredModule, lintModuleLayers } from "../../core/layer-lint";
import { CliError } from "@devbie/cli-kit";
import { listRegistryKeys, readRegistryModule } from "../../lib/registry";

/** Cross-module import reference, e.g. `@modules/account/account.service`. */
const IMPORT_PATTERN = /@modules\/([a-z0-9-]+)/g;

/** Collect the keys of other registry modules imported anywhere under `dir`. */
async function moduleDependencies(dir: string, selfKey: string): Promise<string[]> {
  const dependencies = new Set<string>();
  const stack: string[] = [dir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => [] as import("node:fs").Dirent[]);
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        stack.push(full);
        continue;
      }
      if (!entry.name.endsWith(".ts")) continue;
      const content = await fs.readFile(full, "utf8");
      for (const match of content.matchAll(IMPORT_PATTERN)) {
        if (match[1] !== selfKey) dependencies.add(match[1]);
      }
    }
  }
  return [...dependencies].sort();
}

/** Fail unless cwd is a newbie-modules registry checkout (ADR-024 F17). */
async function requireRegistryCheckout(cwd: string): Promise<string> {
  const root = path.resolve(cwd);
  try {
    await fs.stat(path.join(root, REGISTRY_MODULES_DIR));
  } catch {
    throw new CliError(
      `modules lint only works inside a newbie-modules registry checkout. Run it from the registry working tree (cwd must contain ${REGISTRY_MODULES_DIR}).`,
    );
  }
  return root;
}

export async function runLint(options: { cwd: string }): Promise<void> {
  const root = await requireRegistryCheckout(options.cwd);
  const keys = await listRegistryKeys(root);

  const modules: LayeredModule[] = [];
  for (const key of keys) {
    const mod = await readRegistryModule(root, key);
    if (!mod) continue;
    modules.push({
      key,
      layer: typeof mod.manifest.layer === "string" ? mod.manifest.layer : undefined,
      dependencies: await moduleDependencies(mod.dir, key),
      declaredDependencies: mod.manifest.moduleDependencies ?? [],
    });
  }

  console.info(`Linted ${modules.length} registry module(s) in ${root}\n`);

  const findings = lintModuleLayers(modules);
  const errors = findings.filter((finding) => finding.level === "error");
  const warnings = findings.filter((finding) => finding.level === "warning");

  for (const finding of errors) console.info(red(`  x [${finding.module}] ${finding.message}`));
  for (const finding of warnings) console.info(yellow(`  ! [${finding.module}] ${finding.message}`));
  if (findings.length === 0) {
    console.info(green("Layering rules satisfied."));
  } else {
    console.info(gray(`\n${errors.length} error(s), ${warnings.length} warning(s).`));
  }

  if (errors.length > 0) {
    throw new CliError(`Layer lint found ${errors.length} problem(s).`);
  }
}
