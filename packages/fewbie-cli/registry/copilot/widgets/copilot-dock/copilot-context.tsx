"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { CopilotChartView, CopilotLabels } from "./types";

export interface CopilotRuntime {
  labels: CopilotLabels;
  locale: string;
  renderChart?: (view: CopilotChartView) => ReactNode;
  /** Host-side link opening, including same-origin/external checks. */
  onOpenLink: (href: string) => void;
}

const CopilotContext = createContext<CopilotRuntime | null>(null);

export function CopilotProvider({ value, children }: { value: CopilotRuntime; children: ReactNode }) {
  return <CopilotContext.Provider value={value}>{children}</CopilotContext.Provider>;
}

export function useCopilotRuntime(): CopilotRuntime {
  const value = useContext(CopilotContext);
  if (!value) throw new Error("Copilot surfaces must render inside <CopilotProvider>.");
  return value;
}

/** Client-generated request id with a fallback for non-secure contexts. */
export function newRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const WORD_OVERRIDES: Record<string, string> = { aws: "AWS" };

/** Humanizes a snake_case skill name, e.g. list_aws_accounts -> List AWS Accounts. */
export function skillDisplayName(name: string): string {
  return name
    .split("_")
    .map((word) => WORD_OVERRIDES[word] ?? word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function prettifyCode(code: string): string {
  return code
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
