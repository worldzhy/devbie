/**
 * One audit-trail row as the host's backend returns it. The module renders these
 * fields verbatim; mapping from the host's own DTO happens inside its port.
 */
export interface AuditLogRecord {
  id: number;
  event: string;
  action: string;
  resourceType: string;
  resourceId: string;
  actorId?: string | null;
  /** Lowercase on the wire: `success` or `failure`. */
  result: "success" | "failure";
  /** ISO timestamp; the host supplies the formatter. */
  createdAt: string;
  detail?: unknown;
}

/** One page of records plus the total count behind it. */
export interface AuditLogPageResult {
  records: AuditLogRecord[];
  total: number;
}
