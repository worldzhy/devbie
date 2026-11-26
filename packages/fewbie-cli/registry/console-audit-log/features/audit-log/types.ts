import type { AuditLogQuery } from "../../lib/audit-query";
import type { AuditLogPageResult, AuditLogRecord } from "../../lib/types";

export type { AuditLogPageResult, AuditLogQuery, AuditLogRecord };

/**
 * Every string the page renders. The host supplies translated copy through its
 * i18n adapter, so the module owns no user-facing text of its own.
 */
export interface AuditLogLabels {
  title: string;
  subtitle: string;
  filterKeyword: string;
  filterKeywordPlaceholder: string;
  filterEvent: string;
  filterEventPlaceholder: string;
  filterAction: string;
  filterActionPlaceholder: string;
  filterResourceType: string;
  filterResourceTypePlaceholder: string;
  filterResourceId: string;
  filterResourceIdPlaceholder: string;
  filterActorId: string;
  filterActorIdPlaceholder: string;
  filterResult: string;
  /** Raw `datetime-local` lower bound. */
  filterStartTime: string;
  /** Raw `datetime-local` upper bound. */
  filterEndTime: string;
  apply: string;
  reset: string;
  loading: string;
  emptyTitle: string;
  emptyDescription: string;
  errorTitle: string;
  retry: string;
  colTime: string;
  colActor: string;
  colEvent: string;
  colAction: string;
  colResourceType: string;
  colResourceId: string;
  colResult: string;
  colDetail: string;
  resultAll: string;
  resultSuccess: string;
  resultFailure: string;
  viewDetail: string;
  detailTitle: string;
  /** Shown when the record carries no `detail` payload. */
  detailEmpty: string;
  close: string;
  previous: string;
  next: string;
  /** 1-based page summary, e.g. `Page 2 of 7`. */
  pageOf: (page: number, totalPages: number) => string;
  /** 1-based record summary, e.g. `128 records`. */
  recordCount: (total: number) => string;
}

/**
 * Host-owned transport for one page of the trail. The module never imports the
 * host's fetch client, router or query keys; errors surface through `onError`.
 */
export interface AuditLogPort {
  fetchPage(query: AuditLogQuery): Promise<AuditLogPageResult>;
}

export interface AuditLogProps {
  labels: AuditLogLabels;
  port: AuditLogPort;
  /** Formats an ISO timestamp in the host's locale and time zone. */
  formatTime: (iso: string) => string;
  /** Seeds the first request, e.g. from the URL's search params. */
  initialQuery?: Partial<AuditLogQuery>;
  /** Called whenever the request changes, so the host can mirror it into the URL. */
  onQueryChange?: (query: AuditLogQuery) => void;
  /** Called once per new transport error so the host can toast or log it. */
  onError?: (error: unknown) => void;
  /** Rows per page; defaults to 20. */
  pageSize?: number;
}
