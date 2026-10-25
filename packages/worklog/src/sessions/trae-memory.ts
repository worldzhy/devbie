import { basename, dirname } from "node:path";

import { readCompleteLines } from "../jsonl-files";
import { redact } from "../redact";
import { chunkContent } from "./content";
import { stringList, stringOrNull } from "./record";
import { emptySession } from "./types";
import type { NormalizedMessage, SessionDelta } from "./types";

/**
 * Trae session memory (`session_memory_*.jsonl` under
 * `~/.trae-cn/memory/projects/<slug>/<yyyymmdd>/`): one line per message,
 * already summarized by the IDE — {intent, actions[], outcome, learned[],
 * message_summary_time, message_id}. This is NOT a raw transcript; the
 * worklog marks these sessions with provenance "trae-memory" so the server
 * never confuses the two fidelity levels. The workspace is derived from the
 * directory slug — the records carry no cwd.
 */
export function readTraeMemoryDelta(filePath: string, offset: number, nextSeq: number): SessionDelta {
  const { lines, nextOffset, reset } = readCompleteLines(filePath, offset);
  if (lines.length === 0) {
    return { parsed: emptySession(), nextOffset, reset };
  }

  // Stable session identity: the chat id from the file name plus the daily
  // folder, so the same chat summarized on different days stays distinct.
  const sessionId = basename(filePath, ".jsonl").replace(/^session_memory_/, "");
  const dateFolder = basename(dirname(filePath));
  const externalSessionId = `trae-memory:${dateFolder}:${sessionId}`;

  const messages: NormalizedMessage[] = [];
  let startedAt: string | null = null;
  let endedAt: string | null = null;
  let seq = reset ? 0 : nextSeq;

  for (const line of lines) {
    let record: Record<string, unknown>;
    try {
      record = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }

    const content = composeTraeMemoryContent(record);
    if (!content) continue;

    const createdAt = parseTraeMemoryTime(stringOrNull(record.message_summary_time));
    if (createdAt) {
      startedAt = startedAt ?? createdAt;
      endedAt = createdAt;
    }

    for (const chunk of chunkContent(redact(content))) {
      messages.push({ seq: seq++, role: "assistant", content: chunk, createdAt: createdAt ?? undefined });
    }
  }

  return {
    parsed: {
      workspaceRootPath: null,
      externalSessionId,
      messages,
      aggregate: {
        externalSessionId,
        model: "",
        turnCount: messages.length,
        messageCount: messages.length,
        toolCallCount: 0,
        toolNames: [],
        touchedFiles: [],
        startedAt: startedAt ?? new Date().toISOString(),
        endedAt: endedAt ?? new Date().toISOString(),
      },
    },
    nextOffset,
    reset,
  };
}

/** Composes one readable text block out of the IDE's per-message summary. */
function composeTraeMemoryContent(record: Record<string, unknown>): string {
  const parts: string[] = [];
  const intent = stringOrNull(record.intent);
  if (intent) parts.push(`Intent: ${intent}`);
  const actions = stringList(record.actions);
  if (actions.length > 0) parts.push(`Actions: ${actions.join("; ")}`);
  const outcome = stringOrNull(record.outcome);
  if (outcome) parts.push(`Outcome: ${outcome}`);
  const learned = stringList(record.learned);
  if (learned.length > 0) parts.push(`Learned: ${learned.join("; ")}`);
  return parts.join("\n");
}

/** "2026-10-23 00:40:36" is local time — parse it as such, emit ISO. */
function parseTraeMemoryTime(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value.replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
