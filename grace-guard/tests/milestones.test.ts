import { describe, expect, it } from "vitest";
import { computeMilestones } from "@/lib/kpi/milestones";
import { buildSnapshot } from "@/lib/kpi/snapshot";
import { plannedDials, plannedDialsOn, sessionsOn } from "@/lib/kpi/schedule";
import { REPORT_SESSIONS, aepData } from "./helpers/fixtures";

/** AEP Master Performance Strategy & Milestone Tracking Report goals. */
function reportData() {
  const data = aepData();
  data.goals.push(
    { id: "g-dials", campaign_id: "c-aep", period_type: "campaign", period_start: "2026-10-15", period_end: "2026-12-07", metric: "outbound_dials", product_id: null, target_count: 1993, target_cents: null, notes: null },
    { id: "g-conn", campaign_id: "c-aep", period_type: "campaign", period_start: "2026-10-15", period_end: "2026-12-07", metric: "voice_connections", product_id: null, target_count: 157, target_cents: null, notes: null },
    { id: "g-rev", campaign_id: "c-aep", period_type: "campaign", period_start: "2026-10-15", period_end: "2026-12-07", metric: "expected_revenue", product_id: null, target_count: null, target_cents: 3_630_000, notes: null },
  );
  data.schedule!.sessions = REPORT_SESSIONS;
  return data;
}

describe("milestone table reproduces the PDF report", () => {
  const data = reportData();
  const rows = Object.fromEntries(computeMilestones(data, buildSnapshot(data, { asOf: "2026-10-29" })).map((r) => [r.key, r]));
  const r2 = (n: number | null) => (n === null ? null : Math.round(n * 10000) / 100);

  it("dials 279 → 1,714 remaining → 1,993 goal", () => {
    expect([rows.dials.current, rows.dials.remaining, rows.dials.goal]).toEqual([279, 1714, 1993]);
  });
  it("connections 22 → 135 → 157", () => {
    expect([rows.connections.current, rows.connections.remaining, rows.connections.goal]).toEqual([22, 135, 157]);
  });
  it("MAPD apps 14 → 86 → 100", () => {
    expect([rows.apps.current, rows.apps.remaining, rows.apps.goal]).toEqual([14, 86, 100]);
  });
  it("rates held at 7.89%, 63.64% and 19.93 dials per sale", () => {
    expect(r2(rows.contact.goal)).toBe(7.89);
    expect(r2(rows.close.goal)).toBe(63.64);
    expect(Math.round(rows.dps.goal! * 100) / 100).toBe(19.93);
  });
  it("revenue $5,082 → $31,218 → $36,300 (cents)", () => {
    expect([rows.revenue.current, rows.revenue.remaining, rows.revenue.goal]).toEqual([508_200, 3_121_800, 3_630_000]);
  });
  it("HIP apps: 1 written, qualitative cross-sell target", () => {
    expect(rows.hip.current).toBe(1);
    expect(rows.hip.remainingText).toBe("Cross-sell triggered");
  });
});

describe("dialing sessions drive planned dials", () => {
  const schedule = reportData().schedule!;
  it("Mon–Thu evening session targets 60 dials; Friday block targets 75", () => {
    expect(plannedDialsOn("2026-10-29", schedule)).toBe(60); // Thursday
    expect(plannedDialsOn("2026-10-30", schedule)).toBe(75); // Friday
    expect(plannedDialsOn("2026-10-31", schedule)).toBe(0); // Saturday
    expect(plannedDialsOn("2026-11-26", schedule)).toBe(0); // Thanksgiving
    expect(sessionsOn("2026-10-29", schedule).map((s) => s.kind)).toEqual(["do_not_dial", "dial"]);
  });
  it("plans 21 × 60 + 6 × 75 = 1,710 dials from Oct 29 to Dec 7", () => {
    expect(plannedDials("2026-10-29", "2026-12-07", schedule)).toBe(1710);
  });
  it("base forecast from the plan lands at ~99.8 MAPD apps", () => {
    const base = buildSnapshot(reportData(), { asOf: "2026-10-29" }).forecast.find((f) => f.key === "base")!;
    expect(base.dialsPerDaySource).toBe("planned");
    expect(base.futureDials).toBe(1710);
    expect(Math.round(base.projectedApplications! * 10) / 10).toBe(99.8);
  });
});
