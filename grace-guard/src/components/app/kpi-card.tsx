import { Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  /** 0..100 progress bar */
  progress?: number | null;
  /** formula / numerator ÷ denominator shown as a tooltip */
  definition?: string;
  estimate?: boolean;
  tone?: "default" | "good" | "bad" | "gold";
  className?: string;
}

export function KpiCard({ label, value, sub, progress, definition, estimate, tone = "default", className }: KpiCardProps) {
  return (
    <div
      className={cn(
        "relative flex flex-col gap-1 overflow-hidden rounded-2xl border bg-card p-4 shadow-[0_1px_2px_rgba(16,28,46,0.04)]",
        estimate && "border-dashed",
        className,
      )}
    >
      {tone === "gold" && <span className="brushed-gold absolute inset-x-0 top-0 h-[3px]" />}
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        <div className="flex items-center gap-1">
          {estimate && <Badge variant="forecast">Forecast</Badge>}
          {definition && (
            <span title={definition} className="cursor-help text-muted-foreground/70" aria-label={definition}>
              <Info className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
      </div>
      <div
        className={cn(
          "tabular font-serif text-3xl font-semibold leading-tight",
          tone === "good" ? "text-success" : tone === "bad" ? "text-destructive" : "text-navy",
        )}
      >
        {value}
      </div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      {progress !== undefined && progress !== null && <Progress value={progress} className="mt-2" indicatorClassName={tone === "gold" ? "brushed-gold" : undefined} />}
    </div>
  );
}
