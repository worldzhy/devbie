import type {
  NotificationPresentationConfig,
  NotificationRecord,
} from "@/fewbie/modules/notification-center/components/notification-presentation";

/** Shell copy only; severity, relative time and detail labels come from `notification-presentation`. */
export interface NotificationCenterShellLabels {
  bellLabel: string;
  ariaLatestNotification: (title: string) => string;
  greetingAllQuiet: string;
  greetingNothingToDo: string;
  greetingCaughtUp: string;
  greetingNoAlerts: string;
  greetingInboxZero: string;
}

/** Header-level transport: just enough for the badge and the latest unread alert. */
export interface NotificationCenterShellPort {
  fetchUnreadCount(): Promise<number>;
  fetchUnread(limit: number): Promise<NotificationRecord[]>;
  markRead(id: string): Promise<void>;
}

export interface NotificationCenterShellProps {
  labels: NotificationCenterShellLabels;
  presentation: NotificationPresentationConfig;
  port: NotificationCenterShellPort;
  /** Host route of the full page; the bell jumps there. */
  notificationsPath?: string;
  /** Polling interval for the badge and ticker; `0` disables it. */
  pollIntervalMs?: number;
  /** Host-owned navigation; the item never imports a router. */
  onNavigate?: (path: string) => void;
  className?: string;
}
