import type { WorklogConfig, IdeKey } from "./config";
import { scanDocuments } from "./documents";
import { walkJsonl } from "./jsonl-files";
import { emptyProgress, mergeProgress } from "./state";
import type { WorklogState } from "./state";
import { SESSION_SOURCES } from "./sessions/sources";
import { WorklogApi, UploadDocument, UploadSession } from "./api";

export interface SendSummary {
  workspacesReported: number;
  sessionsUploaded: number;
  messagesUploaded: number;
  documentsUploaded: number;
  skippedSessions: number;
  notes: string[];
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

  for (const ide of Object.keys(SESSION_SOURCES) as IdeKey[]) {
    const directory = config.agentSessionDirectories[ide];
    if (!directory) continue;
    const source = SESSION_SOURCES[ide];

    for (const filePath of walkJsonl(directory)) {
      if (!source.accepts(filePath)) continue;
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
      const aggregate = mergeProgress(progress, delta.parsed.aggregate);
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
        durationMs: Math.max(0, new Date(aggregate.endedAt).getTime() - new Date(aggregate.startedAt).getTime()),
        startedAt: aggregate.startedAt,
        endedAt: aggregate.endedAt,
        messages: delta.parsed.messages,
      };

      await api.reportSessions([upload]);
      summary.sessionsUploaded++;
      summary.messagesUploaded += delta.parsed.messages.length;

      state.files[filePath] = {
        ...aggregate,
        sessionId: externalSessionId,
        offset: delta.nextOffset,
        nextSeq: (progress?.nextSeq ?? 0) + delta.parsed.messages.length,
      };
    }

    if (source.note) summary.notes.push(source.note);
  }

  const documents: UploadDocument[] = scanDocuments(config, state);
  if (documents.length > 0) {
    await api.reportDocuments(documents);
    summary.documentsUploaded = documents.length;
  }

  return summary;
}
