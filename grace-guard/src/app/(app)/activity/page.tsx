import Link from "next/link";
import { CalendarPlus, Download, Pencil } from "lucide-react";
import { ConfirmDelete } from "@/components/app/form-kit";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar } from "@/components/app/filter-bar";
import { PageHeader, SectionTitle } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Dials</TableHead>
                <TableHead className="text-right">Conn.</TableHead>
                <TableHead className="text-right">Contact</TableHead>
                <TableHead className="text-right">Qual.</TableHead>
                <TableHead className="text-right">Booked</TableHead>
                <TableHead className="text-right">Held</TableHead>
                <TableHead className="text-right">MAPD</TableHead>
                <TableHead className="text-right">Other apps</TableHead>
                <TableHead className="text-right">Spend</TableHead>
                <TableHead className="sr-only">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((d) => {
                const other = APP_COLUMNS.filter((c) => c !== "mapd_apps").reduce((a, c) => a + d[c], 0);
                return (
                  <TableRow key={d.id} className={d.id === editId ? "bg-gold/10" : covered.has(d.id) ? "opacity-50" : undefined}>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(d.activity_date, { weekday: "short", month: "short", day: "numeric" })}
                      {covered.has(d.id) && <Badge variant="outline" className="ml-2">Excluded · in baseline</Badge>}
                      {d.source !== "manual" && <Badge variant="outline" className="ml-2">{d.source}</Badge>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{d.lead_source_id ? sourcesById.get(d.lead_source_id) : "All / mixed"}</TableCell>
                    <TableCell className="text-right">{d.outbound_dials}</TableCell>
                    <TableCell className="text-right">{d.voice_connections}</TableCell>
                    <TableCell className="text-right">{formatPercent(d.outbound_dials ? d.voice_connections / d.outbound_dials : null)}</TableCell>
                    <TableCell className="text-right">{d.qualified_conversations}</TableCell>
                    <TableCell className="text-right">{d.appointments_booked}</TableCell>
                    <TableCell className="text-right">{d.appointments_held}</TableCell>
                    <TableCell className="text-right font-semibold text-navy">{d.mapd_apps}</TableCell>
                    <TableCell className="text-right">{other}</TableCell>
                    <TableCell className="text-right">{formatCents(d.lead_spend_cents)}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <Button asChild variant="ghost" size="icon" aria-label="Edit entry">
                        <Link href={`/activity${filterQuery({ campaign: filters.campaign, from: filters.from, to: filters.to }, { edit: d.id })}`}>
                          <Pencil />
                        </Link>
                      </Button>
                      <ConfirmDelete action="deleteDailyActivity" id={d.id} what={`the ${formatDate(d.activity_date)} entry`} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2}>Total (counted entries, weighted)</TableCell>
                <TableCell className="text-right">{sum("outbound_dials")}</TableCell>
                <TableCell className="text-right">{sum("voice_connections")}</TableCell>
                <TableCell className="text-right">{formatPercent(sum("outbound_dials") ? sum("voice_connections") / sum("outbound_dials") : null)}</TableCell>
                <TableCell className="text-right">{sum("qualified_conversations")}</TableCell>
                <TableCell className="text-right">{sum("appointments_booked")}</TableCell>
                <TableCell className="text-right">{sum("appointments_held")}</TableCell>
                <TableCell className="text-right">{sum("mapd_apps")}</TableCell>
                <TableCell className="text-right">{APP_COLUMNS.filter((c) => c !== "mapd_apps").reduce((a, c) => a + sum(c), 0)}</TableCell>
                <TableCell className="text-right">{formatCents(counted.reduce((a, d) => a + d.lead_spend_cents, 0))}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </Card>
      )}
    </>
  );
}
