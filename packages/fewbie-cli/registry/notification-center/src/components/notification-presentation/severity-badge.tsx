"use client";

import { Badge } from "@/components/ui/badge";
import { severityBadgeClass, severityLabelKey } from "./format";
import { useNotificationPresentation } from "./presentation";

export function SeverityBadge({ severity, className }: { severity: string; className?: string }) {
  const { labels } = useNotificationPresentation();
  return (
    <Badge variant="outline" className={`${severityBadgeClass(severity)} ${className ?? ""}`}>
      {labels[severityLabelKey(severity)]}
    </Badge>
  );
}

export function RecoveredBadge({ className }: { className?: string }) {
  const { labels } = useNotificationPresentation();
  return (
    <Badge variant="outline" className={`border-success/30 bg-success/10 text-success ${className ?? ""}`}>
      {labels.badgeAlertRecovered}
    </Badge>
  );
}
