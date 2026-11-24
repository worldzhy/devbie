import fs from "node:fs/promises";
import path from "node:path";

import { envValues, parseEnv, CliError, ENV_PATH } from "@devbie/newbie-cli/lib";

/**
 * Credential resolution mirrors `@devbie/aws-secrets-cli`: the CLI never
 * stores credentials. The installation report token already lives in the
 * deployment environment (`MODULE_HUB_TOKEN` is injected at deploy time and
 * present in the developer's local `.env`), so the CLI reads it from
 * `process.env` first and falls back to the project `.env`. An optional
 * expected label lets callers assert which installation they are talking to,
 * the analogue of `expectedAccountId`.
 */

export const MODULE_HUB_MODULES_ENDPOINT = "MODULE_HUB_MODULES_ENDPOINT";
export const MODULE_HUB_TOKEN = "MODULE_HUB_TOKEN";
export const MODULE_HUB_INSTALLATION_LABEL = "MODULE_HUB_INSTALLATION_LABEL";

export interface HubCredentials {
  /** `GET` target for this installation's own recorded module snapshot. */
  modulesUrl: string;
  token: string;
}

/** Project `.env` values; empty when the file is absent or unparseable. */
async function readEnvFileValues(cwd: string): Promise<Record<string, string>> {
  try {
    return envValues(parseEnv(await fs.readFile(path.resolve(cwd, ENV_PATH), "utf8")));
  } catch {
    return {};
  }
}

/** Resolve one variable: process env first, then the project `.env`. */
function pickVariable(name: string, envFile: Record<string, string>, override?: string): string | undefined {
  const explicit = override?.trim();
  if (explicit) return explicit;

  const fromProcess = process.env[name]?.trim();
  if (fromProcess) return fromProcess;

  const fromFile = envFile[name]?.trim();
  return fromFile || undefined;
}

export interface ResolveCredentialsOptions {
  cwd: string;
  /** Explicit modules URL; skips MODULE_HUB_MODULES_ENDPOINT. */
  modulesUrl?: string;
  /** Explicit token override. */
  token?: string;
}

export async function resolveCredentials(options: ResolveCredentialsOptions): Promise<HubCredentials> {
  const envFile = await readEnvFileValues(options.cwd);

  const token = pickVariable(MODULE_HUB_TOKEN, envFile, options.token);
  if (!token) {
    throw new CliError(
      `${MODULE_HUB_TOKEN} is not set. Export it or add it to ${ENV_PATH} ` +
        `(the deployment injects it; a local .env normally already carries it).`,
    );
  }

  const modulesUrl = pickVariable(MODULE_HUB_MODULES_ENDPOINT, envFile, options.modulesUrl);
  if (!modulesUrl) {
    throw new CliError(
      `${MODULE_HUB_MODULES_ENDPOINT} is not set. Export the complete ` +
        `'GET .../module-hub/me/modules' URL, add it to ${ENV_PATH}, or pass --modules-url.`,
    );
  }

  return { modulesUrl, token };
}

/** Expected installation label, when the caller or environment supplies one. */
export async function resolveExpectedLabel(cwd: string, flag?: string): Promise<string | null> {
  const envFile = await readEnvFileValues(cwd);
  return pickVariable(MODULE_HUB_INSTALLATION_LABEL, envFile, flag) ?? null;
}
