# Medicare SEP Finder

Agent decision-support tool for Medicare Special Enrollment Periods: it checks
disaster/emergency SEPs for a client's location first, then automatically
screens client-specific election periods, and assembles prioritized results
with a deterministic rule engine (no model inference). It does not make an
official CMS or plan eligibility determination.

## Run it

Open `index.html` in a browser — no build step, no dependencies. On phones it
renders full-screen; on desktop it renders in a device-frame preview. The only
remote assets are the Barlow fonts and the live data APIs.

## Architecture

- `sep-core.js` — all business logic, shared by the app and the tests:
  date utilities (UTC-pinned ISO math), the SEP rule registry, the disaster
  qualification evaluator, the conditional screening questionnaire, FEMA
  event filtering, and result assembly (`computeResults`).
- `index.html` — state, live data fetching, and rendering only.
- `tests/core.test.js` — `npm test` (node --test): 30 tests covering date
  edge cases (leap years, month/year boundaries), expired/stale/active
  disaster events, qualification outcomes, and rule-engine results.

## Core workflow

1. **ZIP (required), county (optional, suggested)** → city/state
   (Zippopotam), county + FIPS (FCC Census Area API, skipped when the agent
   confirms a suggested county).
2. **Disaster check first** — FEMA OpenFEMA v2 declarations for the county
   (last 30 months). Expired windows are dropped; never-closed incident
   periods older than six months are flagged "verify", not shown as usable.
3. **Geographic hit ≠ eligibility** — a four-question CMS qualification
   check follows. "Not sure" routes to *May apply — more information
   needed*, never to *Not available*.
4. **Automatic fallback** — no disaster SEP, a failed qualification, or a
   verification-flagged one continues automatically (with a brief, labeled
   transition) into the client SEP screening. No dead ends, no restart.
5. **Prioritized results** — Primary/available options with calendar-date
   election windows and possible effective dates, "may apply" items with
   what to verify, "not available" with reasons, and an explicit "not
   screened yet" card when questions were skipped. Every card has a
   "Why does this apply?" sheet tracing inputs → stored rule → window math.

## Accuracy and fail-safety

- The rule engine never fabricates: missing inputs (e.g. a move date) put a
  rule in "more information needed" rather than inventing a window; skipped
  questions surface as "not screened" rather than silently absent.
- If the ZIP directory, county resolution, or FEMA cannot deliver an answer,
  the app says so explicitly and states that **no disaster SEP determination
  was made** — it never converts an outage into "no disaster SEP".
- No CMS election/reason code is stored for any rule in this build; the UI
  always shows "Reason code requires verification".
- Rule and source metadata (version, last checked, last verified) live in
  `sep-core.js` and are visible in-app (dashboard → SEP Library / Sources,
  including a live reachability check). Rule changes require editing that
  registry in a reviewed change — nothing updates rule logic silently.

## Data privacy

Only the ZIP, resolved place, timestamp, and result count of a search are
stored (locally, for the recent-searches list). No beneficiary identifiers,
health, or financial data are collected.

## Design-time props

- `?hero=field|plate|timeline` — primary SEP card variant (default `field`)
- `?mode=live|demoDisaster|demoNone` — data source (default `live`; demo
  modes replay a fixed Travis County, TX scenario)

## Known limitations

- Client-side only: no accounts, no server, no admin approval queue. CMS
  guidance changes are detected by a human updating the registry, not by
  automated document monitoring.
- FEMA covers federal declarations only; state/local emergencies must be
  checked separately (the app says so on the relevant screens).
- Windows are computed for the disaster and move SEPs; other SEPs report
  what must be verified before a window can be stated.

## Source

Implements the Claude Design project `9d96d395-fc91-4026-8020-316a6affac93`
(`Medicare SEP Finder.dc.html`, Industry design system + iOS 26 frame).
