import Link from "next/link";
import { CalendarCheck, CalendarDays, CalendarPlus, ChevronRight, Download, FileText, MoreHorizontal, Target } from "lucide-react";
import { TrajectoryChart } from "@/components/app/charts";
import { FilterBar } from "@/components/app/filter-bar";
import { KpiCard } from "@/components/app/kpi-card";
import { LastUpdated } from "@/components/app/last-updated";
import { PaceBadge } from "@/components/app/pace-badge";
import { DialPlanToday } from "@/components/app/dial-plan";
import { MeterList, type MeterItem } from "@/components/app/meter-list";
import { SectionTitle } from "@/components/app/page-header";
import { RecommendationList } from "@/components/app/recommendations";
import { ScopeNotes } from "@/components/app/scope-notes";
import { SortableTable } from "@/components/app/sortable-table";
import { TrendCard } from "@/components/app/trend-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { filterQuery, type SearchParams } from "@/lib/data/filters";
import { loadPage } from "@/lib/data/page-data";
import { formatDate, formatShortDate } from "@/lib/dates";
import { APP_COLUMNS } from "@/lib/domain/types";
import { computeMilestones } from "@/lib/kpi/milestones";
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

  const firstName = ws.profile.full_name?.trim().split(/\s+/)[0] ?? null;
  const appsToday = s.toDate.productCounts.reduce((a, c) => a + (c.byDate.find((d) => d.date === s.asOf)?.counted ?? 0), 0);
  const goalCount = s.goalProduct ? s.toDate.productCounts.find((c) => c.productId === s.goalProduct!.id) : undefined;
  const totalApps = s.toDate.totalApplications;
  const meterItems: MeterItem[] = [];
  if (goalCount) {
    meterItems.push({
      label: `${goalCount.productCode} goal progress`,
      share: p.completion.value,
      shareLabel: "of goal",
      detail: `${p.actual} of ${p.goal ?? "—"}`,
      tone: "gold",
    });
  }
  for (const m of computeMilestones(data, s)) {
    if (!["dials", "connections", "revenue"].includes(m.key) || m.goal === null || m.current === null) continue;
    const money = m.format === "money";
    meterItems.push({
      label: `${m.label} goal`,
      share: m.goal ? m.current / m.goal : null,
      shareLabel: "of goal",
      detail: money ? `${formatCents(m.current, { whole: true })} of ${formatCents(m.goal, { whole: true })}` : `${formatNumber(m.current)} of ${formatNumber(m.goal)}`,
      tone: "gold",
    });
  }
  const others = s.toDate.productCounts.filter((c) => c.counted > 0);
  const fillers = s.toDate.productCounts.filter((c) => c.counted === 0 && ws.products.find((x) => x.id === c.productId)?.is_active);
  for (const c of [...others, ...fillers].slice(0, Math.max(others.length, 2))) {
    meterItems.push({
      label: c.productName,
      share: totalApps ? c.counted / totalApps : null,
      shareLabel: "of sales",
      detail: `${c.counted} app${c.counted === 1 ? "" : "s"}`,
    });
  }

  return (
    <>
      {/* greeting + headline stats */}
      <div className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-serif text-4xl font-semibold text-navy md:text-5xl">
            Welcome back{firstName ? ", " : ""}
            {firstName && <span className="text-gold-deep">{firstName}</span>}
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4 text-gold" />
              {formatDate(s.asOf, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            </span>
            <LastUpdated at={s.lastUpdatedAt} timeZone={ws.profile.timezone} />
          </p>
          <DialPlanToday date={s.asOf} schedule={data.schedule} className="mt-2" />
          <p className="mt-2 text-xs text-muted-foreground">
            {campaign.name} · {formatDate(campaign.start_date)} – {formatDate(campaign.end_date)}
            {!firstName && (
              <>
                {" · "}
                <Link className="text-gold-deep hover:underline" href={`/settings${filterQuery({ campaign: filters.campaign }, { tab: "profile" })}`}>
                  Add your name
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-6 sm:gap-10">
          <HeadlineStat icon={CalendarCheck} value={appsToday} label="Apps today" />
          <HeadlineStat icon={FileText} value={p.actual} label={`${goalLabel} written`} />
          <HeadlineStat icon={Target} value={p.remaining ?? "—"} label="To goal" />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <Button asChild variant="outline" size="sm" className="rounded-full">
          <a href={`/api/export/summary${qs}`}>
            <Download /> Export CSV
          </a>
        </Button>
        <Button asChild variant="gold" size="sm" className="rounded-full">
          <Link href={`/activity${filterQuery({ campaign: filters.campaign })}`}>
            <CalendarPlus /> Log today
          </Link>
        </Button>
      </div>

      <FilterBar
        campaigns={ws.campaigns}
        current={campaign.slug}
        products={ws.products.filter((x) => x.is_active)}
        campaignRange={{ start: campaign.start_date, end: campaign.end_date }}
      />
      <ScopeNotes collected={r.collected} />

      <div className="mb-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <TrendCard data={dailySeries(s.toDate.collected.sources)} asOf={s.asOf} campaignStart={campaign.start_date} />
        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle>Goals & product mix</CardTitle>
              <CardDescription className="mt-1">Campaign to date · reconciled counts</CardDescription>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Product mix options">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href={`/production${qs}`}>View production detail</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/goals${qs}`}>Goals & forecast</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={`/api/export/applications${qs}`}>Export applications CSV</a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardHeader>
          <CardContent>
            <MeterList items={meterItems} />
          </CardContent>
        </Card>
      </div>

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

      <SectionTitle
        aside={
          <Button asChild variant="pill" size="sm">
            <Link href={`/activity${qs}`}>
              View all <ChevronRight />
            </Link>
          </Button>
        }
      >
        Recent activity
      </SectionTitle>
      <Card>
        <SortableTable
          columns={[
            { label: "Date" },
            { label: "Source" },
            { label: "Dials", align: "right" },
            { label: "Connections", align: "right" },
            { label: "Contact", align: "right" },
            { label: "Appts", align: "right" },
            { label: "Apps", align: "right" },
          ]}
          rows={[
            ...recent.map((d) => {
              const apps = APP_COLUMNS.reduce((a, c) => a + d[c], 0);
              const covered = r.collected.coveredDaily.some((c) => c.id === d.id);
              const contact = d.outbound_dials ? d.voice_connections / d.outbound_dials : null;
              const source = d.lead_source_id ? sourcesById.get(d.lead_source_id) ?? "—" : "All / mixed";
              return {
                id: d.id,
                className: covered ? "opacity-50" : undefined,
                sort: [d.activity_date, source, d.outbound_dials, d.voice_connections, contact, d.appointments_booked, apps],
                cells: [
                  <>
                    {formatDate(d.activity_date, { weekday: "short", month: "short", day: "numeric" })}
                    {covered && <Badge variant="outline" className="ml-2">In baseline</Badge>}
                  </>,
                  source,
                  d.outbound_dials,
                  d.voice_connections,
                  formatPercent(contact),
                  d.appointments_booked,
                  <span key="apps" className="font-semibold text-navy">{apps}</span>,
                ],
              };
            }),
            ...data.baselines.map((b) => {
              const apps = APP_COLUMNS.reduce((a, c) => a + (b[c] ?? 0), 0);
              const contact = b.outbound_dials && b.voice_connections !== null ? b.voice_connections / b.outbound_dials : null;
              return {
                id: b.id,
                className: "bg-cream/40",
                sort: [b.as_of_date, "Aggregate", b.outbound_dials, b.voice_connections, contact, b.appointments_booked, apps],
                cells: [
                  <>
                    {formatShortDate(b.coverage_start)} – {formatShortDate(b.as_of_date)} <Badge variant="gold" className="ml-2">Baseline</Badge>
                  </>,
                  "Aggregate",
                  b.outbound_dials ?? "—",
                  b.voice_connections ?? "—",
                  formatPercent(contact),
                  b.appointments_booked ?? "—",
                  <span key="apps" className="font-semibold text-navy">{apps}</span>,
                ],
              };
            }),
          ]}
          initialSort={{ col: 0, dir: "desc" }}
        />
      </Card>
    </>
  );
}

function HeadlineStat({ icon: Icon, value, label }: { icon: React.ComponentType<{ className?: string }>; value: number | string; label: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="flex items-center gap-2.5">
        <span className="flex h-10 w-10 items-center justify-center rounded-full border border-gold/40 bg-gold/10">
          <Icon className="h-5 w-5 text-gold-deep" />
        </span>
        <span className="tabular font-serif text-5xl font-semibold leading-none text-navy">{value}</span>
      </div>
      <span className="mt-1.5 text-sm font-medium text-charcoal">{label}</span>
    </div>
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
