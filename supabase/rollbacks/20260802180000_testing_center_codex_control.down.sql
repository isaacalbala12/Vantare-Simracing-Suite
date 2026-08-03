drop function if exists public.testing_center_fail_codex_before_dispatch(text,text,bigint);
drop function if exists public.testing_center_record_codex_outcome(text,text,bigint,text,text);
drop function if exists public.testing_center_authorize_codex_dispatch(text,text,bigint);
drop function if exists public.testing_center_claim_codex_dry_run(text,text,integer);
drop function if exists public.testing_center_queue_codex_dry_run(text,text,text,text,text,text);
drop function if exists public.testing_center_load_codex_evidence(text);

update public.testing_center_codex_runs
set state = 'failed', updated_at = now()
where state in ('completed', 'needs_owner');

drop table if exists public.testing_center_codex_execution_control;

alter table public.testing_center_codex_runs
  drop constraint if exists testing_center_codex_runs_state_check,
  add constraint testing_center_codex_runs_state_check check (
    state in ('queued', 'running', 'pr_open', 'failed')
  );

drop function if exists public.testing_center_submit_report(
  text, text, text, text, text, text, text, text, text, text,
  boolean, boolean, text, text, text
);

alter function public.testing_center_submit_report_without_transport_size(
  text, text, text, text, text, text, text, text, text, text,
  boolean, boolean, text, text, text
) rename to testing_center_submit_report;

revoke all on function public.testing_center_submit_report(
  text, text, text, text, text, text, text, text, text, text,
  boolean, boolean, text, text, text
) from public, anon;
grant execute on function public.testing_center_submit_report(
  text, text, text, text, text, text, text, text, text, text,
  boolean, boolean, text, text, text
) to authenticated;

alter table public.testing_center_report_payloads
  drop column if exists diagnostic_transport_size;
