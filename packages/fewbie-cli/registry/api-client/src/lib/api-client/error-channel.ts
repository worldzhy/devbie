// ---------------------------------------------------------------------------
// The single failure channel: every failed request reaches `onError` exactly
// once, and failures raised before a subscriber exists are not lost.
// ---------------------------------------------------------------------------

import type { ApiError } from "./failure";

/**
 * Hooks invoked exactly once per failed request, after any 401 refresh/replay
 * attempt has been exhausted. Wire them to your toast layer; the client itself
 * never imports a UI library.
 *
 * Subscribers are a Set rather than a single slot: a second mount (Strict Mode,
 * or a nested host) must not silently replace the first listener (R27-01).
 */
const errorHandlers = new Set<(error: ApiError) => void>();

/**
 * Failures raised before any subscriber is registered (a request fired during
 * module init, ahead of the toast component's effect). They are replayed to the
 * first subscriber so such failures are not lost; bounded so a permanently
 * subscriber-less client cannot grow without limit.
 */
const pendingErrors: ApiError[] = [];
const MAX_PENDING_ERRORS = 5;

/**
 * Register an error listener and return the unsubscribe function. Registering
 * flushes any failure buffered before the first listener existed.
 */
export function onError(handler: (error: ApiError) => void): () => void {
  errorHandlers.add(handler);
  if (pendingErrors.length > 0) {
    for (const error of pendingErrors.splice(0)) handler(error);
  }
  return () => {
    errorHandlers.delete(handler);
  };
}

/** Fan a failed request out to every subscriber, or buffer it until one exists. */
export function notifyError(error: ApiError): void {
  if (errorHandlers.size === 0) {
    if (pendingErrors.length >= MAX_PENDING_ERRORS) pendingErrors.shift();
    pendingErrors.push(error);
    return;
  }
  for (const handler of errorHandlers) handler(error);
}
