/**
 * Minimal Server-Sent Events transport over fetch.
 *
 * `postSse` covers endpoints that EventSource cannot serve (POST bodies,
 * custom headers): it POSTs a JSON body, then decodes the response stream.
 * `consumeSseStream` is the lower-level decoder for callers that already
 * hold a fetch Response.
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

/** HTTP-level failure of a POST-initiated SSE request (non-2xx or no body). */
export class SseStreamError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "SseStreamError";
  }
}

const NEVER_ABORTED = new AbortController().signal;

export interface PostSseOptions {
  /** JSON-encoded request body; omit to POST without a body. */
  body?: unknown;
  /** Extra request headers (e.g. Authorization). Content-Type and Accept are set automatically. */
  headers?: Record<string, string>;
  /** Aborting stops reading immediately; already received frames are retained by the caller. */
  signal?: AbortSignal;
  /** Called for every decoded frame, in arrival order. */
  onFrame: (frame: SseFrame) => void;
}

/**
 * POST-initiated SSE request: the standard workaround for EventSource's
 * inability to send POST bodies or custom headers. Resolves after the server
 * closes the stream; rejects with SseStreamError on HTTP-level failures.
 * Stream errors during reading propagate from the underlying reader.
 */
export async function postSse(url: string, options: PostSseOptions): Promise<void> {
  const { body, headers, signal = NEVER_ABORTED, onFrame } = options;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    throw new SseStreamError(
      response.status,
      `SSE request failed with ${response.status}${detail ? `: ${detail}` : ""}`,
    );
  }

  await consumeSseStream(response.body, signal, onFrame);
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
