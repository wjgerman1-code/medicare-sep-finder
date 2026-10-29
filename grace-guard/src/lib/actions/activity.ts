"use server";

import { formatDate } from "@/lib/dates";
import { findCoveringBaseline } from "@/lib/kpi/aggregate";
import type { AggregateBaseline } from "@/lib/domain/types";
import { dailyActivityBase, dailyActivitySchema, dailyActivityWarnings, formToObject, id as idSchema, leadSchema } from "@/lib/validation/schemas";
import { dbError, fail, invalid, ok, requireUser, str } from "./helpers";
import type { ActionResult } from "./result";

export async function saveDailyActivity(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const raw = formToObject(form);

  const pre = dailyActivityBase.pick({ campaign_id: true, lead_source_id: true }).safeParse(raw);
  if (!pre.success) return invalid(pre.error);

  const [{ data: campaign }, { data: source }, { data: baselines }] = await Promise.all([
    supabase.from("campaigns").select("id, start_date, end_date").eq("id", pre.data.campaign_id).maybeSingle(),
    pre.data.lead_source_id
      ? supabase.from("lead_sources").select("is_inbound").eq("id", pre.data.lead_source_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("aggregate_baselines").select("id, label, coverage_start, as_of_date").eq("campaign_id", pre.data.campaign_id),
  ]);
  if (!campaign) return fail("Campaign not found.");

  const parsed = dailyActivitySchema({ campaign, leadSourceIsInbound: source?.is_inbound ?? false }).safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const v = parsed.data;

  const covering = findCoveringBaseline(v.activity_date, (baselines ?? []) as AggregateBaseline[]);
  if (covering) {
    return fail(
      `${formatDate(v.activity_date)} is inside the aggregate baseline (${formatDate(covering.coverage_start)} – ${formatDate(covering.as_of_date)}). ` +
        "That activity is already counted; correct the baseline in Settings instead of adding a daily entry.",
      { activity_date: "Covered by the aggregate baseline" },
    );
  }

  const { id, ...row } = v;
  const res = id
    ? await supabase.from("daily_activity").update(row).eq("id", id).select("id").maybeSingle()
    : await supabase.from("daily_activity").insert({ ...row, source: "manual" }).select("id").maybeSingle();
  if (res.error) return dbError(res.error, "An entry already exists for this date and lead source — edit that entry instead.");
  if (!res.data) return fail("Entry not found (it may have been deleted).");

  return ok(id ? "Daily entry updated." : "Daily entry saved.", dailyActivityWarnings(v));
}

export async function deleteDailyActivity(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const parsed = idSchema.safeParse(str(form, "id"));
  if (!parsed.success) return fail("Invalid entry.");
  const { error, count } = await supabase.from("daily_activity").delete({ count: "exact" }).eq("id", parsed.data);
  if (error) return dbError(error);
  if (!count) return fail("Entry not found.");
  return ok("Daily entry deleted.");
}

export async function saveLead(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const parsed = leadSchema.safeParse(formToObject(form));
  if (!parsed.success) return invalid(parsed.error);
  const { id, ...row } = parsed.data;
  const res = id ? await supabase.from("leads").update(row).eq("id", id) : await supabase.from("leads").insert(row);
  if (res.error) return dbError(res.error, "A lead record with that reference already exists.");
  return ok("Lead record saved.");
}

export async function deleteLead(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const parsed = idSchema.safeParse(str(form, "id"));
  if (!parsed.success) return fail("Invalid record.");
  const { error } = await supabase.from("leads").delete().eq("id", parsed.data);
  if (error) return dbError(error);
  return ok("Lead record deleted.");
}
