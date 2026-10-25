/**
 * Accept a module selector given as positional arguments. Values may be
 * space and/or comma separated (`a b` / `a,b`); the result is deduplicated.
 * Undefined means "no selector given" (the command applies its default).
 */
export function parseModuleSelector(input: readonly string[] | undefined): string[] | undefined {
  if (!input || input.length === 0) return undefined;
  const keys = input
    .flatMap((chunk) => chunk.split(","))
    .map((key) => key.trim())
    .filter((key) => key.length > 0);
  return [...new Set(keys)];
}
