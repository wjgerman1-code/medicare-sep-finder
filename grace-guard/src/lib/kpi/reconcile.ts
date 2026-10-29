import type { ISODate } from "@/lib/dates";
import type { AggregateBaseline, Application, Product } from "@/lib/domain/types";
import { findCoveringBaseline, type ActivitySource } from "./aggregate";

/**
 * Double-count prevention between aggregate counts and itemized records.
 *
 * Aggregate counts (baseline + daily rows) and detailed application records
 * are grouped into buckets: one per baseline (its whole coverage window) and
 * one per calendar day outside any baseline. Within a bucket, detailed
 * records are treated as itemizing the aggregate for that product, so:
 *
 *     counted = max(aggregate, detailed)
 *
 * Detailed records never add on top of an aggregate that already includes
 * them, and if more records were itemized than aggregated, the records win.
 */
export interface ProductAppCount {
  productId: string;
  productName: string;
  productCode: string;
  aggregate: number;
  detailed: number;
  counted: number;
  /** aggregate applications with no matching detailed record (for revenue estimates) */
  undetailed: number;
  /** detailed records currently cancelled or charged back */
  cancelledOrChargedBack: number;
  /** counted for each bucket, keyed by bucket end date, ascending */
  byDate: Array<{ date: ISODate; counted: number }>;
}

interface Bucket {
  date: ISODate;
  aggregate: number;
  detailed: number;
}

export function bucketKeyFor(date: ISODate, baselines: AggregateBaseline[]): { key: string; date: ISODate } {
  const b = findCoveringBaseline(date, baselines);
  return b ? { key: `b:${b.id}`, date: b.as_of_date } : { key: `d:${date}`, date };
}

export function reconcileApplications(
  products: Product[],
  sources: ActivitySource[],
  applications: Application[],
  baselines: AggregateBaseline[],
): ProductAppCount[] {
  return products.map((p) => {
    const buckets = new Map<string, Bucket>();
    const bucket = (key: string, date: ISODate) => {
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { date, aggregate: 0, detailed: 0 }));
      return b;
    };

    if (p.daily_column) {
      for (const s of sources) {
        const v = s.values[p.daily_column];
        if (!v) continue;
        const key = s.kind === "baseline" ? `b:${s.id}` : `d:${s.start}`;
        bucket(key, s.end).aggregate += v;
      }
    }

    let cancelled = 0;
    for (const app of applications) {
      if (app.product_id !== p.id) continue;
      const { key, date } = bucketKeyFor(app.application_date, baselines);
      bucket(key, date).detailed += 1;
      if (app.status === "cancelled" || app.status === "charged_back") cancelled++;
    }

    let aggregate = 0;
    let detailed = 0;
    let counted = 0;
    let undetailed = 0;
    const byDate = new Map<ISODate, number>();
    for (const b of buckets.values()) {
      aggregate += b.aggregate;
      detailed += b.detailed;
      const c = Math.max(b.aggregate, b.detailed);
      counted += c;
      undetailed += Math.max(0, b.aggregate - b.detailed);
      byDate.set(b.date, (byDate.get(b.date) ?? 0) + c);
    }

    return {
      productId: p.id,
      productName: p.name,
      productCode: p.code,
      aggregate,
      detailed,
      counted,
      undetailed,
      cancelledOrChargedBack: cancelled,
      byDate: [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, c]) => ({ date, counted: c })),
    };
  });
}
