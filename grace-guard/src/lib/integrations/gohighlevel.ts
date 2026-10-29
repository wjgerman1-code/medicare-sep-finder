import { IntegrationNotAvailableError, type IntegrationAdapter, type IntegrationStatus } from "./types";

/**
 * GoHighLevel adapter — scaffold only. It deliberately performs no network
 * calls until the endpoints, auth model (OAuth app vs. location API key) and
 * scopes have been confirmed against GoHighLevel's current documentation and
 * your account permissions.
 */
export const goHighLevel: IntegrationAdapter = {
  descriptor: {
    id: "gohighlevel",
    name: "GoHighLevel",
    purpose: "CRM pipeline: leads acquired, appointments booked/held and opportunity stages by lead source.",
    requiredEnv: ["GHL_CLIENT_ID", "GHL_CLIENT_SECRET", "GHL_LOCATION_ID"],
    plannedData: ["Leads acquired by source (counts only)", "Appointments booked / held / no-show", "Opportunity stage counts"],
    verificationChecklist: [
      "Confirm API version and auth model available on your plan (OAuth marketplace app vs. private integration token)",
      "Confirm read scopes for contacts (counts only), calendars/appointments and opportunities",
      "Confirm rate limits and webhook availability",
      "Map GHL lead sources / tags to Grace & Guard lead source codes",
      "Confirm no PHI/PII leaves GHL — pull aggregate counts only",
    ],
  },
  status(): IntegrationStatus {
    const configured = this.descriptor.requiredEnv.every((k) => !!process.env[k]);
    return configured ? "unverified" : "not_configured";
  },
  async verify() {
    return { ok: false, detail: "Verification not implemented until the GoHighLevel API contract is confirmed." };
  },
  async pullDailyActivity() {
    throw new IntegrationNotAvailableError("GoHighLevel");
  },
};
