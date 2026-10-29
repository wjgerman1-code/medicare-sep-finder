/**
 * Decimal-safe money helpers. All amounts are integer cents. Floating-point
 * values only appear for display or for clearly-labelled estimates, and are
 * rounded back to whole cents at the boundary.
 */

export type Cents = number;

export function assertCents(value: number): Cents {
  if (!Number.isSafeInteger(value)) throw new Error(`Not an integer cent amount: ${value}`);
  return value;
}

/** Parse user input like "1,234.56", "$363", "-12.5" into integer cents without float math. */
export function parseMoneyToCents(input: string | number | null | undefined): Cents | null {
  if (input === null || input === undefined) return null;
  const raw = String(input).trim().replace(/[$,\s]/g, "");
  if (raw === "") return null;
  const m = /^(-)?(\d+)(?:\.(\d{0,2}))?$/.exec(raw);
  if (!m) throw new Error(`Invalid money amount: ${input}`);
  const [, neg, whole, frac = ""] = m;
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) throw new Error(`Amount too large: ${input}`);
  return neg ? -cents : cents;
}

/** Sum integer cents, ignoring null/undefined. */
export function sumCents(values: Array<Cents | null | undefined>): Cents {
  let total = 0;
  for (const v of values) if (v !== null && v !== undefined) total += v;
  return assertCents(total);
}

/** cents × count (integer), exact. */
export function multiplyCents(cents: Cents, count: number): Cents {
  if (!Number.isInteger(count)) throw new Error("multiplyCents requires an integer count");
  return assertCents(cents * count);
}

/** Apply a basis-point rate (1% = 100 bps) with exact integer math, rounding half up. */
export function applyRateBps(cents: Cents, bps: number): Cents {
  const product = BigInt(cents) * BigInt(bps);
  const rounded = product >= BigInt(0) ? (product + BigInt(5000)) / BigInt(10000) : -((-product + BigInt(5000)) / BigInt(10000));
  return assertCents(Number(rounded));
}

/** Estimate: fractional quantity × cents, rounded to the nearest cent. */
export function estimateCents(cents: Cents, quantity: number): Cents {
  return Math.round(cents * quantity);
}

/** cents ÷ count → cents (rounded). Returns null for zero/missing denominators. */
export function divideCents(cents: Cents | null, divisor: number | null): Cents | null {
  if (cents === null || divisor === null || divisor <= 0) return null;
  return Math.round(cents / divisor);
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usdWhole = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function formatCents(cents: Cents | null | undefined, opts: { whole?: boolean } = {}): string {
  if (cents === null || cents === undefined) return "—";
  return (opts.whole ? usdWhole : usd).format(cents / 100);
}

/** Cents → "1234.56" for forms/CSV (no float drift). */
export function centsToDecimalString(cents: Cents | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  const neg = cents < 0;
  const abs = Math.abs(cents);
  return `${neg ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
