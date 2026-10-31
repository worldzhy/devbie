import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { scanDocuments } from "../src/documents";
import type { WorklogConfig } from "../src/config";

function configFor(rootPath: string): WorklogConfig {
  return {
    endpoint: "https://nw.example.com",
    token: "token",
    workspaces: [{ workspaceKey: "repo", rootPath }],
    agentSessionDirectories: {},
    documentDirectories: ["docs"],
    maxDocumentBytes: 200_000,
  };
}

describe("scanDocuments symlink policy", () => {
  it("skips symlinks inside a declared workspace instead of following them", () => {
    const base = mkdtempSync(join(tmpdir(), "worklog-docs-"));
    const rootPath = join(base, "repo");
    const docsDirectory = join(rootPath, "docs");
    mkdirSync(docsDirectory, { recursive: true });
    writeFileSync(join(docsDirectory, "real.md"), "real document");
    const outsideFile = join(base, "outside.md");
    writeFileSync(outsideFile, "outside the boundary");
    symlinkSync(outsideFile, join(docsDirectory, "linked.md"));
    symlinkSync(base, join(docsDirectory, "linked-directory"));

    const state = { files: {}, documents: {} };
    const documents = scanDocuments(configFor(rootPath), state);

    assert.deepEqual(
      documents.map((document) => document.upload.refPath),
      ["docs/real.md"],
    );
  });

  it("does not commit document hashes itself; the caller does after a successful upload", () => {
    const base = mkdtempSync(join(tmpdir(), "worklog-docs-"));
    const rootPath = join(base, "repo");
    mkdirSync(join(rootPath, "docs"), { recursive: true });
    writeFileSync(join(rootPath, "docs", "real.md"), "real document");

    const state = { files: {}, documents: {} };
    const documents = scanDocuments(configFor(rootPath), state);

    assert.equal(documents.length, 1);
    assert.ok(documents[0].hash.length > 0);
    // A failed upload must leave the state untouched so the next run retries.
    assert.deepEqual(state.documents, {});
  });

  it("skips a declared directory that is itself a symlink", () => {
    const base = mkdtempSync(join(tmpdir(), "worklog-docs-"));
    const rootPath = join(base, "repo");
    mkdirSync(rootPath, { recursive: true });
    const outsideDirectory = join(base, "elsewhere");
    mkdirSync(outsideDirectory, { recursive: true });
    writeFileSync(join(outsideDirectory, "escaped.md"), "outside the boundary");
    symlinkSync(outsideDirectory, join(rootPath, "docs"));

    const state = { files: {}, documents: {} };
    const documents = scanDocuments(configFor(rootPath), state);

    assert.deepEqual(documents, []);
  });
});
