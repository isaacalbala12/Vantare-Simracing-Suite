-- ISA-224 / TAU-05C: durable GitHub delivery state. This migration does not
-- call GitHub and exposes no client-facing policy or grant.

alter table public.testing_center_effect_outbox
  add column lease_token uuid,
  add column lease_expires_at timestamptz,
  add column next_attempt_at timestamptz,
  add column last_error_code text,
  add column external_issue_number bigint,
  add column external_issue_node_id text,
  add constraint testing_center_effect_outbox_lease_shape_check check (
    (state = 'claimed' and lease_token is not null and lease_expires_at is not null)
    or (state <> 'claimed' and lease_token is null and lease_expires_at is null)
  ),
  add constraint testing_center_effect_outbox_external_shape_check check (
    (state = 'completed' and external_issue_number > 0 and external_issue_node_id is not null)
    or (state <> 'completed' and external_issue_number is null and external_issue_node_id is null)
  ),
  add constraint testing_center_effect_outbox_error_check check (
    last_error_code is null or last_error_code ~ '^[a-z0-9_]{1,64}$'
  ),
  add constraint testing_center_effect_outbox_node_check check (
    external_issue_node_id is null or octet_length(external_issue_node_id) between 1 and 256
  );

create index testing_center_effect_outbox_retry_idx
  on public.testing_center_effect_outbox(next_attempt_at, created_at)
  where state = 'failed';

create table public.testing_center_github_deliveries (
  delivery_id text primary key
    constraint testing_center_github_deliveries_id_check check (
      delivery_id ~ '^[A-Za-z0-9_-]{1,128}$'
    ),
  event_name text not null
    constraint testing_center_github_deliveries_event_check check (event_name = 'issues'),
  action text not null
    constraint testing_center_github_deliveries_action_check check (
      action in ('opened', 'edited', 'closed', 'reopened')
    ),
  payload_digest text not null
    constraint testing_center_github_deliveries_digest_check check (
      payload_digest ~ '^[0-9a-f]{64}$'
    ),
  external_issue_number bigint not null check (external_issue_number > 0),
  received_at timestamptz not null default now()
);

alter table public.testing_center_github_deliveries enable row level security;
alter table public.testing_center_github_deliveries force row level security;
revoke all on table public.testing_center_github_deliveries from public, anon, authenticated;
grant select, insert on table public.testing_center_github_deliveries to service_role;

create or replace function public.testing_center_claim_github_effect(
  p_effect_id text,
  p_lease_token uuid,
  p_lease_seconds integer default 60
)
returns table(claim_status text, technical_issue_id text, primary_report_id text,
  attempt_count smallint, lease_expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_row public.testing_center_effect_outbox%rowtype;
begin
  if p_lease_token is null or p_lease_seconds not between 10 and 300 then
    raise exception 'testing_center_github_claim_invalid' using errcode = '22023';
  end if;
  select * into v_row from public.testing_center_effect_outbox
  where effect_id = p_effect_id for update;
  if not found then raise exception 'testing_center_github_effect_not_found' using errcode = 'P0002'; end if;

  if v_row.state = 'completed' then claim_status := 'completed';
  elsif exists (select 1 from public.testing_center_pauses p where p.is_paused and
    (p.scope = 'global' or (p.scope = 'flow' and p.technical_issue_id = v_row.technical_issue_id))) then
    claim_status := 'paused';
  elsif v_row.state = 'claimed' and v_row.lease_expires_at > now() then claim_status := 'busy';
  elsif v_row.state = 'failed' and v_row.next_attempt_at > now() then claim_status := 'retry_scheduled';
  elsif v_row.attempt_count >= 5 then claim_status := 'exhausted';
  else
    update public.testing_center_effect_outbox as outbox set state = 'claimed',
      attempt_count = outbox.attempt_count + 1, lease_token = p_lease_token,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      next_attempt_at = null, last_error_code = null, updated_at = now()
    where outbox.effect_id = p_effect_id returning outbox.* into v_row;
    claim_status := 'claimed';
  end if;
  technical_issue_id := v_row.technical_issue_id;
  primary_report_id := v_row.primary_report_id;
  attempt_count := v_row.attempt_count;
  lease_expires_at := v_row.lease_expires_at;
  return next;
end; $$;

create or replace function public.testing_center_assert_github_effect_unpaused(
  p_effect_id text, p_lease_token uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare v_issue_id text;
begin
  select technical_issue_id into v_issue_id from public.testing_center_effect_outbox
  where effect_id = p_effect_id and state = 'claimed' and lease_token = p_lease_token
    and lease_expires_at > now() for update;
  if not found then raise exception 'testing_center_github_lease_lost' using errcode = '55000'; end if;
  if exists (select 1 from public.testing_center_pauses p where p.is_paused and
    (p.scope = 'global' or (p.scope = 'flow' and p.technical_issue_id = v_issue_id))) then
    raise exception 'testing_center_paused' using errcode = '55000';
  end if;
end; $$;

create or replace function public.testing_center_complete_github_effect(
  p_effect_id text, p_lease_token uuid, p_issue_number bigint, p_issue_node_id text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_issue_number <= 0 or p_issue_node_id is null or btrim(p_issue_node_id) = ''
    or octet_length(p_issue_node_id) > 256 then
    raise exception 'testing_center_github_external_invalid' using errcode = '22023';
  end if;
  update public.testing_center_effect_outbox set state = 'completed', lease_token = null,
    lease_expires_at = null, next_attempt_at = null, last_error_code = null,
    external_issue_number = p_issue_number, external_issue_node_id = p_issue_node_id,
    updated_at = now()
  where effect_id = p_effect_id and state = 'claimed' and lease_token = p_lease_token
    and lease_expires_at > now();
  if not found then raise exception 'testing_center_github_lease_lost' using errcode = '55000'; end if;
end; $$;

create or replace function public.testing_center_fail_github_effect(
  p_effect_id text, p_lease_token uuid, p_error_code text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_error_code !~ '^[a-z0-9_]{1,64}$' then
    raise exception 'testing_center_github_error_invalid' using errcode = '22023';
  end if;
  update public.testing_center_effect_outbox set state = 'failed', lease_token = null,
    lease_expires_at = null,
    next_attempt_at = now() + make_interval(secs => least(300, 5 * (2 ^ greatest(attempt_count - 1, 0))::integer)),
    last_error_code = p_error_code, updated_at = now()
  where effect_id = p_effect_id and state = 'claimed' and lease_token = p_lease_token;
  if not found then raise exception 'testing_center_github_lease_lost' using errcode = '55000'; end if;
end; $$;

create or replace function public.testing_center_reconcile_github_effect(
  p_effect_id text, p_issue_number bigint, p_issue_node_id text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_issue_number <= 0 or p_issue_node_id is null or btrim(p_issue_node_id) = ''
    or octet_length(p_issue_node_id) > 256 then
    raise exception 'testing_center_github_external_invalid' using errcode = '22023';
  end if;
  update public.testing_center_effect_outbox set state = 'completed', lease_token = null,
    lease_expires_at = null, next_attempt_at = null, last_error_code = null,
    external_issue_number = p_issue_number, external_issue_node_id = p_issue_node_id,
    updated_at = now()
  where effect_id = p_effect_id and state <> 'completed';
  if not found and not exists (select 1 from public.testing_center_effect_outbox
    where effect_id = p_effect_id and state = 'completed'
      and external_issue_number = p_issue_number and external_issue_node_id = p_issue_node_id) then
    raise exception 'testing_center_github_reconcile_conflict' using errcode = '23505';
  end if;
end; $$;

create or replace function public.testing_center_record_github_delivery(
  p_delivery_id text, p_event_name text, p_action text,
  p_payload_digest text, p_issue_number bigint
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_existing public.testing_center_github_deliveries%rowtype;
begin
  insert into public.testing_center_github_deliveries(
    delivery_id, event_name, action, payload_digest, external_issue_number
  ) values (p_delivery_id, p_event_name, p_action, p_payload_digest, p_issue_number)
  on conflict (delivery_id) do nothing;
  if found then return false; end if;
  select * into v_existing from public.testing_center_github_deliveries where delivery_id = p_delivery_id;
  if v_existing.event_name <> p_event_name or v_existing.action <> p_action
    or v_existing.payload_digest <> p_payload_digest
    or v_existing.external_issue_number <> p_issue_number then
    raise exception 'testing_center_github_delivery_conflict' using errcode = '23505';
  end if;
  return true;
end; $$;

do $$ declare fn text; begin
  foreach fn in array array[
    'testing_center_claim_github_effect(text,uuid,integer)',
    'testing_center_assert_github_effect_unpaused(text,uuid)',
    'testing_center_complete_github_effect(text,uuid,bigint,text)',
    'testing_center_fail_github_effect(text,uuid,text)',
    'testing_center_reconcile_github_effect(text,bigint,text)',
    'testing_center_record_github_delivery(text,text,text,text,bigint)'
  ] loop
    execute 'revoke all on function public.' || fn || ' from public, anon, authenticated';
    execute 'grant execute on function public.' || fn || ' to service_role';
  end loop;
end $$;

comment on table public.testing_center_github_deliveries is
  'TAU-05C signed GitHub delivery replay ledger; payloads and signatures are not stored.';
