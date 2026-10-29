import type { ISODate } from "@/lib/dates";
import { isWithin } from "@/lib/dates";
import {
  ACTIVITY_FIELDS,
  type ActivityField,
  type AggregateBaseline,
  type DailyActivity,
  type NullableActivityCounts,
} from "@/lib/domain/types";
import { ratio, type Ratio } from "./ratio";

/**
 * One unit of aggregate activity: either a dated baseline (covering a span of
 * days, never split) or a single daily_activity row.
 */
export interface ActivitySource {
  kind: "baseline" | "daily";
  id: string;
  start: ISODate;
  end: ISODate;
  leadSourceId: string | null;
  values: NullableActivityCounts;
}

export interface ActivityScope {
  from?: ISODate | null;
  to?: ISODate | null;
  /** undefined = all sources; null = unattributed only; string = one lead source */
  leadSourceId?: string | null;
}

export type BaselineExclusionReason = "partial_overlap" | "outside_range" | "lead_source_filter";

export interface CollectedActivity {
  sources: ActivitySource[];
  /** daily rows dated inside a baseline's coverage — excluded to prevent double counting */
  coveredDaily: DailyActivity[];
  excludedBaselines: Array<{ baseline: AggregateBaseline; reason: BaselineExclusionReason }>;
}

function pickValues(row: NullableActivityCounts): NullableActivityCounts {
  const out = {} as NullableActivityCounts;
  for (const f of ACTIVITY_FIELDS) out[f] = row[f] ?? null;
  return out;
}

export function findCoveringBaseline(date: ISODate, baselines: AggregateBaseline[]): AggregateBaseline | undefined {
  return baselines.find((b) => isWithin(date, b.coverage_start, b.as_of_date));
}

/**
 * Reconcile baselines and daily rows into a non-overlapping set of sources.
 *
 * - Daily rows dated within any baseline coverage window are excluded (the
 *   baseline already counts that activity).
 * - A baseline is only included in a date-filtered view when its entire
 *   coverage window is inside the range; it cannot be split by day.
 * - Baselines carry no lead source, so they only appear in the "all" and
 *   "unattributed" lead-source views.
 */
export function collectActivity(
  baselines: AggregateBaseline[],
  daily: DailyActivity[],
  scope: ActivityScope = {},
): CollectedActivity {
  const from = scope.from ?? null;
  const to = scope.to ?? null;
  const sources: ActivitySource[] = [];
  const coveredDaily: DailyActivity[] = [];
  const excludedBaselines: CollectedActivity["excludedBaselines"] = [];

  for (const b of baselines) {
    if (scope.leadSourceId !== undefined && scope.leadSourceId !== null) {
      excludedBaselines.push({ baseline: b, reason: "lead_source_filter" });
      continue;
    }
    const startsInside = from === null || b.coverage_start >= from;
    const endsInside = to === null || b.as_of_date <= to;
    if (startsInside && endsInside) {
      sources.push({ kind: "baseline", id: b.id, start: b.coverage_start, end: b.as_of_date, leadSourceId: null, values: pickValues(b) });
      continue;
    }
    const overlaps = (from === null || b.as_of_date >= from) && (to === null || b.coverage_start <= to);
    excludedBaselines.push({ baseline: b, reason: overlaps ? "partial_overlap" : "outside_range" });
  }

  for (const row of daily) {
    if (findCoveringBaseline(row.activity_date, baselines)) {
      coveredDaily.push(row);
      continue;
    }
    if (from !== null && row.activity_date < from) continue;
    if (to !== null && row.activity_date > to) continue;
    if (scope.leadSourceId !== undefined && row.lead_source_id !== scope.leadSourceId) continue;
    sources.push({ kind: "daily", id: row.id, start: row.activity_date, end: row.activity_date, leadSourceId: row.lead_source_id, values: pickValues(row) });
  }

  return { sources, coveredDaily, excludedBaselines };
}

export interface FieldTotal {
  value: number;
  /** false when at least one source did not capture this field (value is a partial sum) */
  complete: boolean;
}

export type ActivityTotals = Record<ActivityField, FieldTotal>;

export function sumField(sources: ActivitySource[], field: ActivityField): FieldTotal {
  let value = 0;
  let complete = true;
  for (const s of sources) {
    const v = s.values[field];
    if (v === null) complete = false;
    else value += v;
  }
  return { value, complete };
}

export function totals(sources: ActivitySource[]): ActivityTotals {
  const out = {} as ActivityTotals;
  for (const f of ACTIVITY_FIELDS) out[f] = sumField(sources, f);
  return out;
}

/**
 * Weighted ratio over only those sources where both numerator and
 * denominator were captured, so populations stay comparable.
 * `numerator` may be a list of fields that are summed (e.g. all app columns).
 */
export function pairedRatio(
  sources: ActivitySource[],
  numerator: ActivityField | ActivityField[],
  denominator: ActivityField,
): Ratio {
  const numFields = Array.isArray(numerator) ? numerator : [numerator];
  let n = 0;
  let d = 0;
  let any = false;
  for (const s of sources) {
    const dv = s.values[denominator];
    if (dv === null) continue;
    const nvs = numFields.map((f) => s.values[f]);
    if (nvs.some((v) => v === null)) continue;
    n += nvs.reduce<number>((a, v) => a + (v ?? 0), 0);
    d += dv;
    any = true;
  }
  return any ? ratio(n, d) : ratio(null, null);
}

/** Latest activity date represented by any source (end of coverage for baselines). */
export function lastActivityDate(sources: ActivitySource[]): ISODate | null {
  let last: ISODate | null = null;
  for (const s of sources) if (last === null || s.end > last) last = s.end;
  return last;
}
