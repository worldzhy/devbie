import crypto from "node:crypto";

/**
 * Content hashing for the module lockfile (ADR-057 D4).
 *
 * Line endings are normalized before hashing: a Windows checkout (CRLF) and a
 * POSIX checkout (LF) of the same module are the same bytes as far as drift is
 * concerned, otherwise every host would report a phantom modification.
 */
export function normalizeEol(content: string): string {
  return content.replace(/\r\n/g, "\n");
}

/** `sha256-<hex>` of the EOL-normalized content. */
export function hashContent(content: string): string {
  const digest = crypto.createHash("sha256").update(normalizeEol(content), "utf8").digest("hex");
  return `sha256-${digest}`;
}

/** True when two contents are equal after EOL normalization. */
export function sameContent(a: string, b: string): boolean {
  return normalizeEol(a) === normalizeEol(b);
}
