import { ACTIVITY_FIELDS, type AggregateBaseline, type Application, type CampaignData, type DailyActivity, type NullableActivityCounts, type Product } from "@/lib/domain/types";
import { DEFAULT_FORECAST_ASSUMPTIONS } from "@/lib/kpi/forecast";

export const PRODUCTS: Product[] = [
  { id: "p-mapd", code: "MAPD", name: "Medicare Advantage (MAPD)", category: "medicare_advantage", daily_column: "mapd_apps", is_active: true, sort_order: 10 },
  { id: "p-pdp", code: "PDP", name: "Prescription Drug Plan (PDP)", category: "prescription_drug", daily_column: "pdp_apps", is_active: true, sort_order: 20 },
  { id: "p-hi", code: "HOSPITAL_INDEMNITY", name: "Hospital Indemnity", category: "hospital_indemnity", daily_column: "hospital_indemnity_apps", is_active: true, sort_order: 40 },
];

function nulls(): NullableActivityCounts {
  return Object.fromEntries(ACTIVITY_FIELDS.map((f) => [f, null])) as NullableActivityCounts;
}

export const AEP_BASELINE: AggregateBaseline = {
  ...nulls(),
  id: "b-1",
  campaign_id: "c-aep",
  label: "AEP launch baseline",
  coverage_start: "2026-10-15",
  as_of_date: "2026-10-28",
  outbound_dials: 279,
  voice_connections: 22,
  mapd_apps: 14,
  hospital_indemnity_apps: 1,
  reported_metrics: {
    contact_rate_pct: 7.89,
    conversation_to_mapd_application_rate_pct: 63.64,
    dials_per_mapd_application: 19.93,
    assumed_mapd_revenue_per_application: 363,
    projected_mapd_revenue: 5082,
    projected_mapd_revenue_at_goal: 36300,
  },
  source_note: null,
  created_at: "2026-10-29T00:00:00Z",
  updated_at: "2026-10-29T00:00:00Z",
};

let seq = 0;
export function day(date: string, values: Partial<DailyActivity> = {}): DailyActivity {
  const zero = Object.fromEntries(ACTIVITY_FIELDS.map((f) => [f, 0]));
  return {
    ...(zero as Record<(typeof ACTIVITY_FIELDS)[number], number>),
    id: `d-${++seq}`,
    campaign_id: "c-aep",
    activity_date: date,
    lead_source_id: null,
    notes: null,
    source: "manual",
    created_at: `${date}T20:00:00Z`,
    updated_at: `${date}T20:00:00Z`,
    ...values,
  };
}

export function app(date: string, values: Partial<Application> = {}): Application {
  return {
    id: `a-${++seq}`,
    campaign_id: "c-aep",
    product_id: "p-mapd",
    carrier_id: null,
    lead_source_id: null,
    application_ref: null,
    application_date: date,
    status: "written",
    submitted_date: null,
    approved_date: null,
    effective_date: null,
    cancelled_date: null,
    charged_back_date: null,
    enrollment_type: null,
    annual_premium_cents: null,
    expected_commission_cents: null,
    notes: null,
    ...values,
  };
}

export function aepData(overrides: Partial<CampaignData> = {}): CampaignData {
  return {
    campaign: {
      id: "c-aep",
      name: "2026 Medicare AEP",
      slug: "aep-2026",
      campaign_type: "aep",
      campaign_year: 2026,
      plan_year: 2027,
      start_date: "2026-10-15",
      end_date: "2026-12-07",
      status: "active",
      primary_product_id: "p-mapd",
      forecast_assumptions: DEFAULT_FORECAST_ASSUMPTIONS,
      notes: null,
    },
    products: PRODUCTS,
    carriers: [],
    leadSources: [],
    goals: [
      { id: "g-1", campaign_id: "c-aep", period_type: "campaign", period_start: "2026-10-15", period_end: "2026-12-07", metric: "applications", product_id: "p-mapd", target_count: 100, target_cents: null, notes: null },
    ],
    assumptions: [
      { id: "ca-1", product_id: "p-mapd", carrier_id: null, plan_year: 2027, enrollment_type: null, basis: "flat_per_application", amount_cents: 36300, rate_bps: null, notes: null },
    ],
    schedule: {
      id: "s-1",
      campaign_id: "c-aep",
      name: "AEP",
      working_weekdays: [1, 2, 3, 4, 5],
      planned_dials_per_day: null,
      planned_hours_per_day: null,
      exceptions: [{ id: "e-1", exception_date: "2026-11-26", kind: "holiday", note: "Thanksgiving" }],
      sessions: [],
    },
    baselines: [AEP_BASELINE],
    daily: [],
    applications: [],
    transactions: [],
    expenses: [],
    leads: [],
    ...overrides,
  };
}

/** Weekly dialing plan from the AEP milestone report. */
export const REPORT_SESSIONS: import("@/lib/domain/types").DialingSession[] = [
  ...[1, 2, 3, 4].flatMap((d) => [
    { id: `dnd-${d}`, weekday: d, start_time: "15:40", end_time: "16:20", kind: "do_not_dial" as const, label: "Commute / transit block", target_dials: null },
    { id: `dial-${d}`, weekday: d, start_time: "16:30", end_time: "18:30", kind: "dial" as const, label: "Outbound dialer session", target_dials: 60 },
  ]),
  { id: "dnd-5", weekday: 5, start_time: "06:00", end_time: "10:00", kind: "do_not_dial", label: "Standard job shift", target_dials: null },
  { id: "dial-5", weekday: 5, start_time: "10:30", end_time: "13:00", kind: "dial", label: "Late morning velocity block", target_dials: 75 },
];
