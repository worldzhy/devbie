"use client";

import { useEffect, useState } from "react";
import { Activity, RadioTower } from "lucide-react";
import { interpolate } from "./format";
import { useNotificationCenter, usePolled } from "./notification-center";
import { NotificationDetailSheet, RelativeTime, useOpenNotification } from "./notification-detail";

const TICKER_LIMIT = 8;
const ROTATE_MS = 6_000;

const GREETING_KEYS = [
  "greetingAllQuiet",
  "greetingNothingToDo",
  "greetingCaughtUp",
  "greetingNoAlerts",
  "greetingInboxZero",
] as const;

/**
 * Shell-level ticker: the latest unread notification, a quiet-day greeting when
 * there is none, and a push-delivery failure strip. Mount next to the bell.
 */
export function NotificationTicker({ className }: { className?: string }) {
  const host = useNotificationCenter();
  const { labels, port, pollIntervalMs } = host;
  const interval = pollIntervalMs ?? 60_000;
  const unread = usePolled(() => port.fetchUnread(TICKER_LIMIT), interval);
  const { openNotification, sheetProps } = useOpenNotification();
  const [cursor, setCursor] = useState(0);

  const records = unread.data ?? [];
  const current = records.length > 0 ? records[cursor % records.length] : null;
  const greeting = labels[GREETING_KEYS[cursor % GREETING_KEYS.length]];

  useEffect(() => {
    if (records.length <= 1) return;
    const timer = window.setInterval(() => setCursor((value) => value + 1), ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [records.length]);

  return (
    <div className={`flex min-w-0 items-center gap-3 ${className ?? ""}`}>
      <div
        aria-live="polite"
        className="flex min-w-0 flex-1 items-center gap-2 rounded-full border bg-muted/40 px-3 py-1"
      >
        <Activity className="size-3.5 shrink-0 text-primary" />
        {current ? (
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 text-start text-xs text-foreground"
            aria-label={interpolate(labels.ariaLatestNotification, { title: current.title })}
            onClick={() => void openNotification(current)}
          >
            <span
              className="truncate"
              // The title already carries the host's status marker; keep it in the ticker.
            >
              {current.title}
            </span>
            <RelativeTime value={current.createdAt} className="shrink-0 text-muted-foreground" />
          </button>
        ) : (
          <span className="truncate text-xs text-muted-foreground">{greeting}</span>
        )}
      </div>
      <PushFailureStrip />
      <NotificationDetailSheet {...sheetProps} />
    </div>
  );
}

/**
 * Push delivery failures are transport-level and read-only; they render as a
 * compact strip so operators notice a broken adapter without opening a page.
 */
function PushFailureStrip() {
  const { labels, port, pollIntervalMs } = useNotificationCenter();
  const failures = usePolled(
    () => (port.fetchPushFailures ? port.fetchPushFailures() : Promise.resolve([])),
    pollIntervalMs ?? 60_000,
  );
  const rows = failures.data ?? [];
  if (!port.fetchPushFailures || rows.length === 0) return null;

  const summary = rows.length === 1 ? labels.pushFailedOne : interpolate(labels.pushFailedMany, { count: rows.length });

  return (
    <div
      role="status"
      className="flex min-w-0 items-center gap-2 rounded-full border border-destructive/30 bg-destructive/10 px-3 py-1 text-xs text-destructive"
      title={rows[0].error}
    >
      <RadioTower className="size-3.5 shrink-0" />
      <span className="truncate">{summary}</span>
      <span className="truncate font-mono text-[10px] opacity-80">
        {rows[0].notificationTitle ?? rows[0].recipientKey}
      </span>
    </div>
  );
}
