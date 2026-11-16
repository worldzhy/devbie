// ---------------------------------------------------------------------------
// Session state: the in-memory token, its expiry, and the single session-end
// path (ADR-040, ADR-048 §4, ADR-050 decisions 10–11).
// ---------------------------------------------------------------------------

import type { SessionEndReason } from "./failure";

/**
 * Legacy localStorage keys retired by ADR-040 (access token moved to memory).
 * Still referenced so startup can scrub values left behind by older sessions.
 */
const LEGACY_ACCESS_TOKEN_KEY = "access-token";
const LEGACY_ACCESS_TOKEN_EXPIRES_AT_KEY = "access-token-expires-at";

/**
 * ADR-040: the access token lives only in this module's memory, never in
 * localStorage. A same-origin script can still read it for the current page
 * lifetime, but nothing survives a reload or leaves the tab, so one injection
 * no longer equals a durable, off-site reusable session. A cold start (or a
 * new tab) re-establishes the session by exchanging the httpOnly refresh
 * cookie via `bootstrapSession`.
 */
let accessToken = "";
/** Expiry epoch of the in-memory token in milliseconds (0 when unknown). */
let accessTokenExpiresAt = 0;
let legacyKeysCleared = false;

/**
 * Fires at most once per session: after the first notification the user is on
 * their way to the login page, so repeat calls (concurrent 401s, or the SSE
 * and axios paths racing) must not stack redirects (R22-06). setSession()
 * re-arms it.
 */
let sessionExpiredNotified = false;

/**
 * Hook invoked when the refresh cookie is missing/expired or the account
 * cannot continue. Wire it to your router (e.g. redirect to the login page);
 * the client itself stays router-agnostic.
 */
let sessionExpiredHandler: ((reason: SessionEndReason) => void) | null = null;

/** Scrub the retired localStorage keys left behind by older sessions. */
function clearLegacyStorage(): void {
  if (typeof window === "undefined" || legacyKeysCleared) return;
  legacyKeysCleared = true;
  window.localStorage.removeItem(LEGACY_ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(LEGACY_ACCESS_TOKEN_EXPIRES_AT_KEY);
}

// Scrub on module init so a stale token does not linger in a browser that
// never reaches login or bootstrap in this page lifetime.
if (typeof window !== "undefined") clearLegacyStorage();

/**
 * Current in-memory token. It makes no freshness promise: business requests go
 * through `ensureFreshToken`, and non-axios transports go through
 * `getFreshAccessToken` (ADR-050 decision 9).
 */
export function getAccessToken(): string {
  if (typeof window === "undefined") return "";
  return accessToken;
}

/** Expiry epoch (ms) of the in-memory token; 0 when the backend gave none. */
export function getAccessTokenExpiresAt(): number {
  if (typeof window === "undefined") return 0;
  return accessTokenExpiresAt;
}

/** Persist token + expiry after login or refresh (memory only). */
export function setSession(token: string, expiresInSeconds?: number): void {
  if (typeof window === "undefined") return;
  clearLegacyStorage();
  accessToken = token;
  // A fresh session re-arms the session-expired notification (R22-06).
  sessionExpiredNotified = false;
  accessTokenExpiresAt =
    typeof expiresInSeconds === "number" && expiresInSeconds > 0 ? Date.now() + expiresInSeconds * 1000 : 0;
}

/** Remove all locally held session data. */
export function clearSession(): void {
  if (typeof window === "undefined") return;
  accessToken = "";
  accessTokenExpiresAt = 0;
  clearLegacyStorage();
}

/**
 * Fire the session-expired handler, at most once per session. Internal to this
 * module: every caller ends the session through `endSession`, so the latch and
 * the token cleanup cannot drift apart (ADR-050 decision 10).
 */
function triggerSessionExpired(reason: SessionEndReason): void {
  if (sessionExpiredNotified) return;
  sessionExpiredNotified = true;
  sessionExpiredHandler?.(reason);
}

export function onSessionExpired(handler: (reason: SessionEndReason) => void): void {
  sessionExpiredHandler = handler;
}

/**
 * The single session-end path: drop the token and notify the router once.
 *
 * A dead session goes to the plain login page, while a disabled/closed account
 * must land on the login page's notice banner (ADR-048 §4) — hence the reason.
 */
export function endSession(reason: SessionEndReason): void {
  clearSession();
  triggerSessionExpired(reason);
}
