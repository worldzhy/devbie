/** One audit-log page request; an absent filter means "no constraint". */
export interface AuditLogQuery {
  page: number;
  pageSize: number;
  keyword?: string;
  event?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  actorId?: string;
  result?: "" | "success" | "failure";
  /** Raw `datetime-local` value; ISO conversion is the port's job. */
  startTime?: string;
  /** Raw `datetime-local` value; ISO conversion is the port's job. */
  endTime?: string;
}

/** Rows per page unless the host asks for a different page size. */
export const DEFAULT_AUDIT_LOG_PAGE_SIZE = 20;

const TEXT_FILTERS = [
  "keyword",
  "event",
  "action",
  "resourceType",
  "resourceId",
  "actorId",
  "startTime",
  "endTime",
] as const;

/**
 * TanStack key for one page request. The module namespace keeps this cache apart
 * from the host's own queries.
 */
export function auditLogQueryKey(query: AuditLogQuery) {
  return ["modules", "console-audit-log", "page", query] as const;
}

/**
 * Trim the filters, drop the blank ones and clamp the page, so the port and the
 * cache both see one canonical request shape.
 */
export function normalizeAuditLogQuery(
  query: Partial<AuditLogQuery> | undefined,
  pageSize: number = DEFAULT_AUDIT_LOG_PAGE_SIZE,
): AuditLogQuery {
  const next: AuditLogQuery = { page: Math.max(0, Math.trunc(query?.page ?? 0)), pageSize };

  for (const key of TEXT_FILTERS) {
    const value = query?.[key]?.trim();
    if (value) next[key] = value;
  }

  if (query?.result === "success" || query?.result === "failure") {
    next.result = query.result;
  }

  return next;
}
