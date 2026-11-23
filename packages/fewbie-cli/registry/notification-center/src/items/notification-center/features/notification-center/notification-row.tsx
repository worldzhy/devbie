"use client";

import {
  RecoveredBadge,
  RelativeTime,
  SeverityBadge,
  stripTitleMarker,
  useNotificationPresentation,
  type NotificationGroup,
} from "@/items/notification-center/components/notification-presentation";
import { cn } from "@/lib/utils";

/** One collapsed alert group: unread dot, title, occurrence count and source line. */
export function NotificationRow({
  group,
  selected,
  onSelect,
}: {
  group: NotificationGroup;
  selected: boolean;
  onSelect: (group: NotificationGroup) => void;
}) {
  const { resolveMeta, resolveSource } = useNotificationPresentation();
  const notification = group.latest;
  const meta = resolveMeta(notification.notificationKey);
  const source = resolveSource?.(notification) ?? null;
  const unread = group.unreadIds.length > 0;

  return (
    <button
      type="button"
      aria-current={selected}
      data-notification-selected={selected}
      onClick={() => onSelect(group)}
      className={cn(
        "flex w-full items-start gap-2.5 border-b border-border/60 px-3 py-2.5 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none",
        selected && "bg-accent hover:bg-accent",
      )}
    >
      <span
        aria-hidden
        className={cn("mt-1.5 size-2 shrink-0 rounded-full", unread ? "bg-primary" : "bg-transparent")}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className={cn("truncate text-sm", unread ? "font-semibold text-foreground" : "text-muted-foreground")}>
            {stripTitleMarker(notification.title)}
          </span>
          {group.records.length > 1 ? (
            <span className="shrink-0 rounded bg-muted px-1.5 text-xs font-medium text-muted-foreground tabular-nums">
              {`×${group.records.length}`}
            </span>
          ) : null}
          <RelativeTime value={notification.createdAt} className="ml-auto shrink-0 text-xs text-muted-foreground" />
        </span>
        <span className="mt-1 flex items-center gap-2">
          {notification.status === "resolved" ? (
            <RecoveredBadge className="h-5 px-1.5 text-[10px]" />
          ) : (
            <SeverityBadge severity={notification.severity} className="h-5 px-1.5 text-[10px]" />
          )}
          <span className="truncate text-xs text-muted-foreground">
            {source ? `${meta.label} · ${source}` : meta.label}
          </span>
        </span>
      </span>
    </button>
  );
}
