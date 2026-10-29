import Link from "next/link";
import { Download, FileText, Pencil } from "lucide-react";
import { ConfirmDelete } from "@/components/app/form-kit";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar } from "@/components/app/filter-bar";
import { KpiCard } from "@/components/app/kpi-card";
import { PageHeader, SectionTitle } from "@/components/app/page-header";
import { ScopeNotes } from "@/components/app/scope-notes";
import { SimpleForm, type FieldConfig } from "@/components/app/simple-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { filterQuery, type SearchParams } from "@/lib/data/filters";
import { loadPage } from "@/lib/data/page-data";
import { formatDate } from "@/lib/dates";
import { APPLICATION_STATUSES, APPLICATION_STATUS_LABELS, type Application } from "@/lib/domain/types";
import { expectedCommissionForApplication } from "@/lib/kpi/commission";
import { centsToDecimalString, formatCents, sumCents } from "@/lib/money";
import { NoCampaign } from "../no-campaign";

export const metadata = { title: "Production" };

const STATUS_VARIANT: Record<Application["status"], "outline" | "gold" | "success" | "default" | "destructive" | "warning"> = {
  written: "outline",
  submitted: "gold",
  approved: "default",
  effectuated: "success",
  cancelled: "warning",
  charged_back: "destructive",
};

export default async function ProductionPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { ws, filters, campaign, data, snapshot: s } = await loadPage(Promise.resolve(sp));
  if (!campaign || !data || !s) return <NoCampaign />;

  const editId = typeof sp.edit === "string" ? sp.edit : null;
  const editing = editId ? data.applications.find((a) => a.id === editId) ?? null : null;
  const productName = new Map(ws.products.map((p) => [p.id, p.name]));
  const carrierName = new Map(ws.carriers.map((c) => [c.id, c.name]));
  const sourceName = new Map(ws.leadSources.map((l) => [l.id, l.name]));
  const apps = data.applications.filter(
    (a) =>
      (!filters.product || a.product_id === filters.product) &&
      (!filters.from || a.application_date >= filters.from) &&
      (!filters.to || a.application_date <= filters.to),
  );
  const paidByApp = new Map<string, number>();
  for (const t of data.transactions) {
    if (!t.application_id) continue;
    paidByApp.set(t.application_id, (paidByApp.get(t.application_id) ?? 0) + (t.kind === "chargeback" ? -t.amount_cents : t.amount_cents));
  }
  const statusCounts = APPLICATION_STATUSES.map((st) => ({ status: st, n: apps.filter((a) => a.status === st).length }));
  const keep = filterQuery({ campaign: filters.campaign, from: filters.from, to: filters.to, product: filters.product });

  const opt = (items: Array<{ id: string; name: string }>, blank: string) => [{ value: "", label: blank }, ...items.map((i) => ({ value: i.id, label: i.name }))];
  const e = editing;
  const fields: FieldConfig[] = [
    { name: "product_id", label: "Product", type: "select", required: true, defaultValue: e?.product_id ?? filters.product ?? campaign.primary_product_id, options: ws.products.filter((p) => p.is_active || p.id === e?.product_id).map((p) => ({ value: p.id, label: p.name })) },
    { name: "carrier_id", label: "Carrier", type: "select", defaultValue: e?.carrier_id, options: opt(ws.carriers.filter((c) => c.is_active || c.id === e?.carrier_id), ws.carriers.length ? "— Select carrier —" : "Add carriers in Settings") },
    { name: "application_date", label: "Application date", type: "date", required: true, defaultValue: e?.application_date ?? s.asOf, min: campaign.start_date, max: campaign.end_date },
    { name: "status", label: "Status", type: "select", defaultValue: e?.status ?? "written", options: APPLICATION_STATUSES.map((st) => ({ value: st, label: APPLICATION_STATUS_LABELS[st] })) },
    { name: "lead_source_id", label: "Lead source", type: "select", defaultValue: e?.lead_source_id, options: opt(ws.leadSources, "— Unattributed —") },
    { name: "application_ref", label: "Internal reference", type: "text", defaultValue: e?.application_ref, placeholder: "e.g. GG-2026-0042", hint: "Non-sensitive ID only — never an MBI or SSN." },
    { name: "submitted_date", label: "Submitted date", type: "date", defaultValue: e?.submitted_date },
    { name: "approved_date", label: "Approved date", type: "date", defaultValue: e?.approved_date },
    { name: "effective_date", label: "Effective date", type: "date", defaultValue: e?.effective_date },
    { name: "enrollment_type", label: "Enrollment type", type: "select", defaultValue: e?.enrollment_type, options: [
      { value: "", label: "— Not specified —" },
      { value: "new_to_medicare", label: "New to Medicare" },
      { value: "like_plan_change", label: "Like-plan change" },
      { value: "unlike_plan_change", label: "Unlike-plan change" },
      { value: "renewal", label: "Renewal" },
    ] },
    { name: "annual_premium_cents", label: "Annual premium ($)", type: "money", defaultValue: centsToDecimalString(e?.annual_premium_cents) || undefined, hint: "Premium is tracked separately from commission." },
    { name: "expected_commission_cents", label: "Expected commission ($)", type: "money", defaultValue: centsToDecimalString(e?.expected_commission_cents) || undefined, hint: "Leave blank to use your commission assumption." },
    { name: "cancelled_date", label: "Cancelled date", type: "date", defaultValue: e?.cancelled_date },
    { name: "charged_back_date", label: "Charged-back date", type: "date", defaultValue: e?.charged_back_date },
    { name: "notes", label: "Notes", type: "textarea", defaultValue: e?.notes, wide: true, hint: "No client names or health information." },
  ];

  return (
    <>
      <PageHeader title="Production" description={`${campaign.name} · applications by product, carrier and status`}>
        <Button asChild variant="outline" size="sm">
          <a href={`/api/export/applications${filterQuery(filters)}`}>
            <Download /> Export CSV
          </a>
        </Button>
      </PageHeader>
      <FilterBar campaigns={ws.campaigns} current={campaign.slug} products={ws.products} campaignRange={{ start: campaign.start_date, end: campaign.end_date }} />
      <ScopeNotes collected={s.range.collected} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Applications written" value={s.range.totalApplications} sub="Aggregate + itemized, reconciled" />
        <KpiCard label="Itemized records" value={apps.length} sub={`${s.range.productCounts.reduce((a, c) => a + c.undetailed, 0)} counted only in aggregate`} />
        <KpiCard label="Expected commission" value={formatCents(s.revenue.expectedCents, { whole: true })} estimate sub={s.revenue.unknownCommissionApps ? `${s.revenue.unknownCommissionApps} apps unpriced` : "All apps priced"} />
        <KpiCard label="Annualized premium" value={formatCents(s.revenue.annualizedPremiumCents, { whole: true })} sub="Itemized active apps · not revenue" />
      </div>

      <SectionTitle>By product</SectionTitle>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Aggregate count</TableHead>
              <TableHead className="text-right">Itemized</TableHead>
              <TableHead className="text-right">Counted</TableHead>
              <TableHead className="text-right">Cancelled / CB</TableHead>
              <TableHead className="text-right">Assumption / app</TableHead>
              <TableHead className="text-right">Expected commission</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {s.range.productCounts.map((c) => {
              const rev = s.revenue.byProduct.find((r) => r.productId === c.productId);
              return (
                <TableRow key={c.productId}>
                  <TableCell className="font-medium text-navy">{c.productName}</TableCell>
                  <TableCell className="text-right">{c.aggregate}</TableCell>
                  <TableCell className="text-right">{c.detailed}</TableCell>
                  <TableCell className="text-right font-semibold text-navy">{c.counted}</TableCell>
                  <TableCell className="text-right">{c.cancelledOrChargedBack}</TableCell>
                  <TableCell className="text-right">{rev?.assumptionCents !== null && rev?.assumptionCents !== undefined ? formatCents(rev.assumptionCents) : <span className="text-muted-foreground">Not set</span>}</TableCell>
                  <TableCell className="text-right">
                    {formatCents(rev?.expectedCents ?? 0)}
                    {rev?.unknownApps ? <Badge variant="warning" className="ml-2">{rev.unknownApps} unpriced</Badge> : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>Total</TableCell>
              <TableCell className="text-right">{s.range.productCounts.reduce((a, c) => a + c.aggregate, 0)}</TableCell>
              <TableCell className="text-right">{s.range.productCounts.reduce((a, c) => a + c.detailed, 0)}</TableCell>
              <TableCell className="text-right">{s.range.totalApplications}</TableCell>
              <TableCell className="text-right">{s.range.productCounts.reduce((a, c) => a + c.cancelledOrChargedBack, 0)}</TableCell>
              <TableCell />
              <TableCell className="text-right">{formatCents(s.revenue.expectedCents)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </Card>
      <p className="mt-2 text-xs text-muted-foreground">
        Counted = max(aggregate, itemized) for each day (or baseline window) and product. An itemized application describes one of the applications already in your daily count, so it is never added twice.
      </p>

      <SectionTitle>{editing ? "Edit application" : "Add an itemized application"}</SectionTitle>
      <Card id="form">
        <CardContent className="pt-5">
          <Alert variant="info" className="mb-4">
            <AlertDescription>Optional. Itemize applications to track carrier, status, premium and actual commission. Your daily totals remain the source of truth for counts.</AlertDescription>
          </Alert>
          <SimpleForm
            key={editing?.id ?? "new"}
            action="saveApplication"
            fields={fields}
            hidden={{ campaign_id: campaign.id, id: editing?.id }}
            submitLabel={editing ? "Save changes" : "Add application"}
            cancelHref={editing ? `/production${keep}` : undefined}
            columns={3}
          />
        </CardContent>
      </Card>

      <SectionTitle>Itemized applications</SectionTitle>
      <div className="mb-3 flex flex-wrap gap-2">
        {statusCounts.map((c) => (
          <Badge key={c.status} variant={STATUS_VARIANT[c.status]}>
            {APPLICATION_STATUS_LABELS[c.status]}: {c.n}
          </Badge>
        ))}
      </div>
      {apps.length === 0 ? (
        <EmptyState icon={FileText} title="No itemized applications yet">
          Your aggregate counts already drive the dashboard. Add records above when you want status and commission tracking per application.
        </EmptyState>
      ) : (
        <Card>
          <CardHeader className="sr-only">
            <CardTitle>Applications</CardTitle>
            <CardDescription>Itemized applications</CardDescription>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Ref</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Carrier</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Effective</TableHead>
                <TableHead className="text-right">Premium</TableHead>
                <TableHead className="text-right">Expected</TableHead>
                <TableHead className="text-right">Actual</TableHead>
                <TableHead className="sr-only">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {apps.map((a) => {
                const exp = expectedCommissionForApplication(a, data.assumptions, s.planYear);
                return (
                  <TableRow key={a.id} className={a.id === editId ? "bg-gold/10" : undefined}>
                    <TableCell className="whitespace-nowrap">{formatDate(a.application_date)}</TableCell>
                    <TableCell>{a.application_ref ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{productName.get(a.product_id)}</TableCell>
                    <TableCell>{a.carrier_id ? carrierName.get(a.carrier_id) : "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{a.lead_source_id ? sourceName.get(a.lead_source_id) : "—"}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[a.status]}>{APPLICATION_STATUS_LABELS[a.status]}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(a.effective_date)}</TableCell>
                    <TableCell className="text-right">{formatCents(a.annual_premium_cents)}</TableCell>
                    <TableCell className="text-right">
                      {formatCents(exp.cents)}
                      {exp.source === "assumption" && <span className="ml-1 text-[0.65rem] text-muted-foreground">(assumed)</span>}
                    </TableCell>
                    <TableCell className="text-right font-medium">{paidByApp.has(a.id) ? formatCents(paidByApp.get(a.id)!) : "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <Button asChild variant="ghost" size="icon" aria-label="Edit application">
                        <Link href={`/production${filterQuery({ campaign: filters.campaign, from: filters.from, to: filters.to, product: filters.product }, { edit: a.id })}`}>
                          <Pencil />
                        </Link>
                      </Button>
                      <ConfirmDelete action="deleteApplication" id={a.id} what="this application" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={7}>Total</TableCell>
                <TableCell className="text-right">{formatCents(sumCents(apps.map((a) => a.annual_premium_cents)))}</TableCell>
                <TableCell className="text-right">{formatCents(sumCents(apps.map((a) => expectedCommissionForApplication(a, data.assumptions, s.planYear).cents)))}</TableCell>
                <TableCell className="text-right">{formatCents(sumCents(apps.map((a) => paidByApp.get(a.id))))}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </Card>
      )}
    </>
  );
}
