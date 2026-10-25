import path from "node:path";
import { bold, cyan, green } from "colorette";

import { resolveInstallSet, resolveRegistryRoot } from "../../registry/store";
import { confirm } from "../../lib/confirm";
import { CliError } from "@devbie/cli-kit";
import { assertProjectRoot } from "../../lib/project";
import { readModulesFile } from "../../lib/modules-file";
import { applyModuleSelection } from "./apply";

export interface ModulesAddOptions {
  /** Project root (global --cwd). */
  cwd: string;
  /** Registry module names to declare (npm-style add). */
  names: string[];
  yes?: boolean;
  force?: boolean;
  skipInstall?: boolean;
  /** Also declare the login-form block (convenience modifier). */
  withLoginForm?: boolean;
  dryRun?: boolean;
}

/** Declare the named modules in fewbie.json and land their files (ADR-029). */
export async function runAdd(options: ModulesAddOptions): Promise<void> {
  const projectRoot = path.resolve(options.cwd);
  await assertProjectRoot(projectRoot);

  const names = [...options.names];
  if (options.withLoginForm && !names.includes("login-form")) names.push("login-form");
  if (names.length === 0) {
    throw new CliError("`modules add` declares the named modules; pass at least one module name.");
  }

  const declared = (await readModulesFile(projectRoot)) ?? [];
  const next = [...new Set([...declared, ...names])];

  const registryRoot = await resolveRegistryRoot();
  const nextItems = await resolveInstallSet(registryRoot, next);
  const declaredItems = await resolveInstallSet(registryRoot, declared);
  const declaredClosure = new Set(declaredItems.map((item) => item.manifest.name));
  const additions = nextItems.map((item) => item.manifest.name).filter((name) => !declaredClosure.has(name));

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
    next,
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
