"use client";

import { useState, useMemo, type ReactNode } from "react";
import { ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/** Column definition for the data table. */
export interface Column<T> {
  /** Key used to access the row value; also used as the sort key. */
  accessorKey: keyof T & string;
  /** Column header label. */
  header: string;
  /** Optional custom cell renderer. Receives the row's value for this column. */
  cell?: (value: T[keyof T], row: T) => ReactNode;
  /** Disable sorting for this column. */
  enableSorting?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  /** Number of rows per page. Defaults to 10. */
  pageSize?: number;
  className?: string;
  /**
   * Stable identity for a row, used as the React key. Defaults to the row's
   * column values, which survives sorting and paging; pass this when two rows
   * can share every displayed value.
   */
  getRowKey?: (row: T, index: number) => string | number;
  /**
   * Host-supplied copy. The English defaults only keep a bare demo renderable;
   * a shipping host must pass `labels` so the table never mixes locales.
   */
  labels?: Partial<DataTableLabels>;
}

/** Every string the table renders or announces. */
export interface DataTableLabels {
  /** Shown when the current page has no rows. */
  empty: string;
  /** Accessible name of the previous-page button. */
  previousPage: string;
  /** Accessible name of the next-page button. */
  nextPage: string;
  /** Page summary; `from` and `to` are 1-based and inclusive. */
  range: (from: number, to: number, total: number) => string;
}

const DEFAULT_LABELS: DataTableLabels = {
  empty: "No results.",
  previousPage: "Previous page",
  nextPage: "Next page",
  range: (from, to, total) => `${from}–${to} of ${total}`,
};

type SortDir = "asc" | "desc";

/**
 * Generic data table with client-side sorting and pagination.
 *
 * Pass `columns` describing each field and `data` as the row array. The
 * component manages its own sort and page state internally.
 */
export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  pageSize = 10,
  className,
  getRowKey,
  labels,
}: DataTableProps<T>) {
  const copy = { ...DEFAULT_LABELS, ...labels };
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!sortKey) return data;
    const copy = [...data];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      const as = String(av);
      const bs = String(bv);
      return sortDir === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
    });
    return copy;
  }, [data, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageData = sorted.slice(safePage * pageSize, (safePage + 1) * pageSize);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(0);
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead
                  key={col.accessorKey}
                  aria-sort={
                    col.enableSorting === false
                      ? undefined
                      : sortKey === col.accessorKey
                        ? sortDir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                  }
                >
                  {col.enableSorting === false ? (
                    col.header
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-ml-3 h-8 px-2"
                      onClick={() => toggleSort(col.accessorKey)}
                    >
                      {col.header}
                      <ArrowUpDown className="ml-2 size-3 opacity-50" />
                    </Button>
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  {copy.empty}
                </TableCell>
              </TableRow>
            ) : (
              pageData.map((row, i) => (
                <TableRow
                  key={
                    getRowKey
                      ? getRowKey(row, i)
                      : columns.map((col) => String(row[col.accessorKey] ?? "")).join("\u0000") || i
                  }
                >
                  {columns.map((col) => (
                    <TableCell key={col.accessorKey}>
                      {col.cell ? col.cell(row[col.accessorKey], row) : String(row[col.accessorKey] ?? "")}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {copy.range(safePage * pageSize + 1, Math.min((safePage + 1) * pageSize, sorted.length), sorted.length)}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              aria-label={copy.previousPage}
              disabled={safePage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="px-2">
              {safePage + 1} / {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              aria-label={copy.nextPage}
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
