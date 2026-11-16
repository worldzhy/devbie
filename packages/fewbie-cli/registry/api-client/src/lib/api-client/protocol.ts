// ---------------------------------------------------------------------------
// Wire protocol: constants and shapes shared by every transport.
//
// This module is a leaf: no state, no imports. Keeping it separate is what
// lets the refresh exchange and the raw-fetch replay helper stay free of the
// axios client (ADR-050 decision 13).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Project-specific configuration — edit these for your backend contract.
// ---------------------------------------------------------------------------

/** Base URL of the API; same-origin by default. */
export const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "";

/** Endpoint that exchanges the httpOnly refresh cookie for a new access token. */
export const REFRESH_PATH = "/auth/refresh-session";

/** Paths that must never trigger a silent refresh (would recurse). */
export const AUTH_PATH_PATTERN = /^\/auth\//;

/**
 * Hard ceiling for every API request, including the refresh exchange. Without
 * it a hung request (or a refresh that never settles) keeps `refreshPromise`
 * locked forever and every later 401 waits on it (R5-P2-13).
 */
export const API_TIMEOUT_MS = 15_000;

/**
 * How early before expiry a business request renews the token. It is the
 * safety margin of the request gate (`ensureFreshToken`), not a scheduler
 * lead: ADR-050 removed the proactive timer.
 */
export const EXPIRY_MARGIN_MS = 60_000;

/**
 * Cooldown after a transient gate refresh failure (ADR-050 decision 5). While
 * the backend is unreachable, a request must not await one doomed refresh
 * each; the cooldown restores the cadence of the deleted 30s timer without
 * blocking the request itself.
 */
export const REFRESH_FAILURE_COOLDOWN_MS = 30_000;

/**
 * Pause before retrying a failed refresh. When another tab rotates the
 * refresh cookie, the Set-Cookie reaches this tab a moment later; the retry
 * then carries the renewed cookie.
 */
export const REFRESH_RETRY_DELAY_MS = 1_500;

/**
 * Pause before the single cold-start retry. A tab that just regained network
 * (wifi rejoin, VPN up, laptop wake) normally succeeds on the second try, and
 * a longer wait would only delay the connection-error screen.
 */
export const BOOTSTRAP_RETRY_DELAY_MS = 400;

// ---------------------------------------------------------------------------
// Response envelope (newbie backend contract)
// ---------------------------------------------------------------------------

/**
 * Standard JSON envelope: success is `{ code: 0, error: null, data }` and
 * failure is a non-2xx status with `{ code, error: { message }, data: null }`.
 */
export interface ApiEnvelope<T = unknown> {
  data?: T;
  code?: number;
  error?: { message?: string; description?: string } | null;
}

/** Whether a response body is a newbie envelope rather than a raw payload. */
export function isEnvelope(body: unknown): body is ApiEnvelope {
  if (body === null || typeof body !== "object") return false;
  if (Array.isArray(body)) return false;
  const record = body as Record<string, unknown>;
  // Every envelope carries both markers; a domain object that happens to
  // have a `data` field alone is not unwrapped.
  return "code" in record && "data" in record;
}

// ---------------------------------------------------------------------------
// Trusted origin guard (the bearer token never leaves our own origin)
// ---------------------------------------------------------------------------

/**
 * Absolute URL: either scheme-qualified (`https://host/...`) or protocol-relative
 * (`//host/...`), both of which resolve away from the page origin.
 */
const ABSOLUTE_URL_PATTERN = /^(?:[a-z][a-z\d+\-.]*:|\/\/)/i;

function pageOrigin(): string {
  return typeof window !== "undefined" ? window.location.origin : "http://localhost";
}

/**
 * Whether a request target resolves to the one origin we may send the bearer
 * token to: the origin of `NEXT_PUBLIC_BASE_URL` when it is absolute, or the
 * page origin when it is relative/empty (the reverse-proxied deployment).
 *
 * Two leaks this closes:
 *   - an absolute per-request URL pointing at a third party (R23-02);
 *   - a caller-supplied base URL pointing off-site, which the previous check
 *     accepted because it compared the target against that same base — so the
 *     raw-fetch SSE transports bypassing axios had no working guard at all
 *     (R24-04).
 *
 * A relative base such as `/api` must count as our own origin: `new URL(url,
 * "/api")` throws, and the old guard swallowed the throw and silently dropped
 * the token on every request.
 *
 * Exported so non-axios transports apply the same judgement instead of a
 * second copy.
 */
export function isTrustedApiTarget(url: string | undefined, baseUrl: string | undefined = BASE_URL): boolean {
  const origin = pageOrigin();
  const configured = BASE_URL;
  const base = baseUrl ?? configured;
  const target = ABSOLUTE_URL_PATTERN.test(url ?? "") ? (url ?? "") : `${base}${url ?? ""}`;
  try {
    const trustedOrigin = ABSOLUTE_URL_PATTERN.test(configured) ? new URL(configured).origin : origin;
    return new URL(target, origin).origin === trustedOrigin;
  } catch {
    return false;
  }
}
