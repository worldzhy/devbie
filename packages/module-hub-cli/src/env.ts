import fs from "node:fs/promises";
import path from "node:path";

import { envValues, parseEnv, CliError, ENV_PATH } from "@devbie/newbie-cli/lib";

/**
 * Credential resolution mirrors `@devbie/aws-secrets-cli`: the CLI never
 * stores credentials. The installation report token already lives in the
 * deployment environment (`MODULE_HUB_ENDPOINT` / `MODULE_HUB_TOKEN` are
 * injected at deploy time and present in the developer's local `.env`), so
 * the CLI reads them from `process.env` first and falls back to the project
 * `.env`. An optional expected label lets callers assert which installation
 * they are talking to, the analogue of `expectedAccountId`.
 */

export const MODULE_HUB_ENDPOINT = "MODULE_HUB_ENDPOINT";
export const MODULE_HUB_TOKEN = "MODULE_HUB_TOKEN";
export const MODULE_HUB_INSTALLATION_LABEL = "MODULE_HUB_INSTALLATION_LABEL";

/** Report endpoint suffix; the self-inspection endpoint derives from it. */
const REPORT_SUFFIX = "/module-hub/report";

export interface HubCredentials {
  /** `POST` target for instance reports, e.g. https://api.example.com/module-hub/report. */
  reportUrl: string;
  /** `GET` target for this installation's own recorded snapshot. */
  selfUrl: string;
  token: string;
}

/**
 * Derive the self-inspection URL from the report endpoint.
 *
 * `MODULE_HUB_ENDPOINT` is the full report URL (see the provisioning docs), so
 * the hub root is recovered by stripping the known suffix. Anything else is a
 * configuration error rather than something to guess at: silently guessing a
 * URL could point the CLI at the wrong hub.
 */
export function deriveSelfUrl(reportUrl: string): string {
  if (!reportUrl.endsWith(REPORT_SUFFIX)) {
    throw new CliError(
      `${MODULE_HUB_ENDPOINT} must end with '${REPORT_SUFFIX}' (got '${reportUrl}'). ` +
        `Pass --endpoint with the full self-inspection URL to override the derivation.`,
    );
  }
  return `${reportUrl.slice(0, -REPORT_SUFFIX.length)}/module-hub/self/modules`;
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
  /** Explicit self-inspection URL override; skips derivation. */
  endpoint?: string;
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

  const endpoint = pickVariable(MODULE_HUB_ENDPOINT, envFile, options.endpoint);
  if (!endpoint) {
    throw new CliError(
      `${MODULE_HUB_ENDPOINT} is not set. Export it or add it to ${ENV_PATH}. ` +
        `Use --endpoint only when the report URL has a non-standard shape.`,
    );
  }

  return {
    reportUrl: endpoint,
    selfUrl: options.endpoint ? endpoint : deriveSelfUrl(endpoint),
    token,
  };
}

/** Expected installation label, when the caller or environment supplies one. */
export async function resolveExpectedLabel(cwd: string, flag?: string): Promise<string | null> {
  const envFile = await readEnvFileValues(cwd);
  return pickVariable(MODULE_HUB_INSTALLATION_LABEL, envFile, flag) ?? null;
}
