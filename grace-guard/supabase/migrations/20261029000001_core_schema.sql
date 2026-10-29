-- Grace & Guard Command Center — core schema
--
-- Conventions
--   * Every business table carries owner_id (the Supabase auth user) and is
--     protected by row-level security (see the rls migration).
--   * Child rows reference parents through composite (id, owner_id) foreign
--     keys, so a row can never point at another user's campaign/product/etc.
--   * Money is stored as integer cents (bigint). Percent-of-premium
--     commission rates are stored as integer basis points (1% = 100 bps).
--   * Activity counts that were not captured are NULL (unknown), which is
--     different from 0 (captured, none). Rates skip unknown denominators.
--   * No beneficiary PHI/PII: no names, DOBs, MBIs, SSNs, medications or
--     health details. Only non-sensitive production identifiers.

-- gen_random_uuid() is built into PostgreSQL 13+ (no extension needed)

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- users (profile row per auth user)
-- ---------------------------------------------------------------------------
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  agency_name text not null default 'Grace & Guard',
  agency_descriptor text not null default 'Life & Health Solutions',
  timezone text not null default 'America/New_York',
  default_campaign_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- reference data: products, carriers, lead sources
-- ---------------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9_]{2,40}$'),
  name text not null check (length(name) between 1 and 120),
  category text not null check (category in (
    'medicare_advantage', 'prescription_drug', 'medicare_supplement',
    'hospital_indemnity', 'life', 'ancillary', 'other')),
  -- Which daily_activity application column this product's aggregate counts
  -- live in. NULL = product is only tracked through detailed applications.
  daily_column text check (daily_column in (
    'mapd_apps', 'pdp_apps', 'medsupp_apps', 'hospital_indemnity_apps',
    'life_apps', 'other_ancillary_apps')),
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, code),
  unique (id, owner_id)
);
-- at most one product per user maps to a given daily column
create unique index products_daily_column_uq on public.products (owner_id, daily_column)
  where daily_column is not null;

create table public.carriers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);
create unique index carriers_owner_name_uq on public.carriers (owner_id, lower(name));

create table public.lead_sources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9_]{2,40}$'),
  name text not null check (length(name) between 1 and 120),
  channel text not null check (channel in ('outbound', 'inbound', 'event', 'referral', 'digital')),
  -- Inbound sources (e.g. live transfers) can produce connections without
  -- outbound dials, so the connections <= dials rule is waived for them.
  is_inbound boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, code),
  unique (id, owner_id)
);

-- ---------------------------------------------------------------------------
-- campaigns & goals
-- ---------------------------------------------------------------------------
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  slug text not null check (slug ~ '^[a-z0-9-]{2,60}$'),
  campaign_type text not null check (campaign_type in ('aep', 'oep', 'sep', 'annual', 'growth', 'other')),
  campaign_year integer not null check (campaign_year between 2000 and 2100),
  -- coverage/plan year sold (2026 AEP sells 2027 plans)
  plan_year integer check (plan_year between 2000 and 2100),
  start_date date not null,
  end_date date not null,
  status text not null default 'active' check (status in ('planning', 'active', 'closed')),
  -- product whose applications drive the headline goal (e.g. MAPD for AEP)
  primary_product_id uuid,
  -- forecast scenario assumptions, validated by the app (see lib/validation)
  forecast_assumptions jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  unique (owner_id, slug),
  unique (id, owner_id),
  foreign key (primary_product_id, owner_id) references public.products (id, owner_id)
    on delete set null (primary_product_id)
);

alter table public.users
  add constraint users_default_campaign_fk foreign key (default_campaign_id, id)
  references public.campaigns (id, owner_id) on delete set null (default_campaign_id);

create table public.campaign_goals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  -- NULL campaign = an agency-wide goal (e.g. annual)
  campaign_id uuid,
  period_type text not null check (period_type in ('annual', 'campaign', 'monthly', 'weekly', 'daily')),
  period_start date not null,
  period_end date not null,
  metric text not null check (metric in (
    'applications', 'outbound_dials', 'voice_connections', 'qualified_conversations',
    'appointments_booked', 'appointments_held', 'referrals',
    'expected_revenue', 'received_revenue')),
  -- NULL product = all products
  product_id uuid,
  -- count targets use target_count, revenue targets use target_cents
  target_count numeric(12, 2) check (target_count >= 0),
  target_cents bigint check (target_cents >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start),
  check (
    (metric in ('expected_revenue', 'received_revenue') and target_cents is not null and target_count is null)
    or (metric not in ('expected_revenue', 'received_revenue') and target_count is not null and target_cents is null)
  ),
  foreign key (campaign_id, owner_id) references public.campaigns (id, owner_id) on delete cascade,
  foreign key (product_id, owner_id) references public.products (id, owner_id) on delete cascade,
  unique nulls not distinct (owner_id, campaign_id, period_type, period_start, metric, product_id)
);

-- product/carrier specific commission assumptions (most specific match wins)
create table public.commission_assumptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  product_id uuid not null,
  carrier_id uuid,
  plan_year integer not null check (plan_year between 2000 and 2100),
  -- e.g. 'new_to_medicare', 'like_plan_change', 'unlike_plan_change'; NULL = any
  enrollment_type text check (enrollment_type ~ '^[a-z_]{2,40}$'),
  basis text not null check (basis in ('flat_per_application', 'percent_of_annual_premium')),
  amount_cents bigint check (amount_cents >= 0),
  rate_bps integer check (rate_bps between 0 and 100000),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (basis = 'flat_per_application' and amount_cents is not null and rate_bps is null)
    or (basis = 'percent_of_annual_premium' and rate_bps is not null and amount_cents is null)
  ),
  foreign key (product_id, owner_id) references public.products (id, owner_id) on delete cascade,
  foreign key (carrier_id, owner_id) references public.carriers (id, owner_id) on delete cascade,
  unique nulls not distinct (owner_id, product_id, carrier_id, plan_year, enrollment_type)
);

-- ---------------------------------------------------------------------------
-- working-day schedules
-- ---------------------------------------------------------------------------
create table public.work_schedules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  campaign_id uuid not null,
  name text not null default 'Default schedule',
  -- ISO-ish weekday numbers, 0 = Sunday ... 6 = Saturday
  working_weekdays smallint[] not null default '{1,2,3,4,5}'
    check (working_weekdays <@ '{0,1,2,3,4,5,6}'::smallint[] and cardinality(working_weekdays) > 0),
  planned_dials_per_day integer check (planned_dials_per_day >= 0),
  planned_hours_per_day numeric(4, 2) check (planned_hours_per_day between 0 and 24),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, campaign_id),
  unique (id, owner_id),
  foreign key (campaign_id, owner_id) references public.campaigns (id, owner_id) on delete cascade
);

create table public.work_schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  schedule_id uuid not null,
  exception_date date not null,
  kind text not null check (kind in ('holiday', 'vacation', 'exclusion', 'extra_workday')),
  note text,
  created_at timestamptz not null default now(),
  unique (schedule_id, exception_date),
  foreign key (schedule_id, owner_id) references public.work_schedules (id, owner_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- import batches (idempotent CSV imports)
-- ---------------------------------------------------------------------------
create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  kind text not null check (kind in ('daily_activity', 'applications', 'commission_transactions', 'expenses')),
  filename text,
  file_sha256 text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  row_count integer not null default 0,
  inserted_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  status text not null default 'completed' check (status in ('completed', 'partial', 'failed')),
  errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  -- the same file can only be imported once per kind
  unique (owner_id, kind, file_sha256),
  unique (id, owner_id)
);

-- ---------------------------------------------------------------------------
-- activity: aggregate baselines and daily activity
-- ---------------------------------------------------------------------------
-- A dated aggregate snapshot covering coverage_start..as_of_date inclusive.
-- It is NOT spread across individual days. Daily rows dated inside a
-- baseline's coverage window are excluded from totals (reconciliation).
create table public.aggregate_baselines (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  campaign_id uuid not null,
  label text not null,
  coverage_start date not null,
  as_of_date date not null,
  outbound_dials integer check (outbound_dials >= 0),
  voice_connections integer check (voice_connections >= 0),
  qualified_conversations integer check (qualified_conversations >= 0),
  appointments_booked integer check (appointments_booked >= 0),
  appointments_held integer check (appointments_held >= 0),
  mapd_apps integer check (mapd_apps >= 0),
  pdp_apps integer check (pdp_apps >= 0),
  medsupp_apps integer check (medsupp_apps >= 0),
  hospital_indemnity_apps integer check (hospital_indemnity_apps >= 0),
  life_apps integer check (life_apps >= 0),
  other_ancillary_apps integer check (other_ancillary_apps >= 0),
  follow_up_calls integer check (follow_up_calls >= 0),
  referrals_generated integer check (referrals_generated >= 0),
  lead_spend_cents bigint check (lead_spend_cents >= 0),
  dialing_minutes integer check (dialing_minutes >= 0),
  -- figures exactly as originally reported, kept for reconciliation display
  reported_metrics jsonb not null default '{}'::jsonb,
  source_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (as_of_date >= coverage_start),
  check (voice_connections is null or outbound_dials is null or voice_connections <= outbound_dials),
  check (qualified_conversations is null or voice_connections is null or qualified_conversations <= voice_connections),
  unique (owner_id, campaign_id, as_of_date),
  foreign key (campaign_id, owner_id) references public.campaigns (id, owner_id) on delete cascade
);

-- baselines of one campaign may not overlap (would double count)
create or replace function public.prevent_baseline_overlap()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from public.aggregate_baselines b
    where b.campaign_id = new.campaign_id
      and b.id <> new.id
      and daterange(b.coverage_start, b.as_of_date, '[]') && daterange(new.coverage_start, new.as_of_date, '[]')
  ) then
    raise exception 'aggregate baseline coverage overlaps an existing baseline for this campaign'
      using errcode = '23P01';
  end if;
  return new;
end;
$$;

create trigger aggregate_baselines_no_overlap
  before insert or update on public.aggregate_baselines
  for each row execute function public.prevent_baseline_overlap();

create table public.daily_activity (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  campaign_id uuid not null,
  activity_date date not null,
  -- NULL = all/mixed sources for the day
  lead_source_id uuid,
  outbound_dials integer not null default 0 check (outbound_dials >= 0),
  voice_connections integer not null default 0 check (voice_connections >= 0),
  qualified_conversations integer not null default 0 check (qualified_conversations >= 0),
  appointments_booked integer not null default 0 check (appointments_booked >= 0),
  appointments_held integer not null default 0 check (appointments_held >= 0),
  mapd_apps integer not null default 0 check (mapd_apps >= 0),
  pdp_apps integer not null default 0 check (pdp_apps >= 0),
  medsupp_apps integer not null default 0 check (medsupp_apps >= 0),
  hospital_indemnity_apps integer not null default 0 check (hospital_indemnity_apps >= 0),
  life_apps integer not null default 0 check (life_apps >= 0),
  other_ancillary_apps integer not null default 0 check (other_ancillary_apps >= 0),
  follow_up_calls integer not null default 0 check (follow_up_calls >= 0),
  referrals_generated integer not null default 0 check (referrals_generated >= 0),
  lead_spend_cents bigint not null default 0 check (lead_spend_cents >= 0),
  dialing_minutes integer not null default 0 check (dialing_minutes between 0 and 1440),
  notes text check (length(notes) <= 2000),
  source text not null default 'manual' check (source in ('manual', 'import', 'integration')),
  import_batch_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- qualified conversations are a subset of voice connections (same population)
  check (qualified_conversations <= voice_connections),
  unique nulls not distinct (owner_id, campaign_id, activity_date, lead_source_id),
  unique (id, owner_id),
  foreign key (campaign_id, owner_id) references public.campaigns (id, owner_id) on delete cascade,
  foreign key (lead_source_id, owner_id) references public.lead_sources (id, owner_id) on delete restrict,
  foreign key (import_batch_id, owner_id) references public.import_batches (id, owner_id)
    on delete set null (import_batch_id)
);
create index daily_activity_campaign_date_idx on public.daily_activity (campaign_id, activity_date);

-- ---------------------------------------------------------------------------
-- lead funnel detail
-- ---------------------------------------------------------------------------
-- Lead acquisition records (a purchase/batch or a single lead). Counts only —
-- no contact details. Lead spend is recorded in daily_activity or expenses.
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  campaign_id uuid,
  lead_source_id uuid not null,
  acquired_date date not null,
  quantity integer not null default 1 check (quantity > 0),
  external_ref text check (length(external_ref) <= 120),
  notes text check (length(notes) <= 1000),
  import_batch_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (campaign_id, owner_id) references public.campaigns (id, owner_id) on delete cascade,
  foreign key (lead_source_id, owner_id) references public.lead_sources (id, owner_id) on delete restrict,
  foreign key (import_batch_id, owner_id) references public.import_batches (id, owner_id)
    on delete set null (import_batch_id)
);
create unique index leads_external_ref_uq on public.leads (owner_id, external_ref) where external_ref is not null;

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  campaign_id uuid not null,
  lead_source_id uuid,
  booked_date date not null,
  scheduled_date date not null,
  status text not null default 'booked' check (status in ('booked', 'held', 'no_show', 'cancelled', 'rescheduled')),
  external_ref text check (length(external_ref) <= 120),
  notes text check (length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (campaign_id, owner_id) references public.campaigns (id, owner_id) on delete cascade,
  foreign key (lead_source_id, owner_id) references public.lead_sources (id, owner_id)
    on delete set null (lead_source_id)
);
create unique index appointments_external_ref_uq on public.appointments (owner_id, external_ref) where external_ref is not null;

-- ---------------------------------------------------------------------------
-- production: applications and commissions
-- ---------------------------------------------------------------------------
-- Optional itemized applications. A detailed record itemizes the aggregate
-- count for its (date, product); see lib/kpi/reconcile.ts for the rule that
-- prevents double counting.
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  campaign_id uuid not null,
  product_id uuid not null,
  carrier_id uuid,
  lead_source_id uuid,
  -- non-sensitive identifier (internal/confirmation ref), never an MBI/SSN
  application_ref text check (length(application_ref) <= 60),
  application_date date not null,
  status text not null default 'written' check (status in (
    'written', 'submitted', 'approved', 'effectuated', 'cancelled', 'charged_back')),
  submitted_date date,
  approved_date date,
  effective_date date,
  cancelled_date date,
  charged_back_date date,
  enrollment_type text check (enrollment_type ~ '^[a-z_]{2,40}$'),
  annual_premium_cents bigint check (annual_premium_cents >= 0),
  expected_commission_cents bigint check (expected_commission_cents >= 0),
  notes text check (length(notes) <= 1000),
  import_batch_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (submitted_date is null or submitted_date >= application_date),
  check (approved_date is null or approved_date >= application_date),
  unique (id, owner_id),
  foreign key (campaign_id, owner_id) references public.campaigns (id, owner_id) on delete cascade,
  foreign key (product_id, owner_id) references public.products (id, owner_id) on delete restrict,
  foreign key (carrier_id, owner_id) references public.carriers (id, owner_id) on delete set null (carrier_id),
  foreign key (lead_source_id, owner_id) references public.lead_sources (id, owner_id)
    on delete set null (lead_source_id),
  foreign key (import_batch_id, owner_id) references public.import_batches (id, owner_id)
    on delete set null (import_batch_id)
);
create unique index applications_ref_uq on public.applications (owner_id, application_ref) where application_ref is not null;
create index applications_campaign_date_idx on public.applications (campaign_id, application_date);

create table public.commission_transactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  campaign_id uuid,
  application_id uuid,
  product_id uuid,
  carrier_id uuid,
  transaction_date date not null,
  -- advance/paid/renewal = cash in; chargeback = cash clawed back (positive
  -- amount, subtracted); adjustment = signed correction
  kind text not null check (kind in ('advance', 'paid', 'renewal', 'chargeback', 'adjustment')),
  amount_cents bigint not null,
  statement_ref text check (length(statement_ref) <= 120),
  -- stable id from a carrier statement line, for idempotent imports
  external_id text check (length(external_id) <= 120),
  notes text check (length(notes) <= 1000),
  import_batch_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind = 'adjustment' or amount_cents > 0),
  foreign key (campaign_id, owner_id) references public.campaigns (id, owner_id) on delete set null (campaign_id),
  foreign key (application_id, owner_id) references public.applications (id, owner_id)
    on delete set null (application_id),
  foreign key (product_id, owner_id) references public.products (id, owner_id) on delete set null (product_id),
  foreign key (carrier_id, owner_id) references public.carriers (id, owner_id) on delete set null (carrier_id),
  foreign key (import_batch_id, owner_id) references public.import_batches (id, owner_id)
    on delete set null (import_batch_id)
);
create unique index commission_transactions_external_uq on public.commission_transactions (owner_id, external_id)
  where external_id is not null;

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  campaign_id uuid,
  expense_date date not null,
  category text not null check (category in ('lead_cost', 'software', 'marketing', 'other_operating')),
  lead_source_id uuid,
  vendor text check (length(vendor) <= 120),
  description text check (length(description) <= 500),
  amount_cents bigint not null check (amount_cents > 0),
  external_id text check (length(external_id) <= 120),
  import_batch_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (campaign_id, owner_id) references public.campaigns (id, owner_id) on delete set null (campaign_id),
  foreign key (lead_source_id, owner_id) references public.lead_sources (id, owner_id)
    on delete set null (lead_source_id),
  foreign key (import_batch_id, owner_id) references public.import_batches (id, owner_id)
    on delete set null (import_batch_id)
);
create unique index expenses_external_uq on public.expenses (owner_id, external_id) where external_id is not null;

-- ---------------------------------------------------------------------------
-- audit log (written only by trigger)
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.users (id) on delete cascade,
  table_name text not null,
  record_id uuid,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  changed_by uuid,
  changed_at timestamptz not null default now(),
  old_data jsonb,
  new_data jsonb
);
create index audit_logs_owner_time_idx on public.audit_logs (owner_id, changed_at desc);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'users', 'products', 'carriers', 'lead_sources', 'campaigns', 'campaign_goals',
    'commission_assumptions', 'work_schedules', 'aggregate_baselines', 'daily_activity',
    'leads', 'appointments', 'applications', 'commission_transactions', 'expenses'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t);
  end loop;
end;
$$;
