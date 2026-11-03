-- VANTA-131 step 2: account quota charges only valid, new report bodies.
-- The IP quota remains a coarse per-request limit at the Edge.
begin;
set local lock_timeout = '5s';

create table private.testing_report_admitted_keys (
  account_id uuid not null,
  report_key text not null check (length(report_key) between 1 and 256),
  body_digest text not null check (body_digest ~ '^[0-9a-f]{64}$'),
  admitted_at timestamptz not null default now(),
  primary key (account_id, report_key)
);
alter table private.testing_report_admitted_keys enable row level security;
revoke all on private.testing_report_admitted_keys from public, anon, authenticated, service_role;
create index testing_report_admitted_keys_expiry
  on private.testing_report_admitted_keys(admitted_at);
create trigger a_account_write_barrier before insert or update or delete
  on private.testing_report_admitted_keys for each row
  execute function private.guard_account_write(
    'select array[($1->>''account_id'')::uuid]', 'select false');

create function public.testing_report_admit_account(
  p_account uuid, p_key text, p_digest text, p_week date
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_digest text;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'testing_report_read_committed_required' using errcode = '25001';
  end if;
  if p_account is null or p_key is null or length(p_key) not between 1 and 256
    or p_digest is null or p_digest !~ '^[0-9a-f]{64}$'
    or p_week is distinct from date_trunc('week', clock_timestamp() at time zone 'UTC')::date then
    raise exception 'testing_report_admission_invalid' using errcode = '22023';
  end if;

  -- Expire only this account's keys. A concurrent admission for another
  -- account must never delete its rows or cause an unrelated write conflict.
  delete from private.testing_report_admitted_keys
    where account_id = p_account
      and admitted_at < (((clock_timestamp() at time zone 'UTC')::date - 8)::timestamp at time zone 'UTC');

  -- Serialize same-key admission, including its quota increment. A changed body
  -- cannot borrow the first body's exemption, even from the same account.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_account::text || pg_catalog.chr(31) || p_key, 1896)
  );
  select body_digest into v_digest
    from private.testing_report_admitted_keys
    where account_id = p_account and report_key = p_key;
  if found then
    if v_digest <> p_digest then
      raise exception 'testing_report_retry_body_changed' using errcode = '23505';
    end if;
    return true;
  end if;

  if not public.testing_report_admit('account', p_account::text, p_week) then
    return false;
  end if;
  insert into private.testing_report_admitted_keys(account_id, report_key, body_digest)
    values (p_account, p_key, p_digest);
  return true;
end $$;
revoke all on function public.testing_report_admit_account(uuid,text,text,date)
  from public, anon, authenticated;
grant execute on function public.testing_report_admit_account(uuid,text,text,date)
  to service_role;

-- The b03 Clerk deletion marks account_identities.deleted_at. This trigger is
-- installed after the admission table exists, so it also works on an upgrade
-- where b03 was applied months earlier. The deletion path owns the UUID lock.
create function private.testing_report_purge_admitted_on_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from private.testing_report_admitted_keys where account_id = new.account_id;
  return new;
end $$;
revoke all on function private.testing_report_purge_admitted_on_delete()
  from public, anon, authenticated, service_role;
create trigger testing_report_purge_admitted_on_delete
  after update of deleted_at on public.account_identities
  for each row when (old.deleted_at is null and new.deleted_at is not null)
  execute function private.testing_report_purge_admitted_on_delete();

-- The IP counter is only a coarse flood guard; it cannot spend the five
-- authenticated reports belonging to a tester on the same network.
alter table private.testing_report_attempts
  drop constraint testing_report_attempts_attempts_check,
  add constraint testing_report_attempts_attempts_check
    check (attempts between 1 and 61);
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
      set attempts=least(private.testing_report_attempts.attempts+1,
        case when p_scope='ip' then 61 else 21 end)
    returning attempts into n;
  if p_scope='ip' then return n<=60; end if;
  select sum(attempts) into total from private.testing_report_attempts
    where scope=p_scope and subject=p_subject and week_start=w;
  return n<=5 and total<=20;
end $$;
revoke all on function public.testing_report_admit(text,text,date)
  from public, anon, authenticated, service_role;
grant execute on function public.testing_report_admit(text,text,date)
  to service_role;
commit;
