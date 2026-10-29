import { z } from "zod";
import { estimateCents, type Cents } from "@/lib/money";
import type { Ratio } from "./ratio";

export const scenarioSchema = z.object({
  label: z.string().min(1).max(40),
  applicationsPerDialMultiplier: z.number().min(0).max(5),
  dialsPerDayMultiplier: z.number().min(0).max(5),
  /** absolute overrides take precedence over multipliers */
  applicationsPerDialOverride: z.number().min(0).max(1).nullable().optional(),
  dialsPerDayOverride: z.number().int().min(0).max(5000).nullable().optional(),
});
export type ScenarioConfig = z.infer<typeof scenarioSchema>;

export const SCENARIO_KEYS = ["conservative", "base", "aggressive"] as const;
export type ScenarioKey = (typeof SCENARIO_KEYS)[number];

export const forecastAssumptionsSchema = z.object({
  scenarios: z.object({
    conservative: scenarioSchema,
    base: scenarioSchema,
    aggressive: scenarioSchema,
  }),
});
export type ForecastAssumptions = z.infer<typeof forecastAssumptionsSchema>;

export const DEFAULT_FORECAST_ASSUMPTIONS: ForecastAssumptions = {
  scenarios: {
    conservative: { label: "Conservative", applicationsPerDialMultiplier: 0.85, dialsPerDayMultiplier: 0.85 },
    base: { label: "Base case", applicationsPerDialMultiplier: 1, dialsPerDayMultiplier: 1 },
    aggressive: { label: "Aggressive", applicationsPerDialMultiplier: 1.15, dialsPerDayMultiplier: 1.2 },
  },
};

export function parseForecastAssumptions(raw: unknown): ForecastAssumptions {
  const parsed = forecastAssumptionsSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_FORECAST_ASSUMPTIONS;
}

export interface ForecastInput {
  currentApplications: number;
  /** historical applications ÷ outbound dials */
  applicationsPerDial: Ratio;
  /** planned gross dials over the remaining working days (dialing sessions), if configured */
  plannedFutureDials: number | null;
  /** historical dials per elapsed working day (fallback for planned) */
  historicalDialsPerDay: number | null;
  remainingWorkingDays: number;
  goal: number | null;
  /** flat expected commission per additional application, if known */
  commissionPerApplicationCents: Cents | null;
  /** expected commission already booked on current applications of the goal product */
  currentExpectedCents: Cents;
  assumptions: ForecastAssumptions;
}

export interface ScenarioForecast {
  key: ScenarioKey;
  label: string;
  applicationsPerDial: number | null;
  dialsPerDay: number | null;
  futureDials: number | null;
  additionalApplications: number | null;
  /** current + planned future dials × assumed applications per dial */
  projectedApplications: number | null;
  /** current expected + additional × commission assumption */
  projectedRevenueCents: Cents | null;
  goalReached: boolean | null;
  gapToGoal: number | null;
  dialsPerDaySource: "override" | "planned" | "historical" | "none";
}

export function computeForecast(input: ForecastInput): ScenarioForecast[] {
  return SCENARIO_KEYS.map((key) => {
    const cfg = input.assumptions.scenarios[key];

    const baseRate = input.applicationsPerDial.value;
    const applicationsPerDial =
      cfg.applicationsPerDialOverride ?? (baseRate === null ? null : baseRate * cfg.applicationsPerDialMultiplier);

    const days = input.remainingWorkingDays;
    let dialsPerDaySource: ScenarioForecast["dialsPerDaySource"] = "none";
    let futureDials: number | null = null;
    if (cfg.dialsPerDayOverride !== undefined && cfg.dialsPerDayOverride !== null) {
      futureDials = cfg.dialsPerDayOverride * days;
      dialsPerDaySource = "override";
    } else if (input.plannedFutureDials !== null) {
      futureDials = input.plannedFutureDials * cfg.dialsPerDayMultiplier;
      dialsPerDaySource = "planned";
    } else if (input.historicalDialsPerDay !== null) {
      futureDials = input.historicalDialsPerDay * cfg.dialsPerDayMultiplier * days;
      dialsPerDaySource = "historical";
    }
    /** average dials per remaining working day (display) */
    const dialsPerDay = futureDials === null ? null : days > 0 ? futureDials / days : 0;
    const additionalApplications =
      futureDials === null || applicationsPerDial === null ? null : futureDials * applicationsPerDial;
    const projectedApplications =
      additionalApplications === null ? null : input.currentApplications + additionalApplications;
    const projectedRevenueCents =
      additionalApplications === null || input.commissionPerApplicationCents === null
        ? null
        : input.currentExpectedCents + estimateCents(input.commissionPerApplicationCents, additionalApplications);
    const goalReached = input.goal === null || projectedApplications === null ? null : projectedApplications >= input.goal;
    const gapToGoal =
      input.goal === null || projectedApplications === null ? null : Math.max(0, input.goal - projectedApplications);

    return {
      key,
      label: cfg.label,
      applicationsPerDial,
      dialsPerDay,
      futureDials,
      additionalApplications,
      projectedApplications,
      projectedRevenueCents,
      goalReached,
      gapToGoal,
      dialsPerDaySource,
    };
  });
}
