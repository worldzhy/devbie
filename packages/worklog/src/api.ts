import type { WorklogWorkspaceConfig } from "./config";
import type { NormalizedMessage } from "./sessions/types";

export interface UploadSession {
  externalSessionId: string;
  workspaceKey: string;
  /** Transcript origin: "claude" / "codex" (raw) or "trae-memory" (IDE summaries). */
  source: string;
  model: string;
  turnCount: number;
  messageCount: number;
  toolCallCount: number;
  toolNames: string[];
  touchedFiles: string[];
  durationMs: number;
  startedAt: string;
  endedAt: string;
  messages: NormalizedMessage[];
}

export interface UploadDocument {
  workspaceKey: string;
  title: string;
  refPath: string;
  content: string;
  capturedAt: string;
}

/** Hard caps mirrored from the server DTOs. */
const MAX_SESSIONS_PER_BATCH = 50;
const MAX_MESSAGES_PER_SESSION = 2_000;
const MAX_DOCUMENTS_PER_BATCH = 100;

/**
 * HTTP client for the server ingest endpoints. Bearer token only — the
 * server resolves it to exactly one member and rejects anything else.
 */
export class WorklogApi {
  constructor(
    private readonly endpoint: string,
    private readonly token: string,
  ) {}

  async reportWorkspaces(workspaces: WorklogWorkspaceConfig[]): Promise<void> {
    await this.post("/people/evidence/workspaces", {
      workspaces: workspaces.map((workspace) => ({
        workspaceKey: workspace.workspaceKey,
        rootPath: workspace.rootPath,
      })),
    });
  }

  async reportSessions(sessions: UploadSession[]): Promise<void> {
    for (let index = 0; index < sessions.length; index += MAX_SESSIONS_PER_BATCH) {
      const batch = sessions.slice(index, index + MAX_SESSIONS_PER_BATCH);
      await this.post("/people/evidence/sessions", {
        sessions: batch.map((session) => ({
          workspaceKey: session.workspaceKey,
          externalSessionId: session.externalSessionId,
          source: session.source,
          model: session.model,
          turnCount: session.turnCount,
          messageCount: session.messageCount,
          toolCallCount: session.toolCallCount,
          toolNames: session.toolNames,
          touchedFiles: session.touchedFiles,
          durationMs: session.durationMs,
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          messages: session.messages.slice(0, MAX_MESSAGES_PER_SESSION).map((message) => ({
            seq: message.seq,
            role: message.role,
            content: message.content,
            toolName: message.toolName,
            toolCalls: message.toolCalls,
            tokenCount: message.tokenCount,
            createdAt: message.createdAt,
          })),
        })),
      });
    }
  }

  async reportDocuments(documents: UploadDocument[]): Promise<void> {
    for (let index = 0; index < documents.length; index += MAX_DOCUMENTS_PER_BATCH) {
      const batch = documents.slice(index, index + MAX_DOCUMENTS_PER_BATCH);
      await this.post("/people/evidence/documents", {
        documents: batch.map((document) => ({
          workspaceKey: document.workspaceKey,
          title: document.title,
          refPath: document.refPath,
          content: document.content,
          capturedAt: document.capturedAt,
        })),
      });
    }
  }

  private async post(path: string, body: unknown): Promise<void> {
    const response = await fetch(`${this.endpoint}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`POST ${path} failed: ${response.status} ${text.slice(0, 500)}`);
    }
  }
}
