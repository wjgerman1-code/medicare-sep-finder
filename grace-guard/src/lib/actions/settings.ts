"use server";

import { z } from "zod";
import { ACTIVITY_FIELDS } from "@/lib/domain/types";
import { forecastAssumptionsSchema, SCENARIO_KEYS } from "@/lib/kpi/forecast";
import {
  assumptionSchema,
  campaignSchema,
  carrierSchema,
  count,
  formToObject,
  goalSchema,
  id as idSchema,
  isoDate,
  leadSourceSchema,
  moneyCents,
  productSchema,
  profileSchema,
  scheduleExceptionSchema,
  scheduleSchema,
  dialingSessionSchema,
} from "@/lib/validation/schemas";
import { dbError, fail, invalid, ok, requireUser, str } from "./helpers";
import type { ActionResult } from "./result";

type Table =
  | "campaigns"
  | "campaign_goals"
  | "products"
  | "carriers"
  | "lead_sources"
  | "commission_assumptions"
  | "work_schedule_exceptions";

async function upsertRow(table: Table, data: { id?: string | null } & Record<string, unknown>, duplicate: string) {
  const { supabase } = await requireUser();
  const { id, ...row } = data;
  const res = id ? await supabase.from(table).update(row).eq("id", id) : await supabase.from(table).insert(row);
  return res.error ? dbError(res.error, duplicate) : null;
}

async function deleteRow(table: Table, form: FormData, label: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const parsed = idSchema.safeParse(str(form, "id"));
  if (!parsed.success) return fail("Invalid record.");
  const { error } = await supabase.from(table).delete().eq("id", parsed.data);
  if (error) return dbError(error);
  return ok(`${label} deleted.`);
}

// ---------------------------------------------------------------- campaigns
export async function saveCampaign(_p: ActionResult, form: FormData): Promise<ActionResult> {
  const parsed = campaignSchema.safeParse(formToObject(form));
  if (!parsed.success) return invalid(parsed.error);
  const err = await upsertRow("campaigns", parsed.data, "A campaign with that short name (slug) already exists.");
  if (err) return err;
  if (!parsed.data.id) {
    // every campaign gets a default Mon–Fri schedule
    const { supabase } = await requireUser();
    const { data: c } = await supabase.from("campaigns").select("id").eq("slug", parsed.data.slug).maybeSingle();
    if (c) await supabase.from("work_schedules").insert({ campaign_id: c.id, name: "Default schedule" });
  }
  return ok("Campaign saved.");
}

const scenarioForm = z.object({
  campaign_id: idSchema,
  ...Object.fromEntries(
    SCENARIO_KEYS.flatMap((k) => [
      [`${k}_rate`, z.coerce.number().min(0).max(5)],
      [`${k}_dials`, z.coerce.number().min(0).max(5)],
      [`${k}_dials_override`, z.preprocess((v) => (v === "" ? null : v), z.coerce.number().int().min(0).max(5000).nullable())],
    ]),
  ),
});

export async function saveForecastAssumptions(_p: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const parsed = scenarioForm.safeParse(formToObject(form));
  if (!parsed.success) return invalid(parsed.error);
  const v = parsed.data as Record<string, number | null> & { campaign_id: string };
  const labels = { conservative: "Conservative", base: "Base case", aggressive: "Aggressive" } as const;
  const assumptions = forecastAssumptionsSchema.parse({
    scenarios: Object.fromEntries(
      SCENARIO_KEYS.map((k) => [
        k,
        {
          label: labels[k],
          applicationsPerDialMultiplier: v[`${k}_rate`],
          dialsPerDayMultiplier: v[`${k}_dials`],
          dialsPerDayOverride: v[`${k}_dials_override`],
        },
      ]),
    ),
  });
  const { error } = await supabase.from("campaigns").update({ forecast_assumptions: assumptions }).eq("id", v.campaign_id);
  if (error) return dbError(error);
  return ok("Forecast assumptions saved.");
}

// ---------------------------------------------------------------- goals
export async function saveGoal(_p: ActionResult, form: FormData): Promise<ActionResult> {
  const parsed = goalSchema.safeParse(formToObject(form));
  if (!parsed.success) return invalid(parsed.error);
  const err = await upsertRow("campaign_goals", parsed.data, "A goal for that period, metric and product already exists — edit it instead.");
  return err ?? ok("Goal saved.");
}
export async function deleteGoal(_p: ActionResult, form: FormData) {
  return deleteRow("campaign_goals", form, "Goal");
}

// ---------------------------------------------------------------- products, carriers, lead sources
export async function saveProduct(_p: ActionResult, form: FormData): Promise<ActionResult> {
  const parsed = productSchema.safeParse(formToObject(form));
  if (!parsed.success) return invalid(parsed.error);
  const err = await upsertRow("products", parsed.data, "That product code or daily column is already in use.");
  return err ?? ok("Product saved.");
}

export async function saveCarrier(_p: ActionResult, form: FormData): Promise<ActionResult> {
  const parsed = carrierSchema.safeParse(formToObject(form));
  if (!parsed.success) return invalid(parsed.error);
  const err = await upsertRow("carriers", parsed.data, "That carrier already exists.");
  return err ?? ok("Carrier saved.");
}
export async function deleteCarrier(_p: ActionResult, form: FormData) {
  return deleteRow("carriers", form, "Carrier");
}

export async function saveLeadSource(_p: ActionResult, form: FormData): Promise<ActionResult> {
  const parsed = leadSourceSchema.safeParse(formToObject(form));
  if (!parsed.success) return invalid(parsed.error);
  const err = await upsertRow("lead_sources", parsed.data, "That lead source code already exists.");
  return err ?? ok("Lead source saved.");
}

// ---------------------------------------------------------------- commission assumptions
export async function saveAssumption(_p: ActionResult, form: FormData): Promise<ActionResult> {
  const parsed = assumptionSchema.safeParse(formToObject(form));
  if (!parsed.success) return invalid(parsed.error);
  const err = await upsertRow("commission_assumptions", parsed.data, "An assumption for that product, carrier, plan year and enrollment type already exists.");
  return err ?? ok("Commission assumption saved.");
}
export async function deleteAssumption(_p: ActionResult, form: FormData) {
  return deleteRow("commission_assumptions", form, "Assumption");
}

// ---------------------------------------------------------------- schedule
export async function saveSchedule(_p: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const raw = formToObject(form);
  const weekdays = form.getAll("working_weekdays").map(String);
  const parsed = scheduleSchema.safeParse({ ...raw, working_weekdays: weekdays });
  if (!parsed.success) return invalid(parsed.error);
  const { error } = await supabase.from("work_schedules").upsert(parsed.data, { onConflict: "owner_id,campaign_id" });
  if (error) return dbError(error);
  return ok("Dialing schedule saved.");
}

export async function addScheduleException(_p: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const parsed = scheduleExceptionSchema.safeParse(formToObject(form));
  if (!parsed.success) return invalid(parsed.error);
  const { campaign_id, ...row } = parsed.data;
  let { data: schedule } = await supabase.from("work_schedules").select("id").eq("campaign_id", campaign_id).maybeSingle();
  if (!schedule) {
    const created = await supabase.from("work_schedules").insert({ campaign_id }).select("id").single();
    if (created.error) return dbError(created.error);
    schedule = created.data;
  }
  const { error } = await supabase.from("work_schedule_exceptions").insert({ ...row, schedule_id: schedule.id });
  if (error) return dbError(error, "That date already has an exception.");
  return ok("Schedule exception added.");
}
export async function deleteScheduleException(_p: ActionResult, form: FormData) {
  return deleteRow("work_schedule_exceptions", form, "Exception");
}

export async function saveDialingSession(_p: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const parsed = dialingSessionSchema.safeParse({ ...formToObject(form), weekdays: form.getAll("weekdays").map(String) });
  if (!parsed.success) return invalid(parsed.error);
  const { campaign_id, weekdays, ...session } = parsed.data;
  let { data: schedule } = await supabase.from("work_schedules").select("id").eq("campaign_id", campaign_id).maybeSingle();
  if (!schedule) {
    const created = await supabase.from("work_schedules").insert({ campaign_id }).select("id").single();
    if (created.error) return dbError(created.error);
    schedule = created.data;
  }
  const rows = weekdays.map((weekday) => ({ ...session, weekday, schedule_id: schedule!.id }));
  const { error } = await supabase.from("dialing_sessions").insert(rows);
  if (error) return dbError(error, "A session already starts at that time on one of those days.");
  return ok(`Session added to ${weekdays.length} day${weekdays.length === 1 ? "" : "s"}.`);
}

export async function deleteDialingSession(_p: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const parsed = idSchema.safeParse(str(form, "id"));
  if (!parsed.success) return fail("Invalid session.");
  const { error } = await supabase.from("dialing_sessions").delete().eq("id", parsed.data);
  if (error) return dbError(error);
  return ok("Session removed.");
}

// ---------------------------------------------------------------- baseline corrections
const baselineForm = z.object({
  id: idSchema,
  label: z.string().trim().min(1).max(120),
  coverage_start: isoDate,
  as_of_date: isoDate,
  ...Object.fromEntries(
    ACTIVITY_FIELDS.filter((f) => f !== "lead_spend_cents").map((f) => [
      f,
      z.preprocess((v) => (v === "" || v === undefined ? null : v), count().nullable()),
    ]),
  ),
  lead_spend_cents: z.preprocess((v) => (v === "" || v === undefined ? null : v), moneyCents.nullable()),
  source_note: z.preprocess((v) => (v === "" ? null : v), z.string().max(1000).nullable()),
});

export async function saveBaseline(_p: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const parsed = baselineForm.safeParse(formToObject(form));
  if (!parsed.success) return invalid(parsed.error);
  const { id, ...row } = parsed.data as { id: string } & Record<string, unknown>;
  const { error } = await supabase.from("aggregate_baselines").update(row).eq("id", id);
  if (error) return dbError(error);
  return ok("Baseline corrected. Totals now reflect the updated aggregate.");
}

// ---------------------------------------------------------------- profile
export async function saveProfile(_p: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const parsed = profileSchema.safeParse(formToObject(form));
  if (!parsed.success) return invalid(parsed.error);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: parsed.data.timezone });
  } catch {
    return fail("Unknown time zone.", { timezone: "Use an IANA zone such as America/New_York" });
  }
  const { error } = await supabase.from("users").update(parsed.data).eq("id", user.id);
  if (error) return dbError(error);
  return ok("Profile saved.");
}

export async function initializeWorkspace(): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("initialize_workspace");
  if (error) return dbError(error);
  return ok("Workspace initialized with the 2026 AEP campaign.");
}
