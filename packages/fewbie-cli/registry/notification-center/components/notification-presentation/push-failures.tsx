"use client";

import { OctagonAlert } from "lucide-react";
import { useNotificationPresentation } from "./presentation";
import { RelativeTime } from "./relative-time";
import type { NotificationPushFailure } from "./types";

/**
 * Unresolved push failures are permanent faults (invalid token, bot removed
 * from the chat), so they render in the UI instead of server logs. The payload
 * never fetches; the page feature polls and passes rows in.
 */
export function NotificationPushFailures({
  failures,
  compact = false,
}: {
  failures: NotificationPushFailure[];
  compact?: boolean;
}) {
  const { labels, resolvePushFailure } = useNotificationPresentation();
  if (failures.length === 0) return null;

  const summary = failures.length === 1 ? labels.pushFailedOne : labels.pushFailedMany(failures.length);

  return (
    <div
      role="alert"
      className={
        compact
          ? "border-b border-destructive/40 bg-destructive/10 px-4 py-2.5 text-destructive"
          : "mb-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-destructive"
      }
    >
      <div className={`flex items-center gap-2 font-medium ${compact ? "text-xs" : "text-sm"}`}>
        <OctagonAlert className={compact ? "size-3.5 shrink-0" : "size-4 shrink-0"} />
        {summary}
      </div>
      <ul className={`mt-1.5 flex flex-col gap-1 ${compact ? "text-xs" : "text-sm"}`}>
        {failures.map((failure) => (
          <li key={failure.id} className="flex min-w-0 items-baseline gap-2">
            <span className="shrink-0 font-medium">{resolvePushFailure?.(failure) ?? failure.recipientKey}</span>
            {failure.notificationTitle ? (
              <span className="min-w-0 truncate text-destructive/80">{failure.notificationTitle}</span>
            ) : null}
            <span className="min-w-0 flex-1 truncate text-destructive/70" title={failure.error}>
              {failure.error}
            </span>
            <RelativeTime value={failure.createdAt} className="shrink-0 text-destructive/60" />
          </li>
        ))}
      </ul>
    </div>
  );
}
