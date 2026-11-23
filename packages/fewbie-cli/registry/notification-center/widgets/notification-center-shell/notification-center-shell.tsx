"use client";

import { useMemo } from "react";
import {
  NotificationDetailSheet,
  NotificationPresentationProvider,
  useNotificationPresentation,
  useOpenNotification,
  usePolled,
  type NotificationPresentationConfig,
  type NotificationRecord,
} from "@/fewbie/modules/notification-center/components/notification-presentation";
import { cn } from "@/lib/utils";
import { NotificationBell } from "./notification-bell";
import { NotificationTicker } from "./notification-ticker";
import type { NotificationCenterShellProps } from "./types";

interface ShellState {
  count: number;
  latest: NotificationRecord | null;
}

/**
 * Header composition: bell with unread badge and a ticker for the newest unread
 * alert. Opening the ticker either hands the host a link or opens the shared
 * detail sheet.
 */
export function NotificationCenterShell(props: NotificationCenterShellProps) {
  return (
    <NotificationPresentationProvider config={props.presentation}>
      <NotificationCenterShellBody {...props} />
    </NotificationPresentationProvider>
  );
}

function NotificationCenterShellBody(props: NotificationCenterShellProps) {
  const base = useNotificationPresentation();
  const state = usePolled<ShellState>(async () => {
    const [count, unread] = await Promise.all([props.port.fetchUnreadCount(), props.port.fetchUnread(1)]);
    return { count, latest: unread[0] ?? null };
  }, props.pollIntervalMs ?? 60_000);

  const { data, loading, reload } = state;
  const unreadCount = data?.count ?? 0;
  const latest = data?.latest ?? null;

  const config = useMemo<NotificationPresentationConfig>(
    () => ({
      ...base,
      onMarkRead: async (id: string) => {
        await props.port.markRead(id);
        reload();
      },
    }),
    [base, props.port, reload],
  );

  return (
    <NotificationPresentationProvider config={config}>
      <ShellContent {...props} unreadCount={unreadCount} latest={latest} loading={loading} />
    </NotificationPresentationProvider>
  );
}

function ShellContent({
  labels,
  notificationsPath,
  onNavigate,
  className,
  unreadCount,
  latest,
  loading,
}: NotificationCenterShellProps & { unreadCount: number; latest: NotificationRecord | null; loading: boolean }) {
  const { openNotification, sheetProps } = useOpenNotification();

  return (
    <>
      <div className={cn("flex items-center gap-1 rounded-full border border-transparent px-1", className)}>
        <NotificationBell
          labels={labels}
          unreadCount={unreadCount}
          onOpen={() => onNavigate?.(notificationsPath ?? "/notifications")}
        />
        <span aria-hidden className="h-5 w-px bg-border" />
        <NotificationTicker
          labels={labels}
          notification={latest}
          unreadCount={unreadCount}
          loading={loading}
          onOpen={(notification) => void openNotification(notification)}
        />
      </div>
      <NotificationDetailSheet {...sheetProps} />
    </>
  );
}
