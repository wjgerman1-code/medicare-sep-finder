import "server-only";
import { goHighLevel } from "./gohighlevel";
import { wavv } from "./wavv";
import type { IntegrationAdapter } from "./types";

export const INTEGRATIONS: IntegrationAdapter[] = [goHighLevel, wavv];
export * from "./types";
