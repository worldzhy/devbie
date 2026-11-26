"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { newRequestId } from "./copilot-context";
import type { CopilotAgentEvent, CopilotConfirmationDecision, CopilotPageContext, CopilotPort } from "./types";
import { applyAgentEvent, createAssistantVM, type CopilotAssistantVM } from "./view-model";

export interface CopilotUserEntry {
  id: string;
  role: "user";
  text: string;
}

export interface CopilotAssistantEntry {
  id: string;
  role: "assistant";
  /** Immutable per-render snapshot of the stream draft. */
  vm: CopilotAssistantVM;
}

export type CopilotEntry = CopilotUserEntry | CopilotAssistantEntry;

export type CopilotBannerTone = "conflict" | "model" | "auth" | "error";

export type CopilotBannerTitleKey =
  | "tooLongTitle"
  | "unavailableTitle"
  | "confirmFailedTitle"
  | "noModelTitle"
  | "runInProgressTitle"
  | "conversationForbiddenTitle"
  | "requestFailedTitle";

export type CopilotBannerMessageKey =
  | "tooLongMessage"
  | "requestFailedBeforeResponse"
  | "decisionNotSent"
  | "noModelMessage"
  | "runInProgressMessage"
  | "conversationForbiddenMessage";

export type CopilotBanner = {
  tone: CopilotBannerTone;
  titleKey: CopilotBannerTitleKey;
  /** Server-supplied message rendered verbatim when no label applies. */
  rawMessage?: string;
} & (
  { messageKey?: Exclude<CopilotBannerMessageKey, "tooLongMessage"> } | { messageKey: "tooLongMessage"; limit: number }
);

export interface UseCopilotChat {
  entries: CopilotEntry[];
  stoppedIds: ReadonlySet<string>;
  running: boolean;
  /** confirmationId whose resolution call is currently in flight. */
  confirmingId: string | null;
  conversationId?: string;
  banner: CopilotBanner | null;
  send: (text: string) => void;
  stop: () => void;
  confirm: (confirmationId: string, decision: CopilotConfirmationDecision) => void;
  resetConversation: () => void;
  dismissBanner: () => void;
}

const MAX_MESSAGE_LENGTH = 4000;

/** Shallow-clone the draft so React state always sees a fresh snapshot. */
function snapshotVm(vm: CopilotAssistantVM): CopilotAssistantVM {
  return {
    ...vm,
    toolCalls: vm.toolCalls.map((toolCall) => ({
      ...toolCall,
      actions: [...toolCall.actions],
      blocks: [...toolCall.blocks],
      ...(toolCall.confirmation ? { confirmation: { ...toolCall.confirmation } } : {}),
    })),
  };
}

export interface UseCopilotChatOptions {
  port: CopilotPort;
  pageContext?: CopilotPageContext;
  /** Host-side hook for successful tool calls (e.g. invalidate a data query). */
  onToolFinished?: (name: string) => void;
}

export function useCopilotChat({ port, pageContext, onToolFinished }: UseCopilotChatOptions): UseCopilotChat {
  const [entries, setEntries] = useState<CopilotEntry[]>([]);
  const [stoppedIds, setStoppedIds] = useState<ReadonlySet<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [banner, setBanner] = useState<CopilotBanner | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const stoppedByUserRef = useRef(false);
  const conversationRef = useRef<string | undefined>(undefined);
  const pageContextRef = useRef(pageContext);
  useEffect(() => {
    pageContextRef.current = pageContext;
  }, [pageContext]);

  const send = useCallback(
    (rawText: string) => {
      const text = rawText.trim();
      if (!text) return;
      if (text.length > MAX_MESSAGE_LENGTH) {
        setBanner({
          tone: "error",
          titleKey: "tooLongTitle",
          messageKey: "tooLongMessage",
          limit: MAX_MESSAGE_LENGTH,
        });
        return;
      }
      if (abortRef.current) return; // a run is already in flight

      setBanner(null);
      const userEntry: CopilotUserEntry = { id: `u-${Date.now()}`, role: "user", text };
      const assistantId = `a-${Date.now()}`;
      const draft = createAssistantVM();
      setEntries((current) => [...current, userEntry, { id: assistantId, role: "assistant", vm: draft }]);
      setRunning(true);

      const controller = new AbortController();
      abortRef.current = controller;
      stoppedByUserRef.current = false;

      const publish = () => {
        setEntries((current) =>
          current.map((entry) =>
            entry.role === "assistant" && entry.id === assistantId ? { ...entry, vm: snapshotVm(draft) } : entry,
          ),
        );
      };

      const handleEvent = (event: CopilotAgentEvent) => {
        applyAgentEvent(draft, event);
        if (event.type === "run-started" && !conversationRef.current) {
          conversationRef.current = event.conversationId;
          setConversationId(event.conversationId);
        }
        if (event.type === "tool-finished" && event.status === "success") onToolFinished?.(event.name);
        publish();
      };

      port
        .send({
          message: text,
          requestId: newRequestId(),
          ...(conversationRef.current ? { conversationId: conversationRef.current } : {}),
          ...(pageContextRef.current ? { pageContext: pageContextRef.current } : {}),
          signal: controller.signal,
          onEvent: handleEvent,
        })
        .catch((error: unknown) => {
          if (stoppedByUserRef.current && isAbortError(error)) {
            setStoppedIds((current) => new Set(current).add(assistantId));
            publish();
            return;
          }
          const code = readErrorCode(error);
          // A dead session already redirects to login; a banner the user cannot
          // read before the reload is noise.
          if (code === "unauthorized") return;
          if (code) {
            setBanner(toBanner(code, error));
            return;
          }
          setBanner(
            error instanceof Error
              ? { tone: "error", titleKey: "unavailableTitle", rawMessage: error.message }
              : { tone: "error", titleKey: "unavailableTitle", messageKey: "requestFailedBeforeResponse" },
          );
        })
        .finally(() => {
          setRunning(false);
          setConfirmingId(null);
          abortRef.current = null;
        });
    },
    [port, onToolFinished],
  );

  const stop = useCallback(() => {
    if (!abortRef.current) return;
    stoppedByUserRef.current = true;
    abortRef.current.abort();
  }, []);

  const confirm = useCallback(
    (confirmationId: string, decision: CopilotConfirmationDecision) => {
      setConfirmingId(confirmationId);
      void port.confirm({ confirmationId, decision }).catch((error: unknown) => {
        setBanner(
          error instanceof Error
            ? { tone: "error", titleKey: "confirmFailedTitle", rawMessage: error.message }
            : { tone: "error", titleKey: "confirmFailedTitle", messageKey: "decisionNotSent" },
        );
        setConfirmingId(null);
      });
    },
    [port],
  );

  const resetConversation = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    stoppedByUserRef.current = false;
    conversationRef.current = undefined;
    setEntries([]);
    setStoppedIds(new Set());
    setConversationId(undefined);
    setBanner(null);
    setRunning(false);
    setConfirmingId(null);
  }, []);

  const dismissBanner = useCallback(() => setBanner(null), []);

  return {
    entries,
    stoppedIds,
    running,
    confirmingId,
    conversationId,
    banner,
    send,
    stop,
    confirm,
    resetConversation,
    dismissBanner,
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function readErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.length > 0) return code;
  }
  return undefined;
}

function toBanner(code: string, error: unknown): CopilotBanner {
  switch (code) {
    case "no_active_model":
      return { tone: "model", titleKey: "noModelTitle", messageKey: "noModelMessage" };
    case "run_in_progress":
      return { tone: "conflict", titleKey: "runInProgressTitle", messageKey: "runInProgressMessage" };
    case "conversation_forbidden":
      return {
        tone: "auth",
        titleKey: "conversationForbiddenTitle",
        messageKey: "conversationForbiddenMessage",
      };
    default:
      return {
        tone: "error",
        titleKey: "requestFailedTitle",
        rawMessage: error instanceof Error ? error.message : undefined,
      };
  }
}
