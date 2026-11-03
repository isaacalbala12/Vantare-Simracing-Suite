-- VANTA-131 7a: only roll back before any v2 report was accepted.
begin;
set local lock_timeout = '5s';
lock table private.testing_report_v2_keys in access exclusive mode;
do $$ begin
  if exists(select 1 from private.testing_report_v2_keys) then
    raise exception 'testing_report_v2_rollback_has_data' using errcode='55000';
  end if;
end $$;
drop function public.testing_report_v2_submit_admitted(uuid,jsonb);
drop function private.testing_report_v2_submit(uuid,jsonb);
alter table public.testing_report_followup drop column report_metadata;
drop table private.testing_report_v2_keys;
commit;
