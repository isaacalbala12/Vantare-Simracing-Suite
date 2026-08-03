-- ISA-240 / TAU-07F: authenticated Linear delivery ledger and observational
-- reconciliation. This migration grants no execution, assignment or promotion
-- authority and stores no raw webhook body, signature, actor or issue text.

begin;

create table public.testing_center_linear_issue_bindings(
  external_issue_id uuid primary key,
  organization_id uuid not null,
  technical_issue_id text not null unique
    references public.testing_center_technical_issues(technical_issue_id) on delete restrict,
  effect_id text not null unique
    references public.testing_center_effect_outbox(effect_id) on delete restrict,
  bound_by_id text not null check (
    bound_by_id ~ '^[a-z0-9][a-z0-9._-]{0,127}$'
  ),
  bound_at timestamptz not null default now()
);

create table public.testing_center_linear_state_mappings(
  organization_id uuid not null,
  linear_state_id uuid not null,
  coarse_state text not null check (coarse_state in (
    'linear_created', 'awaiting_owner', 'codex_in_progress',
    'pr_in_review', 'needs_changes', 'stopped'
  )),
  active boolean not null default true,
  configured_by_id text not null check (
    configured_by_id ~ '^[a-z0-9][a-z0-9._-]{0,127}$'
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(organization_id, linear_state_id)
);

create table public.testing_center_linear_reconciliations(
  technical_issue_id text primary key
    references public.testing_center_technical_issues(technical_issue_id) on delete restrict,
  effect_id text not null unique
    references public.testing_center_effect_outbox(effect_id) on delete restrict,
  external_issue_id uuid not null unique
    references public.testing_center_linear_issue_bindings(external_issue_id) on delete restrict,
  observed_state text not null check (observed_state in (
    'linear_created', 'awaiting_owner', 'codex_in_progress',
    'pr_in_review', 'needs_changes', 'stopped'
  )),
  last_webhook_timestamp_ms bigint check (last_webhook_timestamp_ms > 0),
  last_event_created_at timestamptz,
  last_delivery_id uuid,
  generation bigint not null default 0 check (generation >= 0),
  updated_at timestamptz not null default now(),
  constraint testing_center_linear_reconciliation_watermark check (
    (last_webhook_timestamp_ms is null and last_event_created_at is null
      and last_delivery_id is null and generation = 0)
    or (last_webhook_timestamp_ms is not null and last_event_created_at is not null
      and last_delivery_id is not null and generation > 0)
  )
);

create table public.testing_center_linear_webhook_deliveries(
  delivery_id uuid primary key,
  webhook_id uuid not null,
  organization_id uuid not null,
  external_issue_id uuid not null
    references public.testing_center_linear_issue_bindings(external_issue_id) on delete restrict,
  event_name text not null check (event_name = 'Issue'),
  event_action text not null check (event_action in ('create','update','remove')),
  webhook_timestamp_ms bigint not null check (webhook_timestamp_ms > 0),
  event_created_at timestamptz not null,
  linear_state_id uuid,
  payload_digest text not null check (payload_digest ~ '^[0-9a-f]{64}$'),
  outcome text not null check (outcome in (
    'pending', 'applied', 'stale', 'ignored', 'needs_owner'
  )),
  recorded_at timestamptz not null default now()
);
create index testing_center_linear_webhook_issue_order_idx
  on public.testing_center_linear_webhook_deliveries(
    external_issue_id, webhook_timestamp_ms desc
  );

alter table public.testing_center_linear_issue_bindings enable row level security;
alter table public.testing_center_linear_issue_bindings force row level security;
alter table public.testing_center_linear_state_mappings enable row level security;
alter table public.testing_center_linear_state_mappings force row level security;
alter table public.testing_center_linear_reconciliations enable row level security;
alter table public.testing_center_linear_reconciliations force row level security;
alter table public.testing_center_linear_webhook_deliveries enable row level security;
alter table public.testing_center_linear_webhook_deliveries force row level security;

revoke all on table public.testing_center_linear_issue_bindings,
  public.testing_center_linear_state_mappings,
  public.testing_center_linear_reconciliations,
  public.testing_center_linear_webhook_deliveries
from public, anon, authenticated, service_role;
grant select on table public.testing_center_linear_issue_bindings,
  public.testing_center_linear_state_mappings,
  public.testing_center_linear_reconciliations,
  public.testing_center_linear_webhook_deliveries
to service_role;

create function public.testing_center_bind_linear_issue(
  p_effect_id text,
  p_external_issue_id uuid,
  p_organization_id uuid,
  p_bound_by_id text
)
returns void language plpgsql security definer set search_path = '' as $$
declare v_effect public.testing_center_effect_outbox%rowtype;
begin
  if p_external_issue_id is null or p_organization_id is null
    or p_bound_by_id is null
    or p_bound_by_id !~ '^[a-z0-9][a-z0-9._-]{0,127}$' then
    raise exception 'testing_center_linear_binding_invalid' using errcode = '22023';
  end if;
  select * into v_effect from public.testing_center_effect_outbox
  where effect_id = p_effect_id for update;
  if not found or v_effect.effect_type <> 'linear_issue_create'
    or v_effect.state not in ('completed','dry_run_completed')
    or not exists (
      select 1 from public.testing_center_issue_destinations destination
      where destination.technical_issue_id = v_effect.technical_issue_id
        and destination.active_effect_id = v_effect.effect_id
        and destination.destination = 'linear'
    ) then
    raise exception 'testing_center_linear_binding_effect_invalid' using errcode = '55000';
  end if;
  insert into public.testing_center_linear_issue_bindings(
    external_issue_id, organization_id, technical_issue_id, effect_id, bound_by_id
  ) values (
    p_external_issue_id, p_organization_id, v_effect.technical_issue_id,
    v_effect.effect_id, p_bound_by_id
  );
  insert into public.testing_center_linear_reconciliations(
    technical_issue_id, effect_id, external_issue_id, observed_state
  ) values (
    v_effect.technical_issue_id, v_effect.effect_id, p_external_issue_id,
    'linear_created'
  );
end $$;

create function public.testing_center_upsert_linear_state_mapping(
  p_organization_id uuid,
  p_linear_state_id uuid,
  p_coarse_state text,
  p_configured_by_id text,
  p_active boolean default true
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_organization_id is null or p_linear_state_id is null
    or p_coarse_state not in (
      'linear_created', 'awaiting_owner', 'codex_in_progress',
      'pr_in_review', 'needs_changes', 'stopped'
    ) or p_configured_by_id is null
    or p_configured_by_id !~ '^[a-z0-9][a-z0-9._-]{0,127}$'
    or p_active is null then
    raise exception 'testing_center_linear_state_mapping_invalid'
      using errcode = '22023';
  end if;
  insert into public.testing_center_linear_state_mappings(
    organization_id, linear_state_id, coarse_state, active, configured_by_id
  ) values (
    p_organization_id, p_linear_state_id, p_coarse_state, p_active,
    p_configured_by_id
  )
  on conflict(organization_id, linear_state_id) do update
  set coarse_state = excluded.coarse_state, active = excluded.active,
    configured_by_id = excluded.configured_by_id, updated_at = now();
end $$;

create function public.testing_center_reconcile_linear_webhook(
  p_delivery_id uuid,
  p_webhook_id uuid,
  p_organization_id uuid,
  p_external_issue_id uuid,
  p_event_name text,
  p_event_action text,
  p_webhook_timestamp_ms bigint,
  p_event_created_at timestamptz,
  p_linear_state_id uuid,
  p_payload_digest text
)
returns table(delivery_status text, current_observed_state text)
language plpgsql security definer set search_path = '' as $$
declare
  v_binding public.testing_center_linear_issue_bindings%rowtype;
  v_reconciliation public.testing_center_linear_reconciliations%rowtype;
  v_existing public.testing_center_linear_webhook_deliveries%rowtype;
  v_target_state text;
  v_outcome text;
begin
  if p_delivery_id is null or p_webhook_id is null or p_organization_id is null
    or p_external_issue_id is null or p_event_name <> 'Issue'
    or p_event_action not in ('create','update','remove')
    or p_webhook_timestamp_ms is null or p_webhook_timestamp_ms <= 0
    or p_event_created_at is null
    or p_payload_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'testing_center_linear_webhook_invalid' using errcode = '22023';
  end if;

  select * into v_binding from public.testing_center_linear_issue_bindings
  where external_issue_id = p_external_issue_id for update;
  if not found or v_binding.organization_id <> p_organization_id then
    raise exception 'testing_center_linear_webhook_binding_mismatch'
      using errcode = '55000';
  end if;
  select * into strict v_reconciliation
  from public.testing_center_linear_reconciliations
  where technical_issue_id = v_binding.technical_issue_id for update;

  select * into v_existing from public.testing_center_linear_webhook_deliveries
  where delivery_id = p_delivery_id;
  if found then
    if v_existing.payload_digest <> p_payload_digest
      or v_existing.webhook_id <> p_webhook_id
      or v_existing.organization_id <> p_organization_id
      or v_existing.external_issue_id <> p_external_issue_id
      or v_existing.event_name <> p_event_name
      or v_existing.event_action <> p_event_action
      or v_existing.webhook_timestamp_ms <> p_webhook_timestamp_ms
      or v_existing.event_created_at <> p_event_created_at
      or v_existing.linear_state_id is distinct from p_linear_state_id then
      raise exception 'testing_center_linear_delivery_conflict'
        using errcode = '23505';
    end if;
    return query select 'duplicate'::text, v_reconciliation.observed_state;
    return;
  end if;

  insert into public.testing_center_linear_webhook_deliveries(
    delivery_id, webhook_id, organization_id, external_issue_id,
    event_name, event_action, webhook_timestamp_ms, event_created_at,
    linear_state_id, payload_digest, outcome
  ) values (
    p_delivery_id, p_webhook_id, p_organization_id, p_external_issue_id,
    p_event_name, p_event_action, p_webhook_timestamp_ms, p_event_created_at,
    p_linear_state_id, p_payload_digest, 'pending'
  );

  if v_reconciliation.last_webhook_timestamp_ms is not null
    and p_webhook_timestamp_ms <= v_reconciliation.last_webhook_timestamp_ms then
    v_outcome := 'stale';
  elsif p_event_action = 'remove' then
    v_target_state := 'stopped';
    v_outcome := 'applied';
  elsif p_event_action = 'create' then
    if p_linear_state_id is null then
      raise exception 'testing_center_linear_webhook_state_required'
        using errcode = '22023';
    end if;
    v_target_state := 'linear_created';
    v_outcome := 'applied';
  elsif p_linear_state_id is null then
    v_outcome := 'ignored';
  else
    select mapping.coarse_state into v_target_state
    from public.testing_center_linear_state_mappings mapping
    where mapping.organization_id = p_organization_id
      and mapping.linear_state_id = p_linear_state_id and mapping.active;
    v_outcome := case when found then 'applied' else 'needs_owner' end;
  end if;

  if v_outcome <> 'stale' then
    update public.testing_center_linear_reconciliations
    set observed_state = coalesce(v_target_state, observed_state),
      last_webhook_timestamp_ms = p_webhook_timestamp_ms,
      last_event_created_at = p_event_created_at,
      last_delivery_id = p_delivery_id,
      generation = generation + 1,
      updated_at = now()
    where technical_issue_id = v_binding.technical_issue_id
    returning * into v_reconciliation;
  end if;
  update public.testing_center_linear_webhook_deliveries
  set outcome = v_outcome where delivery_id = p_delivery_id;
  return query select v_outcome, v_reconciliation.observed_state;
end $$;

do $$ declare v_signature text; begin
  foreach v_signature in array array[
    'testing_center_bind_linear_issue(text,uuid,uuid,text)',
    'testing_center_upsert_linear_state_mapping(uuid,uuid,text,text,boolean)',
    'testing_center_reconcile_linear_webhook(uuid,uuid,uuid,uuid,text,text,bigint,timestamptz,uuid,text)'
  ] loop
    execute 'revoke all on function public.' || v_signature
      || ' from public, anon, authenticated';
    execute 'grant execute on function public.' || v_signature || ' to service_role';
  end loop;
end $$;

comment on table public.testing_center_linear_webhook_deliveries is
  'TAU-07F durable allowlisted Linear delivery metadata; no raw body or signature.';
comment on table public.testing_center_linear_reconciliations is
  'TAU-07F observational state only; never authorizes Codex, Git or promotion.';
comment on function public.testing_center_reconcile_linear_webhook(
  uuid,uuid,uuid,uuid,text,text,bigint,timestamptz,uuid,text
) is 'TAU-07F fail-closed replay/order reconciliation with no execution authority.';

commit;
