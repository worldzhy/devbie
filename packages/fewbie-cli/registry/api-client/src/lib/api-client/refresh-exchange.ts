// ---------------------------------------------------------------------------
// Refresh exchange: the one place that turns the httpOnly refresh cookie into
// a usable access token (ADR-040, ADR-049, ADR-050 decisions 4–9).
//
// Transport-agnostic on purpose: it uses axios for the exchange only, never
// the configured `api` instance, so the raw-fetch transports can depend on it
// without pulling in the client's interceptors.
// ---------------------------------------------------------------------------

import axios from "axios";

import {
  API_TIMEOUT_MS,
  ApiEnvelope,
  BASE_URL,
  BOOTSTRAP_RETRY_DELAY_MS,
  EXPIRY_MARGIN_MS,
  GATED_RETRY_DELAYS_MS,
  REFRESH_FAILURE_COOLDOWN_MS,
  REFRESH_PATH,
  REFRESH_RETRY_DELAY_MS,
} from "./protocol";
import { classifyFailure, type SessionEndReason } from "./failure";
import {
  endSession,
  getAccessToken,
  getAccessTokenExpiresAt,
  getSessionEpoch,
  onSessionCleared,
  setSession,
} from "./session-store";

function isUnauthorized(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 401;
}

/** One refresh round-trip; persists the renewed token and its expiry. */
async function requestRefreshOnce(signal?: AbortSignal): Promise<string | null> {
  // Captured before the exchange: a response that lands after the user ended
  // the session must not write the token back and re-arm the latch (ADR-055).
  const epoch = getSessionEpoch();
  // POST, not GET: the exchange rotates the refresh cookie, so it is not a
  // read. The backend exposes it only as POST (strict RESTful paths), and a
  // GET here 404s — which reads as a transient failure, then the token-less
  // follow-up request 401s and the tab is bounced to login on every reload.
  const response = await axios.post(`${BASE_URL}${REFRESH_PATH}`, null, {
    withCredentials: true,
    timeout: API_TIMEOUT_MS,
    signal,
  });
  const body = response.data as ApiEnvelope<{
    token?: string;
    tokenExpiresInSeconds?: number;
  }>;
  const token = body?.data?.token ?? "";
  if (!token) return null;
  if (getSessionEpoch() !== epoch) return null;
  setSession(token, body.data?.tokenExpiresInSeconds);
  return token;
}

/**
 * Outcome of one refresh attempt: the renewed token plus whether the session
 * is definitively over.
 */
export interface RefreshOutcome {
  token: string | null;
  /**
   * True only when the server rejected the refresh exchange (401/400), the
   * account is blocked (coded 403), or a 2xx response carried no token — i.e.
   * the refresh credential can never succeed. Network errors and 5xx are
   * transient: the session must be kept and the caller surfaces the original
   * failure instead of forcing a logout (R22-05).
   */
  sessionOver: boolean;
  /** Why the session ended; undefined while it is still alive (ADR-048). */
  kind?: SessionEndReason;
}

/**
 * Send the refresh request, optionally retrying once on 401.
 *
 * The retry exists for the cross-tab rotation race: another tab may have just
 * rotated the refresh cookie, and its Set-Cookie lands here a moment later. A
 * cold-start probe passes `retryUnauthorized: false` — no other tab could have
 * rotated on behalf of a first load, so a 401 there means "not signed in" and
 * must resolve in one round trip instead of sleeping through the retry delay.
 */
async function requestRefreshWithRetry(retryUnauthorized = true, signal?: AbortSignal): Promise<RefreshOutcome> {
  const classify = (error: unknown): RefreshOutcome => {
    if (!axios.isAxiosError(error)) return { token: null, sessionOver: false };
    const status = error.response?.status ?? 0;
    const body = error.response?.data as ApiEnvelope | undefined;
    const kind = classifyFailure(status, body?.code);
    // A disabled or closed account is a definitive end, but a distinct one:
    // the login page shows the account notice instead of a plain form.
    if (kind === "account-blocked") return { token: null, sessionOver: true, kind };
    // Any 401 from the refresh exchange, and a 400 on its input, means the
    // refresh credential can never succeed — a retry cannot fix it.
    if (status === 401 || status === 400) return { token: null, sessionOver: true, kind: "session-terminated" };
    // Offline, timeout, 5xx: transient, the session survives (R22-05).
    return { token: null, sessionOver: false };
  };
  try {
    const token = await requestRefreshOnce(signal);
    return { token, sessionOver: token === null };
  } catch (firstError) {
    if (retryUnauthorized && isUnauthorized(firstError) && !signal?.aborted) {
      // Possible cross-tab rotation race: retry once with the renewed cookie.
      await new Promise((resolve) => setTimeout(resolve, REFRESH_RETRY_DELAY_MS));
      if (signal?.aborted) return classify(firstError);
      try {
        const token = await requestRefreshOnce(signal);
        return { token, sessionOver: token === null };
      } catch (secondError) {
        return classify(secondError);
      }
    }
    // Network or other non-auth failure: nothing a retry can fix.
    return classify(firstError);
  }
}

// Shared in-flight refresh. The backend rotates the refresh cookie on every
// call, so concurrent 401s must await the same request instead of issuing
// parallel refreshes that invalidate each other's cookie. Cross-tab
// concurrency is absorbed by the server (CAS rotation + idempotency window)
// and by the single 401 retry, not by a browser-side lock (ADR-049).
let refreshPromise: Promise<RefreshOutcome> | null = null;

/**
 * Exchange the httpOnly refresh cookie for a new access token.
 *
 * Concurrent callers in this tab share one round-trip: the backend rotates the
 * refresh cookie on every call, so parallel refreshes would invalidate each
 * other. A simultaneous refresh from another tab is harmless — the server's
 * CAS rotation returns the same renewed token inside its idempotency window
 * (ADR-049, ADR-040 validation record), so no cross-tab lock is needed.
 * Pass retryUnauthorized=false for a cold-start probe: a first load has no
 * competing rotation, so a 401 there is terminal and retrying only delays the
 * redirect.
 *
 * Exported so non-axios transports (raw fetch for SSE streams) can also
 * participate in the 401 silent-refresh chain. The outcome distinguishes a
 * dead refresh credential (`sessionOver`) from a transient failure, so
 * callers only end the session on the former (R22-05).
 */
export function refreshAccessToken(retryUnauthorized = true): Promise<RefreshOutcome> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async (): Promise<RefreshOutcome> => {
    try {
      // The await matters: without it the finally below runs at construction
      // time and refreshPromise would keep the settled outcome forever.
      return await requestRefreshWithRetry(retryUnauthorized);
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Result of establishing the in-memory session on a cold start (ADR-040).
 *
 * The states matter because "the backend said no" and "the backend could not
 * be reached" lead to opposite UI decisions: the first is a real logout, the
 * second must keep the user on the page (R22-05). `blocked` is the third
 * outcome of a real logout: the account itself is disabled or closed, so the
 * login page must show that notice instead of a plain form (ADR-048 §4).
 */
export type SessionBootstrapOutcome =
  | { status: "authenticated"; token: string }
  | { status: "anonymous" }
  | { status: "blocked" }
  | { status: "unavailable" };

/** Signed out vs. account blocked: both end the session, differently (§4). */
function sessionEndedOutcome(outcome: RefreshOutcome): SessionBootstrapOutcome {
  return outcome.kind === "account-blocked" ? { status: "blocked" } : { status: "anonymous" };
}

/**
 * Establish the in-memory session on a cold start or a new tab (ADR-040).
 *
 * The access token is no longer persisted, so "am I signed in?" can only be
 * answered by exchanging the httpOnly refresh cookie. It shares the
 * single-flight promise with any 401 refresh already in flight, so a cold
 * start rotates the refresh cookie exactly once.
 *
 * A rejected exchange (401/400 or a 2xx without a token) means anonymous. A
 * transient failure is retried once — that absorbs the "network just came
 * back" window — and only then reported as unavailable, so a flaky connection
 * never masquerades as a signed-out user.
 */
export async function bootstrapSession(): Promise<SessionBootstrapOutcome> {
  if (typeof window === "undefined") return { status: "unavailable" };
  const existing = getAccessToken();
  if (existing) return { status: "authenticated", token: existing };

  // A cold start cannot be a cross-tab rotation race: no other tab could have
  // rotated the cookie on behalf of this first load, so a 401 here means
  // anonymous. Skipping the 401 retry resolves the probe in one round trip.
  const outcome = await refreshAccessToken(false);
  if (outcome.token) return { status: "authenticated", token: outcome.token };
  if (outcome.sessionOver) return sessionEndedOutcome(outcome);

  await new Promise((resolve) => setTimeout(resolve, BOOTSTRAP_RETRY_DELAY_MS));
  const retried = await refreshAccessToken(false);
  if (retried.token) return { status: "authenticated", token: retried.token };
  return retried.sessionOver ? sessionEndedOutcome(retried) : { status: "unavailable" };
}

/**
 * When the last transient gate refresh failed (0 = never). Only the gate reads
 * it; the passive 401 path must still refresh even inside the cooldown.
 */
let lastRefreshFailureAt = 0;

/**
 * The detached retry chain after a transient gate failure (devbie ADR-055).
 *
 * It exists because the server may have rotated the cookie before the response
 * was lost: the browser then holds the previous generation, and without a retry
 * it stays one behind until the idle interval exceeds the server's idempotency
 * window — at which point the next refresh looks like theft and the session is
 * revoked. The chain repairs the cookie only; it never hands the current
 * request a token, and it never joins `refreshPromise`: the passive 401 path
 * must stay free to refresh immediately while this chain sleeps.
 */
let gatedRetryChain: AbortController | null = null;

/** Stop the chain when the session ends: a late success must not revive it. */
onSessionCleared(() => {
  gatedRetryChain?.abort();
  gatedRetryChain = null;
});

function scheduleGatedRetries(): void {
  if (gatedRetryChain) return;
  const controller = new AbortController();
  gatedRetryChain = controller;
  void runGatedRetryChain(controller);
}

async function runGatedRetryChain(controller: AbortController): Promise<void> {
  try {
    for (const delay of GATED_RETRY_DELAYS_MS) {
      await sleep(delay, controller.signal);
      if (controller.signal.aborted) return;

      const outcome = await requestRefreshWithRetry(true, controller.signal);
      if (controller.signal.aborted) return;
      if (outcome.token) {
        // The cookie is current again; the gate resumes its normal cadence.
        lastRefreshFailureAt = 0;
        return;
      }
      if (outcome.sessionOver) {
        endSession(outcome.kind ?? "session-terminated");
        return;
      }
    }
  } finally {
    if (gatedRetryChain === controller) gatedRetryChain = null;
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/**
 * The request gate: hand back a token that is fresh enough to leave with.
 *
 * This is the only way a business request obtains a token (ADR-050 decision 4);
 * `/auth/*` calls are exempt because the login flow itself must not recurse
 * into a refresh (decision 8). The three outcomes that are not a renewed token
 * all fall through to the request as-is (decision 7):
 *
 *   - no session at all → the cold-start exchange runs, the request leaves
 *     unauthenticated if that says anonymous;
 *   - unknown expiry (`expiresAt === 0`) → no proactive refresh, the server's
 *     verdict via a passive 401 is safer than a guess (decision 6);
 *   - transient refresh failure → the old token goes out and the passive 401
 *     path takes over; the cooldown keeps an offline tab from paying the
 *     refresh timeout once per request (decision 5).
 */
export async function ensureFreshToken(): Promise<string> {
  if (typeof window === "undefined") return "";

  const existing = getAccessToken();
  if (!existing) {
    await bootstrapSession();
    return getAccessToken();
  }

  const expiresAt = getAccessTokenExpiresAt();
  if (expiresAt === 0) return existing;
  if (Date.now() < expiresAt - EXPIRY_MARGIN_MS) return existing;
  if (Date.now() - lastRefreshFailureAt < REFRESH_FAILURE_COOLDOWN_MS) return existing;

  const outcome = await refreshAccessToken();
  if (outcome.token) return outcome.token;
  if (outcome.sessionOver) {
    // The session is over; the request still leaves and its 401 is silent
    // (ADR-050 decision 7).
    endSession(outcome.kind ?? "session-terminated");
  } else {
    lastRefreshFailureAt = Date.now();
    // The request leaves now with the old token; the chain repairs the cookie
    // in the background so the next rotation is not mistaken for theft.
    scheduleGatedRetries();
  }
  return getAccessToken();
}

/**
 * Non-axios transports (raw fetch for SSE streams) must take their token from
 * here, never from `getAccessToken()`: only this call guarantees the token is
 * still fresh enough to use (ADR-050 decision 9).
 */
export function getFreshAccessToken(): Promise<string> {
  return ensureFreshToken();
}
