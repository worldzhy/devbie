import { HttpException, HttpStatus } from "@nestjs/common";

export class NewbieException extends HttpException {
  constructor(type: NewbieExceptionType) {
    const exception = NewbieExceptionMap.get(type);
    if (exception) {
      super({ code: exception.code, error: exception.error }, exception.httpStatus);
    } else {
      // Unregistered type: never leave the exception without a super() call,
      // which would corrupt the instance (getResponse()/getStatus() throw).
      super({ code: 500, error: { message: "Unknown newbie exception type" } }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}

// Auth failure error codes (see ADR-048 §3). The numeric `code` is the only
// wire contract; the member names follow `PascalCase_Snake` with the prefix
// naming the subject (Credential / Login / ResetPassword / Account / Session /
// Request). Declared in ascending code order — new members are inserted at
// their code position instead of appended.
export enum NewbieExceptionType {
  // 1xxx: authentication and session domain
  Credential_Invalid,
  Credential_NotSet,
  Login_UserRateLimited,
  Login_IpRateLimited,
  ResetPassword_InvalidInput,
  ResetPassword_InvalidCode,
  Account_Closed,
  Account_Disabled,
  Account_Missing,
  Session_RefreshRejected,
  Session_AccessExpired,
  Session_Revoked,
  Session_Missing,
  // 2xxx: generic request throttling
  Request_RateLimited,
}

// Each entry carries an explicit HTTP status (see ADR-001): recoverable
// credential-submission failures are 400 (RFC 6749 invalid_grant), account
// state failures and ended sessions differ — account states are 403 while
// session states are 401 — and rate/attempt limits are 429. Only
// `Session_AccessExpired` may be refreshed by the client; every other 401
// terminates the session. The business code keeps the product-level semantics
// inside the response envelope; the `message` is display copy only and must
// never be parsed.
const NewbieExceptionMap = new Map<NewbieExceptionType, { code: number; httpStatus: number; error: object }>([
  [
    NewbieExceptionType.Credential_Invalid,
    {
      code: 1001,
      httpStatus: HttpStatus.BAD_REQUEST,
      error: { message: "Invalid combination of account and password" },
    },
  ],
  [
    NewbieExceptionType.Credential_NotSet,
    {
      code: 1002,
      httpStatus: HttpStatus.BAD_REQUEST,
      error: {
        message: "The password has not been set. Please login via verification code",
      },
    },
  ],
  [
    NewbieExceptionType.Login_UserRateLimited,
    {
      code: 1003,
      httpStatus: HttpStatus.TOO_MANY_REQUESTS,
      error: {
        message: "Suspicious login prevented",
        description:
          "We blocked an attempt to access your account because we weren't sure it was really you. This happens when we notice unusual login activity, like an attempt to log in too many times, or from a different location or device. You'll need to wait before trying to log in again. Some blocks are removed automatically.",
      },
    },
  ],
  [
    NewbieExceptionType.Login_IpRateLimited,
    {
      code: 1004,
      httpStatus: HttpStatus.TOO_MANY_REQUESTS,
      error: {
        message: "High frequency login prevented",
        description:
          "We blocked an attempt to access your account because we weren't sure it was you. This happens when we notice unusual login activity, like an attempt to log in too many times, or from a different location or device. You'll need to wait before trying to log in again. Some blocks are removed automatically.",
      },
    },
  ],
  [
    NewbieExceptionType.ResetPassword_InvalidInput,
    {
      code: 1005,
      httpStatus: HttpStatus.BAD_REQUEST,
      error: { message: "Invalid email or phone" },
    },
  ],
  [
    NewbieExceptionType.ResetPassword_InvalidCode,
    {
      code: 1006,
      httpStatus: HttpStatus.BAD_REQUEST,
      error: { message: "Invalid verification code" },
    },
  ],
  [
    NewbieExceptionType.Account_Closed,
    {
      code: 1007,
      httpStatus: HttpStatus.FORBIDDEN,
      error: {
        message: "You have closed your account, do you want to recover it?",
      },
    },
  ],
  [
    NewbieExceptionType.Account_Disabled,
    {
      code: 1008,
      httpStatus: HttpStatus.FORBIDDEN,
      error: {
        message: "Your account has been disabled by an administrator",
      },
    },
  ],
  [
    NewbieExceptionType.Account_Missing,
    {
      code: 1101,
      httpStatus: HttpStatus.UNAUTHORIZED,
      error: {
        message: "The account associated with this session no longer exists",
      },
    },
  ],
  [
    NewbieExceptionType.Session_RefreshRejected,
    {
      code: 1102,
      httpStatus: HttpStatus.UNAUTHORIZED,
      error: {
        message: "Your session is no longer valid. Please sign in again",
      },
    },
  ],
  [
    NewbieExceptionType.Session_AccessExpired,
    {
      code: 1103,
      httpStatus: HttpStatus.UNAUTHORIZED,
      error: {
        message: "Access token expired",
      },
    },
  ],
  [
    NewbieExceptionType.Session_Revoked,
    {
      code: 1104,
      httpStatus: HttpStatus.UNAUTHORIZED,
      error: {
        message: "Your session has been signed out",
      },
    },
  ],
  [
    NewbieExceptionType.Session_Missing,
    {
      code: 1105,
      httpStatus: HttpStatus.UNAUTHORIZED,
      error: {
        message: "Authentication is required",
      },
    },
  ],
  [
    NewbieExceptionType.Request_RateLimited,
    {
      code: 2001,
      httpStatus: HttpStatus.TOO_MANY_REQUESTS,
      error: {
        message: "High frequency http requests prevented",
        description:
          "We blocked an attempt to request your endpoints because we weren't sure it was you. This happens when we notice unusual login activity, like an attempt to log in too many times, or from a different location or device. You'll need to wait before trying to log in again later. Some blocks are removed automatically.",
      },
    },
  ],
]);

/**
 * The wire code carried by the given exception type. This is the only value
 * that crosses the wire (see ADR-048 §2.1); callers must compare against it
 * rather than the enum ordinal, which is merely an artifact of declaration
 * order.
 */
export function newbieExceptionCode(type: NewbieExceptionType): number {
  const exception = NewbieExceptionMap.get(type);
  if (!exception) {
    throw new Error(`Unknown newbie exception type: ${type}`);
  }
  return exception.code;
}
