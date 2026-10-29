import { APP_COLUMNS } from "@/lib/domain/types";
import type { ActivitySource } from "./aggregate";

/** Per-day totals from daily sources only (baselines are never spread across days). */
export function dailySeries(sources: ActivitySource[]) {
  const byDate = new Map<string, { date: string; dials: number; connections: number; applications: number }>();
  for (const s of sources) {
    if (s.kind !== "daily") continue;
    const d = byDate.get(s.start) ?? { date: s.start, dials: 0, connections: 0, applications: 0 };
    d.dials += s.values.outbound_dials ?? 0;
    d.connections += s.values.voice_connections ?? 0;
    d.applications += APP_COLUMNS.reduce((a, c) => a + (s.values[c] ?? 0), 0);
    byDate.set(s.start, d);
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}
