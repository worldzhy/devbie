import { hostname } from "node:os";
import { VERSION } from "../version";
import { readModuleSnapshot, type ModuleSnapshotEntry } from "./snapshot";

/**
 * Built-in module-hub reporter client.
 *
 * When the process sets `MODULE_HUB_ENDPOINT` + `MODULE_HUB_TOKEN`, this
 * client self-registers with the hub on startup (a `kind="full"` report
 * containing the assembled-module snapshot) and then sends a lightweight
 * `kind="ping"` every `reportIntervalSeconds` (returned by the hub,
 * currently 60s).
 *
 * Design constraints (mirrors `@devbie/heartbeat-sdk`):
 *   - **Idempotent** via a `globalThis[Symbol]` singleton so Next.js HMR or
 *     double-init does not create duplicate timers.
 *   - **Non-blocking**: `setInterval().unref()` keeps the timer from holding
 *     the event loop open; the process exits naturally.
 *   - **Silent failure**: network errors are swallowed — monitoring must
 *     never crash the host application.
 *   - **Non-blocking startup**: the first `full` report is fire-and-forget;
 *     the HTTP server is already accepting traffic before this runs.
 */

/** Timeout for one report HTTP call so a hung hub cannot hold the timer. */
const REPORT_TIMEOUT_MS = 10_000;
/** Default ping interval when the hub response omits reportIntervalSeconds. */
const DEFAULT_PING_INTERVAL_MS = 60_000;
/**
 * Lower bound for a hub-provided ping interval. A hub returning a tiny,
 * zero or negative `reportIntervalSeconds` must not turn every host into a
 * millisecond-level ping storm.
 */
const MIN_PING_INTERVAL_MS = 5_000;

export interface ModuleHubReportOptions {
  /** Full module-hub report URL, e.g. https://api.example.com/module-hub/report. */
  endpoint: string;
  /** Report token sent as X-Module-Hub-Token header. */
  token: string;
  /** Project root where modules.json lives. Defaults to process.cwd(). */
  projectRoot?: string;
  /** Deployed application version (git sha / semver). Defaults to APP_VERSION env. */
  appVersion?: string;
  /** Self-reported deployment environment. Defaults to ENVIRONMENT env. */
  env?: string;
  /** Self-reported instance identifier. Defaults to os.hostname(). */
  instanceId?: string;
}

/** Handle returned by startModuleHubReporting for lifecycle control. */
export interface ModuleHubReportHandle {
  /** Stop the ping loop and release the global singleton. */
  stop(): void;
}

const GLOBAL_KEY = Symbol.for("@devbie/newbie:module-hub-reporter");

/**
 * Turns an untrusted hub-supplied `reportIntervalSeconds` into a safe
 * interval in milliseconds, or `null` when the value is not a finite number.
 */
function resolvePingIntervalMs(reportIntervalSeconds: unknown): number | null {
  if (typeof reportIntervalSeconds !== "number" || !Number.isFinite(reportIntervalSeconds)) {
    return null;
  }
  return Math.max(MIN_PING_INTERVAL_MS, Math.round(reportIntervalSeconds * 1000));
}

/**
 * Starts the module-hub reporting loop.
 *
 * Immediately sends a `kind="full"` report (with the module snapshot read
 * from `modules.json`), then sends `kind="ping"` every
 * `reportIntervalSeconds` (from the hub response, default 60s).
 *
 * Idempotent: calling twice returns the existing handle. The timer is
 * `unref()`-ed so the process can exit naturally. Network failures are
 * silently dropped to avoid crashing the host process.
 */
export function startModuleHubReporting(options: ModuleHubReportOptions): ModuleHubReportHandle {
  const existing = (globalThis as Record<symbol, unknown>)[GLOBAL_KEY];
  if (existing) {
    return existing as ModuleHubReportHandle;
  }

  const { endpoint, token } = options;
  const url = endpoint;
  const projectRoot = options.projectRoot ?? process.cwd();
  const appVersion = options.appVersion ?? process.env.APP_VERSION ?? "";
  const env = options.env ?? process.env.ENVIRONMENT ?? "";
  const instanceId = options.instanceId ?? hostname();

  let pingIntervalMs = DEFAULT_PING_INTERVAL_MS;
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;

  /** (Re)create the ping interval with the current pingIntervalMs. */
  function schedulePing(): void {
    if (stopped) return;
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      void sendPing();
    }, pingIntervalMs);
    timer.unref();
  }

  /**
   * Send a ping and adjust the interval if the hub returns a new
   * reportIntervalSeconds. This lets the hub dynamically change the cadence
   * (e.g. back off during incidents) without restarting the process.
   */
  async function sendPing(): Promise<void> {
    const response = await send({ kind: "ping" });
    const newInterval = resolvePingIntervalMs(response?.reportIntervalSeconds);
    if (newInterval !== null && newInterval !== pingIntervalMs) {
      pingIntervalMs = newInterval;
      schedulePing();
    }
  }

  async function send(body: Record<string, unknown>): Promise<{ reportIntervalSeconds?: number } | null> {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Module-Hub-Token": token,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REPORT_TIMEOUT_MS),
      });
      if (!response.ok) return null;
      return (await response.json()) as { reportIntervalSeconds?: number };
    } catch {
      // Report failures are intentionally silent.
      return null;
    }
  }

  async function reportFull(): Promise<void> {
    let modules: ModuleSnapshotEntry[] = [];
    try {
      modules = await readModuleSnapshot(projectRoot);
    } catch {
      // modules.json read failed; report without a snapshot.
    }

    const response = await send({
      kind: "full",
      framework: "newbie",
      frameworkVersion: `newbie@${VERSION}`,
      appVersion,
      env,
      instanceId,
      modules,
    });

    const intervalFromFull = resolvePingIntervalMs(response?.reportIntervalSeconds);
    if (intervalFromFull !== null) {
      pingIntervalMs = intervalFromFull;
    }

    // Start the ping loop now that we know the interval (or the default).
    if (!stopped && !timer) {
      schedulePing();
    }
  }

  // Fire the first full report immediately (async, fire-and-forget).
  void reportFull();

  const handle: ModuleHubReportHandle = {
    stop: () => {
      stopped = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      delete (globalThis as Record<symbol, unknown>)[GLOBAL_KEY];
    },
  };

  (globalThis as Record<symbol, unknown>)[GLOBAL_KEY] = handle;
  return handle;
}
