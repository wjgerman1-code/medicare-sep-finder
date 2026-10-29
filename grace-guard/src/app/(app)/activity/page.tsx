import Link from "next/link";
import { CalendarPlus, Download, Pencil } from "lucide-react";
import { ConfirmDelete } from "@/components/app/form-kit";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar } from "@/components/app/filter-bar";
import { PageHeader, SectionTitle } from "@/components/app/page-header";
import { SortableTable } from "@/components/app/sortable-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { filterQuery, type SearchParams } from "@/lib/data/filters";
import { loadPage } from "@/lib/data/page-data";
import { formatDate, maxDate, minDate } from "@/lib/dates";
import { APP_COLUMNS } from "@/lib/domain/types";
import { formatPercent } from "@/lib/kpi/ratio";
import { formatCents } from "@/lib/money";
import { NoCampaign } from "../no-campaign";
import { DailyForm } from "./daily-form";

export const metadata = { title: "Daily Activity" };

export default async function ActivityPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { ws, filters, campaign, data, snapshot, asOf } = await loadPage(Promise.resolve(sp));
  if (!campaign || !data || !snapshot) return <NoCampaign />;

  const editId = typeof sp.edit === "string" ? sp.edit : null;
  const entry = editId ? data.daily.find((d) => d.id === editId) ?? null : null;
  const defaultDate = minDate(maxDate(asOf, campaign.start_date), campaign.end_date);
  const sourcesById = new Map(ws.leadSources.map((l) => [l.id, l.name]));
  const rows = data.daily.filter((d) => (!filters.from || d.activity_date >= filters.from) && (!filters.to || d.activity_date <= filters.to));
  const covered = new Set(snapshot.toDate.collected.coveredDaily.map((d) => d.id));
  const counted = rows.filter((d) => !covered.has(d.id));
  const sum = (k: (typeof APP_COLUMNS)[number] | "outbound_dials" | "voice_connections" | "qualified_conversations" | "appointments_booked" | "appointments_held") =>
    counted.reduce((a, d) => a + d[k], 0);
  const base = filterQuery({ campaign: filters.campaign, from: filters.from, to: filters.to });

  return (
    <>
      <PageHeader title="Daily Activity" description={`${campaign.name} · enter and correct daily production numbers`}>
        <Button asChild variant="outline" size="sm">
          <a href={`/api/export/daily_activity${filterQuery(filters)}`}>
            <Download /> Export CSV
          </a>
        </Button>
      </PageHeader>

      <DailyForm
        key={entry?.id ?? "new"}
        campaign={campaign}
        leadSources={ws.leadSources}
        defaultDate={defaultDate}
        entry={entry}
        baselines={data.baselines}
        cancelHref={`/activity${base}`}
      />

      <SectionTitle>Saved entries</SectionTitle>
      <FilterBar campaigns={ws.campaigns} current={campaign.slug} showProduct={false} campaignRange={{ start: campaign.start_date, end: campaign.end_date }} />
      {rows.length === 0 ? (
        <EmptyState icon={CalendarPlus} title="No daily entries in this range">
          Entries you save above appear here. Activity before {formatDate(data.baselines[0]?.as_of_date ?? campaign.start_date)} is held in the aggregate baseline.
        </EmptyState>
      ) : (
        <Card>
          <SortableTable
            initialSort={{ col: 0, dir: "desc" }}
            columns={[
              { label: "Date" },
              { label: "Source" },
              { label: "Dials", align: "right" },
              { label: "Conn.", align: "right" },
              { label: "Contact", align: "right" },
              { label: "Qual.", align: "right" },
              { label: "Booked", align: "right" },
              { label: "Held", align: "right" },
              { label: "MAPD", align: "right" },
              { label: "Other apps", align: "right" },
              { label: "Spend", align: "right" },
              { label: "Actions", sortable: false, srOnly: true },
            ]}
            rows={rows.map((d) => {
              const other = APP_COLUMNS.filter((c) => c !== "mapd_apps").reduce((a, c) => a + d[c], 0);
              const contact = d.outbound_dials ? d.voice_connections / d.outbound_dials : null;
              const source = d.lead_source_id ? sourcesById.get(d.lead_source_id) ?? "—" : "All / mixed";
              return {
                id: d.id,
                className: d.id === editId ? "bg-gold/10" : covered.has(d.id) ? "opacity-50" : undefined,
                sort: [d.activity_date, source, d.outbound_dials, d.voice_connections, contact, d.qualified_conversations, d.appointments_booked, d.appointments_held, d.mapd_apps, other, d.lead_spend_cents, null],
                cells: [
                  <>
                    {formatDate(d.activity_date, { weekday: "short", month: "short", day: "numeric" })}
                    {covered.has(d.id) && <Badge variant="outline" className="ml-2">Excluded · in baseline</Badge>}
                    {d.source !== "manual" && <Badge variant="outline" className="ml-2">{d.source}</Badge>}
                  </>,
                  source,
                  d.outbound_dials,
                  d.voice_connections,
                  formatPercent(contact),
                  d.qualified_conversations,
                  d.appointments_booked,
                  d.appointments_held,
                  <span key="m" className="font-semibold text-navy">{d.mapd_apps}</span>,
                  other,
                  formatCents(d.lead_spend_cents),
                  <span key="a" className="flex justify-end">
                    <Button asChild variant="ghost" size="icon" aria-label="Edit entry">
                      <Link href={`/activity${filterQuery({ campaign: filters.campaign, from: filters.from, to: filters.to }, { edit: d.id })}`}>
                        <Pencil />
                      </Link>
                    </Button>
                    <ConfirmDelete action="deleteDailyActivity" id={d.id} what={`the ${formatDate(d.activity_date)} entry`} />
                  </span>,
                ],
              };
            })}
            footer={[
              "Total (counted, weighted)",
              "",
              sum("outbound_dials"),
              sum("voice_connections"),
              formatPercent(sum("outbound_dials") ? sum("voice_connections") / sum("outbound_dials") : null),
              sum("qualified_conversations"),
              sum("appointments_booked"),
              sum("appointments_held"),
              sum("mapd_apps"),
              APP_COLUMNS.filter((c) => c !== "mapd_apps").reduce((a, c) => a + sum(c), 0),
              formatCents(counted.reduce((a, d) => a + d.lead_spend_cents, 0)),
              "",
            ]}
          />
        </Card>
      )}
    </>
  );
}
