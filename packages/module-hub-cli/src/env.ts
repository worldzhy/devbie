import fs from "node:fs/promises";
import path from "node:path";

import { envValues, parseEnv, CliError, ENV_PATH } from "@devbie/newbie-cli/lib";

/**
 * Credential resolution mirrors `@devbie/aws-secrets-cli`: the CLI never
 * stores credentials. The installation report token already lives in the
 * deployment environment (`MODULE_HUB_BASE_URL` / `MODULE_HUB_TOKEN` are
 * injected at deploy time and present in the developer's local `.env`), so
 * the CLI reads them from `process.env` first and falls back to the project
 * `.env`. An optional expected label lets callers assert which installation
 * they are talking to, the analogue of `expectedAccountId`.
 */

export const MODULE_HUB_BASE_URL = "MODULE_HUB_BASE_URL";
export const MODULE_HUB_TOKEN = "MODULE_HUB_TOKEN";
export const MODULE_HUB_INSTALLATION_LABEL = "MODULE_HUB_INSTALLATION_LABEL";

/**
 * Read endpoint of the caller's own installation, appended to the configured
 * base URL. `me` means "the installation the presented token belongs to",
 * mirroring the host-scoped `GET /module-hub/installations/:id/modules` used
 * by the hub UI.
 */
const OWN_MODULES_PATH = "/module-hub/me/modules";

export interface HubCredentials {
  /** `GET` target for this installation's own recorded module snapshot. */
  modulesUrl: string;
  token: string;
}

/**
 * Join the configured base URL with the caller-scoped modules path.
 *
 * `MODULE_HUB_BASE_URL` is the hub base URL (origin, plus an optional deployment
 * prefix such as `/api`); the route itself belongs to the hub and is never
 * part of the deployment config (ADR-075). A value that already carries a
 * `/module-hub` segment is the old full-report-URL form and is rejected:
 * appending the path twice would only produce a confusing 404.
 */
export function buildModulesUrl(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, "");
  if (!base) {
    throw new CliError(`${MODULE_HUB_BASE_URL} is empty. Point it at the hub base URL (ADR-075).`);
  }
  if (/\/module-hub(\/|$)/.test(base)) {
    throw new CliError(
      `${MODULE_HUB_BASE_URL} must be the hub base URL without a '/module-hub' path (got '${baseUrl}'). ` +
        `Pass --modules-url with the full '${OWN_MODULES_PATH}' URL to override.`,
    );
  }
  return `${base}${OWN_MODULES_PATH}`;
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
  /** Explicit modules URL; skips building it from MODULE_HUB_BASE_URL. */
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

  const baseUrl = pickVariable(MODULE_HUB_BASE_URL, envFile);
  if (!baseUrl) {
    throw new CliError(
      `${MODULE_HUB_BASE_URL} is not set. Export it or add it to ${ENV_PATH}. ` +
        `Use --modules-url only when the hub route has a non-standard shape.`,
    );
  }

  return { modulesUrl: buildModulesUrl(baseUrl), token };
}

/** Expected installation label, when the caller or environment supplies one. */
export async function resolveExpectedLabel(cwd: string, flag?: string): Promise<string | null> {
  const envFile = await readEnvFileValues(cwd);
  return pickVariable(MODULE_HUB_INSTALLATION_LABEL, envFile, flag) ?? null;
}
