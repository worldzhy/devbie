// ---------------------------------------------------------------------------
// 401 handling for non-axios transports (raw fetch for SSE streams).
//
// The axios interceptor cannot see these responses, so this helper replays the
// same judgement — only an expired access token refreshes, then replay once —
// without importing the axios client.
// ---------------------------------------------------------------------------

import { type ApiEnvelope } from "./protocol";
import { classifyFailure, isRefreshable, type SessionFailureKind } from "./failure";
import { endSession } from "./session-store";
import { refreshAccessToken } from "./refresh-exchange";

/** Read the failure kind from a raw fetch response without consuming it. */
async function failureKindOfResponse(response: Response): Promise<SessionFailureKind> {
  try {
    const body = (await response.clone().json()) as ApiEnvelope;
    return classifyFailure(response.status, body?.code);
  } catch {
    // Non-JSON body (empty 401, gateway page): classify on the status alone,
    // which keeps an unrecognized 401 failing closed.
    return classifyFailure(response.status);
  }
}

/**
 * Shared 401 handling for non-axios transports (raw fetch for SSE streams):
 * refresh only an expired access token, then replay once with the renewed
 * token. The session ends when the refresh credential is dead or the 401 is
 * not refreshable; a transient refresh failure keeps the session and hands the
 * original 401 back to the caller (R22-05, R23-06, ADR-048 §4).
 */
export async function replayOnUnauthorized(
  response: Response,
  replay: (token: string) => Promise<Response>,
): Promise<Response> {
  if (response.status !== 401) return response;
  // Only an expired access token may be refreshed (ADR-048 §3); every other
  // 401 — including a code this build does not know — ends the session.
  if (!isRefreshable(await failureKindOfResponse(response))) {
    endSession("session-terminated");
    return response;
  }
  const outcome = await refreshAccessToken();
  if (outcome.token) return replay(outcome.token);
  if (outcome.sessionOver) {
    // Dead refresh credential: same session-end path as the axios interceptor.
    endSession(outcome.kind ?? "session-terminated");
  }
  return response;
}
