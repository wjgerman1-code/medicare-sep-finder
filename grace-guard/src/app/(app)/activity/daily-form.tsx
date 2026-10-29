"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Save } from "lucide-react";
import { Field, SubmitButton, useActionToast } from "@/components/app/form-kit";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { saveDailyActivity } from "@/lib/actions/activity";
import { isISODate } from "@/lib/dates";
import { APP_COLUMNS, APP_COLUMN_LABELS, type DailyActivity, type LeadSource, type WorkSchedule } from "@/lib/domain/types";
import { plannedDialsOn } from "@/lib/kpi/schedule";
import { formatNumber, formatPercent, ratio } from "@/lib/kpi/ratio";
import { centsToDecimalString, formatCents, parseMoneyToCents } from "@/lib/money";
import { dailyActivitySchema, dailyActivityWarnings, flattenErrors } from "@/lib/validation/schemas";

type Values = Record<string, string>;

const CALLING = [
  ["outbound_dials", "Outbound dials"],
  ["voice_connections", "Voice connections (>1 min)"],
  ["qualified_conversations", "Qualified conversations"],
  ["follow_up_calls", "Follow-up calls"],
  ["dialing_minutes", "Dialing minutes"],
] as const;
const APPOINTMENTS = [
  ["appointments_booked", "Appointments booked"],
  ["appointments_held", "Appointments held"],
  ["referrals_generated", "Referrals generated"],
] as const;

function toValues(entry: DailyActivity | null, date: string): Values {
  const v: Values = { activity_date: entry?.activity_date ?? date, lead_source_id: entry?.lead_source_id ?? "", notes: entry?.notes ?? "" };
  for (const [k] of [...CALLING, ...APPOINTMENTS]) v[k] = entry ? String(entry[k]) : "";
  for (const c of APP_COLUMNS) v[c] = entry ? String(entry[c]) : "";
  v.lead_spend_cents = entry ? centsToDecimalString(entry.lead_spend_cents) : "";
  return v;
}

const num = (s: string | undefined) => {
  const n = Number(s);
  return s === undefined || s === "" || !Number.isFinite(n) ? 0 : n;
};

export function DailyForm({
  campaign,
  leadSources,
  defaultDate,
  entry,
  baselines,
  cancelHref,
  schedule,
}: {
  campaign: { id: string; start_date: string; end_date: string; slug: string };
  leadSources: LeadSource[];
  defaultDate: string;
  entry: DailyActivity | null;
  baselines: Array<{ coverage_start: string; as_of_date: string; label: string }>;
  cancelHref: string;
  schedule: WorkSchedule | null;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<Values>(() => toValues(entry, defaultDate));
  const { state, formAction } = useActionToast(saveDailyActivity, () => {
    if (entry) router.replace(cancelHref);
    else setValues(toValues(null, values.activity_date));
  });
  // bring the form into view when an entry is opened for editing
  useEffect(() => {
    if (entry) formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [entry]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setValues((v) => ({ ...v, [k]: e.target.value }));

  const inbound = leadSources.find((l) => l.id === values.lead_source_id)?.is_inbound ?? false;
  const covered = baselines.find((b) => values.activity_date >= b.coverage_start && values.activity_date <= b.as_of_date);

  // live validation with the same rules the server applies
  const { clientErrors, warnings } = useMemo(() => {
    const parsed = dailyActivitySchema({ campaign, leadSourceIsInbound: inbound }).safeParse({ ...values, campaign_id: campaign.id });
    if (!parsed.success) return { clientErrors: flattenErrors(parsed.error), warnings: [] as string[] };
    return { clientErrors: {}, warnings: dailyActivityWarnings(parsed.data) };
  }, [values, campaign, inbound]);
  const errors: Record<string, string> = { ...clientErrors, ...(state.ok ? {} : state.fieldErrors) };
  const touched = (k: string) => values[k] !== "" && values[k] !== undefined;
  const err = (k: string) => (touched(k) || state.fieldErrors?.[k] ? errors[k] : undefined);

  const dials = num(values.outbound_dials);
  const conn = num(values.voice_connections);
  const qual = num(values.qualified_conversations);
  const mapd = num(values.mapd_apps);
  const apps = APP_COLUMNS.reduce((a, c) => a + num(values[c]), 0);
  const minutes = num(values.dialing_minutes);
  let spend: number | null = null;
  try {
    spend = parseMoneyToCents(values.lead_spend_cents) ?? 0;
  } catch {
    spend = null;
  }

  const plan = isISODate(values.activity_date) ? plannedDialsOn(values.activity_date, schedule) : null;

  const metrics = [
    {
      label: "Dials vs plan",
      value: plan ? `${dials} / ${plan}` : String(dials),
      sub: plan ? `${formatPercent(ratio(dials, plan).value, 0)} of the day's session target` : "No dial target scheduled this day",
    },
    { label: "Contact rate", value: formatPercent(ratio(conn, dials).value), sub: `${conn} ÷ ${dials} dials` },
    { label: "Qualified rate", value: formatPercent(ratio(qual, conn).value), sub: `${qual} ÷ ${conn} connections` },
    { label: "MAPD close rate", value: formatPercent(ratio(mapd, conn).value), sub: `${mapd} ÷ ${conn} connections` },
    { label: "Dials per MAPD app", value: formatNumber(ratio(dials, mapd).value, 1), sub: `${dials} ÷ ${mapd}` },
    { label: "Total applications", value: String(apps), sub: "All products" },
    { label: "Booking rate", value: formatPercent(ratio(num(values.appointments_booked), qual).value), sub: "Booked ÷ qualified" },
    { label: "Dials per hour", value: formatNumber(minutes ? (dials / minutes) * 60 : null, 0), sub: `${minutes} dialing min` },
    { label: "Cost per application", value: spend !== null && apps ? formatCents(Math.round(spend / apps)) : "—", sub: "Lead spend ÷ apps" },
  ];

  const numberInput = (k: string, label: string) => (
    <Field key={k} label={label} name={k} error={err(k)}>
      <Input
        id={k}
        name={k}
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        max={k === "dialing_minutes" ? 1440 : undefined}
        placeholder="0"
        value={values[k]}
        onChange={set(k)}
        aria-invalid={!!err(k)}
      />
    </Field>
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_20rem]" id="entry">
      <Card>
        <CardHeader>
          <CardTitle>{entry ? "Edit daily entry" : "Log daily activity"}</CardTitle>
          <CardDescription>Whole numbers only. One entry per date and lead source — use “All / mixed” for a single daily total.</CardDescription>
        </CardHeader>
        <CardContent>
          <form ref={formRef} action={formAction} className="flex flex-col gap-6">
            <input type="hidden" name="campaign_id" value={campaign.id} />
            {entry && <input type="hidden" name="id" value={entry.id} />}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Date" name="activity_date" error={errors.activity_date}>
                <Input id="activity_date" name="activity_date" type="date" required min={campaign.start_date} max={campaign.end_date} value={values.activity_date} onChange={set("activity_date")} aria-invalid={!!errors.activity_date} />
              </Field>
              <Field label="Lead source" name="lead_source_id" hint={inbound ? "Inbound source: connections may exceed dials." : undefined}>
                <Select id="lead_source_id" name="lead_source_id" value={values.lead_source_id} onChange={set("lead_source_id")}>
                  <option value="">All / mixed sources</option>
                  {leadSources.filter((l) => l.is_active || l.id === values.lead_source_id).map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {covered && (
              <Alert variant="warning">
                <AlertTriangle />
                <AlertDescription>
                  This date is inside “{covered.label}”. That activity is already counted in the aggregate baseline, so a daily entry here would be rejected. Correct the baseline in Settings instead.
                </AlertDescription>
              </Alert>
            )}

            <fieldset className="grid gap-4">
              <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-gold-deep">Calling</legend>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">{CALLING.map(([k, l]) => numberInput(k, l))}</div>
            </fieldset>
            <fieldset className="grid gap-4">
              <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-gold-deep">Appointments & referrals</legend>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3">{APPOINTMENTS.map(([k, l]) => numberInput(k, l))}</div>
            </fieldset>
            <fieldset className="grid gap-4">
              <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-gold-deep">Applications written</legend>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3">{APP_COLUMNS.map((c) => numberInput(c, `${APP_COLUMN_LABELS[c]} apps`))}</div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
              <Field label="Lead spending ($)" name="lead_spend_cents" error={err("lead_spend_cents")}>
                <Input id="lead_spend_cents" name="lead_spend_cents" inputMode="decimal" placeholder="0.00" value={values.lead_spend_cents} onChange={set("lead_spend_cents")} aria-invalid={!!err("lead_spend_cents")} />
              </Field>
              <Field label="Notes" name="notes" error={errors.notes} hint="No client names, health details or identifiers.">
                <Textarea id="notes" name="notes" rows={2} maxLength={2000} value={values.notes} onChange={set("notes")} />
              </Field>
            </div>

            {warnings.length > 0 && Object.keys(clientErrors).length === 0 && (
              <Alert variant="warning">
                <AlertTriangle />
                <AlertDescription>
                  {warnings.map((w) => (
                    <p key={w}>{w}</p>
                  ))}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap gap-2">
              <SubmitButton variant="gold" size="lg" disabled={!!covered}>
                <Save /> {entry ? "Save changes" : "Save entry"}
              </SubmitButton>
              {entry && (
                <Button asChild variant="outline" size="lg">
                  <Link href={cancelHref}>Cancel edit</Link>
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="h-fit xl:sticky xl:top-6">
        <CardHeader>
          <CardTitle>Session metrics</CardTitle>
          <CardDescription>Calculated instantly from this entry</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 xl:grid-cols-1">
          {metrics.map((m) => (
            <div key={m.label} className="rounded-lg border bg-ivory/60 p-3">
              <div className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">{m.label}</div>
              <div className="tabular font-serif text-2xl font-semibold text-navy">{m.value}</div>
              <div className="text-[0.7rem] text-muted-foreground">{m.sub}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
