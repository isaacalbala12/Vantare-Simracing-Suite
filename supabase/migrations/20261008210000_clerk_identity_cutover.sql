-- ISA-1514. Forward cutover: no Auth backfill, shadow users or email linking.
-- Configure private.clerk_issuers AND official TPA before using the new RPCs.
begin;

create schema if not exists private authorization postgres;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- Retain each FK's original referential action, but change its authority.
do $$
declare r record; definition text;
begin
  for r in
    select c.conrelid, c.conname, pg_get_constraintdef(c.oid) as definition
    from pg_constraint c join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where c.contype = 'f' and c.confrelid = 'auth.users'::regclass
      and n.nspname = 'public'
  loop
    execute format('alter table %s drop constraint %I', r.conrelid::regclass, r.conname);
    if r.conrelid <> 'public.profiles'::regclass then
      definition := replace(r.definition, 'REFERENCES auth.users(id)', 'REFERENCES public.profiles(id)');
      if definition = r.definition then raise exception 'unexpected_auth_fk'; end if;
      execute format('alter table %s add constraint %I %s', r.conrelid::regclass, r.conname, definition);
    end if;
  end loop;
end $$;

create table private.clerk_issuers (
  issuer text primary key check (issuer ~ '^https://[a-zA-Z0-9.-]+$'),
  authorized_parties text[] not null check (cardinality(authorized_parties) > 0),
  enabled boolean not null default false
);
revoke all on private.clerk_issuers from public, anon, authenticated;
grant select, insert, update on private.clerk_issuers to service_role;

create table if not exists public.account_identities (
  issuer text not null,
  subject text not null check (subject ~ '^user_[a-zA-Z0-9_]{1,128}$'),
  account_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (issuer, subject)
);
alter table public.account_identities add column if not exists deleted_at timestamptz;
alter table public.account_identities add column if not exists user_event_at timestamptz;
alter table public.account_identities enable row level security;
revoke all on public.account_identities from public, anon, authenticated, service_role;

create table private.clerk_user_events (
  event_id text primary key check (length(event_id) between 1 and 200),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  event_type text not null check (event_type in ('user.created', 'user.updated', 'user.deleted')),
  received_at timestamptz not null default now()
);
revoke all on private.clerk_user_events from public, anon, authenticated, service_role;

-- Only explicit bootstrap or a signed webhook creates the UUID. RLS never does.
create or replace function private.resolve_account_identity(issuer text, subject text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare account uuid; deleted timestamptz;
begin
  if not exists (select 1 from private.clerk_issuers i where i.issuer = $1 and i.enabled)
    or $2 is null or $2 !~ '^user_[a-zA-Z0-9_]{1,128}$' then
    raise sqlstate '28000' using message = 'invalid_clerk_identity';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1 || chr(31) || $2, 0));
  select i.account_id, i.deleted_at into account, deleted
    from public.account_identities i where i.issuer = $1 and i.subject = $2;
  if deleted is not null then raise sqlstate '28000' using message = 'account_deleted'; end if;
  if account is null then
    account := gen_random_uuid();
    insert into public.profiles(id) values(account);
    insert into public.account_identities(issuer, subject, account_id) values($1, $2, account);
  end if;
  return account;
end $$;
revoke all on function private.resolve_account_identity(text, text) from public, anon, authenticated, service_role;

create or replace function private.current_account()
returns uuid language sql stable security definer set search_path = '' as $$
  select i.account_id
  from public.account_identities i join private.clerk_issuers c on c.issuer = i.issuer
  where i.issuer = auth.jwt()->>'iss' and i.subject = auth.jwt()->>'sub'
    and c.enabled and i.deleted_at is null
    and auth.jwt()->>'role' = 'authenticated'
    and auth.jwt()->>'sid' ~ '^sess_[a-zA-Z0-9_]+$'
    and auth.jwt()->>'azp' = any(c.authorized_parties)
$$;
revoke all on function private.current_account() from public, anon, authenticated, service_role;
grant execute on function private.current_account() to authenticated;

create function public.clerk_bootstrap_account()
returns uuid language plpgsql security definer set search_path = '' as $$
declare claims jsonb := auth.jwt(); account uuid;
begin
  if coalesce(claims->>'role', '') <> 'authenticated' or coalesce(claims->>'sid', '') !~ '^sess_[a-zA-Z0-9_]+$'
    or not exists (select 1 from private.clerk_issuers c
      where c.issuer = claims->>'iss' and c.enabled and claims->>'azp' = any(c.authorized_parties)) then
    raise sqlstate '28000' using message = 'invalid_clerk_session';
  end if;
  account := private.resolve_account_identity(claims->>'iss', claims->>'sub');
  return account;
end $$;
revoke all on function public.clerk_bootstrap_account() from public, anon, authenticated, service_role;
grant execute on function public.clerk_bootstrap_account() to authenticated;

-- Candidate-native compatibility: authority remains its verified OAuth handler.
-- No Supabase Auth branch and no session-JWT conversion.
create or replace function private.resolve_current_account()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare account uuid := private.current_account();
begin
  if account is null then raise sqlstate '28000' using message = 'not_authenticated'; end if;
  return account;
end $$;
revoke all on function private.resolve_current_account() from public, anon, authenticated, service_role;

-- Preserve all policy roles, commands and expressions except identity lookup.
do $$
declare r record; statement text;
begin
  for r in select * from pg_policies
    where schemaname in ('public', 'storage')
      and (coalesce(qual, '') like '%auth.uid()%'
        or coalesce(with_check, '') like '%auth.uid()%')
  loop
    statement := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    if r.qual is not null then
      statement := statement || ' using (' || replace(r.qual, 'auth.uid()', 'private.current_account()') || ')';
    end if;
    if r.with_check is not null then
      statement := statement || ' with check (' || replace(r.with_check, 'auth.uid()', 'private.current_account()') || ')';
    end if;
    execute statement;
  end loop;
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.prosrc like '%auth.uid()%'
  loop
    execute replace(pg_get_functiondef(r.oid), 'auth.uid()', 'private.current_account()');
  end loop;
end $$;

create or replace function public.read_account_entitlements()
returns table(user_id uuid, email text, entitlements text[], active_device text,
  expires_at timestamptz, device_bound boolean, provider_customer_id text, billing_provider text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.email,
    coalesce(array_agg(e.product_key order by e.product_key)
      filter(where e.product_key is not null), '{}'::text[]),
    d.fingerprint_hash, min(e.expires_at), d.fingerprint_hash is not null,
    bc.provider_customer_id, bc.provider
  from public.profiles p left join public.devices d on d.user_id = p.id
  left join public.user_entitlements e on e.user_id = p.id
    and e.status in ('active', 'grace', 'past_due') and (e.expires_at is null or e.expires_at > now())
  left join lateral (select c.provider_customer_id, c.provider from public.billing_customers c
    where c.user_id = p.id order by c.updated_at desc limit 1) bc on true
  where p.id = private.current_account()
  group by p.id, p.email, d.fingerprint_hash, bc.provider_customer_id, bc.provider
$$;

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

create function public.apply_clerk_user_event(
  p_event_id text, p_payload_hash text, p_issuer text, p_subject text,
  p_event_type text, p_event_at timestamptz, p_verified_email text default null
)
returns text language plpgsql security definer set search_path = '' as $$
declare identity public.account_identities; account uuid; old_hash text;
begin
  if p_event_type not in ('user.created', 'user.updated', 'user.deleted')
    or p_event_at is null or not exists (select 1 from private.clerk_issuers c
      where c.issuer = p_issuer and c.enabled)
    or p_subject is null or p_subject !~ '^user_[a-zA-Z0-9_]{1,128}$' then
    raise exception 'invalid_clerk_user_event';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_issuer || chr(31) || p_subject, 0));
  insert into private.clerk_user_events(event_id, payload_hash, event_type)
    values(p_event_id, p_payload_hash, p_event_type) on conflict do nothing;
  if not found then
    select payload_hash into old_hash from private.clerk_user_events where event_id = p_event_id;
    if old_hash <> p_payload_hash then raise exception 'clerk_event_conflict'; end if;
    return 'unchanged';
  end if;
  select * into identity from public.account_identities i
    where i.issuer = p_issuer and i.subject = p_subject;
  -- Deleted is permanent, including delete-before-create and late JWT/webhooks.
  if identity.deleted_at is not null then return 'ignored'; end if;
  account := private.resolve_account_identity(p_issuer, p_subject);
  if p_event_type = 'user.deleted' then
    update public.account_identities set deleted_at = p_event_at, user_event_at = p_event_at
      where issuer = p_issuer and subject = p_subject;
    update public.profiles set email = null, display_name = null, avatar_url = null,
      primary_simulator = null, onboarding_completed = false where id = account;
    delete from public.devices where user_id = account;
    delete from public.rate_limits where user_id = account;
    delete from public.license_validations where user_id = account;
    update public.licenses set is_active = false, hwid = null, deactivated_at = now(),
      deactivation_reason = 'clerk_user_deleted' where user_id = account;
    update public.billing_customers set email = null, metadata = '{}'::jsonb where user_id = account;
    update public.billing_access_grants set status = 'revoked' where user_id = account;
    update public.user_entitlements set status = 'revoked' where user_id = account;
    update public.operational_access_assignments set status = 'revoked', revoked_at = now(),
      revoked_by = 'clerk:webhook', revoke_reason = 'clerk_user_deleted'
      where user_id = account and status = 'active';
    -- Financial and support evidence retention is documented in the runbook.
  elsif identity.user_event_at is null or p_event_at > identity.user_event_at then
    update public.profiles set email = p_verified_email where id = account;
    update public.account_identities set user_event_at = p_event_at
      where issuer = p_issuer and subject = p_subject;
  else
    return 'ignored';
  end if;
  return 'applied';
end $$;
revoke all on function public.apply_clerk_user_event(text, text, text, text, text, timestamptz, text)
  from public, anon, authenticated, service_role;
grant execute on function public.apply_clerk_user_event(text, text, text, text, text, timestamptz, text) to service_role;

-- Fail the migration rather than silently leaving a split identity boundary.
do $$
begin
  if exists (select 1 from pg_policies where schemaname in ('public', 'storage')
    and (coalesce(qual, '') like '%auth.uid()%' or coalesce(with_check, '') like '%auth.uid()%'))
    or exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosrc like '%auth.uid()%') then
    raise exception 'auth_uid_cutover_incomplete';
  end if;
end $$;
commit;
