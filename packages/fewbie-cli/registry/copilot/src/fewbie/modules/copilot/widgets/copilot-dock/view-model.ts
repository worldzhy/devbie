import type { CopilotAgentEvent, CopilotConfirmationState, CopilotLinkAction, CopilotSkillBlock } from "./types";

/**
 * Timeline view-model assembled from the neutral event stream. Text deltas are
 * concatenated, tool calls transition running -> success/error/denied, write
 * confirmations move waiting -> confirmed/denied/expired, and action links
 * attach to the tool call that produced them.
 */

export interface CopilotConfirmationVM {
  confirmationId: string;
  /** Full validated, server-redacted arguments for the approval card. */
  arguments: unknown;
  state: CopilotConfirmationState;
}

export interface CopilotToolCallVM {
  id: string;
  name: string;
  status: "running" | "success" | "error" | "denied";
  inputSummary: string;
  summary?: string;
  durationMs?: number;
  actions: CopilotLinkAction[];
  blocks: CopilotSkillBlock[];
  confirmation?: CopilotConfirmationVM;
}

export type CopilotRunStatus = "streaming" | "done" | "error";

export interface CopilotAssistantVM {
  requestId?: string;
  conversationId?: string;
  modelId?: string;
  status: CopilotRunStatus;
  text: string;
  toolCalls: CopilotToolCallVM[];
  steps?: number;
  finishReason?: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  errorCode?: string;
  errorMessage?: string;
  aborted?: boolean;
}

export function createAssistantVM(): CopilotAssistantVM {
  return { status: "streaming", text: "", toolCalls: [] };
}

/** Fold one protocol event into the assistant draft. */
export function applyAgentEvent(vm: CopilotAssistantVM, event: CopilotAgentEvent): CopilotAssistantVM {
  switch (event.type) {
    case "run-started":
      vm.requestId = event.requestId;
      vm.conversationId = event.conversationId;
      vm.modelId = event.modelId;
      break;
    case "text-delta":
      vm.text += event.text;
      break;
    case "tool-started":
      vm.toolCalls.push({
        id: event.toolCallId,
        name: event.name,
        status: "running",
        inputSummary: event.inputSummary,
        actions: [],
        blocks: [],
      });
      break;
    case "tool-finished": {
      const toolCall = findOrCreateToolCall(vm, event.toolCallId, event.name);
      toolCall.status = event.status;
      toolCall.summary = event.summary;
      toolCall.durationMs = event.durationMs;
      if (event.blocks) toolCall.blocks = event.blocks;
      break;
    }
    case "confirm-required": {
      const toolCall = findOrCreateToolCall(vm, event.toolCallId, event.name);
      toolCall.confirmation = {
        confirmationId: event.confirmationId,
        arguments: event.arguments,
        state: "waiting",
      };
      break;
    }
    case "confirm-resolved": {
      const toolCall =
        vm.toolCalls.find((candidate) => candidate.id === event.toolCallId) ??
        vm.toolCalls.find((candidate) => candidate.confirmation?.confirmationId === event.confirmationId);
      if (toolCall?.confirmation) {
        toolCall.confirmation.state =
          event.decision === "confirmed" ? "confirmed" : event.reason === "timeout" ? "expired" : "denied";
      }
      break;
    }
    case "action": {
      const toolCall =
        vm.toolCalls.find((candidate) => candidate.id === event.toolCallId) ?? vm.toolCalls[vm.toolCalls.length - 1];
      if (toolCall) toolCall.actions.push(event.action);
      break;
    }
    case "run-finished":
      vm.status = "done";
      vm.steps = event.steps;
      vm.finishReason = event.finishReason;
      if (event.usage) vm.usage = event.usage;
      break;
    case "failed":
      vm.status = "error";
      vm.errorCode = event.code;
      vm.errorMessage = event.message;
      vm.aborted = Boolean(event.aborted);
      break;
  }
  return vm;
}

/** Every navigation action in run order, handy for footer action chips. */
export function collectActions(vm: CopilotAssistantVM): CopilotLinkAction[] {
  return vm.toolCalls.flatMap((toolCall) => toolCall.actions);
}

function findOrCreateToolCall(vm: CopilotAssistantVM, id: string, name: string): CopilotToolCallVM {
  const existing = vm.toolCalls.find((candidate) => candidate.id === id);
  if (existing) return existing;
  const created: CopilotToolCallVM = { id, name, status: "running", inputSummary: "", actions: [], blocks: [] };
  vm.toolCalls.push(created);
  return created;
}
