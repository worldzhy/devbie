"use client";

import { useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronUp, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { interpolate, useCopilotRuntime } from "./copilot-context";
import type {
  CopilotChartBlock,
  CopilotErrorBlock,
  CopilotQueryBlock,
  CopilotSkillBlock,
  CopilotTableBlock,
  CopilotTableColumn,
} from "./types";

export function CopilotBlocks({ blocks }: { blocks: CopilotSkillBlock[] }) {
  if (blocks.length === 0) return null;
  return (
    <>
      {blocks.map((block, index) => {
        const key = `${block.kind}-${index}`;
        switch (block.kind) {
          case "chart":
            return <CopilotChartBlockView key={key} block={block} />;
          case "table":
            return <CopilotTableBlockView key={key} block={block} />;
          case "query":
            return <CopilotQueryBlockView key={key} block={block} />;
          case "error":
            return <CopilotErrorBlockView key={key} block={block} />;
          default:
            return null;
        }
      })}
    </>
  );
}

function CopilotChartBlockView({ block }: { block: CopilotChartBlock }) {
  const { labels, renderChart } = useCopilotRuntime();
  const { chartType, title, labels: axisLabels, datasets, truncated } = block;
  const isEmpty =
    axisLabels.length === 0 ||
    datasets.every((dataset) => dataset.data.length === 0 || dataset.data.every((value) => value === 0));

  return (
    <div className="mt-2 rounded-md border border-border bg-background p-3">
      {title ? <p className="mb-2 text-xs font-medium text-foreground">{title}</p> : null}
      {isEmpty ? (
        <p className="py-8 text-center text-xs text-muted-foreground">{labels.noData}</p>
      ) : renderChart ? (
        renderChart({ chartType, labels: axisLabels, datasets, className: "h-48" })
      ) : (
        <ul className="flex flex-col gap-1">
          {axisLabels.map((label, index) => (
            <li key={`${label}-${index}`} className="flex justify-between gap-2 text-[11px]">
              <span className="truncate text-muted-foreground">{label}</span>
              <span className="tabular-nums text-foreground">
                {datasets.map((dataset) => dataset.data[index] ?? 0).join(" / ")}
              </span>
            </li>
          ))}
        </ul>
      )}
      {truncated ? <p className="mt-1.5 text-[10px] text-muted-foreground/70">{labels.dataTruncated}</p> : null}
    </div>
  );
}

/** Long text cells are truncated beyond this length; full text on hover. */
const MAX_CELL_TEXT = 80;

function CopilotTableBlockView({ block }: { block: CopilotTableBlock }) {
  const { labels, locale } = useCopilotRuntime();
  const { title, columns, rows, totalRows, truncated } = block;

  return (
    <div className="mt-2 rounded-md border border-border bg-background p-3">
      {title ? <p className="mb-2 text-xs font-medium text-foreground">{title}</p> : null}
      {rows.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">{labels.noData}</p>
      ) : (
        <div className="max-h-64 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead
                    key={column.field}
                    style={column.width ? { width: column.width } : undefined}
                    className="sticky top-0 z-10 h-8 bg-background text-[11px]"
                  >
                    {column.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, rowIndex) => (
                <TableRow key={rowIndex}>
                  {columns.map((column) => (
                    <TableCell key={column.field} className="py-1.5 text-[11px]">
                      <SmartCell value={row[column.field]} column={column} locale={locale} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {rows.length > 0 ? (
        <p className="mt-1.5 text-[10px] text-muted-foreground/70">
          {rows.length === totalRows
            ? interpolate(labels.rowsCount, { count: totalRows })
            : interpolate(labels.showingRows, { shown: rows.length, total: totalRows })}
          {truncated ? ` · ${labels.dataTruncated}` : ""}
        </p>
      ) : null}
    </div>
  );
}

/** Null/empty -> "-", locale-formatted numbers, formatHint units, long-text truncation. */
function SmartCell({ value, column, locale }: { value: unknown; column: CopilotTableColumn; locale: string }) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground/60">{"-"}</span>;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const formatted = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
    const withUnit =
      column.formatHint === "ms" ? `${formatted} ms` : column.formatHint === "pct" ? `${formatted} %` : formatted;
    return <span className="tabular-nums">{withUnit}</span>;
  }

  const text = String(value);
  if (text.length <= MAX_CELL_TEXT) return <span className="break-all">{text}</span>;
  return (
    <span className="break-all" title={text}>
      {text.slice(0, MAX_CELL_TEXT)}
      {"…"}
    </span>
  );
}

function CopilotQueryBlockView({ block }: { block: CopilotQueryBlock }) {
  const { labels } = useCopilotRuntime();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(block.sql);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="mt-2 rounded-md border border-border">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium hover:bg-muted/50"
      >
        {open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        <span>{labels.viewQuery}</span>
        <span className="ml-auto text-[10px] text-muted-foreground">{block.templateId}</span>
      </button>
      {open ? (
        <div className="relative border-t border-border">
          <pre className="max-h-64 overflow-auto p-3 font-mono text-[11px] break-all whitespace-pre-wrap text-muted-foreground">
            {block.sql}
          </pre>
          {block.truncated ? (
            <p className="border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground/70">
              {labels.queryTruncated}
            </p>
          ) : null}
          <Button variant="ghost" size="icon-sm" className="absolute top-1 right-1" onClick={copy}>
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function CopilotErrorBlockView({ block }: { block: CopilotErrorBlock }) {
  return (
    <div className="mt-2 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-xs text-destructive">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
      <div>
        <p className="font-medium">{block.title}</p>
        <p className="mt-0.5 text-destructive/90">{block.message}</p>
      </div>
    </div>
  );
}
