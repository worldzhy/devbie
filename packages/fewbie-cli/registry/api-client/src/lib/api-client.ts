import axios, { type AxiosRequestConfig, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";

/**
 * Per-request opt-out for the framework's default error toast.
 *
 * By default every failed request surfaces the backend error via the
 * `onError` hook (currently wired to `toast.error` in request.ts). Set
 * `enabledDefaultErrorToast: false` when the caller renders its own richer
 * error UX (a confirm dialog, an inline form error, ...) so the same
 * failure is not surfaced twice. Defaults to true for backward safety.
 */
declare module "axios" {
  interface AxiosRequestConfig {
    enabledDefaultErrorToast?: boolean;
  }
}

// ---------------------------------------------------------------------------
// Project-specific configuration — edit these for your backend contract.
// ---------------------------------------------------------------------------

/** Base URL of the API; same-origin by default. */
const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

/**
 * Legacy localStorage keys retired by ADR-040 (access token moved to memory).
 * Still referenced so startup can scrub values left behind by older sessions.
 */
const LEGACY_ACCESS_TOKEN_KEY = "access-token";
const LEGACY_ACCESS_TOKEN_EXPIRES_AT_KEY = "access-token-expires-at";

/** Endpoint that exchanges the httpOnly refresh cookie for a new access token. */
const REFRESH_PATH = "/auth/refresh-access-token";

/** Paths that must never trigger a silent refresh (would recurse). */
const AUTH_PATH_PATTERN = /^\/auth\//;

/**
 * Hard ceiling for every API request, including the refresh exchange. Without
 * it a hung request (or a refresh that never settles) keeps `refreshPromise`
 * locked forever and every later 401 waits on it (R5-P2-13).
 */
const API_TIMEOUT_MS = 15_000;

/** Cross-tab Web Lock that serializes refresh calls (see fewbie ADR-001). */
const REFRESH_LOCK_NAME = "refresh-token";

/** Refresh this early so business requests never carry an expired token. */
const PROACTIVE_REFRESH_LEAD_MS = 60_000;

/** How often the proactive scheduler checks expiry. */
const PROACTIVE_REFRESH_CHECK_INTERVAL_MS = 30_000;

/**
 * Pause before retrying a failed refresh. When another tab rotates the
 * refresh cookie, the Set-Cookie reaches this tab a moment later; the retry
 * then carries the renewed cookie.
 */
const REFRESH_RETRY_DELAY_MS = 1_500;

/**
 * Pause before the single cold-start retry. A tab that just regained network
 * (wifi rejoin, VPN up, laptop wake) normally succeeds on the second try, and
 * a longer wait would only delay the connection-error screen.
 */
const BOOTSTRAP_RETRY_DELAY_MS = 400;

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
function isEnvelope(body: unknown): body is ApiEnvelope {
  if (body === null || typeof body !== "object") return false;
  if (Array.isArray(body)) return false;
  const record = body as Record<string, unknown>;
  // Every envelope carries both markers; a domain object that happens to
  // have a `data` field alone is not unwrapped.
  return "code" in record && "data" in record;
}

// ---------------------------------------------------------------------------
// Token storage
// ---------------------------------------------------------------------------

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

export function getAccessToken(): string {
  if (typeof window === "undefined") return "";
  return accessToken;
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

// Fires at most once per session: after the first notification the user is on
// their way to the login page, so repeat calls (concurrent 401s, or the SSE
// and axios paths racing) must not stack redirects (R22-06). setSession()
// re-arms it.
let sessionExpiredNotified = false;

/**
 * Fire the session-expired handler directly. Used by non-axios transports
 * (raw fetch for SSE streams) that can't go through the response interceptor
 * but still need the same "refresh cookie gone → bounce to login" path.
 */
export function triggerSessionExpired(): void {
  if (sessionExpiredNotified) return;
  sessionExpiredNotified = true;
  sessionExpiredHandler?.();
}

/** Normalized error so callers never depend on the axios error shape. */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: number;
  readonly data: unknown;

  constructor(message: string, status: number, data?: unknown, code?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

/**
 * Hook invoked when the refresh cookie is missing/expired. Wire it to your
 * router (e.g. redirect to the login page); the client itself stays
 * router-agnostic.
 */
let sessionExpiredHandler: (() => void) | null = null;
export function onSessionExpired(handler: () => void): void {
  sessionExpiredHandler = handler;
}

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
function notifyError(error: ApiError): void {
  if (errorHandlers.size === 0) {
    if (pendingErrors.length >= MAX_PENDING_ERRORS) pendingErrors.shift();
    pendingErrors.push(error);
    return;
  }
  for (const handler of errorHandlers) handler(error);
}

// ---------------------------------------------------------------------------
// Refresh-token rotation
// ---------------------------------------------------------------------------

function isUnauthorized(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 401;
}

/**
 * Whether the access token is still due for a refresh. After acquiring the
 * cross-tab lock, another tab may have already refreshed while we waited;
 * this check lets us skip the network call and reuse the new token.
 */
function isRefreshStillDue(): boolean {
  if (!accessTokenExpiresAt) return true;
  return Date.now() >= accessTokenExpiresAt - PROACTIVE_REFRESH_LEAD_MS;
}

/** One refresh round-trip; persists the renewed token and its expiry. */
async function requestRefreshOnce(): Promise<string | null> {
  const response = await axios.get(`${BASE_URL}${REFRESH_PATH}`, {
    withCredentials: true,
    timeout: API_TIMEOUT_MS,
  });
  const body = response.data as ApiEnvelope<{
    token?: string;
    tokenExpiresInSeconds?: number;
  }>;
  const token = body?.data?.token ?? "";
  if (!token) return null;
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
   * True only when the server rejected the refresh exchange (401/400) or a 2xx
   * response carried no token — i.e. the refresh credential is dead. Network
   * errors and 5xx are transient: the session must be kept and the caller
   * surfaces the original failure instead of forcing a logout (R22-05).
   */
  sessionOver: boolean;
}

/** Send the refresh request with one retry on 401 (cross-tab cookie race). */
async function requestRefreshWithRetry(): Promise<RefreshOutcome> {
  const classify = (error: unknown): RefreshOutcome =>
    // Only an auth rejection proves the cookie is dead; anything else
    // (offline, timeout, 5xx) is transient and must not end the session.
    axios.isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 400)
      ? { token: null, sessionOver: true }
      : { token: null, sessionOver: false };
  try {
    const token = await requestRefreshOnce();
    return { token, sessionOver: token === null };
  } catch (firstError) {
    if (isUnauthorized(firstError)) {
      // Possible cross-tab rotation race: retry once with the renewed cookie.
      await new Promise((resolve) => setTimeout(resolve, REFRESH_RETRY_DELAY_MS));
      try {
        const token = await requestRefreshOnce();
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
// parallel refreshes that invalidate each other's cookie.
let refreshPromise: Promise<RefreshOutcome> | null = null;
/** Whether the in-flight refresh was started with force=true (R20-12). */
let refreshPromiseForced = false;

/**
 * Exchange the httpOnly refresh cookie for a new access token.
 *
 * Two layers of dedup prevent concurrent refresh calls that would trigger
 * the backend's refresh-token-reuse detection and revoke the session:
 * 1. Single-tab: module-level refreshPromise — concurrent 401s in this tab
 *    reuse the same promise.
 * 2. Cross-tab: Web Locks (navigator.locks) serialize refreshes across tabs.
 * After acquiring the lock, re-check whether refresh is still needed.
 * Pass force=true from the 401 reactive path: a 401 proves the token is
 * invalid regardless of the stored expiry, so the lock-time re-check must
 * not short-circuit. A forced caller must not ride a non-forced in-flight
 * refresh either — that promise may resolve through the not-due shortcut
 * with a token the server already rejects — so it chains a forced refresh
 * after the in-flight one instead (R20-12). Environments without Web Locks
 * fall back to the single-flight + retry mitigation.
 *
 * Exported so non-axios transports (raw fetch for SSE streams) can also
 * participate in the 401 silent-refresh chain. The outcome distinguishes a
 * dead refresh credential (`sessionOver`) from a transient failure, so
 * callers only end the session on the former (R22-05).
 */
export function refreshAccessToken(force = false): Promise<RefreshOutcome> {
  if (refreshPromise) {
    if (!force || refreshPromiseForced) return refreshPromise;
    return refreshPromise.then((outcome) => (outcome.sessionOver ? outcome : refreshAccessToken(true)));
  }

  refreshPromiseForced = force;
  refreshPromise = (async (): Promise<RefreshOutcome> => {
    try {
      if (typeof navigator !== "undefined" && navigator.locks) {
        return await navigator.locks.request(REFRESH_LOCK_NAME, async () => {
          if (!force && !isRefreshStillDue()) return { token: getAccessToken(), sessionOver: false };
          return requestRefreshWithRetry();
        });
      }
      // The await matters: without it the finally below runs at construction
      // time and refreshPromise would keep the settled outcome forever, so
      // no-locks environments could never refresh again (R20-12).
      return await requestRefreshWithRetry();
    } finally {
      refreshPromise = null;
      refreshPromiseForced = false;
    }
  })();

  return refreshPromise;
}

/**
 * Result of establishing the in-memory session on a cold start (ADR-040).
 *
 * The three states matter because "the backend said no" and "the backend could
 * not be reached" lead to opposite UI decisions: the first is a real logout,
 * the second must keep the user on the page (R22-05).
 */
export type SessionBootstrapOutcome =
  { status: "authenticated"; token: string } | { status: "anonymous" } | { status: "unavailable" };

/**
 * Establish the in-memory session on a cold start or a new tab (ADR-040).
 *
 * The access token is no longer persisted, so "am I signed in?" can only be
 * answered by exchanging the httpOnly refresh cookie. A forced refresh is
 * used so the lock-time not-due shortcut cannot return an empty token, and it
 * shares the single-flight promise with any 401 refresh already in flight, so
 * a cold start rotates the refresh cookie exactly once.
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

  const outcome = await refreshAccessToken(true);
  if (outcome.token) return { status: "authenticated", token: outcome.token };
  if (outcome.sessionOver) return { status: "anonymous" };

  await new Promise((resolve) => setTimeout(resolve, BOOTSTRAP_RETRY_DELAY_MS));
  const retried = await refreshAccessToken(true);
  if (retried.token) return { status: "authenticated", token: retried.token };
  return retried.sessionOver ? { status: "anonymous" } : { status: "unavailable" };
}

/**
 * Shared 401 handling for non-axios transports (raw fetch for SSE streams):
 * force a silent refresh and replay once with the renewed token. The session
 * ends only when the refresh credential is dead; a transient refresh failure
 * keeps the session and hands the original 401 back to the caller (R22-05,
 * R23-06).
 */
export async function replayOnUnauthorized(
  response: Response,
  replay: (token: string) => Promise<Response>,
): Promise<Response> {
  if (response.status !== 401) return response;
  const outcome = await refreshAccessToken(true);
  if (outcome.token) return replay(outcome.token);
  if (outcome.sessionOver) {
    // Dead refresh credential: same session-end path as the axios interceptor.
    clearSession();
    triggerSessionExpired();
  }
  return response;
}

// ---------------------------------------------------------------------------
// Proactive refresh scheduler (module-level singleton)
// ---------------------------------------------------------------------------

let schedulerTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start the scheduler that renews the token shortly before expiry. Call once
 * on the client (e.g. in the authenticated layout). Reactive 401 refresh
 * stays as a fallback for laptop sleep / scheduler drift.
 */
export function initProactiveTokenRefresh(): void {
  if (typeof window === "undefined" || schedulerTimer) return;

  const refreshIfDue = (): void => {
    const token = getAccessToken();
    if (!token) return;
    // A session without a known expiry (a provider that omitted expiresIn)
    // still needs renewal: refresh now and persist the expiry the backend
    // returns, instead of never scheduling a refresh.
    if (!accessTokenExpiresAt || Date.now() >= accessTokenExpiresAt - PROACTIVE_REFRESH_LEAD_MS) {
      void refreshAccessToken().then((outcome) => {
        // A dead refresh cookie found proactively bounces to login now
        // instead of waiting for the next business request to 401 (R22-05).
        if (outcome.sessionOver) {
          clearSession();
          triggerSessionExpired();
        }
      });
    }
  };

  // Run immediately (tabs reopened after sleep) and then on an interval.
  refreshIfDue();
  schedulerTimer = setInterval(refreshIfDue, PROACTIVE_REFRESH_CHECK_INTERVAL_MS);
}

// ---------------------------------------------------------------------------
// Error normalization (the single failure channel)
// ---------------------------------------------------------------------------

/** Map any thrown value to the normalized ApiError shape. */
function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as ApiEnvelope | undefined;
    return new ApiError(
      body?.error?.message ?? error.message,
      error.response?.status ?? 0,
      body ?? error.response?.data,
      body?.code,
    );
  }
  if (error instanceof Error) return new ApiError(error.message, 0);
  return new ApiError("Request failed", 0);
}

// ---------------------------------------------------------------------------
// Axios instance
// ---------------------------------------------------------------------------

export const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  timeout: API_TIMEOUT_MS,
});

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

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  // Within the interceptor chain headers is always an AxiosHeaders instance.
  if (token && isTrustedApiTarget(config.url, config.baseURL ?? BASE_URL)) {
    config.headers.set("Authorization", `Bearer ${token}`);
  }
  return config;
});

/**
 * Request config fields owned by the response interceptor.
 *
 * `_retriedAfterRefresh` marks a request that already went through the silent
 * refresh + replay chain once, so a second 401 does not recurse.
 */
type RotatingRequestConfig = InternalAxiosRequestConfig & {
  _retriedAfterRefresh?: boolean;
};

// Success channel: only unwrap the envelope; failures never arrive here
// (they carry non-2xx status — see newbie ADR-001).
api.interceptors.response.use(
  (response) => {
    if (isEnvelope(response.data)) {
      return { ...response, data: response.data.data };
    }
    return response;
  },
  async (error) => {
    const original = error?.config as RotatingRequestConfig | undefined;
    const url: string = original?.url ?? "";
    const canSilentlyRefresh =
      typeof window !== "undefined" && !original?._retriedAfterRefresh && !AUTH_PATH_PATTERN.test(url);

    if (isUnauthorized(error) && original && canSilentlyRefresh) {
      original._retriedAfterRefresh = true;
      const outcome = await refreshAccessToken(true);
      if (outcome.token) {
        original.headers.set("Authorization", `Bearer ${outcome.token}`);
        // Replay goes through the same interceptor chain; its outcome is
        // returned directly so this failure never reaches the handler.
        return api(original);
      }
      if (outcome.sessionOver) {
        // The server rejected the refresh credential: the session is over.
        clearSession();
        triggerSessionExpired();
        // This request failed because the session was already gone; the user is
        // being bounced to the login page, so its message is noise (R21-01).
        // Suppress it through the public per-request opt-out rather than a
        // private marker — one suppression concept, not two (R22-01).
        original.enabledDefaultErrorToast = false;
      }
      // Transient refresh failure (offline/5xx): keep the session and let the
      // original 401 surface normally (R22-05).
    }

    // Single exit for every final failure: normalize once, notify once.
    // Callers that render their own error UX pass enabledDefaultErrorToast:
    // false to suppress the default toast and avoid double notification.
    const normalized = toApiError(error);
    if (error?.config?.enabledDefaultErrorToast !== false) {
      notifyError(normalized);
    }
    throw normalized;
  },
);

// ---------------------------------------------------------------------------
// Typed convenience methods — resolve to the unwrapped response body.
// ---------------------------------------------------------------------------

export const apiClient = {
  get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return api.get<unknown, AxiosResponse<T>>(url, config).then((r) => r.data);
  },
  post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return api.post<unknown, AxiosResponse<T>>(url, data, config).then((r) => r.data);
  },
  put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return api.put<unknown, AxiosResponse<T>>(url, data, config).then((r) => r.data);
  },
  patch<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return api.patch<unknown, AxiosResponse<T>>(url, data, config).then((r) => r.data);
  },
  delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return api.delete<unknown, AxiosResponse<T>>(url, config).then((r) => r.data);
  },
  // HEAD/OPTIONS responses carry no body; resolve to the full AxiosResponse
  // so callers can still inspect status and headers.
  head<T>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return api.head<unknown, AxiosResponse<T>>(url, config);
  },
  options<T>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return api.options<unknown, AxiosResponse<T>>(url, config);
  },
};
