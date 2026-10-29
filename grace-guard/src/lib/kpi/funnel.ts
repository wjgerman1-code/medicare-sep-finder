import {
  APP_COLUMNS,
  type Application,
  type CommissionTransaction,
  type Expense,
  type Lead,
  type LeadSource,
} from "@/lib/domain/types";
import { sumCents, type Cents } from "@/lib/money";
import { pairedRatio, sumField, type ActivitySource } from "./aggregate";
import { ratio, type Ratio } from "./ratio";

export const UNATTRIBUTED = "__unattributed__";

export interface FunnelRow {
  key: string;
  name: string;
  leadsAcquired: number;
  spendCents: Cents;
  dials: number;
  connections: number;
  qualified: number | null;
  appointmentsBooked: number | null;
  appointmentsHeld: number | null;
  applicationsWritten: number;
  applicationsApproved: number;
  revenueReceivedCents: Cents;
  rates: {
    contactRate: Ratio;
    bookingRate: Ratio;
    showRate: Ratio;
    closeRate: Ratio;
    costPerLead: Ratio;
    costPerAppointment: Ratio;
    costPerApplication: Ratio;
    revenuePerLead: Ratio;
    returnOnAdSpend: Ratio;
  };
}

export interface FunnelInput {
  leadSources: LeadSource[];
  sources: ActivitySource[];
  leads: Lead[];
  expenses: Expense[];
  applications: Application[];
  transactions: CommissionTransaction[];
}

function buildRow(
  key: string,
  name: string,
  sources: ActivitySource[],
  leads: Lead[],
  expenses: Expense[],
  applications: Application[],
  transactions: CommissionTransaction[],
): FunnelRow {
  const known = (f: Parameters<typeof sumField>[1]) => {
    const t = sumField(sources, f);
    return sources.length > 0 && !sources.some((s) => s.values[f] !== null) ? null : t.value;
  };
  const aggregateApps = APP_COLUMNS.reduce((a, c) => a + sumField(sources, c).value, 0);
  const applicationsWritten = Math.max(aggregateApps, applications.length);
  const applicationsApproved = applications.filter((a) => a.status === "approved" || a.status === "effectuated").length;
  const appIds = new Set(applications.map((a) => a.id));
  const revenueReceivedCents = sumCents(
    transactions
      .filter((t) => t.application_id !== null && appIds.has(t.application_id))
      .map((t) => (t.kind === "chargeback" ? -t.amount_cents : t.amount_cents)),
  );
  const spendCents =
    sumField(sources, "lead_spend_cents").value +
    sumCents(expenses.filter((e) => e.category === "lead_cost").map((e) => e.amount_cents));
  const leadsAcquired = leads.reduce((a, l) => a + l.quantity, 0);
  const booked = known("appointments_booked");

  return {
    key,
    name,
    leadsAcquired,
    spendCents,
    dials: sumField(sources, "outbound_dials").value,
    connections: sumField(sources, "voice_connections").value,
    qualified: known("qualified_conversations"),
    appointmentsBooked: booked,
    appointmentsHeld: known("appointments_held"),
    applicationsWritten,
    applicationsApproved,
    revenueReceivedCents,
    rates: {
      contactRate: pairedRatio(sources, "voice_connections", "outbound_dials"),
      bookingRate: pairedRatio(sources, "appointments_booked", "qualified_conversations"),
      showRate: pairedRatio(sources, "appointments_held", "appointments_booked"),
      closeRate: pairedRatio(sources, [...APP_COLUMNS], "voice_connections"),
      costPerLead: ratio(spendCents, leadsAcquired),
      costPerAppointment: ratio(spendCents, booked),
      costPerApplication: ratio(spendCents, applicationsWritten),
      revenuePerLead: ratio(revenueReceivedCents, leadsAcquired),
      returnOnAdSpend: ratio(revenueReceivedCents, spendCents),
    },
  };
}

/** Funnel by lead source plus an "Unattributed / mixed" row and a total row. */
export function computeFunnel(input: FunnelInput): { rows: FunnelRow[]; total: FunnelRow } {
  const { leadSources, sources, leads, expenses, applications, transactions } = input;
  const keyOf = (id: string | null) => id ?? UNATTRIBUTED;
  const rows: FunnelRow[] = [];

  const groups: Array<{ key: string; name: string }> = [
    ...[...leadSources].sort((a, b) => a.sort_order - b.sort_order).map((ls) => ({ key: ls.id, name: ls.name })),
    { key: UNATTRIBUTED, name: "Unattributed / mixed" },
  ];

  for (const g of groups) {
    const s = sources.filter((x) => keyOf(x.leadSourceId) === g.key);
    const l = leads.filter((x) => keyOf(x.lead_source_id) === g.key);
    const e = expenses.filter((x) => x.category === "lead_cost" && keyOf(x.lead_source_id) === g.key);
    const a = applications.filter((x) => keyOf(x.lead_source_id) === g.key);
    if (s.length === 0 && l.length === 0 && e.length === 0 && a.length === 0) continue;
    rows.push(buildRow(g.key, g.name, s, l, e, a, transactions));
  }

  const total = buildRow("__total__", "All sources", sources, leads, expenses.filter((e) => e.category === "lead_cost"), applications, transactions);
  // per-source max(aggregate, detailed) can exceed the overall max; keep total consistent with its rows
  total.applicationsWritten = Math.max(total.applicationsWritten, rows.reduce((a, r) => a + r.applicationsWritten, 0));
  total.rates.costPerApplication = ratio(total.spendCents, total.applicationsWritten);
  return { rows, total };
}
