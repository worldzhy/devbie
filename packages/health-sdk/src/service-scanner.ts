import type { NestAppLike } from "./types";

/**
 * Scan the NestJS DI container for providers whose registration name matches
 * any of the given constructor names.
 *
 * Foundation services (PrismaService, ClickHouseService, ...) are registered
 * with their class as the DI token. We cannot import these classes from an
 * npm package — they live in the host's assembled source tree — so instead
 * we iterate the internal container's provider map and match by the
 * InstanceWrapper's `name` getter (which returns token.name for class
 * tokens).
 *
 * This is a single-pass scan: we walk the container once and collect every
 * match, so adding more known indicators does not increase the number of
 * container traversals.
 *
 * Returns an array of { name, instance } pairs for matching services.
 */
export function scanKnownServices(
  app: NestAppLike,
  names: readonly string[],
): Array<{ name: string; instance: unknown }> {
  const wanted = new Set(names);
  const found: Array<{ name: string; instance: unknown }> = [];

  const container = (app as Record<string, unknown>).container;
  if (!container || typeof container !== "object") return found;

  const modules = (container as Record<string, unknown>).modules;
  if (!(modules instanceof Map)) return found;

  for (const [, moduleRef] of modules) {
    const providers = (moduleRef as Record<string, unknown>)?.providers;
    if (!(providers instanceof Map)) continue;

    for (const [, wrapper] of providers) {
      const wrapperName = (wrapper as Record<string, unknown>)?.name;
      if (typeof wrapperName !== "string" || !wanted.has(wrapperName)) continue;

      const instance = (wrapper as Record<string, unknown>)?.instance;
      if (instance != null) {
        found.push({ name: wrapperName, instance });
        wanted.delete(wrapperName); // First match wins; skip duplicates
      }
    }
  }

  return found;
}
