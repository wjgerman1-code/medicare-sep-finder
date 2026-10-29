import { Clock } from "lucide-react";

export function LastUpdated({ at, timeZone }: { at: string | null; timeZone: string }) {
  const text = at
    ? new Intl.DateTimeFormat("en-US", { timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(at))
    : "No data saved yet";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Clock className="h-3.5 w-3.5" /> Last update: {text}
    </span>
  );
}
