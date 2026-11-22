"use client";

import { useState } from "react";
import { Bell, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useNotificationCenter, usePolled } from "./notification-center";
import { notificationDotClass, stripTitleMarker } from "./format";
import { NotificationDetailSheet, RelativeTime, SeverityBadge, useOpenNotification } from "./notification-detail";

const RECENT_LIMIT = 6;

/**
 * Header bell: unread count plus a recent-unread popover. All data comes from
 * the host port; the item owns polling and local interactions.
 */
export function NotificationBell({ className }: { className?: string }) {
  const host = useNotificationCenter();
  const { labels, port, pollIntervalMs, notificationsPath, onNavigate, onMarkedRead } = host;
  const interval = pollIntervalMs ?? 60_000;
  const [open, setOpen] = useState(false);

  const unread = usePolled(() => port.fetchUnreadCount(), interval);
  const recent = usePolled(() => port.fetchRecent(RECENT_LIMIT), interval);
  const { openNotification, sheetProps } = useOpenNotification();

  const unreadCount = unread.data ?? 0;
  const records = recent.data ?? [];

  const markAllRead = async () => {
    try {
      const count = await port.markAllRead();
      if (count > 0) onMarkedRead?.(count);
      unread.reload();
      recent.reload();
    } catch (caught) {
      host.onError?.(caught);
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={`relative ${className ?? ""}`}
                aria-label={labels.bellLabel}
              >
                <Bell className="size-5" />
                {unreadCount > 0 ? (
                  <span className="absolute -end-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-4 font-semibold text-destructive-foreground tabular-nums">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                ) : null}
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {labels.bellLabel}
            {unreadCount > 0 ? ` (${unreadCount})` : ""}
          </TooltipContent>
        </Tooltip>

        <PopoverContent align="end" className="w-80 p-0">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-medium">{labels.bellLabel}</span>
            {unreadCount > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => void markAllRead()}
              >
                <Check className="size-3.5" />
                {labels.markAllRead}
              </Button>
            ) : null}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {recent.loading ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">{labels.loading}</p>
            ) : records.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">{labels.empty}</p>
            ) : (
              <ul className="divide-y">
                {records.map((record) => (
                  <li key={record.id}>
                    <button
                      type="button"
                      className="flex w-full items-start gap-2 px-3 py-2.5 text-start transition-colors hover:bg-muted/60"
                      onClick={() => {
                        setOpen(false);
                        void openNotification(record);
                      }}
                    >
                      <span
                        className={`mt-1.5 size-2 shrink-0 rounded-full ${notificationDotClass(record.status, record.severity)}`}
                        aria-label={record.read ? labels.read : labels.unread}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {stripTitleMarker(record.title)}
                        </span>
                        <span className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                          <RelativeTime value={record.createdAt} />
                          <SeverityBadge severity={record.severity} className="px-1.5 py-0 text-[10px]" />
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t px-3 py-2">
            <Button
              type="button"
              variant="ghost"
              className="h-8 w-full text-xs"
              onClick={() => {
                setOpen(false);
                onNavigate(notificationsPath ?? "/notifications");
              }}
            >
              {labels.viewAll}
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <NotificationDetailSheet {...sheetProps} />
    </>
  );
}
