import { Ban, PhoneOutgoing } from "lucide-react";
import { formatTime, type ISODate } from "@/lib/dates";
import type { WorkSchedule } from "@/lib/domain/types";
import { plannedDialsOn, sessionsOn } from "@/lib/kpi/schedule";
import { cn } from "@/lib/utils";

/** Today's dialing sessions and do-not-dial blocks from the work schedule. */
export function DialPlanToday({ date, schedule, className }: { date: ISODate; schedule: WorkSchedule | null; className?: string }) {
  const sessions = sessionsOn(date, schedule);
  const planned = plannedDialsOn(date, schedule);
  if (sessions.length === 0) {
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>
        {planned === 0 ? "No dialing scheduled today." : "No dialing sessions configured for today (Settings → Schedule)."}
      </p>
    );
  }
  return (
    <div className={cn("flex flex-wrap items-center gap-2 text-xs", className)}>
      <span className="font-semibold text-charcoal">Today&apos;s plan{planned ? ` · ${planned} dials` : ""}:</span>
      {sessions.map((s) => (
        <span
          key={s.id}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
            s.kind === "dial" ? "border-gold/40 bg-gold/10 text-gold-deep" : "border-destructive/25 bg-destructive/5 text-destructive",
          )}
          title={s.label}
        >
          {s.kind === "dial" ? <PhoneOutgoing className="h-3 w-3" /> : <Ban className="h-3 w-3" />}
          {formatTime(s.start_time)}–{formatTime(s.end_time)} · {s.kind === "dial" ? `${s.target_dials} dials` : "Do not dial"}
        </span>
      ))}
    </div>
  );
}
