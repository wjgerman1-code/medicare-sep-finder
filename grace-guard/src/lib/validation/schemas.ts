import { z } from "zod";
import { isISODate } from "@/lib/dates";
import { APP_COLUMNS, APPLICATION_STATUSES, EXPENSE_CATEGORIES, TRANSACTION_KINDS } from "@/lib/domain/types";
import { parseMoneyToCents } from "@/lib/money";
import { forecastAssumptionsSchema } from "@/lib/kpi/forecast";

// ---------------------------------------------------------------------------
// primitives (form values arrive as strings)
// ---------------------------------------------------------------------------
const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const blankToNull = (v: unknown) => (v === undefined || (typeof v === "string" && v.trim() === "") ? null : v);

export const id = z.guid({ error: "Invalid identifier" });
export const optionalId = z.preprocess(blankToNull, id.nullable());

export const isoDate = z
  .string({ error: "Date is required" })
  .refine(isISODate, { error: "Use a valid date (YYYY-MM-DD)" });
export const optionalIsoDate = z.preprocess(blankToNull, isoDate.nullable());

/** Non-negative whole number; blank = 0. */
export const count = (max = 100_000) =>
  z.preprocess(
    (v) => blankToUndefined(v) ?? 0,
    z.coerce
      .number({ error: "Enter a number" })
      .int({ error: "Whole numbers only" })
      .min(0, { error: "Cannot be negative" })
      .max(max, { error: `Must be ${max.toLocaleString()} or less` }),
  );

const moneyPreprocess = (v: unknown) => {
  if (typeof v === "number") return Number.isInteger(v) ? v : Math.round(v * 100);
  if (v === null || v === undefined) return null;
  try {
    return parseMoneyToCents(String(v));
  } catch {
    return Number.NaN;
  }
};

/** Dollar input ("1,234.56") → integer cents, non-negative; blank = 0. */
export const moneyCents = z.preprocess(
  (v) => moneyPreprocess(v) ?? 0,
  z.number({ error: "Enter a dollar amount" }).int().min(0, { error: "Cannot be negative" }).max(100_000_000_00),
);
/** Optional dollar input → integer cents or null. */
export const optionalMoneyCents = z.preprocess(
  moneyPreprocess,
  z.number({ error: "Enter a dollar amount" }).int().min(0, { error: "Cannot be negative" }).max(100_000_000_00).nullable(),
);
/** Signed dollar input (adjustments). */
export const signedMoneyCents = z.preprocess(
  moneyPreprocess,
  z.number({ error: "Enter a dollar amount" }).int().refine((v) => v !== 0, { error: "Amount cannot be zero" }),
);

const text = (max: number) =>
  z.preprocess(blankToNull, z.string().trim().max(max, { error: `Keep it under ${max} characters` }).nullable());

/** Identifiers must not look like Medicare/Social Security numbers. */
const SENSITIVE_ID = /(^\d{3}-?\d{2}-?\d{4}$)|(^[1-9][A-Za-z][A-Za-z0-9]\d[A-Za-z][A-Za-z0-9]\d[A-Za-z]{2}\d{2}$)/;
export const productionRef = z.preprocess(
  blankToNull,
  z
    .string()
    .trim()
    .max(60)
    .refine((v) => !SENSITIVE_ID.test(v.replace(/[\s-]/g, "")), {
      error: "Looks like an SSN or Medicare number. Use an internal reference instead — this app must not store beneficiary identifiers.",
    })
    .nullable(),
);

// ---------------------------------------------------------------------------
// daily activity
// ---------------------------------------------------------------------------
export const dailyActivityBase = z.object({
  id: optionalId.optional(),
  campaign_id: id,
  activity_date: isoDate,
  lead_source_id: optionalId,
  outbound_dials: count(),
  voice_connections: count(),
  qualified_conversations: count(),
  appointments_booked: count(),
  appointments_held: count(),
  mapd_apps: count(),
  pdp_apps: count(),
  medsupp_apps: count(),
  hospital_indemnity_apps: count(),
  life_apps: count(),
  other_ancillary_apps: count(),
  follow_up_calls: count(),
  referrals_generated: count(),
  lead_spend_cents: moneyCents,
  dialing_minutes: count(1440),
  notes: text(2000),
});
export type DailyActivityInput = z.infer<typeof dailyActivityBase>;

export interface DailyActivityContext {
  campaign: { start_date: string; end_date: string };
  /** inbound sources may have connections without outbound dials */
  leadSourceIsInbound?: boolean;
}

/** Hard rules: same-population relationships that cannot be violated. */
export function dailyActivitySchema(ctx: DailyActivityContext) {
  return dailyActivityBase.superRefine((v, issue) => {
    if (v.activity_date < ctx.campaign.start_date || v.activity_date > ctx.campaign.end_date) {
      issue.addIssue({
        code: "custom",
        path: ["activity_date"],
        message: `Date must fall within the campaign (${ctx.campaign.start_date} to ${ctx.campaign.end_date})`,
      });
    }
    if (!ctx.leadSourceIsInbound && v.voice_connections > v.outbound_dials) {
      issue.addIssue({
        code: "custom",
        path: ["voice_connections"],
        message: "Voice connections cannot exceed outbound dials (choose an inbound lead source for live transfers)",
      });
    }
    if (v.qualified_conversations > v.voice_connections) {
      issue.addIssue({
        code: "custom",
        path: ["qualified_conversations"],
        message: "Qualified conversations are a subset of voice connections",
      });
    }
  });
}

/** Soft checks: unusual but possible combinations, shown as warnings. */
export function dailyActivityWarnings(v: DailyActivityInput): string[] {
  const out: string[] = [];
  const apps = APP_COLUMNS.reduce((a, c) => a + v[c], 0);
  if (apps > v.voice_connections + v.appointments_held) {
    out.push("More applications than conversations and appointments held — fine if some came from inbound calls or referrals, otherwise double-check.");
  }
  if (v.appointments_booked > v.qualified_conversations && v.qualified_conversations > 0) {
    out.push("More appointments booked than qualified conversations.");
  }
  if (v.outbound_dials > 0 && v.dialing_minutes === 0) {
    out.push("Dials logged with zero dialing minutes.");
  }
  return out;
}

// ---------------------------------------------------------------------------
// production
// ---------------------------------------------------------------------------
export const applicationSchema = z
  .object({
    id: optionalId.optional(),
    campaign_id: id,
    product_id: id,
    carrier_id: optionalId,
    lead_source_id: optionalId,
    application_ref: productionRef,
    application_date: isoDate,
    status: z.enum(APPLICATION_STATUSES),
    submitted_date: optionalIsoDate,
    approved_date: optionalIsoDate,
    effective_date: optionalIsoDate,
    cancelled_date: optionalIsoDate,
    charged_back_date: optionalIsoDate,
    enrollment_type: z.preprocess(blankToNull, z.string().regex(/^[a-z_]{2,40}$/).nullable()),
    annual_premium_cents: optionalMoneyCents,
    expected_commission_cents: optionalMoneyCents,
    notes: text(1000),
  })
  .superRefine((v, issue) => {
    for (const f of ["submitted_date", "approved_date"] as const) {
      const d = v[f];
      if (d && d < v.application_date) {
        issue.addIssue({ code: "custom", path: [f], message: "Cannot be before the application date" });
      }
    }
  });
export type ApplicationInput = z.infer<typeof applicationSchema>;

export const transactionSchema = z
  .object({
    id: optionalId.optional(),
    campaign_id: optionalId,
    application_id: optionalId,
    product_id: optionalId,
    carrier_id: optionalId,
    transaction_date: isoDate,
    kind: z.enum(TRANSACTION_KINDS),
    amount_cents: signedMoneyCents,
    statement_ref: text(120),
    external_id: text(120),
    notes: text(1000),
  })
  .superRefine((v, issue) => {
    if (v.kind !== "adjustment" && v.amount_cents < 0) {
      issue.addIssue({ code: "custom", path: ["amount_cents"], message: "Enter a positive amount (chargebacks are subtracted automatically)" });
    }
  });
export type TransactionInput = z.infer<typeof transactionSchema>;

export const expenseSchema = z.object({
  id: optionalId.optional(),
  campaign_id: optionalId,
  expense_date: isoDate,
  category: z.enum(EXPENSE_CATEGORIES),
  lead_source_id: optionalId,
  vendor: text(120),
  description: text(500),
  amount_cents: z.preprocess(moneyPreprocess, z.number({ error: "Enter a dollar amount" }).int().positive({ error: "Must be greater than zero" })),
  external_id: text(120),
});
export type ExpenseInput = z.infer<typeof expenseSchema>;

export const leadSchema = z.object({
  id: optionalId.optional(),
  campaign_id: optionalId,
  lead_source_id: id,
  acquired_date: isoDate,
  quantity: count(1_000_000).refine((v) => v > 0, { error: "At least 1" }),
  external_ref: productionRef,
  notes: text(1000),
});
export type LeadInput = z.infer<typeof leadSchema>;

// ---------------------------------------------------------------------------
// goals, campaigns & settings
// ---------------------------------------------------------------------------
const REVENUE_METRICS = ["expected_revenue", "received_revenue"] as const;
export const goalSchema = z
  .object({
    id: optionalId.optional(),
    campaign_id: optionalId,
    period_type: z.enum(["annual", "campaign", "monthly", "weekly", "daily"]),
    period_start: isoDate,
    period_end: isoDate,
    metric: z.enum([
      "applications",
      "outbound_dials",
      "voice_connections",
      "qualified_conversations",
      "appointments_booked",
      "appointments_held",
      "referrals",
      ...REVENUE_METRICS,
    ]),
    product_id: optionalId,
    target: z.string().trim().min(1, { error: "Target is required" }),
    notes: text(500),
  })
  .transform((v, ctx) => {
    const isRevenue = (REVENUE_METRICS as readonly string[]).includes(v.metric);
    let target_count: number | null = null;
    let target_cents: number | null = null;
    if (isRevenue) {
      const cents = moneyPreprocess(v.target);
      if (typeof cents !== "number" || !Number.isInteger(cents) || cents < 0) {
        ctx.addIssue({ code: "custom", path: ["target"], message: "Enter a dollar amount" });
        return z.NEVER;
      }
      target_cents = cents;
    } else {
      const n = Number(v.target);
      if (!Number.isFinite(n) || n < 0) {
        ctx.addIssue({ code: "custom", path: ["target"], message: "Enter a non-negative number" });
        return z.NEVER;
      }
      target_count = Math.round(n * 100) / 100;
    }
    if (v.period_end < v.period_start) {
      ctx.addIssue({ code: "custom", path: ["period_end"], message: "End must be on or after start" });
      return z.NEVER;
    }
    const { target: _t, ...rest } = v;
    void _t;
    return { ...rest, target_count, target_cents };
  });
export type GoalInput = z.infer<typeof goalSchema>;

export const campaignSchema = z
  .object({
    id: optionalId.optional(),
    name: z.string().trim().min(1).max(120),
    slug: z.string().trim().regex(/^[a-z0-9-]{2,60}$/, { error: "Lowercase letters, numbers and dashes" }),
    campaign_type: z.enum(["aep", "oep", "sep", "annual", "growth", "other"]),
    campaign_year: z.coerce.number().int().min(2000).max(2100),
    plan_year: z.preprocess(blankToNull, z.coerce.number().int().min(2000).max(2100).nullable()),
    start_date: isoDate,
    end_date: isoDate,
    status: z.enum(["planning", "active", "closed"]),
    primary_product_id: optionalId,
    notes: text(1000),
  })
  .refine((v) => v.end_date >= v.start_date, { path: ["end_date"], error: "End must be on or after start" });
export type CampaignInput = z.infer<typeof campaignSchema>;

export const productSchema = z.object({
  id: optionalId.optional(),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{2,40}$/, { error: "Letters, numbers and underscores" }),
  name: z.string().trim().min(1).max(120),
  category: z.enum(["medicare_advantage", "prescription_drug", "medicare_supplement", "hospital_indemnity", "life", "ancillary", "other"]),
  daily_column: z.preprocess(blankToNull, z.enum(APP_COLUMNS).nullable()),
  is_active: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
});

export const carrierSchema = z.object({
  id: optionalId.optional(),
  name: z.string().trim().min(1).max(120),
  is_active: z.preprocess((v) => v === undefined || v === "on" || v === "true" || v === true, z.boolean()),
});

export const leadSourceSchema = z.object({
  id: optionalId.optional(),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{2,40}$/, { error: "Letters, numbers and underscores" }),
  name: z.string().trim().min(1).max(120),
  channel: z.enum(["outbound", "inbound", "event", "referral", "digital"]),
  is_inbound: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
  is_active: z.preprocess((v) => v === undefined || v === "on" || v === "true" || v === true, z.boolean()),
});

export const assumptionSchema = z
  .object({
    id: optionalId.optional(),
    product_id: id,
    carrier_id: optionalId,
    plan_year: z.coerce.number().int().min(2000).max(2100),
    enrollment_type: z.preprocess(blankToNull, z.string().regex(/^[a-z_]{2,40}$/, { error: "lowercase_with_underscores" }).nullable()),
    basis: z.enum(["flat_per_application", "percent_of_annual_premium"]),
    amount: z.preprocess(blankToNull, z.string().nullable()),
    rate_percent: z.preprocess(blankToNull, z.string().nullable()),
    notes: text(500),
  })
  .transform((v, ctx) => {
    let amount_cents: number | null = null;
    let rate_bps: number | null = null;
    if (v.basis === "flat_per_application") {
      const c = moneyPreprocess(v.amount);
      if (typeof c !== "number" || !Number.isInteger(c) || c < 0) {
        ctx.addIssue({ code: "custom", path: ["amount"], message: "Enter the expected commission per application" });
        return z.NEVER;
      }
      amount_cents = c;
    } else {
      const m = /^(\d{1,4})(?:\.(\d{1,2}))?$/.exec(v.rate_percent ?? "");
      if (!m) {
        ctx.addIssue({ code: "custom", path: ["rate_percent"], message: "Enter a percent, e.g. 20 or 7.5" });
        return z.NEVER;
      }
      rate_bps = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
    }
    const { amount: _a, rate_percent: _r, ...rest } = v;
    void _a;
    void _r;
    return { ...rest, amount_cents, rate_bps };
  });

export const scheduleSchema = z.object({
  campaign_id: id,
  name: z.string().trim().min(1).max(80),
  working_weekdays: z.array(z.coerce.number().int().min(0).max(6)).min(1, { error: "Pick at least one working day" }),
  planned_dials_per_day: z.preprocess(blankToNull, z.coerce.number().int().min(0).max(5000).nullable()),
  planned_hours_per_day: z.preprocess(blankToNull, z.coerce.number().min(0).max(24).nullable()),
});

export const scheduleExceptionSchema = z.object({
  campaign_id: id,
  exception_date: isoDate,
  kind: z.enum(["holiday", "vacation", "exclusion", "extra_workday"]),
  note: text(200),
});

export const profileSchema = z.object({
  full_name: text(120),
  agency_name: z.string().trim().min(1).max(120),
  timezone: z.string().trim().min(1).max(64),
  default_campaign_id: optionalId,
});

export { forecastAssumptionsSchema };

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
export type FieldErrors = Record<string, string>;

export function flattenErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** FormData → plain object (multi-value keys become arrays). */
export function formToObject(form: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of form.entries()) {
    if (typeof v !== "string") continue;
    if (k in out) out[k] = ([] as unknown[]).concat(out[k], v);
    else out[k] = v;
  }
  return out;
}
