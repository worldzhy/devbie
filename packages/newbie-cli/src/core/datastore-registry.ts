/**
 * Framework datastore registry (ADR-008 D3): the single source of truth for
 * every module allowed to carry `layer: "datastore"`.
 *
 * A registry module marked as a datastore must be listed here — layer lint
 * and assemble both reject unlisted keys, mirroring the "unlisted = error"
 * pattern of check-template-deps. This table owns every runtime value of the
 * module's deploy/compose.modules.yml service (image, healthcheck, volumes,
 * ulimits) plus the backup.sh engine mapping; module manifests gain no
 * datastore-specific fields. Precedent: the postgres image is pinned in the
 * framework compose file the same way.
 *
 * Values mirror the module-derived services previously hand-written in
 * deploy/compose.prod.yml (identical across hosts).
 */

export interface ComposeHealthcheck {
  test: string[];
  interval: string;
  timeout: string;
  retries: number;
}

export interface ComposeServiceSpec {
  image: string;
  /** Absent for profile-gated one-shot helpers (no restart policy). */
  restart?: "unless-stopped" | "no";
  command?: string[];
  /** Render `env_file: ["./.env"]` (host-interpolated secrets). */
  envFile?: boolean;
  environment?: Record<string, string>;
  volumes?: string[];
  ulimits?: Record<string, { soft: string; hard: string }>;
  healthcheck?: ComposeHealthcheck;
  profiles?: string[];
  dependsOn?: Record<string, { condition: "service_healthy" | "service_completed_successfully" }>;
}

export interface DatastoreDefinition {
  /**
   * Main service rendered under the module key. Null when the datastore has
   * no single-host deployment precedent (unused / SaaS-only): nothing is
   * rendered, but the layer guard still recognises the key.
   */
  service: ComposeServiceSpec | null;
  /**
   * backup.sh engine dispatched for this datastore, rendered as the compose
   * label `newbie.backup-engine` (ADR-008 D5); null when the nightly backup
   * does not cover the engine.
   */
  backupEngine: "mongodb" | "redis" | "clickhouse" | null;
  /** Profile-gated helper service rendered as `<key>-backup`. */
  backupHelper?: ComposeServiceSpec;
}

export const DATASTORE_REGISTRY: Readonly<Record<string, DatastoreDefinition>> = {
  mongo: {
    service: {
      image: "mongo:8",
      restart: "unless-stopped",
      // Cap the WiredTiger cache: the 50%-of-RAM default assumes a dedicated
      // host and would fight the other datastores on a shared box (ADR-015).
      command: ["mongod", "--wiredTigerCacheSizeGB", "2"],
      envFile: true,
      volumes: ["./data/mongo:/data/db"],
      healthcheck: {
        test: ["CMD", "mongosh", "--quiet", "--eval", "db.adminCommand('ping').ok"],
        interval: "15s",
        timeout: "5s",
        retries: 5,
      },
    },
    backupEngine: "mongodb",
  },

  redis: {
    service: {
      image: "redis:8-alpine",
      restart: "unless-stopped",
      // requirepass comes from the host-interpolated .env (compose reads .env
      // from its project directory); no env_file by design.
      command: ["redis-server", "--requirepass", "${REDIS_PASSWORD}", "--appendonly", "yes"],
      volumes: ["./data/redis:/data"],
      healthcheck: {
        test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"],
        interval: "10s",
        timeout: "5s",
        retries: 5,
      },
    },
    backupEngine: "redis",
  },

  clickhouse: {
    service: {
      image: "clickhouse/clickhouse-server:26.8-alpine",
      restart: "unless-stopped",
      environment: {
        CLICKHOUSE_DB: "${CLICKHOUSE_DB}",
        CLICKHOUSE_USER: "${CLICKHOUSE_USER}",
        CLICKHOUSE_PASSWORD: "${CLICKHOUSE_PASSWORD}",
        CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT: "1",
      },
      ulimits: { nofile: { soft: "262144", hard: "262144" } },
      volumes: [
        "./data/clickhouse:/var/lib/clickhouse",
        // Cap server memory: the ~90%-of-RAM default assumes a dedicated host (ADR-015).
        "./clickhouse/config.d/memory.xml:/etc/clickhouse-server/config.d/memory.xml:ro",
      ],
      healthcheck: {
        test: ["CMD", "wget", "--spider", "-q", "http://127.0.0.1:8123/ping"],
        interval: "15s",
        timeout: "5s",
        retries: 5,
      },
    },
    backupEngine: "clickhouse",
    backupHelper: {
      // Never started with the normal stack ("backup" profile); invoked by
      // backup.sh and uploads to S3 using the EC2 instance role.
      image: "altinity/clickhouse-backup:2.8.1",
      profiles: ["backup"],
      envFile: true,
      environment: {
        CLICKHOUSE_HOST: "clickhouse",
        // clickhouse-backup speaks the native protocol, not HTTP.
        CLICKHOUSE_PORT: "9000",
        CLICKHOUSE_USERNAME: "${CLICKHOUSE_USER}",
        CLICKHOUSE_PASSWORD: "${CLICKHOUSE_PASSWORD}",
        REMOTE_STORAGE: "s3",
        S3_BUCKET: "${BACKUP_BUCKET}",
        S3_PATH: "clickhouse",
        S3_REGION: "${AWS_REGION}",
        S3_ACL: "private",
        LOG_LEVEL: "info",
      },
      volumes: ["./data/clickhouse:/var/lib/clickhouse"],
      dependsOn: { clickhouse: { condition: "service_healthy" } },
    },
  },

  // No single-host deployment precedent yet (unused / SaaS-only): the layer
  // guard recognises the key but no service or backup wiring is rendered.
  elasticsearch: { service: null, backupEngine: null },
  snowflake: { service: null, backupEngine: null },
};

export function isRegisteredDatastore(key: string): boolean {
  return key in DATASTORE_REGISTRY;
}
