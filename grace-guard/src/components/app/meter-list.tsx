import { cn } from "@/lib/utils";

export interface MeterItem {
  label: string;
  /** 0..1 */
  share: number | null;
  /** e.g. "of goal" / "of sales" */
  shareLabel: string;
  detail: string;
  tone?: "navy" | "gold";
}

/** Labelled thick progress bars: "30% | 17 applications" with a rounded meter. */
export function MeterList({ items }: { items: MeterItem[] }) {
  return (
    <ul className="flex flex-col gap-5">
      {items.map((m) => {
        const pct = m.share === null ? null : Math.round(m.share * 100);
        return (
          <li key={m.label} className="grid grid-cols-[1fr_minmax(7rem,45%)] items-center gap-x-4 gap-y-1.5">
            <p className="col-span-2 text-sm font-semibold text-navy">{m.label}</p>
            <p className="text-sm text-muted-foreground">
              <span className="tabular font-semibold text-charcoal">{pct === null ? "—" : `${pct}%`}</span>{" "}
              <span className="text-xs">{m.shareLabel}</span>
              <span className="mx-2 text-border">|</span>
              {m.detail}
            </p>
            <div className="h-3.5 w-full overflow-hidden rounded-full bg-gold/15" role="meter" aria-valuenow={pct ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label={m.label}>
              <div
                className={cn("h-full rounded-full", m.tone === "gold" ? "brushed-gold" : "bg-gradient-to-r from-navy to-navy-2")}
                style={{ width: `${Math.min(100, Math.max(pct ?? 0, pct ? 4 : 0))}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
