import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { readTraeMemoryDelta } from "../src/sessions/trae-memory";
import { dashedSlugFor, traeMemoryWorkspaceFor } from "../src/sessions/workspace";

const traeLines = [
  JSON.stringify({
    intent: "Add the coverage declaration card to the team page",
    actions: ["edit page.tsx", "run tsc"],
    outcome: "Coverage card renders per-source counts",
    learned: ["coverageZero means not connected"],
    message_summary_time: "2026-10-23 00:40:36",
    message_id: 1,
  }),
  JSON.stringify({
    intent: "Fix the radar chart max",
    actions: [],
    outcome: "",
    learned: [],
    message_summary_time: "2026-10-23 00:55:01",
    message_id: 2,
  }),
];

function traeMemoryFile(lines: string[]): { root: string; file: string } {
  const root = mkdtempSync(join(tmpdir(), "trae-memory-"));
  const directory = join(root, "-Users-worldzhy-src-devbie--p2-abebb885e0e787b0fc45", "20261023");
  mkdirSync(directory, { recursive: true });
  const file = join(directory, "session_memory_69ba5.jsonl");
  writeFileSync(file, lines.join("\n") + "\n");
  return { root, file };
}

const declaredWorkspace = {
  workspaceKey: "devbie",
  rootPath: "/Users/worldzhy/src/devbie",
};

describe("trae memory delta reader", () => {
  it("normalizes IDE session summaries into assistant messages", () => {
    const { file } = traeMemoryFile(traeLines);
    const { parsed, nextOffset } = readTraeMemoryDelta(file, 0, 0);

    assert.equal(parsed.externalSessionId, "trae-memory:20261023:69ba5");
    assert.equal(parsed.messages.length, 2);
    assert.equal(parsed.messages[0].role, "assistant");
    assert.match(parsed.messages[0].content, /Intent: Add the coverage declaration card/);
    assert.match(parsed.messages[0].content, /Actions: edit page\.tsx; run tsc/);
    assert.equal(parsed.messages[1].content, "Intent: Fix the radar chart max");
    assert.equal(parsed.messages[0].createdAt, new Date("2026-10-23T00:40:36").toISOString());
    assert.equal(parsed.aggregate.turnCount, 2);
    assert.equal(parsed.aggregate.toolCallCount, 0);
    assert.ok(nextOffset > 0);
  });

  it("maps a memory file to its declared workspace via the directory slug prefix", () => {
    const { root, file } = traeMemoryFile(traeLines);

    assert.equal(dashedSlugFor("/Users/worldzhy/src/devbie"), "-Users-worldzhy-src-devbie");
    assert.equal(traeMemoryWorkspaceFor(file, root, [declaredWorkspace])?.workspaceKey, "devbie");
    // A different workspace whose slug shares a prefix must not match.
    assert.equal(
      traeMemoryWorkspaceFor(file, root, [{ ...declaredWorkspace, rootPath: "/Users/worldzhy/src/dev" }]),
      null,
    );
    assert.equal(traeMemoryWorkspaceFor(file, root, []), null);
  });
});
