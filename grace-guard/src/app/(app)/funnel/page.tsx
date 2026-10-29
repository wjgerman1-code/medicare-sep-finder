import { Download, Filter } from "lucide-react";
import { HorizontalBars } from "@/components/app/charts";
import { ConfirmDelete } from "@/components/app/form-kit";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar } from "@/components/app/filter-bar";
import { PageHeader, SectionTitle } from "@/components/app/page-header";
import { ScopeNotes } from "@/components/app/scope-notes";
import { SimpleForm } from "@/components/app/simple-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { filterQuery, type SearchParams } from "@/lib/data/filters";
import { loadPage } from "@/lib/data/page-data";
import { formatDate } from "@/lib/dates";
import type { FunnelRow } from "@/lib/kpi/funnel";
import { formatNumber, formatPercent, type Ratio } from "@/lib/kpi/ratio";
import { formatCents } from "@/lib/money";
import { NoCampaign } from "../no-campaign";

export const metadata = { title: "Lead Funnel" };

const pct = (r: Ratio) => formatPercent(r.value);
const money = (r: Ratio) => (r.value === null ? "—" : formatCents(Math.round(r.value)));
const roas = (r: Ratio) => (r.value === null ? "—" : `${r.value.toFixed(2)}×`);
const n = (v: number | null) => (v === null ? "—" : formatNumber(v));

const RATE_DEFS = [
  ["Contact rate", "Voice connections ÷ outbound dials"],
  ["Booking rate", "Appointments booked ÷ qualified conversations"],
  ["Show rate", "Appointments held ÷ appointments booked"],
  ["Close rate", "Applications written ÷ voice connections"],
  ["Cost per lead", "Lead spend ÷ leads acquired"],
  ["Cost per appointment", "Lead spend ÷ appointments booked"],
  ["Cost per application", "Lead spend ÷ applications written"],
  ["Revenue per lead", "Commission received ÷ leads acquired"],
  ["ROAS", "Commission received ÷ lead spend"],
];

function FunnelRowCells({ r }: { r: FunnelRow }) {
  return (
    <>
      <TableCell className="text-right">{n(r.leadsAcquired)}</TableCell>
      <TableCell className="text-right">{formatCents(r.spendCents, { whole: true })}</TableCell>
      <TableCell className="text-right">{n(r.dials)}</TableCell>
      <TableCell className="text-right">{n(r.connections)}</TableCell>
      <TableCell className="text-right">{n(r.qualified)}</TableCell>
      <TableCell className="text-right">{n(r.appointmentsBooked)}</TableCell>
      <TableCell className="text-right">{n(r.appointmentsHeld)}</TableCell>
      <TableCell className="text-right font-semibold text-navy">{n(r.applicationsWritten)}</TableCell>
      <TableCell className="text-right">{n(r.applicationsApproved)}</TableCell>
      <TableCell className="text-right">{formatCents(r.revenueReceivedCents, { whole: true })}</TableCell>
    </>
  );
}

function RateCells({ r }: { r: FunnelRow }) {
  return (
    <>
      <TableCell className="text-right" title={`${r.rates.contactRate.numerator ?? "—"} ÷ ${r.rates.contactRate.denominator ?? "—"}`}>{pct(r.rates.contactRate)}</TableCell>
      <TableCell className="text-right">{pct(r.rates.bookingRate)}</TableCell>
      <TableCell className="text-right">{pct(r.rates.showRate)}</TableCell>
      <TableCell className="text-right">{pct(r.rates.closeRate)}</TableCell>
      <TableCell className="text-right">{money(r.rates.costPerLead)}</TableCell>
      <TableCell className="text-right">{money(r.rates.costPerAppointment)}</TableCell>
      <TableCell className="text-right">{money(r.rates.costPerApplication)}</TableCell>
      <TableCell className="text-right">{money(r.rates.revenuePerLead)}</TableCell>
      <TableCell className="text-right">{roas(r.rates.returnOnAdSpend)}</TableCell>
    </>
  );
}

export default async function FunnelPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { ws, filters, campaign, data, snapshot: s } = await loadPage(searchParams);
  if (!campaign || !data || !s) return <NoCampaign />;
  const { rows, total } = s.funnel;
  const sourceName = new Map(ws.leadSources.map((l) => [l.id, l.name]));

  return (
    <>
      <PageHeader title="Lead Funnel" description="Leads → connections → appointments → applications → revenue, by lead source">
        <Button asChild variant="outline" size="sm">
          <a href={`/api/export/funnel${filterQuery(filters)}`}>
            <Download /> Export CSV
          </a>
        </Button>
      </PageHeader>
      <FilterBar campaigns={ws.campaigns} current={campaign.slug} showProduct={false} campaignRange={{ start: campaign.start_date, end: campaign.end_date }} />
      <ScopeNotes collected={s.range.collected} />

      {rows.length === 0 ? (
        <EmptyState icon={Filter} title="No funnel data yet">
          Choose a lead source when logging daily activity, and record lead purchases below, to compare sources.
        </EmptyState>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Volume by source</CardTitle>
              <CardDescription>“—” means not captured (different from zero). The baseline has no source, so it appears under Unattributed.</CardDescription>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead source</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                  <TableHead className="text-right">Connections</TableHead>
                  <TableHead className="text-right">Qualified</TableHead>
                  <TableHead className="text-right">Booked</TableHead>
                  <TableHead className="text-right">Held</TableHead>
                  <TableHead className="text-right">Apps</TableHead>
                  <TableHead className="text-right">Approved</TableHead>
                  <TableHead className="text-right">Revenue rec’d</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.key}>
                    <TableCell className="whitespace-nowrap font-medium text-navy">{r.name}</TableCell>
                    <FunnelRowCells r={r} />
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell>{total.name}</TableCell>
                  <FunnelRowCells r={total} />
                </TableRow>
              </TableFooter>
            </Table>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Conversion & efficiency</CardTitle>
              <CardDescription>Weighted from raw totals — daily percentages are never averaged. Hover a rate to see numerator ÷ denominator.</CardDescription>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead source</TableHead>
                  {RATE_DEFS.map(([label, def]) => (
                    <TableHead key={label} className="text-right" title={def}>
                      {label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.key}>
                    <TableCell className="whitespace-nowrap font-medium text-navy">{r.name}</TableCell>
                    <RateCells r={r} />
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell>{total.name}</TableCell>
                  <RateCells r={total} />
                </TableRow>
              </TableFooter>
            </Table>
            <CardContent className="pt-4">
              <dl className="grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
                {RATE_DEFS.map(([label, def]) => (
                  <div key={label}>
                    <dt className="inline font-semibold text-charcoal">{label}:</dt> <dd className="inline">{def}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Applications by source</CardTitle>
              </CardHeader>
              <CardContent>
                <HorizontalBars data={rows.map((r) => ({ name: r.name, value: r.applicationsWritten }))} valueLabel="Applications" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Spend by source</CardTitle>
              </CardHeader>
              <CardContent>
                <HorizontalBars data={rows.filter((r) => r.spendCents > 0).map((r) => ({ name: r.name, value: r.spendCents }))} valueLabel="Spend" money />
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <SectionTitle>Leads acquired</SectionTitle>
      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Record a lead batch</CardTitle>
            <CardDescription>Counts only — no names or contact details. Record the cost as daily lead spend or an expense.</CardDescription>
          </CardHeader>
          <CardContent>
            <SimpleForm
              action="saveLead"
              hidden={{ campaign_id: campaign.id }}
              columns={1}
              submitLabel="Save leads"
              fields={[
                { name: "lead_source_id", label: "Lead source", type: "select", required: true, options: ws.leadSources.filter((l) => l.is_active).map((l) => ({ value: l.id, label: l.name })) },
                { name: "acquired_date", label: "Date acquired", type: "date", required: true, defaultValue: s.asOf },
                { name: "quantity", label: "Number of leads", type: "number", required: true, min: 1, defaultValue: 1 },
                { name: "external_ref", label: "Batch / order reference", type: "text", hint: "Optional, non-sensitive." },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          {data.leads.length === 0 ? (
            <CardContent className="pt-5">
              <p className="text-sm text-muted-foreground">No lead batches recorded. Cost per lead and revenue per lead appear once leads are recorded.</p>
            </CardContent>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="sr-only">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.leads.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>{formatDate(l.acquired_date)}</TableCell>
                    <TableCell>{sourceName.get(l.lead_source_id)}</TableCell>
                    <TableCell className="text-right">{l.quantity}</TableCell>
                    <TableCell>{l.external_ref ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <ConfirmDelete action="deleteLead" id={l.id} what="this lead batch" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
