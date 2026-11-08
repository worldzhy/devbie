import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getErrorStatus } from "../src/utilities/error-status.util";

describe("getErrorStatus", () => {
  it("reads the numeric status off an HTTP client error", () => {
    assert.equal(getErrorStatus({ status: 404 }), 404);
    assert.equal(getErrorStatus({ status: 422 }), 422);
  });

  it("returns undefined when the value carries no numeric status", () => {
    assert.equal(getErrorStatus(new Error("boom")), undefined);
    assert.equal(getErrorStatus({ status: "404" }), undefined);
    assert.equal(getErrorStatus(null), undefined);
    assert.equal(getErrorStatus(undefined), undefined);
  });
});
