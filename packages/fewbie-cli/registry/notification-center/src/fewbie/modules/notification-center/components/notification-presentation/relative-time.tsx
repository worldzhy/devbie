"use client";

import { formatRelativeTime, formatTimestamp, resolveLocale } from "./format";
import { useNotificationPresentation, useNow } from "./presentation";

export function RelativeTime({ value, className }: { value: string; className?: string }) {
  const { locale } = useNotificationPresentation();
  const resolved = resolveLocale(locale);
  const now = useNow(60_000);
  return (
    <time dateTime={value} title={formatTimestamp(value, resolved, "medium")} className={className}>
      {formatRelativeTime(value, resolved, now)}
    </time>
  );
}
