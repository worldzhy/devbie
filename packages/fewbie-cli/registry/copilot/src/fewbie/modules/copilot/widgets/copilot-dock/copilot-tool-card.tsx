"use client";

import { AlertTriangle, Ban, BarChart3, CheckCircle2, FileText, List, LoaderCircle, Lock } from "lucide-react";
import { Badge } from "@/fewbie/ui/badge";
import { Button } from "@/fewbie/ui/button";
import { CopilotBlocks } from "./copilot-blocks";
import { useCopilotRuntime } from "./copilot-context";
import type { CopilotConfirmationDecision, CopilotResultKind } from "./types";
import type { CopilotToolCallVM } from "./view-model";

const KIND_META: Record<
  CopilotResultKind,
  { icon: typeof List; labelKey: "listResult" | "detailResult" | "statistics" }
> = {
  list: { icon: List, labelKey: "listResult" },
  detail: { icon: FileText, labelKey: "detailResult" },
  stats: { icon: BarChart3, labelKey: "statistics" },
};

export interface CopilotToolCardProps {
  toolCall: CopilotToolCallVM;
  kind?: CopilotResultKind;
  kindDescription?: string;
  /** True while the confirmation call is in flight. */
  confirming?: boolean;
  onConfirm?: (confirmationId: string, decision: CopilotConfirmationDecision) => void;
}

export function CopilotToolCard({ toolCall, kind, kindDescription, confirming, onConfirm }: CopilotToolCardProps) {
  const { labels, onOpenLink } = useCopilotRuntime();
  const KindIcon = kind ? KIND_META[kind].icon : null;
  const confirmation = toolCall.confirmation;
  const waiting = confirmation?.state === "waiting";
  const isRunning = toolCall.status === "running";
  const isError = toolCall.status === "error";
  const isDenied = toolCall.status === "denied";

  return (
    <div
      className={
        waiting
          ? "rounded-md border border-warning/50 bg-warning/5 p-2.5"
          : "rounded-md border border-border bg-muted/30 p-2.5"
      }
    >
      <div className="flex items-center gap-2">
        {waiting ? (
          <Lock className="size-3.5 shrink-0 text-warning" />
        ) : isRunning ? (
          <LoaderCircle className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : isError ? (
          <AlertTriangle className="size-3.5 shrink-0 text-destructive" />
        ) : isDenied ? (
          <Ban className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <CheckCircle2 className="size-3.5 shrink-0 text-primary" />
        )}
        <span className="font-mono text-xs font-medium">{toolCall.name}</span>
        <Badge variant="outline" className="ml-auto text-muted-foreground">
          {waiting
            ? labels.statusAwaitingApproval
            : isRunning
              ? labels.statusRunning
              : toolCall.status === "success"
                ? labels.statusSuccess
                : toolCall.status === "error"
                  ? labels.statusError
                  : labels.statusDenied}
        </Badge>
      </div>

      {waiting && confirmation ? (
        <div data-testid="copilot-confirm-card" className="mt-2">
          <p className="text-xs font-medium">{labels.approvalRequired}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{labels.approvalBody}</p>
          <pre
            data-testid="copilot-confirm-args"
            className="mt-2 max-h-48 overflow-auto rounded border border-border bg-background p-2 font-mono text-[10px] text-muted-foreground"
          >
            {safeFormatJson(confirmation.arguments)}
          </pre>
          <div className="mt-2 flex gap-2">
            <Button
              size="xs"
              disabled={confirming}
              onClick={() => onConfirm?.(confirmation.confirmationId, "confirmed")}
            >
              {confirming ? <LoaderCircle className="size-3 animate-spin" /> : null}
              {labels.confirm}
            </Button>
            <Button
              variant="outline"
              size="xs"
              disabled={confirming}
              onClick={() => onConfirm?.(confirmation.confirmationId, "denied")}
            >
              {labels.cancel}
            </Button>
          </div>
        </div>
      ) : null}

      {!waiting && isRunning && toolCall.inputSummary ? (
        <p className="mt-1.5 truncate font-mono text-[11px] text-muted-foreground">{toolCall.inputSummary}</p>
      ) : null}

      {confirmation?.state === "confirmed" && isRunning ? (
        <p className="mt-1.5 text-[11px] text-muted-foreground">{labels.approvedExecuting}</p>
      ) : null}

      {toolCall.blocks.length > 0 ? <CopilotBlocks blocks={toolCall.blocks} /> : null}

      {!isRunning && toolCall.summary ? (
        <p className="mt-1.5 text-xs whitespace-pre-wrap text-muted-foreground">{toolCall.summary}</p>
      ) : null}

      {kind && !isError && !isDenied ? (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {KindIcon ? <KindIcon className="size-3" /> : null}
          <span>{labels[KIND_META[kind].labelKey]}</span>
          {kindDescription ? <span className="truncate">&middot; {kindDescription}</span> : null}
        </div>
      ) : null}

      {toolCall.actions.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {toolCall.actions.map((action) => (
            <Button
              key={`${action.href}-${action.label}`}
              variant="outline"
              size="xs"
              onClick={() => onOpenLink(action.href)}
            >
              {action.label}
            </Button>
          ))}
        </div>
      ) : null}

      {!isRunning && typeof toolCall.durationMs === "number" ? (
        <p className="mt-1.5 text-[10px] text-muted-foreground/70">
          {toolCall.durationMs} {"ms"}
        </p>
      ) : null}
    </div>
  );
}

function safeFormatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
