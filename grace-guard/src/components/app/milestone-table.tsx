import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/dates";
import type { MilestoneFormat, MilestoneRow } from "@/lib/kpi/milestones";
import { formatNumber, formatPercent } from "@/lib/kpi/ratio";
import { formatCents } from "@/lib/money";

function fmt(v: number | null, f: MilestoneFormat) {
  if (v === null) return "—";
  if (f === "money") return formatCents(v);
  if (f === "percent") return formatPercent(v, 2);
  if (f === "decimal") return formatNumber(v, 2);
  return formatNumber(v);
}

/** AEP milestone & campaign metric projections (current → remaining → goal). */
export function MilestoneTable({ rows, start, end, asOf }: { rows: MilestoneRow[]; start: string; end: string; asOf: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>AEP milestone & campaign metric projections</CardTitle>
        <CardDescription>
          From the milestone performance report, recalculated live. Current = campaign to date ({formatDate(start, { month: "numeric", day: "numeric" })} – {formatDate(asOf < end ? asOf : end, { month: "numeric", day: "numeric" })}); rates are held at their current value, as the plan assumes.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-2 pb-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Metric</TableHead>
              <TableHead className="text-right">Current</TableHead>
              <TableHead className="text-right">Remaining horizon</TableHead>
              <TableHead className="text-right">Campaign goal ({formatDate(end, { month: "short", day: "numeric" })})</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.key}>
                <TableCell className="font-medium text-navy">{r.label}</TableCell>
                <TableCell className="text-right">{fmt(r.current, r.format)}</TableCell>
                <TableCell className="text-right font-semibold text-gold-deep">{r.remainingText ?? fmt(r.remaining, r.format)}</TableCell>
                <TableCell className="text-right font-semibold text-navy">{r.goalText ?? fmt(r.goal, r.format)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
