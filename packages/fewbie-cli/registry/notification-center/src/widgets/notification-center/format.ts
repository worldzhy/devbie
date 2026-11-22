/**
 * Locale formatting, title normalization and grouping helpers. These are
 * generic presentation concerns, so they stay in the item; anything that names
 * a host's notification keys lives in the host and enters through `resolveMeta`
 * and `resolveSource`.
 */
import type { NotificationRecord } from "./types";

const STATUS_MARKERS = ["\u{1F534}", "\u{1F7E0}", "\u{1F7E2}", "\u{1F518}"] as const;

/** Replace `{name}` placeholders; missing values are left untouched. */
export function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
}

/** Drop a leading status emoji so in-app surfaces can show their own indicator. */
export function stripTitleMarker(title: string): string {
  const marker = STATUS_MARKERS.find((candidate) => title.startsWith(candidate));
  return marker ? title.slice(marker.length).trimStart() : title;
}

export function resolveLocale(locale?: string): string {
  return locale ?? (typeof navigator === "undefined" ? "en" : navigator.language);
}

const RELATIVE_DIVISIONS: Array<{ amount: number; unit: Intl.RelativeTimeFormatUnit }> = [
  { amount: 60, unit: "second" },
  { amount: 60, unit: "minute" },
  { amount: 24, unit: "hour" },
  { amount: 7, unit: "day" },
  { amount: 4.34524, unit: "week" },
  { amount: 12, unit: "month" },
  { amount: Number.POSITIVE_INFINITY, unit: "year" },
];

/** Localized "3 minutes ago" using only `Intl`, with no date library. */
export function formatRelativeTime(value: string, locale: string, now: Date = new Date()): string {
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  let duration = (new Date(value).getTime() - now.getTime()) / 1000;
  for (const division of RELATIVE_DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return formatter.format(Math.round(duration), division.unit);
    }
    duration /= division.amount;
  }
  return formatter.format(Math.round(duration), "year");
}

/** Absolute timestamp; `timeStyle` covers the long hover form and the seconds column. */
export function formatTimestamp(value: string, locale: string, timeStyle: "short" | "medium" = "short"): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle }).format(new Date(value));
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

const SEVERITY_DOT: Record<string, string> = {
  critical: "bg-destructive",
  high: "bg-destructive/70",
  medium: "bg-warning",
  low: "bg-primary",
  unknown: "bg-muted-foreground/50",
};

/** Recovery is a lifecycle state, not an alert level, so it reads green. */
export function notificationDotClass(status: string, severity: string): string {
  if (status === "resolved") return "bg-success";
  return SEVERITY_DOT[severity] ?? SEVERITY_DOT.unknown;
}

const SEVERITY_BADGE: Record<string, string> = {
  critical: "border-destructive/30 bg-destructive/10 text-destructive",
  high: "border-destructive/30 bg-destructive/10 text-destructive",
  medium: "border-warning/30 bg-warning/10 text-warning",
  low: "border-primary/30 bg-primary/10 text-primary",
  unknown: "border-border bg-muted text-muted-foreground",
};

export function severityBadgeClass(severity: string): string {
  return SEVERITY_BADGE[severity] ?? SEVERITY_BADGE.unknown;
}

export function severityLabelKey(
  severity: string,
): "severityCritical" | "severityHigh" | "severityMedium" | "severityLow" | "severityUnknown" {
  switch (severity) {
    case "critical":
      return "severityCritical";
    case "high":
      return "severityHigh";
    case "medium":
      return "severityMedium";
    case "low":
      return "severityLow";
    default:
      return "severityUnknown";
  }
}

/** Repeated alerts (same key, title and source on the same day) collapse into one row. */
export interface NotificationGroup {
  key: string;
  latest: NotificationRecord;
  records: NotificationRecord[];
  unreadIds: string[];
}

export interface NotificationDayGroup {
  label: "today" | "yesterday" | string;
  groups: NotificationGroup[];
}

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
