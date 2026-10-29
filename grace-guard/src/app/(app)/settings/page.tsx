import Link from "next/link";
import { Download, Pencil, Plug } from "lucide-react";
import { ConfirmDelete } from "@/components/app/form-kit";
import { PageHeader } from "@/components/app/page-header";
import { SimpleForm, type FieldConfig } from "@/components/app/simple-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IMPORT_TEMPLATES } from "@/lib/csv/importers";
import { filterQuery, type SearchParams } from "@/lib/data/filters";
import { loadPage } from "@/lib/data/page-data";
import { formatDate } from "@/lib/dates";
import { ACTIVITY_FIELDS, APP_COLUMNS, APP_COLUMN_LABELS, type AggregateBaseline, type Campaign } from "@/lib/domain/types";
import { pairedRatio } from "@/lib/kpi/aggregate";
import { INTEGRATIONS } from "@/lib/integrations";
import { centsToDecimalString, formatCents } from "@/lib/money";
import { NoCampaign } from "../no-campaign";

export const metadata = { title: "Settings" };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CATEGORY_OPTIONS = [
  ["medicare_advantage", "Medicare Advantage"],
  ["prescription_drug", "Prescription Drug"],
  ["medicare_supplement", "Medicare Supplement"],
  ["hospital_indemnity", "Hospital Indemnity"],
  ["life", "Life"],
  ["ancillary", "Ancillary"],
  ["other", "Other"],
].map(([value, label]) => ({ value, label }));
const FIELD_LABEL: Record<string, string> = {
  outbound_dials: "Outbound dials",
  voice_connections: "Voice connections",
  qualified_conversations: "Qualified conversations",
  appointments_booked: "Appointments booked",
  appointments_held: "Appointments held",
  follow_up_calls: "Follow-up calls",
  referrals_generated: "Referrals",
  dialing_minutes: "Dialing minutes",
  lead_spend_cents: "Lead spend ($)",
  ...Object.fromEntries(APP_COLUMNS.map((c) => [c, `${APP_COLUMN_LABELS[c]} apps`])),
};

function campaignFields(c: Campaign | null, products: Array<{ id: string; name: string }>): FieldConfig[] {
  return [
    { name: "name", label: "Name", type: "text", required: true, defaultValue: c?.name, placeholder: "2027 Medicare AEP" },
    { name: "slug", label: "Short name (URL)", type: "text", required: true, defaultValue: c?.slug, placeholder: "aep-2027" },
    { name: "campaign_type", label: "Type", type: "select", defaultValue: c?.campaign_type ?? "aep", options: ["aep", "oep", "sep", "annual", "growth", "other"].map((v) => ({ value: v, label: v.toUpperCase() })) },
    { name: "status", label: "Status", type: "select", defaultValue: c?.status ?? "planning", options: ["planning", "active", "closed"].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })) },
    { name: "campaign_year", label: "Campaign year", type: "number", required: true, defaultValue: c?.campaign_year ?? new Date().getFullYear(), min: 2000, max: 2100 },
    { name: "plan_year", label: "Plan / coverage year", type: "number", defaultValue: c?.plan_year, min: 2000, max: 2100, hint: "AEP 2026 sells 2027 plans" },
    { name: "start_date", label: "Start date", type: "date", required: true, defaultValue: c?.start_date },
    { name: "end_date", label: "End date", type: "date", required: true, defaultValue: c?.end_date },
    { name: "primary_product_id", label: "Goal product", type: "select", defaultValue: c?.primary_product_id, options: [{ value: "", label: "All products" }, ...products.map((p) => ({ value: p.id, label: p.name }))] },
    { name: "notes", label: "Notes", type: "textarea", defaultValue: c?.notes, wide: true },
  ];
}

function BaselineCard({ b }: { b: AggregateBaseline }) {
  const sources = [{ kind: "baseline" as const, id: b.id, start: b.coverage_start, end: b.as_of_date, leadSourceId: null, values: b }];
  const reported = b.reported_metrics as Record<string, number | string>;
  const checks: Array<[string, string, string | number | undefined]> = [
    ["Contact rate", `${((pairedRatio(sources, "voice_connections", "outbound_dials").value ?? 0) * 100).toFixed(2)}%`, reported.contact_rate_pct !== undefined ? `${reported.contact_rate_pct}%` : undefined],
    ["Conversation → MAPD", `${((pairedRatio(sources, "mapd_apps", "voice_connections").value ?? 0) * 100).toFixed(2)}%`, reported.conversation_to_mapd_application_rate_pct !== undefined ? `${reported.conversation_to_mapd_application_rate_pct}%` : undefined],
    ["Dials per MAPD app", (pairedRatio(sources, "outbound_dials", "mapd_apps").value ?? 0).toFixed(2), reported.dials_per_mapd_application],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{b.label}</CardTitle>
        <CardDescription>
          Dated aggregate covering {formatDate(b.coverage_start)} – {formatDate(b.as_of_date)}. Blank = not reported (unknown), which is different from 0.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reconciliation</TableHead>
              <TableHead className="text-right">Computed from stored totals</TableHead>
              <TableHead className="text-right">As originally reported</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {checks.map(([label, computed, rep]) => (
              <TableRow key={label}>
                <TableCell>{label}</TableCell>
                <TableCell className="text-right font-medium">{computed}</TableCell>
                <TableCell className="text-right">{rep ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <SimpleForm
          action="saveBaseline"
          hidden={{ id: b.id }}
          resetOnSuccess={false}
          columns={4}
          submitLabel="Save baseline correction"
          fields={[
            { name: "label", label: "Label", type: "text", defaultValue: b.label, wide: true },
            { name: "coverage_start", label: "Coverage start", type: "date", defaultValue: b.coverage_start },
            { name: "as_of_date", label: "As of (coverage end)", type: "date", defaultValue: b.as_of_date },
            ...ACTIVITY_FIELDS.map<FieldConfig>((f) => ({
              name: f,
              label: FIELD_LABEL[f] ?? f,
              type: f === "lead_spend_cents" ? "money" : "number",
              defaultValue: f === "lead_spend_cents" ? centsToDecimalString(b[f]) || undefined : b[f],
              placeholder: "not reported",
            })),
            { name: "source_note", label: "Source note", type: "textarea", defaultValue: b.source_note, wide: true },
          ]}
        />
      </CardContent>
    </Card>
  );
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { ws, filters, campaign, data } = await loadPage(Promise.resolve(sp));
  if (!campaign || !data) return <NoCampaign />;
  const tab = typeof sp.tab === "string" ? sp.tab : "campaign";
  const editId = typeof sp.edit === "string" ? sp.edit : null;
  const here = (t: string, extra: Record<string, string> = {}) => `/settings${filterQuery({ campaign: filters.campaign }, { tab: t, ...extra })}`;
  const { data: batches } = await ws.supabase.from("import_batches").select("*").order("created_at", { ascending: false }).limit(20);

  const productName = new Map(ws.products.map((p) => [p.id, p.name]));
  const carrierName = new Map(ws.carriers.map((c) => [c.id, c.name]));
  const editProduct = tab === "products" && editId ? ws.products.find((p) => p.id === editId) : undefined;
  const editSource = tab === "sources" && editId ? ws.leadSources.find((l) => l.id === editId) : undefined;
  const schedule = data.schedule;

  return (
    <>
      <PageHeader title="Settings" description={`Configuration for ${campaign.name} and your workspace`} />
      <Tabs defaultValue={tab}>
        <TabsList>
          <TabsTrigger value="campaign">Campaign</TabsTrigger>
          <TabsTrigger value="baseline">Baseline</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="carriers">Carriers</TabsTrigger>
          <TabsTrigger value="commissions">Commissions</TabsTrigger>
          <TabsTrigger value="sources">Lead sources</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="data">Import / export</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
        </TabsList>

        {/* ---------------- campaign ---------------- */}
        <TabsContent value="campaign" className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Edit {campaign.name}</CardTitle>
              <CardDescription>Goals, expenses and expense dates live on the Goals and Revenue pages.</CardDescription>
            </CardHeader>
            <CardContent>
              <SimpleForm key={campaign.id} action="saveCampaign" hidden={{ id: campaign.id }} resetOnSuccess={false} fields={campaignFields(campaign, ws.products)} submitLabel="Save campaign" />
            </CardContent>
          </Card>
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>All campaigns</CardTitle>
              </CardHeader>
              <Table>
                <TableBody>
                  {ws.campaigns.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Link className="font-medium text-navy hover:underline" href={`/settings?campaign=${c.slug}`}>
                          {c.name}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {formatDate(c.start_date)} – {formatDate(c.end_date)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={c.status === "active" ? "success" : "outline"}>{c.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>New campaign</CardTitle>
                <CardDescription>For example the 2027 AEP, an OEP push, or a Life/Final Expense campaign.</CardDescription>
              </CardHeader>
              <CardContent>
                <SimpleForm action="saveCampaign" fields={campaignFields(null, ws.products)} submitLabel="Create campaign" />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ---------------- baseline ---------------- */}
        <TabsContent value="baseline" className="space-y-6">
          {data.baselines.length === 0 ? (
            <Alert variant="info">
              <AlertDescription>This campaign has no aggregate baseline. All totals come from daily entries.</AlertDescription>
            </Alert>
          ) : (
            data.baselines.map((b) => <BaselineCard key={b.id} b={b} />)
          )}
        </TabsContent>

        {/* ---------------- products ---------------- */}
        <TabsContent value="products" className="grid gap-6 lg:grid-cols-[1fr_24rem]">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Daily column</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="sr-only">Edit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ws.products.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium text-navy">{p.name}</TableCell>
                    <TableCell>{p.code}</TableCell>
                    <TableCell>{p.daily_column ? APP_COLUMN_LABELS[p.daily_column] : "Itemized only"}</TableCell>
                    <TableCell>{p.is_active ? <Badge variant="success">Active</Badge> : <Badge variant="outline">Inactive</Badge>}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="icon" aria-label={`Edit ${p.name}`}>
                        <Link href={here("products", { edit: p.id })}>
                          <Pencil />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{editProduct ? `Edit ${editProduct.name}` : "Add product"}</CardTitle>
            </CardHeader>
            <CardContent>
              <SimpleForm
                key={editProduct?.id ?? "new"}
                action="saveProduct"
                hidden={{ id: editProduct?.id }}
                columns={1}
                cancelHref={editProduct ? here("products") : undefined}
                submitLabel={editProduct ? "Save product" : "Add product"}
                fields={[
                  { name: "name", label: "Name", type: "text", required: true, defaultValue: editProduct?.name },
                  { name: "code", label: "Code", type: "text", required: true, defaultValue: editProduct?.code, placeholder: "FINAL_EXPENSE" },
                  { name: "category", label: "Category", type: "select", defaultValue: editProduct?.category ?? "other", options: CATEGORY_OPTIONS },
                  { name: "daily_column", label: "Daily entry column", type: "select", defaultValue: editProduct?.daily_column, options: [{ value: "", label: "None — itemized only" }, ...APP_COLUMNS.map((c) => ({ value: c, label: APP_COLUMN_LABELS[c] }))] },
                  { name: "is_active", label: "Active", type: "checkbox", defaultValue: editProduct?.is_active ?? true, placeholder: "Show in forms" },
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- carriers ---------------- */}
        <TabsContent value="carriers" className="grid gap-6 lg:grid-cols-[1fr_24rem]">
          <Card>
            {ws.carriers.length === 0 ? (
              <CardContent className="pt-5 text-sm text-muted-foreground">No carriers yet. Add the carriers you are appointed with.</CardContent>
            ) : (
              <Table>
                <TableBody>
                  {ws.carriers.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium text-navy">{c.name}</TableCell>
                      <TableCell className="text-right">
                        <ConfirmDelete action="deleteCarrier" id={c.id} what={c.name} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Add carrier</CardTitle>
            </CardHeader>
            <CardContent>
              <SimpleForm action="saveCarrier" columns={1} submitLabel="Add carrier" fields={[{ name: "name", label: "Carrier name", type: "text", required: true }]} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- commissions ---------------- */}
        <TabsContent value="commissions" className="grid gap-6 lg:grid-cols-[1fr_24rem]">
          <Card>
            <CardHeader>
              <CardTitle>Commission assumptions</CardTitle>
              <CardDescription>
                The most specific match wins: carrier + enrollment type → carrier → enrollment type → product default. Products without an assumption show revenue as “unpriced”, never $0.
              </CardDescription>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Carrier</TableHead>
                  <TableHead>Plan year</TableHead>
                  <TableHead>Enrollment</TableHead>
                  <TableHead className="text-right">Assumption</TableHead>
                  <TableHead className="sr-only">Delete</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.assumptions.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium text-navy">{productName.get(a.product_id)}</TableCell>
                    <TableCell>{a.carrier_id ? carrierName.get(a.carrier_id) : "Any"}</TableCell>
                    <TableCell>{a.plan_year}</TableCell>
                    <TableCell>{a.enrollment_type?.replace(/_/g, " ") ?? "Any"}</TableCell>
                    <TableCell className="text-right">{a.basis === "flat_per_application" ? `${formatCents(a.amount_cents)} / app` : `${(a.rate_bps ?? 0) / 100}% of annual premium`}</TableCell>
                    <TableCell className="text-right">
                      <ConfirmDelete action="deleteAssumption" id={a.id} what="this assumption" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Add assumption</CardTitle>
            </CardHeader>
            <CardContent>
              <SimpleForm
                action="saveAssumption"
                columns={1}
                submitLabel="Add assumption"
                fields={[
                  { name: "product_id", label: "Product", type: "select", required: true, options: ws.products.map((p) => ({ value: p.id, label: p.name })) },
                  { name: "carrier_id", label: "Carrier", type: "select", options: [{ value: "", label: "Any carrier" }, ...ws.carriers.map((c) => ({ value: c.id, label: c.name }))] },
                  { name: "plan_year", label: "Plan year", type: "number", required: true, defaultValue: campaign.plan_year ?? campaign.campaign_year, min: 2000, max: 2100 },
                  { name: "enrollment_type", label: "Enrollment type", type: "select", options: [{ value: "", label: "Any" }, { value: "new_to_medicare", label: "New to Medicare" }, { value: "like_plan_change", label: "Like-plan change" }, { value: "unlike_plan_change", label: "Unlike-plan change" }, { value: "renewal", label: "Renewal" }] },
                  { name: "basis", label: "Basis", type: "select", defaultValue: "flat_per_application", options: [{ value: "flat_per_application", label: "Flat $ per application" }, { value: "percent_of_annual_premium", label: "% of annual premium" }] },
                  { name: "amount", label: "Amount per application ($)", type: "money", hint: "For flat basis" },
                  { name: "rate_percent", label: "Rate (% of annual premium)", type: "percent", hint: "For percent basis" },
                  { name: "notes", label: "Notes", type: "text" },
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- lead sources ---------------- */}
        <TabsContent value="sources" className="grid gap-6 lg:grid-cols-[1fr_24rem]">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead source</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Inbound</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="sr-only">Edit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ws.leadSources.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium text-navy">
                      {l.name} <span className="text-xs text-muted-foreground">({l.code})</span>
                    </TableCell>
                    <TableCell className="capitalize">{l.channel}</TableCell>
                    <TableCell>{l.is_inbound ? "Yes" : "No"}</TableCell>
                    <TableCell>{l.is_active ? <Badge variant="success">Active</Badge> : <Badge variant="outline">Inactive</Badge>}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="icon" aria-label={`Edit ${l.name}`}>
                        <Link href={here("sources", { edit: l.id })}>
                          <Pencil />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{editSource ? `Edit ${editSource.name}` : "Add lead source"}</CardTitle>
              <CardDescription>Inbound sources (transfers, referrals, events) may log connections without outbound dials.</CardDescription>
            </CardHeader>
            <CardContent>
              <SimpleForm
                key={editSource?.id ?? "new"}
                action="saveLeadSource"
                hidden={{ id: editSource?.id }}
                columns={1}
                cancelHref={editSource ? here("sources") : undefined}
                submitLabel={editSource ? "Save lead source" : "Add lead source"}
                fields={[
                  { name: "name", label: "Name", type: "text", required: true, defaultValue: editSource?.name },
                  { name: "code", label: "Code", type: "text", required: true, defaultValue: editSource?.code, placeholder: "FACEBOOK_ADS" },
                  { name: "channel", label: "Channel", type: "select", defaultValue: editSource?.channel ?? "digital", options: ["outbound", "inbound", "event", "referral", "digital"].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })) },
                  { name: "is_inbound", label: "Inbound", type: "checkbox", defaultValue: editSource?.is_inbound ?? false, placeholder: "Connections can exceed dials" },
                  { name: "is_active", label: "Active", type: "checkbox", defaultValue: editSource?.is_active ?? true, placeholder: "Show in forms" },
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- schedule ---------------- */}
        <TabsContent value="schedule" className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Dialing schedule</CardTitle>
              <CardDescription>Working days drive remaining-day counts, required pace and forecasts.</CardDescription>
            </CardHeader>
            <CardContent>
              <SimpleForm
                action="saveSchedule"
                hidden={{ campaign_id: campaign.id }}
                resetOnSuccess={false}
                columns={2}
                submitLabel="Save schedule"
                fields={[
                  { name: "name", label: "Schedule name", type: "text", defaultValue: schedule?.name ?? "Default schedule", wide: true },
                  { name: "working_weekdays", label: "Working days", type: "checkboxes", defaultValue: (schedule?.working_weekdays ?? [1, 2, 3, 4, 5]).map(String), options: WEEKDAYS.map((d, i) => ({ value: String(i), label: d })), wide: true },
                  { name: "planned_dials_per_day", label: "Planned dials per day", type: "number", defaultValue: schedule?.planned_dials_per_day, hint: "Used by forecasts; blank = use your historical average" },
                  { name: "planned_hours_per_day", label: "Planned dialing hours per day", type: "number", defaultValue: schedule?.planned_hours_per_day, max: 24 },
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Holidays, vacation & exclusions</CardTitle>
              <CardDescription>Add an “extra workday” to count a normally-off day (e.g. a Saturday push).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SimpleForm
                action="addScheduleException"
                hidden={{ campaign_id: campaign.id }}
                columns={3}
                submitLabel="Add date"
                fields={[
                  { name: "exception_date", label: "Date", type: "date", required: true, min: campaign.start_date, max: campaign.end_date },
                  { name: "kind", label: "Type", type: "select", defaultValue: "vacation", options: ["holiday", "vacation", "exclusion", "extra_workday"].map((v) => ({ value: v, label: v.replace("_", " ") })) },
                  { name: "note", label: "Note", type: "text" },
                ]}
              />
              <Table>
                <TableBody>
                  {(schedule?.exceptions ?? []).map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>{formatDate(e.exception_date, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</TableCell>
                      <TableCell>
                        <Badge variant={e.kind === "extra_workday" ? "success" : "outline"}>{e.kind.replace("_", " ")}</Badge>
                      </TableCell>
                      <TableCell>{e.note}</TableCell>
                      <TableCell className="text-right">
                        <ConfirmDelete action="deleteScheduleException" id={e.id} what="this date" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- profile ---------------- */}
        <TabsContent value="profile">
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle>User profile</CardTitle>
              <CardDescription>Signed in as {ws.email}. Password and email changes are handled by Supabase Auth.</CardDescription>
            </CardHeader>
            <CardContent>
              <SimpleForm
                action="saveProfile"
                resetOnSuccess={false}
                submitLabel="Save profile"
                fields={[
                  { name: "full_name", label: "Your name", type: "text", defaultValue: ws.profile.full_name },
                  { name: "agency_name", label: "Agency name", type: "text", defaultValue: ws.profile.agency_name, required: true },
                  { name: "timezone", label: "Time zone", type: "text", defaultValue: ws.profile.timezone, hint: "Defines “today” for pacing (IANA name, e.g. America/Chicago)" },
                  { name: "default_campaign_id", label: "Default campaign", type: "select", defaultValue: ws.profile.default_campaign_id, options: ws.campaigns.map((c) => ({ value: c.id, label: c.name })) },
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- data ---------------- */}
        <TabsContent value="data" className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Import CSV</CardTitle>
              <CardDescription>
                Imports are idempotent: the same file can only be imported once, and rows are matched on their natural key (date + lead source, application_ref, or external_id) so re-imports update rather than duplicate.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SimpleForm
                action="importCsv"
                hidden={{ campaign_id: campaign.id }}
                columns={1}
                submitLabel="Import into this campaign"
                fields={[
                  { name: "kind", label: "What are you importing?", type: "select", options: [
                    { value: "daily_activity", label: "Daily activity" },
                    { value: "applications", label: "Itemized applications" },
                    { value: "commission_transactions", label: "Commission transactions" },
                    { value: "expenses", label: "Expenses" },
                  ] },
                  { name: "file", label: "CSV file (max 2 MB)", type: "file", accept: ".csv,text/csv", required: true },
                ]}
              />
              <div className="mt-6 space-y-2 text-xs text-muted-foreground">
                <p className="font-semibold text-charcoal">Expected columns</p>
                {Object.entries(IMPORT_TEMPLATES).map(([k, cols]) => (
                  <p key={k}>
                    <span className="font-medium text-navy">{k}</span>: <code className="break-words">{cols.join(", ")}</code>
                  </p>
                ))}
                <p>Lead sources and products are referenced by code (e.g. WAVV_OUTBOUND, MAPD); carriers by name. Money in dollars (e.g. 363.00).</p>
              </div>
            </CardContent>
          </Card>
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Export</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {["summary", "daily_activity", "applications", "commission_transactions", "expenses", "funnel"].map((k) => (
                  <Button key={k} asChild variant="outline" size="sm">
                    <a href={`/api/export/${k}?campaign=${campaign.slug}`}>
                      <Download /> {k.replace(/_/g, " ")}
                    </a>
                  </Button>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Import history</CardTitle>
              </CardHeader>
              {(batches ?? []).length === 0 ? (
                <CardContent className="text-sm text-muted-foreground">No imports yet.</CardContent>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Kind</TableHead>
                      <TableHead className="text-right">New / updated / skipped</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(batches ?? []).map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="whitespace-nowrap">{formatDate(String(b.created_at).slice(0, 10))}</TableCell>
                        <TableCell>
                          {b.kind}
                          <div className="max-w-[12rem] truncate text-xs text-muted-foreground">{b.filename}</div>
                        </TableCell>
                        <TableCell className="text-right">
                          {b.inserted_count} / {b.updated_count} / {b.skipped_count}
                        </TableCell>
                        <TableCell>
                          <Badge variant={b.status === "completed" ? "success" : b.status === "partial" ? "warning" : "destructive"}>{b.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          </div>
        </TabsContent>

        {/* ---------------- integrations ---------------- */}
        <TabsContent value="integrations" className="grid gap-6 lg:grid-cols-2">
          {INTEGRATIONS.map((i) => {
            const status = i.status();
            return (
              <Card key={i.descriptor.id}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2">
                      <Plug className="h-5 w-5 text-gold" /> {i.descriptor.name}
                    </CardTitle>
                    <Badge variant="outline">{status === "not_configured" ? "Not connected" : "Credentials present · not verified"}</Badge>
                  </div>
                  <CardDescription>{i.descriptor.purpose}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <Alert variant="warning">
                    <AlertDescription>
                      This integration is not active. It will not be enabled until credentials, the supported API endpoints and permissions are verified. Until then, import CSV exports.
                    </AlertDescription>
                  </Alert>
                  <div>
                    <p className="font-semibold text-navy">Planned data</p>
                    <ul className="ml-4 list-disc text-muted-foreground">
                      {i.descriptor.plannedData.map((d) => (
                        <li key={d}>{d}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="font-semibold text-navy">Verification checklist</p>
                    <ul className="ml-4 list-disc text-muted-foreground">
                      {i.descriptor.verificationChecklist.map((d) => (
                        <li key={d}>{d}</li>
                      ))}
                    </ul>
                  </div>
                  <p className="text-xs text-muted-foreground">Server environment variables (never exposed to the browser): {i.descriptor.requiredEnv.join(", ")}</p>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>
    </>
  );
}
