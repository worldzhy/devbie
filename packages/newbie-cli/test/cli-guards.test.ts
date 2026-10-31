import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertInteractive } from "../src/lib/interactive";
import { isValidRegistryRef } from "../src/lib/registry";

describe("isValidRegistryRef", () => {
  it("accepts branch, tag and commit names", () => {
    for (const ref of ["main", "dev", "v1.2.3", "feature/module-key", "abc1234"]) {
      assert.equal(isValidRegistryRef(ref), true, ref);
    }
  });

  it("rejects option-like and traversal refs", () => {
    for (const ref of ["--orphan", "-b", "HEAD~1", "main..dev", "refs/tags/", "", "a b", "main^{}"]) {
      assert.equal(isValidRegistryRef(ref), false, ref);
    }
  });
});

describe("assertInteractive", () => {
  it("refuses to prompt when stdout is not a TTY", () => {
    const original = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
    Object.defineProperty(process.stdout, "isTTY", { value: false, configurable: true });
    try {
      assert.throws(() => assertInteractive("apply the changes"), /pass --yes/);
    } finally {
      if (original) Object.defineProperty(process.stdout, "isTTY", original);
      else delete (process.stdout as unknown as { isTTY?: boolean }).isTTY;
    }
  });
});
