"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { NotificationPresentationConfig, NotificationRecord } from "./types";

const NotificationPresentationContext = createContext<NotificationPresentationConfig | null>(null);

/**
 * Supplies host copy, domain mapping and callbacks to every presentation
 * surface. Feature pages and header widgets each mount one provider, so the
 * same payload works in both without fetching anything itself.
 */
export function NotificationPresentationProvider({
  config,
  children,
}: {
  config: NotificationPresentationConfig;
  children: ReactNode;
}) {
  return <NotificationPresentationContext.Provider value={config}>{children}</NotificationPresentationContext.Provider>;
}

export function useNotificationPresentation(): NotificationPresentationConfig {
  const value = useContext(NotificationPresentationContext);
  if (!value) {
    throw new Error("Notification presentation surfaces must render inside <NotificationPresentationProvider>.");
  }
  return value;
}

/** Current time, refreshed periodically so relative labels do not go stale. */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

interface OpenNotificationOptions {
  /** Open the detail sheet even when the notification carries a link. */
  forceSheet?: boolean;
}

/**
 * Shared "open a notification" behavior: mark it read, then either hand the
 * link to the host or fall back to the detail sheet. Navigation safety and
 * routing belong to the host, so this hook only calls `onOpenLink`.
 */
export function useOpenNotification() {
  const { onMarkRead, onOpenLink, onError } = useNotificationPresentation();
  const [selected, setSelected] = useState<NotificationRecord | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const openNotification = useCallback(
    async (notification: NotificationRecord, options: OpenNotificationOptions = {}) => {
      try {
        if (!notification.read) await onMarkRead?.(notification.id);
      } catch (caught) {
        onError?.(caught);
        return;
      }
      if (notification.link && !options.forceSheet) {
        onOpenLink?.(notification.link);
        return;
      }
      setSelected(notification);
      setSheetOpen(true);
    },
    [onMarkRead, onOpenLink, onError],
  );

  const sheetProps = {
    notification: selected,
    open: sheetOpen,
    onOpenChange: setSheetOpen,
    onOpenLink: (notification: NotificationRecord) => {
      setSheetOpen(false);
      if (notification.link) onOpenLink?.(notification.link);
    },
  };

  return { openNotification, sheetProps };
}
