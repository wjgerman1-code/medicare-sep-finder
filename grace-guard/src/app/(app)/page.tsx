import Link from "next/link";
import { CalendarPlus, Download } from "lucide-react";
import { DailyTrendChart, HorizontalBars, TrajectoryChart } from "@/components/app/charts";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar } from "@/components/app/filter-bar";
import { KpiCard } from "@/components/app/kpi-card";
import { LastUpdated } from "@/components/app/last-updated";
import { PaceBadge } from "@/components/app/pace-badge";
import { PageHeader, SectionTitle } from "@/components/app/page-header";
import { RecommendationList } from "@/components/app/recommendations";
import { ScopeNotes } from "@/components/app/scope-notes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { filterQuery, type SearchParams } from "@/lib/data/filters";
import { loadPage } from "@/lib/data/page-data";
import { formatDate, formatShortDate } from "@/lib/dates";
import { APP_COLUMNS } from "@/lib/domain/types";
import { formatNumber, formatPercent } from "@/lib/kpi/ratio";
import { dailySeries } from "@/lib/kpi/series";
import { formatCents } from "@/lib/money";
import { NoCampaign } from "./no-campaign";

export const metadata = { title: "Executive Overview" };

export default async function OverviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { ws, filters, campaign, snapshot: s, data } = await loadPage(searchParams);
  if (!campaign || !s || !data) return <NoCampaign />;

  const p = s.pacing;
  const r = s.range;
  const goalLabel = s.goalProduct?.code ?? "Applications";
  const base = s.forecast.find((f) => f.key === "base");
  const sourcesById = new Map(ws.leadSources.map((l) => [l.id, l.name]));
  const qs = filterQuery(filters);
  const recent = s.recentDaily.slice(0, 8);
  const filtered = !!(filters.from || filters.to);

  return (
    <>
      <PageHeader
        title="Executive Overview"
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              {campaign.name} · {formatDate(campaign.start_date)} – {formatDate(campaign.end_date)}
            </span>
            <LastUpdated at={s.lastUpdatedAt} timeZone={ws.profile.timezone} />
          </span>
        }
      >
        <Button asChild variant="outline" size="sm">
          <a href={`/api/export/summary${qs}`}>
            <Download /> Export CSV
          </a>
        </Button>
        <Button asChild variant="gold" size="sm">
          <Link href={`/activity${filterQuery({ campaign: filters.campaign })}`}>
            <CalendarPlus /> Log today
          </Link>
        </Button>
      </PageHeader>

      <FilterBar
        campaigns={ws.campaigns}
        current={campaign.slug}
        products={ws.products.filter((x) => x.is_active)}
        campaignRange={{ start: campaign.start_date, end: campaign.end_date }}
      />
      <ScopeNotes collected={r.collected} />

      {/* headline: goal progress (campaign-to-date) */}
      <Card className="mb-6 overflow-hidden">
        <div className="brushed-gold h-1" />
        <CardContent className="grid gap-6 p-5 md:grid-cols-[1.4fr_1fr] md:p-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{goalLabel} sales vs goal · campaign to date</span>
              <PaceBadge status={p.status} />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="tabular font-serif text-6xl font-semibold text-navy">{p.actual}</span>
              <span className="font-serif text-2xl text-muted-foreground">/ {p.goal ?? "—"}</span>
              <span className="ml-auto tabular font-serif text-3xl font-semibold text-gold-deep">{formatPercent(p.completion.value, 0)}</span>
            </div>
            <Progress value={(p.completion.value ?? 0) * 100} className="mt-3 h-3" indicatorClassName="brushed-gold" />
            <p className="mt-2 text-xs text-muted-foreground">
              Pace line: {formatNumber(p.expectedByNow, 1)} expected by now ({p.elapsedWorkingDays} of {p.totalWorkingDays} working days elapsed)
              {p.paceDelta !== null && ` · ${p.paceDelta >= 0 ? "+" : ""}${formatNumber(p.paceDelta, 1)} vs pace`}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Remaining sales" value={formatNumber(p.remaining)} />
            <Stat label="Working days left" value={String(p.remainingWorkingDays)} />
            <Stat label="Required / day" value={formatNumber(p.requiredPerDay, 1)} />
            <Stat label="Required dials / day" value={formatNumber(p.requiredDialsPerDay === null ? null : Math.ceil(p.requiredDialsPerDay))} estimate />
            <Stat
              label="Expected finish"
              value={p.status === "complete" ? "Done" : p.projectedFinishDate ? formatShortDate(p.projectedFinishDate) : "—"}
              sub={p.projectedFinishDate && p.projectedFinishDate > campaign.end_date ? "after campaign end" : undefined}
              estimate
              className="col-span-2"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <KpiCard label="Total sales (all products)" value={formatNumber(r.totalApplications)} sub={`${r.goalProductApplications} ${goalLabel}`} definition="Σ reconciled applications across products" />
        <KpiCard label="Outbound dials" value={formatNumber(r.totals.outbound_dials.value)} sub={`${formatNumber(r.rates.dialsPerApplication.value, 1)} dials per ${goalLabel} app`} definition="Σ outbound dials (baseline + daily)" />
        <KpiCard label="Voice connections" value={formatNumber(r.totals.voice_connections.value)} sub="Conversations over one minute" />
        <KpiCard
          label="Contact rate"
          value={formatPercent(r.rates.contactRate.value)}
          sub={`${formatNumber(r.rates.contactRate.numerator)} ÷ ${formatNumber(r.rates.contactRate.denominator)}`}
          definition="Voice connections ÷ outbound dials (weighted totals)"
        />
        <KpiCard
          label={`Close rate (${goalLabel})`}
          value={formatPercent(r.rates.conversationCloseRate.value)}
          sub={`${formatNumber(r.rates.conversationCloseRate.numerator)} ÷ ${formatNumber(r.rates.conversationCloseRate.denominator)} connections`}
          definition={`${goalLabel} applications ÷ voice connections (when populations are comparable)`}
        />
        <KpiCard
          label="Appointments booked"
          value={r.totals.appointments_booked.value === 0 && !r.totals.appointments_booked.complete ? "—" : formatNumber(r.totals.appointments_booked.value)}
          sub={`${formatNumber(r.totals.appointments_held.value)} held · show ${formatPercent(r.rates.showRate.value)}`}
        />
        <KpiCard
          label="Revenue projected"
          value={formatCents(base?.projectedRevenueCents ?? null, { whole: true })}
          sub={`Base case · ${formatNumber(base?.projectedApplications ?? null)} ${goalLabel} apps`}
          estimate
          definition="Current expected + forecast additional applications × commission assumption"
        />
        <KpiCard
          label="Revenue received"
          value={formatCents(s.revenue.netReceivedCents, { whole: true })}
          sub={`Expected (written): ${formatCents(s.revenue.expectedCents, { whole: true })}${s.revenue.unknownCommissionApps ? ` + ${s.revenue.unknownCommissionApps} unpriced` : ""}`}
          tone="gold"
          definition="Paid commissions − chargebacks (actual cash)"
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Cumulative {goalLabel} applications vs goal trajectory</CardTitle>
            <CardDescription>
              Solid = actual · gold = required trajectory · dashed = base-case forecast <Badge variant="forecast" className="ml-1">Estimate</Badge>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TrajectoryChart data={s.trajectory} goal={s.goal} asOf={s.asOf} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Next best actions</CardTitle>
            <CardDescription>Rule-based, from your own numbers</CardDescription>
          </CardHeader>
          <CardContent>
            <RecommendationList items={s.recommendations} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Daily activity trend</CardTitle>
            <CardDescription>Daily entries only{filtered ? " (selected range)" : ""} — the baseline is not split by day</CardDescription>
          </CardHeader>
          <CardContent>
            {dailySeries(r.collected.sources).length > 0 ? (
              <DailyTrendChart data={dailySeries(r.collected.sources)} />
            ) : (
              <EmptyState icon={CalendarPlus} title="No daily entries yet">
                Log your first day on the <Link className="text-gold-deep underline" href={`/activity${qs}`}>Daily Activity</Link> page to see trends.
              </EmptyState>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Sales by product</CardTitle>
            <CardDescription>Reconciled application counts{filtered ? " (selected range)" : ""}</CardDescription>
          </CardHeader>
          <CardContent>
            <HorizontalBars data={r.productCounts.filter((c) => c.counted > 0).map((c) => ({ name: c.productName, value: c.counted }))} valueLabel="Applications" />
          </CardContent>
        </Card>
      </div>

      <SectionTitle aside={<Link href={`/activity${qs}`} className="text-sm text-gold-deep hover:underline">View all →</Link>}>Recent activity</SectionTitle>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Dials</TableHead>
              <TableHead className="text-right">Connections</TableHead>
              <TableHead className="text-right">Contact</TableHead>
              <TableHead className="text-right">Appts</TableHead>
              <TableHead className="text-right">Apps</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recent.map((d) => {
              const apps = APP_COLUMNS.reduce((a, c) => a + d[c], 0);
              const covered = r.collected.coveredDaily.some((c) => c.id === d.id);
              return (
                <TableRow key={d.id} className={covered ? "opacity-50" : undefined}>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(d.activity_date, { weekday: "short", month: "short", day: "numeric" })}
                    {covered && <Badge variant="outline" className="ml-2">In baseline</Badge>}
                  </TableCell>
                  <TableCell>{d.lead_source_id ? sourcesById.get(d.lead_source_id) : "All / mixed"}</TableCell>
                  <TableCell className="text-right">{d.outbound_dials}</TableCell>
                  <TableCell className="text-right">{d.voice_connections}</TableCell>
                  <TableCell className="text-right">{formatPercent(d.outbound_dials ? d.voice_connections / d.outbound_dials : null)}</TableCell>
                  <TableCell className="text-right">{d.appointments_booked}</TableCell>
                  <TableCell className="text-right font-semibold text-navy">{apps}</TableCell>
                </TableRow>
              );
            })}
            {data.baselines.map((b) => (
              <TableRow key={b.id} className="bg-cream/40">
                <TableCell className="whitespace-nowrap">
                  {formatShortDate(b.coverage_start)} – {formatShortDate(b.as_of_date)} <Badge variant="gold" className="ml-2">Baseline</Badge>
                </TableCell>
                <TableCell>Aggregate</TableCell>
                <TableCell className="text-right">{b.outbound_dials ?? "—"}</TableCell>
                <TableCell className="text-right">{b.voice_connections ?? "—"}</TableCell>
                <TableCell className="text-right">{formatPercent(b.outbound_dials && b.voice_connections !== null ? b.voice_connections / b.outbound_dials : null)}</TableCell>
                <TableCell className="text-right">{b.appointments_booked ?? "—"}</TableCell>
                <TableCell className="text-right font-semibold text-navy">{APP_COLUMNS.reduce((a, c) => a + (b[c] ?? 0), 0)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}

function Stat({ label, value, sub, estimate, className }: { label: string; value: string; sub?: string; estimate?: boolean; className?: string }) {
  return (
    <div className={`rounded-lg border bg-ivory/60 p-3 ${estimate ? "border-dashed" : ""} ${className ?? ""}`}>
      <div className="flex items-center justify-between gap-1 text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
        {estimate && <Badge variant="forecast" className="px-1.5 py-0 text-[0.6rem]">Est.</Badge>}
      </div>
      <div className="tabular font-serif text-2xl font-semibold text-navy">{value}</div>
      {sub && <div className="text-[0.7rem] text-muted-foreground">{sub}</div>}
    </div>
  );
}
