import { closeSync, openSync, readdirSync, readSync, statSync } from "node:fs";
import { join } from "node:path";

/** First complete line of a file (reading at most 64 KiB); null when empty or unreadable. */
export function readFirstLine(filePath: string): string | null {
  try {
    const fd = openSync(filePath, "r");
    try {
      const buffer = Buffer.alloc(64 * 1024);
      const bytesRead = readSync(fd, buffer, 0, buffer.length, 0);
      const text = buffer.subarray(0, bytesRead).toString("utf8");
      const newline = text.indexOf("\n");
      const line = newline === -1 ? text : text.slice(0, newline);
      return line.trim() ? line : null;
    } finally {
      closeSync(fd);
    }
  } catch {
    return null;
  }
}

/** Complete lines appended after `offset`; a partial trailing line is left for the next run. */
export function readCompleteLines(
  filePath: string,
  offset: number,
): { lines: string[]; nextOffset: number; reset: boolean } {
  const size = statSync(filePath).size;
  // A file smaller than the recorded offset was truncated or rotated underneath
  // us — the old position is meaningless, so restart from the beginning.
  const reset = size < offset;
  const start = reset ? 0 : offset;
  if (size <= start) return { lines: [], nextOffset: start, reset };

  const fd = openSync(filePath, "r");
  let bytes: Buffer;
  try {
    bytes = readFrom(fd, start, size - start);
  } finally {
    closeSync(fd);
  }
  const lastNewline = bytes.lastIndexOf(0x0a);
  if (lastNewline === -1) return { lines: [], nextOffset: start, reset };
  const text = bytes.subarray(0, lastNewline + 1).toString("utf8");
  return { lines: text.split("\n").filter((line) => line.trim()), nextOffset: start + lastNewline + 1, reset };
}

/** Reads up to `length` bytes starting at `position`; a file can short-read. */
function readFrom(fd: number, position: number, length: number): Buffer {
  const buffer = Buffer.alloc(length);
  let total = 0;
  while (total < length) {
    const read = readSync(fd, buffer, total, length - total, position + total);
    if (read === 0) break;
    total += read;
  }
  return buffer.subarray(0, total);
}

/** Recursively yields `.jsonl` files under `root`; unreadable entries are skipped. */
export function* walkJsonl(root: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return;
  }
  for (const entry of entries) {
    const absolute = join(root, entry);
    try {
      const stats = statSync(absolute);
      if (stats.isDirectory()) {
        yield* walkJsonl(absolute);
      } else if (stats.isFile() && absolute.endsWith(".jsonl")) {
        yield absolute;
      }
    } catch {
      continue;
    }
  }
}
