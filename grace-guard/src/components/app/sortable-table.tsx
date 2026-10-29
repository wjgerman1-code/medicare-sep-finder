"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface SortableColumn {
  label: string;
  align?: "left" | "right";
  /** columns without sorting (e.g. actions) */
  sortable?: boolean;
  srOnly?: boolean;
}

export interface SortableRow {
  id: string;
  /** server-rendered cell contents, one per column */
  cells: React.ReactNode[];
  /** raw values used for sorting, one per column (null sorts last) */
  sort: Array<string | number | null>;
  className?: string;
}

/**
 * Table whose column headers sort the rows (click to cycle ascending /
 * descending). Cells are rendered on the server and passed in as props, so
 * formatting stays in one place.
 */
export function SortableTable({
  columns,
  rows,
  footer,
  initialSort,
}: {
  columns: SortableColumn[];
  rows: SortableRow[];
  footer?: React.ReactNode[];
  initialSort?: { col: number; dir: "asc" | "desc" };
}) {
  const [sort, setSort] = useState(initialSort ?? null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = a.sort[sort.col];
      const y = b.sort[sort.col];
      if (x === y) return 0;
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * dir;
    });
  }, [rows, sort]);

  const toggle = (col: number) =>
    setSort((s) => (s?.col === col ? { col, dir: s.dir === "asc" ? "desc" : "asc" } : { col, dir: "desc" }));

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((c, i) => {
            const active = sort?.col === i;
            const Icon = active ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
            return (
              <TableHead key={c.label} className={cn(c.align === "right" && "text-right")} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
                {c.srOnly ? (
                  <span className="sr-only">{c.label}</span>
                ) : c.sortable === false ? (
                  c.label
                ) : (
                  <button type="button" onClick={() => toggle(i)} className={cn("inline-flex items-center gap-1.5 hover:text-gold-light", c.align === "right" && "flex-row-reverse")}>
                    {c.label}
                    <Icon className={cn("h-3.5 w-3.5", active ? "text-gold-light" : "text-ivory/50")} />
                  </button>
                )}
              </TableHead>
            );
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((r) => (
          <TableRow key={r.id} className={r.className}>
            {r.cells.map((cell, i) => (
              <TableCell key={i} className={cn(columns[i]?.align === "right" && "text-right", "whitespace-nowrap")}>
                {cell}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
      {footer && (
        <TableFooter>
          <TableRow>
            {footer.map((cell, i) => (
              <TableCell key={i} className={cn(columns[i]?.align === "right" && "text-right")}>
                {cell}
              </TableCell>
            ))}
          </TableRow>
        </TableFooter>
      )}
    </Table>
  );
}
