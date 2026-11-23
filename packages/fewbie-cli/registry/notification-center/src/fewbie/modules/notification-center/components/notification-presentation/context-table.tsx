"use client";

import { useNotificationPresentation } from "./presentation";

/** camelCase payload keys become readable labels, e.g. "projectName" -> "Project Name". */
function humanizeKey(key: string): string {
  const spaced = key.replace(/([A-Z])/g, " $1").replace(/[_-]+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatPayloadValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

/** Key/value table of the notification context payload, shared by sheet and panel. */
export function NotificationContextTable({ payload }: { payload: unknown }) {
  const { labels } = useNotificationPresentation();
  const entries = Object.entries((payload as Record<string, unknown> | null | undefined) ?? {}).filter(
    ([, value]) => value !== null && value !== undefined && value !== "",
  );
  if (entries.length === 0) return null;

  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-muted-foreground">{labels.contextLabel}</span>
      <dl className="divide-y rounded-lg border">
        {entries.map(([key, value]) => (
          <div key={key} className="grid grid-cols-3 gap-2 px-3 py-2 text-sm">
            <dt className="col-span-1 text-xs leading-5 text-muted-foreground">{humanizeKey(key)}</dt>
            <dd
              className={`col-span-2 break-words text-foreground ${
                typeof value === "object" ? "font-mono text-xs whitespace-pre-wrap" : "whitespace-pre-line"
              }`}
            >
              {formatPayloadValue(value)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
