/**
 * Metric dictionary: every number on the dashboard, its numerator,
 * denominator, data source and calculation. Rendered on the Metrics page and
 * mirrored in docs/METRICS.md.
 */
export interface MetricDefinition {
  id: string;
  label: string;
  group: "Activity" | "Conversion" | "Goals & pacing" | "Forecast" | "Revenue" | "Lead funnel";
  formula: string;
  numerator?: string;
  denominator?: string;
  source: string;
  notes?: string;
  estimate?: boolean;
}

const ACTIVITY = "aggregate_baselines + daily_activity (daily rows inside a baseline window are excluded)";

export const METRICS: MetricDefinition[] = [
  { id: "outbound_dials", label: "Outbound dials", group: "Activity", formula: "Σ outbound_dials", source: ACTIVITY },
  { id: "voice_connections", label: "Voice connections", group: "Activity", formula: "Σ voice_connections", source: ACTIVITY, notes: "2026 AEP baseline defines a connection as a voice conversation over one minute." },
  { id: "applications", label: "Applications written", group: "Activity", formula: "Σ over buckets of max(aggregate count, detailed records)", source: `${ACTIVITY}; applications`, notes: "A bucket is one baseline window or one calendar day. Detailed records itemize the aggregate and are never added on top of it. Includes applications later cancelled; see Production for net counts." },
  { id: "contact_rate", label: "Contact rate", group: "Conversion", formula: "voice connections ÷ outbound dials", numerator: "Voice connections", denominator: "Outbound dials", source: ACTIVITY, notes: "Weighted from raw totals, only over entries where both values were captured." },
  { id: "conversation_close_rate", label: "Conversation close rate (MAPD)", group: "Conversion", formula: "MAPD applications ÷ voice connections", numerator: "MAPD applications", denominator: "Voice connections", source: ACTIVITY, notes: "Comparable only when applications come from those conversations; inbound/referral applications inflate it." },
  { id: "dials_per_application", label: "Dials per MAPD application", group: "Conversion", formula: "outbound dials ÷ MAPD applications", numerator: "Outbound dials", denominator: "MAPD applications", source: ACTIVITY },
  { id: "goal_completion", label: "Goal completion", group: "Goals & pacing", formula: "actual applications ÷ goal applications", numerator: "Applications written (goal product)", denominator: "Campaign goal (campaign_goals)", source: "campaign_goals + applications written" },
  { id: "remaining_applications", label: "Remaining applications", group: "Goals & pacing", formula: "max(0, goal − actual)", source: "campaign_goals + applications written" },
  { id: "remaining_working_days", label: "Remaining working days", group: "Goals & pacing", formula: "working days from today (or tomorrow if today is logged) through campaign end", source: "work_schedules + work_schedule_exceptions (default Mon–Fri)" },
  { id: "required_daily_applications", label: "Required applications per day", group: "Goals & pacing", formula: "remaining applications ÷ remaining working days", numerator: "Remaining applications", denominator: "Remaining working days", source: "derived" },
  { id: "required_dials", label: "Required dials", group: "Goals & pacing", formula: "remaining applications × historical dials per application", source: "derived", estimate: true },
  { id: "required_dials_per_day", label: "Required dials per day", group: "Goals & pacing", formula: "required dials ÷ remaining working days", source: "derived", estimate: true },
  { id: "expected_by_now", label: "Expected by now (pace line)", group: "Goals & pacing", formula: "goal × elapsed working days ÷ total working days", source: "derived", notes: "Ahead / behind when actual is more than 5% above / below this line." },
  { id: "expected_finish", label: "Expected campaign finish", group: "Goals & pacing", formula: "working day when actual + (actual ÷ elapsed working days) × n ≥ goal", source: "derived", estimate: true },
  { id: "projected_applications", label: "Projected applications", group: "Forecast", formula: "current applications + planned future dials × assumed applications per dial", source: "campaigns.forecast_assumptions; dialing_sessions targets over the remaining working days (else work_schedules.planned_dials_per_day, else historical dials per working day)", estimate: true, notes: "Conservative / base / aggressive apply configurable multipliers or overrides." },
  { id: "projected_revenue", label: "Projected revenue", group: "Forecast", formula: "current expected commission + additional forecast applications × commission assumption", source: "commission_assumptions", estimate: true },
  { id: "expected_commission", label: "Expected commission", group: "Revenue", formula: "non-itemized applications × product assumption + Σ detailed (explicit expected commission, else assumption)", source: "applications; commission_assumptions", estimate: true, notes: "Cancelled and charged-back detailed applications are excluded. Products without an assumption are reported as unknown, never as $0." },
  { id: "submitted_commission", label: "Submitted commission", group: "Revenue", formula: "Σ expected commission of detailed applications submitted, approved or effectuated", source: "applications", estimate: true },
  { id: "approved_commission", label: "Approved commission", group: "Revenue", formula: "Σ expected commission of detailed applications approved or effectuated", source: "applications", estimate: true },
  { id: "earned_commission", label: "Earned commission", group: "Revenue", formula: "Σ expected commission of effectuated applications", source: "applications", estimate: true },
  { id: "paid_commission", label: "Paid commission (received)", group: "Revenue", formula: "Σ advance + paid + renewal + adjustment transactions", source: "commission_transactions" },
  { id: "chargebacks", label: "Chargebacks", group: "Revenue", formula: "Σ chargeback transactions", source: "commission_transactions" },
  { id: "annualized_premium", label: "Annualized premium", group: "Revenue", formula: "Σ annual premium on active detailed applications", source: "applications", notes: "Premium is not revenue; shown separately from commissions." },
  { id: "net_cash_contribution", label: "Net cash contribution", group: "Revenue", formula: "(paid − chargebacks) − (lead costs + software + marketing + other operating)", source: "commission_transactions; expenses; daily_activity.lead_spend_cents" },
  { id: "booking_rate", label: "Appointment booking rate", group: "Lead funnel", formula: "appointments booked ÷ qualified conversations", numerator: "Appointments booked", denominator: "Qualified conversations", source: ACTIVITY },
  { id: "show_rate", label: "Appointment show rate", group: "Lead funnel", formula: "appointments held ÷ appointments booked", numerator: "Appointments held", denominator: "Appointments booked", source: ACTIVITY, notes: "Held appointments may have been booked on earlier days; read over multi-day ranges." },
  { id: "close_rate", label: "Application close rate", group: "Lead funnel", formula: "applications written ÷ voice connections", numerator: "Applications (all products)", denominator: "Voice connections", source: ACTIVITY },
  { id: "cost_per_lead", label: "Cost per lead", group: "Lead funnel", formula: "lead spend ÷ leads acquired", numerator: "Lead spend", denominator: "Leads acquired (leads.quantity)", source: "daily_activity.lead_spend_cents + expenses(lead_cost); leads" },
  { id: "cost_per_appointment", label: "Cost per appointment", group: "Lead funnel", formula: "lead spend ÷ appointments booked", source: "as above" },
  { id: "cost_per_application", label: "Cost per application", group: "Lead funnel", formula: "lead spend ÷ applications written", source: "as above" },
  { id: "revenue_per_lead", label: "Revenue per lead", group: "Lead funnel", formula: "commission received ÷ leads acquired", source: "commission_transactions linked to applications from the source; leads" },
  { id: "roas", label: "Return on ad spend", group: "Lead funnel", formula: "commission received ÷ lead spend", numerator: "Net commission received", denominator: "Lead spend", source: "commission_transactions; lead spend" },
];
