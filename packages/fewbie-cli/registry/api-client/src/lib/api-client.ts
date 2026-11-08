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

/** localStorage key of the short-lived access token. */
const ACCESS_TOKEN_KEY = "access-token";

/** localStorage key of the access-token expiry epoch in milliseconds. */
const ACCESS_TOKEN_EXPIRES_AT_KEY = "access-token-expires-at";

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

/** Cross-tab Web Lock that serializes refresh calls (see ADR-001). */
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

export function getAccessToken(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(ACCESS_TOKEN_KEY) ?? "";
}

/** Persist token + expiry after login or refresh. */
export function setSession(token: string, expiresInSeconds?: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACCESS_TOKEN_KEY, token);
  // A fresh session re-arms the session-expired notification (R22-06).
  sessionExpiredNotified = false;
  if (typeof expiresInSeconds === "number" && expiresInSeconds > 0) {
    window.localStorage.setItem(ACCESS_TOKEN_EXPIRES_AT_KEY, String(Date.now() + expiresInSeconds * 1000));
  }
}

/** Remove all locally stored session data. */
export function clearSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(ACCESS_TOKEN_EXPIRES_AT_KEY);
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
 * Hook invoked exactly once per failed request, after any 401 refresh/replay
 * attempt has been exhausted. Wire it to your toast layer; the client itself
 * never imports a UI library.
 */
let errorHandler: ((error: ApiError) => void) | null = null;
export function onError(handler: (error: ApiError) => void): void {
  errorHandler = handler;
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
  const expiresAt = Number(window.localStorage.getItem(ACCESS_TOKEN_EXPIRES_AT_KEY) ?? 0);
  if (!expiresAt) return true;
  return Date.now() >= expiresAt - PROACTIVE_REFRESH_LEAD_MS;
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
    const expiresAt = Number(window.localStorage.getItem(ACCESS_TOKEN_EXPIRES_AT_KEY) ?? 0);
    // A session without a stored expiry (legacy login or a provider that
    // omitted expiresIn) still needs renewal: refresh now and persist the
    // expiry the backend returns, instead of never scheduling a refresh.
    if (!expiresAt || Date.now() >= expiresAt - PROACTIVE_REFRESH_LEAD_MS) {
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
 * Whether the request resolves to our own origin (the configured baseURL, or
 * the page origin when baseURL is empty). The bearer token must never be
 * attached to an absolute URL pointing at a third party (R23-02).
 */
function isOwnOriginRequest(config: InternalAxiosRequestConfig): boolean {
  const base = config.baseURL ?? BASE_URL;
  const fallbackOrigin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
  try {
    const resolved = new URL(config.url ?? "", base || fallbackOrigin);
    const baseOrigin = new URL(base || fallbackOrigin, fallbackOrigin).origin;
    return resolved.origin === baseOrigin;
  } catch {
    return false;
  }
}

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  // Within the interceptor chain headers is always an AxiosHeaders instance.
  if (token && isOwnOriginRequest(config)) {
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
      errorHandler?.(normalized);
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
