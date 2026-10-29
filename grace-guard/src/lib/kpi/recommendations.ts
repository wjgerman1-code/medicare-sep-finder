import type { Pacing } from "./pacing";
import type { Ratio } from "./ratio";
import { formatNumber, formatPercent } from "./ratio";

export type RecommendationSeverity = "critical" | "warning" | "info" | "success";

export interface Recommendation {
  id: string;
  severity: RecommendationSeverity;
  title: string;
  detail: string;
}

export interface RecommendationInput {
  pacing: Pacing;
  goalProductLabel: string;
  todayIsWorkingDay: boolean;
  contactRate: Ratio;
  recentContactRate: Ratio;
  closeRate: Ratio;
  recentCloseRate: Ratio;
  showRate: Ratio;
  qualifiedCaptured: boolean;
  appointmentsCaptured: boolean;
  productsMissingAssumption: string[];
  hasDetailedApplications: boolean;
  applicationsWritten: number;
}

/** A ±20% move in the last 7 days versus campaign-to-date is flagged. */
export const TREND_SENSITIVITY = 0.2;
/** Show-rate rule of thumb below which reminders are suggested (configurable here). */
export const SHOW_RATE_ALERT = 0.7;

/**
 * Deterministic, rule-based next actions. Every rule cites the numbers that
 * triggered it so the advice can be checked against the dashboard.
 */
export function buildRecommendations(i: RecommendationInput): Recommendation[] {
  const out: Recommendation[] = [];
  const p = i.pacing;

  if (p.phase === "during" && i.todayIsWorkingDay && p.status !== "complete") {
    out.push({
      id: "log-today",
      severity: "info",
      title: "Log today's activity",
      detail: "Today has no saved entry yet. Pace and required-per-day figures treat today as still available.",
    });
  }

  if (p.status === "behind" && p.requiredPerDay !== null) {
    const pace = p.currentPacePerDay;
    out.push({
      id: "behind-pace",
      severity: "critical",
      title: `Behind pace by ${formatNumber(Math.abs(p.paceDelta ?? 0), 1)} ${i.goalProductLabel} applications`,
      detail: `You need ${formatNumber(p.requiredPerDay, 1)} applications per working day for the remaining ${p.remainingWorkingDays} days${
        pace !== null ? `, versus ${formatNumber(pace, 1)} per day so far` : ""
      }.`,
    });
  } else if (p.status === "ahead") {
    out.push({
      id: "ahead-pace",
      severity: "success",
      title: `Ahead of pace by ${formatNumber(p.paceDelta ?? 0, 1)} applications`,
      detail: "Protect the lead: keep daily dial volume steady and use the cushion for follow-ups and referrals.",
    });
  } else if (p.status === "complete") {
    out.push({ id: "goal-complete", severity: "success", title: "Goal reached", detail: "Consider raising the goal or shifting effort to ancillary products and referrals." });
  }

  if (p.requiredDialsPerDay !== null && p.historicalDialsPerDay !== null && p.requiredDialsPerDay > p.historicalDialsPerDay * 1.25) {
    out.push({
      id: "dial-volume",
      severity: "warning",
      title: `Raise dial volume to ~${formatNumber(Math.ceil(p.requiredDialsPerDay))} per day`,
      detail: `At your historical ${formatNumber(p.dialsPerApplication.value, 1)} dials per application, the goal needs ${formatNumber(
        Math.ceil(p.requiredDialsPerDay),
      )} dials per working day; you have averaged ${formatNumber(p.historicalDialsPerDay, 0)}. Add dialing blocks or improve conversion.`,
    });
  }

  const trend = (recent: Ratio, overall: Ratio) =>
    recent.value !== null && overall.value !== null && overall.value > 0 && (recent.denominator ?? 0) >= 20
      ? (recent.value - overall.value) / overall.value
      : null;

  const contactTrend = trend(i.recentContactRate, i.contactRate);
  if (contactTrend !== null && contactTrend <= -TREND_SENSITIVITY) {
    out.push({
      id: "contact-dropping",
      severity: "warning",
      title: "Contact rate is slipping",
      detail: `Last 7 days: ${formatPercent(i.recentContactRate.value)} vs ${formatPercent(i.contactRate.value)} campaign-to-date. Test different call windows or refresh the lead list.`,
    });
  }
  const closeTrend = trend(i.recentCloseRate, i.closeRate);
  if (closeTrend !== null && closeTrend <= -TREND_SENSITIVITY) {
    out.push({
      id: "close-dropping",
      severity: "warning",
      title: "Conversation close rate is slipping",
      detail: `Last 7 days: ${formatPercent(i.recentCloseRate.value)} vs ${formatPercent(i.closeRate.value)} campaign-to-date. Review call recordings and needs-analysis flow.`,
    });
  }

  if (i.showRate.value !== null && (i.showRate.denominator ?? 0) >= 5 && i.showRate.value < SHOW_RATE_ALERT) {
    out.push({
      id: "show-rate",
      severity: "warning",
      title: "Appointment show rate is low",
      detail: `${formatPercent(i.showRate.value)} of booked appointments were held. Add same-day reminder calls/texts.`,
    });
  }

  if (!i.qualifiedCaptured || !i.appointmentsCaptured) {
    out.push({
      id: "capture-funnel",
      severity: "info",
      title: "Capture qualified conversations and appointments",
      detail: "Logging them daily unlocks booking rate, show rate and cost per appointment.",
    });
  }

  if (i.productsMissingAssumption.length > 0) {
    out.push({
      id: "assumptions",
      severity: "info",
      title: "Add commission assumptions",
      detail: `No commission assumption for: ${i.productsMissingAssumption.join(", ")}. Their revenue is shown as unknown rather than $0.`,
    });
  }

  if (!i.hasDetailedApplications && i.applicationsWritten > 0) {
    out.push({
      id: "itemize",
      severity: "info",
      title: "Itemize applications to track approvals",
      detail: "Aggregate counts have no submission/approval status. Add detailed records on the Production page to see submitted, approved and earned revenue.",
    });
  }

  return out;
}
