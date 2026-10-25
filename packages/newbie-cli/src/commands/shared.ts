import fs from "node:fs/promises";
import path from "node:path";
import figlet from "figlet";
import { cyan } from "colorette";

import { envValues, parseEnv } from "../core/env-file";
import { ENV_PATH } from "../constants/paths";
import { PipelineContext } from "../assemble/types";
import { IssueBag } from "../lib/issues";
import { ensureModulesState, readModulesState } from "../lib/modules-state";
import { RegistryLocation, requireRegistry } from "../lib/registry";
import { createSink, Sink } from "../lib/sink";

export interface GlobalOptions {
  cwd: string;
  dryRun: boolean;
  skipPrismaGenerate?: boolean;
}

export async function readEnvMap(cwd: string): Promise<Record<string, string>> {
  try {
    const raw = await fs.readFile(path.resolve(cwd, ENV_PATH), "utf8");
    return envValues(parseEnv(raw));
  } catch {
    return {};
  }
}

export function printBanner(): void {
  console.info(
    cyan(
      figlet.textSync("Newbie", {
        font: "Standard",
        width: 120,
        whitespaceBreak: true,
      }),
    ),
  );
}

export interface ContextOptions {
  /** Create modules.json when it does not exist yet. */
  ensureConfig?: boolean;
  /** Update (or clone) the remote registry cache; otherwise use it as-is. */
  fetch?: boolean;
  /** Check mode: record planned writes instead of performing them (CI gate). */
  check?: boolean;
}

/**
 * Build the shared pipeline context: sink (dry-run boundary), issue bag,
 * project modules.json state and the resolved newbie-modules registry.
 */
export async function createContext(
  options: GlobalOptions,
  opts: ContextOptions = {},
): Promise<{
  ctx: PipelineContext;
  sink: Sink;
  registry: RegistryLocation;
}> {
  const cwd = path.resolve(options.cwd);
  const sink = createSink(cwd, options.dryRun, { check: opts.check });
  const issues = new IssueBag();

  if (opts.ensureConfig) {
    await ensureModulesState(cwd, sink);
  }

  const state = await readModulesState(cwd);
  const registry = await requireRegistry({ fetch: opts.fetch });

  const ctx: PipelineContext = {
    cwd,
    sink,
    issues,
    state,
    registry,
    skipPrismaGenerate: options.skipPrismaGenerate,
  };

  return { ctx, sink, registry };
}
