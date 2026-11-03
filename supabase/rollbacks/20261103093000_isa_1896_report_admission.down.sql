-- VANTA-131 step 2: restore the previous account admission surface.
begin;
set local lock_timeout = '5s';
-- The old schema caps each IP counter at 21. Preserve the coarse count up to
-- that limit; retry keys are disposable exemptions, not report data.
update private.testing_report_attempts
  set attempts = least(attempts, 21)
  where scope = 'ip' and attempts > 21;
drop trigger testing_report_purge_admitted_on_delete on public.account_identities;
drop function private.testing_report_purge_admitted_on_delete();
drop function public.testing_report_admit_account(uuid,text,text,date);
drop table private.testing_report_admitted_keys;
alter table private.testing_report_attempts
  drop constraint testing_report_attempts_attempts_check,
  add constraint testing_report_attempts_attempts_check
    check (attempts between 1 and 21);
create or replace function public.testing_report_admit(p_scope text,p_subject text,p_week date)
returns boolean language plpgsql security definer set search_path='' as $$
declare d date:=(clock_timestamp() at time zone 'UTC')::date;
  w date:=date_trunc('week',clock_timestamp() at time zone 'UTC')::date;
  n integer; total bigint;
begin
  if current_setting('transaction_isolation')<>'read committed' then
    raise exception 'testing_report_read_committed_required' using errcode='25001'; end if;
  if p_week is distinct from w or p_scope is null or p_subject is null
    or p_scope not in ('ip','account')
    or (p_scope='ip' and p_subject !~ '^[0-9a-f]{64}$')
    or (p_scope='account' and p_subject !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
    raise exception 'testing_report_admission_invalid' using errcode='22023'; end if;
  delete from private.testing_report_attempts where day_start<d-8;
  perform pg_advisory_xact_lock(hashtextextended(p_scope||p_subject||w::text,1611));
  insert into private.testing_report_attempts(scope,subject,week_start,day_start,attempts)
    values(p_scope,p_subject,w,d,1)
    on conflict(scope,subject,week_start,day_start) do update
      set attempts=least(private.testing_report_attempts.attempts+1,21)
    returning attempts into n;
  select sum(attempts) into total from private.testing_report_attempts
    where scope=p_scope and subject=p_subject and week_start=w;
  return n<=5 and total<=20;
end $$;
revoke all on function public.testing_report_admit(text,text,date)
  from public, anon, authenticated, service_role;
grant execute on function public.testing_report_admit(text,text,date)
  to service_role;
commit;
