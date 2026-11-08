/**
 * How to use:
 *   const status = octokitStatus(error);
 *   const text = decodeBase64Utf8(data.content);
 */

/**
 * Read the HTTP status off an Octokit request error. Octokit surfaces the
 * response status as a numeric `status` field; anything else has none.
 */
export function octokitStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return undefined;
  }
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

/**
 * Decode the base64 payload returned by the GitHub contents API as UTF-8 text.
 * The API encodes file bodies this way and callers always want the text form.
 */
export function decodeBase64Utf8(base64: string): string {
  return Buffer.from(base64, "base64").toString("utf-8");
}
