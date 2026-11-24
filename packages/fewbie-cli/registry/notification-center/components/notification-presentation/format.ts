/**
 * Locale formatting and severity styling shared by every notification surface.
 * Anything that names a host's notification keys lives in the host and enters
 * through `resolveMeta` / `resolveSource`.
 */

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
export function formatTimestamp(
  value: string,
  locale: string,
  timeStyle: "short" | "medium" = "short",
  timeZone?: string,
): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle,
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(value));
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
