-- #1610 F1. Review candidate only; never deployed by this change.
begin;
set local lock_timeout='5s';
create table private.testing_report_attempts (
  scope text not null check(scope in ('ip','account')),
  subject text not null,
  week_start date not null,
  day_start date not null,
  attempts integer not null check(attempts between 1 and 21),
  primary key(scope,subject,week_start,day_start)
);
create index testing_report_attempts_expiry on private.testing_report_attempts(day_start);
alter table private.testing_report_attempts enable row level security;
revoke all on private.testing_report_attempts from public,anon,authenticated,service_role;

-- Separate transaction from submit: rejected bodies/retries keep their attempt.
-- Boolean denial commits counters; raising here would undo them.
create function public.testing_report_admit(p_scope text,p_subject text,p_week date)
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
revoke all on function public.testing_report_admit(text,text,date) from public,anon,authenticated;
grant execute on function public.testing_report_admit(text,text,date) to service_role;

-- Identity is the cryptographically verified native bridge UUID, server only.
-- Original client RPC remains closed, as do legacy/v2 submission functions.
create function public.testing_report_submit_admitted(p_account uuid,p_id uuid,p_channel text,p_title text,p_body text,p_consent boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_account is null then raise exception 'testing_auth_required' using errcode='42501'; end if;
  perform set_config('request.jwt.claim.sub',p_account::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p_account,'role','authenticated')::text,true);
  perform public.testing_report_submit(p_id,p_channel,p_title,p_body,p_consent);
end $$;
revoke all on function public.testing_report_submit_admitted(uuid,uuid,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.testing_report_submit_admitted(uuid,uuid,text,text,text,boolean) to service_role;
commit;
