import {
  MONITOR_FIELD_LIMITS,
  type IngestPayload,
  type MonitoredErrorEvent,
  type MonitoredRequestEvent,
  type ResolvedBackendMonitorOptions,
} from "./backend-monitor.types";

type QueueItem = { kind: "request"; payload: MonitoredRequestEvent } | { kind: "error"; payload: MonitoredErrorEvent };

/** Timeout for one ingest HTTP call, so a hung platform cannot hold the flush lock. */
const TRANSPORT_TIMEOUT_MS = 10_000;

/** Clamp one string to the server-side DTO maximum. */
function cap(value: string, limit: number): string {
  return value.length > limit ? value.slice(0, limit) : value;
}

/** Clamp an optional string to the server-side DTO maximum. */
function capOptional(value: string | undefined, limit: number): string | undefined {
  return value === undefined ? undefined : cap(value, limit);
}

function capRequestEvent(event: MonitoredRequestEvent): MonitoredRequestEvent {
  return {
    ...event,
    requestId: cap(event.requestId, MONITOR_FIELD_LIMITS.requestId),
    route: cap(event.route, MONITOR_FIELD_LIMITS.route),
    path: cap(event.path, MONITOR_FIELD_LIMITS.path),
    method: cap(event.method, MONITOR_FIELD_LIMITS.method),
    ip: capOptional(event.ip, MONITOR_FIELD_LIMITS.ip),
    userAgent: capOptional(event.userAgent, MONITOR_FIELD_LIMITS.userAgent),
  };
}

function capErrorEvent(event: MonitoredErrorEvent): MonitoredErrorEvent {
  return {
    ...event,
    requestId: capOptional(event.requestId, MONITOR_FIELD_LIMITS.requestId),
    type: cap(event.type, MONITOR_FIELD_LIMITS.type),
    message: cap(event.message, MONITOR_FIELD_LIMITS.message),
    stack: capOptional(event.stack, MONITOR_FIELD_LIMITS.stack),
    route: cap(event.route, MONITOR_FIELD_LIMITS.route),
    path: cap(event.path, MONITOR_FIELD_LIMITS.path),
    method: cap(event.method, MONITOR_FIELD_LIMITS.method),
    ip: capOptional(event.ip, MONITOR_FIELD_LIMITS.ip),
    userAgent: capOptional(event.userAgent, MONITOR_FIELD_LIMITS.userAgent),
  };
}

/**
 * Transport abstraction; the default posts to `endpoint` (the full ingest
 * URL) verbatim. Injected in tests with a fake function.
 */
export type MonitorTransport = (payload: IngestPayload) => Promise<void>;

/**
 * In-memory batching buffer for monitor events.
 *
 * Events are collected into one bounded queue and shipped as a single ingest
 * payload per flush (both kinds share one HTTP call). The queue is bounded:
 * under overflow NEW events are dropped (counted) so monitoring can never
 * exhaust host memory. Delivery is fire-and-forget — failed batches are
 * dropped (warned) and never block or crash the host application.
 *
 * The class is dependency-free (no framework imports): drive it manually with
 * start()/stop(), or use the @devbie/backend-monitor-sdk/nest adapter, which
 * wires those calls to the Nest module lifecycle.
 */
export class MonitorEventReporter {
  private queue: QueueItem[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;
  /** Guards against duplicate beforeExit listeners across start/stop cycles. */
  private beforeExitHandler: (() => void) | null = null;

  /** Total events discarded because the queue was full. */
  droppedCount = 0;
  /** Total batches abandoned after a transport failure. */
  failedBatchCount = 0;

  /** Per-kind counters so enqueue never scans the queue (O(1) instead of O(n)). */
  private requestCount = 0;
  private errorCount = 0;

  constructor(
    private readonly options: ResolvedBackendMonitorOptions,
    private readonly transport?: MonitorTransport,
  ) {}

  /** Starts the periodic flush timer. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.flush();
    }, this.options.flushIntervalMs);
    // Do not keep the process alive just for monitoring flushes.
    this.timer.unref?.();
    // Best-effort drain when the event loop empties. May not complete (e.g. on
    // a hard kill); it must never throw and must never block exit.
    if (!this.beforeExitHandler) {
      this.beforeExitHandler = () => {
        void this.flush();
      };
      process.once("beforeExit", this.beforeExitHandler);
    }
  }

  /** Stops the timer and detaches the beforeExit drain listener. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.beforeExitHandler) {
      process.removeListener("beforeExit", this.beforeExitHandler);
      this.beforeExitHandler = null;
    }
  }

  /** Enqueues a request event; drops it when the queue is full. */
  enqueueRequest(event: MonitoredRequestEvent): void {
    this.enqueue({ kind: "request", payload: capRequestEvent(event) });
  }

  /** Enqueues an error event; drops it when the queue is full. */
  enqueueError(event: MonitoredErrorEvent): void {
    this.enqueue({ kind: "error", payload: capErrorEvent(event) });
  }

  /** Current queue length (observability/test helper). */
  get pendingCount(): number {
    return this.queue.length;
  }

  private enqueue(item: QueueItem): void {
    if (this.queue.length >= this.options.maxQueueSize) {
      this.droppedCount += 1;
      return;
    }
    this.queue.push(item);
    if (item.kind === "request") {
      this.requestCount += 1;
    } else {
      this.errorCount += 1;
    }
    // Ship immediately once either kind reaches the batch cap.
    if (this.requestCount >= this.options.maxBatchSize || this.errorCount >= this.options.maxBatchSize) {
      void this.flush();
    }
  }

  /**
   * Splits at most maxBatchSize events of each kind off the queue, preserving
   * arrival order. Overflow events stay queued for the next flush.
   */
  takeBatch(): IngestPayload | null {
    if (this.queue.length === 0) return null;
    const requests: MonitoredRequestEvent[] = [];
    const errors: MonitoredErrorEvent[] = [];
    const remainder: QueueItem[] = [];

    for (const item of this.queue) {
      const target = item.kind === "request" ? requests : errors;
      if (target.length < this.options.maxBatchSize) {
        target.push(item.payload as MonitoredRequestEvent & MonitoredErrorEvent);
      } else {
        remainder.push(item);
      }
    }
    this.queue = remainder;
    this.requestCount -= requests.length;
    this.errorCount -= errors.length;

    if (requests.length === 0 && errors.length === 0) return null;
    return {
      env: this.options.env,
      instanceId: this.options.instanceId,
      appVersion: this.options.appVersion,
      requests,
      errors,
    };
  }

  /**
   * Ships one batch. Overlapping calls are skipped (the next interval picks up
   * leftovers). A failed transport drops the batch silently after a warning;
   * events must never be retried back into the queue (a hard-down platform
   * would make it grow unbounded).
   */
  async flush(): Promise<void> {
    if (this.flushing) return;
    const batch = this.takeBatch();
    if (!batch) return;

    this.flushing = true;
    try {
      const send = this.transport ?? this.defaultTransport;
      await send(batch);
    } catch (error) {
      this.failedBatchCount += 1;
      // Console (not a framework logger): the core reporter stays dependency-free.
      console.warn(
        `[BackendMonitor] Dropped backend monitor batch (requests=${batch.requests.length}, errors=${batch.errors.length}): ${
          (error as Error)?.message ?? error
        }`,
      );
    } finally {
      this.flushing = false;
    }

    // More events remained because one kind exceeded the cap; flush again.
    if (this.queue.length > 0) await this.flush();
  }

  /** Real network transport used outside tests. */
  private defaultTransport: MonitorTransport = async (payload) => {
    const response = await fetch(this.options.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // MonitorInstallation report token (module-hub design §9.2): the
        // module-owned token returned once at enrollment, not an application
        // agent token.
        "X-Backend-Monitor-Token": this.options.token,
        // Loop guard: the server-side probe skips inbound requests tagged with
        // this header so the ingest call is never reported about itself.
        "X-Backend-Monitor": "1",
      },
      body: JSON.stringify(payload),
      // Bounded wait: otherwise a hanging platform would pin the flush lock.
      signal: AbortSignal.timeout(TRANSPORT_TIMEOUT_MS),
    });
    // fetch only rejects on network/timeout errors; non-2xx must count as a
    // failed (dropped) batch so the platform rejection is observable.
    if (!response.ok) {
      throw new Error(`ingest responded with ${response.status}`);
    }
  };
}
