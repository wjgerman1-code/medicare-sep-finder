/**
 * Calendar-date helpers operating on ISO "YYYY-MM-DD" strings, pinned to UTC
 * so daylight-saving changes never shift a business day.
 */

export type ISODate = string;

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(value: string): boolean {
  if (!ISO_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function toUTC(date: ISODate): number {
  if (!isISODate(date)) throw new Error(`Invalid ISO date: ${date}`);
  return Date.parse(`${date}T00:00:00Z`);
}

function fromUTC(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

const DAY = 86_400_000;

export function addDays(date: ISODate, days: number): ISODate {
  return fromUTC(toUTC(date) + days * DAY);
}

/** Whole days from a to b (b - a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b) - toUTC(a)) / DAY);
}

/** 0 = Sunday ... 6 = Saturday */
export function weekday(date: ISODate): number {
  return new Date(toUTC(date)).getUTCDay();
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a <= b ? a : b;
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a >= b ? a : b;
}

/** Inclusive list of dates from start to end (empty when end < start). */
export function eachDay(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function isWithin(date: ISODate, start: ISODate, end: ISODate): boolean {
  return date >= start && date <= end;
}

/** Today's calendar date in an IANA time zone. */
export function todayInTimeZone(timeZone = "America/New_York", now: Date = new Date()): ISODate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function formatDate(date: ISODate | null | undefined, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...opts }).format(new Date(toUTC(date)));
}

export function formatShortDate(date: ISODate | null | undefined): string {
  return formatDate(date, { month: "short", day: "numeric" });
}
