-- ISA-909: resolve validated external identities to Vantare's internal UUID.

do $$
declare
  v_constraint_names text[];
  v_constraint_name text;
begin
  select array_agg(constraint_row.conname order by constraint_row.conname)
  into v_constraint_names
  from pg_constraint constraint_row
  where constraint_row.conrelid = 'public.profiles'::regclass
    and constraint_row.confrelid = 'auth.users'::regclass
    and constraint_row.contype = 'f';

  if coalesce(cardinality(v_constraint_names), 0) <> 1 then
    raise exception 'profiles_auth_user_fk_unexpected';
  end if;

  foreach v_constraint_name in array v_constraint_names loop
    execute format(
      'alter table public.profiles drop constraint %I',
      v_constraint_name
    );
  end loop;
end
$$;

create schema if not exists private authorization postgres;
revoke all on schema private from public, anon, authenticated, service_role;

create table public.account_identities (
  issuer text not null check (length(issuer) between 1 and 512),
  subject text not null check (length(subject) between 1 and 255),
  account_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (issuer, subject)
);

alter table public.account_identities enable row level security;
alter table public.account_identities owner to postgres;
revoke all on table public.account_identities
from public, anon, authenticated, service_role;

create function private.resolve_current_account()
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_claims jsonb := auth.jwt();
  v_issuer text := nullif(trim(v_claims ->> 'iss'), '');
  v_subject text := nullif(trim(v_claims ->> 'sub'), '');
  v_account_id uuid;
begin
  if v_issuer is null or v_subject is null then
    raise exception 'not_authenticated';
  end if;
  if length(v_issuer) > 512 or length(v_subject) > 255 then
    raise exception 'invalid_identity';
  end if;

  if v_issuer ~ '/auth/v1$'
    and v_subject ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and exists (
      select 1 from auth.users user_row where user_row.id = v_subject::uuid
    )
  then
    return v_subject::uuid;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_issuer || chr(31) || v_subject, 0)
  );

  select identity_row.account_id
  into v_account_id
  from public.account_identities identity_row
  where identity_row.issuer = v_issuer
    and identity_row.subject = v_subject;

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

alter function private.resolve_current_account() owner to postgres;
revoke all on function private.resolve_current_account()
from public, anon, authenticated, service_role;

drop function public.claim_active_device(text);
create function public.claim_active_device(device_fingerprint text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.resolve_current_account();
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

create or replace function public.read_account_entitlements()
returns table(
  user_id uuid,
  email text,
  entitlements text[],
  active_device text,
  expires_at timestamptz,
  device_bound boolean,
  provider_customer_id text,
  billing_provider text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.resolve_current_account();
begin
  return query
  select
    profile_row.id,
    coalesce(profile_row.email, auth_user.email),
    coalesce(array_agg(entitlement_row.product_key order by entitlement_row.product_key)
      filter (where entitlement_row.product_key is not null), '{}'::text[]),
    device_row.fingerprint_hash,
    min(entitlement_row.expires_at) filter (
      where entitlement_row.expires_at is not null
        and entitlement_row.status in ('active', 'grace', 'past_due')
    ),
    device_row.fingerprint_hash is not null,
    customer_row.provider_customer_id,
    customer_row.provider
  from public.profiles profile_row
  left join auth.users auth_user on auth_user.id = profile_row.id
  left join public.devices device_row on device_row.user_id = profile_row.id
  left join public.user_entitlements entitlement_row
    on entitlement_row.user_id = profile_row.id
   and entitlement_row.status in ('active', 'grace', 'past_due')
   and (entitlement_row.expires_at is null or entitlement_row.expires_at > now())
  left join lateral (
    select customer.provider_customer_id, customer.provider
    from public.billing_customers customer
    where customer.user_id = profile_row.id
    order by customer.updated_at desc limit 1
  ) customer_row on true
  where profile_row.id = v_user_id
  group by profile_row.id, profile_row.email, auth_user.email,
    device_row.fingerprint_hash, customer_row.provider_customer_id,
    customer_row.provider;
end;
$$;

create or replace function public.reset_active_device(device_fingerprint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.resolve_current_account();
  v_fp text := nullif(trim(device_fingerprint), '');
  v_last_reset timestamptz;
begin
  if v_fp is null then raise exception 'device_fingerprint_required'; end if;

  select device_row.last_reset_at into v_last_reset
  from public.devices device_row
  where device_row.user_id = v_user_id
  for update;

  if v_last_reset is not null and v_last_reset > now() - interval '24 hours' then
    raise exception 'rate_limit: solo 1 reset cada 24h';
  end if;

  insert into public.devices (
    user_id, fingerprint_hash, first_seen_at, last_seen_at, last_reset_at
  )
  values (v_user_id, v_fp, now(), now(), now())
  on conflict (user_id) do update
  set fingerprint_hash = excluded.fingerprint_hash,
      last_seen_at = excluded.last_seen_at,
      last_reset_at = excluded.last_reset_at;
end;
$$;

create or replace function public.get_account_entitlements(device_fingerprint text)
returns table(
  user_id uuid,
  email text,
  entitlements text[],
  active_device text,
  expires_at timestamptz,
  device_ok boolean,
  provider_customer_id text,
  billing_provider text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  return query
  select result_row.user_id, result_row.email, result_row.entitlements,
    result_row.active_device, result_row.expires_at,
    result_row.active_device = nullif(trim(device_fingerprint), ''),
    result_row.provider_customer_id, result_row.billing_provider
  from public.read_account_entitlements() result_row;
end;
$$;

alter function public.claim_active_device(text) owner to postgres;
alter function public.read_account_entitlements() owner to postgres;
alter function public.reset_active_device(text) owner to postgres;
alter function public.get_account_entitlements(text) owner to postgres;

revoke all on function public.claim_active_device(text)
from public, anon, authenticated;
revoke all on function public.read_account_entitlements()
from public, anon, authenticated;
revoke all on function public.reset_active_device(text)
from public, anon, authenticated;
revoke all on function public.get_account_entitlements(text)
from public, anon, authenticated;

grant execute on function public.claim_active_device(text) to authenticated;
grant execute on function public.read_account_entitlements() to authenticated;
grant execute on function public.reset_active_device(text) to authenticated;
grant execute on function public.get_account_entitlements(text) to authenticated;

comment on function public.get_account_entitlements(text) is
  'Deprecated read-only compatibility wrapper. Use claim_active_device then read_account_entitlements.';

-- Reviewed rollback precheck (do not run automatically):
-- select count(*) from public.profiles p
-- where not exists (select 1 from auth.users u where u.id = p.id);
-- Rollback must abort unless that count is zero. Then restore the four RPCs
-- from 20260802020000_supabase_auth_license_hardening.sql, drop the private
-- resolver and account_identities, and recreate the profiles FK to auth.users.
