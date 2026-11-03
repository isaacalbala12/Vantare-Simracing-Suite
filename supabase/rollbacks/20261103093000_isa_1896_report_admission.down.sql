-- VANTA-131 step 2: restore the previous account admission surface.
begin;
set local lock_timeout = '5s';
do $$ begin
  if exists (select 1 from private.testing_report_admitted_keys) then
    raise exception 'testing_admission_v2_rollback_requires_data_preservation' using errcode = '55000';
  end if;
end $$;
drop function public.testing_report_admit_account(uuid,text,text,date);
drop table private.testing_report_admitted_keys;
commit;
