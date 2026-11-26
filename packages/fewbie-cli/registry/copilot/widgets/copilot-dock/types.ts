import type { ReactNode } from "react";

/**
 * Copy for every surface. The host translates; the item owns no language and
 * no product vocabulary. Parameterized labels are functions so host adapters
 * can apply ICU plural and interpolation rules.
 */
export interface CopilotLabels {
  title: string;
  resizeAria: string;
  context: (label: string) => string;
  manageModelsAria: string;
  manageModels: string;
  newConversationAria: string;
  newConversation: string;
  placeholderRunning: string;
  placeholderIdle: string;
  stopAria: string;
  sendAria: string;
  disclaimer: string;
  disclaimerShortcuts: string;
  suggestAria: string;
  suggestOnPage: (label: string) => string;
  suggestGeneric: string;
  confirm: string;
  cancel: string;
  configureModel: string;
  dismiss: string;
  tooLongTitle: string;
  tooLongMessage: (limit: number) => string;
  unavailableTitle: string;
  confirmFailedTitle: string;
  noModelTitle: string;
  runInProgressTitle: string;
  conversationForbiddenTitle: string;
  requestFailedTitle: string;
  requestFailedBeforeResponse: string;
  decisionNotSent: string;
  noModelMessage: string;
  runInProgressMessage: string;
  conversationForbiddenMessage: string;
  emptyIntro: string;
  loadingCapabilities: string;
  availableOnPage: string;
  otherCapabilities: string;
  aboutSkill: (name: string) => string;
  thinking: string;
  querying: string;
  analyzing: string;
  failed: string;
  stopped: string;
  steps: (count: number) => string;
  tokens: (count: number) => string;
  statusAwaitingApproval: string;
  statusRunning: string;
  statusSuccess: string;
  statusError: string;
  statusDenied: string;
  approvalRequired: string;
  approvalBody: string;
  approvedExecuting: string;
  listResult: string;
  detailResult: string;
  statistics: string;
  noData: string;
  dataTruncated: string;
  rowsCount: (count: number) => string;
  showingRows: (shown: number, total: number) => string;
  viewQuery: string;
  queryTruncated: string;
}

// ---------------------------------------------------------------------------
// Neutral agent event protocol (v1). This is the item's input contract; the
// host adapts its transport (SSE, WebSocket, ...) to it. Structurally identical
// to the backend protocol, so it is a serialization, not a second protocol.
// ---------------------------------------------------------------------------

export const COPILOT_PROTOCOL_VERSION = 1 as const;

export interface CopilotLinkAction {
  type: "link";
  label: string;
  href: string;
}

export type CopilotToolStatus = "running" | "success" | "error" | "denied";
export type CopilotConfirmationState = "waiting" | "confirmed" | "denied" | "expired";
export type CopilotConfirmationDecision = "confirmed" | "denied";

export interface CopilotChartDataset {
  label: string;
  data: number[];
}

export interface CopilotChartBlock {
  kind: "chart";
  chartType: "line" | "bar" | "pie" | "doughnut";
  title: string;
  labels: string[];
  datasets: CopilotChartDataset[];
  truncated?: boolean;
}

export interface CopilotTableColumn {
  field: string;
  header: string;
  width?: number;
  formatHint?: "ms" | "pct";
}

export interface CopilotTableBlock {
  kind: "table";
  title: string;
  columns: CopilotTableColumn[];
  rows: Array<Record<string, unknown>>;
  totalRows: number;
  truncated?: boolean;
}

export interface CopilotQueryBlock {
  kind: "query";
  templateId: string;
  title: string;
  sql: string;
  truncated?: boolean;
}

export interface CopilotErrorBlock {
  kind: "error";
  title: string;
  message: string;
  truncated?: boolean;
}

export type CopilotSkillBlock = CopilotChartBlock | CopilotTableBlock | CopilotQueryBlock | CopilotErrorBlock;

export type CopilotAgentEvent =
  | {
      v: 1;
      type: "run-started";
      requestId: string;
      conversationId: string;
      modelId: string;
      skills: string[];
    }
  | { v: 1; type: "text-delta"; text: string }
  | { v: 1; type: "tool-started"; toolCallId: string; name: string; inputSummary: string }
  | {
      v: 1;
      type: "tool-finished";
      toolCallId: string;
      name: string;
      status: "success" | "error" | "denied";
      summary: string;
      durationMs: number;
      blocks?: CopilotSkillBlock[];
    }
  | {
      v: 1;
      type: "confirm-required";
      confirmationId: string;
      toolCallId: string;
      name: string;
      arguments: unknown;
    }
  | {
      v: 1;
      type: "confirm-resolved";
      confirmationId: string;
      toolCallId: string;
      name: string;
      decision: CopilotConfirmationDecision;
      reason: "user" | "timeout" | "aborted";
    }
  | { v: 1; type: "action"; toolCallId: string; source: string; action: CopilotLinkAction }
  | {
      v: 1;
      type: "run-finished";
      requestId: string;
      steps: number;
      finishReason: "stop" | "tool-calls" | "length" | "error" | "other";
      usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
    }
  | {
      v: 1;
      type: "failed";
      requestId: string;
      code: string;
      message: string;
      aborted?: boolean;
    };

export type CopilotResultKind = "list" | "detail" | "stats";

export interface CopilotSkillCatalogEntry {
  name: string;
  description: string;
  resultHint: { kind: CopilotResultKind; description: string };
  pages?: string[];
  relevant: boolean;
}

export interface CopilotRecommendedPrompt {
  label: string;
  prompt: string;
}

export interface CopilotSkillsCatalog {
  v: number;
  skills: CopilotSkillCatalogEntry[];
  recommendedPrompts: CopilotRecommendedPrompt[];
}

/** Host-computed page scope; the item only forwards it to the port. */
export interface CopilotPageContext {
  route?: string;
  params?: Record<string, string>;
}

export interface CopilotSendInput {
  message: string;
  requestId: string;
  conversationId?: string;
  pageContext?: CopilotPageContext;
  signal: AbortSignal;
  onEvent: (event: CopilotAgentEvent) => void;
}

/** Errors thrown by the port may carry the protocol's `code`. */
export interface CopilotPortError extends Error {
  code?: string;
}

/**
 * Host-owned transport. Streaming, authentication, request ids and model
 * selection stay in the host; the item only folds protocol events into a view.
 */
export interface CopilotPort {
  send(input: CopilotSendInput): Promise<void>;
  confirm(input: { confirmationId: string; decision: CopilotConfirmationDecision }): Promise<void>;
  fetchCatalog(route?: string): Promise<CopilotSkillsCatalog>;
}

/** Props handed to the host's chart renderer. */
export interface CopilotChartView {
  chartType: CopilotChartBlock["chartType"];
  labels: string[];
  datasets: CopilotChartDataset[];
  className: string;
}

export interface CopilotDockProps {
  labels: CopilotLabels;
  port: CopilotPort;
  open: boolean;
  onClose: () => void;
  /** Translated name of the current page scope. */
  contextLabel?: string;
  pageContext?: CopilotPageContext;
  /** Cache key for the skill catalog; defaults to `pageContext.route`. */
  catalogKey?: string;
  /** Renders the settings button when present. */
  settingsHref?: string;
  canManageModels?: boolean;
  /** Optional model indicator (name + health dot), owned by the host. */
  modelBadge?: ReactNode;
  renderChart?: (view: CopilotChartView) => ReactNode;
  /** Slot above the capability list, e.g. a host-specific snapshot card. */
  emptyStateExtra?: ReactNode;
  /** Host-side navigation and safety checks; the item never imports a router. */
  onOpenLink: (href: string) => void;
  onNavigate?: (href: string) => void;
  /** Called after a tool call succeeds so the host can refresh affected data. */
  onToolFinished?: (name: string) => void;
  locale?: string;
  minWidth?: number;
  maxWidth?: number;
  defaultWidth?: number;
  storageKey?: string;
  className?: string;
}
