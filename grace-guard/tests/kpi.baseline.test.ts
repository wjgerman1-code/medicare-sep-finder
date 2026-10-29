import { describe, expect, it } from "vitest";
import { buildSnapshot } from "@/lib/kpi/snapshot";
import { aepData, AEP_BASELINE, day } from "./helpers/fixtures";

const round2 = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);

describe("2026 AEP baseline reproduces the reported figures", () => {
  const snap = buildSnapshot(aepData(), { asOf: "2026-10-29" });
  const reported = AEP_BASELINE.reported_metrics as Record<string, number>;

  it("contact rate = 22 / 279 = 7.89%", () => {
    const r = snap.toDate.rates.contactRate;
    expect(r.numerator).toBe(22);
    expect(r.denominator).toBe(279);
    expect(round2(r.value! * 100)).toBe(reported.contact_rate_pct);
  });

  it("conversation-to-MAPD rate = 14 / 22 = 63.64%", () => {
    const r = snap.toDate.rates.conversationCloseRate;
    expect([r.numerator, r.denominator]).toEqual([14, 22]);
    expect(round2(r.value! * 100)).toBe(reported.conversation_to_mapd_application_rate_pct);
  });

  it("dials per MAPD application = 279 / 14 = 19.93", () => {
    expect(round2(snap.toDate.rates.dialsPerApplication.value)).toBe(reported.dials_per_mapd_application);
  });

  it("expected MAPD revenue = 14 × $363 = $5,082 (integer cents)", () => {
    const mapd = snap.revenue.byProduct.find((p) => p.productId === "p-mapd")!;
    expect(mapd.expectedCents).toBe(508_200);
    expect(mapd.expectedCents / 100).toBe(reported.projected_mapd_revenue);
  });

  it("projected revenue at goal = 100 × $363 = $36,300", () => {
    expect(36300 * snap.goal!).toBe(reported.projected_mapd_revenue_at_goal * 100);
  });

  it("counts 14 MAPD + 1 hospital indemnity = 15 total applications", () => {
    expect(snap.toDate.goalProductApplications).toBe(14);
    expect(snap.toDate.totalApplications).toBe(15);
  });

  it("hospital indemnity revenue is unknown (no assumption), never $0-by-default", () => {
    const hi = snap.revenue.byProduct.find((p) => p.productId === "p-hi")!;
    expect(hi.unknownApps).toBe(1);
    expect(snap.revenue.unknownCommissionApps).toBe(1);
    expect(snap.recommendations.some((r) => r.id === "assumptions")).toBe(true);
  });

  it("qualified conversations are unknown in the baseline, so the qualified rate is undefined", () => {
    expect(snap.toDate.totals.qualified_conversations.complete).toBe(false);
    expect(snap.toDate.rates.qualifiedRate.value).toBeNull();
  });
});

describe("pacing as of Oct 29, 2026 (nothing logged yet today)", () => {
  const snap = buildSnapshot(aepData(), { asOf: "2026-10-29" });
  const p = snap.pacing;

  it("goal completion 14%, 86 remaining", () => {
    expect(p.completion.value).toBeCloseTo(0.14);
    expect(p.remaining).toBe(86);
  });

  it("counts working days Mon–Fri excluding Thanksgiving", () => {
    // Oct 15–Dec 7 weekdays = 38, minus Thanksgiving = 37
    expect(p.totalWorkingDays).toBe(37);
    // Oct 15–28 weekdays = 10
    expect(p.elapsedWorkingDays).toBe(10);
    // Oct 29–Dec 7 = 27
    expect(p.remainingWorkingDays).toBe(27);
  });

  it("requires 86 / 27 ≈ 3.19 applications per day", () => {
    expect(round2(p.requiredPerDay)).toBe(3.19);
  });

  it("requires ceil(86 × 279/14) = 1,714 dials, ≈ 63.5 per day", () => {
    expect(p.requiredDials).toBe(1714);
    expect(round2(p.requiredDialsPerDay)).toBe(63.48);
  });

  it("is behind the straight-line pace (expected 27.0 by now)", () => {
    expect(round2(p.expectedByNow)).toBe(27.03);
    expect(p.status).toBe("behind");
  });

  it("projects the finish date from the current pace of 1.4 apps/day", () => {
    expect(p.currentPacePerDay).toBeCloseTo(1.4);
    // 86 / 1.4 = 61.4 → 62 working days after Oct 28
    // Oct 29–30 (2) + Nov (20) + Dec (23) + Jan 1–25 (17) = 62
    expect(p.projectedFinishDate).toBe("2027-01-25");
    expect(round2(p.projectedAtEnd)).toBe(51.8);
  });

  it("logging today moves today into elapsed days", () => {
    const s = buildSnapshot(aepData({ daily: [day("2026-10-29", { outbound_dials: 60, voice_connections: 5, qualified_conversations: 4, mapd_apps: 3 })] }), { asOf: "2026-10-29" });
    expect(s.pacing.elapsedWorkingDays).toBe(11);
    expect(s.pacing.remainingWorkingDays).toBe(26);
    expect(s.pacing.actual).toBe(17);
  });
});

describe("forecast scenarios are labelled estimates built from configurable assumptions", () => {
  const snap = buildSnapshot(aepData(), { asOf: "2026-10-29" });
  it("base case: current + historical dials/day × remaining days × apps per dial", () => {
    const base = snap.forecast.find((f) => f.key === "base")!;
    expect(base.dialsPerDaySource).toBe("historical");
    expect(base.dialsPerDay).toBeCloseTo(27.9);
    expect(base.applicationsPerDial).toBeCloseTo(14 / 279);
    // 14 + 27.9 × 27 × 14/279 = 14 + 37.8 = 51.8
    expect(round2(base.projectedApplications)).toBe(51.8);
    expect(base.goalReached).toBe(false);
    // $5,082 + 37.8 × $363 = $18,803.40
    expect(base.projectedRevenueCents).toBe(1_880_340);
  });
  it("conservative < base < aggressive", () => {
    const [c, b, a] = snap.forecast.map((f) => f.projectedApplications!);
    expect(c).toBeLessThan(b);
    expect(b).toBeLessThan(a);
  });
  it("uses planned dials per day from the schedule when set", () => {
    const data = aepData();
    data.schedule!.planned_dials_per_day = 80;
    const base = buildSnapshot(data, { asOf: "2026-10-29" }).forecast.find((f) => f.key === "base")!;
    expect(base.dialsPerDaySource).toBe("planned");
    expect(base.futureDials).toBe(80 * 27);
  });
});

describe("goal trajectory", () => {
  const snap = buildSnapshot(aepData({ daily: [day("2026-10-29", { outbound_dials: 50, voice_connections: 4, mapd_apps: 2 })] }), { asOf: "2026-10-29" });
  it("does not allocate the baseline across days", () => {
    const oct20 = snap.trajectory.find((t) => t.date === "2026-10-20")!;
    expect(oct20.actual).toBeNull();
    const oct28 = snap.trajectory.find((t) => t.date === "2026-10-28")!;
    expect(oct28.actual).toBe(14);
    expect(oct28.isBaselinePoint).toBe(true);
  });
  it("accumulates daily entries after the baseline and stops at asOf", () => {
    expect(snap.trajectory.find((t) => t.date === "2026-10-29")!.actual).toBe(16);
    expect(snap.trajectory.find((t) => t.date === "2026-10-30")!.actual).toBeNull();
  });
  it("required line reaches the goal on the last day", () => {
    expect(snap.trajectory.at(-1)!.required).toBe(100);
  });
});
