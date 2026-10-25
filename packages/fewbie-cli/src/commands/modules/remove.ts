import path from "node:path";
import { bold, green } from "colorette";

import { resolveInstallSet, resolveRegistryRoot } from "../../registry/store";
import { confirm } from "../../lib/confirm";
import { CliError } from "@devbie/cli-kit";
import { requireModulesFile } from "../../lib/modules-file";
import { assertProjectRoot } from "../../lib/project";
import { applyModuleSelection } from "./apply";

export interface ModulesRemoveOptions {
  /** Project root (global --cwd). */
  cwd: string;
  names: string[];
  yes?: boolean;
  dryRun?: boolean;
}

export async function runRemove(options: ModulesRemoveOptions): Promise<void> {
  const projectRoot = path.resolve(options.cwd);
  await assertProjectRoot(projectRoot);

  const declared = await requireModulesFile(projectRoot);
  const removing = [...new Set(options.names)];
  const notDeclared = removing.filter((name) => !declared.includes(name));
  if (notDeclared.length > 0) {
    throw new CliError(
      `Module(s) not declared in fewbie.json: ${notDeclared.join(", ")}. ` +
        `Declared: ${declared.join(", ") || "(none)"}.`,
    );
  }

  const remaining = declared.filter((name) => !removing.includes(name));

  // A remaining item may still pull a removed module through its
  // registryDependencies; expanding the remaining set exposes that.
  const registryRoot = await resolveRegistryRoot();
  const closure = await resolveInstallSet(registryRoot, remaining);
  const revived = removing.filter((name) => closure.some((item) => item.manifest.name === name));
  if (revived.length > 0) {
    const details = revived.map((name) => {
      const dependents = closure
        .filter((item) => (item.manifest.registryDependencies ?? []).includes(name))
        .map((item) => item.manifest.name);
      return `${name} (required by ${dependents.join(", ")})`;
    });
    throw new CliError(`Cannot remove module(s) still required by the declared set: ${details.join("; ")}.`);
  }

  const confirmed = await confirm(`Do you want to REMOVE ${removing.join(", ")}?`, options);
  if (!confirmed) {
    console.info("[info] Cancelled.");
    return;
  }

  await applyModuleSelection({ projectRoot, current: declared, next: remaining, dryRun: options.dryRun });

  if (options.dryRun) console.info("[dry-run] no files were modified");
  else console.info(bold(green("\n✓ Modules removed.")));
}
