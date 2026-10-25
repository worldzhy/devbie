import fs from "node:fs/promises";
import path from "node:path";
import { bold, cyan, green, yellow } from "colorette";

import { LoadedItem, readItemFileContent, resolveInstallSet, resolveRegistryRoot } from "../../registry/store";
import { confirm } from "../../lib/confirm";
import { CliError, readTextIfExists } from "@devbie/cli-kit";
import { requireModulesFile } from "../../lib/modules-file";
import { assertProjectRoot } from "../../lib/project";
import { unifiedDiff } from "../../lib/diff";

export interface ModulesUpdateOptions {
  /** Project root (global --cwd). */
  cwd: string;
  /** Specific declared module names; empty means all declared modules. */
  names?: string[];
  /** CI gate: verify installed files against the registry; write nothing. */
  check?: boolean;
  yes?: boolean;
  dryRun?: boolean;
}

interface OutdatedFile {
  item: string;
  target: string;
  current: string;
  latest: string;
}

export async function runUpdate(options: ModulesUpdateOptions): Promise<void> {
  const projectRoot = path.resolve(options.cwd);
  await assertProjectRoot(projectRoot);

  if (options.check && options.names && options.names.length > 0) {
    throw new CliError("`modules update --check` inspects every declared module and does not accept module names.");
  }

  const declared = await requireModulesFile(projectRoot);
  const selected = await selectItems(projectRoot, declared, options.names ?? []);
  const missing: string[] = [];
  const outdated: OutdatedFile[] = [];

  for (const item of selected) {
    for (const file of item.files) {
      const current = await readTextIfExists(path.join(projectRoot, file.target));
      // A missing copy is apply's job, not update's; report it as a hint.
      if (current === null) {
        missing.push(`${item.manifest.name}: ${file.target}`);
        continue;
      }
      const latest = await readItemFileContent(file);
      if (current !== latest) outdated.push({ item: item.manifest.name, target: file.target, current, latest });
    }
  }

  if (outdated.length === 0) {
    console.info(green(bold("✓ Declared module files are up to date.")));
    if (missing.length > 0) {
      console.info(yellow(`Missing file(s); run 'fewbie modules apply' to restore them:\n  ${missing.join("\n  ")}`));
    }
    return;
  }

  console.info(cyan(`${outdated.length} file(s) differ from the registry:\n`));
  for (const file of outdated) {
    console.info(bold(`# ${file.item} → ${file.target}`));
    process.stdout.write(unifiedDiff(file.current, file.latest, `a/${file.target}`, `b/${file.target}`));
    console.info("");
  }

  if (options.check) {
    throw new CliError(
      `${outdated.length} file(s) drift from the registry. Run \`fewbie modules update\` to adopt the registry version.`,
    );
  }

  if (options.dryRun) {
    console.info("[dry-run] no files were modified");
    return;
  }

  const confirmed = await confirm(`Do you want to UPDATE ${outdated.length} file(s)?`, options);
  if (!confirmed) {
    console.info("[info] Update cancelled.");
    return;
  }

  for (const file of outdated) {
    const target = path.join(projectRoot, file.target);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, file.latest);
    console.info(`${green("updated")} ${file.target}`);
  }
  console.info(green(bold(`\n✓ Updated ${outdated.length} file(s). Review with git diff.`)));
}

/** Load the requested declared items (validated against the declaration). */
async function selectItems(projectRoot: string, declared: string[], names: string[]): Promise<LoadedItem[]> {
  if (names.length === 0) return resolveInstallSet(await resolveRegistryRoot(), declared);

  const unknown = names.filter((name) => !declared.includes(name));
  if (unknown.length > 0) {
    throw new CliError(
      `Module(s) not declared in fewbie.json: ${unknown.join(", ")}. Declared: ${declared.join(", ") || "(none)"}.`,
    );
  }
  return resolveInstallSet(await resolveRegistryRoot(), names);
}
