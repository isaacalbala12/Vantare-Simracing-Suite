-- BIL-10C: revocable operational access for testers and the Vantare owner.
--
-- This authority is deliberately separate from Polar and
-- billing_access_grants. It never represents a purchase, subscription,
-- refund or commercial entitlement.

create table if not exists public.operational_access_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('tester', 'nightly_tester', 'owner')),
  status text not null check (status in ('active', 'revoked')),
  expires_at timestamptz,
  policy_version integer not null default 1 check (policy_version = 1),
  granted_at timestamptz not null,
  granted_by text not null check (granted_by ~ '^[a-z0-9][a-z0-9._:-]{2,79}$'),
  grant_reason text not null check (length(trim(grant_reason)) between 3 and 500),
  revoked_at timestamptz,
  revoked_by text check (revoked_by is null or revoked_by ~ '^[a-z0-9][a-z0-9._:-]{2,79}$'),
  revoke_reason text check (revoke_reason is null or length(trim(revoke_reason)) between 3 and 500),
  correlation_id text not null check (correlation_id ~ '^[a-z0-9][a-z0-9._:-]{2,127}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operational_access_user_role_key unique (user_id, role),
  check (expires_at is null or expires_at > granted_at),
  check (
    (status = 'active' and revoked_at is null and revoked_by is null and revoke_reason is null)
    or
    (status = 'revoked' and revoked_at is not null and revoked_by is not null and revoke_reason is not null)
  )
);

create unique index if not exists operational_access_one_active_role_idx
  on public.operational_access_assignments (user_id)
  where status = 'active';

create index if not exists operational_access_active_expiry_idx
  on public.operational_access_assignments (status, expires_at);

create table if not exists public.operational_access_audit (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null,
  role text not null check (role in ('tester', 'nightly_tester', 'owner')),
  action text not null check (action in ('grant', 'revoke')),
  actor_ref text not null check (actor_ref ~ '^[a-z0-9][a-z0-9._:-]{2,79}$'),
  reason text not null check (length(trim(reason)) between 3 and 500),
  correlation_id text not null check (correlation_id ~ '^[a-z0-9][a-z0-9._:-]{2,127}$'),
  expires_at timestamptz,
  policy_version integer not null check (policy_version = 1),
  occurred_at timestamptz not null default now()
);

create table if not exists public.operational_legacy_grant_retirements (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null,
  retired_count integer not null check (retired_count > 0),
  actor_ref text not null check (actor_ref ~ '^[a-z0-9][a-z0-9._:-]{2,79}$'),
  reason text not null check (length(trim(reason)) between 3 and 500),
  correlation_id text not null unique check (correlation_id ~ '^[a-z0-9][a-z0-9._:-]{2,127}$'),
  occurred_at timestamptz not null default now()
);

create index if not exists operational_access_audit_target_idx
  on public.operational_access_audit (target_user_id, occurred_at desc);

alter table public.operational_access_assignments enable row level security;
alter table public.operational_access_audit enable row level security;
alter table public.operational_legacy_grant_retirements enable row level security;

revoke all on table public.operational_access_assignments from public, anon, authenticated;
revoke all on table public.operational_access_audit from public, anon, authenticated;
revoke all on table public.operational_legacy_grant_retirements from public, anon, authenticated;

create or replace function public.operational_access_reject_audit_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'operational_access_audit_is_append_only';
end;
$$;

drop trigger if exists operational_access_audit_append_only
  on public.operational_access_audit;
create trigger operational_access_audit_append_only
before update or delete on public.operational_access_audit
for each row execute function public.operational_access_reject_audit_mutation();

drop trigger if exists operational_legacy_grant_retirements_append_only
  on public.operational_legacy_grant_retirements;
create trigger operational_legacy_grant_retirements_append_only
before update or delete on public.operational_legacy_grant_retirements
for each row execute function public.operational_access_reject_audit_mutation();

revoke all on function public.operational_access_reject_audit_mutation()
  from public, anon, authenticated;

create or replace function public.operational_access_set(
  p_user_id uuid,
  p_role text,
  p_action text,
  p_actor_ref text,
  p_reason text,
  p_correlation_id text,
  p_expires_at timestamptz default null
)
returns table(outcome text, role text, status text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.operational_access_assignments%rowtype;
  v_replaced record;
  v_now timestamptz := now();
begin
  if p_user_id is null
     or p_role not in ('tester', 'nightly_tester', 'owner')
     or p_action not in ('grant', 'revoke')
     or p_actor_ref !~ '^[a-z0-9][a-z0-9._:-]{2,79}$'
     or length(trim(coalesce(p_reason, ''))) not between 3 and 500
     or p_correlation_id !~ '^[a-z0-9][a-z0-9._:-]{2,127}$'
     or (p_action = 'revoke' and p_expires_at is not null)
     or (p_action = 'grant' and p_expires_at is not null and p_expires_at <= v_now) then
    raise exception 'invalid_operational_access_request';
  end if;

  perform 1 from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'operational_access_user_not_found';
  end if;

  select * into v_existing
  from public.operational_access_assignments a
  where a.user_id = p_user_id and a.role = p_role
  for update;

  if p_action = 'revoke' then
    if not found or v_existing.status = 'revoked' then
      return query select 'unchanged'::text, p_role, 'revoked'::text, null::timestamptz;
      return;
    end if;
    update public.operational_access_assignments a
    set status = 'revoked',
        revoked_at = v_now,
        revoked_by = p_actor_ref,
        revoke_reason = trim(p_reason),
        correlation_id = p_correlation_id,
        updated_at = v_now
    where a.id = v_existing.id;
    insert into public.operational_access_audit (
      target_user_id, role, action, actor_ref, reason, correlation_id,
      expires_at, policy_version, occurred_at
    ) values (
      p_user_id, p_role, 'revoke', p_actor_ref, trim(p_reason),
      p_correlation_id, v_existing.expires_at, 1, v_now
    );
    return query select 'applied'::text, p_role, 'revoked'::text, null::timestamptz;
    return;
  end if;

  if found
     and v_existing.status = 'active'
     and v_existing.expires_at is not distinct from p_expires_at then
    return query select 'unchanged'::text, p_role, 'active'::text, p_expires_at;
    return;
  end if;

  for v_replaced in
    update public.operational_access_assignments a
    set status = 'revoked',
        revoked_at = v_now,
        revoked_by = p_actor_ref,
        revoke_reason = 'Replaced by role ' || p_role,
        correlation_id = p_correlation_id,
        updated_at = v_now
    where a.user_id = p_user_id and a.status = 'active' and a.role <> p_role
    returning a.role, a.expires_at
  loop
    insert into public.operational_access_audit (
      target_user_id, role, action, actor_ref, reason, correlation_id,
      expires_at, policy_version, occurred_at
    ) values (
      p_user_id, v_replaced.role, 'revoke', p_actor_ref,
      'Replaced by role ' || p_role, p_correlation_id,
      v_replaced.expires_at, 1, v_now
    );
  end loop;

  insert into public.operational_access_assignments (
    user_id, role, status, expires_at, policy_version, granted_at, granted_by,
    grant_reason, revoked_at, revoked_by, revoke_reason, correlation_id,
    created_at, updated_at
  ) values (
    p_user_id, p_role, 'active', p_expires_at, 1, v_now, p_actor_ref,
    trim(p_reason), null, null, null, p_correlation_id, v_now, v_now
  )
  on conflict on constraint operational_access_user_role_key do update set
    status = 'active',
    expires_at = excluded.expires_at,
    policy_version = 1,
    granted_at = excluded.granted_at,
    granted_by = excluded.granted_by,
    grant_reason = excluded.grant_reason,
    revoked_at = null,
    revoked_by = null,
    revoke_reason = null,
    correlation_id = excluded.correlation_id,
    updated_at = excluded.updated_at;

  insert into public.operational_access_audit (
    target_user_id, role, action, actor_ref, reason, correlation_id,
    expires_at, policy_version, occurred_at
  ) values (
    p_user_id, p_role, 'grant', p_actor_ref, trim(p_reason),
    p_correlation_id, p_expires_at, 1, v_now
  );
  return query select 'applied'::text, p_role, 'active'::text, p_expires_at;
end;
$$;

create or replace function public.operational_access_preview(p_user_id uuid)
returns table(role text, status text, expires_at timestamptz, policy_version integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select a.role, a.status, a.expires_at, a.policy_version
  from public.operational_access_assignments a
  where a.user_id = p_user_id
  order by a.status, a.role
$$;

create or replace function public.operational_legacy_grant_preview(p_user_id uuid)
returns table(active_count integer, capabilities text[])
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    count(*)::integer,
    coalesce(array_agg(distinct g.capability order by g.capability), '{}'::text[])
  from public.billing_access_grants g
  where g.user_id = p_user_id
    and g.provider = 'legacy'
    and g.environment = 'legacy'
    and g.status = 'active'
$$;

create or replace function public.operational_legacy_grant_retire(
  p_user_id uuid,
  p_actor_ref text,
  p_reason text,
  p_correlation_id text
)
returns table(outcome text, retired_count integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_retired integer := 0;
begin
  if p_user_id is null
     or p_actor_ref !~ '^[a-z0-9][a-z0-9._:-]{2,79}$'
     or length(trim(coalesce(p_reason, ''))) not between 3 and 500
     or p_correlation_id !~ '^[a-z0-9][a-z0-9._:-]{2,127}$' then
    raise exception 'invalid_operational_legacy_retirement_request';
  end if;

  perform 1 from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'operational_access_user_not_found';
  end if;

  update public.billing_access_grants g
  set status = 'revoked',
      metadata = coalesce(g.metadata, '{}'::jsonb) || jsonb_build_object(
        'authority_retired', true,
        'retirement_correlation_id', p_correlation_id
      ),
      updated_at = now()
  where g.user_id = p_user_id
    and g.provider = 'legacy'
    and g.environment = 'legacy'
    and g.status = 'active';
  get diagnostics v_retired = row_count;

  if v_retired = 0 then
    return query select 'unchanged'::text, 0;
    return;
  end if;

  insert into public.operational_legacy_grant_retirements (
    target_user_id, retired_count, actor_ref, reason, correlation_id
  ) values (
    p_user_id, v_retired, p_actor_ref, trim(p_reason), p_correlation_id
  );
  perform public.billing_refresh_entitlement_read_model(p_user_id);
  return query select 'applied'::text, v_retired;
end;
$$;

revoke all on function public.operational_access_set(uuid, text, text, text, text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.operational_access_preview(uuid)
  from public, anon, authenticated;
grant execute on function public.operational_access_set(uuid, text, text, text, text, text, timestamptz)
  to service_role;
grant execute on function public.operational_access_preview(uuid)
  to service_role;
revoke all on function public.operational_legacy_grant_preview(uuid)
  from public, anon, authenticated;
revoke all on function public.operational_legacy_grant_retire(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.operational_legacy_grant_preview(uuid)
  to service_role;
grant execute on function public.operational_legacy_grant_retire(uuid, text, text, text)
  to service_role;

comment on table public.operational_access_assignments is
  'Non-commercial, revocable Vantare roles. Never a Polar purchase authority.';
comment on function public.operational_access_set(uuid, text, text, text, text, text, timestamptz) is
  'Service-only idempotent grant/revoke boundary for operational roles.';
comment on table public.operational_legacy_grant_retirements is
  'Append-only audit of explicit retirement of legacy billing authority.';
comment on function public.operational_legacy_grant_retire(uuid, text, text, text) is
  'Service-only, per-user retirement of classified active legacy grants.';
