import { NextResponse, type NextRequest } from "next/server";
import { toCsv, type CsvColumn } from "@/lib/csv/csv";
import { parseFilters } from "@/lib/data/filters";
import { getWorkspace, loadCampaignData, resolveCampaign } from "@/lib/data/queries";
import { todayInTimeZone } from "@/lib/dates";
import { APP_COLUMNS, type Application, type CommissionTransaction, type DailyActivity, type Expense } from "@/lib/domain/types";
import type { FunnelRow } from "@/lib/kpi/funnel";
import { buildSnapshot } from "@/lib/kpi/snapshot";
import { centsToDecimalString } from "@/lib/money";

const KINDS = ["summary", "daily_activity", "applications", "commission_transactions", "expenses", "funnel"] as const;
type Kind = (typeof KINDS)[number];

const rate = (v: number | null) => (v === null ? "" : (v * 100).toFixed(2));

export async function GET(request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!KINDS.includes(kind as Kind)) return NextResponse.json({ error: "Unknown export" }, { status: 404 });

  const ws = await getWorkspace();
  const filters = parseFilters(Object.fromEntries(request.nextUrl.searchParams));
  const campaign = resolveCampaign(ws, filters.campaign);
  if (!campaign) return NextResponse.json({ error: "No campaign" }, { status: 404 });
  const data = await loadCampaignData(ws, campaign);
  const asOf = todayInTimeZone(ws.profile.timezone);
  const productId = filters.product && ws.products.some((p) => p.id === filters.product) ? filters.product : null;
  const inRange = (d: string) => (!filters.from || d >= filters.from) && (!filters.to || d <= filters.to);

  const source = new Map(ws.leadSources.map((l) => [l.id, l.code]));
  const product = new Map(ws.products.map((p) => [p.id, p.code]));
  const carrier = new Map(ws.carriers.map((c) => [c.id, c.name]));
  const appRef = new Map(data.applications.map((a) => [a.id, a.application_ref]));

  let csv: string;
  switch (kind as Kind) {
    case "daily_activity": {
      const cols: CsvColumn<DailyActivity>[] = [
        { header: "activity_date", value: (r) => r.activity_date },
        { header: "lead_source", value: (r) => (r.lead_source_id ? source.get(r.lead_source_id) : "") },
        ...(["outbound_dials", "voice_connections", "qualified_conversations", "appointments_booked", "appointments_held", ...APP_COLUMNS, "follow_up_calls", "referrals_generated"] as const).map(
          (f): CsvColumn<DailyActivity> => ({ header: f, value: (r) => r[f] }),
        ),
        { header: "lead_spend", value: (r) => centsToDecimalString(r.lead_spend_cents) },
        { header: "dialing_minutes", value: (r) => r.dialing_minutes },
        { header: "notes", value: (r) => r.notes },
      ];
      csv = toCsv([...data.daily].filter((d) => inRange(d.activity_date)).sort((a, b) => (a.activity_date < b.activity_date ? -1 : 1)), cols);
      break;
    }
    case "applications": {
      const cols: CsvColumn<Application>[] = [
        { header: "application_ref", value: (r) => r.application_ref },
        { header: "product", value: (r) => product.get(r.product_id) },
        { header: "carrier", value: (r) => (r.carrier_id ? carrier.get(r.carrier_id) : "") },
        { header: "lead_source", value: (r) => (r.lead_source_id ? source.get(r.lead_source_id) : "") },
        { header: "application_date", value: (r) => r.application_date },
        { header: "status", value: (r) => r.status },
        { header: "submitted_date", value: (r) => r.submitted_date },
        { header: "approved_date", value: (r) => r.approved_date },
        { header: "effective_date", value: (r) => r.effective_date },
        { header: "enrollment_type", value: (r) => r.enrollment_type },
        { header: "annual_premium", value: (r) => centsToDecimalString(r.annual_premium_cents) },
        { header: "expected_commission", value: (r) => centsToDecimalString(r.expected_commission_cents) },
        { header: "notes", value: (r) => r.notes },
      ];
      csv = toCsv(data.applications.filter((a) => inRange(a.application_date) && (!productId || a.product_id === productId)), cols);
      break;
    }
    case "commission_transactions": {
      const cols: CsvColumn<CommissionTransaction>[] = [
        { header: "external_id", value: (r) => r.external_id },
        { header: "transaction_date", value: (r) => r.transaction_date },
        { header: "kind", value: (r) => r.kind },
        { header: "amount", value: (r) => centsToDecimalString(r.amount_cents) },
        { header: "application_ref", value: (r) => (r.application_id ? appRef.get(r.application_id) : "") },
        { header: "product", value: (r) => (r.product_id ? product.get(r.product_id) : "") },
        { header: "carrier", value: (r) => (r.carrier_id ? carrier.get(r.carrier_id) : "") },
        { header: "statement_ref", value: (r) => r.statement_ref },
        { header: "notes", value: (r) => r.notes },
      ];
      csv = toCsv(data.transactions.filter((t) => inRange(t.transaction_date)), cols);
      break;
    }
    case "expenses": {
      const cols: CsvColumn<Expense>[] = [
        { header: "external_id", value: (r) => r.external_id },
        { header: "expense_date", value: (r) => r.expense_date },
        { header: "category", value: (r) => r.category },
        { header: "amount", value: (r) => centsToDecimalString(r.amount_cents) },
        { header: "vendor", value: (r) => r.vendor },
        { header: "description", value: (r) => r.description },
        { header: "lead_source", value: (r) => (r.lead_source_id ? source.get(r.lead_source_id) : "") },
      ];
      csv = toCsv(data.expenses.filter((e) => inRange(e.expense_date)), cols);
      break;
    }
    case "funnel": {
      const s = buildSnapshot(data, { asOf, from: filters.from, to: filters.to });
      const cols: CsvColumn<FunnelRow>[] = [
        { header: "lead_source", value: (r) => r.name },
        { header: "leads_acquired", value: (r) => r.leadsAcquired },
        { header: "lead_spend", value: (r) => centsToDecimalString(r.spendCents) },
        { header: "calls_attempted", value: (r) => r.dials },
        { header: "connections", value: (r) => r.connections },
        { header: "qualified_conversations", value: (r) => r.qualified },
        { header: "appointments_booked", value: (r) => r.appointmentsBooked },
        { header: "appointments_held", value: (r) => r.appointmentsHeld },
        { header: "applications_written", value: (r) => r.applicationsWritten },
        { header: "applications_approved", value: (r) => r.applicationsApproved },
        { header: "revenue_received", value: (r) => centsToDecimalString(r.revenueReceivedCents) },
        { header: "contact_rate_pct", value: (r) => rate(r.rates.contactRate.value) },
        { header: "booking_rate_pct", value: (r) => rate(r.rates.bookingRate.value) },
        { header: "show_rate_pct", value: (r) => rate(r.rates.showRate.value) },
        { header: "close_rate_pct", value: (r) => rate(r.rates.closeRate.value) },
        { header: "cost_per_lead", value: (r) => (r.rates.costPerLead.value === null ? "" : centsToDecimalString(Math.round(r.rates.costPerLead.value))) },
        { header: "cost_per_appointment", value: (r) => (r.rates.costPerAppointment.value === null ? "" : centsToDecimalString(Math.round(r.rates.costPerAppointment.value))) },
        { header: "cost_per_application", value: (r) => (r.rates.costPerApplication.value === null ? "" : centsToDecimalString(Math.round(r.rates.costPerApplication.value))) },
        { header: "revenue_per_lead", value: (r) => (r.rates.revenuePerLead.value === null ? "" : centsToDecimalString(Math.round(r.rates.revenuePerLead.value))) },
        { header: "roas", value: (r) => (r.rates.returnOnAdSpend.value === null ? "" : r.rates.returnOnAdSpend.value.toFixed(2)) },
      ];
      csv = toCsv([...s.funnel.rows, s.funnel.total], cols);
      break;
    }
    case "summary": {
      const s = buildSnapshot(data, { asOf, from: filters.from, to: filters.to, productId });
      const p = s.pacing;
      const r = s.range;
      const base = s.forecast.find((f) => f.key === "base");
      const rows: Array<{ metric: string; value: string | number | null; type: string; numerator?: number | null; denominator?: number | null }> = [
        { metric: "campaign", value: campaign.name, type: "info" },
        { metric: "as_of", value: asOf, type: "info" },
        { metric: "range_from", value: filters.from ?? campaign.start_date, type: "info" },
        { metric: "range_to", value: filters.to ?? campaign.end_date, type: "info" },
        { metric: "outbound_dials", value: r.totals.outbound_dials.value, type: "actual" },
        { metric: "voice_connections", value: r.totals.voice_connections.value, type: "actual" },
        { metric: "appointments_booked", value: r.totals.appointments_booked.value, type: "actual" },
        { metric: "total_applications", value: r.totalApplications, type: "actual" },
        ...r.productCounts.map((c) => ({ metric: `applications_${c.productCode.toLowerCase()}`, value: c.counted, type: "actual" })),
        { metric: "contact_rate_pct", value: rate(r.rates.contactRate.value), type: "actual", numerator: r.rates.contactRate.numerator, denominator: r.rates.contactRate.denominator },
        { metric: "conversation_close_rate_pct", value: rate(r.rates.conversationCloseRate.value), type: "actual", numerator: r.rates.conversationCloseRate.numerator, denominator: r.rates.conversationCloseRate.denominator },
        { metric: "dials_per_application", value: r.rates.dialsPerApplication.value?.toFixed(2) ?? "", type: "actual", numerator: r.rates.dialsPerApplication.numerator, denominator: r.rates.dialsPerApplication.denominator },
        { metric: "goal", value: p.goal, type: "goal" },
        { metric: "goal_completion_pct", value: rate(p.completion.value), type: "actual", numerator: p.actual, denominator: p.goal },
        { metric: "remaining_applications", value: p.remaining, type: "derived" },
        { metric: "remaining_working_days", value: p.remainingWorkingDays, type: "derived" },
        { metric: "required_applications_per_day", value: p.requiredPerDay?.toFixed(2) ?? "", type: "derived" },
        { metric: "required_dials", value: p.requiredDials, type: "estimate" },
        { metric: "required_dials_per_day", value: p.requiredDialsPerDay?.toFixed(1) ?? "", type: "estimate" },
        { metric: "pace_status", value: p.status, type: "derived" },
        { metric: "expected_finish", value: p.projectedFinishDate, type: "estimate" },
        ...s.forecast.map((f) => ({ metric: `forecast_${f.key}_applications`, value: f.projectedApplications?.toFixed(1) ?? "", type: "estimate" })),
        { metric: "revenue_projected_base", value: centsToDecimalString(base?.projectedRevenueCents ?? null), type: "estimate" },
        { metric: "revenue_expected", value: centsToDecimalString(s.revenue.expectedCents), type: "estimate" },
        { metric: "revenue_paid", value: centsToDecimalString(s.revenue.paidCents), type: "actual" },
        { metric: "chargebacks", value: centsToDecimalString(s.revenue.chargebackCents), type: "actual" },
        { metric: "revenue_received_net", value: centsToDecimalString(s.revenue.netReceivedCents), type: "actual" },
        { metric: "expenses_total", value: centsToDecimalString(s.revenue.expenses.total), type: "actual" },
        { metric: "net_cash_contribution", value: centsToDecimalString(s.revenue.netCashContributionCents), type: "actual" },
      ];
      csv = toCsv(rows, [
        { header: "metric", value: (x) => x.metric },
        { header: "value", value: (x) => x.value },
        { header: "type", value: (x) => x.type },
        { header: "numerator", value: (x) => x.numerator },
        { header: "denominator", value: (x) => x.denominator },
      ]);
      break;
    }
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${campaign.slug}-${kind}-${asOf}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
