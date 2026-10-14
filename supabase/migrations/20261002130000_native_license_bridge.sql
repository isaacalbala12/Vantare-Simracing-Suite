-- ISA-1444: shared identity/device logic; native entry accepts server-verified identities only.

create function private.resolve_account_identity(issuer text, subject text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_issuer text := nullif(rtrim(trim(issuer), '/'), '');
  v_subject text := nullif(trim(subject), '');
  v_account_id uuid;
  v_accounts integer;
begin
  if v_issuer is null or v_subject is null then
    raise exception 'not_authenticated';
  end if;
  if length(v_issuer) > 512 or length(v_subject) > 255 then
    raise exception 'invalid_identity';
  end if;

  if v_issuer ~ '/auth/v1$' then
    if v_subject ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and exists (
        select 1 from auth.users user_row where user_row.id = v_subject::uuid
      )
    then
      return v_subject::uuid;
    end if;
    raise exception 'not_authenticated';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_issuer || chr(31) || v_subject, 0)
  );

  select count(distinct identity_row.account_id), min(identity_row.account_id::text)::uuid
  into v_accounts, v_account_id
  from public.account_identities identity_row
  where identity_row.issuer in (v_issuer, v_issuer || '/')
    and identity_row.subject = v_subject;

  if v_accounts > 1 then raise exception 'account_conflict'; end if;
  if v_account_id is not null then
    return v_account_id;
  end if;

  v_account_id := gen_random_uuid();
  insert into public.profiles (id) values (v_account_id);
  insert into public.account_identities (issuer, subject, account_id)
  values (v_issuer, v_subject, v_account_id);
  return v_account_id;
end;
$$;

alter function private.resolve_account_identity(text, text) owner to postgres;
revoke all on function private.resolve_account_identity(text, text)
from public, anon, authenticated, service_role;

create or replace function private.resolve_current_account()
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  return private.resolve_account_identity(auth.jwt() ->> 'iss', auth.jwt() ->> 'sub');
end;
$$;

create function private.claim_account_device(v_user_id uuid, device_fingerprint text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fp text := nullif(trim(device_fingerprint), '');
  v_bound_fp text;
begin
  if v_fp is null then raise exception 'device_fingerprint_required'; end if;

  insert into public.devices (user_id, fingerprint_hash, first_seen_at, last_seen_at)
  values (v_user_id, v_fp, now(), now())
  on conflict (user_id) do nothing;

  select device_row.fingerprint_hash into v_bound_fp
  from public.devices device_row
  where device_row.user_id = v_user_id
  for update;

  if v_bound_fp is null then
    update public.devices set fingerprint_hash = v_fp, last_seen_at = now()
    where user_id = v_user_id;
  elsif v_bound_fp = v_fp then
    update public.devices set last_seen_at = now() where user_id = v_user_id;
  end if;

  return v_user_id;
end;
$$;

alter function private.claim_account_device(uuid, text) owner to postgres;
revoke all on function private.claim_account_device(uuid, text)
from public, anon, authenticated, service_role;

create or replace function public.claim_active_device(device_fingerprint text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.claim_account_device(private.resolve_current_account(), device_fingerprint);
end;
$$;

-- Public schema is required for PostgREST RPC routing; EXECUTE is private to service_role.
create function public.native_claim_license_device(issuer text, subject text, device_fingerprint text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if issuer is null or issuer !~ '^https://' or issuer ~ '/auth/v1/?$'
    or subject is null or subject !~ '^user_[A-Za-z0-9_]{27}$'
    or device_fingerprint is null or device_fingerprint !~ '^[0-9a-f]{64}$'
  then
    raise exception 'invalid_identity';
  end if;
  return private.claim_account_device(
    private.resolve_account_identity(issuer, subject), device_fingerprint
  );
end;
$$;

alter function public.native_claim_license_device(text, text, text) owner to postgres;
revoke all on function public.native_claim_license_device(text, text, text)
from public, anon, authenticated, service_role;
grant execute on function public.native_claim_license_device(text, text, text) to service_role;
comment on function public.native_claim_license_device(text, text, text) is
  'Server-only: issuer and user subject must already be validated with Clerk OAuth verification. No email linking.';
