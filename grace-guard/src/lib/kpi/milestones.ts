import type { CampaignData, GoalMetric } from "@/lib/domain/types";
import type { Cents } from "@/lib/money";
import { computeRevenue } from "./revenue";
import type { CampaignSnapshot } from "./snapshot";

export type MilestoneFormat = "count" | "money" | "percent" | "decimal";

export interface MilestoneRow {
  key: string;
  label: string;
  format: MilestoneFormat;
  /** campaign-to-date actual */
  current: number | null;
  /** goal − current (never negative); for rates, the rate the plan assumes */
  remaining: number | null;
  goal: number | null;
  /** text shown instead of numbers where the report uses a qualitative target */
  remainingText?: string;
  goalText?: string;
}

function campaignGoal(data: CampaignData, metric: GoalMetric, productId: string | null = null): number | null {
  const g = data.goals.find(
    (x) => x.campaign_id === data.campaign.id && x.period_type === "campaign" && x.metric === metric && x.product_id === productId,
  );
  if (!g) return null;
  return metric === "expected_revenue" || metric === "received_revenue" ? g.target_cents : g.target_count;
}

const left = (goal: number | null, current: number | null) => (goal === null || current === null ? null : Math.max(0, goal - current));

/**
 * The AEP milestone table (current baseline → remaining horizon → campaign
 * goal), recomputed live from goals and actuals. Rates are held at their
 * campaign-to-date value, as the milestone plan assumes.
 */
export function computeMilestones(data: CampaignData, s: CampaignSnapshot): MilestoneRow[] {
  const t = s.toDate.totals;
  const r = s.toDate.rates;
  const hi = s.toDate.productCounts.find((c) => c.productCode === "HOSPITAL_INDEMNITY");

  const expectedToDate: Cents = computeRevenue({
    productCounts: s.toDate.productCounts,
    applications: data.applications,
    transactions: [],
    expenses: [],
    activityLeadSpendCents: 0,
    assumptions: data.assumptions,
    planYear: s.planYear,
  }).expectedCents;

  const dialsGoal = campaignGoal(data, "outbound_dials", null);
  const connGoal = campaignGoal(data, "voice_connections", null);
  const revenueGoal = campaignGoal(data, "expected_revenue", null);
  const appsGoal = s.goal;

  const rows: MilestoneRow[] = [
    { key: "dials", label: "Gross outbound dials", format: "count", current: t.outbound_dials.value, remaining: left(dialsGoal, t.outbound_dials.value), goal: dialsGoal },
    { key: "connections", label: "Voice connections (>1 min)", format: "count", current: t.voice_connections.value, remaining: left(connGoal, t.voice_connections.value), goal: connGoal },
    { key: "contact", label: "System contact rate", format: "percent", current: r.contactRate.value, remaining: r.contactRate.value, goal: r.contactRate.value },
    { key: "apps", label: s.goalProduct ? `Total ${s.goalProduct.code} apps written` : "Total apps written", format: "count", current: s.pacing.actual, remaining: s.pacing.remaining, goal: appsGoal },
    {
      key: "hip",
      label: "Total HIP apps written",
      format: "count",
      current: hi?.counted ?? null,
      remaining: null,
      goal: null,
      remainingText: "Cross-sell triggered",
      goalText: "Dynamic pipeline",
    },
    { key: "close", label: "Conversation close rate", format: "percent", current: r.conversationCloseRate.value, remaining: r.conversationCloseRate.value, goal: r.conversationCloseRate.value },
    { key: "dps", label: "Dials needed per closed sale", format: "decimal", current: r.dialsPerApplication.value, remaining: r.dialsPerApplication.value, goal: r.dialsPerApplication.value },
    { key: "revenue", label: "Total projected revenue target", format: "money", current: expectedToDate, remaining: left(revenueGoal, expectedToDate), goal: revenueGoal },
  ];
  return rows;
}
