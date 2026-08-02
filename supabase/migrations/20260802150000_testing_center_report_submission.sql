-- ISA-218 / TAU-04A: private report payloads and one authenticated,
-- idempotent submission boundary. No client receives direct mutation grants.

create table public.testing_center_report_payloads (
  report_id text primary key
    references public.testing_center_reports(report_id) on delete restrict,
  action_text text not null
    constraint testing_center_report_payload_action_check check (
      action_text = btrim(action_text)
      and octet_length(action_text) between 3 and 2048
    ),
  expected_text text not null
    constraint testing_center_report_payload_expected_check check (
      expected_text = btrim(expected_text)
      and octet_length(expected_text) between 3 and 2048
    ),
  observed_text text not null
    constraint testing_center_report_payload_observed_check check (
      observed_text = btrim(observed_text)
      and octet_length(observed_text) between 3 and 2048
    ),
  context_text text
    constraint testing_center_report_payload_context_check check (
      context_text is null
      or (
        context_text = btrim(context_text)
        and octet_length(context_text) between 1 and 4096
      )
    ),
  app_version text not null
    constraint testing_center_report_payload_version_check check (
      app_version ~ '^[A-Za-z0-9][A-Za-z0-9._+-]{0,31}$'
    ),
  os_family text not null
    constraint testing_center_report_payload_os_check check (os_family = 'windows'),
  os_version text not null
    constraint testing_center_report_payload_os_version_check check (
      os_version ~ '^[A-Za-z0-9][A-Za-z0-9 ._+-]{0,63}$'
    ),
  module text not null
    constraint testing_center_report_payload_module_check check (module in (
      'hub', 'launcher', 'settings', 'overlay_studio', 'overlay_runtime',
      'telemetry', 'telemetry_analysis', 'engineer', 'strategy', 'calendar',
      'billing', 'account', 'updater', 'testing_center', 'unknown'
    )),
  include_diagnostic boolean not null,
  include_logs boolean not null,
  diagnostic_document jsonb,
  diagnostic_transport_digest text
    constraint testing_center_report_payload_diagnostic_digest_check check (
      diagnostic_transport_digest is null
      or diagnostic_transport_digest ~ '^[0-9a-f]{64}$'
    ),
  created_at timestamptz not null default now(),
  constraint testing_center_report_payload_diagnostic_shape_check check (
    (
      not include_diagnostic
      and not include_logs
      and diagnostic_document is null
      and diagnostic_transport_digest is null
    )
    or (
      include_diagnostic
      and diagnostic_document is not null
      and diagnostic_transport_digest is not null
    )
  ),
  constraint testing_center_report_payload_logs_require_diagnostic_check check (
    not include_logs or include_diagnostic
  )
);

create table public.testing_center_report_submission_keys (
  reporter_user_id uuid not null references auth.users(id) on delete restrict,
  idempotency_key text not null
    constraint testing_center_report_submission_key_check check (
      idempotency_key <> ''
      and idempotency_key !~ '^[[:space:]]|[[:space:]]$'
      and octet_length(idempotency_key) <= 256
    ),
  payload_digest text not null
    constraint testing_center_report_submission_digest_check check (
      payload_digest ~ '^[0-9a-f]{64}$'
    ),
  report_id text not null unique
    references public.testing_center_reports(report_id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (reporter_user_id, idempotency_key)
);

create table public.testing_center_report_events (
  event_id text primary key
    constraint testing_center_report_events_id_check check (
      event_id <> ''
      and event_id !~ '^[[:space:]]|[[:space:]]$'
      and octet_length(event_id) <= 256
    ),
  report_id text not null unique
    references public.testing_center_reports(report_id) on delete restrict,
  event_type text not null default 'submitted'
    constraint testing_center_report_events_type_check check (event_type = 'submitted'),
  actor_id text not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  actor_role text not null
    constraint testing_center_report_events_role_check check (
      actor_role in ('tester', 'primary_tester', 'owner')
    ),
  operation_digest text not null
    constraint testing_center_report_events_digest_check check (
      operation_digest ~ '^[0-9a-f]{64}$'
    ),
  created_at timestamptz not null default now()
);

create index testing_center_report_payloads_created_idx
  on public.testing_center_report_payloads(created_at desc);
create index testing_center_report_events_actor_idx
  on public.testing_center_report_events(actor_user_id, created_at desc);

alter table public.testing_center_report_payloads enable row level security;
alter table public.testing_center_report_payloads force row level security;
alter table public.testing_center_report_submission_keys enable row level security;
alter table public.testing_center_report_submission_keys force row level security;
alter table public.testing_center_report_events enable row level security;
alter table public.testing_center_report_events force row level security;

revoke all on table public.testing_center_report_payloads,
  public.testing_center_report_submission_keys,
  public.testing_center_report_events
from public, anon, authenticated;

grant select, insert, update, delete on table
  public.testing_center_report_payloads,
  public.testing_center_report_submission_keys,
  public.testing_center_report_events
to service_role;

grant select on table public.testing_center_report_payloads to authenticated;

create policy testing_center_report_payloads_select_own
  on public.testing_center_report_payloads
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.testing_center_reports as report
      where report.report_id = testing_center_report_payloads.report_id
        and (
          report.reporter_user_id = auth.uid()
          or public.testing_center_current_role() = 'owner'
        )
    )
  );

create or replace function public.testing_center_submit_report(
  p_contract_version text,
  p_channel text,
  p_action_text text,
  p_expected_text text,
  p_observed_text text,
  p_context_text text,
  p_app_version text,
  p_os_family text,
  p_os_version text,
  p_module text,
  p_include_diagnostic boolean,
  p_include_logs boolean,
  p_diagnostic_payload text,
  p_diagnostic_digest text,
  p_idempotency_key text
)
returns table (
  report_id text,
  report_state text,
  idempotent boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_actor_id text;
  v_role text;
  v_context_text text;
  v_diagnostic jsonb;
  v_diagnostic_time timestamptz;
  v_operation_digest text;
  v_report_id text;
  v_event_id text;
  v_evidence_id text;
  v_created_at timestamptz;
  v_existing public.testing_center_report_submission_keys%rowtype;
begin
  if v_user_id is null then
    raise exception 'testing_center_auth_required' using errcode = '42501';
  end if;

  select membership.actor_id, membership.role
  into v_actor_id, v_role
  from public.testing_center_memberships as membership
  where membership.user_id = v_user_id
    and membership.active;

  if not found then
    raise exception 'testing_center_membership_required' using errcode = '42501';
  end if;

  if p_contract_version is distinct from 'testing-center.v1' then
    raise exception 'testing_center_contract_version_invalid' using errcode = '22023';
  end if;
  if p_channel = 'nightly' then
    if v_role not in ('primary_tester', 'owner') then
      raise exception 'testing_center_nightly_role_required' using errcode = '42501';
    end if;
  elsif p_channel = 'testers' then
    if v_role not in ('tester', 'primary_tester', 'owner') then
      raise exception 'testing_center_testers_role_required' using errcode = '42501';
    end if;
  else
    raise exception 'testing_center_channel_invalid' using errcode = '22023';
  end if;

  if p_action_text is null
    or p_action_text <> pg_catalog.btrim(p_action_text)
    or pg_catalog.octet_length(p_action_text) not between 3 and 2048 then
    raise exception 'testing_center_action_invalid' using errcode = '22023';
  end if;
  if p_expected_text is null
    or p_expected_text <> pg_catalog.btrim(p_expected_text)
    or pg_catalog.octet_length(p_expected_text) not between 3 and 2048 then
    raise exception 'testing_center_expected_invalid' using errcode = '22023';
  end if;
  if p_observed_text is null
    or p_observed_text <> pg_catalog.btrim(p_observed_text)
    or pg_catalog.octet_length(p_observed_text) not between 3 and 2048 then
    raise exception 'testing_center_observed_invalid' using errcode = '22023';
  end if;

  v_context_text := nullif(pg_catalog.btrim(p_context_text), '');
  if v_context_text is not null
    and pg_catalog.octet_length(v_context_text) > 4096 then
    raise exception 'testing_center_context_invalid' using errcode = '22023';
  end if;
  if p_app_version is null
    or p_app_version !~ '^[A-Za-z0-9][A-Za-z0-9._+-]{0,31}$' then
    raise exception 'testing_center_app_version_invalid' using errcode = '22023';
  end if;
  if p_os_family is distinct from 'windows' then
    raise exception 'testing_center_os_invalid' using errcode = '22023';
  end if;
  if p_os_version is null
    or p_os_version !~ '^[A-Za-z0-9][A-Za-z0-9 ._+-]{0,63}$' then
    raise exception 'testing_center_os_version_invalid' using errcode = '22023';
  end if;
  if p_module is null or p_module not in (
    'hub', 'launcher', 'settings', 'overlay_studio', 'overlay_runtime',
    'telemetry', 'telemetry_analysis', 'engineer', 'strategy', 'calendar',
    'billing', 'account', 'updater', 'testing_center', 'unknown'
  ) then
    raise exception 'testing_center_module_invalid' using errcode = '22023';
  end if;
  if p_idempotency_key is null
    or p_idempotency_key = ''
    or p_idempotency_key ~ '^[[:space:]]|[[:space:]]$'
    or pg_catalog.octet_length(p_idempotency_key) > 256 then
    raise exception 'testing_center_idempotency_key_invalid' using errcode = '22023';
  end if;
  if p_include_diagnostic is null or p_include_logs is null then
    raise exception 'testing_center_consent_invalid' using errcode = '22023';
  end if;
  if p_include_logs and not p_include_diagnostic then
    raise exception 'testing_center_logs_require_diagnostic' using errcode = '22023';
  end if;

  if not p_include_diagnostic then
    if p_diagnostic_payload is not null or p_diagnostic_digest is not null then
      raise exception 'testing_center_diagnostic_without_consent' using errcode = '22023';
    end if;
  else
    if p_diagnostic_payload is null
      or pg_catalog.octet_length(p_diagnostic_payload) > 65536
      or p_diagnostic_digest is null
      or p_diagnostic_digest !~ '^[0-9a-f]{64}$'
      or p_diagnostic_digest <> pg_catalog.encode(
        public.digest(pg_catalog.convert_to(p_diagnostic_payload, 'UTF8'), 'sha256'),
        'hex'
      ) then
      raise exception 'testing_center_diagnostic_integrity_invalid' using errcode = '22023';
    end if;

    begin
      v_diagnostic := p_diagnostic_payload::jsonb;
    exception when others then
      raise exception 'testing_center_diagnostic_json_invalid' using errcode = '22023';
    end;

    if pg_catalog.jsonb_typeof(v_diagnostic) <> 'object'
      or (select count(*) from pg_catalog.jsonb_object_keys(v_diagnostic)) <> 7
      or exists (
        select 1 from pg_catalog.jsonb_object_keys(v_diagnostic) as key
        where key not in (
          'contractVersion', 'generatedAtUtc', 'application', 'module',
          'errorCode', 'logs', 'sanitization'
        )
      )
      or pg_catalog.jsonb_typeof(v_diagnostic->'contractVersion') <> 'string'
      or v_diagnostic->>'contractVersion' <> 'testing-center.diagnostic.v1'
      or pg_catalog.jsonb_typeof(v_diagnostic->'generatedAtUtc') <> 'string'
      or pg_catalog.jsonb_typeof(v_diagnostic->'module') <> 'string'
      or v_diagnostic->>'module' <> p_module
      or pg_catalog.jsonb_typeof(v_diagnostic->'errorCode') <> 'string'
      or pg_catalog.jsonb_typeof(v_diagnostic->'application') <> 'object'
      or (select count(*) from pg_catalog.jsonb_object_keys(v_diagnostic->'application')) <> 4
      or exists (
        select 1 from pg_catalog.jsonb_object_keys(v_diagnostic->'application') as key
        where key not in ('version', 'channel', 'os', 'arch')
      )
      or pg_catalog.jsonb_typeof(v_diagnostic->'application'->'version') <> 'string'
      or pg_catalog.jsonb_typeof(v_diagnostic->'application'->'channel') <> 'string'
      or pg_catalog.jsonb_typeof(v_diagnostic->'application'->'os') <> 'string'
      or pg_catalog.jsonb_typeof(v_diagnostic->'application'->'arch') <> 'string'
      or v_diagnostic->'application'->>'version' <> p_app_version
      or v_diagnostic->'application'->>'channel' <> p_channel
      or v_diagnostic->'application'->>'os' <> p_os_family
      or v_diagnostic->'application'->>'arch' not in ('amd64', 'arm64')
      or (v_diagnostic->>'errorCode') !~ '^[a-z0-9][a-z0-9._+-]{0,63}$'
      or pg_catalog.jsonb_typeof(v_diagnostic->'logs') <> 'array'
      or pg_catalog.jsonb_array_length(v_diagnostic->'logs') > 100
      or pg_catalog.jsonb_typeof(v_diagnostic->'sanitization') <> 'object'
      or (select count(*) from pg_catalog.jsonb_object_keys(v_diagnostic->'sanitization')) <> 5
      or exists (
        select 1 from pg_catalog.jsonb_object_keys(v_diagnostic->'sanitization') as key
        where key not in (
          'inputLogs', 'includedLogs', 'omittedLogs', 'redactedValues',
          'truncatedMessages'
        )
      )
      or exists (
        select 1
        from (values
          (v_diagnostic->'sanitization'->'inputLogs'),
          (v_diagnostic->'sanitization'->'includedLogs'),
          (v_diagnostic->'sanitization'->'omittedLogs'),
          (v_diagnostic->'sanitization'->'redactedValues'),
          (v_diagnostic->'sanitization'->'truncatedMessages')
        ) as counters(value)
        where pg_catalog.jsonb_typeof(value) <> 'number'
          or value #>> '{}' !~ '^[0-9]{1,10}$'
      ) then
      raise exception 'testing_center_diagnostic_shape_invalid' using errcode = '22023';
    end if;

    if (v_diagnostic->'sanitization'->>'inputLogs')::bigint > 1000
      or (v_diagnostic->'sanitization'->>'includedLogs')::bigint > 100
      or (v_diagnostic->'sanitization'->>'omittedLogs')::bigint > 1000
      or (v_diagnostic->'sanitization'->>'redactedValues')::bigint > 100000
      or (v_diagnostic->'sanitization'->>'truncatedMessages')::bigint > 100000
      or (v_diagnostic->'sanitization'->>'includedLogs')::bigint
        <> pg_catalog.jsonb_array_length(v_diagnostic->'logs')
      or (v_diagnostic->'sanitization'->>'inputLogs')::bigint
        <> (v_diagnostic->'sanitization'->>'includedLogs')::bigint
          + (v_diagnostic->'sanitization'->>'omittedLogs')::bigint then
      raise exception 'testing_center_diagnostic_counters_invalid' using errcode = '22023';
    end if;

    begin
      v_diagnostic_time := (v_diagnostic->>'generatedAtUtc')::timestamptz;
    exception when others then
      raise exception 'testing_center_diagnostic_time_invalid' using errcode = '22023';
    end;
    if v_diagnostic_time < pg_catalog.now() - interval '7 days'
      or v_diagnostic_time > pg_catalog.now() + interval '5 minutes' then
      raise exception 'testing_center_diagnostic_time_invalid' using errcode = '22023';
    end if;

    if (not p_include_logs and pg_catalog.jsonb_array_length(v_diagnostic->'logs') <> 0)
      or exists (
        select 1
        from pg_catalog.jsonb_array_elements(v_diagnostic->'logs') as item
        where pg_catalog.jsonb_typeof(item) <> 'object'
          or (select count(*) from pg_catalog.jsonb_object_keys(item)) <> 5
          or exists (
            select 1 from pg_catalog.jsonb_object_keys(item) as key
            where key not in ('offsetMillis', 'source', 'level', 'code', 'message')
          )
          or pg_catalog.jsonb_typeof(item->'offsetMillis') <> 'number'
          or pg_catalog.jsonb_typeof(item->'source') <> 'string'
          or pg_catalog.jsonb_typeof(item->'level') <> 'string'
          or pg_catalog.jsonb_typeof(item->'code') <> 'string'
          or pg_catalog.jsonb_typeof(item->'message') <> 'string'
          or item->>'source' not in ('frontend', 'backend', 'wails', 'runtime')
          or item->>'level' not in ('info', 'warn', 'error')
          or (item->>'code') !~ '^[a-z0-9][a-z0-9._+-]{0,63}$'
          or pg_catalog.octet_length(item->>'message') > 512
          or (item->>'offsetMillis') !~ '^[0-9]{1,8}$'
          or (item->>'offsetMillis')::numeric not between 0 and 86400000
      ) then
      raise exception 'testing_center_diagnostic_logs_invalid' using errcode = '22023';
    end if;
  end if;

  v_operation_digest := pg_catalog.encode(
    public.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'actionText', p_action_text,
          'actorId', v_actor_id,
          'actorRole', v_role,
          'actorUserId', v_user_id,
          'appVersion', p_app_version,
          'channel', p_channel,
          'contextText', v_context_text,
          'contractVersion', p_contract_version,
          'diagnosticDigest', p_diagnostic_digest,
          'expectedText', p_expected_text,
          'idempotencyKey', p_idempotency_key,
          'includeDiagnostic', p_include_diagnostic,
          'includeLogs', p_include_logs,
          'module', p_module,
          'observedText', p_observed_text,
          'osFamily', p_os_family,
          'osVersion', p_os_version
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
  v_report_id := 'report_' || v_operation_digest;
  v_event_id := 'report_event_' || v_operation_digest;
  v_evidence_id := 'evidence_' || pg_catalog.encode(
    public.digest(
      pg_catalog.convert_to('diagnostic' || pg_catalog.chr(31) || v_operation_digest, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || pg_catalog.chr(31) || p_idempotency_key, 0)
  );

  select submission.*
  into v_existing
  from public.testing_center_report_submission_keys as submission
  where submission.reporter_user_id = v_user_id
    and submission.idempotency_key = p_idempotency_key;

  if found then
    if v_existing.payload_digest <> v_operation_digest
      or v_existing.report_id <> v_report_id then
      raise exception 'testing_center_idempotency_conflict' using errcode = '23505';
    end if;
    select report.created_at
    into v_created_at
    from public.testing_center_reports as report
    join public.testing_center_report_payloads as payload
      on payload.report_id = report.report_id
    join public.testing_center_report_events as event
      on event.report_id = report.report_id
    where report.report_id = v_existing.report_id
      and report.reporter_user_id = v_user_id
      and report.reporter_id = v_actor_id
      and report.reporter_role = v_role
      and report.channel = p_channel
      and report.state = 'submitted'
      and event.operation_digest = v_operation_digest;
    if not found then
      raise exception 'testing_center_idempotency_result_missing' using errcode = '23505';
    end if;
    return query select v_report_id, 'submitted'::text, true, v_created_at;
    return;
  end if;

  v_created_at := pg_catalog.now();

  insert into public.testing_center_reports (
    contract_version, report_id, reporter_id, reporter_user_id, reporter_role,
    channel, state, created_at, updated_at
  ) values (
    'testing-center.v1', v_report_id, v_actor_id, v_user_id, v_role,
    p_channel, 'submitted', v_created_at, v_created_at
  );

  insert into public.testing_center_report_payloads (
    report_id, action_text, expected_text, observed_text, context_text,
    app_version, os_family, os_version, module,
    include_diagnostic, include_logs, diagnostic_document,
    diagnostic_transport_digest, created_at
  ) values (
    v_report_id, p_action_text, p_expected_text, p_observed_text, v_context_text,
    p_app_version, p_os_family, p_os_version, p_module,
    p_include_diagnostic, p_include_logs, v_diagnostic,
    p_diagnostic_digest, v_created_at
  );

  if p_include_diagnostic then
    insert into public.testing_center_evidence (
      contract_version, evidence_id, report_id, kind, digest, created_at
    ) values (
      'testing-center.v1', v_evidence_id, v_report_id, 'diagnostic',
      p_diagnostic_digest, v_created_at
    );
  end if;

  insert into public.testing_center_report_submission_keys (
    reporter_user_id, idempotency_key, payload_digest, report_id, created_at
  ) values (
    v_user_id, p_idempotency_key, v_operation_digest, v_report_id, v_created_at
  );

  insert into public.testing_center_report_events (
    event_id, report_id, actor_id, actor_user_id, actor_role,
    operation_digest, created_at
  ) values (
    v_event_id, v_report_id, v_actor_id, v_user_id, v_role,
    v_operation_digest, v_created_at
  );

  return query select v_report_id, 'submitted'::text, false, v_created_at;
end
$$;

revoke all on function public.testing_center_submit_report(
  text, text, text, text, text, text, text, text, text, text,
  boolean, boolean, text, text, text
) from public, anon;
grant execute on function public.testing_center_submit_report(
  text, text, text, text, text, text, text, text, text, text,
  boolean, boolean, text, text, text
) to authenticated;

comment on table public.testing_center_report_payloads is
  'TAU-04A private, normalized report content visible only to reporter or owner.';
comment on table public.testing_center_report_submission_keys is
  'TAU-04A private exactly-once keys; never exposed to authenticated clients.';
comment on table public.testing_center_report_events is
  'TAU-04A immutable server-side submission audit.';
comment on function public.testing_center_submit_report(
  text, text, text, text, text, text, text, text, text, text,
  boolean, boolean, text, text, text
) is 'TAU-04A authenticated and idempotent report submission boundary.';
