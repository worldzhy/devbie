import type { NamedHealthIndicator } from "../types";

/**
 * Health indicator for PrismaService.
 *
 * Duck-types the service for `$queryRaw` (present on any PrismaClient) and
 * runs a lightweight `SELECT 1` to verify the database connection is alive.
 */
export function createPrismaIndicator(service: unknown): NamedHealthIndicator {
  return {
    name: "prisma",
    check: async () => {
      // Call $queryRaw as a member expression: Prisma reads
      // `this._createPrismaPromise` inside it, so a detached reference throws
      // "Cannot read properties of undefined (reading '_createPrismaPromise')"
      // for a plain PrismaClient. The newbie PrismaService Proxy binds methods
      // on property access, which is why only non-Proxy clients used to fail.
      const client = service as { $queryRaw: (strings: TemplateStringsArray) => Promise<unknown> } | undefined;
      if (!client || typeof client.$queryRaw !== "function") {
        return { status: "down", message: "$queryRaw not available" };
      }
      try {
        await client.$queryRaw`SELECT 1`;
        return { status: "up" };
      } catch (err) {
        return { status: "down", message: (err as Error)?.message ?? String(err) };
      }
    },
  };
}
