"use client";

import { Button } from "@/fewbie/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/fewbie/ui/dialog";

import type { AuditLogRecord } from "../../lib/types";
import type { AuditLogLabels } from "./types";

interface DetailDialogProps {
  labels: AuditLogLabels;
  /** The row being inspected; `null` keeps the dialog closed. */
  record: AuditLogRecord | null;
  onOpenChange: (open: boolean) => void;
}

/** Pretty-printed detail payload, or the empty-copy when the record has none. */
function detailText(detail: unknown, empty: string): string {
  if (detail === undefined || detail === null) return empty;
  if (typeof detail === "string") return detail.trim() === "" ? empty : detail;
  if (typeof detail === "object") {
    return Object.keys(detail as Record<string, unknown>).length === 0 ? empty : JSON.stringify(detail, null, 2);
  }
  return String(detail);
}

export function DetailDialog({ labels, record, onOpenChange }: DetailDialogProps) {
  return (
    <Dialog open={record !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{labels.detailTitle}</DialogTitle>
        </DialogHeader>
        <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">
          {record ? detailText(record.detail, labels.detailEmpty) : null}
        </pre>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {labels.close}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
