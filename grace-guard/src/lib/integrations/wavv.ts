import { IntegrationNotAvailableError, type IntegrationAdapter, type IntegrationStatus } from "./types";

/**
 * WAVV dialer adapter — scaffold only. WAVV commonly runs embedded inside a
 * CRM; whether call-level or aggregate reporting is exposed through a public
 * API (or only via CRM call logs/exports) must be verified first. Until then,
 * use CSV import of WAVV reports on Settings → Data.
 */
export const wavv: IntegrationAdapter = {
  descriptor: {
    id: "wavv",
    name: "WAVV",
    purpose: "Dialer activity: outbound dials, connections, talk time and dialing minutes per day.",
    requiredEnv: ["WAVV_API_KEY"],
    plannedData: ["Outbound dials per day", "Connections (with minimum duration)", "Dialing / talk minutes"],
    verificationChecklist: [
      "Confirm whether WAVV offers a documented reporting API for your account, or only CRM-embedded logs",
      "Confirm how a ‘connection’ is defined and whether the >1 minute filter can be applied",
      "Confirm credentials/permissions and data retention window",
      "Until verified: export WAVV daily reports to CSV and import them",
    ],
  },
  status(): IntegrationStatus {
    return this.descriptor.requiredEnv.every((k) => !!process.env[k]) ? "unverified" : "not_configured";
  },
  async verify() {
    return { ok: false, detail: "Verification not implemented until a WAVV reporting API is confirmed." };
  },
  async pullDailyActivity() {
    throw new IntegrationNotAvailableError("WAVV");
  },
};
