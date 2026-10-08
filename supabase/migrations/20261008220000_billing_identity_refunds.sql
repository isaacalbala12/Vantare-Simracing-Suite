-- ISA-1514: durable checkout ownership; orders include subscription invoices.
-- Refund restrictions are independent of paid-through grants. A late renewal
-- cannot lift a refund, and a failed refund cannot revive an expired grant.
begin;
create table public.billing_checkout_bindings (
  environment text not null check(environment in ('sandbox','production')),
  provider_checkout_id text not null check(length(provider_checkout_id) between 1 and 200),
  user_id uuid not null references public.profiles(id) on delete restrict,
  attempt_id uuid not null,
  checkout_key text not null,
  catalog_version text not null,
  created_at timestamptz not null default now(),
  primary key(environment,provider_checkout_id),
  unique(environment,user_id,attempt_id)
);
alter table public.billing_checkout_bindings enable row level security;
revoke all on public.billing_checkout_bindings from public,anon,authenticated;
grant select on public.billing_checkout_bindings to service_role;
create function private.retain_checkout_binding()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='open' and new.provider_checkout_id is not null then
    insert into public.billing_checkout_bindings(environment,provider_checkout_id,user_id,attempt_id,checkout_key,catalog_version)
      values(new.environment,new.provider_checkout_id,new.user_id,new.attempt_id,new.checkout_key,new.catalog_version)
      on conflict(environment,provider_checkout_id) do nothing;
    if not exists(select 1 from public.billing_checkout_bindings b
      where b.environment=new.environment and b.provider_checkout_id=new.provider_checkout_id
        and b.user_id=new.user_id and b.attempt_id=new.attempt_id
        and b.checkout_key=new.checkout_key and b.catalog_version=new.catalog_version) then
      raise exception 'checkout_binding_conflict';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.retain_checkout_binding() from public,anon,authenticated,service_role;
create trigger retain_checkout_binding after insert or update on public.billing_checkout_attempts
  for each row execute function private.retain_checkout_binding();
alter table public.billing_orders add column provider_subscription_id text;
alter table public.billing_refunds alter column provider_payment_id drop not null;
drop function public.billing_record_order_snapshot(text,text,uuid,text,text,text,boolean,bigint,text,bigint,timestamptz,text);
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
  p_snapshot_hash text,
  p_subscription_id text default null
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
      provider_checkout_id, provider_subscription_id, status, paid, net_amount, currency,
      reported_refunded_amount, remote_modified_at, snapshot_hash
    ) values (
      p_user_id, p_environment, trim(p_order_id), trim(p_product_id),
      nullif(trim(p_checkout_id), ''), nullif(trim(p_subscription_id), ''), p_status, true, p_net_amount, p_currency,
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

  if v_order.provider_subscription_id is distinct from nullif(trim(p_subscription_id), '')
     or v_order.user_id <> p_user_id
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

create table public.billing_access_blocks (
  environment text not null check(environment in ('sandbox','production')),
  source_type text not null check(source_type in ('order','subscription')),
  source_id text not null,
  cause_type text not null check(cause_type in ('refund','dispute')),
  cause_id text not null,
  user_id uuid not null references public.profiles(id) on delete restrict,
  blocked boolean not null,
  remote_modified_at timestamptz not null,
  snapshot_hash text not null check(snapshot_hash ~ '^[0-9a-f]{64}$'),
  primary key(environment,cause_type,cause_id)
);
alter table public.billing_access_blocks enable row level security;
revoke all on public.billing_access_blocks from public,anon,authenticated;
grant select on public.billing_access_blocks to service_role;

create view public.billing_effective_access_grants as
select g.* from public.billing_access_grants g
where not exists(select 1 from public.account_identities i where i.account_id=g.user_id and i.deleted_at is not null)
  and not exists(select 1 from public.billing_access_blocks b
    where b.user_id=g.user_id and b.environment=g.environment and b.blocked
      and ((b.source_type=g.source_type and b.source_id=g.source_id)
        or (b.source_type='subscription' and g.source_type='subscription_recovery'
          and b.source_id=g.metadata->>'subscription_id')));
revoke all on public.billing_effective_access_grants from public,anon,authenticated;
grant select on public.billing_effective_access_grants to service_role;

-- Every existing grant projection refreshes through this function, so later
-- order/subscription events cannot bypass a still-active restriction.
do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.billing_refresh_entitlement_read_model_at(uuid,timestamptz)'::regprocedure);
  definition := replace(definition,'public.billing_access_grants g','public.billing_effective_access_grants g');
  execute definition;
end $$;

create or replace function public.billing_sync_order_access(p_environment text,p_order_id text,p_capabilities jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare o public.billing_orders; refund public.billing_refunds; capability text; capabilities text[] := '{}';
begin
  if p_environment not in ('sandbox','production') or p_capabilities is null or jsonb_typeof(p_capabilities)<>'array'
    or jsonb_array_length(p_capabilities) not between 1 and 32 then raise exception 'invalid_order_access_sync'; end if;
  if exists(select 1 from jsonb_array_elements(p_capabilities) item
    where jsonb_typeof(item)<>'string' or length(trim(item #>> '{}')) not between 1 and 128) then
    raise exception 'invalid_capability';
  end if;
  select * into o from public.billing_orders where environment=p_environment and provider_order_id=p_order_id for update;
  if not found then raise exception 'missing_order'; end if;
  insert into public.billing_commercial_resources(user_id,provider,environment,resource_type,resource_id,
    remote_state,remote_modified_at,snapshot_hash,metadata)
    values(o.user_id,'polar',p_environment,'order',p_order_id,o.status,o.remote_modified_at,o.snapshot_hash,
      jsonb_build_object('net_amount',o.net_amount,'currency',o.currency,'subscription_id',o.provider_subscription_id))
    on conflict(provider,environment,resource_type,resource_id) do update set remote_state=excluded.remote_state,
      remote_modified_at=excluded.remote_modified_at,snapshot_hash=excluded.snapshot_hash,metadata=excluded.metadata,updated_at=now()
    where billing_commercial_resources.user_id=excluded.user_id;
  if not found then raise exception 'commercial_resource_owner_mismatch'; end if;
  for refund in select * from public.billing_refunds where environment=p_environment and provider_order_id=p_order_id
  loop
    insert into public.billing_access_blocks(environment,source_type,source_id,cause_type,cause_id,user_id,blocked,remote_modified_at,snapshot_hash)
    values(p_environment,case when o.provider_subscription_id is null then 'order' else 'subscription' end,
      coalesce(o.provider_subscription_id,p_order_id),'refund',refund.provider_refund_id,o.user_id,
      refund.status in ('pending','succeeded'),refund.remote_modified_at,refund.snapshot_hash)
    on conflict(environment,cause_type,cause_id) do update set blocked=excluded.blocked,
      remote_modified_at=excluded.remote_modified_at,snapshot_hash=excluded.snapshot_hash
    where billing_access_blocks.user_id=excluded.user_id
      and billing_access_blocks.source_type=excluded.source_type and billing_access_blocks.source_id=excluded.source_id
      and billing_access_blocks.remote_modified_at<=excluded.remote_modified_at;
    if not found then raise exception 'refund_block_attribution_conflict'; end if;
  end loop;
  -- Subscription orders never grant perpetual Pro. Their base grant remains
  -- owned by subscription lifecycle; clearing a block preserves paid-through.
  if o.provider_subscription_id is null then
    for capability in select jsonb_array_elements_text(p_capabilities)
    loop
      capability := trim(capability);
      capabilities := array_append(capabilities,capability);
      if length(capability) not between 1 and 128 then raise exception 'invalid_capability'; end if;
      insert into public.billing_access_grants(user_id,provider,environment,source_type,source_id,capability,status,valid_until,resource_modified_at,snapshot_hash,metadata)
      values(o.user_id,'polar',p_environment,'order',p_order_id,capability,'active',null,o.remote_modified_at,o.snapshot_hash,'{}'::jsonb)
      on conflict(provider,environment,source_type,source_id,capability) do update
        set status='active',valid_until=null,resource_modified_at=excluded.resource_modified_at,snapshot_hash=excluded.snapshot_hash
        where billing_access_grants.user_id=excluded.user_id;
      if not found then raise exception 'access_grant_owner_mismatch'; end if;
    end loop;
    update public.billing_access_grants g set status='revoked',valid_until=coalesce(g.valid_until,now())
      where g.provider='polar' and g.environment=p_environment and g.source_type='order'
        and g.source_id=p_order_id and g.user_id=o.user_id and not(g.capability=any(capabilities));
  end if;
  perform public.billing_refresh_entitlement_read_model(o.user_id);
end $$;

revoke all on function public.billing_record_order_snapshot(text,text,uuid,text,text,text,boolean,bigint,text,bigint,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.billing_record_order_snapshot(text,text,uuid,text,text,text,boolean,bigint,text,bigint,timestamptz,text,text) to service_role;
revoke all on function public.billing_sync_order_access(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.billing_sync_order_access(text,text,jsonb) to service_role;
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
     or (p_payment_id is not null and length(trim(p_payment_id)) not between 1 and 200)
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
       or (v_refund.provider_payment_id is not null and p_payment_id is not null
         and v_refund.provider_payment_id <> nullif(trim(p_payment_id), ''))
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
    updated_at = now()
    where billing_refunds.provider_order_id=excluded.provider_order_id
      and billing_refunds.amount=excluded.amount and billing_refunds.currency=excluded.currency
      and (billing_refunds.provider_payment_id is null or excluded.provider_payment_id is null
        or billing_refunds.provider_payment_id=excluded.provider_payment_id)
      and billing_refunds.remote_modified_at<excluded.remote_modified_at
      and (billing_refunds.status<>'succeeded' or excluded.status='succeeded');
  if not found then return query select 'invalid_attribution'::text; return; end if;
  return query select 'apply'::text;
end;
$$;

create function public.billing_record_dispute_snapshot(
  p_environment text,p_dispute_id text,p_order_id text,p_blocked boolean,p_modified_at timestamptz,p_snapshot_hash text
)
returns text language plpgsql security definer set search_path='' as $$
declare o public.billing_orders; b public.billing_access_blocks;
begin
  if p_environment not in ('sandbox','production') or p_blocked is null or p_modified_at is null
    or p_dispute_id is null or length(p_dispute_id) not between 1 and 200
    or p_snapshot_hash is null or p_snapshot_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_dispute_snapshot'; end if;
  select * into o from public.billing_orders where environment=p_environment and provider_order_id=p_order_id for update;
  if not found then return 'missing_order'; end if;
  select * into b from public.billing_access_blocks where environment=p_environment and cause_type='dispute' and cause_id=p_dispute_id for update;
  if found then
    if b.user_id<>o.user_id or b.source_id<>coalesce(o.provider_subscription_id,p_order_id)
      or b.source_type<>case when o.provider_subscription_id is null then 'order' else 'subscription' end then
      raise exception 'dispute_attribution_conflict';
    end if;
    if p_modified_at<b.remote_modified_at then return 'applied'; end if;
    if p_modified_at=b.remote_modified_at and p_snapshot_hash<>b.snapshot_hash then raise exception 'dispute_version_conflict'; end if;
  end if;
  insert into public.billing_access_blocks(environment,source_type,source_id,cause_type,cause_id,user_id,blocked,remote_modified_at,snapshot_hash)
    values(p_environment,case when o.provider_subscription_id is null then 'order' else 'subscription' end,
      coalesce(o.provider_subscription_id,p_order_id),'dispute',p_dispute_id,o.user_id,p_blocked,p_modified_at,p_snapshot_hash)
    on conflict(environment,cause_type,cause_id) do update set blocked=excluded.blocked,
      remote_modified_at=excluded.remote_modified_at,snapshot_hash=excluded.snapshot_hash
    where billing_access_blocks.user_id=excluded.user_id and billing_access_blocks.source_type=excluded.source_type
      and billing_access_blocks.source_id=excluded.source_id
      and (billing_access_blocks.remote_modified_at<excluded.remote_modified_at
        or (billing_access_blocks.remote_modified_at=excluded.remote_modified_at
          and billing_access_blocks.snapshot_hash=excluded.snapshot_hash));
  if not found then raise exception 'dispute_concurrent_conflict'; end if;
  perform public.billing_refresh_entitlement_read_model(o.user_id);
  return 'applied';
end $$;
revoke all on function public.billing_record_dispute_snapshot(text,text,text,boolean,timestamptz,text) from public,anon,authenticated;
grant execute on function public.billing_record_dispute_snapshot(text,text,text,boolean,timestamptz,text) to service_role;
-- Durable pagination and lease: after an outage the same page is retried.
-- No provider token is stored in this table.
create table private.billing_reconciliation_cursor (
  environment text primary key check(environment in ('sandbox','production')),
  resource text not null default 'orders' check(resource in ('orders','subscriptions','refunds','disputes')),
  page integer not null default 1 check(page>0),
  lease_token uuid,
  lease_until timestamptz,
  last_progress_at timestamptz,
  last_failure_at timestamptz
);
revoke all on private.billing_reconciliation_cursor from public,anon,authenticated,service_role;
create function public.claim_billing_reconciliation(p_environment text,p_lease_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.billing_reconciliation_cursor;
begin
  if p_environment not in ('sandbox','production') or p_environment is null or p_lease_token is null then
    raise exception 'invalid_reconciliation_claim'; end if;
  insert into private.billing_reconciliation_cursor(environment) values(p_environment) on conflict do nothing;
  select * into c from private.billing_reconciliation_cursor where environment=p_environment for update;
  if c.lease_until>clock_timestamp() then return null; end if;
  update private.billing_reconciliation_cursor set lease_token=p_lease_token,lease_until=clock_timestamp()+interval '2 minutes'
    where environment=p_environment;
  return jsonb_build_object('resource',c.resource,'page',c.page);
end $$;
create function public.complete_billing_reconciliation(p_environment text,p_lease_token uuid,p_next_resource text,p_next_page integer)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if p_next_resource not in ('orders','subscriptions','refunds','disputes') or p_next_resource is null
    or p_next_page is null or p_next_page<1 then raise exception 'invalid_reconciliation_cursor'; end if;
  update private.billing_reconciliation_cursor set resource=p_next_resource,page=p_next_page,
    last_progress_at=clock_timestamp(),lease_until=clock_timestamp()+interval '2 minutes'
    where environment=p_environment and lease_token=p_lease_token and lease_until>clock_timestamp();
  return found;
end $$;
create function public.release_billing_reconciliation(p_environment text,p_lease_token uuid,p_failed boolean default false)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  update private.billing_reconciliation_cursor set lease_token=null,lease_until=null,
    last_failure_at=case when p_failed then clock_timestamp() else last_failure_at end
    where environment=p_environment and lease_token=p_lease_token;
  return found;
end $$;
revoke all on function public.claim_billing_reconciliation(text,uuid),
  public.complete_billing_reconciliation(text,uuid,text,integer),
  public.release_billing_reconciliation(text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.claim_billing_reconciliation(text,uuid),
  public.complete_billing_reconciliation(text,uuid,text,integer),
  public.release_billing_reconciliation(text,uuid,boolean) to service_role;
commit;
