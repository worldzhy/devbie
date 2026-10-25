export { startHealthReporting } from "./health-reporter";
export { runCheck } from "./check";
export { KNOWN_INDICATORS } from "./known-indicators";
export { scanKnownServices } from "./service-scanner";

export type {
  HealthIndicatorEntry,
  HealthCheckResult,
  HealthReportingOptions,
  HealthReportingHandle,
  KnownIndicator,
  NamedHealthIndicator,
  NestAppLike,
  HealthIndicatorFactory,
} from "./types";

// Re-export individual indicator factories so consumers can build custom
// indicator registries if needed.
export { createPrismaIndicator } from "./indicators/prisma.indicator";
export { createMongoIndicator } from "./indicators/mongo.indicator";
export { createClickHouseIndicator } from "./indicators/clickhouse.indicator";
export { createRedisIndicator } from "./indicators/redis.indicator";
export { createAwsIdentityIndicator } from "./indicators/aws-identity.indicator";
