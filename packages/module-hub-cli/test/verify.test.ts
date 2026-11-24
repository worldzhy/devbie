import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildModulesUrl } from "../src/env";
import { compareModules, type LocalModule } from "../src/verify";

function record(key: string, sourceCommit: string | null = "abc"): LocalModule {
  return { key, sourceCommit };
}

describe("buildModulesUrl", () => {
  it("appends the caller-scoped modules path to the base URL", () => {
    assert.equal(buildModulesUrl("https://api.example.com"), "https://api.example.com/module-hub/me/modules");
  });

  it("keeps a deployment prefix and normalizes trailing slashes", () => {
    assert.equal(buildModulesUrl("https://api.example.com/api/"), "https://api.example.com/api/module-hub/me/modules");
  });

  it("rejects a base that already carries a /module-hub path", () => {
    assert.throws(() => buildModulesUrl("https://api.example.com/module-hub/reports"), /without a '\/module-hub' path/);
  });

  it("rejects an empty value", () => {
    assert.throws(() => buildModulesUrl("  "), /is empty/);
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
