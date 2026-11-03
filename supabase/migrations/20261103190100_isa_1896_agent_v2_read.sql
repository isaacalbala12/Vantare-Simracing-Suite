-- VANTA-131 7a: keep agent jobs/callbacks inert; only change their report read root.
begin;
set local lock_timeout = '5s';
alter table public.testing_center_technical_issues
  alter column report_id drop not null,
  add column contribution_id uuid unique references public.testing_contributions(id) on delete restrict;
alter table public.testing_center_technical_issues
  add constraint testing_center_issue_one_report check ((report_id is null) <> (contribution_id is null));
drop trigger a_account_write_barrier on public.testing_center_technical_issues;
create trigger a_account_write_barrier before insert or update or delete
  on public.testing_center_technical_issues for each row
  execute function private.guard_account_write(
    'select array_remove(array[
      (select reporter_user_id from public.testing_center_reports where report_id=$1->>''report_id''),
      (select account_id from public.testing_contributions where id=($1->>''contribution_id'')::uuid)],null)',
    'select ($1->>''report_id'' is not null and not exists
      (select 1 from public.testing_center_reports where report_id=$1->>''report_id''))
      or ($1->>''contribution_id'' is not null and not exists
      (select 1 from public.testing_contributions where id=($1->>''contribution_id'')::uuid))');

-- Existing child guards follow the legacy report FK. Preserve them and add
-- the contribution lineage for the inert agent's retained ledgers.
create function private.testing_center_v2_owner(p_reference text) returns uuid
language sql stable security definer set search_path='' as $$
  select c.account_id from public.testing_center_technical_issues i
  join public.testing_contributions c on c.id=i.contribution_id
  left join public.testing_center_agent_jobs j on j.technical_issue_id=i.technical_issue_id
  where p_reference in (i.technical_issue_id,j.job_key,c.id::text)
  limit 1
$$;
revoke all on function private.testing_center_v2_owner(text)
  from public,anon,authenticated,service_role;
do $guards$
declare r record;
begin
  for r in select * from (values
    ('testing_center_agent_jobs','technical_issue_id'),
    ('testing_center_agent_effect_outbox','job_key'),
    ('testing_center_agent_callbacks','job_key'),
    ('testing_center_agent_reservations','job_key'),
    ('testing_center_agent_audit','job_key'),
    ('testing_center_agent_phase_callbacks','job_key'),
    ('testing_center_audit','aggregate_id'),
    ('testing_center_idempotency','aggregate_id')
  ) as v(relation_name,reference_column) loop
    execute format('create trigger b_account_write_barrier_v2 before insert or update or delete
      on public.%I for each row execute function private.guard_account_write(%L,%L)',
      r.relation_name,
      format('select array_remove(array[private.testing_center_v2_owner($1->>%L)],null)',r.reference_column),
      'select false');
  end loop;
end $guards$;

create or replace function public.testing_center_get_agent_job_state(p_report_id text)
returns table(state text,updated_at timestamptz)
language sql stable security definer set search_path='' as $$
  select job.state,job.updated_at
  from public.testing_contributions contribution
  join public.testing_center_technical_issues issue on issue.contribution_id=contribution.id
  join public.testing_center_agent_jobs job on job.technical_issue_id=issue.technical_issue_id
  where contribution.id::text=p_report_id
    and (contribution.account_id=private.current_account() or public.testing_center_current_role()='owner')
$$;
commit;
