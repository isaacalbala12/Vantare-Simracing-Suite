-- BIL-06: paid subscription periods and one bounded recovery grant per cycle.
-- Polar subscription grants remain commercial. Vantare recovery grants are a
-- separate, auditable local policy source and never modify paid_through.

alter table public.billing_access_grants
  drop constraint if exists billing_access_grants_provider_check;
alter table public.billing_access_grants
  add constraint billing_access_grants_provider_check
  check (provider in ('polar', 'vantare', 'legacy'));

alter table public.billing_access_grants
  drop constraint if exists billing_access_grants_source_type_check;
alter table public.billing_access_grants
  add constraint billing_access_grants_source_type_check
  check (source_type in (
    'order', 'subscription', 'subscription_recovery', 'benefit_grant',
    'legacy', 'support'
  ));

alter table public.billing_subscriptions
  add column if not exists environment text,
  add column if not exists paid_through timestamptz,
  add column if not exists recovery_cycle_paid_through timestamptz,
  add column if not exists recovery_started_at timestamptz,
  add column if not exists recovery_until timestamptz;

update public.billing_subscriptions subscription
set environment = coalesce((
  select r.environment
  from public.billing_commercial_resources r
  where r.provider = subscription.provider
    and r.resource_type = 'subscription'
    and r.resource_id = subscription.provider_subscription_id
  order by r.remote_modified_at desc
  limit 1
), 'legacy')
where subscription.environment is null;

update public.billing_subscriptions
set environment = 'legacy'
where environment is null;

update public.billing_subscriptions
set paid_through = case
  when lower(status) in ('active', 'uncanceled', 'trialing') then current_period_end
  when lower(status) in ('canceled', 'cancelled') and cancel_at_period_end
    then current_period_end
  else null
end,
recovery_cycle_paid_through = null,
recovery_started_at = null,
recovery_until = null,
metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
  'derived', true,
  'lifecycle_version', 1,
  'legacy_recovery_preserved', false
);

alter table public.billing_subscriptions
  alter column environment set not null;
alter table public.billing_subscriptions
  add constraint billing_subscriptions_environment_check
  check (environment in ('sandbox', 'production', 'legacy'));
alter table public.billing_subscriptions
  add constraint billing_subscriptions_recovery_fields_check check (
    (recovery_cycle_paid_through is null and recovery_started_at is null and recovery_until is null)
    or (
      recovery_cycle_paid_through is not null
      and recovery_started_at is not null
      and recovery_until is not null
      and recovery_until >= recovery_started_at
      and recovery_until <= recovery_started_at + interval '72 hours'
    )
  );

alter table public.billing_subscriptions
  drop constraint if exists billing_subscriptions_provider_provider_subscription_id_key;
create unique index if not exists billing_subscriptions_provider_environment_id_uq
  on public.billing_subscriptions (provider, environment, provider_subscription_id);

create table public.billing_subscription_recovery_cycles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null check (provider = 'polar'),
  environment text not null check (environment in ('sandbox', 'production')),
  subscription_id text not null check (length(subscription_id) between 1 and 200),
  cycle_paid_through timestamptz not null,
  first_failure_at timestamptz not null,
  recovery_until timestamptz not null,
  closed_at timestamptz,
  close_reason text check (close_reason is null or length(close_reason) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, environment, subscription_id, cycle_paid_through),
  check (recovery_until = first_failure_at + interval '72 hours')
);

create index billing_subscription_recovery_user_idx
  on public.billing_subscription_recovery_cycles (user_id, created_at desc);
alter table public.billing_subscription_recovery_cycles enable row level security;
revoke all on table public.billing_subscription_recovery_cycles from anon, authenticated;

create or replace function public.billing_refresh_entitlement_read_model_at(
  p_user_id uuid,
  p_evaluated_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_active_count integer;
  v_has_lifetime boolean;
  v_expires_at timestamptz;
begin
  if p_evaluated_at is null then raise exception 'invalid_evaluation_time'; end if;
  select count(*)::integer, bool_or(g.valid_until is null), max(g.valid_until)
  into v_active_count, v_has_lifetime, v_expires_at
  from public.billing_access_grants g
  where g.user_id = p_user_id
    and g.status = 'active'
    and g.capability in ('vantare.plan.pro', 'vantare.edition.launch_v1')
    and (g.valid_until is null or p_evaluated_at < g.valid_until);

  insert into public.user_entitlements (
    user_id, product_key, status, source, expires_at, metadata, updated_at
  ) values (
    p_user_id,
    'bundle',
    case when v_active_count > 0 then 'active' else 'revoked' end,
    'billing_projection',
    case
      when v_active_count = 0 then p_evaluated_at
      when v_has_lifetime then null
      else v_expires_at
    end,
    jsonb_build_object('derived', true, 'active_source_count', v_active_count),
    p_evaluated_at
  )
  on conflict (user_id, product_key) do update set
    status = excluded.status,
    source = excluded.source,
    expires_at = excluded.expires_at,
    metadata = excluded.metadata,
    updated_at = excluded.updated_at;
end;
$$;

create or replace function public.billing_refresh_entitlement_read_model(p_user_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  select public.billing_refresh_entitlement_read_model_at(p_user_id, now())
$$;

-- Existing subscription grants are kept only when the paid period can be
-- demonstrated by the derived subscription row. past_due never backfills a
-- recovery cycle during upgrade.
update public.billing_access_grants grant_row
set status = case
      when subscription.paid_through is not null
        and now() < subscription.paid_through
        and (
          lower(subscription.status) in ('active', 'uncanceled')
          or (lower(subscription.status) in ('canceled', 'cancelled') and subscription.cancel_at_period_end)
        )
      then 'active'
      else 'revoked'
    end,
    valid_until = coalesce(subscription.paid_through, now()),
    metadata = coalesce(grant_row.metadata, '{}'::jsonb) || jsonb_build_object(
      'lifecycle_version', 1,
      'paid_through_proven', subscription.paid_through is not null
    ),
    updated_at = now()
from public.billing_subscriptions subscription
where grant_row.provider = 'polar'
  and grant_row.source_type = 'subscription'
  and subscription.provider = grant_row.provider
  and subscription.environment = grant_row.environment
  and subscription.provider_subscription_id = grant_row.source_id;

update public.billing_access_grants grant_row
set status = 'revoked', valid_until = now(), updated_at = now(),
    metadata = coalesce(grant_row.metadata, '{}'::jsonb) ||
      jsonb_build_object('lifecycle_version', 1, 'paid_through_proven', false)
where grant_row.provider = 'polar'
  and grant_row.source_type = 'subscription'
  and not exists (
    select 1 from public.billing_subscriptions subscription
    where subscription.provider = grant_row.provider
      and subscription.environment = grant_row.environment
      and subscription.provider_subscription_id = grant_row.source_id
  );

select public.billing_refresh_entitlement_read_model(user_row.user_id)
from (
  select distinct user_id
  from public.billing_access_grants
  where source_type = 'subscription'
) user_row;

create or replace function public.billing_apply_subscription_lifecycle(
  p_user_id uuid,
  p_environment text,
  p_subscription_id text,
  p_product_id text,
  p_status text,
  p_period_start timestamptz,
  p_remote_period_end timestamptz,
  p_paid_through timestamptz,
  p_cancel_at_period_end boolean,
  p_modified_at timestamptz,
  p_snapshot_hash text,
  p_recovery_action text,
  p_failure_at timestamptz,
  p_cycle_paid_through timestamptz,
  p_evaluated_at timestamptz,
  p_capabilities text[]
)
returns table(outcome text, effective_recovery_until timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_resource public.billing_commercial_resources%rowtype;
  v_subscription public.billing_subscriptions%rowtype;
  v_cycle public.billing_subscription_recovery_cycles%rowtype;
  v_exact_version boolean;
  v_accept_older_failure boolean := false;
  v_source_id text;
  v_grant record;
  v_recovery_status text;
begin
  if p_environment not in ('sandbox', 'production')
     or p_subscription_id is null or length(trim(p_subscription_id)) not between 1 and 200
     or p_product_id is null or length(trim(p_product_id)) not between 1 and 200
     or p_status not in ('incomplete','incomplete_expired','trialing','active','canceled','uncanceled','past_due','unpaid','revoked')
     or p_modified_at is null or p_evaluated_at is null
     or p_snapshot_hash !~ '^[0-9a-f]{64}$'
     or p_capabilities is null
     or cardinality(p_capabilities) not between 1 and 64
     or exists (
       select 1 from unnest(p_capabilities) capability
       where nullif(trim(capability), '') is null or length(trim(capability)) > 128
     )
     or p_recovery_action not in ('open','close','none') then
    raise exception 'invalid_subscription_lifecycle';
  end if;

  select * into v_resource
  from public.billing_commercial_resources resource
  where resource.provider = 'polar'
    and resource.environment = p_environment
    and resource.resource_type = 'subscription'
    and resource.resource_id = trim(p_subscription_id)
  for update;
  if not found then raise exception 'subscription_resource_not_found'; end if;
  if v_resource.user_id <> p_user_id then
    raise exception 'commercial_resource_owner_mismatch';
  end if;

  select * into v_subscription
  from public.billing_subscriptions subscription
  where subscription.provider = 'polar'
    and subscription.environment = p_environment
    and subscription.provider_subscription_id = trim(p_subscription_id)
  for update;

  v_exact_version := v_resource.remote_modified_at = p_modified_at
    and v_resource.snapshot_hash = p_snapshot_hash;
  v_accept_older_failure := p_status = 'past_due'
    and p_recovery_action = 'open'
    and v_resource.remote_state = 'past_due'
    and p_modified_at < v_resource.remote_modified_at
    and v_subscription.status = 'past_due'
    and v_subscription.paid_through is not null
    and p_remote_period_end = v_subscription.paid_through
    and p_cycle_paid_through = v_subscription.paid_through
    and exists (
      select 1
      from public.billing_subscription_recovery_cycles cycle
      where cycle.provider = 'polar'
        and cycle.environment = p_environment
        and cycle.subscription_id = trim(p_subscription_id)
        and cycle.cycle_paid_through = v_subscription.paid_through
    );
  if not v_exact_version and not v_accept_older_failure then
    return query select 'ignored_version'::text, null::timestamptz;
    return;
  end if;

  if v_exact_version then
    insert into public.billing_subscriptions (
      user_id, provider, environment, provider_subscription_id,
      provider_product_id, provider_price_id, status, current_period_start,
      current_period_end, paid_through, cancel_at_period_end, metadata, updated_at
    ) values (
      p_user_id, 'polar', p_environment, trim(p_subscription_id),
      trim(p_product_id), null, p_status, p_period_start, p_paid_through,
      p_paid_through, p_cancel_at_period_end,
      jsonb_build_object('derived', true, 'lifecycle_version', 1), p_modified_at
    )
    on conflict (provider, environment, provider_subscription_id) do update set
      user_id = excluded.user_id,
      provider_product_id = excluded.provider_product_id,
      status = excluded.status,
      current_period_start = excluded.current_period_start,
      current_period_end = excluded.current_period_end,
      paid_through = excluded.paid_through,
      cancel_at_period_end = excluded.cancel_at_period_end,
      metadata = excluded.metadata,
      updated_at = excluded.updated_at
    where excluded.updated_at >= public.billing_subscriptions.updated_at;

    select * into v_subscription
    from public.billing_subscriptions subscription
    where subscription.provider = 'polar'
      and subscription.environment = p_environment
      and subscription.provider_subscription_id = trim(p_subscription_id)
    for update;
  end if;

  if p_recovery_action = 'open' then
    if p_status <> 'past_due' or p_failure_at is null
       or p_cycle_paid_through is null or v_subscription.paid_through is null
       or p_failure_at <> p_modified_at
       or p_cycle_paid_through <> v_subscription.paid_through then
      raise exception 'subscription_recovery_unproven';
    end if;

    insert into public.billing_subscription_recovery_cycles (
      user_id, provider, environment, subscription_id, cycle_paid_through,
      first_failure_at, recovery_until
    ) values (
      p_user_id, 'polar', p_environment, trim(p_subscription_id),
      p_cycle_paid_through, p_failure_at, p_failure_at + interval '72 hours'
    )
    on conflict (provider, environment, subscription_id, cycle_paid_through)
    do update set
      first_failure_at = least(
        public.billing_subscription_recovery_cycles.first_failure_at,
        excluded.first_failure_at
      ),
      recovery_until = least(
        public.billing_subscription_recovery_cycles.first_failure_at,
        excluded.first_failure_at
      ) + interval '72 hours',
      updated_at = now()
    returning * into v_cycle;

    update public.billing_subscription_recovery_cycles cycle
    set closed_at = coalesce(cycle.closed_at, p_failure_at),
        close_reason = coalesce(cycle.close_reason, 'superseded_cycle'),
        updated_at = now()
    where cycle.provider = 'polar'
      and cycle.environment = p_environment
      and cycle.subscription_id = trim(p_subscription_id)
      and cycle.cycle_paid_through <> p_cycle_paid_through
      and cycle.closed_at is null;

    v_source_id := 'recovery:' || encode(extensions.digest(
      trim(p_subscription_id) || ':' || p_cycle_paid_through::text,
      'sha256'
    ), 'hex');
    v_recovery_status := case
      when v_cycle.closed_at is null and p_evaluated_at < v_cycle.recovery_until
        then 'active'
      else 'revoked'
    end;

    update public.billing_access_grants grant_row
    set status = 'revoked',
        valid_until = least(coalesce(grant_row.valid_until, p_modified_at), p_modified_at),
        updated_at = now()
    where grant_row.provider = 'vantare'
      and grant_row.environment = p_environment
      and grant_row.source_type = 'subscription_recovery'
      and grant_row.source_id = v_source_id
      and not (grant_row.capability = any(p_capabilities))
      and grant_row.status <> 'revoked';

    for v_grant in
      select distinct trim(capability) as capability
      from unnest(p_capabilities) capability
    loop
      insert into public.billing_access_grants (
        user_id, provider, environment, source_type, source_id, capability,
        status, valid_until, resource_modified_at, snapshot_hash, metadata
      ) values (
        p_user_id, 'vantare', p_environment, 'subscription_recovery',
        v_source_id, v_grant.capability, v_recovery_status,
        v_cycle.recovery_until, v_cycle.first_failure_at,
        encode(extensions.digest(
          trim(p_subscription_id) || ':' || p_cycle_paid_through::text || ':' ||
          v_cycle.first_failure_at::text,
          'sha256'
        ), 'hex'),
        jsonb_build_object(
          'authority', 'vantare_recovery_policy',
          'subscription_id', trim(p_subscription_id),
          'cycle_paid_through', p_cycle_paid_through
        )
      )
      on conflict (provider, environment, source_type, source_id, capability)
      do update set
        status = excluded.status,
        valid_until = excluded.valid_until,
        resource_modified_at = excluded.resource_modified_at,
        snapshot_hash = excluded.snapshot_hash,
        metadata = excluded.metadata,
        updated_at = now();
    end loop;

    update public.billing_subscriptions
    set recovery_cycle_paid_through = v_cycle.cycle_paid_through,
        recovery_started_at = v_cycle.first_failure_at,
        recovery_until = v_cycle.recovery_until,
        updated_at = greatest(updated_at, p_modified_at)
    where provider = 'polar'
      and environment = p_environment
      and provider_subscription_id = trim(p_subscription_id);
  else
    if v_exact_version then
      update public.billing_subscription_recovery_cycles cycle
      set closed_at = coalesce(cycle.closed_at, p_modified_at),
          close_reason = coalesce(cycle.close_reason, p_status),
          updated_at = now()
      where cycle.provider = 'polar'
        and cycle.environment = p_environment
        and cycle.subscription_id = trim(p_subscription_id)
        and cycle.closed_at is null;

      update public.billing_access_grants grant_row
      set status = 'revoked',
          valid_until = least(coalesce(grant_row.valid_until, p_modified_at), p_modified_at),
          updated_at = now()
      where grant_row.provider = 'vantare'
        and grant_row.environment = p_environment
        and grant_row.source_type = 'subscription_recovery'
        and grant_row.metadata->>'subscription_id' = trim(p_subscription_id)
        and grant_row.status <> 'revoked';

      update public.billing_subscriptions
      set recovery_cycle_paid_through = null,
          recovery_started_at = null,
          recovery_until = null
      where provider = 'polar'
        and environment = p_environment
        and provider_subscription_id = trim(p_subscription_id);
    end if;
  end if;

  -- A late first-failure correction may update only Vantare's recovery source.
  -- The commercial projection remains owned by the exact Polar resource version.
  if v_exact_version then
    update public.billing_access_grants grant_row
    set status = case
          when p_status in ('active','uncanceled','trialing')
            and p_paid_through is not null and p_evaluated_at < p_paid_through
            then 'active'
          when p_status = 'canceled' and p_cancel_at_period_end
            and p_paid_through is not null and p_evaluated_at < p_paid_through
            then 'active'
          when p_status = 'past_due' and v_subscription.paid_through is not null
            and p_evaluated_at < v_subscription.paid_through
            then 'active'
          else 'revoked'
        end,
        valid_until = coalesce(v_subscription.paid_through, p_paid_through, p_evaluated_at),
        updated_at = now()
    where grant_row.provider = 'polar'
      and grant_row.environment = p_environment
      and grant_row.source_type = 'subscription'
      and grant_row.source_id = trim(p_subscription_id)
      and grant_row.capability = any(p_capabilities);
  end if;

  perform public.billing_refresh_entitlement_read_model_at(p_user_id, p_evaluated_at);
  return query select 'applied'::text, v_cycle.recovery_until;
end;
$$;

create or replace function public.billing_expire_subscription_grants(
  p_evaluated_at timestamptz
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_user_ids uuid[];
  v_changed integer;
begin
  if p_evaluated_at is null then raise exception 'invalid_evaluation_time'; end if;
  with expired as (
    update public.billing_access_grants grant_row
    set status = 'revoked', updated_at = now()
    where grant_row.source_type in ('subscription','subscription_recovery')
      and grant_row.status = 'active'
      and grant_row.valid_until is not null
      and p_evaluated_at >= grant_row.valid_until
    returning grant_row.user_id
  )
  select count(*)::integer, array_agg(distinct user_id)
  into v_changed, v_user_ids
  from expired;

  update public.billing_subscription_recovery_cycles cycle
  set closed_at = cycle.recovery_until,
      close_reason = 'expired',
      updated_at = now()
  where cycle.closed_at is null
    and p_evaluated_at >= cycle.recovery_until;

  update public.billing_subscriptions subscription
  set recovery_cycle_paid_through = null,
      recovery_started_at = null,
      recovery_until = null
  where subscription.recovery_until is not null
    and p_evaluated_at >= subscription.recovery_until;

  foreach v_user_id in array coalesce(v_user_ids, array[]::uuid[])
  loop
    perform public.billing_refresh_entitlement_read_model_at(
      v_user_id,
      p_evaluated_at
    );
  end loop;
  return v_changed;
end;
$$;

revoke all on function public.billing_refresh_entitlement_read_model_at(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.billing_apply_subscription_lifecycle(uuid, text, text, text, text, timestamptz, timestamptz, timestamptz, boolean, timestamptz, text, text, timestamptz, timestamptz, timestamptz, text[]) from public, anon, authenticated;
revoke all on function public.billing_expire_subscription_grants(timestamptz) from public, anon, authenticated;
grant execute on function public.billing_apply_subscription_lifecycle(uuid, text, text, text, text, timestamptz, timestamptz, timestamptz, boolean, timestamptz, text, text, timestamptz, timestamptz, timestamptz, text[]) to service_role;
grant execute on function public.billing_expire_subscription_grants(timestamptz) to service_role;

comment on table public.billing_subscription_recovery_cycles is
  'Immutable audit of bounded Vantare recovery grants per Polar subscription paid-through cycle.';
comment on function public.billing_expire_subscription_grants(timestamptz) is
  'Revokes subscription and recovery grants at the exact boundary now >= valid_until.';
