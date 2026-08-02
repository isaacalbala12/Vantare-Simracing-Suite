-- BIL-07: attributable one-time order/refund ledger.
-- Polar order aggregates are retained for reconciliation, but only succeeded
-- refunds identified by refund_id and order_id can revoke an order grant.

create table public.billing_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null default 'polar' check (provider = 'polar'),
  environment text not null check (environment in ('sandbox', 'production')),
  provider_order_id text not null check (length(provider_order_id) between 1 and 200),
  provider_product_id text not null check (length(provider_product_id) between 1 and 200),
  provider_checkout_id text check (provider_checkout_id is null or length(provider_checkout_id) between 1 and 200),
  status text not null check (status in ('paid', 'partially_refunded', 'refunded')),
  paid boolean not null check (paid),
  net_amount bigint not null check (net_amount > 0),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  reported_refunded_amount bigint not null default 0
    check (reported_refunded_amount >= 0 and reported_refunded_amount <= net_amount),
  remote_modified_at timestamptz not null,
  snapshot_hash text not null check (snapshot_hash ~ '^[0-9a-f]{64}$'),
  stale_event_count integer not null default 0 check (stale_event_count >= 0),
  conflict_count integer not null default 0 check (conflict_count >= 0),
  last_stale_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, environment, provider_order_id)
);

create table public.billing_refunds (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'polar' check (provider = 'polar'),
  environment text not null check (environment in ('sandbox', 'production')),
  provider_refund_id text not null check (length(provider_refund_id) between 1 and 200),
  provider_order_id text not null check (length(provider_order_id) between 1 and 200),
  provider_payment_id text not null check (length(provider_payment_id) between 1 and 200),
  status text not null check (status in ('pending', 'succeeded', 'failed', 'canceled')),
  amount bigint not null check (amount > 0),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  remote_modified_at timestamptz not null,
  snapshot_hash text not null check (snapshot_hash ~ '^[0-9a-f]{64}$'),
  stale_event_count integer not null default 0 check (stale_event_count >= 0),
  conflict_count integer not null default 0 check (conflict_count >= 0),
  last_stale_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, environment, provider_refund_id),
  foreign key (provider, environment, provider_order_id)
    references public.billing_orders (provider, environment, provider_order_id)
    on delete restrict
);

create index billing_orders_user_idx
  on public.billing_orders (user_id, environment, remote_modified_at desc);
create index billing_refunds_order_idx
  on public.billing_refunds (environment, provider_order_id, status);

alter table public.billing_orders enable row level security;
alter table public.billing_refunds enable row level security;
revoke all on table public.billing_orders from anon, authenticated;
revoke all on table public.billing_refunds from anon, authenticated;

create or replace function public.billing_record_order_snapshot(
  p_environment text,
  p_order_id text,
  p_user_id uuid,
  p_product_id text,
  p_checkout_id text,
  p_status text,
  p_paid boolean,
  p_net_amount bigint,
  p_currency text,
  p_reported_refunded_amount bigint,
  p_modified_at timestamptz,
  p_snapshot_hash text
)
returns table(outcome text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.billing_orders%rowtype;
  v_succeeded bigint;
begin
  if p_environment not in ('sandbox', 'production')
     or nullif(trim(p_order_id), '') is null or length(trim(p_order_id)) > 200
     or nullif(trim(p_product_id), '') is null or length(trim(p_product_id)) > 200
     or (p_checkout_id is not null and length(trim(p_checkout_id)) not between 1 and 200)
     or p_status not in ('paid', 'partially_refunded', 'refunded')
     or p_paid is not true
     or p_net_amount is null or p_net_amount <= 0
     or p_currency !~ '^[a-z]{3}$'
     or p_reported_refunded_amount is null
     or p_reported_refunded_amount < 0
     or p_reported_refunded_amount > p_net_amount
     or (p_status = 'paid' and p_reported_refunded_amount <> 0)
     or (p_status = 'partially_refunded' and (p_reported_refunded_amount = 0 or p_reported_refunded_amount = p_net_amount))
     or (p_status = 'refunded' and p_reported_refunded_amount <> p_net_amount)
     or p_modified_at is null
     or p_snapshot_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_order_snapshot';
  end if;

  select * into v_order
  from public.billing_orders order_row
  where order_row.provider = 'polar'
    and order_row.environment = p_environment
    and order_row.provider_order_id = trim(p_order_id)
  for update;

  if not found then
    insert into public.billing_orders (
      user_id, environment, provider_order_id, provider_product_id,
      provider_checkout_id, status, paid, net_amount, currency,
      reported_refunded_amount, remote_modified_at, snapshot_hash
    ) values (
      p_user_id, p_environment, trim(p_order_id), trim(p_product_id),
      nullif(trim(p_checkout_id), ''), p_status, true, p_net_amount, p_currency,
      p_reported_refunded_amount, p_modified_at, p_snapshot_hash
    ) on conflict (provider, environment, provider_order_id) do nothing;
    if found then
      return query select 'apply'::text;
      return;
    end if;

    select * into v_order
    from public.billing_orders order_row
    where order_row.provider = 'polar'
      and order_row.environment = p_environment
      and order_row.provider_order_id = trim(p_order_id)
    for update;
    if not found then
      raise exception 'order_insert_race';
    end if;
  end if;

  if v_order.user_id <> p_user_id
     or v_order.provider_product_id <> trim(p_product_id)
     or (v_order.provider_checkout_id is not null
       and nullif(trim(p_checkout_id), '') is not null
       and v_order.provider_checkout_id <> nullif(trim(p_checkout_id), ''))
     or v_order.net_amount <> p_net_amount
     or v_order.currency <> p_currency then
    return query select 'invalid_attribution'::text;
    return;
  end if;
  if p_modified_at < v_order.remote_modified_at then
    update public.billing_orders set
      stale_event_count = stale_event_count + 1,
      last_stale_event_at = now(), updated_at = now()
    where id = v_order.id;
    return query select 'stale_noop'::text;
    return;
  end if;
  if p_modified_at = v_order.remote_modified_at then
    if p_snapshot_hash = v_order.snapshot_hash then
      return query select 'duplicate'::text;
    else
      update public.billing_orders set
        conflict_count = conflict_count + 1, updated_at = now()
      where id = v_order.id;
      return query select 'version_conflict'::text;
    end if;
    return;
  end if;

  select coalesce(sum(amount), 0) into v_succeeded
  from public.billing_refunds refund
  where refund.provider = 'polar'
    and refund.environment = p_environment
    and refund.provider_order_id = trim(p_order_id)
    and refund.status = 'succeeded';
  if v_succeeded > p_net_amount then
    return query select 'refund_total_exceeds_order'::text;
    return;
  end if;

  update public.billing_orders set
    provider_checkout_id = coalesce(nullif(trim(p_checkout_id), ''), provider_checkout_id),
    status = p_status, reported_refunded_amount = p_reported_refunded_amount,
    remote_modified_at = p_modified_at, snapshot_hash = p_snapshot_hash,
    updated_at = now()
  where id = v_order.id;
  return query select 'apply'::text;
end;
$$;

create or replace function public.billing_record_refund_snapshot(
  p_environment text,
  p_refund_id text,
  p_order_id text,
  p_payment_id text,
  p_status text,
  p_amount bigint,
  p_currency text,
  p_modified_at timestamptz,
  p_snapshot_hash text
)
returns table(outcome text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.billing_orders%rowtype;
  v_refund public.billing_refunds%rowtype;
  v_total bigint;
begin
  if p_environment not in ('sandbox', 'production')
     or nullif(trim(p_refund_id), '') is null or length(trim(p_refund_id)) > 200
     or nullif(trim(p_order_id), '') is null or length(trim(p_order_id)) > 200
     or nullif(trim(p_payment_id), '') is null or length(trim(p_payment_id)) > 200
     or p_status not in ('pending', 'succeeded', 'failed', 'canceled')
     or p_amount is null or p_amount <= 0
     or p_currency !~ '^[a-z]{3}$'
     or p_modified_at is null
     or p_snapshot_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_refund_snapshot';
  end if;

  select * into v_order
  from public.billing_orders order_row
  where order_row.provider = 'polar'
    and order_row.environment = p_environment
    and order_row.provider_order_id = trim(p_order_id)
  for update;
  if not found then
    return query select 'missing_order'::text;
    return;
  end if;
  if v_order.currency <> p_currency then
    return query select 'currency_mismatch'::text;
    return;
  end if;

  select * into v_refund
  from public.billing_refunds refund
  where refund.provider = 'polar'
    and refund.environment = p_environment
    and refund.provider_refund_id = trim(p_refund_id)
  for update;
  if found then
    if v_refund.provider_order_id <> trim(p_order_id)
       or v_refund.provider_payment_id is distinct from nullif(trim(p_payment_id), '')
       or v_refund.amount <> p_amount
       or v_refund.currency <> p_currency then
      return query select 'invalid_attribution'::text;
      return;
    end if;
    if p_modified_at < v_refund.remote_modified_at then
      update public.billing_refunds set
        stale_event_count = stale_event_count + 1,
        last_stale_event_at = now(), updated_at = now()
      where id = v_refund.id;
      return query select 'stale_noop'::text;
      return;
    end if;
    if p_modified_at = v_refund.remote_modified_at then
      if p_snapshot_hash = v_refund.snapshot_hash then
        return query select 'duplicate'::text;
      else
        update public.billing_refunds set
          conflict_count = conflict_count + 1, updated_at = now()
        where id = v_refund.id;
        return query select 'version_conflict'::text;
      end if;
      return;
    end if;
    if v_refund.status = 'succeeded' and p_status <> 'succeeded' then
      return query select 'invalid_transition'::text;
      return;
    end if;
  end if;

  select coalesce(sum(amount), 0) into v_total
  from public.billing_refunds refund
  where refund.provider = 'polar'
    and refund.environment = p_environment
    and refund.provider_order_id = trim(p_order_id)
    and refund.status = 'succeeded'
    and (v_refund.id is null or refund.id <> v_refund.id);
  if p_status = 'succeeded' then v_total := v_total + p_amount; end if;
  if v_total > v_order.net_amount then
    return query select 'refund_total_exceeds_order'::text;
    return;
  end if;

  insert into public.billing_refunds (
    environment, provider_refund_id, provider_order_id, provider_payment_id,
    status, amount, currency, remote_modified_at, snapshot_hash
  ) values (
    p_environment, trim(p_refund_id), trim(p_order_id),
    nullif(trim(p_payment_id), ''), p_status, p_amount, p_currency,
    p_modified_at, p_snapshot_hash
  ) on conflict (provider, environment, provider_refund_id) do update set
    status = excluded.status,
    remote_modified_at = excluded.remote_modified_at,
    snapshot_hash = excluded.snapshot_hash,
    updated_at = now();
  return query select 'apply'::text;
end;
$$;

create or replace function public.billing_sync_order_access(
  p_environment text,
  p_order_id text,
  p_capabilities jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.billing_orders%rowtype;
  v_refunded bigint;
  v_modified_at timestamptz;
  v_state text;
  v_status text;
  v_snapshot_hash text;
  v_capability jsonb;
  v_capabilities text[] := '{}'::text[];
begin
  if p_environment not in ('sandbox', 'production')
     or nullif(trim(p_order_id), '') is null
     or jsonb_typeof(p_capabilities) <> 'array'
     or jsonb_array_length(p_capabilities) = 0
     or jsonb_array_length(p_capabilities) > 32 then
    raise exception 'invalid_order_access_sync';
  end if;
  select * into v_order
  from public.billing_orders order_row
  where order_row.provider = 'polar'
    and order_row.environment = p_environment
    and order_row.provider_order_id = trim(p_order_id)
  for update;
  if not found then raise exception 'missing_order'; end if;

  select coalesce(sum(amount), 0),
         greatest(v_order.remote_modified_at, coalesce(max(remote_modified_at), v_order.remote_modified_at))
  into v_refunded, v_modified_at
  from public.billing_refunds refund
  where refund.provider = 'polar'
    and refund.environment = p_environment
    and refund.provider_order_id = trim(p_order_id)
    and refund.status = 'succeeded';
  if v_refunded > v_order.net_amount then raise exception 'refund_total_exceeds_order'; end if;
  v_status := case when v_refunded >= v_order.net_amount then 'revoked' else 'active' end;
  v_state := case
    when v_status = 'revoked' then 'refunded'
    when v_refunded > 0 then 'partially_refunded'
    else 'paid'
  end;
  select encode(extensions.digest(
    v_order.snapshot_hash || ':' || v_refunded::text || ':' ||
    coalesce(string_agg(refund.provider_refund_id || ':' || refund.snapshot_hash, ',' order by refund.provider_refund_id), '') || ':' ||
    p_capabilities::text,
    'sha256'
  ), 'hex') into v_snapshot_hash
  from public.billing_refunds refund
  where refund.provider = 'polar'
    and refund.environment = p_environment
    and refund.provider_order_id = trim(p_order_id);

  perform 1
  from public.billing_commercial_resources resource
  where resource.provider = 'polar'
    and resource.environment = p_environment
    and resource.resource_type = 'order'
    and resource.resource_id = trim(p_order_id)
  for update;
  if found and exists (
    select 1
    from public.billing_commercial_resources resource
    where resource.provider = 'polar'
      and resource.environment = p_environment
      and resource.resource_type = 'order'
      and resource.resource_id = trim(p_order_id)
      and resource.user_id <> v_order.user_id
  ) then
    raise exception 'commercial_resource_owner_mismatch';
  end if;

  perform 1
  from public.billing_access_grants grant_row
  where grant_row.provider = 'polar'
    and grant_row.environment = p_environment
    and grant_row.source_type = 'order'
    and grant_row.source_id = trim(p_order_id)
  for update;
  if found and exists (
    select 1
    from public.billing_access_grants grant_row
    where grant_row.provider = 'polar'
      and grant_row.environment = p_environment
      and grant_row.source_type = 'order'
      and grant_row.source_id = trim(p_order_id)
      and grant_row.user_id <> v_order.user_id
  ) then
    raise exception 'access_grant_owner_mismatch';
  end if;

  insert into public.billing_commercial_resources (
    user_id, provider, environment, resource_type, resource_id,
    remote_state, remote_modified_at, snapshot_hash,
    metadata
  ) values (
    v_order.user_id, 'polar', p_environment, 'order', trim(p_order_id),
    v_state, v_modified_at, v_snapshot_hash,
    jsonb_build_object(
      'net_amount', v_order.net_amount,
      'succeeded_refund_amount', v_refunded,
      'reported_refunded_amount', v_order.reported_refunded_amount,
      'currency', v_order.currency
    )
  ) on conflict (provider, environment, resource_type, resource_id) do update set
    user_id = excluded.user_id,
    remote_state = excluded.remote_state,
    remote_modified_at = excluded.remote_modified_at,
    snapshot_hash = excluded.snapshot_hash,
    metadata = excluded.metadata,
    updated_at = now()
  where billing_commercial_resources.user_id = excluded.user_id;
  if not found then raise exception 'commercial_resource_owner_mismatch'; end if;

  for v_capability in select value from jsonb_array_elements(p_capabilities)
  loop
    if jsonb_typeof(v_capability) <> 'string'
       or length(trim(v_capability #>> '{}')) not between 1 and 128 then
      raise exception 'invalid_order_access_sync';
    end if;
    v_capabilities := array_append(v_capabilities, trim(v_capability #>> '{}'));
    insert into public.billing_access_grants (
      user_id, provider, environment, source_type, source_id, capability,
      status, valid_until, resource_modified_at, snapshot_hash, metadata
    ) values (
      v_order.user_id, 'polar', p_environment, 'order', trim(p_order_id),
      trim(v_capability #>> '{}'), v_status,
      case when v_status = 'revoked' then v_modified_at else null end,
      v_modified_at, v_snapshot_hash,
      jsonb_build_object(
        'remote_state', v_state,
        'succeeded_refund_amount', v_refunded
      )
    ) on conflict (provider, environment, source_type, source_id, capability)
    do update set
      user_id = excluded.user_id,
      status = excluded.status,
      valid_until = excluded.valid_until,
      resource_modified_at = excluded.resource_modified_at,
      snapshot_hash = excluded.snapshot_hash,
      metadata = excluded.metadata,
      updated_at = now()
    where billing_access_grants.user_id = excluded.user_id;
    if not found then raise exception 'access_grant_owner_mismatch'; end if;
  end loop;

  update public.billing_access_grants grant_row set
    status = 'revoked',
    valid_until = coalesce(grant_row.valid_until, v_modified_at),
    resource_modified_at = v_modified_at,
    snapshot_hash = v_snapshot_hash,
    updated_at = now()
  where grant_row.provider = 'polar'
    and grant_row.environment = p_environment
    and grant_row.source_type = 'order'
    and grant_row.source_id = trim(p_order_id)
    and not (grant_row.capability = any(v_capabilities));

  perform public.billing_refresh_entitlement_read_model(v_order.user_id);
end;
$$;

revoke all on function public.billing_record_order_snapshot(text, text, uuid, text, text, text, boolean, bigint, text, bigint, timestamptz, text) from public, anon, authenticated;
revoke all on function public.billing_record_refund_snapshot(text, text, text, text, text, bigint, text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.billing_sync_order_access(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.billing_record_order_snapshot(text, text, uuid, text, text, text, boolean, bigint, text, bigint, timestamptz, text) to service_role;
grant execute on function public.billing_record_refund_snapshot(text, text, text, text, text, bigint, text, timestamptz, text) to service_role;
grant execute on function public.billing_sync_order_access(text, text, jsonb) to service_role;

comment on table public.billing_orders is
  'Minimal server-only Polar one-time order ledger; aggregates never revoke without attributed succeeded refunds.';
comment on table public.billing_refunds is
  'Minimal server-only Polar refund ledger attributed by refund, payment and order identifiers.';
