import Papa from "papaparse";

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

const NUMERIC = /^-?\d+(\.\d+)?$/;

/** Neutralize spreadsheet formula injection for text cells (numbers pass through). */
export function safeCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (NUMERIC.test(s)) return s;
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  return Papa.unparse(
    {
      fields: columns.map((c) => c.header),
      data: rows.map((r) => columns.map((c) => safeCell(c.value(r)))),
    },
    { newline: "\r\n" },
  );
}

export function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function parseCsv(text: string): { rows: Record<string, string>[]; errors: string[] } {
  const result = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: normalizeHeader,
    transform: (v) => v.trim(),
  });
  return {
    rows: result.data,
    errors: result.errors.map((e) => `Row ${(e.row ?? 0) + 2}: ${e.message}`),
  };
}
