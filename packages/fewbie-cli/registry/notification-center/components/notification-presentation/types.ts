import type { LucideIcon } from "lucide-react";

/**
 * Every label the presentation surfaces render. Parameterized labels are
 * functions so the host adapter can apply ICU plural and interpolation rules.
 */
export interface NotificationPresentationLabels {
  detailsLabel: string;
  selectPrompt: string;
  occurrencesCount: (count: number) => string;
  occurrencesLabel: string;
  sourceLabel: string;
  detailLabel: string;
  contextLabel: string;
  openAlertCenter: string;
  openLinkedPage: string;
  deliveryReasonLabel: string;
  deliveryReasonMissing: string;
  deliveryReasonSuppress: string;
  deliveryReasonDeliver: string;
  deliveryReasonRule: string;
  deliveryReasonNoMatch: string;
  severityCritical: string;
  severityHigh: string;
  severityMedium: string;
  severityLow: string;
  severityUnknown: string;
  badgeAlertRecovered: string;
  read: string;
  unread: string;
  pushFailedOne: string;
  pushFailedMany: (count: number) => string;
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

/** Repeated alerts (same key, title and source on the same day) collapse into one row. */
export interface NotificationGroup {
  key: string;
  latest: NotificationRecord;
  records: NotificationRecord[];
  unreadIds: string[];
}

/**
 * Host-owned domain mapping and callbacks. Presentation never fetches: every
 * transport call enters through a callback, so the same surfaces render inside
 * the page feature and inside header widgets.
 */
export interface NotificationPresentationConfig {
  labels: NotificationPresentationLabels;
  /** Domain mapping: notification key -> translated label + host category. */
  resolveMeta: (notificationKey: string) => NotificationMetaEntry;
  categoryVisuals: Record<string, NotificationCategoryVisual>;
  fallbackVisual: NotificationCategoryVisual;
  /** Best-effort attribution line; the host owns which payload fields matter. */
  resolveSource?: (notification: NotificationRecord) => string | null;
  /** Localized recipient label for a push failure; host recipient keys stay host-owned. */
  resolvePushFailure?: (failure: NotificationPushFailure) => string;
  /** Locale for relative time and timestamps; defaults to the browser locale. */
  locale?: string;
  /** IANA display zone for absolute timestamps; defaults to the runtime zone. */
  timeZone?: string;
  alertCenterPath?: string;
  /** Host-owned navigation; the item never imports a router. */
  onNavigate?: (path: string) => void;
  onOpenLink?: (link: string) => void;
  /** Marks one notification read; the caller owns transport and list refresh. */
  onMarkRead?: (id: string) => Promise<void> | void;
  loadDeliveryAttempt?: (id: string) => Promise<NotificationDeliveryAttempt | null>;
  /** Called when a host callback fails so the host can toast or log it. */
  onError?: (error: unknown) => void;
}
