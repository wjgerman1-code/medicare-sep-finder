import { Download } from "lucide-react";
import { RevenueStagesChart } from "@/components/app/charts";
import { ConfirmDelete } from "@/components/app/form-kit";
import { FilterBar } from "@/components/app/filter-bar";
import { KpiCard } from "@/components/app/kpi-card";
import { PageHeader, SectionTitle } from "@/components/app/page-header";
import { SimpleForm } from "@/components/app/simple-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { filterQuery, type SearchParams } from "@/lib/data/filters";
import { loadPage } from "@/lib/data/page-data";
import { formatDate } from "@/lib/dates";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, TRANSACTION_KINDS } from "@/lib/domain/types";
import { formatCents } from "@/lib/money";
import { NoCampaign } from "../no-campaign";

export const metadata = { title: "Revenue & Profitability" };

const KIND_LABEL: Record<(typeof TRANSACTION_KINDS)[number], string> = {
  advance: "Advance",
  paid: "Commission paid",
  renewal: "Renewal",
  chargeback: "Chargeback",
  adjustment: "Adjustment (±)",
};

export default async function RevenuePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { ws, filters, campaign, data, snapshot: s } = await loadPage(searchParams);
  if (!campaign || !data || !s) return <NoCampaign />;
  const rv = s.revenue;
  const inRange = (d: string) => (!filters.from || d >= filters.from) && (!filters.to || d <= filters.to);
  const txns = data.transactions.filter((t) => inRange(t.transaction_date));
  const expenses = data.expenses.filter((e) => inRange(e.expense_date));
  const productName = new Map(ws.products.map((p) => [p.id, p.name]));
  const appRef = new Map(data.applications.map((a) => [a.id, a.application_ref ?? formatDate(a.application_date)]));
  const sourceName = new Map(ws.leadSources.map((l) => [l.id, l.name]));
  const base = s.forecast.find((f) => f.key === "base");

  return (
    <>
      <PageHeader title="Revenue & Profitability" description="Expected revenue is an estimate until it is paid. Premium is shown separately from commission.">
        <Button asChild variant="outline" size="sm">
          <a href={`/api/export/commission_transactions${filterQuery(filters)}`}>
            <Download /> Transactions CSV
          </a>
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href={`/api/export/expenses${filterQuery(filters)}`}>
            <Download /> Expenses CSV
          </a>
        </Button>
      </PageHeader>
      <FilterBar campaigns={ws.campaigns} current={campaign.slug} products={ws.products} campaignRange={{ start: campaign.start_date, end: campaign.end_date }} />

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gold-deep">Expected (estimates)</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard label="Projected (base case)" value={formatCents(base?.projectedRevenueCents ?? null, { whole: true })} estimate sub="Goal product, end of campaign" />
        <KpiCard label="Expected commission" value={formatCents(rv.expectedCents, { whole: true })} estimate sub={rv.unknownCommissionApps ? `${rv.unknownCommissionApps} apps unpriced` : "Written, not cancelled"} />
        <KpiCard label="Submitted" value={formatCents(rv.submittedCents, { whole: true })} estimate sub="Itemized apps only" />
        <KpiCard label="Approved" value={formatCents(rv.approvedCents, { whole: true })} estimate sub="Approved + effectuated" />
        <KpiCard label="Earned" value={formatCents(rv.earnedCents, { whole: true })} estimate sub="Effectuated" />
      </div>
      <h2 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wider text-gold-deep">Actual cash</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard label="Commission paid" value={formatCents(rv.paidCents, { whole: true })} sub="Advances, payments, renewals, adj." />
        <KpiCard label="Chargebacks" value={formatCents(rv.chargebackCents, { whole: true })} tone={rv.chargebackCents > 0 ? "bad" : "default"} />
        <KpiCard label="Net received" value={formatCents(rv.netReceivedCents, { whole: true })} tone="gold" />
        <KpiCard label="Total expenses" value={formatCents(rv.expenses.total, { whole: true })} sub="Incl. daily lead spend" />
        <KpiCard
          label="Net cash contribution"
          value={formatCents(rv.netCashContributionCents, { whole: true })}
          tone={rv.netCashContributionCents < 0 ? "bad" : "good"}
          definition="(paid − chargebacks) − all expenses"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Revenue pipeline</CardTitle>
            <CardDescription>Gold = expected (estimate) · navy = cash actually received</CardDescription>
          </CardHeader>
          <CardContent>
            <RevenueStagesChart
              data={[
                { stage: "Expected", cents: rv.expectedCents, kind: "estimate" },
                { stage: "Submitted", cents: rv.submittedCents, kind: "estimate" },
                { stage: "Approved", cents: rv.approvedCents, kind: "estimate" },
                { stage: "Earned", cents: rv.earnedCents, kind: "estimate" },
                { stage: "Received", cents: rv.netReceivedCents, kind: "actual" },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Expenses</CardTitle>
            <CardDescription>Annualized premium on itemized apps: {formatCents(rv.annualizedPremiumCents)} (not revenue)</CardDescription>
          </CardHeader>
          <Table>
            <TableBody>
              {EXPENSE_CATEGORIES.map((c) => (
                <TableRow key={c}>
                  <TableCell>{EXPENSE_CATEGORY_LABELS[c]}</TableCell>
                  <TableCell className="text-right">{formatCents(rv.expenses[c])}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>Total</TableCell>
                <TableCell className="text-right">{formatCents(rv.expenses.total)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </Card>
      </div>

      <SectionTitle>By product</SectionTitle>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Applications</TableHead>
              <TableHead className="text-right">Assumption / app</TableHead>
              <TableHead className="text-right">Expected</TableHead>
              <TableHead className="text-right">Received (net)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rv.byProduct.map((p) => (
              <TableRow key={p.productId}>
                <TableCell className="font-medium text-navy">{p.productName}</TableCell>
                <TableCell className="text-right">{p.counted}</TableCell>
                <TableCell className="text-right">{p.assumptionCents === null ? <span className="text-muted-foreground">Not set</span> : formatCents(p.assumptionCents)}</TableCell>
                <TableCell className="text-right">
                  {formatCents(p.expectedCents)} {p.unknownApps > 0 && <Badge variant="warning">{p.unknownApps} unpriced</Badge>}
                </TableCell>
                <TableCell className="text-right">{formatCents(p.paidCents)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <SectionTitle>Commission transactions</SectionTitle>
      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Record a payment or chargeback</CardTitle>
            <CardDescription>Enter chargebacks as positive amounts; they are subtracted.</CardDescription>
          </CardHeader>
          <CardContent>
            <SimpleForm
              action="saveTransaction"
              hidden={{ campaign_id: campaign.id }}
              columns={1}
              submitLabel="Save transaction"
              fields={[
                { name: "transaction_date", label: "Date", type: "date", required: true, defaultValue: s.asOf },
                { name: "kind", label: "Type", type: "select", defaultValue: "paid", options: TRANSACTION_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] })) },
                { name: "amount_cents", label: "Amount ($)", type: "money", required: true },
                { name: "application_id", label: "Application (optional)", type: "select", options: [{ value: "", label: "— Not linked —" }, ...data.applications.map((a) => ({ value: a.id, label: `${a.application_ref ?? formatDate(a.application_date)} · ${productName.get(a.product_id)}` }))] },
                { name: "product_id", label: "Product (if not linked)", type: "select", options: [{ value: "", label: "—" }, ...ws.products.map((p) => ({ value: p.id, label: p.name }))] },
                { name: "carrier_id", label: "Carrier", type: "select", options: [{ value: "", label: "—" }, ...ws.carriers.map((c) => ({ value: c.id, label: c.name }))] },
                { name: "statement_ref", label: "Statement reference", type: "text" },
                { name: "external_id", label: "Statement line ID", type: "text", hint: "Optional; prevents duplicate imports." },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          {txns.length === 0 ? (
            <CardContent className="pt-5 text-sm text-muted-foreground">No commission transactions recorded. Revenue received stays at $0 until carrier payments are entered or imported.</CardContent>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Application / product</TableHead>
                  <TableHead>Statement</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="sr-only">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {txns.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="whitespace-nowrap">{formatDate(t.transaction_date)}</TableCell>
                    <TableCell>
                      <Badge variant={t.kind === "chargeback" ? "destructive" : "outline"}>{KIND_LABEL[t.kind]}</Badge>
                    </TableCell>
                    <TableCell>{t.application_id ? appRef.get(t.application_id) : t.product_id ? productName.get(t.product_id) : "—"}</TableCell>
                    <TableCell>{t.statement_ref ?? "—"}</TableCell>
                    <TableCell className={`text-right font-medium ${t.kind === "chargeback" ? "text-destructive" : ""}`}>
                      {t.kind === "chargeback" ? "−" : ""}
                      {formatCents(t.amount_cents)}
                    </TableCell>
                    <TableCell className="text-right">
                      <ConfirmDelete action="deleteTransaction" id={t.id} what="this transaction" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      <SectionTitle>Business expenses</SectionTitle>
      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Add an expense</CardTitle>
            <CardDescription>Lead purchases logged as daily “lead spending” are already counted — don’t enter them twice.</CardDescription>
          </CardHeader>
          <CardContent>
            <SimpleForm
              action="saveExpense"
              hidden={{ campaign_id: campaign.id }}
              columns={1}
              submitLabel="Save expense"
              fields={[
                { name: "expense_date", label: "Date", type: "date", required: true, defaultValue: s.asOf },
                { name: "category", label: "Category", type: "select", options: EXPENSE_CATEGORIES.map((c) => ({ value: c, label: EXPENSE_CATEGORY_LABELS[c] })) },
                { name: "amount_cents", label: "Amount ($)", type: "money", required: true },
                { name: "vendor", label: "Vendor", type: "text", placeholder: "e.g. WAVV, GoHighLevel" },
                { name: "lead_source_id", label: "Lead source (for lead costs)", type: "select", options: [{ value: "", label: "—" }, ...ws.leadSources.map((l) => ({ value: l.id, label: l.name }))] },
                { name: "description", label: "Description", type: "text" },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          {expenses.length === 0 ? (
            <CardContent className="pt-5 text-sm text-muted-foreground">No expenses recorded yet.</CardContent>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="sr-only">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap">{formatDate(e.expense_date)}</TableCell>
                    <TableCell>{EXPENSE_CATEGORY_LABELS[e.category]}</TableCell>
                    <TableCell>{e.vendor ?? "—"}</TableCell>
                    <TableCell>{e.lead_source_id ? sourceName.get(e.lead_source_id) : "—"}</TableCell>
                    <TableCell className="text-right">{formatCents(e.amount_cents)}</TableCell>
                    <TableCell className="text-right">
                      <ConfirmDelete action="deleteExpense" id={e.id} what="this expense" />
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
