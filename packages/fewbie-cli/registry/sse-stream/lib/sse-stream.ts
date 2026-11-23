/**
 * Minimal Server-Sent Events frame decoder.
 *
 * `consumeSseStream` decodes a fetch Response.body stream into frames. The
 * request stays in the host: EventSource cannot send POST bodies or custom
 * headers, and only the host knows its own auth, origin guard and retry
 * policy, so this module deliberately owns no transport.
 *
 * The wire format handled is standard SSE:
 *
 *   event: <name>\n
 *   data: <json>\n
 *   \n
 *
 * with `: keepalive` comment lines during quiet periods. This layer is
 * transport-text only; JSON decoding of the data line is the caller's job.
 */

export interface SseFrame {
  event: string;
  data: string;
}

/**
 * Consume a fetch Response.body stream until the server closes it.
 *
 * Partial multibyte sequences and frames split across chunks are buffered, so
 * callers may invoke this directly on response.body without any framing
 * assumptions. Aborting `signal` stops reading immediately; the already
 * received frames are retained by the caller.
 */
export async function consumeSseStream(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  onFrame: (frame: SseFrame) => void,
): Promise<void> {
  const reader = body.getReader();
  // A decoder per call: `{ stream: true }` keeps an incomplete multibyte
  // sequence inside this instance, so a shared one would let concurrent
  // streams steal each other's bytes (R84-02).
  const decoder = new TextDecoder();
  let buffer = "";

  const onAbort = (): void => {
    reader.cancel("aborted").catch(() => {});
  };
  if (signal.aborted) {
    onAbort();
  } else {
    signal.addEventListener("abort", onAbort, { once: true });
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let separatorIndex: number;
      // SSE dispatches on a blank line; tolerate CRLF.
      while ((separatorIndex = findFrameBoundary(buffer)) !== -1) {
        const rawFrame = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex).replace(/^(\r?\n){2}/, "");
        const frame = parseFrame(rawFrame);
        if (frame) onFrame(frame);
      }
    }

    // Flush any complete sequence still buffered in the decoder.
    buffer += decoder.decode();

    const tail = buffer.trim();
    if (tail) {
      const frame = parseFrame(tail);
      if (frame) onFrame(frame);
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    try {
      reader.releaseLock();
    } catch {
      // A lock held by a racing cancel() releases on its own.
    }
  }
}

/** Normalize the two possible blank-line styles (\n\n and \r\n\r\n). */
function findFrameBoundary(buffer: string): number {
  const lf = buffer.indexOf("\n\n");
  const crlf = buffer.indexOf("\r\n\r\n");
  if (lf === -1) return crlf;
  if (crlf === -1) return lf;
  return Math.min(lf, crlf);
}

function parseFrame(rawFrame: string): SseFrame | null {
  let event = "message";
  const dataLines: string[] = [];

  for (const rawLine of rawFrame.split(/\r?\n/)) {
    const line = rawLine.replace(/\r$/, "");
    if (!line || line.startsWith(":")) continue; // comments / keepalive
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join("\n") };
}
