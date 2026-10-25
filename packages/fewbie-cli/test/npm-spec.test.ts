import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { packageNameOf } from "../src/lib/npm-spec";

describe("packageNameOf", () => {
  it("strips the version from an unscoped spec", () => {
    assert.equal(packageNameOf("axios@^1"), "axios");
  });

  it("strips the version from a scoped spec", () => {
    assert.equal(packageNameOf("@scope/pkg@^2"), "@scope/pkg");
  });

  it("returns bare package names unchanged", () => {
    assert.equal(packageNameOf("axios"), "axios");
    assert.equal(packageNameOf("@scope/pkg"), "@scope/pkg");
  });

  it("handles versions containing @ signs", () => {
    assert.equal(packageNameOf("axios@npm:axios@^1.2.3"), "axios");
  });
});
