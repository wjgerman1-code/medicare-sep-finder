import { Badge } from "@/components/ui/badge";
import { PACE_STATUS_LABELS, type PaceStatus } from "@/lib/kpi/pacing";

const VARIANT: Record<PaceStatus, "success" | "destructive" | "gold" | "outline"> = {
  complete: "success",
  ahead: "success",
  on_track: "gold",
  behind: "destructive",
  not_started: "outline",
  ended: "outline",
  no_goal: "outline",
};

export function PaceBadge({ status }: { status: PaceStatus }) {
  return <Badge variant={VARIANT[status]}>{PACE_STATUS_LABELS[status]}</Badge>;
}
