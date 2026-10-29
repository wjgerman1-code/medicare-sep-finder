import { describe, expect, it } from "vitest";
import { safeCell, parseCsv, toCsv } from "@/lib/csv/csv";
import { mapApplicationRows, mapDailyActivityRows, mapTransactionRows } from "@/lib/csv/importers";
import { applicationSchema, assumptionSchema, dailyActivitySchema, dailyActivityWarnings, flattenErrors, goalSchema } from "@/lib/validation/schemas";

const CAMPAIGN_ID = "0b6f5d0e-6c1f-4d7e-9a3e-2f1c0e9d8a71";
const SRC_OUT = "1a2b3c4d-0000-4000-8000-000000000001";
const SRC_IN = "1a2b3c4d-0000-4000-8000-000000000002";
const PRODUCT = "1a2b3c4d-0000-4000-8000-0000000000aa";
const ctx = { campaign: { id: CAMPAIGN_ID, start_date: "2026-10-15", end_date: "2026-12-07" } };
const schema = (inbound = false) => dailyActivitySchema({ campaign: ctx.campaign, leadSourceIsInbound: inbound });
const base = { campaign_id: CAMPAIGN_ID, activity_date: "2026-10-29" };

describe("daily activity validation", () => {
  it("accepts a normal day and coerces blank fields to 0", () => {
    const r = schema().safeParse({ ...base, outbound_dials: "64", voice_connections: "6", mapd_apps: "3", lead_spend_cents: "45.50", notes: "" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.qualified_conversations).toBe(0);
      expect(r.data.lead_spend_cents).toBe(4550);
      expect(r.data.notes).toBeNull();
    }
  });

  it("rejects negatives, decimals and junk", () => {
    const r = schema().safeParse({ ...base, outbound_dials: "-3", voice_connections: "1.5", mapd_apps: "abc" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const e = flattenErrors(r.error);
      expect(e.outbound_dials).toMatch(/negative/);
      expect(e.voice_connections).toMatch(/Whole numbers/);
      expect(e.mapd_apps).toBeTruthy();
    }
  });

  it("rejects connections above dials, unless the lead source is inbound", () => {
    const row = { ...base, outbound_dials: "0", voice_connections: "8" };
    expect(schema(false).safeParse(row).success).toBe(false);
    expect(schema(true).safeParse(row).success).toBe(true);
  });

  it("rejects qualified conversations above connections", () => {
    const r = schema().safeParse({ ...base, outbound_dials: "10", voice_connections: "2", qualified_conversations: "3" });
    expect(r.success).toBe(false);
  });

  it("rejects dates outside the campaign", () => {
    expect(schema().safeParse({ ...base, activity_date: "2026-12-08" }).success).toBe(false);
    expect(schema().safeParse({ ...base, activity_date: "2026-02-30" }).success).toBe(false);
  });

  it("warns (but allows) more applications than conversations", () => {
    const r = schema().safeParse({ ...base, outbound_dials: "10", voice_connections: "1", mapd_apps: "3" });
    expect(r.success).toBe(true);
    if (r.success) expect(dailyActivityWarnings(r.data).length).toBeGreaterThan(0);
  });
});

describe("no sensitive beneficiary identifiers", () => {
  const appRow = { campaign_id: CAMPAIGN_ID, product_id: PRODUCT, application_date: "2026-10-29", status: "written" };
  it.each(["123-45-6789", "123456789", "1EG4-TE5-MK73", "1EG4TE5MK73"])("rejects %s as a reference", (ref) => {
    expect(applicationSchema.safeParse({ ...appRow, application_ref: ref }).success).toBe(false);
  });
  it("accepts internal references", () => {
    expect(applicationSchema.safeParse({ ...appRow, application_ref: "GG-2026-0042" }).success).toBe(true);
  });
});

describe("goals and assumptions", () => {
  it("stores revenue goals in cents and count goals as counts", () => {
    const g = { campaign_id: CAMPAIGN_ID, period_type: "campaign", period_start: "2026-10-15", period_end: "2026-12-07", product_id: "", notes: "" };
    expect(goalSchema.parse({ ...g, metric: "expected_revenue", target: "36,300.00" })).toMatchObject({ target_cents: 3_630_000, target_count: null });
    expect(goalSchema.parse({ ...g, metric: "applications", target: "100" })).toMatchObject({ target_count: 100, target_cents: null });
    expect(goalSchema.safeParse({ ...g, metric: "applications", target: "-1" }).success).toBe(false);
  });

  it("converts percent commission rates to basis points exactly", () => {
    const a = assumptionSchema.parse({ product_id: PRODUCT, carrier_id: "", plan_year: "2027", enrollment_type: "", basis: "percent_of_annual_premium", amount: "", rate_percent: "7.25", notes: "" });
    expect(a).toMatchObject({ rate_bps: 725, amount_cents: null });
    const f = assumptionSchema.parse({ product_id: PRODUCT, carrier_id: "", plan_year: "2027", enrollment_type: "", basis: "flat_per_application", amount: "363", rate_percent: "", notes: "" });
    expect(f).toMatchObject({ amount_cents: 36300, rate_bps: null });
  });
});

describe("CSV import/export", () => {
  const importCtx = {
    ...ctx,
    leadSources: [
      { id: SRC_OUT, code: "WAVV_OUTBOUND", is_inbound: false },
      { id: SRC_IN, code: "LIVE_TRANSFER", is_inbound: true },
    ],
    products: [{ id: PRODUCT, code: "MAPD" }],
    carriers: [],
  };

  it("neutralizes spreadsheet formula injection but keeps numbers", () => {
    expect(safeCell("=HYPERLINK(\"x\")")).toBe("'=HYPERLINK(\"x\")");
    expect(safeCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(safeCell("-12.50")).toBe("-12.50");
    expect(safeCell(363)).toBe("363");
  });

  it("round-trips daily activity and validates every row", () => {
    const csv = [
      "Activity Date,Lead Source,Outbound Dials,Voice Connections,MAPD Apps,Lead Spend",
      "2026-10-29,WAVV_OUTBOUND,64,6,3,45.00",
      "2026-10-30,LIVE_TRANSFER,0,5,2,",
      "2026-10-30,UNKNOWN,10,1,0,",
      "2026-10-31,WAVV_OUTBOUND,5,9,0,",
      "2026-10-29,WAVV_OUTBOUND,1,1,0,",
    ].join("\n");
    const { rows } = parseCsv(csv);
    const mapped = mapDailyActivityRows(rows, importCtx);
    expect(mapped.valid.map((v) => v.row)).toEqual([2, 3]);
    expect(mapped.valid[0].value.lead_spend_cents).toBe(4500);
    expect(mapped.errors.map((e) => e.row).sort()).toEqual([4, 5, 6]);
    expect(mapped.errors.find((e) => e.row === 6)?.message).toMatch(/Duplicate/);
  });

  it("requires application_ref so re-imports update instead of duplicating", () => {
    const { rows } = parseCsv("application_ref,product,application_date,status\n,MAPD,2026-10-29,written\nGG-1,MAPD,2026-10-29,Submitted");
    const mapped = mapApplicationRows(rows, importCtx);
    expect(mapped.errors[0].message).toMatch(/application_ref is required/);
    expect(mapped.valid[0].value).toMatchObject({ application_ref: "GG-1", status: "submitted" });
  });

  it("derives a stable external id for statement lines without one (idempotent)", () => {
    const csv = "transaction_date,kind,amount\n2026-11-05,paid,363.00";
    const a = mapTransactionRows(parseCsv(csv).rows, { ...importCtx, applicationsByRef: new Map() });
    const b = mapTransactionRows(parseCsv(csv).rows, { ...importCtx, applicationsByRef: new Map() });
    expect(a.valid[0].value.external_id).toMatch(/^csv:/);
    expect(a.valid[0].value.external_id).toBe(b.valid[0].value.external_id);
    expect(a.valid[0].value.amount_cents).toBe(36300);
  });

  it("exports with headers", () => {
    const out = toCsv([{ a: 1, b: "x,y" }], [{ header: "a", value: (r) => r.a }, { header: "b", value: (r) => r.b }]);
    expect(out).toBe('a,b\r\n1,"x,y"');
  });
});
