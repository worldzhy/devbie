import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { NewbieException, NewbieExceptionType, newbieExceptionCode } from "../src/exceptions/newbie.exception";

// Locked by ADR-048 §3. Rows are in ascending code order, which is also the
// required declaration order of the enum. Changing a code or its HTTP status
// here is a wire-contract change and needs an ADR revision first.
const CASES: Array<{ type: NewbieExceptionType; code: number; httpStatus: number }> = [
  { type: NewbieExceptionType.Credential_Invalid, code: 1001, httpStatus: 400 },
  { type: NewbieExceptionType.Credential_NotSet, code: 1002, httpStatus: 400 },
  { type: NewbieExceptionType.Login_UserRateLimited, code: 1003, httpStatus: 429 },
  { type: NewbieExceptionType.Login_IpRateLimited, code: 1004, httpStatus: 429 },
  { type: NewbieExceptionType.ResetPassword_InvalidInput, code: 1005, httpStatus: 400 },
  { type: NewbieExceptionType.ResetPassword_InvalidCode, code: 1006, httpStatus: 400 },
  { type: NewbieExceptionType.Account_Closed, code: 1007, httpStatus: 403 },
  { type: NewbieExceptionType.Account_Disabled, code: 1008, httpStatus: 403 },
  { type: NewbieExceptionType.Account_Missing, code: 1101, httpStatus: 401 },
  { type: NewbieExceptionType.Session_RefreshRejected, code: 1102, httpStatus: 401 },
  { type: NewbieExceptionType.Session_AccessExpired, code: 1103, httpStatus: 401 },
  { type: NewbieExceptionType.Session_Revoked, code: 1104, httpStatus: 401 },
  { type: NewbieExceptionType.Session_Missing, code: 1105, httpStatus: 401 },
  { type: NewbieExceptionType.Request_RateLimited, code: 2001, httpStatus: 429 },
];

const enumValues = Object.values(NewbieExceptionType).filter((value): value is NewbieExceptionType => {
  return typeof value === "number";
});

describe("NewbieException", () => {
  for (const { type, code, httpStatus } of CASES) {
    it(`${NewbieExceptionType[type]} maps to code ${code} / HTTP ${httpStatus}`, () => {
      const exception = new NewbieException(type);

      assert.equal(exception.getStatus(), httpStatus);

      const response = exception.getResponse() as { code: number; error: { message: string } };
      assert.equal(response.code, code);
      assert.equal(typeof response.error.message, "string");
      assert.ok(response.error.message.length > 0);
    });
  }

  it("registers every enum member exactly once", () => {
    assert.equal(CASES.length, enumValues.length);
    assert.deepEqual(new Set(CASES.map((entry) => entry.type)).size, enumValues.length);

    for (const { type, code } of CASES) {
      const response = new NewbieException(type).getResponse() as { code: number };
      assert.notEqual(response.code, 500, `${NewbieExceptionType[type]} is not registered in the exception map`);
      assert.equal(response.code, code);
    }
  });

  it("assigns a unique wire code to every member", () => {
    const codes = CASES.map((entry) => entry.code);
    assert.deepEqual(new Set(codes).size, codes.length);
  });

  it("exposes the wire code of every member", () => {
    for (const { type, code } of CASES) {
      assert.equal(newbieExceptionCode(type), code);
    }

    assert.throws(() => newbieExceptionCode(9999 as NewbieExceptionType), /Unknown newbie exception type/);
  });

  it("declares members in ascending code order", () => {
    const declared = enumValues.map((type) => {
      return new NewbieException(type).getResponse() as { code: number };
    });

    const codes = declared.map((response) => response.code);
    assert.deepEqual(
      codes,
      [...codes].sort((left, right) => left - right),
      "enum members must be declared in ascending code order",
    );
  });

  it("falls back to 500 for an unregistered type", () => {
    const exception = new NewbieException(9999 as NewbieExceptionType);

    assert.equal(exception.getStatus(), 500);
    assert.equal((exception.getResponse() as { code: number }).code, 500);
  });
});
