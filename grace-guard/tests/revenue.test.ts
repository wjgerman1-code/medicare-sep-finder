import { describe, expect, it } from "vitest";
import type { CommissionAssumption } from "@/lib/domain/types";
import { commissionFromAssumption, resolveAssumption } from "@/lib/kpi/commission";
import { buildSnapshot } from "@/lib/kpi/snapshot";
import { applyRateBps, centsToDecimalString, multiplyCents, parseMoneyToCents, sumCents } from "@/lib/money";
import { aepData, app, day } from "./helpers/fixtures";

describe("money is integer cents", () => {
  it("parses dollar strings without floating point drift", () => {
    expect(parseMoneyToCents("363")).toBe(36300);
    expect(parseMoneyToCents("$1,234.5")).toBe(123450);
    expect(parseMoneyToCents("0.1")).toBe(10);
    expect(parseMoneyToCents("")).toBeNull();
    expect(() => parseMoneyToCents("12.345")).toThrow();
    expect(() => parseMoneyToCents("abc")).toThrow();
  });

  it("sums exactly where floats would not", () => {
    // 0.1 + 0.2 !== 0.3 in floating point
    expect(sumCents([10, 20])).toBe(30);
    expect(multiplyCents(36300, 14)).toBe(508200);
    expect(centsToDecimalString(508200)).toBe("5082.00");
    expect(centsToDecimalString(-5)).toBe("-0.05");
  });

  it("applies basis-point rates with half-up rounding", () => {
    expect(applyRateBps(100_000, 2000)).toBe(20_000); // 20% of $1,000
    expect(applyRateBps(333, 5000)).toBe(167); // 166.5 → 167
    expect(applyRateBps(12_345, 725)).toBe(895); // 7.25% of $123.45 = 8.95
  });
});

describe("product- and carrier-specific commission assumptions", () => {
  const base = { id: "", product_id: "p-mapd", plan_year: 2027, notes: null, rate_bps: null } as const;
  const assumptions: CommissionAssumption[] = [
    { ...base, id: "default", carrier_id: null, enrollment_type: null, basis: "flat_per_application", amount_cents: 36300 },
    { ...base, id: "carrierX", carrier_id: "carrier-x", enrollment_type: null, basis: "flat_per_application", amount_cents: 40000 },
    { ...base, id: "carrierX-new", carrier_id: "carrier-x", enrollment_type: "new_to_medicare", basis: "flat_per_application", amount_cents: 61100 },
    { ...base, id: "old", plan_year: 2026, carrier_id: null, enrollment_type: null, basis: "flat_per_application", amount_cents: 1 },
  ];

  it("picks the most specific match", () => {
    expect(resolveAssumption(assumptions, { productId: "p-mapd", planYear: 2027 })?.id).toBe("default");
    expect(resolveAssumption(assumptions, { productId: "p-mapd", planYear: 2027, carrierId: "carrier-x" })?.id).toBe("carrierX");
    expect(resolveAssumption(assumptions, { productId: "p-mapd", planYear: 2027, carrierId: "carrier-x", enrollmentType: "new_to_medicare" })?.id).toBe("carrierX-new");
    expect(resolveAssumption(assumptions, { productId: "p-mapd", planYear: 2027, carrierId: "carrier-y" })?.id).toBe("default");
  });

  it("falls back to the latest earlier plan year, and never invents a value for other products", () => {
    expect(resolveAssumption(assumptions.filter((a) => a.plan_year === 2026), { productId: "p-mapd", planYear: 2027 })?.id).toBe("old");
    expect(resolveAssumption(assumptions, { productId: "p-pdp", planYear: 2027 })).toBeNull();
  });

  it("percent-of-premium needs a premium", () => {
    const pct: CommissionAssumption = { ...base, id: "pct", carrier_id: null, enrollment_type: null, basis: "percent_of_annual_premium", amount_cents: null, rate_bps: 2000 };
    expect(commissionFromAssumption(pct, 120_000)).toBe(24_000);
    expect(commissionFromAssumption(pct, null)).toBeNull();
  });
});

describe("revenue stages", () => {
  const data = aepData({
    daily: [day("2026-10-29", { mapd_apps: 4, lead_spend_cents: 5000 })],
    applications: [
      app("2026-10-29", { id: "w", status: "written" }),
      app("2026-10-29", { id: "s", status: "submitted" }),
      app("2026-10-29", { id: "ap", status: "approved", expected_commission_cents: 40000 }),
      app("2026-10-29", { id: "e", status: "effectuated", annual_premium_cents: 0 }),
      app("2026-10-30", { id: "c", status: "cancelled" }),
    ],
    transactions: [
      { id: "t1", campaign_id: "c-aep", application_id: "e", product_id: null, carrier_id: null, transaction_date: "2026-11-05", kind: "advance", amount_cents: 30000, statement_ref: null, external_id: null, notes: null },
      { id: "t2", campaign_id: "c-aep", application_id: "c", product_id: null, carrier_id: null, transaction_date: "2026-11-06", kind: "chargeback", amount_cents: 10000, statement_ref: null, external_id: null, notes: null },
    ],
    expenses: [
      { id: "x1", campaign_id: "c-aep", expense_date: "2026-10-30", category: "software", lead_source_id: null, vendor: "WAVV", description: null, amount_cents: 15000, external_id: null },
      { id: "x2", campaign_id: "c-aep", expense_date: "2026-10-30", category: "lead_cost", lead_source_id: null, vendor: null, description: null, amount_cents: 2500, external_id: null },
    ],
  });
  const r = buildSnapshot(data, { asOf: "2026-10-30" }).revenue;

  it("separates expected, submitted, approved and earned", () => {
    // MAPD counted: baseline 14 + Oct 29 max(4, 4 details) + Oct 30 max(0, 1 cancelled) = 19
    // expected excludes the cancelled one: 14 undetailed × 363 + w 363 + s 363 + ap 400 + e 363
    expect(r.expectedCents).toBe(14 * 36300 + 36300 + 36300 + 40000 + 36300);
    expect(r.submittedCents).toBe(36300 + 40000 + 36300);
    expect(r.approvedCents).toBe(40000 + 36300);
    expect(r.earnedCents).toBe(36300);
  });

  it("separates cash received from chargebacks and computes net cash contribution", () => {
    expect(r.paidCents).toBe(30000);
    expect(r.chargebackCents).toBe(10000);
    expect(r.netReceivedCents).toBe(20000);
    // lead cost = daily lead spend $50 + lead_cost expense $25
    expect(r.expenses.lead_cost).toBe(7500);
    expect(r.expenses.software).toBe(15000);
    expect(r.netCashContributionCents).toBe(20000 - 22500);
  });
});
