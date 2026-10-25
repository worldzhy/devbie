import { CliError } from "@devbie/newbie-cli/lib";

import type { HubCredentials } from "./env";

/**
 * Minimal HTTP client for the token-only half of the module-hub API.
 *
 * Only endpoints authenticated by the installation report token are used, so
 * this client needs no host user session: `GET /module-hub/me/modules`
 * returns facts about the installation the token belongs to.
 */

const REQUEST_TIMEOUT_MS = 15_000;

/** Installation facts returned by the caller-scoped modules endpoint. */
export interface RemoteInstallation {
  id?: string;
  label?: string;
  env?: string | null;
  appVersion?: string | null;
  framework?: string | null;
  frameworkVersion?: string | null;
  instanceId?: string | null;
  lastSeenAt?: string | null;
  online?: boolean;
}

/** One module entry as recorded by the hub (loose shape, verbatim snapshot). */
export type RemoteModule = Record<string, unknown>;

export interface InstallationInspection {
  installation: RemoteInstallation;
  /** Latest snapshot reported by the instance; null before the first report. */
  actual: RemoteModule[] | null;
  /** Host-marked desired module set; null when unset. */
  targetSpec: Record<string, unknown> | null;
  /** When the snapshot was reported (ISO string), null before the first report. */
  reportedAt: string | null;
}

async function request(url: string, token: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new CliError(`Cannot reach ${url}: ${(error as Error).message}`);
  }

  if (response.status === 401 || response.status === 403) {
    throw new CliError(
      `The hub rejected the installation token (HTTP ${response.status}). ` +
        `Check MODULE_HUB_TOKEN and that the installation is not revoked.`,
    );
  }
  if (!response.ok) {
    throw new CliError(`The hub returned HTTP ${response.status} for ${url}.`);
  }

  try {
    return (await response.json()) as unknown;
  } catch {
    throw new CliError(`The hub returned a non-JSON body for ${url}.`);
  }
}

/** Fetch this installation's recorded snapshot and host-marked target spec. */
export async function fetchInstallationInspection(credentials: HubCredentials): Promise<InstallationInspection> {
  const json = await request(credentials.modulesUrl, credentials.token);

  // Hosts wrap success payloads in their global response envelope
  // (`{ code, error, data }` is the common shape). Unwrap when present and
  // fall back to the raw body so an unwrapped hub still works.
  const wrapped = (json as { data?: unknown } | null)?.data;
  const body = (wrapped && typeof wrapped === "object" ? wrapped : json) as Partial<InstallationInspection> | null;

  if (!body || typeof body !== "object") {
    throw new CliError(`Unexpected module snapshot payload from ${credentials.modulesUrl}.`);
  }

  const installation = body.installation;
  if (!installation || typeof installation !== "object") {
    throw new CliError(`Module snapshot payload from ${credentials.modulesUrl} has no installation block.`);
  }

  return {
    installation,
    actual: Array.isArray(body.actual) ? (body.actual as RemoteModule[]) : null,
    targetSpec: body.targetSpec && typeof body.targetSpec === "object" ? body.targetSpec : null,
    reportedAt: typeof body.reportedAt === "string" ? body.reportedAt : null,
  };
}
