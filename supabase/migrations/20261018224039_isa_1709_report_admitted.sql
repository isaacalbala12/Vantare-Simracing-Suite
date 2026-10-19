-- #1709 / VANTA-96, phase 1: compatible server boundary. Legacy client ACLs
-- remain unchanged here; deploy Edge + client before the separate close migration.
-- Payload/transport/evidence logic is preserved from 20260802150000,
-- 20260802180000 and 20260814154558; identity is now an explicit trusted UUID.
begin;
set local lock_timeout='5s';

create function private.testing_center_report_payload_for_account(
  p_account uuid,
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
  v_user_id uuid := p_account;
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
  -- UUID deletion barrier before membership/batch/row locks.
  if private.lock_account_write(p_account) then
    raise sqlstate '28000' using message='account_deleted';
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

create function private.testing_center_report_for_account(
  p_account uuid,
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
  v_result record;
  v_transport_size integer;
begin
  select * into strict v_result
  from private.testing_center_report_payload_for_account(
    p_account, p_contract_version, p_channel, p_action_text, p_expected_text,
    p_observed_text, p_context_text, p_app_version, p_os_family,
    p_os_version, p_module, p_include_diagnostic, p_include_logs,
    p_diagnostic_payload, p_diagnostic_digest, p_idempotency_key
  );

  if p_include_diagnostic then
    v_transport_size := pg_catalog.octet_length(p_diagnostic_payload);
    update public.testing_center_report_payloads as payload
    set diagnostic_transport_size = v_transport_size
    where payload.report_id = v_result.report_id
      and payload.diagnostic_transport_size is null;

    if exists (
      select 1
      from public.testing_center_report_payloads as payload
      where payload.report_id = v_result.report_id
        and payload.diagnostic_transport_size is distinct from v_transport_size
    ) then
      raise exception 'testing_center_diagnostic_size_conflict'
        using errcode = '23505';
    end if;
  end if;

  return query select v_result.report_id, v_result.report_state,
    v_result.idempotent, v_result.created_at;
end
$$;

create function private.testing_center_report_evidence_for_account(
  p_account uuid,
  p_contract_version text,p_channel text,p_action_text text,p_expected_text text,
  p_observed_text text,p_context_text text,p_app_version text,p_os_family text,
  p_os_version text,p_module text,p_include_diagnostic boolean,p_include_logs boolean,
  p_diagnostic_payload text,p_diagnostic_digest text,p_idempotency_key text,p_batch_id uuid
)
returns table(report_id text,report_state text,idempotent boolean,created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := p_account;
  v_batch public.testing_center_evidence_batches%rowtype;
  v_internal_key text;
  v_digests text;
  v_result record;
  v_slot_count integer;
begin
  if v_user_id is null then
    raise exception 'testing_center_auth_required' using errcode='42501';
  end if;
  -- UUID deletion barrier before membership/batch/row locks.
  if private.lock_account_write(p_account) then
    raise sqlstate '28000' using message='account_deleted';
  end if;

  select * into v_batch from public.testing_center_evidence_batches as batch
  where batch.batch_id=p_batch_id for update;
  if not found or v_batch.reporter_user_id <> v_user_id then
    raise exception 'testing_center_evidence_owner_required' using errcode='42501';
  end if;
  if v_batch.channel <> p_channel then
    raise exception 'testing_center_evidence_channel_conflict' using errcode='23505';
  end if;
  if v_batch.idempotency_key <> p_idempotency_key then
    raise exception 'testing_center_evidence_idempotency_conflict' using errcode='23505';
  end if;
  select count(*),pg_catalog.string_agg(evidence.sha256,',' order by evidence.position)
  into v_slot_count,v_digests
  from public.testing_center_screenshot_evidence as evidence
  where evidence.batch_id=p_batch_id;
  if v_slot_count not between 1 and 10 or exists(
    select 1 from public.testing_center_screenshot_evidence as evidence
    where evidence.batch_id=p_batch_id and evidence.state <> 'ready'
  ) or v_batch.state not in ('ready','attached') then
    raise exception 'testing_center_evidence_not_ready' using errcode='55000';
  end if;
  v_internal_key := 'evidence:'||pg_catalog.encode(public.digest(pg_catalog.convert_to(
    p_idempotency_key||pg_catalog.chr(31)||v_digests,'UTF8'),'sha256'),'hex');
  select * into strict v_result from private.testing_center_report_for_account(
    p_account,p_contract_version,p_channel,p_action_text,p_expected_text,p_observed_text,
    p_context_text,p_app_version,p_os_family,p_os_version,p_module,
    p_include_diagnostic,p_include_logs,p_diagnostic_payload,p_diagnostic_digest,
    v_internal_key
  );
  if v_batch.state='attached' then
    if exists(
      select 1 from public.testing_center_screenshot_evidence as evidence
      where evidence.batch_id=p_batch_id and evidence.report_id is distinct from v_result.report_id
    ) then
      raise exception 'testing_center_evidence_attachment_conflict' using errcode='23505';
    end if;
    return query select v_result.report_id,v_result.report_state,true,v_result.created_at;
    return;
  end if;
  insert into public.testing_center_evidence(contract_version,evidence_id,report_id,kind,digest)
  select 'testing-center.v1',
    'screenshot_'||pg_catalog.encode(public.digest(pg_catalog.convert_to(
      v_result.report_id||pg_catalog.chr(31)||evidence.sha256,'UTF8'),'sha256'),'hex'),
    v_result.report_id,'screenshot',evidence.sha256
  from public.testing_center_screenshot_evidence as evidence
  where evidence.batch_id=p_batch_id
  group by evidence.sha256
  on conflict on constraint testing_center_evidence_report_id_kind_digest_key
  do nothing;
  update public.testing_center_screenshot_evidence
  set report_id=v_result.report_id,updated_at=pg_catalog.now()
  where batch_id=p_batch_id;
  update public.testing_center_evidence_batches
  set state='attached',updated_at=pg_catalog.now()
  where batch_id=p_batch_id;
  return query select v_result.report_id,v_result.report_state,v_result.idempotent,v_result.created_at;
end
$$;

revoke all on function private.testing_center_report_payload_for_account(uuid,text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text) from public,anon,authenticated,service_role,vantare_triage;
revoke all on function private.testing_center_report_for_account(uuid,text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text) from public,anon,authenticated,service_role,vantare_triage;
revoke all on function private.testing_center_report_evidence_for_account(uuid,text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text,uuid) from public,anon,authenticated,service_role,vantare_triage;

-- One typed server-only boundary after Edge admission; no synthetic JWT claims.
create function public.testing_center_report_submit_admitted(
  p_account uuid,
  p_contract_version text,p_channel text,p_action_text text,p_expected_text text,
  p_observed_text text,p_context_text text,p_app_version text,p_os_family text,
  p_os_version text,p_module text,p_include_diagnostic boolean,p_include_logs boolean,
  p_diagnostic_payload text,p_diagnostic_digest text,p_idempotency_key text,
  p_batch_id uuid default null
) returns table(report_id text,report_state text,idempotent boolean,created_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
  -- F7=C: tester prose/diagnostics stay local, including service callers.
  if p_action_text is distinct from 'Informe estructurado'
    or p_expected_text is distinct from 'Revisión humana pendiente'
    or p_observed_text is distinct from 'Revisión humana pendiente'
    or p_context_text is distinct from ''
    or p_include_diagnostic is distinct from false
    or p_include_logs is distinct from false
    or p_diagnostic_payload is not null or p_diagnostic_digest is not null then
    raise sqlstate '22023' using message='testing_report_privacy_required';
  end if;
  if p_batch_id is null then
    return query select * from private.testing_center_report_for_account(p_account,p_contract_version,p_channel,p_action_text,p_expected_text,p_observed_text,p_context_text,p_app_version,p_os_family,p_os_version,p_module,p_include_diagnostic,p_include_logs,p_diagnostic_payload,p_diagnostic_digest,p_idempotency_key);
  else
    return query select * from private.testing_center_report_evidence_for_account(p_account,p_contract_version,p_channel,p_action_text,p_expected_text,p_observed_text,p_context_text,p_app_version,p_os_family,p_os_version,p_module,p_include_diagnostic,p_include_logs,p_diagnostic_payload,p_diagnostic_digest,p_idempotency_key,p_batch_id);
  end if;
end $$;
revoke all on function public.testing_center_report_submit_admitted(uuid,text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text,uuid)
  from public,anon,authenticated;
grant execute on function public.testing_center_report_submit_admitted(uuid,text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text,uuid) to service_role;

commit;
