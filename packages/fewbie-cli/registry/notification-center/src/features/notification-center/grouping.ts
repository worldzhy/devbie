import type { NotificationGroup, NotificationRecord } from "@/components/notification-presentation";

export interface NotificationDayGroup {
  label: "today" | "yesterday" | string;
  groups: NotificationGroup[];
}

/** Day bucket key: `today`/`yesterday` sentinels, otherwise an ISO date. */
export function dayBucket(value: string, now: Date = new Date()): "today" | "yesterday" | string {
  const target = new Date(value);
  const sameDay = (left: Date, right: Date) =>
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate();
  if (sameDay(target, now)) return "today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(target, yesterday)) return "yesterday";
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
}

/**
 * Repeated alerts (same key, title and source on the same day) collapse into one
 * row. The source line is host-owned, so the host passes `resolveSource` in.
 */
export function groupNotifications(
  records: NotificationRecord[],
  resolveSource?: (notification: NotificationRecord) => string | null,
): NotificationDayGroup[] {
  const days = new Map<string, Map<string, NotificationGroup>>();

  for (const record of records) {
    const day = dayBucket(record.createdAt);
    const groupKey = [day, record.notificationKey, record.title, resolveSource?.(record) ?? ""].join("|");
    let groups = days.get(day);
    if (!groups) {
      groups = new Map();
      days.set(day, groups);
    }
    const existing = groups.get(groupKey);
    if (existing) {
      existing.records.push(record);
      if (!record.read) existing.unreadIds.push(record.id);
      continue;
    }
    groups.set(groupKey, {
      key: groupKey,
      latest: record,
      records: [record],
      unreadIds: record.read ? [] : [record.id],
    });
  }

  return Array.from(days.values()).map((groups) => {
    const list = Array.from(groups.values());
    return { label: dayBucket(list[0].latest.createdAt), groups: list };
  });
}

/**
 * Absolute label for one day bucket. `today`/`yesterday` stay `null` so the
 * feature renders its own translated label instead.
 */
export function formatDayLabel(label: string, locale: string): string | null {
  if (label === "today" || label === "yesterday") return null;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${label}T12:00:00Z`));
}
