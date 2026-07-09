-- Fase 1.6: billing/licensing provider-agnostic (Polar-ready)
-- Additive: no borra tablas viejas (licenses, subscriptions, etc.)
-- Idempotente: IF NOT EXISTS / CREATE OR REPLACE

-- ============================================================
-- 1. EXTENDER profiles (ya existe en remoto con columnas distintas)
-- ============================================================

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists language text default 'es';
alter table public.profiles add column if not exists primary_simulator text;
alter table public.profiles add column if not exists onboarding_completed boolean default false;

-- Backfill email desde auth.users (best effort, idempotente)
update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id
  and p.email is null
  and u.email is not null;

-- Backfill preferred_sim -> primary_simulator SOLO si ambas columnas existen (Task 0.5)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'preferred_sim'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'primary_simulator'
  ) then
    update public.profiles
    set primary_simulator = preferred_sim
    where primary_simulator is null
      and preferred_sim is not null;
  end if;
end $$;

-- ============================================================
-- 2. TABLAS NUEVAS
-- ============================================================

create table if not exists public.user_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  product_key text not null,
  status text not null default 'active',
  source text not null default 'manual',
  expires_at timestamptz,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, product_key)
);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  fingerprint_hash text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_reset_at timestamptz
);

create table if not exists public.license_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  event_type text not null,
  idempotency_key text,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.billing_customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null,
  provider_customer_id text not null,
  email text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider),
  unique (provider, provider_customer_id)
);

create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null,
  provider_subscription_id text not null,
  provider_product_id text,
  provider_price_id text,
  status text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subscription_id)
);

-- Índices
create index if not exists user_entitlements_user_id_idx on public.user_entitlements (user_id);
create index if not exists user_entitlements_user_product_idx on public.user_entitlements (user_id, product_key);
create index if not exists devices_fingerprint_hash_idx on public.devices (fingerprint_hash);
create index if not exists license_events_user_id_idx on public.license_events (user_id);
create index if not exists license_events_created_at_idx on public.license_events (created_at desc);
create index if not exists billing_customers_provider_customer_idx on public.billing_customers (provider, provider_customer_id);
create index if not exists billing_subscriptions_user_id_idx on public.billing_subscriptions (user_id);

create unique index if not exists license_events_idempotency_uq
  on public.license_events (event_type, idempotency_key)
  where idempotency_key is not null;

-- ============================================================
-- 3. RLS
-- ============================================================

alter table public.user_entitlements enable row level security;
alter table public.devices enable row level security;
alter table public.license_events enable row level security;
alter table public.billing_customers enable row level security;
alter table public.billing_subscriptions enable row level security;

drop policy if exists entitlements_select_own on public.user_entitlements;
create policy entitlements_select_own on public.user_entitlements
  for select using (auth.uid() = user_id);

drop policy if exists devices_select_own on public.devices;
create policy devices_select_own on public.devices
  for select using (auth.uid() = user_id);

drop policy if exists license_events_select_own on public.license_events;
create policy license_events_select_own on public.license_events
  for select using (auth.uid() = user_id and created_at > now() - interval '30 days');

drop policy if exists billing_customers_select_own on public.billing_customers;
create policy billing_customers_select_own on public.billing_customers
  for select using (auth.uid() = user_id);

drop policy if exists billing_subscriptions_select_own on public.billing_subscriptions;
create policy billing_subscriptions_select_own on public.billing_subscriptions
  for select using (auth.uid() = user_id);

-- Sin políticas INSERT/UPDATE/DELETE para authenticated en tablas de billing/entitlements

-- ============================================================
-- 4. RPC: get_account_entitlements (device binding seguro)
-- ============================================================
-- Contrato Go (obligatorio, no romper):
--   IN:  { "device_fingerprint": "<hash>" }
--   OUT mínimo: user_id, email, entitlements[], active_device, expires_at
--   OUT extra (ignorado por Go hoy): device_ok, provider_customer_id, billing_provider

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
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_fp text := nullif(trim(device_fingerprint), '');
  v_bound_fp text;
  v_device_ok boolean := false;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select d.fingerprint_hash into v_bound_fp
  from public.devices d
  where d.user_id = v_user_id;

  if not found then
    if v_fp is not null then
      insert into public.devices (user_id, fingerprint_hash, first_seen_at, last_seen_at)
      values (v_user_id, v_fp, now(), now());
      v_bound_fp := v_fp;
      v_device_ok := true;
    end if;
  elsif v_bound_fp is null then
    if v_fp is not null then
      update public.devices
      set fingerprint_hash = v_fp,
          last_seen_at = now()
      where user_id = v_user_id;
      v_bound_fp := v_fp;
      v_device_ok := true;
    end if;
  elsif v_fp is not null and v_bound_fp = v_fp then
    update public.devices
    set last_seen_at = now()
    where user_id = v_user_id;
    v_device_ok := true;
  elsif v_fp is not null and v_bound_fp <> v_fp then
    v_device_ok := false;
  end if;

  return query
  select
    p.id as user_id,
    coalesce(p.email, u.email) as email,
    coalesce(
      array_agg(ue.product_key order by ue.product_key)
        filter (where ue.product_key is not null),
      '{}'::text[]
    ) as entitlements,
    v_bound_fp as active_device,
    min(ue.expires_at) filter (
      where ue.expires_at is not null
        and ue.status in ('active', 'grace', 'past_due')
    ) as expires_at,
    v_device_ok as device_ok,
    bc.provider_customer_id,
    bc.provider as billing_provider
  from public.profiles p
  left join auth.users u on u.id = p.id
  left join public.user_entitlements ue
    on ue.user_id = p.id
   and ue.status in ('active', 'grace', 'past_due')
   and (ue.expires_at is null or ue.expires_at > now())
  left join lateral (
    select bc_inner.provider_customer_id, bc_inner.provider
    from public.billing_customers bc_inner
    where bc_inner.user_id = p.id
    order by bc_inner.updated_at desc
    limit 1
  ) bc on true
  where p.id = v_user_id
  group by p.id, p.email, u.email, v_bound_fp, v_device_ok, bc.provider_customer_id, bc.provider;
end;
$$;

-- ============================================================
-- 5. RPC: reset_active_device
-- ============================================================

create or replace function public.reset_active_device(device_fingerprint text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_last_reset timestamptz;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  select d.last_reset_at into v_last_reset
  from public.devices d
  where d.user_id = v_user_id;

  if v_last_reset is not null and v_last_reset > now() - interval '24 hours' then
    raise exception 'rate_limit: solo 1 reset cada 24h';
  end if;

  update public.devices
  set fingerprint_hash = null,
      last_reset_at = now()
  where user_id = v_user_id;
end;
$$;

-- ============================================================
-- 6. GRANTS: RPCs invocables vía PostgREST con JWT authenticated
-- ============================================================

grant execute on function public.get_account_entitlements(text) to authenticated;
grant execute on function public.reset_active_device(text) to authenticated;