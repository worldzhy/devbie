import fs from "node:fs/promises";
import path from "node:path";
import figlet from "figlet";
import { bold, cyan, gray, green, red, yellow } from "colorette";
import { MODULES_DIR, MODULES_JSON, moduleKeys } from "@devbie/modules-state";

import { MODULES_CONFIG_TS, MODULES_MODULE_TS, PRISMA_SCHEMA_MAIN, PRISMA_SCHEMA_MODELS_DIR } from "../constants/paths";
import { diffSnapshots } from "../core/drift";
import { findMissingEnabledModules } from "../core/module-closure";
import { moduleSchemaNamespace, readDatasourceSchemas } from "../core/prisma-schema";
import { collectMissingEnv } from "../lib/check";
import { CliError, fileExists } from "@devbie/cli-kit";
import { snapshotInstalledModule, snapshotPristineModule } from "../lib/drift";
import { listRegistryKeys, readRegistryModule, resolveRegistry } from "../lib/registry";
import { readInstalledManifest } from "../lib/module-install";
import { readModulesState, stateExists } from "../lib/modules-state";

import { GlobalOptions } from "./shared";

interface DoctorFinding {
  level: "error" | "notice";
  message: string;
}

export interface DoctorOptions extends GlobalOptions {
  /** Print findings as JSON instead of human-readable text. */
  json?: boolean;
}

export async function runDoctor(options: DoctorOptions): Promise<void> {
  if (!options.json) {
    console.info(
      figlet.textSync("Newbie", {
        font: "Epic",
        width: 80,
        whitespaceBreak: true,
      }),
    );
  }

  const cwd = path.resolve(options.cwd);
  const findings: DoctorFinding[] = [];
  const error = (message: string): void => {
    findings.push({ level: "error", message });
  };
  const notice = (message: string): void => {
    findings.push({ level: "notice", message });
  };

  // [check 1] modules.json
  if (!(await stateExists(cwd))) {
    throw new CliError(`${MODULES_JSON} not found. Run 'newbie modules' to declare modules first.`);
  }
  const state = await readModulesState(cwd);
  const keys = moduleKeys(state);

  // [check 2] registry
  const registry = await resolveRegistry({ fetch: false });
  if (registry && !options.json) {
    console.info(
      `Registry: ${registry.local ? "local " : "cached "}${registry.root} @ ${registry.sourceCommit?.slice(0, 7) ?? "unknown"}\n`,
    );
  } else if (!registry) {
    notice("Registry unavailable offline; drift checks skipped (set NEWBIE_MODULES_PATH or run an online command).");
  }

  const known = new Set(registry ? await listRegistryKeys(registry.root) : []);
  for (const key of keys) {
    if (!known.has(key)) error(`Module '${key}' is not present in the registry.`);
  }

  // [check 3] generated wiring
  if (!(await fileExists(cwd, MODULES_MODULE_TS))) {
    error(`Generated ${MODULES_MODULE_TS} is missing; run 'newbie modules apply'.`);
  }
  if (!(await fileExists(cwd, MODULES_CONFIG_TS))) {
    error(`Generated ${MODULES_CONFIG_TS} is missing; run 'newbie modules apply'.`);
  }

  // [check 4] per-module state
  const moduleGraph = new Map<string, readonly string[]>();
  const missingEnv = await collectMissingEnv(cwd, keys);
  const datasourceContent = await fs.readFile(path.resolve(cwd, PRISMA_SCHEMA_MAIN), "utf8").catch(() => null);
  const datasourceSchemas = datasourceContent ? readDatasourceSchemas(datasourceContent) : null;
  if (datasourceContent && datasourceSchemas === null) {
    notice(`Cannot parse schemas array in ${PRISMA_SCHEMA_MAIN}.`);
  }

  for (const key of keys) {
    const label = bold(key);

    if (!(await fileExists(cwd, `${MODULES_DIR}/${key}`))) {
      error(`${label}: module directory missing; run 'newbie modules apply'.`);
      continue;
    }

    const manifest = await readInstalledManifest(cwd, key);
    if (!manifest) {
      error(`${label}: newbie.module.json missing or unreadable.`);
      continue;
    }
    moduleGraph.set(key, manifest.moduleDependencies ?? []);

    if (manifest.schema) {
      if (!(await fileExists(cwd, path.posix.join(PRISMA_SCHEMA_MODELS_DIR, `${key}.prisma`)))) {
        error(`${label}: ${PRISMA_SCHEMA_MODELS_DIR}/${key}.prisma missing; run 'newbie modules apply'.`);
      }
      if (datasourceSchemas && !datasourceSchemas.includes(moduleSchemaNamespace(key))) {
        error(`${label}: datasource schemas lacks '${moduleSchemaNamespace(key)}'.`);
      }
    }

    if (missingEnv[key]) {
      error(`${label}: missing env ${missingEnv[key].join(", ")}`);
    }

    const record = state.modules.find((entry) => entry.key === key);
    if (registry?.sourceCommit && record?.sourceCommit && record.sourceCommit !== registry.sourceCommit) {
      notice(
        `${label}: update available (${record.sourceCommit.slice(0, 7)} -> ${registry.sourceCommit.slice(0, 7)}); run 'newbie modules update'.`,
      );
    }

    // Deprecation: the module still works but must not spread to new hosts.
    if (manifest.deprecated) {
      notice(`${label}: deprecated — ${manifest.deprecated}`);
    }

    // Content drift against the pristine registry tree at the pinned commit.
    if (registry && record?.sourceCommit) {
      const pristine = await snapshotPristineModule(registry, key, record.sourceCommit);
      if (pristine) {
        const drift = diffSnapshots(await snapshotInstalledModule(cwd, key), pristine);
        if (!drift.clean) {
          const details = [
            ...drift.changed.map((file) => `changed: ${file}`),
            ...drift.added.map((file) => `added: ${file}`),
            ...drift.removed.map((file) => `removed: ${file}`),
          ].join("; ");
          // Local drift is a normal state: consumers edit assembled modules
          // and back-port them to the registry. Report as a notice so doctor
          // does not fail the build during active development.
          notice(`${label}: local drift detected (${details}); back-port to the registry when ready.`);
        }
      }
    }
  }

  // [check 4b] declared moduleDependencies must all be enabled.
  for (const { module, dependency } of findMissingEnabledModules(keys, moduleGraph)) {
    error(
      `'${dependency}' must be enabled because module '${module}' declares it as a module dependency; run 'newbie modules apply'.`,
    );
  }

  // [check 5] copied module directories that modules.json does not know about.
  const copied = new Set(
    (
      await fs
        .readdir(path.resolve(cwd, MODULES_DIR), { withFileTypes: true })
        .catch((): import("node:fs").Dirent[] => [])
    )
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name),
  );
  for (const dir of copied) {
    if (!keys.includes(dir)) {
      const isRegistryModule = registry ? (await readRegistryModule(registry.root, dir)) !== null : false;
      if (isRegistryModule) {
        notice(
          `Extra module directory '${dir}' not declared in ${MODULES_JSON}; run 'newbie modules apply' to remove it.`,
        );
      }
    }
  }

  // [check 6] orphan prisma fragments whose module is no longer enabled.
  const enabledKeySet = new Set(keys);
  const modelFiles = await fs.readdir(path.resolve(cwd, PRISMA_SCHEMA_MODELS_DIR)).catch((): string[] => []);
  for (const file of modelFiles) {
    if (!file.endsWith(".prisma")) continue;
    const orphanKey = file.slice(0, -".prisma".length);
    if (!enabledKeySet.has(orphanKey)) {
      error(
        `Orphan prisma fragment '${PRISMA_SCHEMA_MODELS_DIR}/${file}' (module '${orphanKey}' not enabled); run 'newbie modules apply' to remove it.`,
      );
    }
  }

  const errors = findings.filter((finding) => finding.level === "error");
  const notices = findings.filter((finding) => finding.level === "notice");

  if (options.json) {
    console.info(
      JSON.stringify(
        {
          cwd,
          registry: registry
            ? {
                available: true,
                local: registry.local,
                path: registry.root,
                sourceCommit: registry.sourceCommit,
              }
            : { available: false },
          errors: errors.map((finding) => finding.message),
          notices: notices.map((finding) => finding.message),
        },
        null,
        2,
      ),
    );
    if (errors.length > 0) process.exitCode = 1;
    return;
  }

  for (const finding of errors) console.info(red(`  ✗ ${finding.message}`));
  for (const finding of notices) console.info(yellow(`  ! ${finding.message}`));
  if (findings.length === 0) {
    console.info(green("\n✓ Everything looks good.\n"));
  } else {
    console.info(gray(`\n${errors.length} error(s), ${notices.length} notice(es).\n`));
    console.info(cyan("(notices are informational; errors make the command fail)"));
  }

  if (errors.length > 0) {
    throw new CliError(`Doctor found ${errors.length} problem(s).`);
  }
}
