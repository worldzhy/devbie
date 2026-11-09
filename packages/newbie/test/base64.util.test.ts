import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { base64ToUtf8 } from "../src/utilities/base64.util";

describe("base64ToUtf8", () => {
  it("decodes base64 to UTF-8 text", () => {
    assert.equal(base64ToUtf8(Buffer.from("hello world").toString("base64")), "hello world");
    assert.equal(base64ToUtf8(Buffer.from("版本 1.15.0").toString("base64")), "版本 1.15.0");
  });
});
