import { addDays, eachDay, weekday, type ISODate } from "@/lib/dates";
import type { DialingSession, WorkSchedule } from "@/lib/domain/types";

export const DEFAULT_WORKING_WEEKDAYS = [1, 2, 3, 4, 5];

/**
 * A day is a working day when it is an "extra_workday" exception, or when its
 * weekday is in the schedule and it is not a holiday/vacation/exclusion.
 */
export function isWorkingDay(date: ISODate, schedule: WorkSchedule | null): boolean {
  const exception = schedule?.exceptions.find((e) => e.exception_date === date);
  if (exception) return exception.kind === "extra_workday";
  const weekdays = schedule?.working_weekdays?.length ? schedule.working_weekdays : DEFAULT_WORKING_WEEKDAYS;
  return weekdays.includes(weekday(date));
}

export function workingDays(start: ISODate, end: ISODate, schedule: WorkSchedule | null): ISODate[] {
  if (end < start) return [];
  return eachDay(start, end).filter((d) => isWorkingDay(d, schedule));
}

/** Inclusive count of working days between start and end. */
export function countWorkingDays(start: ISODate, end: ISODate, schedule: WorkSchedule | null): number {
  return workingDays(start, end, schedule).length;
}

/** The nth working day strictly after `after` (n >= 1). Gives up after ~3 years. */
export function nthWorkingDayAfter(after: ISODate, n: number, schedule: WorkSchedule | null): ISODate | null {
  let found = 0;
  let d = after;
  for (let i = 0; i < 1100; i++) {
    d = addDays(d, 1);
    if (isWorkingDay(d, schedule)) {
      found++;
      if (found >= n) return d;
    }
  }
  return null;
}

/** Dialing sessions scheduled on a date's weekday (empty on non-working days). */
export function sessionsOn(date: ISODate, schedule: WorkSchedule | null): DialingSession[] {
  if (!schedule || !isWorkingDay(date, schedule)) return [];
  return schedule.sessions
    .filter((s) => s.weekday === weekday(date))
    .sort((a, b) => (a.start_time < b.start_time ? -1 : 1));
}

/**
 * Planned gross dials for one date: the sum of its dial-session targets.
 * Working days without sessions fall back to `planned_dials_per_day`;
 * null means no plan is configured for that day.
 */
export function plannedDialsOn(date: ISODate, schedule: WorkSchedule | null): number | null {
  if (!schedule || !isWorkingDay(date, schedule)) return 0;
  const dial = sessionsOn(date, schedule).filter((s) => s.kind === "dial");
  if (dial.length > 0) return dial.reduce((a, s) => a + (s.target_dials ?? 0), 0);
  return schedule.planned_dials_per_day;
}

/** Planned dials over a date range, or null if any working day has no plan. */
export function plannedDials(start: ISODate, end: ISODate, schedule: WorkSchedule | null): number | null {
  let total = 0;
  for (const d of workingDays(start, end, schedule)) {
    const p = plannedDialsOn(d, schedule);
    if (p === null) return null;
    total += p;
  }
  return total;
}
