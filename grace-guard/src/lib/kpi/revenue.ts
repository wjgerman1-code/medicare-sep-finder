import {
  EXPENSE_CATEGORIES,
  type Application,
  type CommissionAssumption,
  type CommissionTransaction,
  type Expense,
  type ExpenseCategory,
} from "@/lib/domain/types";
import { multiplyCents, sumCents, type Cents } from "@/lib/money";
import { aggregateCommissionPerApp, expectedCommissionForApplication } from "./commission";
import type { ProductAppCount } from "./reconcile";

const SUBMITTED_OR_LATER = new Set(["submitted", "approved", "effectuated"]);
const APPROVED_OR_LATER = new Set(["approved", "effectuated"]);
const INACTIVE = new Set(["cancelled", "charged_back"]);

export interface ProductRevenue {
  productId: string;
  productName: string;
  counted: number;
  /** flat per-application assumption used for non-itemized applications */
  assumptionCents: Cents | null;
  expectedCents: Cents;
  /** applications whose expected commission could not be estimated */
  unknownApps: number;
  paidCents: Cents;
}

export interface RevenueSummary {
  /** Expected commission on all written, non-cancelled applications (estimate). */
  expectedCents: Cents;
  /** Applications whose commission is unknown (no assumption / no premium). */
  unknownCommissionApps: number;
  /** Detailed applications only — aggregate counts carry no status. */
  submittedCents: Cents;
  approvedCents: Cents;
  earnedCents: Cents;
  /** Annualized premium on active detailed applications (not revenue). */
  annualizedPremiumCents: Cents;
  /** Cash in: advances + paid + renewals + signed adjustments. */
  paidCents: Cents;
  chargebackCents: Cents;
  netReceivedCents: Cents;
  expenses: Record<ExpenseCategory, Cents> & { total: Cents };
  /** net received − all expenses (cash basis; excludes expected revenue) */
  netCashContributionCents: Cents;
  byProduct: ProductRevenue[];
}

export interface RevenueInput {
  productCounts: ProductAppCount[];
  applications: Application[];
  transactions: CommissionTransaction[];
  expenses: Expense[];
  /** lead spend logged on daily activity / baselines (counts as lead cost) */
  activityLeadSpendCents: Cents;
  assumptions: CommissionAssumption[];
  planYear: number;
}

export function isCashIn(t: CommissionTransaction): boolean {
  return t.kind === "advance" || t.kind === "paid" || t.kind === "renewal" || t.kind === "adjustment";
}

export function computeRevenue(input: RevenueInput): RevenueSummary {
  const { productCounts, applications, transactions, expenses, assumptions, planYear } = input;
  const appProduct = new Map(applications.map((a) => [a.id, a.product_id]));

  let unknownCommissionApps = 0;
  const byProduct: ProductRevenue[] = productCounts.map((pc) => {
    const assumptionCents = aggregateCommissionPerApp(assumptions, pc.productId, planYear);
    let expected = 0;
    let unknown = 0;

    if (pc.undetailed > 0) {
      if (assumptionCents === null) unknown += pc.undetailed;
      else expected += multiplyCents(assumptionCents, pc.undetailed);
    }
    for (const app of applications) {
      if (app.product_id !== pc.productId || INACTIVE.has(app.status)) continue;
      const { cents } = expectedCommissionForApplication(app, assumptions, planYear);
      if (cents === null) unknown++;
      else expected += cents;
    }
    unknownCommissionApps += unknown;

    const paid = sumCents(
      transactions
        .filter((t) => (t.product_id ?? (t.application_id ? appProduct.get(t.application_id) : null)) === pc.productId)
        .map((t) => (t.kind === "chargeback" ? -t.amount_cents : t.amount_cents)),
    );

    return {
      productId: pc.productId,
      productName: pc.productName,
      counted: pc.counted,
      assumptionCents,
      expectedCents: expected,
      unknownApps: unknown,
      paidCents: paid,
    };
  });

  const stageTotal = (statuses: Set<string>) =>
    sumCents(
      applications
        .filter((a) => statuses.has(a.status))
        .map((a) => expectedCommissionForApplication(a, assumptions, planYear).cents),
    );

  const paidCents = sumCents(transactions.filter(isCashIn).map((t) => t.amount_cents));
  const chargebackCents = sumCents(transactions.filter((t) => t.kind === "chargeback").map((t) => t.amount_cents));
  const netReceivedCents = paidCents - chargebackCents;

  const exp = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c, 0])) as Record<ExpenseCategory, Cents>;
  for (const e of expenses) exp[e.category] += e.amount_cents;
  exp.lead_cost += input.activityLeadSpendCents;
  const total = sumCents(Object.values(exp));

  return {
    expectedCents: sumCents(byProduct.map((p) => p.expectedCents)),
    unknownCommissionApps,
    submittedCents: stageTotal(SUBMITTED_OR_LATER),
    approvedCents: stageTotal(APPROVED_OR_LATER),
    earnedCents: stageTotal(new Set(["effectuated"])),
    annualizedPremiumCents: sumCents(
      applications.filter((a) => !INACTIVE.has(a.status)).map((a) => a.annual_premium_cents),
    ),
    paidCents,
    chargebackCents,
    netReceivedCents,
    expenses: { ...exp, total },
    netCashContributionCents: netReceivedCents - total,
    byProduct,
  };
}
