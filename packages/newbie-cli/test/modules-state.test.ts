import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createEmptyModulesState, moduleKeys, normalizeModulesState } from "@devbie/modules-state";

import { diffModuleKeys, withModuleKeys } from "../src/core/modules-state";

describe("diffModuleKeys", () => {
  it("computes added and removed keys", () => {
    assert.deepEqual(diffModuleKeys(["a", "b"], ["b", "c"]), {
      added: ["c"],
      removed: ["a"],
    });
  });
});

describe("withModuleKeys", () => {
  it("records only keys, regardless of legacy provenance fields", () => {
    const state = normalizeModulesState({
      modules: [{ key: "a", sourceCommit: "aaa", localPatches: ["p"] }],
    });
    const next = withModuleKeys(state, ["b", "a"]);
    assert.deepEqual(next.modules, [{ key: "b" }, { key: "a" }]);
  });

  it("de-duplicates the requested keys", () => {
    const next = withModuleKeys(createEmptyModulesState(), ["a", "a"]);
    assert.deepEqual(moduleKeys(next), ["a"]);
  });
});
