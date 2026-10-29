import { describe, expect, it } from "vitest";
import { collectActivity, pairedRatio, totals } from "@/lib/kpi/aggregate";
import { combineRatios, ratio } from "@/lib/kpi/ratio";
import { reconcileApplications } from "@/lib/kpi/reconcile";
import { countWorkingDays, isWorkingDay } from "@/lib/kpi/schedule";
import { buildSnapshot } from "@/lib/kpi/snapshot";
import { AEP_BASELINE, PRODUCTS, aepData, app, day } from "./helpers/fixtures";

describe("ratios", () => {
  it("handle zero and missing denominators gracefully", () => {
    expect(ratio(5, 0).value).toBeNull();
    expect(ratio(null, 10).value).toBeNull();
    expect(ratio(5, null).value).toBeNull();
    expect(ratio(0, 10).value).toBe(0);
  });

  it("weights from raw totals instead of averaging daily percentages", () => {
    // day 1: 1/10 = 10%, day 2: 30/100 = 30% → simple average 20%, weighted 31/110 = 28.2%
    const combined = combineRatios([ratio(1, 10), ratio(30, 100)]);
    expect(combined.value).toBeCloseTo(31 / 110);
    const sources = collectActivity([], [day("2026-11-02", { outbound_dials: 10, voice_connections: 1 }), day("2026-11-03", { outbound_dials: 100, voice_connections: 30 })]).sources;
    expect(pairedRatio(sources, "voice_connections", "outbound_dials").value).toBeCloseTo(31 / 110);
  });
});

describe("baseline reconciliation", () => {
  it("excludes daily rows dated inside the baseline window", () => {
    const inside = day("2026-10-27", { outbound_dials: 50, mapd_apps: 2 });
    const after = day("2026-10-29", { outbound_dials: 60, mapd_apps: 3 });
    const c = collectActivity([AEP_BASELINE], [inside, after]);
    expect(c.coveredDaily.map((d) => d.id)).toEqual([inside.id]);
    const t = totals(c.sources);
    expect(t.outbound_dials.value).toBe(279 + 60);
    expect(t.mapd_apps.value).toBe(14 + 3);
  });

  it("never splits the baseline across a partially overlapping date filter", () => {
    const c = collectActivity([AEP_BASELINE], [day("2026-10-29", { outbound_dials: 60 })], { from: "2026-10-25", to: "2026-10-31" });
    expect(c.excludedBaselines.map((e) => e.reason)).toEqual(["partial_overlap"]);
    expect(totals(c.sources).outbound_dials.value).toBe(60);
  });

  it("includes the baseline when its whole window is in range", () => {
    const c = collectActivity([AEP_BASELINE], [], { from: "2026-10-15", to: "2026-10-31" });
    expect(c.sources).toHaveLength(1);
  });

  it("only compares populations where both values were captured", () => {
    // baseline did not capture qualified conversations; daily row did
    const sources = collectActivity([AEP_BASELINE], [day("2026-10-29", { outbound_dials: 60, voice_connections: 6, qualified_conversations: 4 })]).sources;
    const r = pairedRatio(sources, "qualified_conversations", "voice_connections");
    expect([r.numerator, r.denominator]).toEqual([4, 6]);
    expect(totals(sources).qualified_conversations.complete).toBe(false);
  });
});

describe("detailed applications never double count", () => {
  const baselines = [AEP_BASELINE];
  const sources = (daily = [day("2026-10-29", { mapd_apps: 3 })]) => collectActivity(baselines, daily).sources;
  const mapd = (counts: ReturnType<typeof reconcileApplications>) => counts.find((c) => c.productCode === "MAPD")!;

  it("detail records itemize the aggregate for their day", () => {
    const counts = reconcileApplications(PRODUCTS, sources(), [app("2026-10-29"), app("2026-10-29")], baselines);
    expect(mapd(counts)).toMatchObject({ aggregate: 17, detailed: 2, counted: 17, undetailed: 15 });
  });

  it("detail records beyond the aggregate are counted", () => {
    const counts = reconcileApplications(PRODUCTS, sources(), [app("2026-10-29"), app("2026-10-29"), app("2026-10-29"), app("2026-10-29")], baselines);
    expect(mapd(counts).counted).toBe(14 + 4);
  });

  it("detail records inside the baseline window reconcile against the baseline", () => {
    const counts = reconcileApplications(PRODUCTS, sources([]), [app("2026-10-16"), app("2026-10-20")], baselines);
    expect(mapd(counts)).toMatchObject({ counted: 14, undetailed: 12 });
  });

  it("detail records on a day without aggregate entries are added", () => {
    const counts = reconcileApplications(PRODUCTS, sources(), [app("2026-11-02")], baselines);
    expect(mapd(counts).counted).toBe(14 + 3 + 1);
  });

  it("snapshot revenue prices only undetailed aggregate apps by assumption, details by their own amount", () => {
    const s = buildSnapshot(
      aepData({ daily: [day("2026-10-29", { mapd_apps: 3 })], applications: [app("2026-10-29", { expected_commission_cents: 40000 })] }),
      { asOf: "2026-10-29" },
    );
    const m = s.revenue.byProduct.find((p) => p.productId === "p-mapd")!;
    // 16 undetailed × $363 + 1 × $400
    expect(m.expectedCents).toBe(16 * 36300 + 40000);
  });
});

describe("working-day schedules", () => {
  const schedule = aepData().schedule!;
  it("skips weekends and holidays, honours extra workdays", () => {
    expect(isWorkingDay("2026-11-26", schedule)).toBe(false); // Thanksgiving
    expect(isWorkingDay("2026-10-31", schedule)).toBe(false); // Saturday
    const withSaturday = { ...schedule, exceptions: [...schedule.exceptions, { id: "x", exception_date: "2026-10-31", kind: "extra_workday" as const, note: null }] };
    expect(isWorkingDay("2026-10-31", withSaturday)).toBe(true);
    const withVacation = { ...schedule, exceptions: [...schedule.exceptions, { id: "v", exception_date: "2026-11-02", kind: "vacation" as const, note: null }] };
    expect(countWorkingDays("2026-11-02", "2026-11-06", withVacation)).toBe(4);
  });

  it("vacation days raise the required daily pace", () => {
    const data = aepData();
    const before = buildSnapshot(data, { asOf: "2026-10-29" }).pacing.requiredPerDay!;
    data.schedule!.exceptions.push({ id: "v1", exception_date: "2026-11-02", kind: "vacation", note: null }, { id: "v2", exception_date: "2026-11-03", kind: "vacation", note: null });
    const after = buildSnapshot(data, { asOf: "2026-10-29" }).pacing.requiredPerDay!;
    expect(after).toBeCloseTo(86 / 25);
    expect(after).toBeGreaterThan(before);
  });

  it("handles a campaign that has not started or has ended", () => {
    const pre = buildSnapshot(aepData(), { asOf: "2026-10-01" }).pacing;
    expect(pre.phase).toBe("before");
    const post = buildSnapshot(aepData(), { asOf: "2026-12-20" }).pacing;
    expect(post.phase).toBe("after");
    expect(post.remainingWorkingDays).toBe(0);
    expect(post.requiredPerDay).toBeNull();
    expect(post.status).toBe("ended");
  });

  it("handles a campaign with no data at all", () => {
    const s = buildSnapshot(aepData({ baselines: [] }), { asOf: "2026-10-29" });
    expect(s.pacing.actual).toBe(0);
    expect(s.pacing.dialsPerApplication.value).toBeNull();
    expect(s.pacing.requiredDials).toBeNull();
    expect(s.forecast.every((f) => f.projectedApplications === null)).toBe(true);
  });
});
