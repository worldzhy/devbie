import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ModuleRecord } from "@devbie/modules-state";

import { deriveModulesUrl } from "../src/env";
import { compareModules } from "../src/verify";

function record(key: string, sourceCommit: string | null = "abc"): ModuleRecord {
  return { key, version: null, sourceCommit, localPatches: [] };
}

describe("deriveModulesUrl", () => {
  it("replaces the report suffix with the caller-scoped modules path", () => {
    assert.equal(
      deriveModulesUrl("https://api.example.com/module-hub/report"),
      "https://api.example.com/module-hub/me/modules",
    );
  });

  it("rejects endpoints that do not have the documented shape", () => {
    assert.throws(() => deriveModulesUrl("https://api.example.com"), /must end with/);
  });
});

describe("compareModules", () => {
  it("reports a clean match", () => {
    assert.deepEqual(compareModules([record("account")], [{ key: "account", sourceCommit: "abc" }]), []);
  });

  it("flags modules enabled locally but absent from the hub snapshot", () => {
    assert.deepEqual(compareModules([record("account")], []), [
      { key: "account", reason: "missing-on-hub", localSourceCommit: "abc" },
    ]);
  });

  it("flags modules the hub still records but the local assembly dropped", () => {
    assert.deepEqual(compareModules([], [{ key: "account", sourceCommit: "abc" }]), [
      { key: "account", reason: "missing-locally", remoteSourceCommit: "abc" },
    ]);
  });

  it("flags a registry commit mismatch", () => {
    assert.deepEqual(compareModules([record("account", "aaa")], [{ key: "account", sourceCommit: "bbb" }]), [
      { key: "account", reason: "source-commit-differs", localSourceCommit: "aaa", remoteSourceCommit: "bbb" },
    ]);
  });

  it("skips the commit comparison when either side has no commit recorded", () => {
    assert.deepEqual(compareModules([record("account", null)], [{ key: "account", sourceCommit: "bbb" }]), []);
    assert.deepEqual(compareModules([record("account", "aaa")], [{ key: "account" }]), []);
  });
});
