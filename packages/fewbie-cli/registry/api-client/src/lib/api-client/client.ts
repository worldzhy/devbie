// ---------------------------------------------------------------------------
// The axios transport: instance, interceptors and the typed convenience API.
//
// This is the only file that knows axios beyond the refresh exchange. The
// request gate (`ensureFreshToken`), the session end (`endSession`) and the
// failure channel all live elsewhere, so this file only wires them together.
// ---------------------------------------------------------------------------

import axios, { type AxiosRequestConfig, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";

import { API_TIMEOUT_MS, AUTH_PATH_PATTERN, ApiEnvelope, BASE_URL, isEnvelope, isTrustedApiTarget } from "./protocol";
import { ApiError, isRefreshable } from "./failure";
import { endSession, getAccessToken } from "./session-store";
import { notifyError } from "./error-channel";
import { ensureFreshToken, refreshAccessToken } from "./refresh-exchange";

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

export const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  timeout: API_TIMEOUT_MS,
});

api.interceptors.request.use(async (config) => {
  const trusted = isTrustedApiTarget(config.url, config.baseURL ?? BASE_URL);
  // ADR-050 decision 8: every business request takes its token from the single
  // gate, which establishes the cold-start session and renews a token that is
  // about to expire. /auth/* stays exempt because those calls are the login
  // flow itself (and the refresh exchange bypasses this instance).
  const isAuthPath = AUTH_PATH_PATTERN.test(config.url ?? "");
  const token = trusted && !isAuthPath ? await ensureFreshToken() : getAccessToken();
  // Within the interceptor chain headers is always an AxiosHeaders instance.
  if (token && trusted) {
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

    // Single normalization for every final failure: the kind decides both the
    // refresh policy and what the UI shows (ADR-048 §4).
    const normalized = toApiError(error);

    if (isUnauthorized(error) && original && canSilentlyRefresh) {
      if (isRefreshable(normalized.kind)) {
        original._retriedAfterRefresh = true;
        const outcome = await refreshAccessToken();
        if (outcome.token) {
          original.headers.set("Authorization", `Bearer ${outcome.token}`);
          // Replay goes through the same interceptor chain; its outcome is
          // returned directly so this failure never reaches the handler.
          return api(original);
        }
        if (outcome.sessionOver) {
          // The server rejected the refresh credential: the session is over.
          endSession(outcome.kind ?? "session-terminated");
          // This request failed because the session was already gone; the user
          // is being bounced to the login page, so its message is noise
          // (R21-01). Suppress it through the public per-request opt-out rather
          // than a private marker — one suppression concept, not two (R22-01).
          original.enabledDefaultErrorToast = false;
        }
        // Transient refresh failure (offline/5xx): keep the session and let the
        // original 401 surface normally (R22-05).
      } else {
        // A terminal 401, or a code this build does not recognize: fail closed
        // instead of refreshing into another 401 (ADR-048 INV-4).
        endSession("session-terminated");
        original.enabledDefaultErrorToast = false;
      }
    } else if (normalized.kind === "account-blocked") {
      // A disabled/closed account on any request (including the refresh
      // exchange): same end state, but the login page must show the notice.
      endSession("account-blocked");
      if (original) original.enabledDefaultErrorToast = false;
    } else if (normalized.kind === "session-terminated" && !AUTH_PATH_PATTERN.test(url)) {
      // A terminal 401 from a non-axios-flagged path (e.g. the request already
      // replayed once): the session cannot be revived.
      endSession("session-terminated");
      if (original) original.enabledDefaultErrorToast = false;
    }

    // Callers that render their own error UX pass enabledDefaultErrorToast:
    // false to suppress the default toast and avoid double notification.
    if (error?.config?.enabledDefaultErrorToast !== false) {
      notifyError(normalized);
    }
    throw normalized;
  },
);

function isUnauthorized(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 401;
}

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
