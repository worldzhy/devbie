// ---------------------------------------------------------------------------
// Public surface of the api-client module.
//
// Internal modules import each other by relative path. Importing this barrel
// from inside would create a cycle, which under ESM is a runtime `undefined`
// rather than a compile error (ADR-050 decision 14).
// ---------------------------------------------------------------------------

export { AUTH_FAILURE_CODES, CODE_TO_KIND, ApiError, classifyFailure } from "./failure";
export type { AuthFailureCode, SessionEndReason, SessionFailureKind } from "./failure";

export { isTrustedApiTarget } from "./protocol";
export type { ApiEnvelope } from "./protocol";

export {
  clearSession,
  endSession,
  getAccessToken,
  getAccessTokenExpiresAt,
  onSessionExpired,
  setSession,
} from "./session-store";

export { onError } from "./error-channel";

export { bootstrapSession, getFreshAccessToken, refreshAccessToken } from "./refresh-exchange";
export type { RefreshOutcome, SessionBootstrapOutcome } from "./refresh-exchange";

export { replayOnUnauthorized } from "./replay";

export { api, apiClient } from "./client";
