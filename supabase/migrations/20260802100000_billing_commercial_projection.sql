-- BIL-05: monotonic commercial projection and grants by source.
-- Additive and server-only. user_entitlements remains a derived compatibility
-- read-model; Polar stays the commercial authority.

create table if not exists public.billing_commercial_resources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null check (provider = 'polar'),
  environment text not null check (environment in ('sandbox', 'production')),
  resource_type text not null check (resource_type in ('order', 'subscription', 'benefit_grant')),
  resource_id text not null check (length(resource_id) between 1 and 200),
  remote_state text not null check (length(remote_state) between 1 and 80),
  remote_modified_at timestamptz not null,
  snapshot_hash text not null check (snapshot_hash ~ '^[0-9a-f]{64}$'),
  stale_event_count integer not null default 0 check (stale_event_count >= 0),
  conflict_count integer not null default 0 check (conflict_count >= 0),
  last_stale_event_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, environment, resource_type, resource_id)
);

create table if not exists public.billing_access_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null check (provider in ('polar', 'legacy')),
  environment text not null check (environment in ('sandbox', 'production', 'legacy')),
  source_type text not null check (source_type in ('order', 'subscription', 'benefit_grant', 'legacy', 'support')),
  source_id text not null check (length(source_id) between 1 and 200),
  capability text not null check (length(capability) between 1 and 128),
  status text not null check (status in ('active', 'revoked')),
  valid_until timestamptz,
  resource_modified_at timestamptz not null,
  snapshot_hash text not null check (snapshot_hash ~ '^[0-9a-f]{64}$'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, environment, source_type, source_id, capability)
);

create table if not exists public.billing_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null check (provider = 'polar'),
  environment text not null check (environment in ('sandbox', 'production')),
  trigger_kind text not null check (trigger_kind in ('manual', 'scheduled', 'event')),
  snapshot_hash text not null check (snapshot_hash ~ '^[0-9a-f]{64}$'),
  plan_hash text not null check (plan_hash ~ '^[0-9a-f]{64}$'),
  observed_hash text not null check (observed_hash ~ '^[0-9a-f]{64}$'),
  plan jsonb not null check (
    jsonb_typeof(plan) = 'array' and octet_length(plan::text) <= 262144
  ),
  operation_count integer not null check (operation_count >= 0),
  changed_count integer not null check (changed_count >= 0),
  status text not null check (status in ('applied', 'unchanged', 'quarantined')),
  created_at timestamptz not null default now(),
  unique (provider, environment, user_id, snapshot_hash, plan_hash)
);

create index if not exists billing_commercial_resources_user_idx
  on public.billing_commercial_resources (user_id, provider, environment);
create index if not exists billing_access_grants_user_active_idx
  on public.billing_access_grants (user_id, status, valid_until);
create index if not exists billing_reconciliation_runs_user_idx
  on public.billing_reconciliation_runs (user_id, created_at desc);

alter table public.billing_commercial_resources enable row level security;
alter table public.billing_access_grants enable row level security;
alter table public.billing_reconciliation_runs enable row level security;

revoke all on table public.billing_commercial_resources from anon, authenticated;
revoke all on table public.billing_access_grants from anon, authenticated;
revoke all on table public.billing_reconciliation_runs from anon, authenticated;

-- Existing rows are preserved as an explicit unknown legacy source. Customer
-- State does not list lifetime orders, so absence there must never revoke them.
insert into public.billing_access_grants (
  user_id, provider, environment, source_type, source_id, capability, status,
  valid_until, resource_modified_at, snapshot_hash, metadata
)
select
  ue.user_id,
  'legacy',
  'legacy',
  'legacy',
  ue.id::text,
  case
    when ue.product_key in ('vantare.plan.pro', 'vantare.edition.launch_v1')
      then ue.product_key
    when ue.product_key in ('bundle', 'vantare_pro') and ue.expires_at is null
      then 'vantare.edition.launch_v1'
    when ue.product_key in ('bundle', 'vantare_pro')
      then 'vantare.plan.pro'
    else ue.product_key
  end,
  case
    when ue.status in ('active', 'grace') then 'active'
    when ue.status = 'past_due'
      and ue.expires_at is not null
      and least(ue.expires_at, ue.updated_at + interval '3 days') > now()
      then 'active'
    else 'revoked'
  end,
  case
    when ue.status = 'past_due' and ue.expires_at is not null
      then least(ue.expires_at, ue.updated_at + interval '3 days')
    when ue.status = 'past_due' then ue.updated_at
    else ue.expires_at
  end,
  ue.updated_at,
  encode(digest(ue.id::text || ':' || ue.updated_at::text || ':' || ue.status, 'sha256'), 'hex'),
  jsonb_build_object('preservation', 'unknown_source', 'legacy_status', ue.status)
from public.user_entitlements ue
on conflict (provider, environment, source_type, source_id, capability) do nothing;

create or replace function public.billing_refresh_entitlement_read_model(p_user_id uuid)
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
  select
    count(*)::integer,
    bool_or(g.valid_until is null),
    max(g.valid_until)
  into v_active_count, v_has_lifetime, v_expires_at
  from public.billing_access_grants g
  where g.user_id = p_user_id
    and g.status = 'active'
    and g.capability in ('vantare.plan.pro', 'vantare.edition.launch_v1')
    and (g.valid_until is null or g.valid_until > now());

  if v_active_count > 0 then
    insert into public.user_entitlements (
      user_id, product_key, status, source, expires_at, metadata, updated_at
    ) values (
      p_user_id,
      'bundle',
      'active',
      'billing_projection',
      case when v_has_lifetime then null else v_expires_at end,
      jsonb_build_object('derived', true, 'active_source_count', v_active_count),
      now()
    )
    on conflict (user_id, product_key) do update set
      status = excluded.status,
      source = excluded.source,
      expires_at = excluded.expires_at,
      metadata = excluded.metadata,
      updated_at = excluded.updated_at;
  else
    insert into public.user_entitlements (
      user_id, product_key, status, source, expires_at, metadata, updated_at
    ) values (
      p_user_id,
      'bundle',
      'revoked',
      'billing_projection',
      now(),
      jsonb_build_object('derived', true, 'active_source_count', 0),
      now()
    )
    on conflict (user_id, product_key) do update set
      status = excluded.status,
      source = excluded.source,
      expires_at = excluded.expires_at,
      metadata = excluded.metadata,
      updated_at = excluded.updated_at;
  end if;
end;
$$;

-- Convert every inherited account to the derived compatibility row now. This
-- prevents a legacy past_due row from remaining authoritative until a future
-- webhook happens to touch that account.
select public.billing_refresh_entitlement_read_model(legacy_user.user_id)
from (
  select distinct user_id
  from public.billing_access_grants
  where provider = 'legacy' and environment = 'legacy'
) legacy_user;

-- The compatibility table is now a single derived bundle row. Retire old
-- product rows after their semantics have been copied into source grants, so
-- readers cannot aggregate a second commercial authority in parallel.
update public.user_entitlements ue
set status = 'revoked',
    source = 'billing_projection',
    expires_at = now(),
    metadata = coalesce(ue.metadata, '{}'::jsonb) || jsonb_build_object(
      'derived', true,
      'migrated_to_grants', true
    ),
    updated_at = now()
where ue.product_key <> 'bundle'
  and exists (
    select 1
    from public.billing_access_grants g
    where g.provider = 'legacy'
      and g.environment = 'legacy'
      and g.user_id = ue.user_id
      and g.source_id = ue.id::text
  );

alter table public.user_entitlements
  drop constraint if exists user_entitlements_active_derived_check;
alter table public.user_entitlements
  add constraint user_entitlements_active_derived_check check (
    status not in ('active', 'grace', 'past_due')
    or (product_key = 'bundle' and source = 'billing_projection')
  );

create or replace function public.billing_apply_resource_snapshot(
  p_provider text,
  p_environment text,
  p_resource_type text,
  p_resource_id text,
  p_user_id uuid,
  p_modified_at timestamptz,
  p_snapshot_hash text,
  p_state text,
  p_grants jsonb
)
returns table(outcome text, grants_changed integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_resource public.billing_commercial_resources%rowtype;
  v_grant jsonb;
  v_capabilities text[] := '{}'::text[];
  v_changed integer := 0;
  v_revoked integer := 0;
  v_status text;
  v_valid_until timestamptz;
  v_is_new boolean := false;
begin
  if p_provider <> 'polar'
     or p_environment not in ('sandbox', 'production')
     or p_resource_type not in ('order', 'subscription', 'benefit_grant')
     or p_resource_id is null or length(trim(p_resource_id)) not between 1 and 200
     or p_state is null or length(trim(p_state)) not between 1 and 80
     or p_modified_at is null
     or p_snapshot_hash !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_grants) <> 'array'
     or jsonb_array_length(p_grants) > 32 then
    raise exception 'invalid_commercial_snapshot';
  end if;

  insert into public.billing_commercial_resources (
    user_id, provider, environment, resource_type, resource_id,
    remote_state, remote_modified_at, snapshot_hash
  ) values (
    p_user_id, p_provider, p_environment, p_resource_type, trim(p_resource_id),
    trim(p_state), p_modified_at, p_snapshot_hash
  ) on conflict (provider, environment, resource_type, resource_id) do nothing
  returning * into v_resource;

  if found then
    v_is_new := true;
  else
    select * into v_resource
    from public.billing_commercial_resources r
    where r.provider = p_provider
      and r.environment = p_environment
      and r.resource_type = p_resource_type
      and r.resource_id = trim(p_resource_id)
    for update;
  end if;

  if v_resource.user_id <> p_user_id then
    raise exception 'commercial_resource_owner_mismatch';
  end if;

  if not v_is_new and p_modified_at < v_resource.remote_modified_at then
    update public.billing_commercial_resources
    set stale_event_count = stale_event_count + 1,
        last_stale_event_at = now(),
        updated_at = now()
    where id = v_resource.id;
    return query select 'stale_noop'::text, 0;
    return;
  end if;

  if not v_is_new and p_modified_at = v_resource.remote_modified_at then
    if p_snapshot_hash = v_resource.snapshot_hash then
      return query select 'duplicate'::text, 0;
      return;
    else
      update public.billing_commercial_resources
      set conflict_count = conflict_count + 1,
          updated_at = now()
      where id = v_resource.id;
      return query select 'version_conflict'::text, 0;
      return;
    end if;
  end if;

  if not v_is_new then
    update public.billing_commercial_resources
    set remote_state = trim(p_state),
        remote_modified_at = p_modified_at,
        snapshot_hash = p_snapshot_hash,
        updated_at = now()
    where id = v_resource.id;
  end if;

  for v_grant in select value from jsonb_array_elements(p_grants)
  loop
    if jsonb_typeof(v_grant) <> 'object'
       or nullif(trim(v_grant->>'capability'), '') is null
       or length(trim(v_grant->>'capability')) > 128
       or (v_grant->>'status') not in ('active', 'revoked') then
      raise exception 'invalid_commercial_grant';
    end if;
    v_status := v_grant->>'status';
    begin
      v_valid_until := nullif(v_grant->>'validUntil', '')::timestamptz;
    exception when invalid_datetime_format then
      raise exception 'invalid_commercial_grant';
    end;
    v_capabilities := array_append(v_capabilities, trim(v_grant->>'capability'));

    insert into public.billing_access_grants (
      user_id, provider, environment, source_type, source_id, capability,
      status, valid_until, resource_modified_at, snapshot_hash, metadata
    ) values (
      p_user_id, p_provider, p_environment, p_resource_type, trim(p_resource_id),
      trim(v_grant->>'capability'), v_status, v_valid_until, p_modified_at,
      p_snapshot_hash, jsonb_build_object('remote_state', trim(p_state))
    )
    on conflict (provider, environment, source_type, source_id, capability)
    do update set
      user_id = excluded.user_id,
      status = excluded.status,
      valid_until = excluded.valid_until,
      resource_modified_at = excluded.resource_modified_at,
      snapshot_hash = excluded.snapshot_hash,
      metadata = excluded.metadata,
      updated_at = now();
    v_changed := v_changed + 1;
  end loop;

  update public.billing_access_grants
  set status = 'revoked',
      valid_until = least(coalesce(valid_until, p_modified_at), p_modified_at),
      resource_modified_at = p_modified_at,
      snapshot_hash = p_snapshot_hash,
      updated_at = now()
  where provider = p_provider
    and environment = p_environment
    and source_type = p_resource_type
    and source_id = trim(p_resource_id)
    and not (capability = any(v_capabilities))
    and status <> 'revoked';
  get diagnostics v_revoked = row_count;
  v_changed := v_changed + v_revoked;

  perform public.billing_refresh_entitlement_read_model(p_user_id);
  return query select 'apply'::text, v_changed;
end;
$$;

create or replace function public.billing_apply_reconciliation_plan(
  p_user_id uuid,
  p_environment text,
  p_trigger_kind text,
  p_snapshot_hash text,
  p_plan_hash text,
  p_observed_at timestamptz,
  p_operations jsonb
)
returns table(status text, changed integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_operation jsonb;
  v_existing public.billing_commercial_resources%rowtype;
  v_outcome text;
  v_changed integer := 0;
begin
  if p_environment not in ('sandbox', 'production')
     or p_trigger_kind not in ('manual', 'scheduled')
     or p_snapshot_hash !~ '^[0-9a-f]{64}$'
     or p_plan_hash !~ '^[0-9a-f]{64}$'
     or p_observed_at is null
     or jsonb_typeof(p_operations) <> 'array'
     or jsonb_array_length(p_operations) > 256
     or octet_length(p_operations::text) > 262144 then
    raise exception 'invalid_reconciliation_plan';
  end if;

  -- Serialize every reconciliation for one account before checking
  -- idempotency. This also covers first-seen resources, where no projection
  -- row exists yet to lock.
  perform 1
  from public.profiles p
  where p.id = p_user_id
  for update;
  if not found then
    raise exception 'reconciliation_user_not_found';
  end if;

  if exists (
    select 1 from public.billing_reconciliation_runs r
    where r.provider = 'polar'
      and r.environment = p_environment
      and r.user_id = p_user_id
      and r.snapshot_hash = p_snapshot_hash
      and r.plan_hash = p_plan_hash
  ) then
    return query select 'unchanged'::text, 0;
    return;
  end if;

  perform 1
  from public.billing_commercial_resources r
  join jsonb_array_elements(p_operations) op
    on r.provider = 'polar'
   and r.environment = p_environment
   and r.resource_type = op->>'resourceType'
   and r.resource_id = op->>'resourceId'
  order by r.resource_type, r.resource_id
  for update of r;

  for v_operation in select value from jsonb_array_elements(p_operations)
  loop
    if v_operation->>'provider' <> 'polar'
       or v_operation->>'environment' <> p_environment
       or v_operation->>'userId' <> p_user_id::text
       or (v_operation->>'resourceType') not in ('order', 'subscription', 'benefit_grant')
       or nullif(trim(v_operation->>'resourceId'), '') is null
       or nullif(trim(v_operation->>'state'), '') is null
       or (v_operation->>'snapshotHash') !~ '^[0-9a-f]{64}$'
       or jsonb_typeof(v_operation->'grants') <> 'array' then
      raise exception 'invalid_reconciliation_operation';
    end if;

    select * into v_existing
    from public.billing_commercial_resources r
    where r.provider = 'polar'
      and r.environment = p_environment
      and r.resource_type = v_operation->>'resourceType'
      and r.resource_id = v_operation->>'resourceId';
    if found and v_existing.user_id <> p_user_id then
      raise exception 'commercial_resource_owner_mismatch';
    end if;
    if found
       and (v_operation->>'modifiedAt')::timestamptz = v_existing.remote_modified_at
       and v_operation->>'snapshotHash' <> v_existing.snapshot_hash then
      insert into public.billing_reconciliation_runs (
        user_id, provider, environment, trigger_kind, snapshot_hash, plan_hash,
        observed_hash, plan, operation_count, changed_count, status
      ) values (
        p_user_id, 'polar', p_environment, p_trigger_kind, p_snapshot_hash,
        p_plan_hash, p_snapshot_hash, p_operations,
        jsonb_array_length(p_operations), 0, 'quarantined'
      );
      return query select 'quarantined'::text, 0;
      return;
    end if;
  end loop;

  for v_operation in select value from jsonb_array_elements(p_operations)
  loop
    select applied.outcome
    into v_outcome
    from public.billing_apply_resource_snapshot(
      'polar',
      p_environment,
      v_operation->>'resourceType',
      v_operation->>'resourceId',
      p_user_id,
      (v_operation->>'modifiedAt')::timestamptz,
      v_operation->>'snapshotHash',
      v_operation->>'state',
      v_operation->'grants'
    ) applied;
    if v_outcome = 'version_conflict' then
      raise exception 'reconciliation_version_conflict';
    end if;
    if v_outcome = 'apply' then v_changed := v_changed + 1; end if;
  end loop;

  insert into public.billing_reconciliation_runs (
    user_id, provider, environment, trigger_kind, snapshot_hash, plan_hash,
    observed_hash, plan, operation_count, changed_count, status
  ) values (
    p_user_id, 'polar', p_environment, p_trigger_kind, p_snapshot_hash,
    p_plan_hash, p_snapshot_hash, p_operations, jsonb_array_length(p_operations),
    v_changed, case when v_changed > 0 then 'applied' else 'unchanged' end
  );
  return query select
    case when v_changed > 0 then 'applied' else 'unchanged' end::text,
    v_changed;
end;
$$;

revoke all on function public.billing_refresh_entitlement_read_model(uuid) from public, anon, authenticated;
revoke all on function public.billing_apply_resource_snapshot(text, text, text, text, uuid, timestamptz, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.billing_apply_reconciliation_plan(uuid, text, text, text, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.billing_apply_resource_snapshot(text, text, text, text, uuid, timestamptz, text, text, jsonb) to service_role;
grant execute on function public.billing_apply_reconciliation_plan(uuid, text, text, text, text, timestamptz, jsonb) to service_role;

comment on table public.billing_access_grants is
  'Authoritative local projection by commercial source. user_entitlements is derived from this table.';
comment on table public.billing_reconciliation_runs is
  'Applied reconciliation audit only. Dry-run performs zero database writes.';
