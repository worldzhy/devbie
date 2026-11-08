/**
 * How to use:
 *   const status = getErrorStatus(error);
 *
 * Read the HTTP status off a request error thrown by HTTP client libraries
 * (Octokit, axios, and friends surface the response status as a numeric
 * `status` field); anything else has none.
 */
export function getErrorStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return undefined;
  }
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}
