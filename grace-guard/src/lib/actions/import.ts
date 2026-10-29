"use server";

import { formatDate } from "@/lib/dates";
import { findCoveringBaseline } from "@/lib/kpi/aggregate";
import type { AggregateBaseline } from "@/lib/domain/types";
import { parseCsv } from "@/lib/csv/csv";
import {
  IMPORT_KINDS,
  mapApplicationRows,
  mapDailyActivityRows,
  mapExpenseRows,
  mapTransactionRows,
  sha256,
  type ImportKind,
  type MappedImport,
  type RowError,
} from "@/lib/csv/importers";
import { dbError, fail, ok, requireUser, str } from "./helpers";
import type { ActionResult } from "./result";

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 5000;

type Supabase = Awaited<ReturnType<typeof requireUser>>["supabase"];

interface Counts {
  inserted: number;
  updated: number;
  errors: RowError[];
}

/** Upsert by a natural key: existing rows (matched by key) are updated, others inserted. */
async function upsertByKey<T extends Record<string, unknown>>(
  supabase: Supabase,
  table: string,
  mapped: MappedImport<T>,
  keyColumns: string[],
  existing: Array<Record<string, unknown> & { id: string }>,
  batchId: string,
): Promise<Counts> {
  const keyOf = (r: Record<string, unknown>) => keyColumns.map((k) => String(r[k] ?? "")).join("|");
  const byKey = new Map(existing.map((e) => [keyOf(e), e.id]));
  const out: Counts = { inserted: 0, updated: 0, errors: [] };
  for (const { row, value } of mapped.valid) {
    const { id: _ignored, ...data } = value as T & { id?: unknown };
    void _ignored;
    const existingId = byKey.get(keyOf(data));
    const payload = { ...data, import_batch_id: batchId };
    const res = existingId
      ? await supabase.from(table).update(payload).eq("id", existingId)
      : await supabase.from(table).insert(table === "daily_activity" ? { ...payload, source: "import" } : payload);
    if (res.error) out.errors.push({ row, message: dbError(res.error).message });
    else if (existingId) out.updated++;
    else out.inserted++;
  }
  return out;
}

export async function importCsv(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const kind = str(form, "kind") as ImportKind;
  if (!IMPORT_KINDS.includes(kind)) return fail("Choose what you are importing.");
  const campaignId = str(form, "campaign_id");
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Choose a CSV file.");
  if (file.size > MAX_BYTES) return fail("File is larger than 2 MB. Split it into smaller files.");

  const text = await file.text();
  const fileHash = sha256(text);

  const { data: prior } = await supabase
    .from("import_batches")
    .select("created_at")
    .eq("kind", kind)
    .eq("file_sha256", fileHash)
    .maybeSingle();
  if (prior) return fail(`This exact file was already imported on ${formatDate(prior.created_at.slice(0, 10))}. Nothing was changed.`);

  const { rows, errors: parseErrors } = parseCsv(text);
  if (rows.length === 0) return fail(parseErrors[0] ?? "The file has no data rows.");
  if (rows.length > MAX_ROWS) return fail(`Too many rows (${rows.length}). The limit is ${MAX_ROWS}.`);

  const [{ data: campaign }, { data: leadSources }, { data: products }, { data: carriers }] = await Promise.all([
    supabase.from("campaigns").select("id, start_date, end_date").eq("id", campaignId).maybeSingle(),
    supabase.from("lead_sources").select("id, code, is_inbound"),
    supabase.from("products").select("id, code"),
    supabase.from("carriers").select("id, name"),
  ]);
  if (!campaign) return fail("Campaign not found.");
  const ctx = { campaign, leadSources: leadSources ?? [], products: products ?? [], carriers: carriers ?? [] };

  let mapped: MappedImport<Record<string, unknown>>;
  let existing: Array<Record<string, unknown> & { id: string }> = [];
  let table: string;
  let keyColumns: string[];

  if (kind === "daily_activity") {
    mapped = mapDailyActivityRows(rows, ctx) as MappedImport<Record<string, unknown>>;
    const { data: baselines } = await supabase.from("aggregate_baselines").select("coverage_start, as_of_date").eq("campaign_id", campaign.id);
    const covered = mapped.valid.filter((v) => findCoveringBaseline(String(v.value.activity_date), (baselines ?? []) as AggregateBaseline[]));
    mapped = {
      valid: mapped.valid.filter((v) => !covered.includes(v)),
      errors: [...mapped.errors, ...covered.map((c) => ({ row: c.row, message: "Date is inside the aggregate baseline window (already counted)" }))],
    };
    existing = ((await supabase.from("daily_activity").select("id, activity_date, lead_source_id").eq("campaign_id", campaign.id)).data ?? []) as typeof existing;
    table = "daily_activity";
    keyColumns = ["activity_date", "lead_source_id"];
  } else if (kind === "applications") {
    mapped = mapApplicationRows(rows, ctx) as MappedImport<Record<string, unknown>>;
    existing = ((await supabase.from("applications").select("id, application_ref").not("application_ref", "is", null)).data ?? []) as typeof existing;
    table = "applications";
    keyColumns = ["application_ref"];
  } else if (kind === "commission_transactions") {
    const { data: apps } = await supabase.from("applications").select("id, application_ref, product_id, carrier_id").not("application_ref", "is", null);
    const applicationsByRef = new Map((apps ?? []).map((a) => [a.application_ref as string, a]));
    mapped = mapTransactionRows(rows, { ...ctx, applicationsByRef }) as MappedImport<Record<string, unknown>>;
    existing = ((await supabase.from("commission_transactions").select("id, external_id").not("external_id", "is", null)).data ?? []) as typeof existing;
    table = "commission_transactions";
    keyColumns = ["external_id"];
  } else {
    mapped = mapExpenseRows(rows, ctx) as MappedImport<Record<string, unknown>>;
    existing = ((await supabase.from("expenses").select("id, external_id").not("external_id", "is", null)).data ?? []) as typeof existing;
    table = "expenses";
    keyColumns = ["external_id"];
  }

  if (mapped.valid.length === 0) {
    const first = mapped.errors.slice(0, 5).map((e) => `Row ${e.row}: ${e.message}`);
    return fail(`No rows could be imported. ${first.join(" · ")}`);
  }

  const batch = await supabase
    .from("import_batches")
    .insert({ kind, filename: file.name.slice(0, 200), file_sha256: fileHash, row_count: rows.length })
    .select("id")
    .single();
  if (batch.error) return dbError(batch.error, "This file was already imported.");

  const result = await upsertByKey(supabase, table, mapped, keyColumns, existing, batch.data.id);
  const errors = [...mapped.errors, ...result.errors].sort((a, b) => a.row - b.row);
  await supabase
    .from("import_batches")
    .update({
      inserted_count: result.inserted,
      updated_count: result.updated,
      skipped_count: errors.length,
      status: errors.length ? (result.inserted + result.updated ? "partial" : "failed") : "completed",
      errors: errors.slice(0, 200),
    })
    .eq("id", batch.data.id);

  const summary = `Imported ${result.inserted} new and updated ${result.updated} existing row(s).`;
  return ok(
    errors.length ? `${summary} ${errors.length} row(s) skipped.` : summary,
    errors.slice(0, 10).map((e) => `Row ${e.row}: ${e.message}`),
  );
}
