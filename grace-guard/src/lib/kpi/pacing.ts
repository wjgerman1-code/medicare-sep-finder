import { addDays, maxDate, minDate, type ISODate } from "@/lib/dates";
import type { WorkSchedule } from "@/lib/domain/types";
import { countWorkingDays, nthWorkingDayAfter } from "./schedule";
import { ratio, type Ratio } from "./ratio";

export type PaceStatus = "complete" | "ahead" | "on_track" | "behind" | "not_started" | "ended" | "no_goal";
export type CampaignPhase = "before" | "during" | "after";

/** ±5% of the expected-by-now line counts as "on track". */
export const ON_TRACK_TOLERANCE = 0.05;

export interface PacingInput {
  start: ISODate;
  end: ISODate;
  asOf: ISODate;
  goal: number | null;
  actual: number;
  /** total outbound dials and applications over comparable sources (for dials per application) */
  dials: number | null;
  dialApplications: number | null;
  /** has activity already been logged for asOf? then today counts as elapsed */
  todayLogged: boolean;
  schedule: WorkSchedule | null;
}

export interface Pacing {
  phase: CampaignPhase;
  goal: number | null;
  actual: number;
  completion: Ratio;
  remaining: number | null;
  totalWorkingDays: number;
  elapsedWorkingDays: number;
  remainingWorkingDays: number;
  /** Remaining applications ÷ remaining working days */
  requiredPerDay: number | null;
  /** Outbound dials ÷ applications (historical) */
  dialsPerApplication: Ratio;
  /** Remaining applications × historical dials per application */
  requiredDials: number | null;
  requiredDialsPerDay: number | null;
  /** Historical dials per elapsed working day */
  historicalDialsPerDay: number | null;
  /** goal × elapsed working days ÷ total working days */
  expectedByNow: number | null;
  paceDelta: number | null;
  status: PaceStatus;
  /** actual ÷ elapsed working days */
  currentPacePerDay: number | null;
  /** actual + current pace × remaining working days (estimate) */
  projectedAtEnd: number | null;
  /** working day on which the goal is reached at the current pace (estimate) */
  projectedFinishDate: ISODate | null;
}

export function computePacing(input: PacingInput): Pacing {
  const { start, end, asOf, goal, actual, schedule, todayLogged } = input;
  const phase: CampaignPhase = asOf < start ? "before" : asOf > end ? "after" : "during";

  // last day that counts as "done": today if logged, otherwise yesterday
  const lastElapsed = todayLogged ? asOf : addDays(asOf, -1);
  const totalWorkingDays = countWorkingDays(start, end, schedule);
  const elapsedWorkingDays = countWorkingDays(start, minDate(end, lastElapsed), schedule);
  const remainingWorkingDays = countWorkingDays(maxDate(start, addDays(lastElapsed, 1)), end, schedule);

  const remaining = goal === null ? null : Math.max(0, goal - actual);
  const dialsPerApplication = ratio(input.dials, input.dialApplications);

  const requiredPerDay =
    remaining === null ? null : remaining === 0 ? 0 : remainingWorkingDays > 0 ? remaining / remainingWorkingDays : null;
  const requiredDials =
    remaining === null || dialsPerApplication.value === null ? null : Math.ceil(remaining * dialsPerApplication.value);
  const requiredDialsPerDay =
    requiredDials === null ? null : requiredDials === 0 ? 0 : remainingWorkingDays > 0 ? requiredDials / remainingWorkingDays : null;

  const expectedByNow = goal === null || totalWorkingDays === 0 ? null : (goal * elapsedWorkingDays) / totalWorkingDays;
  const paceDelta = expectedByNow === null ? null : actual - expectedByNow;
  const currentPacePerDay = elapsedWorkingDays > 0 ? actual / elapsedWorkingDays : null;
  const historicalDialsPerDay = elapsedWorkingDays > 0 && input.dials !== null ? input.dials / elapsedWorkingDays : null;
  const projectedAtEnd = currentPacePerDay === null ? null : actual + currentPacePerDay * remainingWorkingDays;

  let status: PaceStatus;
  if (goal === null) status = "no_goal";
  else if (actual >= goal) status = "complete";
  else if (phase === "before") status = "not_started";
  else if (phase === "after") status = "ended";
  else if (expectedByNow === null || expectedByNow === 0) status = "on_track";
  else if (actual >= expectedByNow * (1 + ON_TRACK_TOLERANCE)) status = "ahead";
  else if (actual < expectedByNow * (1 - ON_TRACK_TOLERANCE)) status = "behind";
  else status = "on_track";

  let projectedFinishDate: ISODate | null = null;
  if (remaining !== null && remaining > 0 && currentPacePerDay !== null && currentPacePerDay > 0) {
    const daysNeeded = Math.ceil(remaining / currentPacePerDay - 1e-9);
    projectedFinishDate = nthWorkingDayAfter(maxDate(lastElapsed, addDays(start, -1)), daysNeeded, schedule);
  }

  return {
    phase,
    goal,
    actual,
    completion: ratio(actual, goal),
    remaining,
    totalWorkingDays,
    elapsedWorkingDays,
    remainingWorkingDays,
    requiredPerDay,
    dialsPerApplication,
    requiredDials,
    requiredDialsPerDay,
    historicalDialsPerDay,
    expectedByNow,
    paceDelta,
    status,
    currentPacePerDay,
    projectedAtEnd,
    projectedFinishDate,
  };
}

export const PACE_STATUS_LABELS: Record<PaceStatus, string> = {
  complete: "Goal reached",
  ahead: "Ahead of pace",
  on_track: "On pace",
  behind: "Behind pace",
  not_started: "Not started",
  ended: "Campaign ended",
  no_goal: "No goal set",
};
