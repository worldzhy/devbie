import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { REDACTED, redact } from "../src/redact";

describe("worklog redaction", () => {
  it("removes cloud and platform credentials wholesale", () => {
    const input = [
      "aws AKIAIOSFODNN7EXAMPLE done",
      "github ghp_0123456789abcdefghijABCDEF",
      "openai sk-0123456789abcdefghijABCDEF",
      "google AIzaSyD4iE2xVSpk7LOpoyqTG1k1VY8O0p8tHvQ",
      "jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
    ].join("\n");

    const output = redact(input);

    assert.equal(
      output,
      `aws ${REDACTED} done\ngithub ${REDACTED}\nopenai ${REDACTED}\ngoogle ${REDACTED}\njwt ${REDACTED}`,
    );
    assert.doesNotMatch(output, /AKIA/);
    assert.doesNotMatch(output, /ghp_/);
    assert.doesNotMatch(output, /sk-0123/);
    assert.doesNotMatch(output, /AIza/);
    assert.doesNotMatch(output, /eyJhbGciOi/);
  });

  it("keeps the key name for assigned secrets so the reader knows what was removed", () => {
    const output = redact("password: super-secret-value\ntoken = abc123456");

    assert.equal(output, `password=${REDACTED}\ntoken=${REDACTED}`);
  });

  it("redacts private key blocks", () => {
    const output = redact("-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----");

    assert.equal(output, REDACTED);
  });

  it("leaves ordinary work content untouched", () => {
    const input = "Refactored the evaluation runner and added coverage stats.";

    assert.equal(redact(input), input);
  });
});
