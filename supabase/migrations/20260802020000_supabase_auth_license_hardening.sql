-- BIL-04: separate device mutation from entitlement reads and narrow RPC grants.

create or replace function public.claim_active_device(device_fingerprint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_fp text := nullif(trim(device_fingerprint), '');
  v_bound_fp text;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if v_fp is null then raise exception 'device_fingerprint_required'; end if;

  insert into public.devices (user_id, fingerprint_hash, first_seen_at, last_seen_at)
  values (v_user_id, v_fp, now(), now())
  on conflict (user_id) do nothing;

  select d.fingerprint_hash into v_bound_fp
  from public.devices d where d.user_id = v_user_id for update;

  if v_bound_fp is null then
    update public.devices set fingerprint_hash = v_fp, last_seen_at = now()
    where user_id = v_user_id;
  elsif v_bound_fp = v_fp then
    update public.devices set last_seen_at = now() where user_id = v_user_id;
  end if;
end;
$$;

-- PostgreSQL cannot rename a TABLE-return column with CREATE OR REPLACE.
-- This migration has not been promoted remotely; drop the misleading
-- device_ok result and recreate it as the factual device_bound signal.
drop function if exists public.read_account_entitlements();
create function public.read_account_entitlements()
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
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    coalesce(p.email, u.email),
    coalesce(array_agg(ue.product_key order by ue.product_key)
      filter (where ue.product_key is not null), '{}'::text[]),
    d.fingerprint_hash,
    min(ue.expires_at) filter (
      where ue.expires_at is not null and ue.status in ('active', 'grace', 'past_due')
    ),
    d.fingerprint_hash is not null,
    bc.provider_customer_id,
    bc.provider
  from public.profiles p
  left join auth.users u on u.id = p.id
  left join public.devices d on d.user_id = p.id
  left join public.user_entitlements ue
    on ue.user_id = p.id
   and ue.status in ('active', 'grace', 'past_due')
   and (ue.expires_at is null or ue.expires_at > now())
  left join lateral (
    select c.provider_customer_id, c.provider
    from public.billing_customers c
    where c.user_id = p.id
    order by c.updated_at desc limit 1
  ) bc on true
  where p.id = auth.uid()
  group by p.id, p.email, u.email, d.fingerprint_hash,
    bc.provider_customer_id, bc.provider;
$$;

create or replace function public.reset_active_device(device_fingerprint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_fp text := nullif(trim(device_fingerprint), '');
  v_last_reset timestamptz;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if v_fp is null then raise exception 'device_fingerprint_required'; end if;

  select d.last_reset_at into v_last_reset
  from public.devices d
  where d.user_id = v_user_id
  for update;

  if v_last_reset is not null and v_last_reset > now() - interval '24 hours' then
    raise exception 'rate_limit: solo 1 reset cada 24h';
  end if;

  insert into public.devices (user_id, fingerprint_hash, first_seen_at, last_seen_at, last_reset_at)
  values (v_user_id, v_fp, now(), now(), now())
  on conflict (user_id) do update
  set fingerprint_hash = excluded.fingerprint_hash,
      last_seen_at = excluded.last_seen_at,
      last_reset_at = excluded.last_reset_at;
end;
$$;

-- The compatibility RPC remains read-only. New clients call claim then read.
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
language sql
stable
security definer
set search_path = ''
as $$
  select r.user_id, r.email, r.entitlements, r.active_device, r.expires_at,
    r.active_device = nullif(trim(device_fingerprint), ''),
    r.provider_customer_id, r.billing_provider
  from public.read_account_entitlements() r;
$$;

alter function public.claim_active_device(text) owner to postgres;
alter function public.read_account_entitlements() owner to postgres;
alter function public.get_account_entitlements(text) owner to postgres;
alter function public.reset_active_device(text) owner to postgres;

revoke all on function public.claim_active_device(text) from public, anon, authenticated;
revoke all on function public.read_account_entitlements() from public, anon, authenticated;
revoke all on function public.get_account_entitlements(text) from public, anon, authenticated;
revoke all on function public.reset_active_device(text) from public, anon, authenticated;

grant execute on function public.claim_active_device(text) to authenticated;
grant execute on function public.read_account_entitlements() to authenticated;
grant execute on function public.get_account_entitlements(text) to authenticated;
grant execute on function public.reset_active_device(text) to authenticated;

comment on function public.get_account_entitlements(text) is
  'Deprecated read-only compatibility wrapper. Use claim_active_device then read_account_entitlements.';

revoke insert, update, delete on table public.devices from anon, authenticated;
revoke insert, update, delete on table public.user_entitlements from anon, authenticated;
revoke insert, update, delete on table public.license_events from anon, authenticated;
revoke insert, update, delete on table public.billing_customers from anon, authenticated;
revoke insert, update, delete on table public.billing_subscriptions from anon, authenticated;
