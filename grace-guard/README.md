# Grace & Guard — Performance Command Center

Private insurance-agency performance tracking for **Grace & Guard — Life & Health Solutions**.
Log daily production numbers and immediately see goal progress, conversion, required activity,
revenue (expected vs. received), lead-source performance, pacing and next best actions.

The first campaign is the **2026 Medicare AEP** (Oct 15 – Dec 7, 2026), seeded with the dated
aggregate baseline reported on Oct 28, 2026. The schema supports any number of campaigns,
products and years, so the 2027 agency growth plan is already set up as a campaign shell.

| | |
|---|---|
| Framework | Next.js 15 (App Router) · TypeScript · React 19 |
| UI | Tailwind CSS v4 · shadcn/ui components (`src/components/ui`) · Recharts |
| Data & auth | Supabase Postgres + Supabase Auth, row-level security on every table |
| Validation | Zod (shared by the browser form and the server) |
| Money | Integer cents end to end; basis points for % commissions |
| Tests | Vitest — KPI engine, aggregation, validation, CSV, and RLS/access control against a real Postgres engine (PGlite) |

---

## How the pieces fit together

```
Browser form ──► Server Action (Zod validation) ──► Supabase (RLS: owner_id = auth.uid())
                                                          │
Dashboard page ◄── KPI engine (pure TypeScript) ◄─────────┘
                   src/lib/kpi/*  — reconcile → totals → rates → pacing → forecast → recommendations
```

* **`supabase/migrations/`** — schema, constraints, RLS, audit triggers and the workspace seed.
* **`src/lib/kpi/`** — every calculation, framework-free and unit-tested. `snapshot.ts` assembles
  everything a page needs; `definitions.ts` is the metric dictionary shown in the app.
* **`src/lib/actions/`** — server actions for saving/editing/deleting and CSV import.
* **`src/app/(app)/`** — the dashboard pages; **`src/app/api/export/[kind]`** — CSV exports.
* **`src/lib/integrations/`** — GoHighLevel and WAVV adapter scaffolds (inactive, see below).

### Rules that keep the numbers honest

1. **The Oct 28 baseline is one dated aggregate row** (`aggregate_baselines`). It is never split
   into days or fake application records. Charts show it as a single point on Oct 28.
2. **No double counting.** Daily entries dated inside a baseline window are rejected on save and
   excluded from totals. Itemized applications *describe* the daily count for their day:
   `counted = max(aggregate, itemized)` per day (or baseline window) and product.
3. **Rates use raw numerators and denominators** summed across entries — daily percentages are
   never averaged — and only over entries where both values were captured. Zero or missing
   denominators show “—”.
4. **Unknown ≠ zero.** Fields the baseline didn't report (e.g. qualified conversations) are stored
   as NULL. Products without a commission assumption show revenue as *unpriced*, never $0.
5. **Estimates are labelled.** Forecasts, projected revenue, expected finish and required dials
   carry a dashed “Forecast/Estimate” style everywhere.

See [`docs/METRICS.md`](docs/METRICS.md) for every formula.

---

## Local development

**Prerequisites:** Node.js 20+ (22 recommended), and either the
[Supabase CLI](https://supabase.com/docs/guides/cli) with Docker (local stack) **or** a free
Supabase cloud project.

```bash
cd grace-guard
npm install
cp .env.example .env.local
```

### Option A — local Supabase (Docker)

```bash
npx supabase start          # starts Postgres, Auth, REST and Studio; applies supabase/migrations
npx supabase status         # copy "API URL" and "anon key" into .env.local
```

Open Studio at http://127.0.0.1:54323 → **Authentication → Add user** → enter your email and a
password (tick *Auto confirm*). Creating the user automatically builds your workspace: products,
lead sources, the 2026 AEP campaign, its MAPD goal of 100, the $363 MAPD assumption, the Mon–Fri
schedule (Thanksgiving excluded) and the Oct 28 baseline.

### Option B — Supabase cloud project

1. Create a project at https://supabase.com (choose a US region).
2. **Project Settings → API**: copy the Project URL and the `anon` public key into `.env.local`.
3. Apply the migrations — either link the CLI (`npx supabase link --project-ref <ref>` then
   `npx supabase db push`) or paste each file in `supabase/migrations/` (in order) into the
   **SQL Editor**.
4. **Authentication → Providers → Email**: turn **off** “Allow new users to sign up” (private app).
5. **Authentication → Users → Add user** to create your login.

### Run

```bash
npm run dev        # http://localhost:3000
npm test           # 78 tests: calculations, aggregation, validation, CSV, access control
npm run typecheck
npm run lint
npm run build
```

### Logo

The app never draws or approximates the GG monogram. Put your official logo in `public/brand/`
and set `NEXT_PUBLIC_BRAND_LOGO_URL=/brand/logo.svg` (details in `public/brand/README.md`).
Without it, a text wordmark is shown.

---

## Deploying to Vercel

1. Push this repository to GitHub.
2. In Vercel: **Add New → Project → Import** the repo, and set **Root Directory** to `grace-guard`.
   Framework preset: Next.js (auto-detected).
3. **Environment Variables** (Production + Preview):
   * `NEXT_PUBLIC_SUPABASE_URL`
   * `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   * `ALLOWED_EMAILS` — optional comma-separated allowlist (recommended: just your email)
   * `NEXT_PUBLIC_BRAND_LOGO_URL` — optional
4. Deploy. Then in Supabase **Authentication → URL Configuration** set *Site URL* to your Vercel
   domain and add `https://<your-domain>/auth/callback` to *Redirect URLs* (used by email
   sign-in links).

Vercel serves everything over HTTPS; the app also sends HSTS, frame-deny and no-sniff headers
(`next.config.ts`). The Supabase **service-role key is never used** by this app — all access goes
through the signed-in user's session, so row-level security always applies.

---

## Security & data handling

* Supabase Auth (email + password, or one-time email link); public sign-up is disabled and an
  optional `ALLOWED_EMAILS` allowlist is enforced in middleware and at sign-in.
* Row-level security on every table: `owner_id = auth.uid()`. Child rows use composite foreign
  keys `(id, owner_id)`, so a row can never reference another user's campaign or product.
* Every insert/update/delete is recorded in `audit_logs` by a trigger; users can read but not
  write their own audit history.
* **No beneficiary data.** No names, DOBs, Medicare numbers, SSNs, medications or health details.
  Application references that look like an SSN or MBI are rejected by validation. Notes fields
  are labelled “no client names or health information”.
* Credentials live only in environment variables (`.env.local` is git-ignored).

---

## CSV import / export

**Settings → Import / export.** Imports are idempotent:

* the same file (SHA-256) can only be imported once per type (`import_batches`);
* rows match on a natural key — daily activity: date + lead source code; applications:
  `application_ref`; commission transactions / expenses: `external_id` (derived from the row
  content when absent) — so re-imports update instead of duplicating;
* every row is validated with the same Zod rules as the forms; bad rows are skipped and reported.

Exports: summary KPIs, daily activity, applications, commission transactions, expenses and the
lead funnel, each respecting the current campaign/date/product filters.

---

## Integrations (GoHighLevel, WAVV)

`src/lib/integrations/` defines an adapter interface (`verify()`, idempotent
`pullDailyActivity()`) with scaffolds for GoHighLevel and WAVV. **Neither integration is active.**
They make no network calls and the Settings page says so. Each adapter lists the verification
checklist (auth model, endpoints, scopes, PHI boundaries) that must be confirmed before it is
implemented. Until then, import CSV exports from those tools.

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for Phase 2.
