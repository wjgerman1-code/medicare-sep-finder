import { createHash } from "node:crypto";
import type { z } from "zod";
import type { Campaign, LeadSource, Product } from "@/lib/domain/types";
import {
  applicationSchema,
  dailyActivitySchema,
  expenseSchema,
  flattenErrors,
  transactionSchema,
  type ApplicationInput,
  type DailyActivityInput,
  type ExpenseInput,
  type TransactionInput,
} from "@/lib/validation/schemas";

export const IMPORT_KINDS = ["daily_activity", "applications", "commission_transactions", "expenses"] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

export interface RowError {
  row: number;
  message: string;
}

export interface MappedImport<T> {
  valid: Array<{ row: number; value: T }>;
  errors: RowError[];
}

export interface ImportContext {
  campaign: Pick<Campaign, "id" | "start_date" | "end_date">;
  leadSources: Pick<LeadSource, "id" | "code" | "is_inbound">[];
  products: Pick<Product, "id" | "code">[];
  carriers: Array<{ id: string; name: string }>;
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function describe(error: z.ZodError): string {
  return Object.entries(flattenErrors(error))
    .map(([k, v]) => `${k}: ${v}`)
    .join("; ");
}

function lookup<T extends { id: string }>(items: T[], key: (t: T) => string, raw: string | undefined, label: string) {
  if (!raw) return { id: null as string | null };
  const hit = items.find((i) => key(i).toLowerCase() === raw.toLowerCase());
  return hit ? { id: hit.id } : { id: null, error: `Unknown ${label} "${raw}"` };
}

/** Stable id for rows that don't carry one, so re-importing the same row is a no-op. */
function contentId(prefix: string, parts: Array<string | number | null | undefined>): string {
  return `${prefix}:${sha256(parts.map((p) => p ?? "").join("|")).slice(0, 24)}`;
}

/** Duplicate natural keys inside one file are rejected (ambiguous). */
function rejectDuplicates<T>(mapped: MappedImport<T>, keyOf: (v: T) => string): MappedImport<T> {
  const seen = new Map<string, number>();
  const valid: MappedImport<T>["valid"] = [];
  const errors = [...mapped.errors];
  for (const item of mapped.valid) {
    const k = keyOf(item.value);
    const first = seen.get(k);
    if (first !== undefined) errors.push({ row: item.row, message: `Duplicate of row ${first} in this file` });
    else {
      seen.set(k, item.row);
      valid.push(item);
    }
  }
  return { valid, errors };
}

export function mapDailyActivityRows(rows: Record<string, string>[], ctx: ImportContext): MappedImport<DailyActivityInput> {
  const out: MappedImport<DailyActivityInput> = { valid: [], errors: [] };
  rows.forEach((r, i) => {
    const row = i + 2;
    const src = lookup(ctx.leadSources, (s) => s.code, r.lead_source, "lead source");
    if (src.error) return out.errors.push({ row, message: src.error });
    const inbound = ctx.leadSources.find((s) => s.id === src.id)?.is_inbound ?? false;
    const parsed = dailyActivitySchema({ campaign: ctx.campaign, leadSourceIsInbound: inbound }).safeParse({
      ...r,
      campaign_id: ctx.campaign.id,
      activity_date: r.activity_date ?? r.date,
      lead_source_id: src.id,
      lead_spend_cents: r.lead_spend ?? r.lead_spend_cents,
    });
    if (!parsed.success) return out.errors.push({ row, message: describe(parsed.error) });
    out.valid.push({ row, value: parsed.data });
  });
  return rejectDuplicates(out, (v) => `${v.activity_date}|${v.lead_source_id ?? ""}`);
}

export function mapApplicationRows(rows: Record<string, string>[], ctx: ImportContext): MappedImport<ApplicationInput> {
  const out: MappedImport<ApplicationInput> = { valid: [], errors: [] };
  rows.forEach((r, i) => {
    const row = i + 2;
    if (!r.application_ref) return out.errors.push({ row, message: "application_ref is required for imports (used to match re-imports)" });
    const product = lookup(ctx.products, (p) => p.code, r.product ?? r.product_code, "product");
    const carrier = lookup(ctx.carriers, (c) => c.name, r.carrier, "carrier");
    const src = lookup(ctx.leadSources, (s) => s.code, r.lead_source, "lead source");
    const err = product.error ?? carrier.error ?? src.error ?? (!product.id ? "product is required" : undefined);
    if (err) return out.errors.push({ row, message: err });
    const parsed = applicationSchema.safeParse({
      ...r,
      campaign_id: ctx.campaign.id,
      product_id: product.id,
      carrier_id: carrier.id,
      lead_source_id: src.id,
      status: (r.status || "written").toLowerCase().replace(/\s+/g, "_"),
      annual_premium_cents: r.annual_premium,
      expected_commission_cents: r.expected_commission,
    });
    if (!parsed.success) return out.errors.push({ row, message: describe(parsed.error) });
    out.valid.push({ row, value: parsed.data });
  });
  return rejectDuplicates(out, (v) => v.application_ref ?? "");
}

export function mapTransactionRows(
  rows: Record<string, string>[],
  ctx: ImportContext & { applicationsByRef: Map<string, { id: string; product_id: string; carrier_id: string | null }> },
): MappedImport<TransactionInput> {
  const out: MappedImport<TransactionInput> = { valid: [], errors: [] };
  rows.forEach((r, i) => {
    const row = i + 2;
    const app = r.application_ref ? ctx.applicationsByRef.get(r.application_ref) : undefined;
    if (r.application_ref && !app) return out.errors.push({ row, message: `Unknown application_ref "${r.application_ref}"` });
    const product = lookup(ctx.products, (p) => p.code, r.product, "product");
    const carrier = lookup(ctx.carriers, (c) => c.name, r.carrier, "carrier");
    const err = product.error ?? carrier.error;
    if (err) return out.errors.push({ row, message: err });
    const parsed = transactionSchema.safeParse({
      ...r,
      campaign_id: ctx.campaign.id,
      application_id: app?.id ?? null,
      product_id: product.id ?? app?.product_id ?? null,
      carrier_id: carrier.id ?? app?.carrier_id ?? null,
      kind: (r.kind || "").toLowerCase(),
      amount_cents: r.amount,
      external_id: r.external_id || contentId("csv", [r.transaction_date, r.kind, r.amount, r.statement_ref, r.application_ref]),
    });
    if (!parsed.success) return out.errors.push({ row, message: describe(parsed.error) });
    out.valid.push({ row, value: parsed.data });
  });
  return rejectDuplicates(out, (v) => v.external_id ?? "");
}

export function mapExpenseRows(rows: Record<string, string>[], ctx: ImportContext): MappedImport<ExpenseInput> {
  const out: MappedImport<ExpenseInput> = { valid: [], errors: [] };
  rows.forEach((r, i) => {
    const row = i + 2;
    const src = lookup(ctx.leadSources, (s) => s.code, r.lead_source, "lead source");
    if (src.error) return out.errors.push({ row, message: src.error });
    const parsed = expenseSchema.safeParse({
      ...r,
      campaign_id: ctx.campaign.id,
      lead_source_id: src.id,
      category: (r.category || "").toLowerCase(),
      amount_cents: r.amount,
      external_id: r.external_id || contentId("csv", [r.expense_date, r.category, r.amount, r.vendor, r.description]),
    });
    if (!parsed.success) return out.errors.push({ row, message: describe(parsed.error) });
    out.valid.push({ row, value: parsed.data });
  });
  return rejectDuplicates(out, (v) => v.external_id ?? "");
}

export const IMPORT_TEMPLATES: Record<ImportKind, string[]> = {
  daily_activity: [
    "activity_date", "lead_source", "outbound_dials", "voice_connections", "qualified_conversations",
    "appointments_booked", "appointments_held", "mapd_apps", "pdp_apps", "medsupp_apps",
    "hospital_indemnity_apps", "life_apps", "other_ancillary_apps", "follow_up_calls",
    "referrals_generated", "lead_spend", "dialing_minutes", "notes",
  ],
  applications: [
    "application_ref", "product", "carrier", "lead_source", "application_date", "status", "submitted_date",
    "approved_date", "effective_date", "enrollment_type", "annual_premium", "expected_commission", "notes",
  ],
  commission_transactions: [
    "external_id", "transaction_date", "kind", "amount", "application_ref", "product", "carrier", "statement_ref", "notes",
  ],
  expenses: ["external_id", "expense_date", "category", "amount", "vendor", "description", "lead_source"],
};
