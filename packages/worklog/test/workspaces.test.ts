import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import type { WorklogConfig } from "../src/config";
import { dashedSlugFor } from "../src/sessions/workspace";
import { addWorkspace, removeWorkspace } from "../src/workspaces";

function config(overrides: Partial<WorklogConfig> = {}): WorklogConfig {
  return {
    endpoint: "https://nw.example.com",
    token: "token",
    workspaces: [],
    agentSessionDirectories: {},
    documentDirectories: [],
    maxDocumentBytes: 200_000,
    ...overrides,
  };
}

function workspaceDirectory(name = "app"): string {
  const root = mkdtempSync(join(tmpdir(), "worklog-workspace-"));
  const directory = join(root, name);
  mkdirSync(directory);
  return directory;
}

describe("addWorkspace", () => {
  it("declares a directory keyed by its basename, symlink-resolved", () => {
    const directory = workspaceDirectory();
    const cfg = config();

    const result = addWorkspace(cfg, directory);

    assert.equal(result.workspace.workspaceKey, "app");
    assert.equal(result.alreadyDeclared, false);
    assert.equal(cfg.workspaces.length, 1);
  });

  it("is idempotent for an already declared path", () => {
    const directory = workspaceDirectory();
    const cfg = config();
    addWorkspace(cfg, directory);

    const again = addWorkspace(cfg, directory);

    assert.equal(again.alreadyDeclared, true);
    assert.equal(cfg.workspaces.length, 1);
  });

  it("rejects paths that do not exist or are not directories", () => {
    const cfg = config();
    assert.throws(() => addWorkspace(cfg, join(tmpdir(), "worklog-definitely-missing")), /does not exist/);

    const root = mkdtempSync(join(tmpdir(), "worklog-file-"));
    const file = join(root, "notes.txt");
    writeFileSync(file, "x");
    assert.throws(() => addWorkspace(cfg, file), /Not a directory/);
  });

  it("rejects the filesystem root and the home directory outright", () => {
    const cfg = config();
    assert.throws(() => addWorkspace(cfg, "/"), /entire machine/);
    assert.throws(() => addWorkspace(cfg, homedir()), /entire machine/);
  });

  it("rejects paths nesting an already declared workspace in either direction", () => {
    const parent = workspaceDirectory("parent");
    const child = join(parent, "child");
    mkdirSync(child);

    const cfg = config();
    addWorkspace(cfg, parent);
    assert.throws(() => addWorkspace(cfg, child), /nests/);

    const reversed = config();
    addWorkspace(reversed, child);
    assert.throws(() => addWorkspace(reversed, parent), /nests/);
  });

  it("rejects a second workspace whose directory name collides with an existing key", () => {
    const first = workspaceDirectory("app");
    const second = workspaceDirectory("app");
    const cfg = config();

    addWorkspace(cfg, first);
    assert.throws(() => addWorkspace(cfg, second), /already used/);
  });

  it("warns when no IDE store shows activity for the path", () => {
    const directory = workspaceDirectory();
    const cfg = config();

    const result = addWorkspace(cfg, directory);

    assert.ok(result.warnings.some((warning) => warning.includes("No session activity")));
  });

  it("reports session evidence from the IDE stores", () => {
    const directory = workspaceDirectory("evidenced");
    const trae = mkdtempSync(join(tmpdir(), "worklog-trae-"));
    const slugDirectory = join(trae, `${dashedSlugFor(directory)}--p2-abc`, "20261024");
    mkdirSync(slugDirectory, { recursive: true });
    writeFileSync(join(slugDirectory, "session_memory_x.jsonl"), "{}\n");
    const claude = mkdtempSync(join(tmpdir(), "worklog-claude-"));
    mkdirSync(join(claude, dashedSlugFor(directory)));
    writeFileSync(join(claude, dashedSlugFor(directory), "s1.jsonl"), "{}\n");
    const cfg = config({ agentSessionDirectories: { trae, claude } });

    const result = addWorkspace(cfg, directory);

    assert.deepEqual(result.warnings, []);
    assert.equal(result.activity.find((entry) => entry.ide === "trae")?.sessions, 1);
    assert.equal(result.activity.find((entry) => entry.ide === "claude")?.sessions, 1);
  });
});

describe("removeWorkspace", () => {
  it("removes a declared workspace", () => {
    const directory = workspaceDirectory();
    const cfg = config();
    addWorkspace(cfg, directory);

    const removed = removeWorkspace(cfg, directory);

    assert.equal(removed.workspaceKey, "app");
    assert.equal(cfg.workspaces.length, 0);
  });

  it("rejects removing a path that was never declared", () => {
    const cfg = config();
    assert.throws(() => removeWorkspace(cfg, tmpdir()), /Not declared/);
  });
});
