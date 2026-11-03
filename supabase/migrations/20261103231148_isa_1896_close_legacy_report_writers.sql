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

-- A trusted service role previously had direct DML in addition to RPC access.
-- Keep SELECT for the history/read and drain checks.
revoke insert, update, delete on public.testing_center_reports
  from service_role;

notify pgrst, 'reload schema';
commit;
