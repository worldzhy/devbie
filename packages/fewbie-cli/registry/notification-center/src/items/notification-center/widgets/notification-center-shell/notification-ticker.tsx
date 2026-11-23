"use client";

import { createElement } from "react";
import {
  RelativeTime,
  stripTitleMarker,
  useNotificationPresentation,
  type NotificationRecord,
} from "@/items/notification-center/components/notification-presentation";
import { cn } from "@/lib/utils";
import type { NotificationCenterShellLabels } from "./types";

function greeting(labels: NotificationCenterShellLabels, unreadCount: number): string {
  if (unreadCount === 0) return labels.greetingInboxZero;
  const hour = new Date().getHours();
  if (hour < 5) return labels.greetingNothingToDo;
  if (hour < 12) return labels.greetingAllQuiet;
  if (hour < 18) return labels.greetingCaughtUp;
  return labels.greetingNoAlerts;
}

/** Latest unread alert, or a quiet greeting when the inbox is empty. */
export function NotificationTicker({
  labels,
  notification,
  unreadCount,
  loading,
  onOpen,
  className,
}: {
  labels: NotificationCenterShellLabels;
  notification: NotificationRecord | null;
  unreadCount: number;
  loading: boolean;
  onOpen: (notification: NotificationRecord) => void;
  className?: string;
}) {
  const { resolveMeta, categoryVisuals, fallbackVisual } = useNotificationPresentation();
  const base = cn(
    "hidden min-w-0 max-w-[320px] items-center gap-1.5 rounded-full px-2 py-1 text-xs xl:flex",
    className,
  );

  if (!notification) {
    return (
      <span className={cn(base, "text-muted-foreground")} aria-hidden={loading || undefined}>
        {loading ? "···" : greeting(labels, unreadCount)}
      </span>
    );
  }

  const meta = resolveMeta(notification.notificationKey);
  const visual = (meta.category ? categoryVisuals[meta.category] : undefined) ?? fallbackVisual;

  return (
    <button
      type="button"
      aria-label={labels.ariaLatestNotification}
      onClick={() => onOpen(notification)}
      className={cn(base, "transition-colors hover:bg-muted/60")}
    >
      <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-md", visual.className)}>
        {createElement(visual.icon, { className: "size-3" })}
      </span>
      <span className="truncate text-foreground">{stripTitleMarker(notification.title)}</span>
      <RelativeTime value={notification.createdAt} className="shrink-0 text-muted-foreground" />
    </button>
  );
}
