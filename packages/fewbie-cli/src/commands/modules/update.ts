import fs from "node:fs/promises";
import path from "node:path";
import { bold, green, yellow } from "colorette";

import { LoadedItem, readItemFileContent, resolveInstallSet } from "../../registry/store";
import { RegistryContext, resolveRegistryContext } from "../../registry/source";
import { confirm } from "../../lib/confirm";
import { CliError, readTextIfExists } from "@devbie/cli-kit";
import { hashContent } from "../../lib/hashes";
import { LOCKFILE_VERSION, Lockfile, readLockfile, writeLockfile } from "../../lib/lockfile";
import { readRegistryDeclaration, requireModulesFile } from "../../lib/modules-file";
import { assertProjectRoot } from "../../lib/project";
import { unifiedDiff } from "../../lib/diff";

export interface ModulesUpdateOptions {
  /** Project root (global --cwd). */
  cwd: string;
  /** Specific declared module names; empty means all declared modules. */
  names?: string[];
  /** CI gate: fail when the host is behind the registry or conflicts; write nothing. */
  check?: boolean;
  /** Show the three-way classification without writing. */
  preview?: boolean;
  yes?: boolean;
  force?: boolean;
  dryRun?: boolean;
}

/**
 * `pristine`: the host still has the installed bytes, the registry moved.
 * `host-modified`: the host edited the file, the registry did not move.
 * `conflict`: both moved — only `--force` may resolve it.
 * `legacy`: the project has no lockfile yet; 1.8 behavior applies.
 */
type DriftKind = "pristine" | "host-modified" | "conflict" | "legacy";

interface DriftedFile {
  item: string;
  target: string;
  current: string;
  latest: string;
  kind: DriftKind;
}

export async function runUpdate(options: ModulesUpdateOptions): Promise<void> {
  const projectRoot = path.resolve(options.cwd);
  await assertProjectRoot(projectRoot);

  if (options.check && options.names && options.names.length > 0) {
    throw new CliError("`modules update --check` inspects every declared module and does not accept module names.");
  }

  const declared = await requireModulesFile(projectRoot);
  const context = await resolveRegistryContext(projectRoot);
  const selected = await selectItems(context.root, declared, options.names ?? []);
  const lockfile = await readLockfile(projectRoot);
  const missing: string[] = [];
  const drifted: DriftedFile[] = [];

  for (const item of selected) {
    for (const file of item.files) {
      const current = await readTextIfExists(path.join(projectRoot, file.target));
      // A missing copy is apply's job, not update's; report it as a hint.
      if (current === null) {
        missing.push(`${item.manifest.name}: ${file.target}`);
        continue;
      }
      const latest = await readItemFileContent(file);
      if (current === latest) continue;
      drifted.push({
        item: item.manifest.name,
        target: file.target,
        current,
        latest,
        kind: classify(item, file.target, current, latest, lockfile),
      });
    }
  }

  if (drifted.length === 0) {
    console.info(green(bold("✓ Declared module files are up to date.")));
    if (missing.length > 0) {
      console.info(yellow(`Missing file(s); run 'fewbie modules apply' to restore them:\n  ${missing.join("\n  ")}`));
    }
    return;
  }

  const pristine = drifted.filter((file) => file.kind === "pristine" || file.kind === "legacy");
  const modified = drifted.filter((file) => file.kind === "host-modified");
  const conflicts = drifted.filter((file) => file.kind === "conflict");

  for (const file of pristine) {
    console.info(bold(`# ${file.item} → ${file.target} (${describe(file.kind)})`));
    process.stdout.write(unifiedDiff(file.current, file.latest, `a/${file.target}`, `b/${file.target}`));
    console.info("");
  }
  for (const file of conflicts) {
    console.info(bold(yellow(`# ${file.item} → ${file.target} (conflict: registry and host both changed)`)));
    process.stdout.write(unifiedDiff(file.current, file.latest, `a/${file.target}`, `b/${file.target}`));
    console.info("");
  }
  for (const file of modified) {
    console.info(yellow(`kept ${file.target} (modified locally; --force overwrites)`));
  }

  if (options.check) {
    // The gate stays strict: module files are registry-owned, so every kind of
    // drift fails CI. The classification only explains how to fix it.
    const reasons: string[] = [];
    if (pristine.length > 0) reasons.push(`${pristine.length} file(s) are behind the registry`);
    if (modified.length > 0) reasons.push(`${modified.length} file(s) were modified locally`);
    if (conflicts.length > 0) reasons.push(`${conflicts.length} file(s) conflict with local changes`);
    throw new CliError(`${reasons.join("; ")}. Run \`fewbie modules update\` to adopt the registry version.`);
  }

  if (options.preview || options.dryRun) {
    console.info(
      options.preview
        ? `[preview] ${pristine.length} update(s), ${modified.length} host-modified, ${conflicts.length} conflict(s)`
        : "[dry-run] no files were modified",
    );
    return;
  }

  const writable = [...pristine, ...(options.force ? [...modified, ...conflicts] : [])];
  if (writable.length === 0) {
    console.info(yellow("Nothing to write: every drifted file is host-owned or conflicting (use --force)."));
    return;
  }

  const confirmed = await confirm(`Do you want to UPDATE ${writable.length} file(s)?`, options);
  if (!confirmed) {
    console.info("[info] Update cancelled.");
    return;
  }

  for (const file of writable) {
    const target = path.join(projectRoot, file.target);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, file.latest);
    console.info(`${green("updated")} ${file.target}`);
  }
  await writeUpdatedLockfile(projectRoot, context, selected, writable, lockfile);
  console.info(green(bold(`\n✓ Updated ${writable.length} file(s). Review with git diff.`)));
}

/** Three-way classification against the lockfile baseline (ADR-057 D4). */
function classify(
  item: LoadedItem,
  target: string,
  current: string,
  latest: string,
  lockfile: Lockfile | null,
): DriftKind {
  const lockedHash = lockfile?.modules[item.manifest.name]?.files[target];
  if (lockedHash === undefined) return "legacy";
  if (hashContent(current) === lockedHash) return "pristine";
  if (hashContent(latest) === lockedHash) return "host-modified";
  return "conflict";
}

function describe(kind: DriftKind): string {
  return kind === "legacy" ? "no lockfile baseline" : "registry moved";
}

/** Refresh the lockfile baseline for every file this run wrote. */
async function writeUpdatedLockfile(
  projectRoot: string,
  context: RegistryContext,
  items: LoadedItem[],
  written: DriftedFile[],
  lockfile: Lockfile | null,
): Promise<void> {
  const declaration = await readRegistryDeclaration(projectRoot);
  const modules = { ...(lockfile?.modules ?? {}) };
  for (const item of items) {
    const writtenTargets = new Set(
      written.filter((file) => file.item === item.manifest.name).map((file) => file.target),
    );
    const files: Record<string, string> = { ...(modules[item.manifest.name]?.files ?? {}) };
    for (const file of item.files) {
      if (writtenTargets.has(file.target)) files[file.target] = hashContent(await readItemFileContent(file));
      else if (files[file.target] === undefined) files[file.target] = hashContent(await readItemFileContent(file));
    }
    modules[item.manifest.name] = {
      version: item.manifest.contract?.version ?? "0.0.0",
      commit: context.commit,
      files,
    };
  }
  await writeLockfile(projectRoot, {
    lockfileVersion: LOCKFILE_VERSION,
    registry: { url: declaration?.url ?? "", ref: declaration?.ref ?? "", commit: context.commit },
    modules,
  });
}

/** Load the requested declared items (validated against the declaration). */
async function selectItems(registryRoot: string, declared: string[], names: string[]): Promise<LoadedItem[]> {
  if (names.length === 0) return resolveInstallSet(registryRoot, declared);

  const unknown = names.filter((name) => !declared.includes(name));
  if (unknown.length > 0) {
    throw new CliError(
      `Module(s) not declared in fewbie.json: ${unknown.join(", ")}. Declared: ${declared.join(", ") || "(none)"}.`,
    );
  }
  return resolveInstallSet(registryRoot, names);
}
