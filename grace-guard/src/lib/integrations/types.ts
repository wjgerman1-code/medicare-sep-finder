import type { ISODate } from "@/lib/dates";
import type { DailyActivityInput } from "@/lib/validation/schemas";

/**
 * Integration connection lifecycle. Nothing is reported as "connected" until
 * credentials exist AND a verification call against a documented API has
 * succeeded with the required permissions.
 */
export type IntegrationStatus =
  | "not_configured" // no credentials
  | "unverified" // credentials present, never verified
  | "verified" // verification call succeeded
  | "error";

export interface IntegrationDescriptor {
  id: "gohighlevel" | "wavv";
  name: string;
  purpose: string;
  /** environment variables the adapter will read (server-side only) */
  requiredEnv: string[];
  /** data this adapter is intended to provide once verified */
  plannedData: string[];
  /** open questions that must be answered before building the adapter */
  verificationChecklist: string[];
}

export interface DailyActivityPull {
  date: ISODate;
  /** partial daily metrics mapped into the canonical daily_activity shape */
  metrics: Partial<DailyActivityInput>;
  /** stable id from the source system for idempotent upserts */
  externalKey: string;
}

export interface IntegrationAdapter {
  descriptor: IntegrationDescriptor;
  status(): IntegrationStatus;
  /** Calls a documented, read-only endpoint to prove credentials + scopes. */
  verify(): Promise<{ ok: boolean; detail: string }>;
  /** Pulls activity for a date range. Must be idempotent (externalKey). */
  pullDailyActivity(from: ISODate, to: ISODate): Promise<DailyActivityPull[]>;
}

export class IntegrationNotAvailableError extends Error {
  constructor(name: string) {
    super(`${name} integration is not available: credentials, supported API endpoints and permissions have not been verified.`);
    this.name = "IntegrationNotAvailableError";
  }
}
