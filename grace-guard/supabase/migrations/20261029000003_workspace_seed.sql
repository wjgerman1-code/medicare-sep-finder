-- Workspace bootstrap: default products, lead sources, the 2026 AEP campaign
-- with its dated aggregate baseline, and a 2027 growth-plan shell.
--
-- The 2026 AEP baseline (as of 2026-10-28) is stored as ONE aggregate row.
-- It is deliberately not split into individual applications or days.

create or replace function public.seed_grace_guard_workspace(p_owner uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mapd uuid;
  v_aep uuid;
  v_schedule uuid;
begin
  if p_owner is null then
    raise exception 'owner required';
  end if;

  insert into public.users (id) values (p_owner) on conflict (id) do nothing;

  -- products (commission assumptions live in commission_assumptions)
  insert into public.products (owner_id, code, name, category, daily_column, sort_order) values
    (p_owner, 'MAPD', 'Medicare Advantage (MAPD)', 'medicare_advantage', 'mapd_apps', 10),
    (p_owner, 'PDP', 'Prescription Drug Plan (PDP)', 'prescription_drug', 'pdp_apps', 20),
    (p_owner, 'MEDSUPP', 'Medicare Supplement', 'medicare_supplement', 'medsupp_apps', 30),
    (p_owner, 'HOSPITAL_INDEMNITY', 'Hospital Indemnity', 'hospital_indemnity', 'hospital_indemnity_apps', 40),
    (p_owner, 'LIFE', 'Life Insurance', 'life', 'life_apps', 50),
    (p_owner, 'ANCILLARY_OTHER', 'Other Ancillary', 'ancillary', 'other_ancillary_apps', 60)
  on conflict (owner_id, code) do nothing;

  insert into public.lead_sources (owner_id, code, name, channel, is_inbound, sort_order) values
    (p_owner, 'WAVV_OUTBOUND', 'WAVV Outbound', 'outbound', false, 10),
    (p_owner, 'LIVE_TRANSFER', 'Live Transfers', 'inbound', true, 20),
    (p_owner, 'PRO_CONNECT', 'Pro Connect', 'inbound', true, 30),
    (p_owner, 'SEMINAR', 'Seminars', 'event', true, 40),
    (p_owner, 'REFERRAL', 'Referrals', 'referral', true, 50),
    (p_owner, 'WEBSITE', 'Website', 'digital', true, 60),
    (p_owner, 'SOCIAL_MEDIA', 'Social Media', 'digital', true, 70),
    (p_owner, 'WEBINAR', 'Webinars', 'event', true, 80)
  on conflict (owner_id, code) do nothing;

  select id into v_mapd from public.products where owner_id = p_owner and code = 'MAPD';

  -- 2026 AEP campaign (sells 2027 plan-year coverage)
  insert into public.campaigns (
    owner_id, name, slug, campaign_type, campaign_year, plan_year,
    start_date, end_date, status, primary_product_id, forecast_assumptions, notes)
  values (
    p_owner, '2026 Medicare AEP', 'aep-2026', 'aep', 2026, 2027,
    date '2026-10-15', date '2026-12-07', 'active', v_mapd,
    jsonb_build_object('scenarios', jsonb_build_object(
      'conservative', jsonb_build_object('label', 'Conservative', 'applicationsPerDialMultiplier', 0.85, 'dialsPerDayMultiplier', 0.85),
      'base',         jsonb_build_object('label', 'Base case',    'applicationsPerDialMultiplier', 1.00, 'dialsPerDayMultiplier', 1.00),
      'aggressive',   jsonb_build_object('label', 'Aggressive',   'applicationsPerDialMultiplier', 1.15, 'dialsPerDayMultiplier', 1.20)
    )),
    'Annual Enrollment Period, Oct 15 - Dec 7, 2026.')
  on conflict (owner_id, slug) do nothing;

  select id into v_aep from public.campaigns where owner_id = p_owner and slug = 'aep-2026';

  insert into public.campaign_goals (owner_id, campaign_id, period_type, period_start, period_end, metric, product_id, target_count, notes)
  values (p_owner, v_aep, 'campaign', date '2026-10-15', date '2026-12-07', 'applications', v_mapd, 100,
          'MAPD application goal for the 2026 AEP')
  on conflict do nothing;

  -- the only commission figure provided: an assumed MAPD average
  insert into public.commission_assumptions (owner_id, product_id, carrier_id, plan_year, enrollment_type, basis, amount_cents, notes)
  values (p_owner, v_mapd, null, 2027, null, 'flat_per_application', 36300,
          'Assumed average revenue per MAPD application (2026 AEP plan). Actual commissions vary by carrier, state and enrollment type - add specific assumptions in Settings.')
  on conflict do nothing;

  insert into public.work_schedules (owner_id, campaign_id, name, working_weekdays)
  values (p_owner, v_aep, 'AEP dialing schedule', '{1,2,3,4,5}')
  on conflict (owner_id, campaign_id) do nothing;

  select id into v_schedule from public.work_schedules where owner_id = p_owner and campaign_id = v_aep;

  insert into public.work_schedule_exceptions (owner_id, schedule_id, exception_date, kind, note)
  values (p_owner, v_schedule, date '2026-11-26', 'holiday', 'Thanksgiving')
  on conflict (schedule_id, exception_date) do nothing;

  -- dated aggregate baseline, exactly as reported on 2026-10-28. Inserted
  -- only once: the overlap trigger fires before ON CONFLICT could skip it.
  insert into public.aggregate_baselines (
    owner_id, campaign_id, label, coverage_start, as_of_date,
    outbound_dials, voice_connections, mapd_apps, hospital_indemnity_apps,
    reported_metrics, source_note)
  select
    p_owner, v_aep, 'AEP launch baseline (Oct 15 - Oct 28, 2026)', date '2026-10-15', date '2026-10-28',
    279, 22, 14, 1,
    jsonb_build_object(
      'voice_connection_definition', 'Voice connections over one minute',
      'mapd_application_goal', 100,
      'contact_rate_pct', 7.89,
      'conversation_to_mapd_application_rate_pct', 63.64,
      'dials_per_mapd_application', 19.93,
      'assumed_mapd_revenue_per_application', 363.00,
      'projected_mapd_revenue', 5082.00,
      'projected_mapd_revenue_at_goal', 36300.00
    ),
    'Aggregate totals reported for Oct 15 - Oct 28, 2026. Not allocated to individual days or applications. Products not listed were not reported (stored as unknown).'
  where not exists (select 1 from public.aggregate_baselines b where b.campaign_id = v_aep);

  -- 2027 agency growth plan shell (goals to be configured by the owner)
  insert into public.campaigns (
    owner_id, name, slug, campaign_type, campaign_year, plan_year,
    start_date, end_date, status, primary_product_id, notes)
  values (
    p_owner, '2027 Agency Growth Plan', 'growth-2027', 'growth', 2027, 2027,
    date '2027-01-01', date '2027-12-31', 'planning', v_mapd,
    'Placeholder for the 2027 growth plan. Add goals and schedules in Settings.')
  on conflict (owner_id, slug) do nothing;

  update public.users set default_campaign_id = coalesce(default_campaign_id, v_aep) where id = p_owner;
end;
$$;

revoke all on function public.seed_grace_guard_workspace(uuid) from public;

-- callable by a signed-in user to (re)initialize their own workspace; idempotent
create or replace function public.initialize_workspace()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  perform public.seed_grace_guard_workspace(auth.uid());
end;
$$;

revoke all on function public.initialize_workspace() from public;
grant execute on function public.initialize_workspace() to authenticated;

-- new auth user -> profile + workspace
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email) values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  perform public.seed_grace_guard_workspace(new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
