import type { LucideIcon } from "lucide-react";

/**
 * Every string the surfaces render. The host supplies translated copy, so the
 * item carries no vocabulary of its own. `{count}` / `{id}` / `{title}` are
 * replaced by `interpolate` from `format.ts`.
 */
export interface NotificationCenterLabels {
  bellLabel: string;
  markAllRead: string;
  loading: string;
  empty: string;
  viewAll: string;
  ariaLatestNotification: string;
  detailsLabel: string;
  selectPrompt: string;
  occurrencesCount: string;
  sourceLabel: string;
  detailLabel: string;
  openAlertCenter: string;
  openLinkedPage: string;
  occurrencesLabel: string;
  deliveryReasonLabel: string;
  deliveryReasonMissing: string;
  deliveryReasonSuppress: string;
  deliveryReasonDeliver: string;
  deliveryReasonRule: string;
  deliveryReasonNoMatch: string;
  contextLabel: string;
  severityCritical: string;
  severityHigh: string;
  severityMedium: string;
  severityLow: string;
  severityUnknown: string;
  badgeAlertRecovered: string;
  read: string;
  unread: string;
  pushFailedOne: string;
  pushFailedMany: string;
  greetingAllQuiet: string;
  greetingNothingToDo: string;
  greetingCaughtUp: string;
  greetingNoAlerts: string;
  greetingInboxZero: string;
}

/** One record as the host's API returns it, trimmed to what the surfaces read. */
export interface NotificationRecord {
  id: string;
  notificationKey: string;
  title: string;
  detail?: string | null;
  severity: string;
  /** Lifecycle status; `resolved` renders the recovered badge instead of severity. */
  status: string;
  read: boolean;
  link?: string | null;
  sourceType?: string | null;
  payload?: unknown;
  createdAt: string;
}

/** Host-owned mapping from a notification key to its copy and category. */
export interface NotificationMetaEntry {
  label: string;
  category?: string;
}

/** Icon and tint per host category; unknown categories fall back. */
export interface NotificationCategoryVisual {
  icon: LucideIcon;
  className: string;
}

/** Delivery decision recorded for one notification, fetched on expand. */
export interface NotificationDeliveryAttempt {
  decision: string;
  reason?: string | null;
  ruleId?: string | null;
  createdAt: string;
  /** Already-localized runtime interception reason, if the host resolves one. */
  runtimeReasonLabel?: string | null;
}

/** One unresolved push failure row. */
export interface NotificationPushFailure {
  id: string;
  recipientKey: string;
  notificationTitle?: string | null;
  error: string;
  createdAt: string;
}

/**
 * Host-owned transport. The item never imports `fetch`, a router, a query
 * library or a toast library; polling, loading and error handling stay here.
 */
export interface NotificationCenterPort {
  fetchUnreadCount(): Promise<number>;
  fetchRecent(limit: number): Promise<NotificationRecord[]>;
  fetchUnread(limit: number): Promise<NotificationRecord[]>;
  markAllRead(): Promise<number>;
  markRead(id: string): Promise<void>;
  fetchDeliveryAttempt?(id: string): Promise<NotificationDeliveryAttempt | null>;
  fetchPushFailures?(): Promise<NotificationPushFailure[]>;
}

export interface NotificationCenterProps {
  labels: NotificationCenterLabels;
  port: NotificationCenterPort;
  /** Domain mapping: notification key -> translated label + host category. */
  resolveMeta: (notificationKey: string) => NotificationMetaEntry;
  categoryVisuals: Record<string, NotificationCategoryVisual>;
  fallbackVisual: NotificationCategoryVisual;
  /** Best-effort attribution line; the host owns which payload fields matter. */
  resolveSource?: (notification: NotificationRecord) => string | null;
  /** Host-owned navigation; the item never imports a router. */
  onNavigate: (path: string) => void;
  onOpenLink: (link: string) => void;
  /** Locale for relative time and timestamps; defaults to the browser locale. */
  locale?: string;
  notificationsPath?: string;
  alertCenterPath?: string;
  pollIntervalMs?: number;
  /** Called after a successful mark-all-read so the host can toast. */
  onMarkedRead?: (count: number) => void;
  /** Called when a transport call fails so the host can toast or log it. */
  onError?: (error: unknown) => void;
  className?: string;
}
