begin;
set local lock_timeout = '5s';
do $$ begin
  if exists(select 1 from public.testing_center_technical_issues where contribution_id is not null) then
    raise exception 'testing_agent_v2_rollback_has_links' using errcode='55000';
  end if;
end $$;
create or replace function public.testing_center_get_agent_job_state(p_report_id text)
returns table(state text,updated_at timestamptz)
language sql stable security definer set search_path='' as $$
  select job.state,job.updated_at
  from public.testing_center_reports report
  join public.testing_center_technical_issues issue on issue.report_id=report.report_id
  join public.testing_center_agent_jobs job on job.technical_issue_id=issue.technical_issue_id
  where report.report_id=p_report_id
    and (report.reporter_user_id=auth.uid() or public.testing_center_current_role()='owner')
$$;
alter table public.testing_center_technical_issues
  drop constraint testing_center_issue_one_report,
  drop column contribution_id,
  alter column report_id set not null;
commit;
