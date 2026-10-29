import { eachDay, type ISODate } from "@/lib/dates";
import type { AggregateBaseline, WorkSchedule } from "@/lib/domain/types";
import { isWorkingDay } from "./schedule";

export interface TrajectoryPoint {
  date: ISODate;
  /** cumulative goal trajectory: goal × working days elapsed ÷ total working days */
  required: number | null;
  /** cumulative actual applications (null inside an un-split baseline window and after asOf) */
  actual: number | null;
  /** base-case forecast continuation from the last actual (estimate) */
  forecast: number | null;
  isBaselinePoint: boolean;
}

export interface TrajectoryInput {
  start: ISODate;
  end: ISODate;
  asOf: ISODate;
  goal: number | null;
  schedule: WorkSchedule | null;
  baselines: AggregateBaseline[];
  /** reconciled counts per bucket end date for the goal product */
  countsByDate: Array<{ date: ISODate; counted: number }>;
  /** estimated applications per working day for the forecast line */
  forecastPerDay: number | null;
}

export function buildTrajectory(input: TrajectoryInput): TrajectoryPoint[] {
  const { start, end, asOf, goal, schedule, baselines } = input;
  const days = eachDay(start, end);
  const total = days.filter((d) => isWorkingDay(d, schedule)).length;
  const counts = new Map(input.countsByDate.map((c) => [c.date, c.counted]));
  const baselineEnds = new Set(baselines.map((b) => b.as_of_date));
  const insideBaseline = (d: ISODate) => baselines.some((b) => d >= b.coverage_start && d < b.as_of_date);

  // any counts dated before the campaign start are folded into the first day
  let cumulative = input.countsByDate.filter((c) => c.date < start).reduce((a, c) => a + c.counted, 0);
  let elapsed = 0;
  let lastActual: number | null = null;
  let forecastRunning: number | null = null;
  const lastActualDate = asOf < end ? asOf : end;

  return days.map((date) => {
    if (isWorkingDay(date, schedule)) elapsed++;
    cumulative += counts.get(date) ?? 0;

    let actual: number | null = null;
    if (date <= asOf && !insideBaseline(date)) {
      actual = cumulative;
      lastActual = cumulative;
    }

    let forecast: number | null = null;
    if (input.forecastPerDay !== null && date >= lastActualDate) {
      if (forecastRunning === null) forecastRunning = lastActual ?? cumulative;
      else if (isWorkingDay(date, schedule)) forecastRunning += input.forecastPerDay;
      forecast = Math.round(forecastRunning * 10) / 10;
    }

    return {
      date,
      required: goal === null || total === 0 ? null : Math.round(((goal * elapsed) / total) * 10) / 10,
      actual,
      forecast,
      isBaselinePoint: baselineEnds.has(date),
    };
  });
}
