import type {
  NotificationDeliveryAttempt,
  NotificationPresentationConfig,
  NotificationPushFailure,
  NotificationRecord,
} from "@/fewbie/modules/notification-center/components/notification-presentation";

/**
 * Page-level copy: filters, day buckets, pagination and the mark-all-read
 * action. Strings rendered by the shared presentation payload live in
 * `modules.notification-presentation`, so the host configures them once.
 */
export interface NotificationCenterLabels {
  tabAll: string;
  tabUnread: string;
  tabUnreadWithCount: (count: number) => string;
  severityAll: string;
  ariaSeverity: string;
  ariaCategory: string;
  allCategories: string;
  ariaScope: string;
  allScopes: string;
  emptyFiltered: string;
  dayToday: string;
  dayYesterday: string;
  totalNotifications: (count: number) => string;
  ariaPrevPage: string;
  ariaNextPage: string;
  keyboardHint: string;
  markAllRead: string;
}

/** One page request; every filter is optional and `undefined` means "all". */
export interface NotificationCenterQuery {
  page: number;
  pageSize: number;
  unreadOnly: boolean;
  severity?: string;
  notificationKeys?: string[];
  scopeId?: string;
}

/** One page of records plus the counters the toolbar renders. */
export interface NotificationCenterPage {
  records: NotificationRecord[];
  total: number;
  unreadCount: number;
}

/**
 * Host-owned transport for the page. Errors surface through `onError`; the
 * item never imports a fetch client, a query library or a router.
 */
export interface NotificationCenterPort {
  fetchPage(query: NotificationCenterQuery): Promise<NotificationCenterPage>;
  markRead(ids: string[]): Promise<void>;
  markAllRead(): Promise<number>;
  fetchPushFailures?(): Promise<NotificationPushFailure[]>;
  fetchDeliveryAttempt?(id: string): Promise<NotificationDeliveryAttempt | null>;
}

/**
 * Host scope filter option: whatever grouping the host filters notifications
 * by (a project, a site, a tenant). Names arrive already localized.
 */
export interface NotificationScopeOption {
  id: string;
  name: string;
}

/** Host-owned notification category filter: a label plus the keys it selects. */
export interface NotificationCategoryFilter {
  value: string;
  label: string;
  keys: readonly string[];
}

export interface NotificationCenterProps {
  labels: NotificationCenterLabels;
  presentation: NotificationPresentationConfig;
  port: NotificationCenterPort;
  scopeOptions: NotificationScopeOption[];
  categoryFilters: NotificationCategoryFilter[];
  /** Rows per page; duplicate alerts merge within a page, so the default is large. */
  pageSize?: number;
  /** Push-failure polling interval; `0` disables it. */
  pollIntervalMs?: number;
  /** Called after a successful mark-all-read with the number of rows marked. */
  onMarkedRead?: (count: number) => void;
  /** Called when a transport call fails so the host can toast or log it. */
  onError?: (error: unknown) => void;
  className?: string;
}
