/**
 * Public configuration for the built-in backend monitor probe.
 *
 * This is business configuration (which monitor instance, which agent
 * token), therefore it is supplied by the project — through
 * BackendMonitorModule.forRoot() in Nest hosts, or directly to the
 * MonitorEventReporter constructor in framework-less ones.
 */
export interface BackendMonitorOptions {
  /** Full ingest report URL (e.g. https://monitor.example.com/backend-monitor/ingest).
   * The probe is installed only when both `endpoint` and `token` are set;
   * leave them empty to run with zero instrumentation. */
  endpoint: string;
  /**
   * MonitorInstallation report token (module-hub design §9.2), returned once
   * at installation enrollment; sent as X-Backend-Monitor-Token.
   */
  token: string;
  /** Deployment environment label (e.g. production / staging). Defaults to process.env.ENVIRONMENT. */
  env?: string;
  /** Application version label. */
  appVersion?: string;
  /** Reporting instance id. Defaults to os.hostname(). */
  instanceId?: string;
  /** Flush interval in milliseconds. Defaults to 5000. */
  flushIntervalMs?: number;
  /** Events of each kind sent in one ingest call. Defaults to 500. */
  maxBatchSize?: number;
  /**
   * Hard cap on the in-memory queue; when exceeded, NEW events are dropped.
   * Defaults to 2000. Bounded memory is more important than delivering every
   * event when the platform is unreachable.
   */
  maxQueueSize?: number;
}

/** A single HTTP request metric captured by the probe. */
export interface MonitoredRequestEvent {
  requestId: string;
  route: string;
  path: string;
  method: string;
  statusCode: number;
  requestAt: string;
  responseAt: string;
  ip?: string;
  userAgent?: string;
}

/** A single error captured by the probe. */
export interface MonitoredErrorEvent {
  requestId?: string;
  type: string;
  message: string;
  stack?: string;
  route: string;
  path: string;
  method: string;
  statusCode: number;
  ip?: string;
  userAgent?: string;
  occurredAt: string;
}

/** Wire payload of the POST /backend-monitor/ingest call. */
export interface IngestPayload {
  env: string;
  instanceId: string;
  appVersion: string;
  requests: MonitoredRequestEvent[];
  errors: MonitoredErrorEvent[];
}

/** Fully resolved options with defaults applied. */
export interface ResolvedBackendMonitorOptions {
  endpoint: string;
  token: string;
  env: string;
  appVersion: string;
  instanceId: string;
  flushIntervalMs: number;
  maxBatchSize: number;
  maxQueueSize: number;
}
