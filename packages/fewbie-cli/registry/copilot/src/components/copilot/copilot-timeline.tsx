"use client";

import { AlertTriangle, Ban } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { interpolate, prettifyCode, useCopilotRuntime } from "./copilot-context";
import { CopilotToolCard } from "./copilot-tool-card";
import type { CopilotConfirmationDecision, CopilotSkillCatalogEntry } from "./types";
import type { CopilotEntry } from "./use-copilot-chat";

export interface CopilotTimelineProps {
  entries: CopilotEntry[];
  catalog: CopilotSkillCatalogEntry[] | undefined;
  stoppedIds: ReadonlySet<string>;
  confirmingId: string | null;
  onConfirm: (confirmationId: string, decision: CopilotConfirmationDecision) => void;
}

export function CopilotTimeline({ entries, catalog, stoppedIds, confirmingId, onConfirm }: CopilotTimelineProps) {
  const kindByName = new Map(catalog?.map((skill) => [skill.name, skill]));

  return (
    <div className="flex flex-col gap-4">
      {entries.map((entry) =>
        entry.role === "user" ? (
          <div key={entry.id} className="flex justify-end">
            <p className="max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm whitespace-pre-wrap text-primary-foreground">
              {entry.text}
            </p>
          </div>
        ) : (
          <AssistantTurn
            key={entry.id}
            entry={entry}
            kindByName={kindByName}
            stopped={stoppedIds.has(entry.id)}
            confirmingId={confirmingId}
            onConfirm={onConfirm}
          />
        ),
      )}
    </div>
  );
}

function AssistantTurn({
  entry,
  kindByName,
  stopped,
  confirmingId,
  onConfirm,
}: {
  entry: Extract<CopilotEntry, { role: "assistant" }>;
  kindByName: Map<string, CopilotSkillCatalogEntry>;
  stopped: boolean;
  confirmingId: string | null;
  onConfirm: (confirmationId: string, decision: CopilotConfirmationDecision) => void;
}) {
  const { labels } = useCopilotRuntime();
  const { vm } = entry;
  const toolRunning = vm.toolCalls.some((toolCall) => toolCall.status === "running");
  const showWaiting = vm.status === "streaming" && !stopped && vm.text === "" && vm.toolCalls.length === 0;
  const showCaret = vm.status === "streaming" && !stopped && vm.text !== "";
  const showQuerying = vm.status === "streaming" && !stopped && toolRunning;
  const showAnalyzing =
    vm.status === "streaming" && !stopped && !toolRunning && vm.text !== "" && vm.toolCalls.length > 0;

  return (
    <div className="flex flex-col gap-2">
      {vm.toolCalls.map((toolCall) => {
        const skill = kindByName.get(toolCall.name);
        return (
          <CopilotToolCard
            key={toolCall.id}
            toolCall={toolCall}
            kind={skill?.resultHint.kind}
            kindDescription={skill?.resultHint.description}
            confirming={
              toolCall.confirmation?.state === "waiting" && confirmingId === toolCall.confirmation.confirmationId
            }
            onConfirm={onConfirm}
          />
        );
      })}

      {vm.text ? (
        <p className="text-sm break-words whitespace-pre-wrap text-foreground">
          {vm.text}
          {showCaret ? <span className="ml-0.5 inline-block animate-pulse text-primary">{"\u258C"}</span> : null}
        </p>
      ) : null}

      {showWaiting ? <p className="text-xs text-muted-foreground">{labels.thinking}</p> : null}
      {showQuerying ? <p className="text-xs text-muted-foreground">{labels.querying}</p> : null}
      {showAnalyzing ? <p className="text-xs text-muted-foreground">{labels.analyzing}</p> : null}

      {vm.status === "error" ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <div>
            <p className="font-medium">{vm.errorCode ? prettifyCode(vm.errorCode) : labels.failed}</p>
            {vm.errorMessage ? <p className="mt-0.5 text-destructive/90">{vm.errorMessage}</p> : null}
          </div>
        </div>
      ) : null}

      {stopped ? (
        <Badge variant="outline" className="w-fit gap-1 text-muted-foreground">
          <Ban className="size-3" />
          {labels.stopped}
        </Badge>
      ) : null}

      {vm.status === "done" && vm.usage ? (
        <p className="text-[10px] text-muted-foreground/70">
          {vm.steps ? `${interpolate(labels.steps, { count: vm.steps })} · ` : ""}
          {interpolate(labels.tokens, { count: vm.usage.totalTokens })}
        </p>
      ) : null}
    </div>
  );
}
