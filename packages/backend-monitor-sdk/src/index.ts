/**
 * @devbie/backend-monitor-sdk public entry (zero-dependency core).
 *
 * - MonitorEventReporter: in-memory batching reporter posting to the full
 *   ingest URL given by `endpoint` (fire-and-forget, bounded queue).
 * - createExpressMonitorMiddleware: native Express request-metric middleware.
 * - Event/configuration types shared with the reporter.
 *
 * The NestJS adapter (BackendMonitorModule.forRoot, middleware, interceptor)
 * lives at @devbie/backend-monitor-sdk/nest and requires the optional
 * @nestjs/* peers.
 */

// Published package version, read at runtime (package.json sits one level
// above both src/ during development and dist/ in the published tarball).
// eslint-disable-next-line @typescript-eslint/no-require-imports
export const VERSION = (require("../package.json") as { version: string }).version;

export * from "./backend-monitor.types";
export * from "./backend-monitor.reporter";
export * from "./express-monitor.middleware";
