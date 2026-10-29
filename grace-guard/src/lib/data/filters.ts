import { isISODate, type ISODate } from "@/lib/dates";

export type SearchParams = Record<string, string | string[] | undefined>;

export interface Filters {
  campaign: string | null;
  from: ISODate | null;
  to: ISODate | null;
  product: string | null;
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export function parseFilters(sp: SearchParams): Filters {
  const from = first(sp.from);
  const to = first(sp.to);
  return {
    campaign: first(sp.campaign),
    from: from && isISODate(from) ? from : null,
    to: to && isISODate(to) ? to : null,
    product: first(sp.product),
  };
}

/** Rebuild a query string keeping the filters that apply across pages. */
export function filterQuery(f: Partial<Filters>, extra: Record<string, string | null | undefined> = {}): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...f, ...extra })) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
}
