import type { WorklogConfig, IdeKey } from "./config";
import { scanDocuments } from "./documents";
import { walkJsonl } from "./jsonl-files";
import { emptyProgress, mergeProgress } from "./state";
import type { WorklogState } from "./state";
import { SESSION_SOURCES } from "./sessions/sources";
import { WorklogApi, UploadSession } from "./api";

export interface SendSummary {
  workspacesReported: number;
  sessionsUploaded: number;
  messagesUploaded: number;
  documentsUploaded: number;
  skippedSessions: number;
  notes: string[];
}

/** Duration in milliseconds; invalid timestamps fall back to 0 instead of NaN. */
function durationMs(startedAt: string, endedAt: string): number {
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt);
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : 0;
}

/**
 * One sending pass: report workspaces, stream each configured session source,
 * then upload declared documents. Per-IDE differences live in
 * `sessions/sources.ts`, so this loop is the same for every IDE.
 */
export async function sendOnce(config: WorklogConfig, state: WorklogState, api: WorklogApi): Promise<SendSummary> {
  const summary: SendSummary = {
    workspacesReported: 0,
    sessionsUploaded: 0,
    messagesUploaded: 0,
    documentsUploaded: 0,
    skippedSessions: 0,
    notes: [],
  };

  await api.reportWorkspaces(config.workspaces);
  summary.workspacesReported = config.workspaces.length;

  // One poisoned session file must not block the rest of the machine's
  // reporting: failures are collected, every other file is still processed,
  // and the pass fails at the end so `status` keeps surfacing the error.
  const failures: string[] = [];

  for (const ide of Object.keys(SESSION_SOURCES) as IdeKey[]) {
    const directory = config.agentSessionDirectories[ide];
    if (!directory) continue;
    const source = SESSION_SOURCES[ide];

    for (const filePath of walkJsonl(directory)) {
      if (!source.accepts(filePath)) continue;
      try {
        const progress = state.files[filePath];
        const delta = source.readDelta(filePath, progress?.offset ?? 0, progress?.nextSeq ?? 0);

        if (delta.parsed.messages.length === 0) {
          state.files[filePath] = { ...(progress ?? emptyProgress()), offset: delta.nextOffset };
          continue;
        }

        const workspace = source.resolveWorkspace({
          filePath,
          directory,
          parsed: delta.parsed,
          workspaces: config.workspaces,
        });
        if (!workspace) {
          // Outside every declared workspace — advance the offset so it is not
          // re-read, upload nothing.
          summary.skippedSessions++;
          state.files[filePath] = { ...(progress ?? emptyProgress()), offset: delta.nextOffset };
          continue;
        }

        const externalSessionId = delta.parsed.externalSessionId || progress?.sessionId || filePath;
        const aggregate = mergeProgress(progress, delta.parsed.aggregate, { reset: delta.reset });
        const upload: UploadSession = {
          externalSessionId,
          workspaceKey: workspace.workspaceKey,
          source: source.provenance,
          model: aggregate.model,
          turnCount: aggregate.turnCount,
          messageCount: aggregate.messageCount,
          toolCallCount: aggregate.toolCallCount,
          toolNames: aggregate.toolNames,
          touchedFiles: aggregate.touchedFiles,
          durationMs: durationMs(aggregate.startedAt, aggregate.endedAt),
          startedAt: aggregate.startedAt,
          endedAt: aggregate.endedAt,
          messages: delta.parsed.messages,
        };

        await api.reportSessions([upload]);
        summary.sessionsUploaded++;
        summary.messagesUploaded += delta.parsed.messages.length;
        if (delta.reset) {
          summary.notes.push(`${filePath} was truncated or rotated — re-read from the beginning.`);
        }

        state.files[filePath] = {
          ...aggregate,
          sessionId: externalSessionId,
          offset: delta.nextOffset,
          nextSeq: delta.reset ? delta.parsed.messages.length : (progress?.nextSeq ?? 0) + delta.parsed.messages.length,
        };
      } catch (error) {
        failures.push(`${filePath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (source.note) summary.notes.push(source.note);
  }

  const documents = scanDocuments(config, state);
  if (documents.length > 0) {
    await api.reportDocuments(documents.map((item) => item.upload));
    for (const item of documents) {
      state.documents[item.filePath] = { hash: item.hash, workspaceKey: item.upload.workspaceKey };
    }
    summary.documentsUploaded = documents.length;
  }

  if (failures.length > 0) {
    throw new Error(
      `${failures.length} session file(s) could not be reported (progress kept, retried next run):\n${failures.join("\n")}`,
    );
  }

  return summary;
}
