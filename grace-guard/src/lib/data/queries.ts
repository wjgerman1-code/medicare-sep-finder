import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type {
  AggregateBaseline,
  Application,
  Campaign,
  CampaignData,
  CampaignGoal,
  Carrier,
  CommissionAssumption,
  CommissionTransaction,
  DailyActivity,
  DialingSession,
  Expense,
  Lead,
  LeadSource,
  Product,
  ScheduleException,
  WorkSchedule,
} from "@/lib/domain/types";
import { createClient, type ServerSupabase } from "@/lib/supabase/server";

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  agency_name: string;
  timezone: string;
  default_campaign_id: string | null;
}

export interface Workspace {
  supabase: ServerSupabase;
  userId: string;
  email: string | null;
  profile: Profile;
  campaigns: Campaign[];
  products: Product[];
  leadSources: LeadSource[];
  carriers: Carrier[];
}

function must<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`Failed to load ${what}: ${result.error.message}`);
  return (result.data ?? []) as T;
}

/**
 * Loads the signed-in user's workspace (cached per request). Seeds the
 * default workspace on first visit if the signup trigger hasn't.
 */
export const getWorkspace = cache(async (): Promise<Workspace> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let profileRes = await supabase.from("users").select("*").eq("id", user.id).maybeSingle();
  if (!profileRes.data) {
    await supabase.rpc("initialize_workspace");
    profileRes = await supabase.from("users").select("*").eq("id", user.id).maybeSingle();
  }

  const [campaigns, products, leadSources, carriers] = await Promise.all([
    supabase.from("campaigns").select("*").order("start_date", { ascending: false }),
    supabase.from("products").select("*").order("sort_order"),
    supabase.from("lead_sources").select("*").order("sort_order"),
    supabase.from("carriers").select("*").order("name"),
  ]);

  return {
    supabase,
    userId: user.id,
    email: user.email ?? null,
    profile: (profileRes.data as Profile) ?? {
      id: user.id,
      email: user.email ?? null,
      full_name: null,
      agency_name: "Grace & Guard",
      timezone: "America/New_York",
      default_campaign_id: null,
    },
    campaigns: must(campaigns, "campaigns") as Campaign[],
    products: must(products, "products") as Product[],
    leadSources: must(leadSources, "lead sources") as LeadSource[],
    carriers: must(carriers, "carriers") as Carrier[],
  };
});

/** Campaign from ?campaign=<slug|id>, else the profile default, else the latest active one. */
export function resolveCampaign(ws: Workspace, param?: string | string[] | null): Campaign | null {
  const key = Array.isArray(param) ? param[0] : param;
  if (key) {
    const hit = ws.campaigns.find((c) => c.slug === key || c.id === key);
    if (hit) return hit;
  }
  return (
    ws.campaigns.find((c) => c.id === ws.profile.default_campaign_id) ??
    ws.campaigns.find((c) => c.status === "active") ??
    ws.campaigns[0] ??
    null
  );
}

export async function loadCampaignData(ws: Workspace, campaign: Campaign): Promise<CampaignData> {
  const sb = ws.supabase;
  const id = campaign.id;
  const [goals, assumptions, schedule, baselines, daily, applications, transactions, expenses, leads] = await Promise.all([
    sb.from("campaign_goals").select("*").or(`campaign_id.eq.${id},campaign_id.is.null`),
    sb.from("commission_assumptions").select("*"),
    sb.from("work_schedules").select("*, work_schedule_exceptions(*), dialing_sessions(*)").eq("campaign_id", id).maybeSingle(),
    sb.from("aggregate_baselines").select("*").eq("campaign_id", id).order("as_of_date"),
    sb.from("daily_activity").select("*").eq("campaign_id", id).order("activity_date", { ascending: false }),
    sb.from("applications").select("*").eq("campaign_id", id).order("application_date", { ascending: false }),
    sb.from("commission_transactions").select("*").eq("campaign_id", id).order("transaction_date", { ascending: false }),
    sb.from("expenses").select("*").eq("campaign_id", id).order("expense_date", { ascending: false }),
    sb.from("leads").select("*").eq("campaign_id", id).order("acquired_date", { ascending: false }),
  ]);

  if (schedule.error) throw new Error(`Failed to load schedule: ${schedule.error.message}`);
  const s = schedule.data as (Omit<WorkSchedule, "exceptions" | "sessions"> & { work_schedule_exceptions: ScheduleException[]; dialing_sessions: DialingSession[] }) | null;

  return {
    campaign,
    products: ws.products,
    carriers: ws.carriers,
    leadSources: ws.leadSources,
    goals: normalizeGoals(must(goals, "goals") as CampaignGoal[]),
    assumptions: must(assumptions, "commission assumptions") as CommissionAssumption[],
    schedule: s
      ? {
          id: s.id,
          campaign_id: s.campaign_id,
          name: s.name,
          working_weekdays: s.working_weekdays,
          planned_dials_per_day: s.planned_dials_per_day,
          planned_hours_per_day: s.planned_hours_per_day === null ? null : Number(s.planned_hours_per_day),
          exceptions: [...(s.work_schedule_exceptions ?? [])].sort((a, b) => (a.exception_date < b.exception_date ? -1 : 1)),
          sessions: [...(s.dialing_sessions ?? [])].sort((a, b) => a.weekday - b.weekday || (a.start_time < b.start_time ? -1 : 1)),
        }
      : null,
    baselines: must(baselines, "baselines") as AggregateBaseline[],
    daily: must(daily, "daily activity") as DailyActivity[],
    applications: must(applications, "applications") as Application[],
    transactions: must(transactions, "commission transactions") as CommissionTransaction[],
    expenses: must(expenses, "expenses") as Expense[],
    leads: must(leads, "leads") as Lead[],
  };
}

/** Postgres numeric comes back as a string from PostgREST; normalize goal targets. */
export function normalizeGoals(goals: CampaignGoal[]): CampaignGoal[] {
  return goals.map((g) => ({ ...g, target_count: g.target_count === null ? null : Number(g.target_count) }));
}
