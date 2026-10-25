import { runCheck } from "./check";
import { scanKnownServices } from "./service-scanner";
import { KNOWN_INDICATORS } from "./known-indicators";
import type { HealthReportingHandle, HealthReportingOptions, NamedHealthIndicator, NestAppLike } from "./types";

const GLOBAL_KEY = Symbol.for("@devbie/health-sdk:active");

/**
 * Starts a health reporting loop that periodically checks all assembled
 * foundation services and POSTs the aggregated snapshot to the server.
 *
 * Auto-detection: the function scans the NestJS DI container for known
 * foundation service constructors (PrismaService, ClickHouseService, ...).
 * Only services that are actually assembled become indicators — no manual
 * wiring needed.
 *
 * If `endpoint` is empty/undefined, checks still run but the POST step is
 * skipped, which is useful for local debugging.
 *
 * Idempotent: calling startHealthReporting twice returns the existing handle.
 * The timers are `unref()`-ed so the process can exit naturally.
 * Network failures are silently dropped to avoid crashing the host process.
 */
export function startHealthReporting(app: NestAppLike, options: HealthReportingOptions): HealthReportingHandle {
  const existing = (globalThis as Record<symbol, unknown>)[GLOBAL_KEY];
  if (existing) return existing as HealthReportingHandle;

  const { endpoint, token, intervalMs = 30_000, initialDelayMs = 10_000, appVersion, env, instanceId } = options;

  // --- Auto-detect assembled foundation services -------------------------
  const discovered = scanKnownServices(
    app,
    KNOWN_INDICATORS.map((k) => k.name),
  );

  const factoryByName = new Map(KNOWN_INDICATORS.map((k) => [k.name, k.factory]));
  const indicators: NamedHealthIndicator[] = discovered.map(({ name, instance }) => {
    const factory = factoryByName.get(name)!;
    return factory(instance);
  });

  if (indicators.length > 0) {
    const names = indicators.map((i) => i.name).join(", ");
    console.log(`[health-sdk] detected indicators: ${names}`);
  } else {
    console.log("[health-sdk] no known foundation services detected");
  }

  // --- Reporting loop ---------------------------------------------------
  const url = endpoint || null;

  const runtimeFacts =
    appVersion !== undefined || env !== undefined || instanceId !== undefined
      ? {
          ...(appVersion !== undefined && { appVersion }),
          ...(env !== undefined && { env }),
          ...(instanceId !== undefined && { instanceId }),
        }
      : undefined;

  async function report(): Promise<void> {
    try {
      const result = await runCheck(indicators);
      if (url && token) {
        const body = runtimeFacts ? JSON.stringify({ ...runtimeFacts, ...result }) : JSON.stringify(result);
        await fetch(url, {
          method: "POST",
          headers: {
            "X-Health-Token": token,
            "Content-Type": "application/json",
          },
          body,
        });
      }
    } catch {
      // Network failures are intentionally silent.
    }
  }

  // Initial delay gives dependencies time to connect before the first check.
  const startTimer = setTimeout(() => {
    void report();
    const loop = setInterval(() => {
      void report();
    }, intervalMs);
    if (typeof (loop as { unref?: unknown }).unref === "function") {
      (loop as { unref(): void }).unref();
    }
    handle._loop = loop;
  }, initialDelayMs);

  if (typeof (startTimer as { unref?: unknown }).unref === "function") {
    (startTimer as { unref(): void }).unref();
  }

  const handle: HealthReportingHandle & { _loop?: ReturnType<typeof setInterval> } = {
    stop: () => {
      clearTimeout(startTimer);
      if (handle._loop) clearInterval(handle._loop);
      delete (globalThis as Record<symbol, unknown>)[GLOBAL_KEY];
    },
  };

  (globalThis as Record<symbol, unknown>)[GLOBAL_KEY] = handle;
  return handle;
}
