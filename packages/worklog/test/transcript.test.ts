import assert from "node:assert/strict";
import { appendFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { readTranscriptDelta } from "../src/sessions/transcript";

function transcriptFile(lines: string[]): string {
  const directory = mkdtempSync(join(tmpdir(), "worklog-"));
  const file = join(directory, "session.jsonl");
  writeFileSync(file, lines.join("\n") + "\n");
  return file;
}

const claudeRecords = [
  JSON.stringify({
    type: "user",
    sessionId: "session-1",
    cwd: "/work/company",
    timestamp: "2026-10-01T09:00:00.000Z",
    message: { role: "user", content: "Add the coverage declaration" },
  }),
  JSON.stringify({
    type: "assistant",
    sessionId: "session-1",
    timestamp: "2026-10-01T09:01:00.000Z",
    message: {
      model: "claude-sonnet-4",
      content: [
        { type: "text", text: "I will edit the builder." },
        { type: "tool_use", name: "Edit", input: { file_path: "/work/company/a.ts" } },
      ],
    },
  }),
];

describe("session transcript delta reader", () => {
  it("normalizes Claude Code records and aggregates tool usage", () => {
    const { parsed, nextOffset } = readTranscriptDelta(transcriptFile(claudeRecords), 0, 0);

    assert.equal(parsed.workspaceRootPath, "/work/company");
    assert.equal(parsed.externalSessionId, "session-1");
    assert.equal(parsed.aggregate.turnCount, 1);
    assert.equal(parsed.aggregate.toolCallCount, 1);
    assert.deepEqual(parsed.aggregate.toolNames, ["Edit"]);
    assert.deepEqual(parsed.aggregate.touchedFiles, ["/work/company/a.ts"]);
    assert.equal(parsed.aggregate.model, "claude-sonnet-4");
    assert.equal(parsed.aggregate.startedAt, "2026-10-01T09:00:00.000Z");
    assert.equal(parsed.aggregate.endedAt, "2026-10-01T09:01:00.000Z");
    assert.equal(parsed.messages.length, 2);
    assert.ok(nextOffset > 0);
  });

  it("reads only the appended tail and leaves a partially written line for the next run", () => {
    const file = transcriptFile(claudeRecords);
    const first = readTranscriptDelta(file, 0, 0);

    appendFileSync(file, `${claudeRecords[0]}\n{"type":"user","message":{"content":"partial`);

    const second = readTranscriptDelta(file, first.nextOffset, first.parsed.messages.length);

    assert.equal(second.parsed.messages.length, 1);
    assert.equal(second.parsed.messages[0].seq, 2);
    assert.equal(second.parsed.aggregate.turnCount, 1);
  });

  it("splits oversized messages into bounded chunks", () => {
    const long = "x".repeat(9_000);
    const line = JSON.stringify({
      type: "user",
      sessionId: "session-long",
      message: { role: "user", content: long },
    });

    const { parsed } = readTranscriptDelta(transcriptFile([line]), 0, 0);

    assert.equal(parsed.messages.length, 3);
    assert.deepEqual(
      parsed.messages.map((message) => message.content.length),
      [4_000, 4_000, 1_000],
    );
    assert.deepEqual(
      parsed.messages.map((message) => message.seq),
      [0, 1, 2],
    );
  });

  it("normalizes Codex-style records that carry the payload one level down", () => {
    const line = JSON.stringify({
      timestamp: "2026-10-02T10:00:00.000Z",
      payload: { type: "agent_message", message: "Answered the review question" },
    });

    const { parsed } = readTranscriptDelta(transcriptFile([line]), 0, 0);

    assert.equal(parsed.messages.length, 1);
    assert.equal(parsed.messages[0].role, "assistant");
    assert.equal(parsed.messages[0].content, "Answered the review question");
    assert.equal(parsed.aggregate.endedAt, "2026-10-02T10:00:00.000Z");
  });

  it("returns nothing new when the file has not grown", () => {
    const file = transcriptFile(claudeRecords);
    const first = readTranscriptDelta(file, 0, 0);
    const second = readTranscriptDelta(file, first.nextOffset, first.parsed.messages.length);

    assert.equal(second.parsed.messages.length, 0);
    assert.equal(second.nextOffset, first.nextOffset);
  });

  it("redacts credentials inside serialized tool calls and string content", () => {
    const lines = [
      JSON.stringify({
        type: "user",
        sessionId: "session-secret",
        message: { role: "user", content: "use key AKIAIOSFODNN7EXAMPLE here" },
      }),
      JSON.stringify({
        type: "assistant",
        sessionId: "session-secret",
        message: {
          content: [
            {
              type: "tool_use",
              name: "Write",
              input: { file_path: "/work/company/.env", content: "token = ghp_0123456789abcdefghijABCDEF" },
            },
          ],
        },
      }),
    ];

    const { parsed } = readTranscriptDelta(transcriptFile(lines), 0, 0);

    assert.equal(parsed.messages.length, 2);
    assert.doesNotMatch(parsed.messages[0].content, /AKIA/);
    assert.doesNotMatch(parsed.messages[1].toolCalls ?? "", /ghp_/);
  });

  it("restarts from byte 0 and resets seq when the file is truncated underneath", () => {
    const file = transcriptFile(claudeRecords);
    const first = readTranscriptDelta(file, 0, 0);
    assert.ok(!first.reset);

    // Simulate log rotation: the file now starts over, shorter than before.
    writeFileSync(file, claudeRecords[0] + "\n");
    const second = readTranscriptDelta(file, first.nextOffset, first.parsed.messages.length);

    assert.equal(second.reset, true);
    assert.equal(second.nextOffset, claudeRecords[0].length + 1);
    assert.deepEqual(
      second.parsed.messages.map((message) => message.seq),
      [0],
    );
  });
});
