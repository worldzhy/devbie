/**
 * How to use:
 *   const text = base64ToUtf8(data.content);
 *
 * Decode a base64 payload as UTF-8 text (e.g. the file bodies returned by
 * the GitHub contents API, which encodes them this way).
 */
export function base64ToUtf8(base64: string): string {
  return Buffer.from(base64, "base64").toString("utf-8");
}
