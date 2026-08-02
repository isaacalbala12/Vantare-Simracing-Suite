-- BIL-10: environment-partitioned inbox and sanitized operational snapshot.
-- Legacy receipts cannot be attributed safely and remain explicitly unclassified.

alter table public.billing_webhook_inbox
  add column if not exists environment text not null default 'unclassified';
alter table public.billing_webhook_inbox
  add column if not exists duplicate_count integer not null default 0;
alter table public.billing_webhook_inbox
  add column if not exists last_duplicate_at timestamptz;

alter table public.billing_webhook_inbox
  drop constraint if exists billing_webhook_inbox_duplicate_count_check;
alter table public.billing_webhook_inbox
  add constraint billing_webhook_inbox_duplicate_count_check
  check (duplicate_count >= 0);

alter table public.billing_webhook_inbox
  drop constraint if exists billing_webhook_inbox_environment_check;
alter table public.billing_webhook_inbox
  add constraint billing_webhook_inbox_environment_check
  check (environment in ('sandbox', 'production', 'unclassified'));
alter table public.billing_webhook_inbox
  alter column environment drop default;

alter table public.billing_webhook_inbox
  drop constraint if exists billing_webhook_inbox_provider_provider_event_id_key;
alter table public.billing_webhook_inbox
  add constraint billing_webhook_inbox_provider_environment_event_id_key
  unique (provider, environment, provider_event_id);

create function public.billing_receive_webhook(
  p_provider text,
  p_environment text,
  p_provider_event_id text,
  p_event_type text,
  p_payload_hash text,
  p_payload jsonb
)
returns table(inbox_id uuid, delivery_status text, payload_matches boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_status text;
  v_hash text;
begin
  if p_provider !~ '^[a-z0-9_-]{1,32}$'
     or p_environment not in ('sandbox', 'production', 'unclassified')
     or nullif(trim(p_provider_event_id), '') is null
     or length(p_provider_event_id) > 255
     or nullif(trim(p_event_type), '') is null
     or length(p_event_type) > 128
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or p_payload is null then
    raise exception 'invalid_webhook_receipt';
  end if;

  insert into public.billing_webhook_inbox (
    provider, environment, provider_event_id, event_type, payload_hash, payload
  ) values (
    p_provider, p_environment, p_provider_event_id, p_event_type,
    p_payload_hash, p_payload
  )
  on conflict (provider, environment, provider_event_id) do nothing
  returning id, status, payload_hash into v_id, v_status, v_hash;

  if v_id is null then
    select i.id, i.status, i.payload_hash
      into v_id, v_status, v_hash
    from public.billing_webhook_inbox i
    where i.provider = p_provider
      and i.environment = p_environment
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
    else
      update public.billing_webhook_inbox
      set duplicate_count = duplicate_count + 1,
          last_duplicate_at = now(),
          updated_at = now()
      where id = v_id;
    end if;
  end if;

  inbox_id := v_id;
  delivery_status := v_status;
  payload_matches := v_hash = p_payload_hash;
  return next;
end;
$$;

revoke all on function public.billing_receive_webhook(text, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.billing_receive_webhook(text, text, text, text, text, jsonb)
  to service_role;

-- Transitional overload: migrate the database before deploying the new Edge
-- function without dropping verified deliveries. It is deliberately visible
-- as unclassified and must be retired after the new runtime is confirmed.
create or replace function public.billing_receive_webhook(
  p_provider text,
  p_provider_event_id text,
  p_event_type text,
  p_payload_hash text,
  p_payload jsonb
)
returns table(inbox_id uuid, delivery_status text, payload_matches boolean)
language sql
security definer
set search_path = ''
as $$
  select * from public.billing_receive_webhook(
    p_provider,
    'unclassified',
    p_provider_event_id,
    p_event_type,
    p_payload_hash,
    p_payload
  );
$$;

revoke all on function public.billing_receive_webhook(text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.billing_receive_webhook(text, text, text, text, jsonb)
  to service_role;

-- No customer, commercial resource or provider identifiers leave this function.

create or replace function public.billing_observability_snapshot(
  p_environment text,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_snapshot jsonb;
begin
  if p_environment not in ('sandbox', 'production') or p_now is null then
    raise exception 'invalid_billing_observability_request';
  end if;

  select jsonb_build_object(
    'schemaVersion', 1,
    'environment', p_environment,
    'observedAt', p_now,
    'inbox', jsonb_build_object(
      'received', count(*) filter (where i.status = 'received'),
      'processing', count(*) filter (where i.status = 'processing'),
      'failed', count(*) filter (where i.status = 'failed'),
      'quarantined', count(*) filter (where i.status = 'quarantined'),
      'retryDue', count(*) filter (
        where i.status = 'failed' and i.next_attempt_at <= p_now
      ),
      'orphaned', count(*) filter (
        where i.status = 'processing' and i.lease_expires_at < p_now
      ),
      'duplicateDeliveries', coalesce(sum(i.duplicate_count), 0),
      'oldestPendingSeconds', greatest(0, coalesce(floor(extract(epoch from
        p_now - min(i.received_at) filter (
          where i.status in ('received', 'processing', 'failed')
        )
      )), 0)),
      'unclassified', (
        select count(*) from public.billing_webhook_inbox legacy
        where legacy.provider = 'polar'
          and legacy.environment = 'unclassified'
      ),
      'replays24h', (
        select count(*) from public.billing_webhook_replay_audit a
        join public.billing_webhook_inbox replayed on replayed.id = a.inbox_id
        where a.requested_at >= p_now - interval '24 hours'
          and replayed.provider = 'polar'
          and replayed.environment = p_environment
      )
    ),
    'reconciliation', jsonb_build_object(
      'runs24h', (
        select count(*) from public.billing_reconciliation_runs r
        where r.environment = p_environment
          and r.created_at >= p_now - interval '24 hours'
      ),
      'quarantined24h', (
        select count(*) from public.billing_reconciliation_runs r
        where r.environment = p_environment
          and r.status = 'quarantined'
          and r.created_at >= p_now - interval '24 hours'
      ),
      'changed24h', (
        select coalesce(sum(r.changed_count), 0)
        from public.billing_reconciliation_runs r
        where r.environment = p_environment
          and r.created_at >= p_now - interval '24 hours'
      ),
      'lastSuccessfulAgeSeconds', coalesce((
        select floor(extract(epoch from p_now - max(r.created_at)))
        from public.billing_reconciliation_runs r
        where r.environment = p_environment
          and r.status in ('applied', 'unchanged')
          and r.created_at <= p_now
      ), 0)
    ),
    'projection', jsonb_build_object(
      'resourcesWithConflicts', (
        select count(*) from public.billing_commercial_resources r
        where r.environment = p_environment and r.conflict_count > 0
      ),
      'staleEvents24h', (
        select coalesce(sum(r.stale_event_count), 0)
        from public.billing_commercial_resources r
        where r.environment = p_environment
          and r.last_stale_event_at >= p_now - interval '24 hours'
      ),
      'incoherentActiveGrants', (
        select count(*) from public.billing_access_grants g
        where g.environment = p_environment
          and g.status = 'active'
          and (
            g.valid_until <= p_now
            or (
              g.source_type in ('subscription', 'subscription_recovery')
              and g.valid_until is null
            )
          )
      )
    )
  ) into v_snapshot
  from public.billing_webhook_inbox i
  where i.provider = 'polar'
    and i.environment = p_environment;

  return v_snapshot;
end;
$$;

revoke all on function public.billing_observability_snapshot(text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.billing_observability_snapshot(text, timestamptz)
  to service_role;

comment on function public.billing_observability_snapshot(text, timestamptz) is
  'Aggregate-only BIL-10 operational snapshot. Contains no customer or provider resource identifiers.';
