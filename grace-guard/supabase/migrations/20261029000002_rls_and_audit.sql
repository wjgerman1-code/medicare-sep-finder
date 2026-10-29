-- Row-level security and audit logging
--
-- Every table is locked down: the only access path for the browser/server
-- (anon key + user JWT) is "rows you own". The service role key is never
-- used by the app.

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.users enable row level security;

create policy users_select_own on public.users
  for select to authenticated using (id = (select auth.uid()));
create policy users_insert_own on public.users
  for insert to authenticated with check (id = (select auth.uid()));
create policy users_update_own on public.users
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

do $$
declare
  t text;
begin
  foreach t in array array[
    'products', 'carriers', 'lead_sources', 'campaigns', 'campaign_goals',
    'commission_assumptions', 'work_schedules', 'work_schedule_exceptions',
    'import_batches', 'aggregate_baselines', 'daily_activity', 'leads',
    'appointments', 'applications', 'commission_transactions', 'expenses'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (owner_id = (select auth.uid()))
         with check (owner_id = (select auth.uid()))',
      t || '_owner_all', t);
  end loop;
end;
$$;

-- audit log: owners may read their history; nobody may write directly
alter table public.audit_logs enable row level security;
alter table public.audit_logs force row level security;
create policy audit_logs_select_own on public.audit_logs
  for select to authenticated using (owner_id = (select auth.uid()));

-- belt and braces: anonymous role gets nothing
revoke all on all tables in schema public from anon;

grant select, insert, update, delete on
  public.users, public.products, public.carriers, public.lead_sources, public.campaigns,
  public.campaign_goals, public.commission_assumptions, public.work_schedules,
  public.work_schedule_exceptions, public.import_batches, public.aggregate_baselines,
  public.daily_activity, public.leads, public.appointments, public.applications,
  public.commission_transactions, public.expenses
  to authenticated;
grant select on public.audit_logs to authenticated;
revoke insert, update, delete on public.audit_logs from authenticated;

-- ---------------------------------------------------------------------------
-- audit trigger
-- ---------------------------------------------------------------------------
create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_record uuid;
begin
  if tg_op = 'DELETE' then
    v_owner := old.owner_id;
    v_record := old.id;
  else
    v_owner := new.owner_id;
    v_record := new.id;
  end if;

  -- skip rows removed by an account deletion cascade
  if not exists (select 1 from public.users u where u.id = v_owner) then
    return null;
  end if;

  insert into public.audit_logs (owner_id, table_name, record_id, action, changed_by, old_data, new_data)
  values (
    v_owner,
    tg_table_name,
    v_record,
    tg_op,
    auth.uid(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'products', 'carriers', 'lead_sources', 'campaigns', 'campaign_goals',
    'commission_assumptions', 'work_schedules', 'work_schedule_exceptions',
    'aggregate_baselines', 'daily_activity', 'leads', 'appointments',
    'applications', 'commission_transactions', 'expenses'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I
         for each row execute function public.write_audit_log()',
      t || '_audit', t);
  end loop;
end;
$$;
