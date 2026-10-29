-- AEP Master Performance Strategy & Milestone Tracking Report (Oct 2026)
--
-- Adds weekly dialing sessions (dial blocks with dial targets, and
-- do-not-dial blocks) to work schedules, and the report's campaign goals:
-- 1,993 outbound dials, 157 voice connections and a $36,300 revenue target
-- (the 100 MAPD application goal already exists). The report's
-- "remaining horizon" figures (1,714 / 135 / 86 / $31,218) are derived live
-- from these goals minus actuals, so they are not stored.

create table public.dialing_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  schedule_id uuid not null,
  -- 0 = Sunday ... 6 = Saturday
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  kind text not null check (kind in ('dial', 'do_not_dial')),
  label text not null check (length(label) between 1 and 80),
  -- gross dials targeted in this session (dial sessions only)
  target_dials integer check (target_dials between 0 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time),
  check (kind = 'dial' or target_dials is null),
  unique (schedule_id, weekday, start_time),
  foreign key (schedule_id, owner_id) references public.work_schedules (id, owner_id) on delete cascade
);

alter table public.dialing_sessions enable row level security;
alter table public.dialing_sessions force row level security;
create policy dialing_sessions_owner_all on public.dialing_sessions
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.dialing_sessions to authenticated;

create trigger dialing_sessions_set_updated_at before update on public.dialing_sessions
  for each row execute function public.set_updated_at();
create trigger dialing_sessions_audit after insert or update or delete on public.dialing_sessions
  for each row execute function public.write_audit_log();

-- ---------------------------------------------------------------------------
-- report targets (idempotent; safe to run repeatedly)
-- ---------------------------------------------------------------------------
create or replace function public.seed_aep_2026_report_targets(p_owner uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_aep uuid;
  v_schedule uuid;
  d smallint;
begin
  select id into v_aep from public.campaigns where owner_id = p_owner and slug = 'aep-2026';
  if v_aep is null then
    return;
  end if;

  insert into public.campaign_goals (owner_id, campaign_id, period_type, period_start, period_end, metric, product_id, target_count, target_cents, notes)
  values
    (p_owner, v_aep, 'campaign', date '2026-10-15', date '2026-12-07', 'outbound_dials', null, 1993, null,
     'AEP milestone report: gross outbound dials goal (100 apps x 19.93 dials per sale)'),
    (p_owner, v_aep, 'campaign', date '2026-10-15', date '2026-12-07', 'voice_connections', null, 157, null,
     'AEP milestone report: voice connections (>1 min) goal at a 7.89% contact rate'),
    (p_owner, v_aep, 'campaign', date '2026-10-15', date '2026-12-07', 'expected_revenue', null, null, 3630000,
     'AEP milestone report: total projected revenue target (100 MAPD x $363)')
  on conflict do nothing;

  select id into v_schedule from public.work_schedules where owner_id = p_owner and campaign_id = v_aep;
  if v_schedule is null or exists (select 1 from public.dialing_sessions s where s.schedule_id = v_schedule) then
    return;
  end if;

  -- Monday - Thursday
  foreach d in array array[1, 2, 3, 4]::smallint[] loop
    insert into public.dialing_sessions (owner_id, schedule_id, weekday, start_time, end_time, kind, label, target_dials) values
      (p_owner, v_schedule, d, time '15:40', time '16:20', 'do_not_dial', 'Commute / transit block (compliance safeguard)', null),
      (p_owner, v_schedule, d, time '16:30', time '18:30', 'dial', 'Outbound dialer session', 60);
  end loop;

  -- Friday
  insert into public.dialing_sessions (owner_id, schedule_id, weekday, start_time, end_time, kind, label, target_dials) values
    (p_owner, v_schedule, 5, time '06:00', time '10:00', 'do_not_dial', 'Standard job shift', null),
    (p_owner, v_schedule, 5, time '10:30', time '13:00', 'dial', 'Late morning velocity block', 75);
end;
$$;

revoke all on function public.seed_aep_2026_report_targets(uuid) from public;

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
  perform public.seed_aep_2026_report_targets(auth.uid());
end;
$$;

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
  perform public.seed_aep_2026_report_targets(new.id);
  return new;
end;
$$;

-- backfill existing workspaces
select public.seed_aep_2026_report_targets(id) from public.users;
