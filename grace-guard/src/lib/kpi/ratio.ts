/**
 * A rate is always carried with its raw numerator and denominator so totals
 * can be re-weighted correctly. Daily percentages are never averaged.
 */
export interface Ratio {
  numerator: number | null;
  denominator: number | null;
  /** numerator / denominator, or null when either side is missing or the denominator is 0 */
  value: number | null;
}

export function ratio(numerator: number | null | undefined, denominator: number | null | undefined): Ratio {
  const n = numerator ?? null;
  const d = denominator ?? null;
  const value = n === null || d === null || d <= 0 ? null : n / d;
  return { numerator: n, denominator: d, value };
}

/** Combine ratios by summing raw numerators and denominators (weighted total). */
export function combineRatios(parts: Ratio[]): Ratio {
  let n = 0;
  let d = 0;
  let any = false;
  for (const p of parts) {
    if (p.numerator === null || p.denominator === null) continue;
    n += p.numerator;
    d += p.denominator;
    any = true;
  }
  return any ? ratio(n, d) : ratio(null, null);
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
