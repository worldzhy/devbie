// Published package version, read at runtime (package.json sits one level
// above both src/ during development and dist/ in the published tarball).
// eslint-disable-next-line @typescript-eslint/no-require-imports
export const VERSION = (require("../package.json") as { version: string }).version;

/** Configuration required to start the heartbeat loop. */
export interface HeartbeatOptions {
  /** Full heartbeat report URL, e.g. https://host/heartbeat/ping. */
  endpoint: string;
  /** Installation token sent as X-Heartbeat-Token header; globally unique. */
  token: string;
  /** Heartbeat interval in milliseconds. Defaults to 30000. */
  intervalMs?: number;
  /** Deployed application version (git sha / semver), self-reported. */
  appVersion?: string;
  /** Self-reported deployment environment, e.g. "prod". */
  env?: string;
  /** Self-reported instance identifier (hostname, EC2 instance id, ...). */
  instanceId?: string;
}

/** Handle returned by startHeartbeat for lifecycle control. */
export interface HeartbeatHandle {
  /** Stop the heartbeat loop and release the global singleton. */
  stop(): void;
}

const GLOBAL_KEY = Symbol.for("@devbie/heartbeat-sdk:active");

/** Upper bound on a single heartbeat POST so a hung endpoint cannot stall the loop. */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Starts a heartbeat loop that POSTs to `endpoint` (the full report URL)
 * immediately and then every `intervalMs` (default 30s).
 *
 * The installation token is globally unique, so the server resolves the
 * installation from the X-Heartbeat-Token header alone. Optional metadata
 * (appVersion/env/instanceId) travels in the JSON body.
 *
 * Idempotent: calling startHeartbeat twice returns the existing handle.
 * The timer is `unref()`-ed so the process can exit naturally.
 * Network failures are silently dropped to avoid crashing the host process.
 */
export function startHeartbeat(options: HeartbeatOptions): HeartbeatHandle {
  const existing = (globalThis as Record<symbol, unknown>)[GLOBAL_KEY];
  if (existing) {
    return existing as HeartbeatHandle;
  }

  const { endpoint, token, intervalMs = 30_000, appVersion, env, instanceId } = options;
  const url = endpoint;
  const body =
    appVersion !== undefined || env !== undefined || instanceId !== undefined
      ? JSON.stringify({
          ...(appVersion !== undefined && { appVersion }),
          ...(env !== undefined && { env }),
          ...(instanceId !== undefined && { instanceId }),
        })
      : undefined;

  async function beat(): Promise<void> {
    try {
      await fetch(url, {
        method: "POST",
        headers: {
          "X-Heartbeat-Token": token,
          ...(body !== undefined && { "Content-Type": "application/json" }),
        },
        ...(body !== undefined && { body }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      // Heartbeat failures are intentionally silent.
    }
  }

  void beat();
  const timer = setInterval(beat, intervalMs);
  if (typeof (timer as { unref?: unknown }).unref === "function") {
    (timer as { unref(): void }).unref();
  }

  const handle: HeartbeatHandle = {
    stop: () => {
      clearInterval(timer);
      delete (globalThis as Record<symbol, unknown>)[GLOBAL_KEY];
    },
  };

  (globalThis as Record<symbol, unknown>)[GLOBAL_KEY] = handle;
  return handle;
}
