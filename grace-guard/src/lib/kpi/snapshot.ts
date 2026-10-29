import { addDays, type ISODate } from "@/lib/dates";
import { APP_COLUMNS, type CampaignData, type DailyActivity, type Product } from "@/lib/domain/types";
import { collectActivity, pairedRatio, totals, type ActivityTotals, type CollectedActivity } from "./aggregate";
import { aggregateCommissionPerApp } from "./commission";
import { computeForecast, parseForecastAssumptions, type ScenarioForecast } from "./forecast";
import { computeFunnel, type FunnelRow } from "./funnel";
import { computePacing, type Pacing } from "./pacing";
import { ratio, type Ratio } from "./ratio";
import { buildRecommendations, type Recommendation } from "./recommendations";
import { reconcileApplications, type ProductAppCount } from "./reconcile";
import { computeRevenue, type RevenueSummary } from "./revenue";
import { isWorkingDay } from "./schedule";
import { buildTrajectory, type TrajectoryPoint } from "./trajectory";

export interface SnapshotOptions {
  asOf: ISODate;
  from?: ISODate | null;
  to?: ISODate | null;
  /** product filter; also selects the goal product (defaults to the campaign's primary product) */
  productId?: string | null;
}

export interface CampaignRates {
  contactRate: Ratio;
  conversationCloseRate: Ratio;
  dialsPerApplication: Ratio;
  qualifiedRate: Ratio;
  bookingRate: Ratio;
  showRate: Ratio;
  allProductCloseRate: Ratio;
}

export interface CampaignSnapshot {
  asOf: ISODate;
  planYear: number;
  goalProduct: Product | null;
  /** selected date range */
  range: { collected: CollectedActivity; totals: ActivityTotals; rates: CampaignRates; productCounts: ProductAppCount[]; totalApplications: number; goalProductApplications: number };
  /** campaign-to-date (ignores the date filter) */
  toDate: { collected: CollectedActivity; totals: ActivityTotals; rates: CampaignRates; productCounts: ProductAppCount[]; totalApplications: number; goalProductApplications: number };
  goal: number | null;
  pacing: Pacing;
  forecast: ScenarioForecast[];
  trajectory: TrajectoryPoint[];
  revenue: RevenueSummary;
  funnel: { rows: FunnelRow[]; total: FunnelRow };
  recommendations: Recommendation[];
  todayLogged: boolean;
  lastUpdatedAt: string | null;
  recentDaily: DailyActivity[];
}

function ratesFor(sources: CollectedActivity["sources"], goalColumn: Product["daily_column"]): CampaignRates {
  const col = goalColumn ?? "mapd_apps";
  return {
    contactRate: pairedRatio(sources, "voice_connections", "outbound_dials"),
    conversationCloseRate: pairedRatio(sources, col, "voice_connections"),
    dialsPerApplication: pairedRatio(sources, "outbound_dials", col),
    qualifiedRate: pairedRatio(sources, "qualified_conversations", "voice_connections"),
    bookingRate: pairedRatio(sources, "appointments_booked", "qualified_conversations"),
    showRate: pairedRatio(sources, "appointments_held", "appointments_booked"),
    allProductCloseRate: pairedRatio(sources, [...APP_COLUMNS], "voice_connections"),
  };
}

function inRange(date: ISODate, from?: ISODate | null, to?: ISODate | null) {
  return (!from || date >= from) && (!to || date <= to);
}

export function buildSnapshot(data: CampaignData, opts: SnapshotOptions): CampaignSnapshot {
  const { campaign, products, baselines, daily, schedule } = data;
  const planYear = campaign.plan_year ?? campaign.campaign_year;
  const goalProduct =
    products.find((p) => p.id === (opts.productId ?? campaign.primary_product_id)) ?? null;
  const scopedProducts = opts.productId ? products.filter((p) => p.id === opts.productId) : products;

  const section = (from: ISODate | null, to: ISODate | null) => {
    const collected = collectActivity(baselines, daily, { from, to });
    const apps = data.applications.filter((a) => inRange(a.application_date, from, to));
    const productCounts = reconcileApplications(scopedProducts, collected.sources, apps, baselines);
    const goalCount = goalProduct ? productCounts.find((c) => c.productId === goalProduct.id) : undefined;
    return {
      collected,
      totals: totals(collected.sources),
      rates: ratesFor(collected.sources, goalProduct?.daily_column ?? null),
      productCounts,
      totalApplications: productCounts.reduce((a, c) => a + c.counted, 0),
      goalProductApplications: goalCount?.counted ?? 0,
      apps,
    };
  };

  const range = section(opts.from ?? null, opts.to ?? null);
  const toDate = section(null, null);

  // goal for the goal product (or an all-products goal when none is set for it)
  const campaignGoals = data.goals.filter((g) => g.campaign_id === campaign.id && g.period_type === "campaign" && g.metric === "applications");
  const productGoal = goalProduct ? campaignGoals.find((g) => g.product_id === goalProduct.id) : undefined;
  const allGoal = campaignGoals.find((g) => g.product_id === null);
  const goalRow = productGoal ?? (opts.productId ? undefined : allGoal);
  const goal = goalRow?.target_count ?? null;
  const actualForGoal = productGoal ? toDate.goalProductApplications : toDate.totalApplications;

  const todayLogged = daily.some((d) => d.activity_date === opts.asOf);
  const dpa = toDate.rates.dialsPerApplication;
  const pacing = computePacing({
    start: campaign.start_date,
    end: campaign.end_date,
    asOf: opts.asOf,
    goal,
    actual: actualForGoal,
    dials: dpa.numerator,
    dialApplications: dpa.denominator,
    todayLogged,
    schedule,
  });

  const revenue = computeRevenue({
    productCounts: range.productCounts,
    applications: range.apps.filter((a) => scopedProducts.some((p) => p.id === a.product_id)),
    transactions: data.transactions.filter(
      (t) => inRange(t.transaction_date, opts.from, opts.to) && (!opts.productId || t.product_id === opts.productId || data.applications.some((a) => a.id === t.application_id && a.product_id === opts.productId)),
    ),
    expenses: opts.productId ? [] : data.expenses.filter((e) => inRange(e.expense_date, opts.from, opts.to)),
    activityLeadSpendCents: opts.productId ? 0 : range.totals.lead_spend_cents.value,
    assumptions: data.assumptions,
    planYear,
  });

  const commissionPerApp = goalProduct ? aggregateCommissionPerApp(data.assumptions, goalProduct.id, planYear) : null;
  const goalProductRevenueToDate = goalProduct
    ? computeRevenue({
        productCounts: toDate.productCounts.filter((c) => c.productId === goalProduct.id),
        applications: data.applications.filter((a) => a.product_id === goalProduct.id),
        transactions: [],
        expenses: [],
        activityLeadSpendCents: 0,
        assumptions: data.assumptions,
        planYear,
      }).expectedCents
    : 0;

  const forecast = computeForecast({
    currentApplications: actualForGoal,
    applicationsPerDial: ratio(dpa.denominator, dpa.numerator),
    plannedDialsPerDay: schedule?.planned_dials_per_day ?? null,
    historicalDialsPerDay: pacing.historicalDialsPerDay,
    remainingWorkingDays: pacing.remainingWorkingDays,
    goal,
    commissionPerApplicationCents: commissionPerApp,
    currentExpectedCents: goalProductRevenueToDate,
    assumptions: parseForecastAssumptions(campaign.forecast_assumptions),
  });
  const base = forecast.find((f) => f.key === "base");
  const forecastPerDay =
    base && base.dialsPerDay !== null && base.applicationsPerDial !== null ? base.dialsPerDay * base.applicationsPerDial : pacing.currentPacePerDay;

  const goalCounts = goalProduct ? toDate.productCounts.find((c) => c.productId === goalProduct.id)?.byDate ?? [] : [];
  const trajectory = buildTrajectory({
    start: campaign.start_date,
    end: campaign.end_date,
    asOf: opts.asOf,
    goal,
    schedule,
    baselines,
    countsByDate: goalCounts,
    forecastPerDay,
  });

  const funnel = computeFunnel({
    leadSources: data.leadSources,
    sources: range.collected.sources,
    leads: data.leads.filter((l) => inRange(l.acquired_date, opts.from, opts.to)),
    expenses: data.expenses.filter((e) => inRange(e.expense_date, opts.from, opts.to)),
    applications: range.apps,
    transactions: data.transactions,
  });

  const recentFrom = addDays(opts.asOf, -6);
  const recentSources = collectActivity(baselines, daily, { from: recentFrom, to: opts.asOf }).sources;
  const recentRates = ratesFor(recentSources, goalProduct?.daily_column ?? null);
  const productsWithApps = toDate.productCounts.filter((c) => c.counted > 0);
  const productsMissingAssumption = productsWithApps
    .filter((c) => revenue.byProduct.find((r) => r.productId === c.productId)?.unknownApps)
    .map((c) => c.productName);

  const recommendations = buildRecommendations({
    pacing,
    goalProductLabel: goalProduct?.code ?? "",
    todayIsWorkingDay: !todayLogged && isWorkingDay(opts.asOf, schedule),
    contactRate: toDate.rates.contactRate,
    recentContactRate: recentRates.contactRate,
    closeRate: toDate.rates.conversationCloseRate,
    recentCloseRate: recentRates.conversationCloseRate,
    showRate: toDate.rates.showRate,
    qualifiedCaptured: daily.some((d) => d.qualified_conversations > 0),
    appointmentsCaptured: daily.some((d) => d.appointments_booked > 0),
    productsMissingAssumption,
    hasDetailedApplications: data.applications.length > 0,
    applicationsWritten: toDate.totalApplications,
  });

  const stamps = [
    ...daily.map((d) => d.updated_at),
    ...baselines.map((b) => b.updated_at),
    ...data.applications.map((a) => a.updated_at ?? ""),
  ].filter(Boolean);
  const lastUpdatedAt = stamps.length ? stamps.reduce((a, b) => (a > b ? a : b)) : null;

  const strip = <T extends { apps: unknown }>(s: T) => {
    const { apps: _apps, ...rest } = s;
    void _apps;
    return rest;
  };

  return {
    asOf: opts.asOf,
    planYear,
    goalProduct,
    range: strip(range),
    toDate: strip(toDate),
    goal,
    pacing,
    forecast,
    trajectory,
    revenue,
    funnel,
    recommendations,
    todayLogged,
    lastUpdatedAt,
    recentDaily: [...daily].sort((a, b) => (a.activity_date < b.activity_date ? 1 : -1)),
  };
}
