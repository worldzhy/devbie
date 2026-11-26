"use client";

import { Badge } from "@/fewbie/ui/badge";
import { Button } from "@/fewbie/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/fewbie/ui/table";

import type { AuditLogRecord } from "../../lib/types";
import type { AuditLogLabels } from "./types";

interface AuditTableProps {
  labels: AuditLogLabels;
  records: AuditLogRecord[];
  formatTime: (iso: string) => string;
  onViewDetail: (record: AuditLogRecord) => void;
}

/**
 * Ready-state table. The surrounding `TableShell` owns the border and the
 * non-ready states, so this renders only rows.
 */
export function AuditTable({ labels, records, formatTime, onViewDetail }: AuditTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          <TableHead className="font-medium">{labels.colTime}</TableHead>
          <TableHead className="font-medium">{labels.colActor}</TableHead>
          <TableHead className="font-medium">{labels.colEvent}</TableHead>
          <TableHead className="font-medium">{labels.colAction}</TableHead>
          <TableHead className="font-medium">{labels.colResourceType}</TableHead>
          <TableHead className="font-medium">{labels.colResourceId}</TableHead>
          <TableHead className="font-medium">{labels.colResult}</TableHead>
          <TableHead className="font-medium">{labels.colDetail}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {records.map((record) => (
          <TableRow key={record.id}>
            <TableCell className="whitespace-nowrap text-muted-foreground">{formatTime(record.createdAt)}</TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">{record.actorId || "-"}</TableCell>
            <TableCell className="font-medium">{record.event}</TableCell>
            <TableCell className="text-muted-foreground">{record.action || "-"}</TableCell>
            <TableCell className="text-muted-foreground">{record.resourceType || "-"}</TableCell>
            <TableCell className="text-muted-foreground">{record.resourceId || "-"}</TableCell>
            <TableCell>
              <Badge variant={record.result === "success" ? "default" : "destructive"}>
                {record.result === "success" ? labels.resultSuccess : labels.resultFailure}
              </Badge>
            </TableCell>
            <TableCell>
              <Button type="button" variant="ghost" size="sm" onClick={() => onViewDetail(record)}>
                {labels.viewDetail}
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
