/**
 * How to use:
 *   logger.warn(getErrorMessage(error));
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
