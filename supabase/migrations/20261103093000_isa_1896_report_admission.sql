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
commit;
