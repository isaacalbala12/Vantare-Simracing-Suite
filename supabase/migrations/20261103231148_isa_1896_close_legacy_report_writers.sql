-- VANTA-131 / 7b step 1. Freeze legacy report writes before the map and drain.
-- This changes no rows; #1924 may run only after the later drain is verified.
begin;
set local lock_timeout = '5s';

revoke all on function public.testing_center_report_submit_admitted(
  uuid,text,text,text,text,text,text,text,text,text,text,
  boolean,boolean,text,text,text,uuid
) from public, anon, authenticated, service_role;
revoke all on function public.testing_center_triage_report(text)
  from public, anon, authenticated, service_role;
revoke all on function public.testing_center_prepare_screenshot_batch(text,text,text,jsonb),
  public.testing_center_finalize_screenshot(uuid,uuid)
  from public, anon, authenticated, service_role;

-- These old wrappers were already closed by #1709. Assert the terminal ACL
-- again so a replayed grant cannot keep a second route writable.
revoke all on function public.testing_center_submit_report(
  text,text,text,text,text,text,text,text,text,text,
  boolean,boolean,text,text,text
), public.testing_center_submit_report_with_evidence(
  text,text,text,text,text,text,text,text,text,text,
  boolean,boolean,text,text,text,uuid
), public.testing_center_submit_report_without_transport_size(
  text,text,text,text,text,text,text,text,text,text,
  boolean,boolean,text,text,text
) from public, anon, authenticated, service_role;

-- The service role had direct DML on every legacy report child. Remove every
-- table privilege first (including TRUNCATE, REFERENCES and TRIGGER), then
-- restore only the historical read surface needed for the locked drain.
revoke all on table public.testing_center_reports,
  public.testing_center_evidence,
  public.testing_center_technical_issues,
  public.testing_center_screenshot_evidence,
  public.testing_center_evidence_batches,
  public.testing_center_report_payloads,
  public.testing_center_report_submission_keys,
  public.testing_center_report_events
from public, anon, authenticated, service_role;
grant select on table public.testing_center_reports,
  public.testing_center_evidence,
  public.testing_center_technical_issues,
  public.testing_center_screenshot_evidence,
  public.testing_center_evidence_batches,
  public.testing_center_report_payloads,
  public.testing_center_report_submission_keys,
  public.testing_center_report_events
to service_role;
-- Preserve existing RLS-limited history reads for reporters/admin.
grant select on table public.testing_center_reports,
  public.testing_center_evidence,
  public.testing_center_technical_issues,
  public.testing_center_report_payloads to authenticated;

notify pgrst, 'reload schema';
commit;
