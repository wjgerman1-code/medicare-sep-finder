import { addDays, eachDay, weekday, type ISODate } from "@/lib/dates";
import type { WorkSchedule } from "@/lib/domain/types";

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
