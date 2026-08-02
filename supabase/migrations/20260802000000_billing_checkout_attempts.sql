create table if not exists public.billing_checkout_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  attempt_id uuid not null,
  checkout_key text not null check (checkout_key in ('launch_lifetime', 'pro_monthly', 'pro_plus_monthly')),
  environment text not null check (environment in ('sandbox', 'production')),
  catalog_version text not null check (length(btrim(catalog_version)) > 0),
  status text not null check (status in ('creating', 'open', 'uncertain')),
  provider_checkout_id text,
  checkout_url text,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, attempt_id),
  check ((status = 'open') = (checkout_url is not null))
);

create index if not exists billing_checkout_attempts_expiry_idx
  on public.billing_checkout_attempts (expires_at);

alter table public.billing_checkout_attempts enable row level security;
revoke all on public.billing_checkout_attempts from anon, authenticated;
grant select, insert, update, delete on public.billing_checkout_attempts to service_role;

comment on table public.billing_checkout_attempts is
  'Server-only checkout deduplication. URLs expire after 30 minutes; expired rows are retained at most 24 additional hours.';

create or replace function public.claim_billing_checkout_attempt(
  p_user_id uuid,
  p_attempt_id uuid,
  p_checkout_key text,
  p_environment text,
  p_catalog_version text
)
returns table(outcome text, checkout_url text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.billing_checkout_attempts%rowtype;
begin
  delete from public.billing_checkout_attempts
  where expires_at < now() - interval '24 hours';

  insert into public.billing_checkout_attempts (
    user_id, attempt_id, checkout_key, environment, catalog_version, status
  ) values (
    p_user_id, p_attempt_id, p_checkout_key, p_environment, p_catalog_version, 'creating'
  ) on conflict (user_id, attempt_id) do nothing;

  if found then
    return query select 'claimed'::text, null::text;
    return;
  end if;

  select * into existing
  from public.billing_checkout_attempts
  where user_id = p_user_id and attempt_id = p_attempt_id;

  if existing.checkout_key <> p_checkout_key
    or existing.environment <> p_environment
    or existing.catalog_version <> p_catalog_version then
    return query select 'conflict'::text, null::text;
  elsif existing.expires_at <= now() then
    return query select 'expired'::text, null::text;
  elsif existing.status = 'open' then
    return query select 'reused'::text, existing.checkout_url;
  elsif existing.status = 'uncertain' then
    return query select 'uncertain'::text, null::text;
  else
    return query select 'busy'::text, null::text;
  end if;
end;
$$;

create or replace function public.complete_billing_checkout_attempt(
  p_user_id uuid,
  p_attempt_id uuid,
  p_provider_checkout_id text,
  p_checkout_url text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare affected integer;
begin
  update public.billing_checkout_attempts
  set status = 'open',
      provider_checkout_id = p_provider_checkout_id,
      checkout_url = p_checkout_url,
      updated_at = now()
  where user_id = p_user_id
    and attempt_id = p_attempt_id
    and status = 'creating'
    and expires_at > now();
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function public.mark_billing_checkout_attempt_uncertain(
  p_user_id uuid,
  p_attempt_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare affected integer;
begin
  update public.billing_checkout_attempts
  set status = 'uncertain', updated_at = now()
  where user_id = p_user_id
    and attempt_id = p_attempt_id
    and status = 'creating'
    and expires_at > now();
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

revoke all on function public.claim_billing_checkout_attempt(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.complete_billing_checkout_attempt(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.mark_billing_checkout_attempt_uncertain(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_billing_checkout_attempt(uuid, uuid, text, text, text) to service_role;
grant execute on function public.complete_billing_checkout_attempt(uuid, uuid, text, text) to service_role;
grant execute on function public.mark_billing_checkout_attempt_uncertain(uuid, uuid) to service_role;
