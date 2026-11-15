// ---------------------------------------------------------------------------
// Auth failure classification (devbie ADR-048 §3–§4)
//
// A leaf module: the code table, the kind union, the mapping and the
// normalized error. No transport, no state.
// ---------------------------------------------------------------------------

/**
 * Wire codes of the auth failure contract (devbie ADR-048 §3). They are
 * duplicated as numeric literals because this module runs in the browser and
 * cannot import the NestJS-side enum. The numbers are the wire contract and
 * never change; the member names here are local and may be renamed freely.
 */
export const AUTH_FAILURE_CODES = {
  Credential_Invalid: 1001,
  Credential_NotSet: 1002,
  Login_UserRateLimited: 1003,
  Login_IpRateLimited: 1004,
  ResetPassword_InvalidInput: 1005,
  ResetPassword_InvalidCode: 1006,
  Account_Closed: 1007,
  Account_Disabled: 1008,
  Account_Missing: 1101,
  Session_RefreshRejected: 1102,
  Session_AccessExpired: 1103,
  Session_Revoked: 1104,
  Session_Missing: 1105,
  Request_RateLimited: 2001,
} as const;

export type AuthFailureCode = (typeof AUTH_FAILURE_CODES)[keyof typeof AUTH_FAILURE_CODES];

/**
 * What a failed request means for the page and the session (ADR-048 §4).
 * Only `network` may block the whole page; every other kind is a
 * request-level error or an explicit redirect.
 */
export type SessionFailureKind =
  | "network"
  | "account-blocked"
  | "session-terminated"
  | "access-expired"
  | "request-error"
  | "server-error"
  | "permission-denied"
  | "unknown";

/**
 * Explicit many-to-one code → kind map (ADR-048 §4). It cannot be derived
 * from the code list: four codes share `session-terminated` and seven share
 * `request-error` by design. `Record<AuthFailureCode, …>` makes the map
 * exhaustive — adding a code without a kind fails the build.
 */
export const CODE_TO_KIND: Record<AuthFailureCode, SessionFailureKind> = {
  [AUTH_FAILURE_CODES.Credential_Invalid]: "request-error",
  [AUTH_FAILURE_CODES.Credential_NotSet]: "request-error",
  [AUTH_FAILURE_CODES.Login_UserRateLimited]: "request-error",
  [AUTH_FAILURE_CODES.Login_IpRateLimited]: "request-error",
  [AUTH_FAILURE_CODES.ResetPassword_InvalidInput]: "request-error",
  [AUTH_FAILURE_CODES.ResetPassword_InvalidCode]: "request-error",
  [AUTH_FAILURE_CODES.Account_Closed]: "account-blocked",
  [AUTH_FAILURE_CODES.Account_Disabled]: "account-blocked",
  [AUTH_FAILURE_CODES.Account_Missing]: "session-terminated",
  [AUTH_FAILURE_CODES.Session_RefreshRejected]: "session-terminated",
  [AUTH_FAILURE_CODES.Session_AccessExpired]: "access-expired",
  [AUTH_FAILURE_CODES.Session_Revoked]: "session-terminated",
  [AUTH_FAILURE_CODES.Session_Missing]: "session-terminated",
  [AUTH_FAILURE_CODES.Request_RateLimited]: "request-error",
};

const AUTH_FAILURE_CODE_SET = new Set<number>(Object.values(AUTH_FAILURE_CODES));

function isAuthFailureCode(code: number | undefined): code is AuthFailureCode {
  return typeof code === "number" && AUTH_FAILURE_CODE_SET.has(code);
}

/**
 * Classify a failed request in the order fixed by ADR-048 §4 — the order is
 * part of the contract and the first match wins:
 *
 * 1. no HTTP response      → `network`
 * 2. a contract code       → its mapped kind
 * 3. 5xx                   → `server-error`
 * 4. uncoded 403           → `permission-denied`
 * 5. uncoded 401           → `session-terminated` (fail closed: it cannot be
 *                            refreshed, and calling it `unknown` would revive
 *                            the refresh → 401 loop this contract removes)
 * 6. any other uncoded 4xx → `unknown`
 */
export function classifyFailure(status: number, code?: number): SessionFailureKind {
  if (status === 0) return "network";
  if (isAuthFailureCode(code)) return CODE_TO_KIND[code];
  if (status >= 500) return "server-error";
  if (status === 403) return "permission-denied";
  if (status === 401) return "session-terminated";
  return "unknown";
}

/** Whether a silent refresh may be attempted for this 401 (ADR-048 §3). */
export function isRefreshable(kind: SessionFailureKind): boolean {
  return kind === "access-expired";
}

/**
 * Why the session ended: a dead session goes to the plain login page, while a
 * disabled/closed account must land on the login page's notice banner
 * (ADR-048 §4).
 */
export type SessionEndReason = "session-terminated" | "account-blocked";

/** Normalized error so callers never depend on the axios error shape. */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: number;
  /** Page/session consequence of this failure (ADR-048 §4). */
  readonly kind: SessionFailureKind;
  readonly data: unknown;

  constructor(message: string, status: number, data?: unknown, code?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.kind = classifyFailure(status, code);
    this.data = data;
  }
}
