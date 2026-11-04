-- Restore the pre-7b admission and triage grants only if legacy tables remain.
begin;
set local lock_timeout = '5s';
do $$ begin
  if to_regclass('public.testing_center_reports') is null then
    raise exception 'legacy_report_schema_missing' using errcode = '55000';
  end if;
end $$;
grant execute on function public.testing_center_report_submit_admitted(
  uuid,text,text,text,text,text,text,text,text,text,text,
  boolean,boolean,text,text,text,uuid
) to service_role;
grant execute on function public.testing_center_triage_report(text)
  to service_role;
grant execute on function public.testing_center_prepare_screenshot_batch(text,text,text,jsonb),
  public.testing_center_finalize_screenshot(uuid,uuid)
  to authenticated, service_role;
-- Recreate the pre-close table ACLs. Default privileges had already given
-- service_role ALL, including TRUNCATE, REFERENCES and TRIGGER. No PUBLIC writes.
revoke all on table public.testing_center_reports,
  public.testing_center_evidence,
  public.testing_center_technical_issues,
  public.testing_center_screenshot_evidence,
  public.testing_center_evidence_batches,
  public.testing_center_report_payloads,
  public.testing_center_report_submission_keys,
  public.testing_center_report_events
from public, anon, authenticated, service_role;
grant all on table public.testing_center_reports,
  public.testing_center_evidence,
  public.testing_center_technical_issues,
  public.testing_center_screenshot_evidence,
  public.testing_center_evidence_batches,
  public.testing_center_report_payloads,
  public.testing_center_report_submission_keys,
  public.testing_center_report_events
to service_role;
grant select on table public.testing_center_reports,
  public.testing_center_evidence,
  public.testing_center_technical_issues,
  public.testing_center_report_payloads to authenticated;
notify pgrst, 'reload schema';
commit;
