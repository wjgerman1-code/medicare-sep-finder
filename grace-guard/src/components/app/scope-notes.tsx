import { Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatDate } from "@/lib/dates";
import type { CollectedActivity } from "@/lib/kpi/aggregate";

/** Explains exactly which aggregate data is (and isn't) in the numbers on screen. */
export function ScopeNotes({ collected }: { collected: CollectedActivity }) {
  const included = collected.sources.filter((s) => s.kind === "baseline");
  const partial = collected.excludedBaselines.filter((e) => e.reason === "partial_overlap");
  if (included.length === 0 && partial.length === 0 && collected.coveredDaily.length === 0) return null;
  return (
    <Alert variant="info" className="mb-6">
      <Info />
      <AlertDescription className="space-y-1">
        {included.map((b) => (
          <p key={b.id}>
            Includes the dated aggregate baseline for {formatDate(b.start)} – {formatDate(b.end)}. It is counted as one block and is not split across individual days.
          </p>
        ))}
        {partial.map(({ baseline }) => (
          <p key={baseline.id}>
            The baseline ({formatDate(baseline.coverage_start)} – {formatDate(baseline.as_of_date)}) only partly overlaps the selected dates, so it is excluded from this view rather than guessed at.
          </p>
        ))}
        {collected.coveredDaily.length > 0 && (
          <p>{collected.coveredDaily.length} daily entr{collected.coveredDaily.length === 1 ? "y is" : "ies are"} dated inside a baseline window and excluded to prevent double counting.</p>
        )}
      </AlertDescription>
    </Alert>
  );
}
