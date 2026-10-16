-- Inert rollback only. Keep used budgets rather than reset abuse protection.
begin;
set local lock_timeout='5s';
lock table private.testing_report_attempts in access exclusive mode;
do $$begin
  if exists(select 1 from private.testing_report_attempts) then
    raise exception 'testing_admission_rollback_requires_data_preservation' using errcode='55000';
  end if;
end $$;
drop function public.testing_report_submit_admitted(uuid,uuid,text,text,text,boolean);
drop function public.testing_report_admit(text,text,date);
drop table private.testing_report_attempts;
-- No direct client RPC is reopened.
commit;
