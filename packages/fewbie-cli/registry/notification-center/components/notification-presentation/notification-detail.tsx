"use client";

import { useState, createElement } from "react";
import { AlertTriangle, ExternalLink, Inbox, LoaderCircle } from "lucide-react";
import { Badge } from "@/fewbie/ui/badge";
import { Button } from "@/fewbie/ui/button";
import { Separator } from "@/fewbie/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/fewbie/ui/sheet";
import { NotificationContextTable } from "./context-table";
import { formatTimestamp, interpolate, resolveLocale, stripTitleMarker } from "./format";
import { useNotificationPresentation } from "./presentation";
import { RelativeTime } from "./relative-time";
import { RecoveredBadge, SeverityBadge } from "./severity-badge";
import type { NotificationDeliveryAttempt, NotificationGroup, NotificationRecord } from "./types";

/** Status badge for a lifecycle state that reads as a recovery, not an alert level. */
function StatusBadge({ notification }: { notification: NotificationRecord }) {
  if (notification.status === "resolved") return <RecoveredBadge />;
  return <SeverityBadge severity={notification.severity} />;
}

function DetailHeader({ notification }: { notification: NotificationRecord }) {
  const { labels, resolveMeta, categoryVisuals, fallbackVisual } = useNotificationPresentation();
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
          <StatusBadge notification={notification} />
          <Badge variant="secondary">{meta.label}</Badge>
          {notification.read ? <Badge variant="outline">{labels.read}</Badge> : <Badge>{labels.unread}</Badge>}
        </div>
      </div>
    </div>
  );
}

/** Narrow-screen detail surface; the host owns when it opens. */
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
  const { labels, resolveSource, onNavigate, alertCenterPath, locale, timeZone } = useNotificationPresentation();
  const resolved = resolveLocale(locale);

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
            <span className="block">{formatTimestamp(notification.createdAt, resolved, "short", timeZone)}</span>
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
            <Button
              className="w-full"
              variant="outline"
              onClick={() => onNavigate?.(alertCenterPath ?? "/alert-center")}
            >
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
  const { labels, locale, timeZone, loadDeliveryAttempt } = useNotificationPresentation();
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState<NotificationDeliveryAttempt | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loadDeliveryAttempt) return null;
  const load = loadDeliveryAttempt;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (!next) return;
    setBusy(true);
    load(notificationId)
      .then((result) => setAttempt(result))
      .catch(() => setAttempt(null))
      .finally(() => setBusy(false));
  };

  return (
    <div className="space-y-2">
      <button type="button" aria-expanded={open} onClick={toggle} className="text-xs font-medium text-muted-foreground">
        {labels.deliveryReasonLabel}
      </button>
      {open ? (
        busy ? (
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
              {formatTimestamp(attempt.createdAt, resolveLocale(locale), "short", timeZone)}
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
  const {
    labels,
    resolveMeta,
    categoryVisuals,
    fallbackVisual,
    resolveSource,
    onNavigate,
    alertCenterPath,
    locale,
    timeZone,
  } = useNotificationPresentation();
  const resolved = resolveLocale(locale);

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
            <StatusBadge notification={notification} />
            <Badge variant="secondary">{meta.label}</Badge>
            {group.records.length > 1 ? (
              <Badge variant="outline">{interpolate(labels.occurrencesCount, { count: group.records.length })}</Badge>
            ) : null}
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
            <span>{formatTimestamp(notification.createdAt, resolved, "short", timeZone)}</span>
            <span className="font-mono">{notification.notificationKey}</span>
          </p>
        </div>
        {notification.link || notification.sourceType === "alert" ? (
          <div className="flex items-center gap-2">
            {notification.sourceType === "alert" ? (
              <Button size="sm" variant="outline" onClick={() => onNavigate?.(alertCenterPath ?? "/alert-center")}>
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
                    {formatTimestamp(record.createdAt, resolved, "medium", timeZone)}
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
