import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decodeBase64Utf8, octokitStatus } from "../src/utilities/octokit.util";

describe("octokitStatus", () => {
  it("reads the numeric status off an Octokit error", () => {
    assert.equal(octokitStatus({ status: 404 }), 404);
    assert.equal(octokitStatus({ status: 422 }), 422);
  });

  it("returns undefined when the value carries no numeric status", () => {
    assert.equal(octokitStatus(new Error("boom")), undefined);
    assert.equal(octokitStatus({ status: "404" }), undefined);
    assert.equal(octokitStatus(null), undefined);
    assert.equal(octokitStatus(undefined), undefined);
  });
});

describe("decodeBase64Utf8", () => {
  it("decodes base64 to UTF-8 text", () => {
    assert.equal(decodeBase64Utf8(Buffer.from("hello world").toString("base64")), "hello world");
    assert.equal(decodeBase64Utf8(Buffer.from("版本 1.13.2").toString("base64")), "版本 1.13.2");
  });
});
