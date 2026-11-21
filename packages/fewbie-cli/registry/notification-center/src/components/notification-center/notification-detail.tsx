"use client";

import { createElement, useCallback, useEffect, useState } from "react";
import { AlertTriangle, ExternalLink, Inbox, LoaderCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useNotificationCenter } from "./notification-center";
import {
  formatRelativeTime,
  formatTimestamp,
  interpolate,
  resolveLocale,
  severityBadgeClass,
  severityLabelKey,
  stripTitleMarker,
  type NotificationGroup,
} from "./format";
import type { NotificationDeliveryAttempt, NotificationRecord } from "./types";

/** Current time, refreshed periodically so relative labels do not go stale. */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function RelativeTime({ value, className }: { value: string; className?: string }) {
  const { locale } = useNotificationCenter();
  const resolved = resolveLocale(locale);
  const now = useNow(60_000);
  return (
    <time dateTime={value} title={formatTimestamp(value, resolved, "medium")} className={className}>
      {formatRelativeTime(value, resolved, now)}
    </time>
  );
}

export function SeverityBadge({ severity, className }: { severity: string; className?: string }) {
  const { labels } = useNotificationCenter();
  return (
    <Badge variant="outline" className={`${severityBadgeClass(severity)} ${className ?? ""}`}>
      {labels[severityLabelKey(severity)]}
    </Badge>
  );
}

export function RecoveredBadge({ className }: { className?: string }) {
  const { labels } = useNotificationCenter();
  return (
    <Badge variant="outline" className={`border-success/30 bg-success/10 text-success ${className ?? ""}`}>
      {labels.badgeAlertRecovered}
    </Badge>
  );
}

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
  const { labels } = useNotificationCenter();
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
  const host = useNotificationCenter();
  const [selected, setSelected] = useState<NotificationRecord | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { onError } = host;

  const openNotification = useCallback(
    async (notification: NotificationRecord, options: OpenNotificationOptions = {}) => {
      try {
        if (!notification.read) await host.port.markRead(notification.id);
      } catch (caught) {
        onError?.(caught);
        return;
      }
      if (notification.link && !options.forceSheet) {
        host.onOpenLink(notification.link);
        return;
      }
      setSelected(notification);
      setSheetOpen(true);
    },
    [host, onError],
  );

  const sheetProps = {
    notification: selected,
    open: sheetOpen,
    onOpenChange: setSheetOpen,
    onOpenLink: (notification: NotificationRecord) => {
      setSheetOpen(false);
      if (notification.link) host.onOpenLink(notification.link);
    },
  };

  return { openNotification, sheetProps };
}

function DetailHeader({ notification }: { notification: NotificationRecord }) {
  const { labels, resolveMeta, categoryVisuals, fallbackVisual } = useNotificationCenter();
  const meta = resolveMeta(notification.notificationKey);
  const visual = (meta.category ? categoryVisuals[meta.category] : undefined) ?? fallbackVisual;
  return (
    <div className="flex items-center gap-3">
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${visual.className}`}>
        {createElement(visual.icon, { className: "size-5" })}
      </span>
      <div className="flex min-w-0 flex-col gap-1.5">
        <SheetTitle className="text-base leading-snug">{stripTitleMarker(notification.title)}</SheetTitle>
        <div className="flex flex-wrap items-center gap-2">
          {notification.status === "resolved" ? <RecoveredBadge /> : <SeverityBadge severity={notification.severity} />}
          <Badge variant="secondary">{meta.label}</Badge>
          {notification.read ? <Badge variant="outline">{labels.read}</Badge> : <Badge>{labels.unread}</Badge>}
        </div>
      </div>
    </div>
  );
}

export function NotificationDetailSheet({
  notification,
  open,
  onOpenChange,
  onOpenLink,
}: {
  notification: NotificationRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenLink: (notification: NotificationRecord) => void;
}) {
  const { labels, resolveSource, onNavigate, alertCenterPath } = useNotificationCenter();
  const locale = resolveLocale(useNotificationCenter().locale);

  if (!notification) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent />
      </Sheet>
    );
  }

  const source = resolveSource?.(notification) ?? null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <DetailHeader notification={notification} />
          <SheetDescription className="space-y-1">
            <span className="block">{formatTimestamp(notification.createdAt, locale)}</span>
            <span className="block font-mono text-xs">{notification.notificationKey}</span>
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 pb-4">
          {source ? (
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">{labels.sourceLabel}</span>
              <p className="text-sm text-foreground">{source}</p>
            </div>
          ) : null}

          {notification.detail ? (
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">{labels.detailLabel}</span>
              <p className="whitespace-pre-line rounded-lg border bg-muted/40 p-3 text-sm text-foreground">
                {notification.detail}
              </p>
            </div>
          ) : null}

          <NotificationContextTable payload={notification.payload} />
        </div>

        <Separator />
        <SheetFooter>
          {notification.sourceType === "alert" ? (
            <Button className="w-full" variant="outline" onClick={() => onNavigate(alertCenterPath ?? "/alert-center")}>
              <AlertTriangle className="size-4" />
              {labels.openAlertCenter}
            </Button>
          ) : null}
          {notification.link ? (
            <Button className="w-full" onClick={() => onOpenLink(notification)}>
              <ExternalLink className="size-4" />
              {labels.openLinkedPage}
            </Button>
          ) : null}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function DeliveryReasonBlock({ notificationId }: { notificationId: string }) {
  const { labels, port, locale } = useNotificationCenter();
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState<NotificationDeliveryAttempt | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !port.fetchDeliveryAttempt) return;
    let alive = true;
    setLoading(true);
    port
      .fetchDeliveryAttempt(notificationId)
      .then((result) => {
        if (alive) setAttempt(result);
      })
      .catch(() => {
        if (alive) setAttempt(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, notificationId, port]);

  if (!port.fetchDeliveryAttempt) return null;

  return (
    <div className="space-y-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="text-xs font-medium text-muted-foreground"
      >
        {labels.deliveryReasonLabel}
      </button>
      {open ? (
        loading ? (
          <div className="flex justify-center py-2">
            <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : !attempt ? (
          <p className="text-sm text-muted-foreground">{labels.deliveryReasonMissing}</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant={attempt.decision === "suppress" ? "destructive" : "default"}>
              {attempt.decision === "suppress" ? labels.deliveryReasonSuppress : labels.deliveryReasonDeliver}
            </Badge>
            <span className="text-muted-foreground">
              {attempt.reason === "rule" ? labels.deliveryReasonRule : labels.deliveryReasonNoMatch}
            </span>
            {attempt.ruleId ? (
              <span className="font-mono text-xs text-muted-foreground">{attempt.ruleId.slice(0, 8)}</span>
            ) : null}
            {attempt.runtimeReasonLabel ? <Badge variant="secondary">{attempt.runtimeReasonLabel}</Badge> : null}
            <span className="text-xs text-muted-foreground">
              {formatTimestamp(attempt.createdAt, resolveLocale(locale))}
            </span>
          </div>
        )
      ) : null}
    </div>
  );
}

/** Persistent right-hand pane of an inbox view; the host owns the page and list. */
export function NotificationDetailPanel({
  group,
  onOpenLink,
}: {
  group: NotificationGroup | null;
  onOpenLink: (notification: NotificationRecord) => void;
}) {
  const { labels, resolveMeta, categoryVisuals, fallbackVisual, resolveSource, onNavigate, alertCenterPath } =
    useNotificationCenter();
  const locale = resolveLocale(useNotificationCenter().locale);

  if (!group) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
        <Inbox className="size-8" />
        <span className="text-sm">{labels.selectPrompt}</span>
      </div>
    );
  }

  const notification = group.latest;
  const meta = resolveMeta(notification.notificationKey);
  const visual = (meta.category ? categoryVisuals[meta.category] : undefined) ?? fallbackVisual;
  const source = resolveSource?.(notification) ?? null;

  return (
    <section aria-label={labels.detailsLabel} className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-start gap-3 border-b px-6 py-4">
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${visual.className}`}>
          {createElement(visual.icon, { className: "size-5" })}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base leading-snug font-semibold text-balance">{stripTitleMarker(notification.title)}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {notification.status === "resolved" ? (
              <RecoveredBadge />
            ) : (
              <SeverityBadge severity={notification.severity} />
            )}
            <Badge variant="secondary">{meta.label}</Badge>
            {group.records.length > 1 ? (
              <Badge variant="outline">{interpolate(labels.occurrencesCount, { count: group.records.length })}</Badge>
            ) : null}
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
            <span>{formatTimestamp(notification.createdAt, locale)}</span>
            <span className="font-mono">{notification.notificationKey}</span>
          </p>
        </div>
        {notification.link || notification.sourceType === "alert" ? (
          <div className="flex items-center gap-2">
            {notification.sourceType === "alert" ? (
              <Button size="sm" variant="outline" onClick={() => onNavigate(alertCenterPath ?? "/alert-center")}>
                <AlertTriangle className="size-4" />
                {labels.openAlertCenter}
              </Button>
            ) : null}
            {notification.link ? (
              <Button size="sm" onClick={() => onOpenLink(notification)}>
                <ExternalLink className="size-4" />
                {labels.openLinkedPage}
              </Button>
            ) : null}
          </div>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
        {source ? (
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{labels.sourceLabel}</span>
            <p className="text-sm text-foreground">{source}</p>
          </div>
        ) : null}

        {notification.detail ? (
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{labels.detailLabel}</span>
            <p className="rounded-lg border bg-muted/40 p-3 text-sm whitespace-pre-line text-foreground">
              {notification.detail}
            </p>
          </div>
        ) : null}

        <NotificationContextTable payload={notification.payload} />
        <DeliveryReasonBlock notificationId={notification.id} />

        {group.records.length > 1 ? (
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground">{labels.occurrencesLabel}</span>
            <ol className="divide-y rounded-lg border">
              {group.records.map((record) => (
                <li key={record.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="tabular-nums text-foreground">
                    {formatTimestamp(record.createdAt, locale, "medium")}
                  </span>
                  <RelativeTime value={record.createdAt} className="text-xs text-muted-foreground" />
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    </section>
  );
}
