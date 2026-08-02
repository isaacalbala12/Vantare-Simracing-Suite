-- BIL-02 / ISA-68: durable webhook inbox, leased processing and replay audit.
-- Additive migration. Existing license_events remains the user-facing audit log.

create table if not exists public.billing_webhook_inbox (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  payload jsonb not null,
  payload_purged_at timestamptz,
  status text not null default 'received'
    check (status in ('received', 'processing', 'processed', 'failed', 'quarantined')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error_code text,
  quarantine_reason text,
  received_at timestamptz not null default now(),
  processing_started_at timestamptz,
  processed_at timestamptz,
  updated_at timestamptz not null default now(),
  replay_count integer not null default 0 check (replay_count >= 0),
  unique (provider, provider_event_id)
);

create table if not exists public.billing_webhook_effects (
  inbox_id uuid not null references public.billing_webhook_inbox (id) on delete cascade,
  effect_key text not null,
  status text not null default 'received'
    check (status in ('received', 'processing', 'completed', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (inbox_id, effect_key),
  check (effect_key ~ '^[a-z0-9_:-]{1,96}$')
);

create table if not exists public.billing_webhook_replay_audit (
  id uuid primary key default gen_random_uuid(),
  inbox_id uuid not null references public.billing_webhook_inbox (id) on delete cascade,
  actor_id text not null check (actor_id ~ '^[a-z0-9_-]{3,64}$'),
  reason_code text not null check (reason_code ~ '^[a-z0-9_:-]{3,96}$'),
  previous_status text not null,
  requested_at timestamptz not null default now()
);

create index if not exists billing_webhook_inbox_pending_idx
  on public.billing_webhook_inbox (status, next_attempt_at, received_at);
create index if not exists billing_webhook_inbox_lease_idx
  on public.billing_webhook_inbox (lease_expires_at)
  where status = 'processing';
create index if not exists billing_webhook_effects_lease_idx
  on public.billing_webhook_effects (lease_expires_at)
  where status = 'processing';
create index if not exists billing_webhook_replay_audit_inbox_idx
  on public.billing_webhook_replay_audit (inbox_id, requested_at desc);

alter table public.billing_webhook_inbox enable row level security;
alter table public.billing_webhook_effects enable row level security;
alter table public.billing_webhook_replay_audit enable row level security;

revoke all on table public.billing_webhook_inbox from anon, authenticated;
revoke all on table public.billing_webhook_effects from anon, authenticated;
revoke all on table public.billing_webhook_replay_audit from anon, authenticated;

create or replace function public.billing_receive_webhook(
  p_provider text,
  p_provider_event_id text,
  p_event_type text,
  p_payload_hash text,
  p_payload jsonb
)
returns table(inbox_id uuid, delivery_status text, payload_matches boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_status text;
  v_hash text;
begin
  if p_provider !~ '^[a-z0-9_-]{1,32}$'
     or nullif(trim(p_provider_event_id), '') is null
     or length(p_provider_event_id) > 255
     or nullif(trim(p_event_type), '') is null
     or length(p_event_type) > 128
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or p_payload is null then
    raise exception 'invalid_webhook_receipt';
  end if;

  insert into public.billing_webhook_inbox (
    provider, provider_event_id, event_type, payload_hash, payload
  ) values (
    p_provider, p_provider_event_id, p_event_type, p_payload_hash, p_payload
  )
  on conflict (provider, provider_event_id) do nothing
  returning id, status, payload_hash into v_id, v_status, v_hash;

  if v_id is null then
    select i.id, i.status, i.payload_hash
      into v_id, v_status, v_hash
    from public.billing_webhook_inbox i
    where i.provider = p_provider
      and i.provider_event_id = p_provider_event_id
    for update;

    if v_hash <> p_payload_hash then
      update public.billing_webhook_inbox
      set status = 'quarantined',
          quarantine_reason = 'payload_hash_mismatch',
          lease_token = null,
          lease_expires_at = null,
          updated_at = now()
      where id = v_id;
      v_status := 'quarantined';
    end if;
  end if;

  inbox_id := v_id;
  delivery_status := v_status;
  payload_matches := v_hash = p_payload_hash;
  return next;
end;
$$;

create or replace function public.billing_claim_webhook(
  p_inbox_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer default 60
)
returns table(
  claim_status text,
  inbox_id uuid,
  provider text,
  provider_event_id text,
  event_type text,
  payload jsonb,
  attempt_count integer,
  next_attempt_at timestamptz,
  lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.billing_webhook_inbox%rowtype;
begin
  if p_lease_token is null or p_lease_seconds not between 10 and 300 then
    raise exception 'invalid_webhook_lease';
  end if;

  select * into v_row
  from public.billing_webhook_inbox i
  where i.id = p_inbox_id
  for update;

  if not found then
    raise exception 'webhook_not_found';
  end if;

  if v_row.status = 'processed' then
    claim_status := 'processed';
  elsif v_row.status = 'quarantined' then
    claim_status := 'quarantined';
  elsif v_row.status = 'processing' and v_row.lease_expires_at > now() then
    claim_status := 'busy';
  elsif v_row.status = 'failed' and v_row.next_attempt_at > now() then
    claim_status := 'retry_scheduled';
  elsif v_row.attempt_count >= v_row.max_attempts then
    update public.billing_webhook_inbox
    set status = 'quarantined',
        quarantine_reason = coalesce(quarantine_reason, 'retry_limit_reached'),
        lease_token = null,
        lease_expires_at = null,
        updated_at = now()
    where id = p_inbox_id;
    claim_status := 'quarantined';
  else
    update public.billing_webhook_inbox as inbox
    set status = 'processing',
        attempt_count = inbox.attempt_count + 1,
        lease_token = p_lease_token,
        lease_expires_at = now() + make_interval(secs => p_lease_seconds),
        processing_started_at = now(),
        updated_at = now()
    where inbox.id = p_inbox_id
    returning inbox.* into v_row;
    claim_status := 'claimed';
  end if;

  inbox_id := v_row.id;
  provider := v_row.provider;
  provider_event_id := v_row.provider_event_id;
  event_type := v_row.event_type;
  payload := v_row.payload;
  attempt_count := v_row.attempt_count;
  next_attempt_at := v_row.next_attempt_at;
  lease_expires_at := v_row.lease_expires_at;
  return next;
end;
$$;

create or replace function public.billing_complete_webhook(
  p_inbox_id uuid,
  p_lease_token uuid
)
returns table(completed boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.billing_webhook_inbox
  set status = 'processed',
      processed_at = now(),
      lease_token = null,
      lease_expires_at = null,
      last_error_code = null,
      updated_at = now()
  where id = p_inbox_id
    and status = 'processing'
    and lease_token = p_lease_token;
  completed := found;
  return next;
end;
$$;

create or replace function public.billing_fail_webhook(
  p_inbox_id uuid,
  p_lease_token uuid,
  p_error_code text
)
returns table(failure_status text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempt_count integer;
  v_max_attempts integer;
begin
  if p_error_code !~ '^[a-z0-9_]{1,64}$' then
    raise exception 'invalid_error_code';
  end if;

  select i.attempt_count, i.max_attempts
    into v_attempt_count, v_max_attempts
  from public.billing_webhook_inbox i
  where i.id = p_inbox_id
    and i.status = 'processing'
    and i.lease_token = p_lease_token
  for update;

  if not found then
    raise exception 'webhook_lease_lost';
  end if;

  failure_status := case
    when v_attempt_count >= v_max_attempts then 'quarantined'
    else 'failed'
  end;

  update public.billing_webhook_inbox
  set status = failure_status,
      next_attempt_at = now() + make_interval(
        secs => least(3600, 30 * power(2, greatest(0, v_attempt_count - 1))::integer)
      ),
      lease_token = null,
      lease_expires_at = null,
      last_error_code = p_error_code,
      quarantine_reason = case
        when failure_status = 'quarantined' then 'retry_limit_reached'
        else quarantine_reason
      end,
      updated_at = now()
  where id = p_inbox_id;
  return next;
end;
$$;

create or replace function public.billing_quarantine_webhook(
  p_inbox_id uuid,
  p_lease_token uuid,
  p_reason_code text
)
returns table(quarantined boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_reason_code !~ '^[a-z0-9_:-]{1,96}$' then
    raise exception 'invalid_quarantine_reason';
  end if;
  update public.billing_webhook_inbox
  set status = 'quarantined',
      quarantine_reason = p_reason_code,
      lease_token = null,
      lease_expires_at = null,
      updated_at = now()
  where id = p_inbox_id
    and status = 'processing'
    and lease_token = p_lease_token;
  quarantined := found;
  return next;
end;
$$;

create or replace function public.billing_claim_webhook_effect(
  p_inbox_id uuid,
  p_effect_key text,
  p_lease_token uuid,
  p_lease_seconds integer default 60
)
returns table(claim_status text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.billing_webhook_effects%rowtype;
begin
  if p_effect_key !~ '^[a-z0-9_:-]{1,96}$'
     or p_lease_token is null
     or p_lease_seconds not between 10 and 300 then
    raise exception 'invalid_effect_claim';
  end if;

  insert into public.billing_webhook_effects (inbox_id, effect_key)
  values (p_inbox_id, p_effect_key)
  on conflict (inbox_id, effect_key) do nothing;

  select * into v_row
  from public.billing_webhook_effects e
  where e.inbox_id = p_inbox_id and e.effect_key = p_effect_key
  for update;

  if v_row.status = 'completed' then
    claim_status := 'completed';
  elsif v_row.status = 'processing' and v_row.lease_expires_at > now() then
    claim_status := 'busy';
  else
    update public.billing_webhook_effects
    set status = 'processing',
        attempt_count = attempt_count + 1,
        lease_token = p_lease_token,
        lease_expires_at = now() + make_interval(secs => p_lease_seconds),
        last_error_code = null,
        updated_at = now()
    where inbox_id = p_inbox_id and effect_key = p_effect_key;
    claim_status := 'claimed';
  end if;
  return next;
end;
$$;

create or replace function public.billing_complete_webhook_effect(
  p_inbox_id uuid,
  p_effect_key text,
  p_lease_token uuid
)
returns table(completed boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.billing_webhook_effects
  set status = 'completed',
      completed_at = now(),
      lease_token = null,
      lease_expires_at = null,
      last_error_code = null,
      updated_at = now()
  where inbox_id = p_inbox_id
    and effect_key = p_effect_key
    and status = 'processing'
    and lease_token = p_lease_token;
  completed := found;
  return next;
end;
$$;

create or replace function public.billing_fail_webhook_effect(
  p_inbox_id uuid,
  p_effect_key text,
  p_lease_token uuid,
  p_error_code text
)
returns table(failed boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_error_code !~ '^[a-z0-9_]{1,64}$' then
    raise exception 'invalid_error_code';
  end if;
  update public.billing_webhook_effects
  set status = 'failed',
      lease_token = null,
      lease_expires_at = null,
      last_error_code = p_error_code,
      updated_at = now()
  where inbox_id = p_inbox_id
    and effect_key = p_effect_key
    and status = 'processing'
    and lease_token = p_lease_token;
  failed := found;
  return next;
end;
$$;

create or replace function public.billing_replay_webhook(
  p_inbox_id uuid,
  p_actor_id text,
  p_reason_code text
)
returns table(replay_queued boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_previous_status text;
begin
  if p_actor_id !~ '^[a-z0-9_-]{3,64}$'
     or p_reason_code !~ '^[a-z0-9_:-]{3,96}$' then
    raise exception 'invalid_replay_audit';
  end if;

  select i.status into v_previous_status
  from public.billing_webhook_inbox i
  where i.id = p_inbox_id
  for update;

  if not found then
    raise exception 'webhook_not_found';
  end if;
  if v_previous_status = 'processing' then
    raise exception 'webhook_is_processing';
  end if;
  if exists (
    select 1 from public.billing_webhook_inbox i
    where i.id = p_inbox_id and i.payload_purged_at is not null
  ) then
    raise exception 'webhook_payload_purged';
  end if;

  insert into public.billing_webhook_replay_audit (
    inbox_id, actor_id, reason_code, previous_status
  ) values (
    p_inbox_id, p_actor_id, p_reason_code, v_previous_status
  );

  update public.billing_webhook_inbox
  set status = 'received',
      attempt_count = 0,
      next_attempt_at = now(),
      lease_token = null,
      lease_expires_at = null,
      last_error_code = null,
      quarantine_reason = null,
      processed_at = null,
      replay_count = replay_count + 1,
      updated_at = now()
  where id = p_inbox_id;

  replay_queued := true;
  return next;
end;
$$;

create or replace function public.billing_purge_webhook_payloads(
  p_processed_before timestamptz default now() - interval '30 days',
  p_quarantined_before timestamptz default now() - interval '180 days'
)
returns table(purged_count integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.billing_webhook_inbox
  set payload = '{"purged":true}'::jsonb,
      payload_purged_at = now(),
      updated_at = now()
  where payload_purged_at is null
    and (
      (status = 'processed' and processed_at < p_processed_before)
      or (status = 'quarantined' and updated_at < p_quarantined_before)
    );
  get diagnostics purged_count = row_count;
  return next;
end;
$$;

revoke execute on function public.billing_receive_webhook(text, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.billing_claim_webhook(uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function public.billing_complete_webhook(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.billing_fail_webhook(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.billing_quarantine_webhook(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.billing_claim_webhook_effect(uuid, text, uuid, integer) from public, anon, authenticated;
revoke execute on function public.billing_complete_webhook_effect(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.billing_fail_webhook_effect(uuid, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.billing_replay_webhook(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.billing_purge_webhook_payloads(timestamptz, timestamptz) from public, anon, authenticated;

grant execute on function public.billing_receive_webhook(text, text, text, text, jsonb) to service_role;
grant execute on function public.billing_claim_webhook(uuid, uuid, integer) to service_role;
grant execute on function public.billing_complete_webhook(uuid, uuid) to service_role;
grant execute on function public.billing_fail_webhook(uuid, uuid, text) to service_role;
grant execute on function public.billing_quarantine_webhook(uuid, uuid, text) to service_role;
grant execute on function public.billing_claim_webhook_effect(uuid, text, uuid, integer) to service_role;
grant execute on function public.billing_complete_webhook_effect(uuid, text, uuid) to service_role;
grant execute on function public.billing_fail_webhook_effect(uuid, text, uuid, text) to service_role;
grant execute on function public.billing_replay_webhook(uuid, text, text) to service_role;
grant execute on function public.billing_purge_webhook_payloads(timestamptz, timestamptz) to service_role;
