import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CliError } from "@devbie/newbie-cli/lib";

import { assertExpectedAccount, AwsIdentity } from "../src/aws-identity";

const identity: AwsIdentity = {
  accountId: "123456789012",
  arn: "arn:aws:sts::123456789012:assumed-role/deploy/ci",
};

describe("assertExpectedAccount", () => {
  it("accepts credentials that resolve to the configured account", () => {
    assert.doesNotThrow(() => assertExpectedAccount(identity, "123456789012"));
  });

  it("does nothing when no expected account is configured", () => {
    assert.doesNotThrow(() => assertExpectedAccount(identity, undefined));
  });

  it("rejects credentials from another account with a CliError naming both accounts", () => {
    assert.throws(
      () => assertExpectedAccount(identity, "999999999999"),
      (error: unknown) => {
        assert.ok(error instanceof CliError);
        assert.match(error.message, /expected 999999999999/);
        assert.match(error.message, /resolve to 123456789012/);
        return true;
      },
    );
  });

  it("reports an empty account id as unknown instead of echoing nothing", () => {
    assert.throws(() => assertExpectedAccount({ accountId: "", arn: "" }, "123456789012"), /resolve to unknown/);
  });
});
