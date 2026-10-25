import { readCompleteLines } from "../jsonl-files";
import { redact } from "../redact";
import { normalizeClaudeRecord } from "./claude";
import { normalizeCodexRecord } from "./codex";
import { chunkContent } from "./content";
import { stringOrNull } from "./record";
import { emptySession } from "./types";
import type { NormalizedMessage, NormalizedRecord, SessionDelta } from "./types";

const FILE_EDIT_TOOLS = new Set([
  "Edit",
  "Write",
  "MultiEdit",
  "NotebookEdit",
  "edit_file",
  "write_file",
  "apply_patch",
  "create_file",
  "str_replace_editor",
]);

/** Claude Code and Codex both write raw JSONL; only the line shape differs. */
function normalizeRecord(record: Record<string, unknown>): NormalizedRecord | null {
  return record.message === undefined ? normalizeCodexRecord(record) : normalizeClaudeRecord(record);
}

/**
 * Reads newline-delimited transcript lines starting at `offset`. A partially
 * written trailing line is left for the next run.
 */
export function readTranscriptDelta(filePath: string, offset: number, nextSeq: number): SessionDelta {
  const { lines, nextOffset, reset } = readCompleteLines(filePath, offset);
  if (lines.length === 0) {
    return { parsed: emptySession(), nextOffset, reset };
  }

  const messages: NormalizedMessage[] = [];
  const toolNames = new Set<string>();
  const touchedFiles = new Set<string>();
  let workspaceRootPath: string | null = null;
  let externalSessionId: string | null = null;
  let model = "";
  let startedAt: string | null = null;
  let endedAt: string | null = null;
  let turnCount = 0;
  let toolCallCount = 0;
  // A truncated or rotated file restarts its numbering: the old tail is gone,
  // so the server-side dedupe key (session_id, seq) must not inherit it.
  let seq = reset ? 0 : nextSeq;

  for (const line of lines) {
    let record: Record<string, unknown>;
    try {
      record = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }

    const cwd = stringOrNull(record.cwd) ?? stringOrNull((record.payload as Record<string, unknown>)?.cwd);
    if (!workspaceRootPath && cwd) workspaceRootPath = cwd;
    const sessionId = stringOrNull(record.sessionId) ?? stringOrNull(record.session_id);
    if (!externalSessionId && sessionId) externalSessionId = sessionId;
    const timestamp = stringOrNull(record.timestamp) ?? stringOrNull(record.created_at);
    if (timestamp) {
      startedAt = startedAt ?? timestamp;
      endedAt = timestamp;
    }

    const normalized = normalizeRecord(record);
    if (!normalized) continue;
    if (normalized.model) model = normalized.model;
    if (normalized.role === "user") turnCount++;

    for (const call of normalized.toolCalls) {
      toolCallCount++;
      toolNames.add(call.name);
      if (FILE_EDIT_TOOLS.has(call.name) && call.filePath) touchedFiles.add(call.filePath);
    }

    for (const chunk of chunkContent(normalized.content)) {
      messages.push({
        seq: seq++,
        role: normalized.role,
        content: chunk,
        toolName: normalized.toolNames.join(",") || undefined,
        // Tool inputs can carry credentials (e.g. a Write whose content pastes
        // an env file) — the serialized form goes through the same scrubber.
        toolCalls: normalized.toolCalls.length > 0 ? redact(JSON.stringify(normalized.toolCalls)) : undefined,
        createdAt: timestamp ?? undefined,
      });
    }
  }

  return {
    parsed: {
      workspaceRootPath,
      externalSessionId,
      messages,
      aggregate: {
        externalSessionId: externalSessionId ?? "",
        model,
        turnCount,
        messageCount: messages.length,
        toolCallCount,
        toolNames: [...toolNames],
        touchedFiles: [...touchedFiles],
        startedAt: startedAt ?? new Date().toISOString(),
        endedAt: endedAt ?? new Date().toISOString(),
      },
    },
    nextOffset,
    reset,
  };
}
