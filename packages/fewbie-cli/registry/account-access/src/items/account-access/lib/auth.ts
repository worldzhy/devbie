"use client";

import { apiClient, clearSession, getAccessToken, onSessionExpired, setSession } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Project-specific configuration — edit these for your backend contract.
// ---------------------------------------------------------------------------

/** Login endpoint; accepts the credentials object and returns a session. */
const LOGIN_PATH = "/auth/login";

/** Logout endpoint (called best-effort; local session is cleared regardless). */
const LOGOUT_PATH = "/auth/logout";

/** Where to redirect when the session expires or login is required. */
const DEFAULT_LOGIN_PATH = "/login";

/** Login response envelope (adjust fields to match your backend). */
interface LoginResult {
  token: string;
  tokenExpiresInSeconds?: number;
}

export interface LoginCredentials {
  account: string;
  password: string;
}

let initialized = false;

/**
 * Wire auth behaviour to the router. Call once on the client, e.g. in the
 * authenticated layout's useEffect. No refresh timer is installed: the
 * api-client request gate renews an expiring token on demand (devbie ADR-050).
 */
export function initAuth(options?: { loginPath?: string }): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  const loginPath = options?.loginPath ?? DEFAULT_LOGIN_PATH;

  // Avoid bouncing on the login page itself.
  onSessionExpired(() => {
    if (window.location.pathname !== loginPath) {
      const redirect = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.replace(`${loginPath}?redirect=${redirect}`);
    }
  });
}

/** Log in, persist the session, and return the raw result for callers. */
export async function login(credentials: LoginCredentials): Promise<LoginResult> {
  const result = await apiClient.post<LoginResult>(LOGIN_PATH, credentials);
  setSession(result.token, result.tokenExpiresInSeconds);
  return result;
}

/** Log out; always clears the local session even if the API call fails. */
export async function logout(): Promise<void> {
  try {
    await apiClient.post(LOGOUT_PATH);
  } finally {
    clearSession();
  }
}

export function isAuthenticated(): boolean {
  return Boolean(getAccessToken());
}
