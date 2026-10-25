import type { KnownIndicator } from "./types";
import { createAwsIdentityIndicator } from "./indicators/aws-identity.indicator";
import { createClickHouseIndicator } from "./indicators/clickhouse.indicator";
import { createMongoIndicator } from "./indicators/mongo.indicator";
import { createPrismaIndicator } from "./indicators/prisma.indicator";
import { createRedisIndicator } from "./indicators/redis.indicator";

/**
 * Built-in indicator registry.
 *
 * Each entry maps a foundation service's constructor name (as registered in
 * the NestJS DI container) to a factory that wraps the resolved instance
 * into a health indicator.
 *
 * Adding support for a new foundation service is a one-line change here:
 * add a new { name, factory } entry and a corresponding indicator file.
 */
export const KNOWN_INDICATORS: readonly KnownIndicator[] = [
  { name: "PrismaService", factory: createPrismaIndicator },
  { name: "MongoModelRegistry", factory: createMongoIndicator },
  { name: "ClickHouseService", factory: createClickHouseIndicator },
  { name: "RedisService", factory: createRedisIndicator },
  { name: "AwsCredentialsService", factory: createAwsIdentityIndicator },
];
