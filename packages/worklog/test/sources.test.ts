import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";

import { SESSION_SOURCES } from "../src/sessions/sources";
import { emptySession } from "../src/sessions/types";

const declaredWorkspace = {
  workspaceKey: "devbie",
  rootPath: "/Users/worldzhy/src/devbie",
};

function context(filePath: string, directory: string, parsed = emptySession()) {
  return { filePath, directory, parsed, workspaces: [declaredWorkspace] };
}

describe("session source registry", () => {
  it("declares one descriptor per supported IDE with its wire provenance", () => {
    assert.deepEqual(Object.keys(SESSION_SOURCES), ["claude", "codex", "trae"]);
    assert.equal(SESSION_SOURCES.claude.provenance, "claude");
    assert.equal(SESSION_SOURCES.codex.provenance, "codex");
    // The config key is the IDE; the wire value states the fidelity level.
    assert.equal(SESSION_SOURCES.trae.provenance, "trae-memory");
  });

  it("reads only Trae's memory files, not arbitrary jsonl", () => {
    assert.equal(SESSION_SOURCES.trae.accepts("/memory/20261023/session_memory_abc.jsonl"), true);
    assert.equal(SESSION_SOURCES.trae.accepts("/memory/20261023/other.jsonl"), false);
    assert.equal(SESSION_SOURCES.claude.accepts("/projects/anything.jsonl"), true);
  });

  it("scopes a transcript to the workspace containing its recorded cwd", () => {
    const inside = { ...emptySession(), workspaceRootPath: "/Users/worldzhy/src/devbie/packages/x" };
    assert.equal(SESSION_SOURCES.claude.resolveWorkspace(context("/p/a.jsonl", "/p", inside))?.workspaceKey, "devbie");

    const outside = { ...emptySession(), workspaceRootPath: "/Users/worldzhy/src/other" };
    assert.equal(SESSION_SOURCES.claude.resolveWorkspace(context("/p/a.jsonl", "/p", outside)), null);
    assert.equal(SESSION_SOURCES.claude.resolveWorkspace(context("/p/a.jsonl", "/p")), null);
  });

  it("scopes Trae memory by the directory slug prefix", () => {
    const root = "/Users/worldzhy/.trae-cn/memory/projects";
    const filePath = join(
      root,
      "-Users-worldzhy-src-devbie--p2-abebb885e0e787b0fc45",
      "20261023",
      "session_memory_a.jsonl",
    );

    assert.equal(SESSION_SOURCES.trae.resolveWorkspace(context(filePath, root))?.workspaceKey, "devbie");
  });
});
