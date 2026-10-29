import type { ISODate } from "@/lib/dates";
import type { Cents } from "@/lib/money";

/** daily_activity / aggregate_baselines application columns, one per product line */
export const APP_COLUMNS = [
  "mapd_apps",
  "pdp_apps",
  "medsupp_apps",
  "hospital_indemnity_apps",
  "life_apps",
  "other_ancillary_apps",
] as const;
export type AppColumn = (typeof APP_COLUMNS)[number];

export const APP_COLUMN_LABELS: Record<AppColumn, string> = {
  mapd_apps: "MAPD",
  pdp_apps: "PDP",
  medsupp_apps: "Med Supp",
  hospital_indemnity_apps: "Hospital Indemnity",
  life_apps: "Life",
  other_ancillary_apps: "Other Ancillary",
};

/** Integer count fields shared by daily_activity and aggregate_baselines. */
export const COUNT_FIELDS = [
  "outbound_dials",
  "voice_connections",
  "qualified_conversations",
  "appointments_booked",
  "appointments_held",
  ...APP_COLUMNS,
  "follow_up_calls",
  "referrals_generated",
  "dialing_minutes",
] as const;
export type CountField = (typeof COUNT_FIELDS)[number];

/** Every numeric activity measure, including lead spend (cents). */
export type ActivityField = CountField | "lead_spend_cents";
export const ACTIVITY_FIELDS: readonly ActivityField[] = [...COUNT_FIELDS, "lead_spend_cents"];

export type ActivityCounts = Record<ActivityField, number>;
export type NullableActivityCounts = Record<ActivityField, number | null>;

export interface DailyActivity extends ActivityCounts {
  id: string;
  campaign_id: string;
  activity_date: ISODate;
  lead_source_id: string | null;
  notes: string | null;
  source: "manual" | "import" | "integration";
  created_at: string;
  updated_at: string;
}

export interface AggregateBaseline extends NullableActivityCounts {
  id: string;
  campaign_id: string;
  label: string;
  coverage_start: ISODate;
  as_of_date: ISODate;
  reported_metrics: Record<string, unknown>;
  source_note: string | null;
  created_at: string;
  updated_at: string;
}

export type ProductCategory =
  | "medicare_advantage"
  | "prescription_drug"
  | "medicare_supplement"
  | "hospital_indemnity"
  | "life"
  | "ancillary"
  | "other";

export interface Product {
  id: string;
  code: string;
  name: string;
  category: ProductCategory;
  daily_column: AppColumn | null;
  is_active: boolean;
  sort_order: number;
}

export interface Carrier {
  id: string;
  name: string;
  is_active: boolean;
}

export type LeadChannel = "outbound" | "inbound" | "event" | "referral" | "digital";

export interface LeadSource {
  id: string;
  code: string;
  name: string;
  channel: LeadChannel;
  is_inbound: boolean;
  is_active: boolean;
  sort_order: number;
}

export type CampaignType = "aep" | "oep" | "sep" | "annual" | "growth" | "other";
export type CampaignStatus = "planning" | "active" | "closed";

export interface Campaign {
  id: string;
  name: string;
  slug: string;
  campaign_type: CampaignType;
  campaign_year: number;
  plan_year: number | null;
  start_date: ISODate;
  end_date: ISODate;
  status: CampaignStatus;
  primary_product_id: string | null;
  forecast_assumptions: unknown;
  notes: string | null;
  updated_at?: string;
}

export type GoalPeriod = "annual" | "campaign" | "monthly" | "weekly" | "daily";
export type GoalMetric =
  | "applications"
  | "outbound_dials"
  | "voice_connections"
  | "qualified_conversations"
  | "appointments_booked"
  | "appointments_held"
  | "referrals"
  | "expected_revenue"
  | "received_revenue";

export interface CampaignGoal {
  id: string;
  campaign_id: string | null;
  period_type: GoalPeriod;
  period_start: ISODate;
  period_end: ISODate;
  metric: GoalMetric;
  product_id: string | null;
  target_count: number | null;
  target_cents: Cents | null;
  notes: string | null;
}

export interface CommissionAssumption {
  id: string;
  product_id: string;
  carrier_id: string | null;
  plan_year: number;
  enrollment_type: string | null;
  basis: "flat_per_application" | "percent_of_annual_premium";
  amount_cents: Cents | null;
  rate_bps: number | null;
  notes: string | null;
}

export interface ScheduleException {
  id: string;
  exception_date: ISODate;
  kind: "holiday" | "vacation" | "exclusion" | "extra_workday";
  note: string | null;
}

export interface DialingSession {
  id: string;
  /** 0 = Sunday ... 6 = Saturday */
  weekday: number;
  /** "HH:MM" or "HH:MM:SS" (local time) */
  start_time: string;
  end_time: string;
  kind: "dial" | "do_not_dial";
  label: string;
  target_dials: number | null;
}

export interface WorkSchedule {
  id: string | null;
  campaign_id: string;
  name: string;
  working_weekdays: number[];
  planned_dials_per_day: number | null;
  planned_hours_per_day: number | null;
  exceptions: ScheduleException[];
  /** weekly dial / do-not-dial blocks; dial targets drive planned dials */
  sessions: DialingSession[];
}

export const APPLICATION_STATUSES = [
  "written",
  "submitted",
  "approved",
  "effectuated",
  "cancelled",
  "charged_back",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  written: "Written",
  submitted: "Submitted",
  approved: "Approved",
  effectuated: "Effectuated",
  cancelled: "Cancelled",
  charged_back: "Charged back",
};

export interface Application {
  id: string;
  campaign_id: string;
  product_id: string;
  carrier_id: string | null;
  lead_source_id: string | null;
  application_ref: string | null;
  application_date: ISODate;
  status: ApplicationStatus;
  submitted_date: ISODate | null;
  approved_date: ISODate | null;
  effective_date: ISODate | null;
  cancelled_date: ISODate | null;
  charged_back_date: ISODate | null;
  enrollment_type: string | null;
  annual_premium_cents: Cents | null;
  expected_commission_cents: Cents | null;
  notes: string | null;
  updated_at?: string;
}

export const TRANSACTION_KINDS = ["advance", "paid", "renewal", "chargeback", "adjustment"] as const;
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

export interface CommissionTransaction {
  id: string;
  campaign_id: string | null;
  application_id: string | null;
  product_id: string | null;
  carrier_id: string | null;
  transaction_date: ISODate;
  kind: TransactionKind;
  amount_cents: Cents;
  statement_ref: string | null;
  external_id: string | null;
  notes: string | null;
}

export const EXPENSE_CATEGORIES = ["lead_cost", "software", "marketing", "other_operating"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  lead_cost: "Lead costs",
  software: "Software",
  marketing: "Marketing",
  other_operating: "Other operating",
};

export interface Expense {
  id: string;
  campaign_id: string | null;
  expense_date: ISODate;
  category: ExpenseCategory;
  lead_source_id: string | null;
  vendor: string | null;
  description: string | null;
  amount_cents: Cents;
  external_id: string | null;
}

export interface Lead {
  id: string;
  campaign_id: string | null;
  lead_source_id: string;
  acquired_date: ISODate;
  quantity: number;
  external_ref: string | null;
}

/** Everything the KPI engine needs for one campaign. */
export interface CampaignData {
  campaign: Campaign;
  products: Product[];
  carriers: Carrier[];
  leadSources: LeadSource[];
  goals: CampaignGoal[];
  assumptions: CommissionAssumption[];
  schedule: WorkSchedule | null;
  baselines: AggregateBaseline[];
  daily: DailyActivity[];
  applications: Application[];
  transactions: CommissionTransaction[];
  expenses: Expense[];
  leads: Lead[];
}
