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

/** Report endpoint suffix; the caller-scoped modules endpoint derives from it. */
const REPORT_SUFFIX = "/module-hub/report";

/**
 * Read endpoint of the caller's own installation. `me` means "the installation
 * the presented token belongs to", mirroring the host-scoped
 * `GET /module-hub/installations/:id/modules` used by the hub UI.
 */
const OWN_MODULES_PATH = "/module-hub/me/modules";

export interface HubCredentials {
  /** `GET` target for this installation's own recorded module snapshot. */
  modulesUrl: string;
  token: string;
}

/**
 * Derive the caller-scoped modules URL from the report endpoint.
 *
 * `MODULE_HUB_ENDPOINT` is the full report URL (see the provisioning docs), so
 * the hub root is recovered by stripping the known suffix. Anything else is a
 * configuration error rather than something to guess at: silently guessing a
 * URL could point the CLI at the wrong hub.
 */
export function deriveModulesUrl(reportUrl: string): string {
  if (!reportUrl.endsWith(REPORT_SUFFIX)) {
    throw new CliError(
      `${MODULE_HUB_ENDPOINT} must end with '${REPORT_SUFFIX}' (got '${reportUrl}'). ` +
        `Pass --modules-url with the full '${OWN_MODULES_PATH}' URL to override the derivation.`,
    );
  }
  return `${reportUrl.slice(0, -REPORT_SUFFIX.length)}${OWN_MODULES_PATH}`;
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
  /** Explicit modules URL; skips derivation from MODULE_HUB_ENDPOINT. */
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

  const modulesUrlOverride = options.modulesUrl?.trim();
  if (modulesUrlOverride) {
    return { modulesUrl: modulesUrlOverride, token };
  }

  const endpoint = pickVariable(MODULE_HUB_ENDPOINT, envFile);
  if (!endpoint) {
    throw new CliError(
      `${MODULE_HUB_ENDPOINT} is not set. Export it or add it to ${ENV_PATH}. ` +
        `Use --modules-url only when the endpoint has a non-standard shape.`,
    );
  }

  return { modulesUrl: deriveModulesUrl(endpoint), token };
}

/** Expected installation label, when the caller or environment supplies one. */
export async function resolveExpectedLabel(cwd: string, flag?: string): Promise<string | null> {
  const envFile = await readEnvFileValues(cwd);
  return pickVariable(MODULE_HUB_INSTALLATION_LABEL, envFile, flag) ?? null;
}
