import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { DEFAULT_STATE_PATH } from "./config";
import type { SessionAggregate } from "./sessions/types";

/** How far one session file has been read, and what it has already contributed. */
export interface FileProgress {
  offset: number;
  nextSeq: number;
  sessionId: string;
  turnCount: number;
  messageCount: number;
  toolCallCount: number;
  startedAt: string;
  endedAt: string;
  model: string;
  toolNames: string[];
  touchedFiles: string[];
}

/** Everything already sent for this installation, so a send only reads the tail. */
export interface WorklogState {
  files: Record<string, FileProgress>;
  documents: Record<string, { hash: string; workspaceKey: string }>;
  /** When a send last finished successfully. */
  lastSentAt?: string;
  /** Why the most recent attempt failed; cleared by the next successful send. */
  lastError?: string;
}

export function loadState(path = DEFAULT_STATE_PATH): WorklogState {
  if (!existsSync(path)) return { files: {}, documents: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<WorklogState>;
    return {
      files: parsed.files ?? {},
      documents: parsed.documents ?? {},
      lastSentAt: parsed.lastSentAt,
      lastError: parsed.lastError,
    };
  } catch {
    return { files: {}, documents: {} };
  }
}

export function saveState(state: WorklogState, path = DEFAULT_STATE_PATH): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2), "utf8");
}

export function emptyProgress(): FileProgress {
  const now = new Date().toISOString();
  return {
    offset: 0,
    nextSeq: 0,
    sessionId: "",
    turnCount: 0,
    messageCount: 0,
    toolCallCount: 0,
    startedAt: now,
    endedAt: now,
    model: "",
    toolNames: [],
    touchedFiles: [],
  };
}

/**
 * Folds one read delta into the file's running totals. Session boundaries stay
 * stable across runs: the earliest start and the latest end win. A file that
 * was truncated or rotated (`reset`) discards the previous totals — its
 * contents no longer include them.
 */
export function mergeProgress(
  progress: FileProgress | undefined,
  aggregate: SessionAggregate,
  options?: { reset?: boolean },
): Omit<FileProgress, "offset" | "nextSeq" | "sessionId"> {
  const prior = options?.reset ? undefined : progress;
  const startedAt =
    prior && new Date(prior.startedAt) < new Date(aggregate.startedAt) ? prior.startedAt : aggregate.startedAt;
  const endedAt = prior && new Date(prior.endedAt) > new Date(aggregate.endedAt) ? prior.endedAt : aggregate.endedAt;

  return {
    model: aggregate.model || prior?.model || "",
    turnCount: (prior?.turnCount ?? 0) + aggregate.turnCount,
    messageCount: (prior?.messageCount ?? 0) + aggregate.messageCount,
    toolCallCount: (prior?.toolCallCount ?? 0) + aggregate.toolCallCount,
    toolNames: [...new Set([...(prior?.toolNames ?? []), ...aggregate.toolNames])],
    touchedFiles: [...new Set([...(prior?.touchedFiles ?? []), ...aggregate.touchedFiles])],
    startedAt,
    endedAt,
  };
}
