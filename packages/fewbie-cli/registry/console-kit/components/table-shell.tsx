import type { ReactNode } from "react";

import { EmptyState } from "@/fewbie/framework/states/empty-state";
import { ErrorState } from "@/fewbie/framework/states/error-state";
import { LoadingState } from "@/fewbie/framework/states/loading-state";
import { cn } from "@/lib/utils";

/** Copy for the non-ready states. Loading and retry copy are optional. */
export interface TableShellLabels {
  loading?: string;
  emptyTitle: string;
  emptyDescription?: string;
  errorTitle: string;
  retry?: string;
}

export type TableShellState = "loading" | "error" | "empty" | "ready";

export interface TableShellProps {
  state: TableShellState;
  labels: TableShellLabels;
  /** Provider/transport message shown under the error title. */
  errorMessage?: string;
  onRetry?: () => void;
  className?: string;
  children?: ReactNode;
}

/**
 * Bordered table surface with the framework's loading/empty/error states wired
 * in, so a list page never re-implements them. `state: "ready"` renders the
 * caller's table; every other state replaces it.
 */
export function TableShell({ state, labels, errorMessage, onRetry, className, children }: TableShellProps) {
  if (state === "loading") return <LoadingState label={labels.loading} />;
  if (state === "error") {
    return (
      <ErrorState title={labels.errorTitle} description={errorMessage} retryLabel={labels.retry} onRetry={onRetry} />
    );
  }
  if (state === "empty") {
    return <EmptyState title={labels.emptyTitle} description={labels.emptyDescription} />;
  }

  return <div className={cn("overflow-x-auto rounded-lg border bg-card", className)}>{children}</div>;
}
