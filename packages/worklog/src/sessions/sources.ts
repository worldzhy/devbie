import { readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";

import type { IdeKey } from "../config";
import { readFirstLine, walkJsonl } from "../jsonl-files";
import { readTraeMemoryDelta } from "./trae-memory";
import { readTranscriptDelta } from "./transcript";
import type { SessionSource } from "./types";
import { dashedSlugFor, isInside, traeMemoryWorkspaceFor } from "./workspace";

const CODEX_NO_CWD_NOTE =
  "Codex transcripts without a recorded working directory are skipped — only sessions carrying cwd can be scoped to a declared workspace.";

const TRAE_MEMORY_FIDELITY_NOTE =
  'Trae sessions are the IDE\'s own session summaries (source "trae-memory"), not raw transcripts — lower fidelity by construction.';

/** Codex sessions are stored flat by date, so activity evidence is a first-line scan, capped. */
const CODEX_ACTIVITY_SCAN_FILE_LIMIT = 500;

/** Claude keeps one directory per workspace, named by the dashed slug, holding the session files. */
function claudeCountSessions(directory: string, rootPath: string): number {
  try {
    return readdirSync(join(directory, dashedSlugFor(rootPath))).filter((entry) => entry.endsWith(".jsonl")).length;
  } catch {
    return 0;
  }
}

/** Codex files carry the working directory in the first line's `payload.cwd`. */
function codexCountSessions(directory: string, rootPath: string): number {
  const target = resolve(rootPath);
  let count = 0;
  let scanned = 0;
  for (const filePath of walkJsonl(directory)) {
    if (scanned >= CODEX_ACTIVITY_SCAN_FILE_LIMIT) break;
    scanned += 1;
    const line = readFirstLine(filePath);
    if (!line) continue;
    try {
      const record = JSON.parse(line) as { payload?: { cwd?: string } };
      if (record.payload?.cwd && resolve(record.payload.cwd) === target) count += 1;
    } catch {
      continue;
    }
  }
  return count;
}

/** Trae memory files live under `<slug-prefix>[--p2-<hash>]/<yyyymmdd>/session_memory_*.jsonl`. */
function traeCountSessions(directory: string, rootPath: string): number {
  const prefix = dashedSlugFor(rootPath);
  let entries: string[];
  try {
    entries = readdirSync(directory);
  } catch {
    return 0;
  }
  let count = 0;
  for (const entry of entries) {
    if (entry !== prefix && !entry.startsWith(`${prefix}--p2-`)) continue;
    for (const filePath of walkJsonl(join(directory, entry))) {
      if (basename(filePath).startsWith("session_memory_")) count += 1;
    }
  }
  return count;
}

/** Raw IDE transcripts (Claude Code, Codex): the recorded cwd decides the workspace. */
function transcriptSource(
  provenance: string,
  countSessions: (directory: string, rootPath: string) => number,
  note?: string,
): SessionSource {
  return {
    provenance,
    accepts: () => true,
    readDelta: readTranscriptDelta,
    resolveWorkspace: ({ parsed, workspaces }) => {
      const rootPath = parsed.workspaceRootPath;
      if (!rootPath) return null;
      return workspaces.find((workspace) => isInside(rootPath, workspace.rootPath)) ?? null;
    },
    countSessions,
    note,
  };
}

/** Trae exposes no transcripts, only the IDE's own session summaries. */
const traeSource: SessionSource = {
  provenance: "trae-memory",
  accepts: (filePath) => basename(filePath).startsWith("session_memory_"),
  readDelta: readTraeMemoryDelta,
  resolveWorkspace: ({ filePath, directory, workspaces }) => traeMemoryWorkspaceFor(filePath, directory, workspaces),
  countSessions: traeCountSessions,
  note: TRAE_MEMORY_FIDELITY_NOTE,
};

/**
 * One descriptor per supported IDE, keyed by `IdeKey` — the same key the
 * config uses under `agentSessionDirectories`. A configured directory for an
 * unknown IDE is ignored by construction.
 */
export const SESSION_SOURCES: Record<IdeKey, SessionSource> = {
  claude: transcriptSource("claude", claudeCountSessions),
  codex: transcriptSource("codex", codexCountSessions, CODEX_NO_CWD_NOTE),
  trae: traeSource,
};
