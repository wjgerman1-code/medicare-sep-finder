import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { METRICS } from "@/lib/kpi/definitions";

export const metadata = { title: "Metric Dictionary" };

export default function MetricsPage() {
  const groups = [...new Set(METRICS.map((m) => m.group))];
  return (
    <>
      <PageHeader
        title="Metric Dictionary"
        description="Every number on the dashboard: its formula, numerator, denominator and data source. Rates are always weighted from raw totals; daily percentages are never averaged. Missing data or a zero denominator shows “—”."
      />
      <div className="space-y-6">
        {groups.map((g) => (
          <Card key={g}>
            <div className="border-b px-5 py-3 font-serif text-xl font-semibold text-navy">{g}</div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-48">Metric</TableHead>
                  <TableHead>Calculation</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {METRICS.filter((m) => m.group === g).map((m) => (
                  <TableRow key={m.id} id={m.id} className="scroll-mt-24 align-top target:bg-gold/10">
                    <TableCell className="font-medium text-navy">
                      {m.label} {m.estimate && <Badge variant="forecast" className="ml-1">Estimate</Badge>}
                    </TableCell>
                    <TableCell className="text-sm">
                      <code className="text-[0.8rem]">{m.formula}</code>
                      {(m.numerator || m.denominator) && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          Numerator: {m.numerator ?? "—"} · Denominator: {m.denominator ?? "—"}
                        </div>
                      )}
                      {m.notes && <div className="mt-1 text-xs text-muted-foreground">{m.notes}</div>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{m.source}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        ))}
      </div>
    </>
  );
}
