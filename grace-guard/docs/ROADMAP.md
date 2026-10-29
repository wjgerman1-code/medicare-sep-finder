# Phase 2 roadmap

The MVP covers login, daily entry, persistence and immediate campaign progress. Phase 2 builds on
the same schema and KPI engine. Suggested order, with the reasoning for each step:

## 2.1 CRM & dialer integrations (weeks 1–4)

Goal: stop double entry. Daily numbers flow in automatically; manual entry becomes the exception.

1. **Verification spike (before any code).** For GoHighLevel and WAVV, confirm against current
   vendor docs *and your account*: auth model, read endpoints, scopes, rate limits, webhooks, and
   whether reporting is available via API or only via CRM call logs/exports. Record results in the
   adapter's `verificationChecklist`.
2. **Server-side credential storage.** Encrypted per-user secrets (Supabase Vault) and an
   `integration_connections` table (status, last verified, last sync, error).
3. **WAVV → daily_activity.** Pull dials, connections (applying the >1 minute rule if the data
   allows) and dialing minutes per day; upsert by `(campaign, date, lead_source)` with
   `source = 'integration'` and an external key, so re-syncs are idempotent.
4. **GoHighLevel → leads & appointments.** Aggregate counts only (no contact PII): leads by
   source/tag, appointments booked/held/no-show, opportunity stage counts.
5. **Scheduled sync** via Supabase cron / Edge Function, plus a manual “Sync now” button and a
   reconciliation view showing manual vs synced numbers by day before you accept them.

## 2.2 Advanced forecasting (weeks 4–6)

* Rolling-window rates (last 5/10 working days) next to campaign-to-date, so the forecast reacts
  to trend changes.
* Confidence ranges from day-to-day variance instead of fixed multipliers (e.g. simple bootstrap
  over logged days).
* Seasonality curve for AEP (early-October surge, Thanksgiving dip, final-week push) learned from
  the 2026 campaign and applied to 2027.
* Product-mix forecasting (MAPD vs PDP vs ancillary attach rates) and revenue by carrier using
  carrier-specific assumptions.
* What-if planner: “If I add 2 Saturdays and dial 80/day, where do I land?”

## 2.3 Multi-agent reporting (weeks 6–9)

* `agencies` and `agency_members` (roles: owner, manager, agent) with RLS widened from
  `owner_id = auth.uid()` to “is a member of this agency with sufficient role”.
* Each agent keeps private daily entry; managers see roll-ups and leaderboards.
* Team goals that decompose into per-agent targets; per-agent pacing and coaching flags.
* Contracting/hierarchy fields for override commissions (still no beneficiary data).

## 2.4 Automated weekly performance summaries (weeks 9–10)

* Weekly snapshot table written by a scheduled job (frozen KPIs per campaign/week), which also
  makes week-over-week comparisons fast.
* Email (Resend/Postmark) or Slack summary every Monday: goal progress, pace status, top lead
  source by ROAS, biggest conversion change, and the top 3 recommended actions — generated from
  the same deterministic rules shown on the dashboard.
* Optional AI-written narrative on top of the deterministic numbers, clearly labelled, never
  replacing the source figures.

## Also worth doing

* PWA install + offline-tolerant daily entry for phone use between calls.
* Two-factor authentication (Supabase MFA) for the owner account.
* Per-carrier commission statement import mappings (each carrier's CSV layout).
* Retention / persistency tracking for effectuated policies and chargeback risk windows.
