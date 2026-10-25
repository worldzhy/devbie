import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CliError, isUserCancellation } from "../src/index";

describe("CliError", () => {
  it("marks the error name so runners can print it without a stack", () => {
    const error = new CliError("boom");
    assert.equal(error.name, "CliError");
    assert.equal(error.message, "boom");
    assert.equal(error.details, undefined);
    assert.ok(error instanceof Error);
  });

  it("keeps the optional details payload", () => {
    const details = { missing: ["A", "B"] };
    const error = new CliError("missing keys", details);
    assert.equal(error.message, "missing keys");
    assert.equal(error.details, details);
  });
});

describe("isUserCancellation", () => {
  it("recognises inquirer's ExitPromptError", () => {
    const cancellation = Object.assign(new Error("cancelled"), { name: "ExitPromptError" });
    assert.equal(isUserCancellation(cancellation), true);
  });

  it("rejects anything else", () => {
    assert.equal(isUserCancellation(new CliError("boom")), false);
    assert.equal(isUserCancellation(new Error("other")), false);
    assert.equal(isUserCancellation(null), false);
    assert.equal(isUserCancellation("ExitPromptError"), false);
  });
});
