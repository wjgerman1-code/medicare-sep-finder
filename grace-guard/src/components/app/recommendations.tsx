import { AlertTriangle, CheckCircle2, Info, TrendingDown } from "lucide-react";
import type { Recommendation } from "@/lib/kpi/recommendations";
import { cn } from "@/lib/utils";

const ICON = { critical: TrendingDown, warning: AlertTriangle, info: Info, success: CheckCircle2 };
const TONE = {
  critical: "border-destructive/25 bg-destructive/[0.04] [&_svg]:text-destructive",
  warning: "border-warning/25 bg-warning/[0.05] [&_svg]:text-warning",
  info: "border-navy/10 bg-navy/[0.02] [&_svg]:text-navy",
  success: "border-success/25 bg-success/[0.05] [&_svg]:text-success",
};

export function RecommendationList({ items }: { items: Recommendation[] }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">No actions flagged — keep logging daily activity.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((r) => {
        const Icon = ICON[r.severity];
        return (
          <li key={r.id} className={cn("flex gap-3 rounded-lg border p-3", TONE[r.severity])}>
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-navy">{r.title}</p>
              <p className="text-sm text-muted-foreground">{r.detail}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
