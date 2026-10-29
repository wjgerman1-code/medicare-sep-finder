import { Target } from "lucide-react";
import { TrajectoryChart } from "@/components/app/charts";
import { ConfirmDelete } from "@/components/app/form-kit";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar } from "@/components/app/filter-bar";
import { KpiCard } from "@/components/app/kpi-card";
import { MilestoneTable } from "@/components/app/milestone-table";
import { PaceBadge } from "@/components/app/pace-badge";
import { PageHeader, SectionTitle } from "@/components/app/page-header";
import { SimpleForm } from "@/components/app/simple-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SearchParams } from "@/lib/data/filters";
import { loadPage } from "@/lib/data/page-data";
import { formatDate, formatShortDate } from "@/lib/dates";
import { parseForecastAssumptions, SCENARIO_KEYS } from "@/lib/kpi/forecast";
import { goalProgress } from "@/lib/kpi/goals";
import { computeMilestones } from "@/lib/kpi/milestones";
import { formatNumber, formatPercent } from "@/lib/kpi/ratio";
import { formatCents } from "@/lib/money";
import { NoCampaign } from "../no-campaign";

export const metadata = { title: "Goals & Forecast" };

const METRIC_LABEL: Record<string, string> = {
  applications: "Applications",
  outbound_dials: "Outbound dials",
  voice_connections: "Voice connections",
  qualified_conversations: "Qualified conversations",
  appointments_booked: "Appointments booked",
  appointments_held: "Appointments held",
  referrals: "Referrals",
  expected_revenue: "Expected revenue",
  received_revenue: "Revenue received",
};

export default async function GoalsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { ws, campaign, data, snapshot: s, asOf } = await loadPage(searchParams);
  if (!campaign || !data || !s) return <NoCampaign />;
  const p = s.pacing;
  const fa = parseForecastAssumptions(campaign.forecast_assumptions);
  const goals = data.goals.filter((g) => g.campaign_id === campaign.id || g.campaign_id === null);
  const productName = new Map(ws.products.map((x) => [x.id, x.name]));
  const goalLabel = s.goalProduct?.code ?? "Applications";

  const formulas: Array<[string, string, string]> = [
    ["Goal completion", `${p.actual} ÷ ${p.goal ?? "—"}`, formatPercent(p.completion.value)],
    ["Remaining applications", `max(0, ${p.goal ?? "—"} − ${p.actual})`, formatNumber(p.remaining)],
    ["Working days (total / elapsed / remaining)", "Schedule minus exceptions", `${p.totalWorkingDays} / ${p.elapsedWorkingDays} / ${p.remainingWorkingDays}`],
    ["Required per day", `${formatNumber(p.remaining)} ÷ ${p.remainingWorkingDays}`, formatNumber(p.requiredPerDay, 2)],
    ["Dials per application (historical)", `${formatNumber(p.dialsPerApplication.numerator)} ÷ ${formatNumber(p.dialsPerApplication.denominator)}`, formatNumber(p.dialsPerApplication.value, 2)],
    ["Required dials", `${formatNumber(p.remaining)} × ${formatNumber(p.dialsPerApplication.value, 2)}`, formatNumber(p.requiredDials)],
    ["Required dials per day", `${formatNumber(p.requiredDials)} ÷ ${p.remainingWorkingDays}`, formatNumber(p.requiredDialsPerDay, 1)],
    ["Expected by now", `${p.goal ?? "—"} × ${p.elapsedWorkingDays} ÷ ${p.totalWorkingDays}`, formatNumber(p.expectedByNow, 1)],
    ["Current pace", `${p.actual} ÷ ${p.elapsedWorkingDays} working days`, `${formatNumber(p.currentPacePerDay, 2)} / day`],
    ["Projected at campaign end", `${p.actual} + pace × ${p.remainingWorkingDays}`, formatNumber(p.projectedAtEnd, 1)],
  ];

  return (
    <>
      <PageHeader title="Goals & Forecast" description={`${campaign.name} · pacing, required activity and scenario forecasts`} />
      <FilterBar campaigns={ws.campaigns} current={campaign.slug} products={ws.products} showDates={false} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label={`${goalLabel} goal`} value={p.goal ?? "—"} sub={<PaceBadge status={p.status} />} tone="gold" progress={(p.completion.value ?? 0) * 100} />
        <KpiCard label="Required per working day" value={formatNumber(p.requiredPerDay, 1)} sub={`${formatNumber(p.remaining)} left over ${p.remainingWorkingDays} days`} />
        <KpiCard label="Required dials per day" value={formatNumber(p.requiredDialsPerDay === null ? null : Math.ceil(p.requiredDialsPerDay))} sub={`vs ${formatNumber(p.historicalDialsPerDay, 0)} historical`} estimate />
        <KpiCard label="Expected finish" value={p.projectedFinishDate ? formatShortDate(p.projectedFinishDate) : p.status === "complete" ? "Done" : "—"} sub={p.projectedFinishDate && p.projectedFinishDate > campaign.end_date ? `After ${formatShortDate(campaign.end_date)} at current pace` : "At current pace"} estimate />
      </div>

      <div className="mt-6">
        <MilestoneTable rows={computeMilestones(data, s)} start={campaign.start_date} end={campaign.end_date} asOf={asOf} />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Cumulative actual vs required trajectory</CardTitle>
          <CardDescription>The aggregate baseline appears as a single point on its as-of date — it is not spread across days.</CardDescription>
        </CardHeader>
        <CardContent>
          <TrajectoryChart data={s.trajectory} goal={s.goal} asOf={asOf} />
        </CardContent>
      </Card>

      <SectionTitle aside={<Badge variant="forecast">All figures are estimates</Badge>}>Forecast scenarios</SectionTitle>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Scenario</TableHead>
              <TableHead className="text-right">Apps per dial</TableHead>
              <TableHead className="text-right">Dials per day</TableHead>
              <TableHead className="text-right">Future dials</TableHead>
              <TableHead className="text-right">Projected apps</TableHead>
              <TableHead className="text-right">vs goal</TableHead>
              <TableHead className="text-right">Projected revenue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {s.forecast.map((f) => (
              <TableRow key={f.key} className={f.key === "base" ? "bg-cream/40" : undefined}>
                <TableCell className="font-medium text-navy">{f.label}</TableCell>
                <TableCell className="text-right">{f.applicationsPerDial === null ? "—" : `${(f.applicationsPerDial * 100).toFixed(2)}%`}</TableCell>
                <TableCell className="text-right">
                  {formatNumber(f.dialsPerDay, 1)} <span className="text-[0.65rem] text-muted-foreground">({f.dialsPerDaySource})</span>
                </TableCell>
                <TableCell className="text-right">{formatNumber(f.futureDials)}</TableCell>
                <TableCell className="text-right font-semibold text-navy">{formatNumber(f.projectedApplications, 1)}</TableCell>
                <TableCell className="text-right">
                  {f.goalReached === null ? "—" : f.goalReached ? <Badge variant="success">Reaches goal</Badge> : <Badge variant="destructive">−{formatNumber(f.gapToGoal, 1)}</Badge>}
                </TableCell>
                <TableCell className="text-right">{formatCents(f.projectedRevenueCents, { whole: true })}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <CardContent className="pt-4 text-xs text-muted-foreground">
          Projected applications = current applications + (planned future dials × assumed applications per dial). Planned dials per day come from the dialing schedule (Settings), falling back to your historical dials per working day. Revenue = current expected + additional applications × commission assumption.
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Scenario assumptions</CardTitle>
            <CardDescription>Multipliers apply to your historical conversion and dial volume. A dials/day override replaces the volume entirely.</CardDescription>
          </CardHeader>
          <CardContent>
            <SimpleForm
              action="saveForecastAssumptions"
              hidden={{ campaign_id: campaign.id }}
              resetOnSuccess={false}
              columns={3}
              submitLabel="Save assumptions"
              fields={SCENARIO_KEYS.flatMap((k) => [
                { name: `${k}_rate`, label: `${fa.scenarios[k].label}: conversion ×`, type: "number" as const, defaultValue: fa.scenarios[k].applicationsPerDialMultiplier, max: 5 },
                { name: `${k}_dials`, label: "Dial volume ×", type: "number" as const, defaultValue: fa.scenarios[k].dialsPerDayMultiplier, max: 5 },
                { name: `${k}_dials_override`, label: "Dials/day override", type: "number" as const, defaultValue: fa.scenarios[k].dialsPerDayOverride ?? null, placeholder: "optional" },
              ])}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>How the pacing numbers are calculated</CardTitle>
          </CardHeader>
          <Table>
            <TableBody>
              {formulas.map(([label, formula, value]) => (
                <TableRow key={label}>
                  <TableCell className="text-sm">{label}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formula}</TableCell>
                  <TableCell className="text-right font-semibold text-navy">{value}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>

      <SectionTitle>Goals & milestones</SectionTitle>
      {goals.length === 0 ? (
        <EmptyState icon={Target} title="No goals yet">Add campaign, monthly, weekly or daily targets below.</EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {goals.map((g) => {
            const gp = goalProgress(g, data, asOf);
            const fmt = (v: number) => (gp.isMoney ? formatCents(v, { whole: true }) : formatNumber(v));
            return (
              <Card key={g.id}>
                <CardContent className="space-y-2 pt-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {g.period_type} · {formatShortDate(g.period_start)} – {formatShortDate(g.period_end)}
                      </div>
                      <div className="font-serif text-lg font-semibold text-navy">
                        {METRIC_LABEL[g.metric]}
                        {g.product_id ? ` · ${productName.get(g.product_id)}` : ""}
                      </div>
                    </div>
                    <ConfirmDelete action="deleteGoal" id={g.id} what="this goal" />
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="tabular font-serif text-3xl font-semibold text-navy">{fmt(gp.actual)}</span>
                    <span className="text-muted-foreground">/ {fmt(gp.target)}</span>
                    <span className="ml-auto text-sm font-semibold text-gold-deep">{formatPercent(gp.completion.value, 0)}</span>
                  </div>
                  <Progress value={(gp.completion.value ?? 0) * 100} indicatorClassName="brushed-gold" />
                  <p className="text-xs text-muted-foreground">
                    {gp.remaining === 0 ? "Achieved" : `${fmt(gp.remaining)} to go · ${gp.requiredPerDay === null ? "period ended" : `${gp.isMoney ? formatCents(Math.round(gp.requiredPerDay), { whole: true }) : formatNumber(gp.requiredPerDay, 1)} per working day`}`}
                    {gp.baselineExcluded && " · baseline straddles this period and is excluded"}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg">Add a goal</CardTitle>
          <CardDescription>Annual, campaign, monthly, weekly or daily — for any product, activity or revenue target. Revenue targets are in dollars.</CardDescription>
        </CardHeader>
        <CardContent>
          <SimpleForm
            action="saveGoal"
            columns={4}
            submitLabel="Add goal"
            fields={[
              { name: "campaign_id", label: "Scope", type: "select", defaultValue: campaign.id, options: [{ value: campaign.id, label: campaign.name }, { value: "", label: "Agency-wide (no campaign)" }] },
              { name: "period_type", label: "Period", type: "select", defaultValue: "weekly", options: ["annual", "campaign", "monthly", "weekly", "daily"].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })) },
              { name: "period_start", label: "Start", type: "date", required: true, defaultValue: asOf },
              { name: "period_end", label: "End", type: "date", required: true, defaultValue: campaign.end_date },
              { name: "metric", label: "Metric", type: "select", defaultValue: "applications", options: Object.entries(METRIC_LABEL).map(([value, label]) => ({ value, label })) },
              { name: "product_id", label: "Product", type: "select", options: [{ value: "", label: "All products" }, ...ws.products.map((x) => ({ value: x.id, label: x.name }))] },
              { name: "target", label: "Target", type: "text", required: true, placeholder: "e.g. 25 or 9,075.00" },
              { name: "notes", label: "Notes", type: "text" },
            ]}
          />
          <p className="mt-3 text-xs text-muted-foreground">Working-day schedules and vacation days are managed in Settings → Schedule. Campaign dates: {formatDate(campaign.start_date)} – {formatDate(campaign.end_date)}.</p>
        </CardContent>
      </Card>
    </>
  );
}
