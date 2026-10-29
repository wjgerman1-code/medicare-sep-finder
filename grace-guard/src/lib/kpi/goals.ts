import type { ISODate } from "@/lib/dates";
import type { CampaignData, CampaignGoal, GoalMetric } from "@/lib/domain/types";
import { collectActivity, sumField } from "./aggregate";
import { reconcileApplications } from "./reconcile";
import { computeRevenue } from "./revenue";
import { countWorkingDays } from "./schedule";
import { ratio, type Ratio } from "./ratio";

export interface GoalProgress {
  goal: CampaignGoal;
  /** actual achieved inside the goal period (cents for revenue metrics) */
  actual: number;
  target: number;
  completion: Ratio;
  remaining: number;
  remainingWorkingDays: number;
  requiredPerDay: number | null;
  isMoney: boolean;
  /** the baseline could not be included because it straddles the goal period */
  baselineExcluded: boolean;
}

const ACTIVITY_METRIC: Partial<Record<GoalMetric, Parameters<typeof sumField>[1]>> = {
  outbound_dials: "outbound_dials",
  voice_connections: "voice_connections",
  qualified_conversations: "qualified_conversations",
  appointments_booked: "appointments_booked",
  appointments_held: "appointments_held",
  referrals: "referrals_generated",
};

export function goalProgress(goal: CampaignGoal, data: CampaignData, asOf: ISODate): GoalProgress {
  const from = goal.period_start;
  const to = goal.period_end;
  const collected = collectActivity(data.baselines, data.daily, { from, to });
  const apps = data.applications.filter((a) => a.application_date >= from && a.application_date <= to);
  const products = goal.product_id ? data.products.filter((p) => p.id === goal.product_id) : data.products;
  const isMoney = goal.metric === "expected_revenue" || goal.metric === "received_revenue";

  let actual = 0;
  const field = ACTIVITY_METRIC[goal.metric];
  if (field) {
    actual = sumField(collected.sources, field).value;
  } else if (goal.metric === "applications") {
    actual = reconcileApplications(products, collected.sources, apps, data.baselines).reduce((a, c) => a + c.counted, 0);
  } else {
    const productCounts = reconcileApplications(products, collected.sources, apps, data.baselines);
    const rev = computeRevenue({
      productCounts,
      applications: apps.filter((a) => products.some((p) => p.id === a.product_id)),
      transactions: data.transactions.filter((t) => t.transaction_date >= from && t.transaction_date <= to),
      expenses: [],
      activityLeadSpendCents: 0,
      assumptions: data.assumptions,
      planYear: data.campaign.plan_year ?? data.campaign.campaign_year,
    });
    actual = goal.metric === "expected_revenue" ? rev.expectedCents : rev.netReceivedCents;
  }

  const target = (isMoney ? goal.target_cents : goal.target_count) ?? 0;
  const remaining = Math.max(0, target - actual);
  const start = asOf > from ? asOf : from;
  const remainingWorkingDays = start > to ? 0 : countWorkingDays(start, to, data.schedule);
  return {
    goal,
    actual,
    target,
    completion: ratio(actual, target),
    remaining,
    remainingWorkingDays,
    requiredPerDay: remaining === 0 ? 0 : remainingWorkingDays > 0 ? remaining / remainingWorkingDays : null,
    isMoney,
    baselineExcluded: collected.excludedBaselines.some((e) => e.reason === "partial_overlap"),
  };
}
