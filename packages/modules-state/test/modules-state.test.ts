import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  createEmptyModulesState,
  moduleKeys,
  MODULES_JSON,
  normalizeModulesState,
  readModulesState,
} from "../src/index";

describe("normalizeModulesState", () => {
  it("builds an empty state from malformed input", () => {
    assert.deepEqual(normalizeModulesState(null), createEmptyModulesState());
    assert.deepEqual(moduleKeys(normalizeModulesState("nope")), []);
  });

  it("keeps valid records and drops/normalises junk fields", () => {
    const state = normalizeModulesState({
      registry: { url: "https://example.invalid/r.git", sourceCommit: "abc" },
      modules: [
        { key: "a", sourceCommit: "aaa", localPatches: ["x", 1] },
        { key: 1 },
        "nope",
        { key: "b", version: "1.2.3" },
      ],
    });
    assert.deepEqual(state.modules, [
      { key: "a", version: null, sourceCommit: "aaa", localPatches: ["x"] },
      { key: "b", version: "1.2.3", sourceCommit: null, localPatches: [] },
    ]);
  });

  it("de-duplicates repeated module keys", () => {
    const state = normalizeModulesState({
      modules: [{ key: "a" }, { key: "a" }],
    });
    assert.deepEqual(moduleKeys(state), ["a"]);
  });
});

describe("readModulesState", () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "modules-state-"));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("returns an empty state when modules.json is absent", async () => {
    assert.deepEqual(await readModulesState(root), createEmptyModulesState());
  });

  it("reads and normalizes a valid modules.json", async () => {
    await fs.writeFile(
      path.join(root, MODULES_JSON),
      JSON.stringify({
        registry: { url: "https://example.invalid/r.git", sourceCommit: "abc" },
        modules: [{ key: "account", sourceCommit: "aaa", localPatches: ["p"] }],
      }),
      "utf8",
    );
    const state = await readModulesState(root);
    assert.deepEqual(state.modules, [{ key: "account", version: null, sourceCommit: "aaa", localPatches: ["p"] }]);
    assert.equal(state.registry?.sourceCommit, "abc");
  });

  it("throws a SyntaxError when modules.json is invalid JSON", async () => {
    await fs.writeFile(path.join(root, MODULES_JSON), "{ not json", "utf8");
    await assert.rejects(readModulesState(root), SyntaxError);
  });
});
