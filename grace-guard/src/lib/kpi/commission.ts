import type { Application, CommissionAssumption } from "@/lib/domain/types";
import { applyRateBps, type Cents } from "@/lib/money";

export interface AssumptionQuery {
  productId: string;
  planYear: number;
  carrierId?: string | null;
  enrollmentType?: string | null;
}

/**
 * Most specific matching assumption wins: carrier match outranks enrollment
 * type match, which outranks a product-wide default. If nothing exists for
 * the plan year, the most recent earlier plan year is used.
 */
export function resolveAssumption(assumptions: CommissionAssumption[], q: AssumptionQuery): CommissionAssumption | null {
  const eligible = assumptions.filter(
    (a) =>
      a.product_id === q.productId &&
      a.plan_year <= q.planYear &&
      (a.carrier_id === null || a.carrier_id === (q.carrierId ?? null)) &&
      (a.enrollment_type === null || a.enrollment_type === (q.enrollmentType ?? null)),
  );
  if (eligible.length === 0) return null;
  const score = (a: CommissionAssumption) =>
    a.plan_year * 10 + (a.carrier_id !== null ? 2 : 0) + (a.enrollment_type !== null ? 1 : 0);
  return eligible.reduce((best, a) => (score(a) > score(best) ? a : best));
}

/** Expected commission for a single assumption, given an optional annual premium. */
export function commissionFromAssumption(a: CommissionAssumption | null, annualPremiumCents: Cents | null): Cents | null {
  if (!a) return null;
  if (a.basis === "flat_per_application") return a.amount_cents;
  if (a.rate_bps === null || annualPremiumCents === null) return null;
  return applyRateBps(annualPremiumCents, a.rate_bps);
}

export type CommissionSource = "explicit" | "assumption" | "unknown";

/** Expected commission for a detailed application: explicit amount first, else the assumption. */
export function expectedCommissionForApplication(
  app: Application,
  assumptions: CommissionAssumption[],
  planYear: number,
): { cents: Cents | null; source: CommissionSource } {
  if (app.expected_commission_cents !== null) return { cents: app.expected_commission_cents, source: "explicit" };
  const a = resolveAssumption(assumptions, {
    productId: app.product_id,
    planYear,
    carrierId: app.carrier_id,
    enrollmentType: app.enrollment_type,
  });
  const cents = commissionFromAssumption(a, app.annual_premium_cents);
  return cents === null ? { cents: null, source: "unknown" } : { cents, source: "assumption" };
}

/** Flat per-application assumption for aggregate (non-itemized) applications of a product. */
export function aggregateCommissionPerApp(assumptions: CommissionAssumption[], productId: string, planYear: number): Cents | null {
  const a = resolveAssumption(assumptions, { productId, planYear });
  return a && a.basis === "flat_per_application" ? a.amount_cents : null;
}
