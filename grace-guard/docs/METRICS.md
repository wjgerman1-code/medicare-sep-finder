# Metric definitions

Every number in the Command Center, how it is calculated, and where the data comes from.
The same dictionary is rendered in the app at **Metric Dictionary** (`src/lib/kpi/definitions.ts`).

## Ground rules

* **Activity sources** = `aggregate_baselines` + `daily_activity`. A daily row dated inside a
  baseline's coverage window is excluded (and rejected on save) because the baseline already
  counts that activity.
* **Weighted rates.** A rate over many days is `Σ numerator ÷ Σ denominator`, never the average of
  daily percentages. Only entries where *both* values were captured are included, so populations
  stay comparable (e.g. the Oct 28 baseline has no qualified-conversation count, so it is left out
  of rates that use qualified conversations).
* **Missing data.** NULL means “not captured” and is shown as “—”. A zero denominator also yields “—”.
* **Date filters.** A baseline is included only when its whole window is inside the selected range.
  It is never pro-rated by day.
* **Money** is integer cents; % commissions are basis points (1% = 100 bps), rounded half-up.

## 2026 AEP baseline (as of Oct 28, 2026)

| Figure | Stored / derived | Value |
|---|---|---|
| Outbound dials | stored | 279 |
| Voice connections (>1 min) | stored | 22 |
| MAPD applications | stored | 14 |
| Hospital indemnity applications | stored | 1 |
| MAPD goal | `campaign_goals` | 100 |
| Assumed MAPD revenue / app | `commission_assumptions` (plan year 2027) | $363.00 |
| Contact rate | 22 ÷ 279 | 7.89% |
| Conversation → MAPD rate | 14 ÷ 22 | 63.64% |
| Dials per MAPD app | 279 ÷ 14 | 19.93 |
| Expected MAPD revenue | 14 × $363 | $5,082 |
| Revenue at goal | 100 × $363 | $36,300 |

The originally reported percentages are also kept in `aggregate_baselines.reported_metrics`, and
Settings → Baseline shows computed vs reported side by side. `tests/kpi.baseline.test.ts` asserts
they match.

## Activity & conversion

| Metric | Formula | Numerator | Denominator |
|---|---|---|---|
| Contact rate | connections ÷ dials | Voice connections | Outbound dials |
| Conversation close rate (MAPD) | MAPD apps ÷ connections | MAPD applications | Voice connections |
| Dials per MAPD application | dials ÷ MAPD apps | Outbound dials | MAPD applications |
| Qualified rate | qualified ÷ connections | Qualified conversations | Voice connections |
| Applications written | Σ over buckets of max(aggregate, itemized) | — | — |

*Conversation close rate is meaningful only when the applications came from those conversations;
inbound or referral applications inflate it. The dashboard notes this.*

## Goals & pacing

| Metric | Formula |
|---|---|
| Goal completion | actual applications ÷ goal applications |
| Remaining applications | max(0, goal − actual) |
| Working days | schedule weekdays − holidays/vacation/exclusions + extra workdays (default Mon–Fri) |
| Elapsed working days | working days from campaign start through yesterday (through today once today is logged) |
| Remaining working days | working days from today (tomorrow if today is logged) through campaign end |
| Required applications / day | remaining applications ÷ remaining working days |
| Required dials | ⌈remaining applications × historical dials per application⌉ |
| Required dials / day | required dials ÷ remaining working days |
| Expected by now | goal × elapsed working days ÷ total working days |
| Pace status | ahead if actual ≥ expected × 1.05; behind if actual < expected × 0.95; otherwise on pace |
| Current pace | actual ÷ elapsed working days |
| Expected finish *(estimate)* | first working day on which actual + pace × n ≥ goal |

## Forecast *(estimates)*

`projected applications = current applications + planned future dials × assumed applications per dial`

* applications per dial = historical (apps ÷ dials) × scenario multiplier (or an override)
* dials per day = scenario override → schedule `planned_dials_per_day` × multiplier → historical
  dials per working day × multiplier
* future dials = dials per day × remaining working days
* defaults: Conservative 0.85×/0.85×, Base 1×/1×, Aggressive 1.15×/1.2× (editable on Goals)
* projected revenue = current expected commission + additional applications × commission assumption

## Revenue & profitability

| Metric | Definition |
|---|---|
| Expected commission *(estimate)* | non-itemized applications × product assumption + Σ itemized (explicit expected commission, else assumption); cancelled/charged-back excluded |
| Submitted / Approved / Earned *(estimate)* | Σ expected commission of itemized apps in status submitted+ / approved+ / effectuated |
| Paid | Σ advance + paid + renewal + adjustment transactions |
| Chargebacks | Σ chargeback transactions (entered positive, subtracted) |
| Net received | paid − chargebacks |
| Lead costs | daily `lead_spend` + expenses in category `lead_cost` |
| Net cash contribution | net received − (lead + software + marketing + other operating expenses) |
| Annualized premium | Σ annual premium on active itemized applications — **not revenue** |

Commission assumptions resolve most-specific first: product + carrier + enrollment type → product +
carrier → product + enrollment type → product default, for the campaign's plan year (falling back
to the latest earlier plan year).

## Lead funnel (per lead source)

| Metric | Numerator | Denominator |
|---|---|---|
| Contact rate | Voice connections | Outbound dials |
| Appointment booking rate | Appointments booked | Qualified conversations |
| Appointment show rate | Appointments held | Appointments booked |
| Application close rate | Applications written | Voice connections |
| Cost per lead | Lead spend | Leads acquired (`leads.quantity`) |
| Cost per appointment | Lead spend | Appointments booked |
| Cost per application | Lead spend | Applications written |
| Revenue per lead | Net commission received (linked applications) | Leads acquired |
| Return on ad spend | Net commission received | Lead spend |

The baseline carries no lead source and appears under “Unattributed / mixed”.
