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
grant insert, update, delete on public.testing_center_reports
  to service_role;
notify pgrst, 'reload schema';
commit;
