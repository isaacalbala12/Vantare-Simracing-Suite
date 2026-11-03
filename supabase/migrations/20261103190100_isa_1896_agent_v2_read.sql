-- VANTA-131 7a: keep agent jobs/callbacks inert; only change their report read root.
begin;
set local lock_timeout = '5s';
alter table public.testing_center_technical_issues
  alter column report_id drop not null,
  add column contribution_id uuid unique references public.testing_contributions(id) on delete restrict;
alter table public.testing_center_technical_issues
  add constraint testing_center_issue_one_report check ((report_id is null) <> (contribution_id is null));

create or replace function public.testing_center_get_agent_job_state(p_report_id text)
returns table(state text,updated_at timestamptz)
language sql stable security definer set search_path='' as $$
  select job.state,job.updated_at
  from public.testing_contributions contribution
  join public.testing_center_technical_issues issue on issue.contribution_id=contribution.id
  join public.testing_center_agent_jobs job on job.technical_issue_id=issue.technical_issue_id
  where contribution.id::text=p_report_id
    and (contribution.account_id=auth.uid() or public.testing_center_current_role()='owner')
$$;
commit;
