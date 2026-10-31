import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { unifiedDiff } from "../src/lib/diff";

describe("unifiedDiff", () => {
  it("returns an empty string for identical content", () => {
    assert.equal(unifiedDiff("a\nb\nc\n", "a\nb\nc\n", "a/f", "b/f"), "");
  });

  it("treats a missing trailing newline as identical to a trailing newline", () => {
    assert.equal(unifiedDiff("a\nb", "a\nb\n", "a/f", "b/f"), "");
  });

  it("produces a git-style hunk for an insertion", () => {
    const diff = unifiedDiff("a\nc\n", "a\nb\nc\n", "a/f", "b/f");
    const lines = diff.split("\n");
    assert.deepEqual(lines.slice(0, 3), ["--- a/f", "+++ b/f", "@@ -1,2 +1,3 @@"]);
    assert.deepEqual(lines.slice(3, 6), [" a", "+b", " c"]);
  });

  it("produces a git-style hunk for a modification", () => {
    const diff = unifiedDiff("a\nb\nc\n", "a\nX\nc\n", "a/f", "b/f");
    assert.ok(diff.includes("@@ -1,3 +1,3 @@"));
    assert.ok(diff.includes("-b"));
    assert.ok(diff.includes("+X"));
  });

  it("produces a git-style hunk for a deletion", () => {
    const diff = unifiedDiff("a\nb\nc\n", "a\nc\n", "a/f", "b/f");
    assert.ok(diff.includes("@@ -1,3 +1,2 @@"));
    assert.ok(diff.includes("-b"));
  });

  it("handles empty old content as a full addition", () => {
    const diff = unifiedDiff("", "a\nb\n", "a/f", "b/f");
    assert.ok(diff.includes("@@ -0,0 +1,2 @@"));
    assert.ok(diff.includes("+a"));
    assert.ok(diff.includes("+b"));
  });

  it("handles empty new content as a full deletion", () => {
    const diff = unifiedDiff("a\nb\n", "", "a/f", "b/f");
    assert.ok(diff.includes("@@ -1,2 +0,0 @@"));
    assert.ok(diff.includes("-a"));
  });

  it("emits separate hunks for changes separated by more than the context size", () => {
    const before = Array.from({ length: 16 }, (_, i) => `x${i}`).join("\n") + "\n";
    const after = Array.from({ length: 16 }, (_, i) => (i === 0 || i === 15 ? `X${i}` : `x${i}`)).join("\n") + "\n";
    const diff = unifiedDiff(before, after, "a/f", "b/f");
    assert.ok(diff.includes("@@ -1,4 +1,4 @@"));
    assert.ok(diff.includes("@@ -13,4 +13,4 @@"));
    assert.ok(diff.includes("-x0"));
    assert.ok(diff.includes("+X0"));
    assert.ok(diff.includes("-x15"));
    assert.ok(diff.includes("+X15"));
  });

  it("falls back to a coarse diff instead of an unbounded LCS table", () => {
    const before = Array.from({ length: 1200 }, (_, i) => `old ${i}`).join("\n");
    const after = Array.from({ length: 1200 }, (_, i) => `new ${i}`).join("\n");
    const started = Date.now();
    const diff = unifiedDiff(before, after, "a/f", "b/f");
    assert.ok(Date.now() - started < 5000, "diff must not hang on pathological input");
    assert.ok(diff.includes("-old 0"));
    assert.ok(diff.includes("+new 0"));
  });
});
