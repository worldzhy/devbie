import type { NamedHealthIndicator } from "../types";

/**
 * Health indicator for ClickHouseService.
 *
 * Duck-types the service for a `query` method and runs `SELECT 1` to verify
 * the ClickHouse HTTP connection is alive.
 */
export function createClickHouseIndicator(service: unknown): NamedHealthIndicator {
  return {
    name: "clickhouse",
    check: async () => {
      const query = (service as Record<string, unknown>)?.query;
      if (typeof query !== "function") {
        return { status: "down", message: "query method not available" };
      }
      try {
        await (query as (opts: { query: string }) => Promise<unknown>).call(service, {
          query: "SELECT 1",
        });
        return { status: "up" };
      } catch (err) {
        return { status: "down", message: (err as Error)?.message ?? String(err) };
      }
    },
  };
}
