"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import PageShell from "@/fewbie/framework/page/page-shell";
import { PaginationBar } from "@/fewbie/modules/console-kit/components/pagination-bar";
import { TableShell, type TableShellState } from "@/fewbie/modules/console-kit/components/table-shell";

import { auditLogQueryKey, DEFAULT_AUDIT_LOG_PAGE_SIZE, normalizeAuditLogQuery } from "../../lib/audit-query";
import type { AuditLogPageResult, AuditLogRecord } from "../../lib/types";
import { AuditTable } from "./audit-table";
import { DetailDialog } from "./detail-dialog";
import { FilterBar } from "./filter-bar";
import type { AuditLogProps, AuditLogQuery } from "./types";

/**
 * Audit-trail page body: a nine-filter form, one page of records, a detail
 * dialog and server-side pagination. Routing, permission gating and transport
 * stay in the host; the module renders only what its port returns.
 */
export function AuditLogPage(props: AuditLogProps) {
  const { labels, port, formatTime, initialQuery, onQueryChange, onError } = props;
  const pageSize = props.pageSize ?? DEFAULT_AUDIT_LOG_PAGE_SIZE;
  const [query, setQuery] = useState(() => normalizeAuditLogQuery(initialQuery, pageSize));
  const [selected, setSelected] = useState<AuditLogRecord | null>(null);

  const result = useQuery<AuditLogPageResult, unknown>({
    queryKey: auditLogQueryKey(query),
    queryFn: () => port.fetchPage(query),
    placeholderData: keepPreviousData,
  });

  // The host may rebuild its callbacks on every render; only a new request or a
  // new error should reach them.
  const callbacks = useRef({ onQueryChange, onError });
  useEffect(() => {
    callbacks.current = { onQueryChange, onError };
  });

  useEffect(() => {
    callbacks.current.onQueryChange?.(query);
  }, [query]);

  const reportedError = useRef<unknown>(null);
  useEffect(() => {
    if (result.error !== null && result.error !== reportedError.current) {
      reportedError.current = result.error;
      callbacks.current.onError?.(result.error);
    }
  }, [result.error]);

  const records = result.data?.records ?? [];
  const total = result.data?.total ?? 0;
  const state: TableShellState = result.isPending
    ? "loading"
    : result.isError
      ? "error"
      : records.length === 0
        ? "empty"
        : "ready";
  const errorMessage = result.error instanceof Error ? result.error.message : undefined;

  const applyFilters = (filters: Partial<AuditLogQuery>) => {
    // Merging keeps the page size; a filter change always starts over at page 0.
    setQuery((current) => normalizeAuditLogQuery({ ...current, ...filters, page: 0 }, pageSize));
  };
  const resetFilters = () => setQuery(normalizeAuditLogQuery(undefined, pageSize));
  const changePage = (page: number) => setQuery((current) => ({ ...current, page }));

  return (
    <PageShell title={labels.title} subtitle={labels.subtitle}>
      <div className="space-y-4">
        <FilterBar labels={labels} value={query} onApply={applyFilters} onReset={resetFilters} />
        <TableShell
          state={state}
          labels={{
            loading: labels.loading,
            emptyTitle: labels.emptyTitle,
            emptyDescription: labels.emptyDescription,
            errorTitle: labels.errorTitle,
            retry: labels.retry,
          }}
          errorMessage={errorMessage}
          onRetry={() => void result.refetch()}
        >
          <AuditTable labels={labels} records={records} formatTime={formatTime} onViewDetail={setSelected} />
        </TableShell>
        <PaginationBar
          page={query.page}
          pageSize={query.pageSize}
          total={total}
          onPageChange={changePage}
          labels={{
            previous: labels.previous,
            next: labels.next,
            pageOf: labels.pageOf,
            recordCount: labels.recordCount,
          }}
        />
        <DetailDialog
          labels={labels}
          record={selected}
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
        />
      </div>
    </PageShell>
  );
}
