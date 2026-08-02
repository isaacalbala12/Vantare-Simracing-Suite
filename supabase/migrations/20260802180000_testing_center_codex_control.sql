-- ISA-231 / TAU-06F: service-role Codex evidence loader and durable dry-run
-- control. This migration performs no network, repository or Codex call.

alter table public.testing_center_report_payloads
  add column diagnostic_transport_size integer
    constraint testing_center_report_payload_transport_size_check check (
      diagnostic_transport_size is null
      or diagnostic_transport_size between 1 and 65536
    );

alter function public.testing_center_submit_report(
  text, text, text, text, text, text, text, text, text, text,
  boolean, boolean, text, text, text
) rename to testing_center_submit_report_without_transport_size;

revoke all on function public.testing_center_submit_report_without_transport_size(
  text, text, text, text, text, text, text, text, text, text,
  boolean, boolean, text, text, text
) from public, anon, authenticated;

create function public.testing_center_submit_report(
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
  from public.testing_center_submit_report_without_transport_size(
    p_contract_version, p_channel, p_action_text, p_expected_text,
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

revoke all on function public.testing_center_submit_report(
  text, text, text, text, text, text, text, text, text, text,
  boolean, boolean, text, text, text
) from public, anon;
grant execute on function public.testing_center_submit_report(
  text, text, text, text, text, text, text, text, text, text,
  boolean, boolean, text, text, text
) to authenticated;

alter table public.testing_center_codex_runs
  drop constraint testing_center_codex_runs_state_check,
  add constraint testing_center_codex_runs_state_check check (
    state in ('queued', 'running', 'pr_open', 'failed', 'completed', 'needs_owner')
  );

create table public.testing_center_codex_execution_control (
  technical_issue_id text primary key
    references public.testing_center_technical_issues(technical_issue_id) on delete restrict,
  run_id text not null unique
    references public.testing_center_codex_runs(run_id) on delete restrict,
  request_digest text not null
    constraint testing_center_codex_control_request_check check (request_digest ~ '^[0-9a-f]{64}$'),
  evidence_digest text not null
    constraint testing_center_codex_control_evidence_check check (evidence_digest ~ '^[0-9a-f]{64}$'),
  analysis_base_sha text not null
    constraint testing_center_codex_control_base_check check (analysis_base_sha ~ '^[0-9a-f]{40}$'),
  nightly_head_sha text not null
    constraint testing_center_codex_control_head_check check (nightly_head_sha ~ '^[0-9a-f]{40}$'),
  ancestry_proof_digest text not null
    constraint testing_center_codex_control_proof_check check (ancestry_proof_digest ~ '^[0-9a-f]{64}$'),
  state text not null default 'queued'
    constraint testing_center_codex_control_state_check check (
      state in ('queued', 'claimed', 'dispatching', 'completed', 'failed', 'needs_owner')
    ),
  dispatch_count smallint not null default 0
    constraint testing_center_codex_control_dispatch_count_check check (dispatch_count between 0 and 1),
  lease_owner text,
  lease_expires_at timestamptz,
  fencing_token bigint not null default 0
    constraint testing_center_codex_control_fencing_check check (fencing_token >= 0),
  outcome_code text
    constraint testing_center_codex_control_outcome_check check (
      outcome_code is null or outcome_code in (
        'proposed', 'needs_owner', 'not_reproduced',
        'ambiguous_response', 'pre_dispatch_failure'
      )
    ),
  response_digest text
    constraint testing_center_codex_control_response_check check (
      response_digest is null or response_digest ~ '^[0-9a-f]{64}$'
    ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint testing_center_codex_control_lease_check check (
    (
      state in ('claimed', 'dispatching')
      and lease_owner is not null
      and lease_owner ~ '^[a-z0-9][a-z0-9._-]{0,63}$'
      and lease_expires_at is not null
    )
    or (
      state not in ('claimed', 'dispatching')
      and lease_owner is null
      and lease_expires_at is null
    )
  ),
  constraint testing_center_codex_control_terminal_check check (
    (state in ('queued', 'claimed') and dispatch_count = 0 and outcome_code is null and response_digest is null)
    or (state = 'dispatching' and dispatch_count = 1 and outcome_code is null and response_digest is null)
    or (state = 'completed' and dispatch_count = 1 and outcome_code in ('proposed', 'needs_owner', 'not_reproduced') and response_digest is not null)
    or (state = 'needs_owner' and dispatch_count = 1 and outcome_code = 'ambiguous_response' and response_digest is null)
    or (state = 'failed' and dispatch_count = 0 and outcome_code = 'pre_dispatch_failure' and response_digest is null)
  )
);

create index testing_center_codex_control_claim_idx
  on public.testing_center_codex_execution_control(state, lease_expires_at, created_at);

alter table public.testing_center_codex_execution_control enable row level security;
alter table public.testing_center_codex_execution_control force row level security;
revoke all on table public.testing_center_codex_execution_control from public, anon, authenticated;
grant select, insert, update, delete on table public.testing_center_codex_execution_control to service_role;

create function public.testing_center_load_codex_evidence(p_technical_issue_id text)
returns table (
  contract_version text,
  technical_issue_id text,
  report_id text,
  source_diagnostic_digest text,
  evidence_text text,
  evidence_digest text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_issue public.testing_center_technical_issues%rowtype;
  v_report public.testing_center_reports%rowtype;
  v_payload public.testing_center_report_payloads%rowtype;
  v_diagnostic_evidence public.testing_center_evidence%rowtype;
  v_projection jsonb;
  v_logs jsonb;
begin
  if p_technical_issue_id is null
    or p_technical_issue_id !~ '^issue_[0-9a-f]{64}$' then
    raise exception 'testing_center_codex_evidence_issue_invalid' using errcode = '22023';
  end if;

  select issue.* into v_issue
  from public.testing_center_technical_issues as issue
  where issue.technical_issue_id = p_technical_issue_id
  for update;
  if not found or v_issue.state <> 'open' or v_issue.flow_state <> 'queued' then
    raise exception 'testing_center_codex_evidence_not_ready' using errcode = '55000';
  end if;

  select report.* into strict v_report
  from public.testing_center_reports as report
  where report.report_id = v_issue.report_id;
  select payload.* into strict v_payload
  from public.testing_center_report_payloads as payload
  where payload.report_id = v_issue.report_id;
  select evidence.* into strict v_diagnostic_evidence
  from public.testing_center_evidence as evidence
  where evidence.report_id = v_issue.report_id and evidence.kind = 'diagnostic';

  if not v_payload.include_diagnostic
    or v_payload.diagnostic_document is null
    or v_payload.diagnostic_transport_digest is null
    or v_payload.diagnostic_transport_size is null
    or v_payload.diagnostic_transport_digest <> v_diagnostic_evidence.digest
    or v_payload.diagnostic_transport_size not between 1 and 65536
    or v_report.channel not in ('nightly', 'testers')
    or v_payload.os_family <> 'windows'
    or pg_catalog.jsonb_typeof(v_payload.diagnostic_document) <> 'object'
    or (select count(*) from pg_catalog.jsonb_object_keys(v_payload.diagnostic_document)) <> 7
    or exists (
      select 1 from pg_catalog.jsonb_object_keys(v_payload.diagnostic_document) as key
      where key not in ('contractVersion', 'generatedAtUtc', 'application', 'module', 'errorCode', 'logs', 'sanitization')
    )
    or v_payload.diagnostic_document->>'contractVersion' <> 'testing-center.diagnostic.v1'
    or v_payload.diagnostic_document->>'module' <> v_payload.module
    or pg_catalog.jsonb_typeof(v_payload.diagnostic_document->'application') <> 'object'
    or (select count(*) from pg_catalog.jsonb_object_keys(v_payload.diagnostic_document->'application')) <> 4
    or exists (
      select 1 from pg_catalog.jsonb_object_keys(v_payload.diagnostic_document->'application') as key
      where key not in ('version', 'channel', 'os', 'arch')
    )
    or v_payload.diagnostic_document->'application'->>'channel' <> v_report.channel
    or v_payload.diagnostic_document->'application'->>'os' <> v_payload.os_family
    or v_payload.diagnostic_document->'application'->>'arch' not in ('amd64', 'arm64')
    or v_payload.module not in (
      'hub', 'launcher', 'settings', 'overlay_studio', 'overlay_runtime',
      'telemetry', 'telemetry_analysis', 'engineer', 'strategy', 'calendar',
      'billing', 'account', 'updater', 'testing_center', 'unknown'
    )
    or pg_catalog.jsonb_typeof(v_payload.diagnostic_document->'errorCode') <> 'string'
    or (v_payload.diagnostic_document->>'errorCode') !~ '^[a-z0-9][a-z0-9._+-]{0,63}$'
    or pg_catalog.jsonb_typeof(v_payload.diagnostic_document->'logs') <> 'array'
    or pg_catalog.jsonb_array_length(v_payload.diagnostic_document->'logs') > 100
    or (not v_payload.include_logs and pg_catalog.jsonb_array_length(v_payload.diagnostic_document->'logs') <> 0)
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(v_payload.diagnostic_document->'logs') as item
      where pg_catalog.jsonb_typeof(item) <> 'object'
        or (select count(*) from pg_catalog.jsonb_object_keys(item)) <> 5
        or exists (
          select 1 from pg_catalog.jsonb_object_keys(item) as key
          where key not in ('offsetMillis', 'source', 'level', 'code', 'message')
        )
        or pg_catalog.jsonb_typeof(item->'offsetMillis') <> 'number'
        or (item->>'offsetMillis') !~ '^[0-9]{1,8}$'
        or (item->>'offsetMillis')::numeric not between 0 and 86400000
        or item->>'source' not in ('frontend', 'backend', 'wails', 'runtime')
        or item->>'level' not in ('info', 'warn', 'error')
        or pg_catalog.jsonb_typeof(item->'code') <> 'string'
        or (item->>'code') !~ '^[a-z0-9][a-z0-9._+-]{0,63}$'
        or pg_catalog.jsonb_typeof(item->'message') <> 'string'
        or pg_catalog.octet_length(item->>'message') > 512
    ) then
    raise exception 'testing_center_codex_evidence_invalid' using errcode = '22023';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'offsetMillis', (item->>'offsetMillis')::bigint,
        'source', item->>'source',
        'level', item->>'level'
      ) order by ordinal
    ),
    '[]'::jsonb
  ) into v_logs
  from pg_catalog.jsonb_array_elements(v_payload.diagnostic_document->'logs')
    with ordinality as log(item, ordinal)
  where v_payload.include_logs;

  v_projection := pg_catalog.jsonb_build_object(
    'contractVersion', 'testing-center.codex-evidence.v1',
    'application', pg_catalog.jsonb_build_object(
      'channel', v_report.channel,
      'os', v_payload.os_family,
      'arch', v_payload.diagnostic_document->'application'->>'arch'
    ),
    'module', v_payload.module,
    'errorCodePresent', v_payload.diagnostic_document->>'errorCode' <> 'unknown',
    'logs', v_logs,
    'source', pg_catalog.jsonb_build_object(
      'diagnosticDigest', v_payload.diagnostic_transport_digest,
      'diagnosticByteSize', v_payload.diagnostic_transport_size,
      'logsIncludedByConsent', v_payload.include_logs
    )
  );

  contract_version := 'testing-center.codex-evidence.v1';
  technical_issue_id := v_issue.technical_issue_id;
  report_id := v_issue.report_id;
  source_diagnostic_digest := v_payload.diagnostic_transport_digest;
  evidence_text := v_projection::text;
  evidence_digest := pg_catalog.encode(
    public.digest(pg_catalog.convert_to(evidence_text, 'UTF8'), 'sha256'), 'hex'
  );
  return next;
end
$$;

create function public.testing_center_queue_codex_dry_run(
  p_technical_issue_id text,
  p_request_digest text,
  p_evidence_digest text,
  p_analysis_base_sha text,
  p_nightly_head_sha text,
  p_ancestry_proof_digest text
)
returns table (queue_status text, run_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.testing_center_codex_execution_control%rowtype;
  v_loaded record;
  v_run_id text;
begin
  if p_technical_issue_id !~ '^issue_[0-9a-f]{64}$'
    or p_request_digest !~ '^[0-9a-f]{64}$'
    or p_evidence_digest !~ '^[0-9a-f]{64}$'
    or p_analysis_base_sha !~ '^[0-9a-f]{40}$'
    or p_nightly_head_sha !~ '^[0-9a-f]{40}$'
    or p_ancestry_proof_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'testing_center_codex_queue_invalid' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('testing-center-codex-issue:' || p_technical_issue_id, 0)
  );
  select * into v_loaded from public.testing_center_load_codex_evidence(p_technical_issue_id);
  if v_loaded.evidence_digest <> p_evidence_digest then
    raise exception 'testing_center_codex_evidence_digest_mismatch' using errcode = '22023';
  end if;

  select control.* into v_existing
  from public.testing_center_codex_execution_control as control
  where control.technical_issue_id = p_technical_issue_id;
  if found then
    if v_existing.request_digest <> p_request_digest
      or v_existing.evidence_digest <> p_evidence_digest
      or v_existing.analysis_base_sha <> p_analysis_base_sha
      or v_existing.nightly_head_sha <> p_nightly_head_sha
      or v_existing.ancestry_proof_digest <> p_ancestry_proof_digest then
      raise exception 'testing_center_codex_queue_conflict' using errcode = '23505';
    end if;
    return query select 'existing'::text, v_existing.run_id;
    return;
  end if;

  v_run_id := 'codex_run_' || pg_catalog.encode(
    public.digest(
      pg_catalog.convert_to(p_technical_issue_id || ':' || p_request_digest, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  insert into public.testing_center_codex_runs(
    run_id, technical_issue_id, attempt, state, origin
  ) values (v_run_id, p_technical_issue_id, 1, 'queued', 'orchestrator');
  insert into public.testing_center_codex_execution_control(
    technical_issue_id, run_id, request_digest, evidence_digest,
    analysis_base_sha, nightly_head_sha, ancestry_proof_digest
  ) values (
    p_technical_issue_id, v_run_id, p_request_digest, p_evidence_digest,
    p_analysis_base_sha, p_nightly_head_sha, p_ancestry_proof_digest
  );
  return query select 'queued'::text, v_run_id;
end
$$;

create function public.testing_center_claim_codex_dry_run(
  p_technical_issue_id text,
  p_worker_id text,
  p_lease_seconds integer default 60
)
returns table (claim_status text, run_id text, fencing_token bigint, lease_expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.testing_center_codex_execution_control%rowtype;
begin
  if p_worker_id is null or p_worker_id !~ '^[a-z0-9][a-z0-9._-]{0,63}$'
    or p_lease_seconds not between 10 and 300 then
    raise exception 'testing_center_codex_claim_invalid' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('testing-center.codex.global', 0)
  );
  lock table public.testing_center_pauses in share mode;
  select control.* into v_row
  from public.testing_center_codex_execution_control as control
  where control.technical_issue_id = p_technical_issue_id
  for update;
  if not found then
    raise exception 'testing_center_codex_run_not_found' using errcode = 'P0002';
  end if;

  if v_row.state in ('completed', 'failed', 'needs_owner') then
    claim_status := v_row.state;
  elsif v_row.state = 'dispatching' then
    claim_status := 'busy';
  elsif not exists (
    select 1 from public.testing_center_technical_issues as issue
    where issue.technical_issue_id = p_technical_issue_id
      and issue.state = 'open' and issue.flow_state = 'queued'
  ) then
    claim_status := 'not_ready';
  elsif exists (
    select 1 from public.testing_center_pauses as pause
    where pause.is_paused and (
      pause.scope = 'global'
      or (pause.scope = 'flow' and pause.technical_issue_id = p_technical_issue_id)
    )
  ) then
    claim_status := 'paused';
  elsif v_row.state = 'claimed' and v_row.lease_expires_at > pg_catalog.now() then
    claim_status := 'busy';
  elsif exists (
    select 1
    from public.testing_center_codex_execution_control as active
    where active.technical_issue_id <> p_technical_issue_id
      and (
        active.state = 'dispatching'
        or (active.state = 'claimed' and active.lease_expires_at > pg_catalog.now())
      )
  ) then
    claim_status := 'global_busy';
  else
    update public.testing_center_codex_execution_control as control
    set state = 'claimed', lease_owner = p_worker_id,
      lease_expires_at = pg_catalog.now() + pg_catalog.make_interval(secs => p_lease_seconds),
      fencing_token = control.fencing_token + 1, updated_at = pg_catalog.now()
    where control.technical_issue_id = p_technical_issue_id
    returning control.* into v_row;
    update public.testing_center_codex_runs
    set state = 'running', updated_at = pg_catalog.now()
    where testing_center_codex_runs.run_id = v_row.run_id;
    claim_status := 'claimed';
  end if;
  run_id := v_row.run_id;
  fencing_token := v_row.fencing_token;
  lease_expires_at := v_row.lease_expires_at;
  return next;
end
$$;

create function public.testing_center_authorize_codex_dispatch(
  p_technical_issue_id text,
  p_worker_id text,
  p_fencing_token bigint
)
returns table (
  run_id text,
  request_digest text,
  analysis_base_sha text,
  nightly_head_sha text,
  ancestry_proof_digest text,
  fencing_token bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.testing_center_codex_execution_control%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('testing-center.codex.global', 0)
  );
  lock table public.testing_center_pauses in share mode;
  select control.* into v_row
  from public.testing_center_codex_execution_control as control
  where control.technical_issue_id = p_technical_issue_id
  for update;
  if not found or v_row.state <> 'claimed'
    or v_row.lease_owner <> p_worker_id
    or v_row.fencing_token <> p_fencing_token
    or v_row.lease_expires_at <= pg_catalog.now() then
    raise exception 'testing_center_codex_lease_lost' using errcode = '55000';
  end if;
  if not exists (
    select 1 from public.testing_center_technical_issues as issue
    where issue.technical_issue_id = p_technical_issue_id
      and issue.state = 'open' and issue.flow_state = 'queued'
  ) then
    raise exception 'testing_center_codex_issue_not_ready' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.testing_center_pauses as pause
    where pause.is_paused and (
      pause.scope = 'global'
      or (pause.scope = 'flow' and pause.technical_issue_id = p_technical_issue_id)
    )
  ) then
    raise exception 'testing_center_paused' using errcode = '55000';
  end if;

  update public.testing_center_codex_execution_control as control
  set state = 'dispatching', dispatch_count = 1, updated_at = pg_catalog.now()
  where control.technical_issue_id = p_technical_issue_id
  returning control.* into v_row;
  run_id := v_row.run_id;
  request_digest := v_row.request_digest;
  analysis_base_sha := v_row.analysis_base_sha;
  nightly_head_sha := v_row.nightly_head_sha;
  ancestry_proof_digest := v_row.ancestry_proof_digest;
  fencing_token := v_row.fencing_token;
  return next;
end
$$;

create function public.testing_center_record_codex_outcome(
  p_technical_issue_id text,
  p_worker_id text,
  p_fencing_token bigint,
  p_outcome_code text,
  p_response_digest text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run_id text;
  v_state text;
begin
  if p_outcome_code not in ('proposed', 'needs_owner', 'not_reproduced', 'ambiguous_response')
    or (
      p_outcome_code = 'ambiguous_response'
      and p_response_digest is not null
    )
    or (
      p_outcome_code <> 'ambiguous_response'
      and (p_response_digest is null or p_response_digest !~ '^[0-9a-f]{64}$')
    ) then
    raise exception 'testing_center_codex_outcome_invalid' using errcode = '22023';
  end if;
  v_state := case when p_outcome_code = 'ambiguous_response' then 'needs_owner' else 'completed' end;
  update public.testing_center_codex_execution_control as control
  set state = v_state, lease_owner = null, lease_expires_at = null,
    outcome_code = p_outcome_code, response_digest = p_response_digest,
    updated_at = pg_catalog.now()
  where control.technical_issue_id = p_technical_issue_id
    and control.state = 'dispatching'
    and control.lease_owner = p_worker_id
    and control.fencing_token = p_fencing_token
  returning control.run_id into v_run_id;
  if not found then
    raise exception 'testing_center_codex_fence_lost' using errcode = '55000';
  end if;
  update public.testing_center_codex_runs
  set state = v_state, updated_at = pg_catalog.now()
  where testing_center_codex_runs.run_id = v_run_id;
end
$$;

create function public.testing_center_fail_codex_before_dispatch(
  p_technical_issue_id text,
  p_worker_id text,
  p_fencing_token bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_run_id text;
begin
  update public.testing_center_codex_execution_control as control
  set state = 'failed', lease_owner = null, lease_expires_at = null,
    outcome_code = 'pre_dispatch_failure', updated_at = pg_catalog.now()
  where control.technical_issue_id = p_technical_issue_id
    and control.state = 'claimed'
    and control.lease_owner = p_worker_id
    and control.fencing_token = p_fencing_token
  returning control.run_id into v_run_id;
  if not found then
    raise exception 'testing_center_codex_fence_lost' using errcode = '55000';
  end if;
  update public.testing_center_codex_runs
  set state = 'failed', updated_at = pg_catalog.now()
  where testing_center_codex_runs.run_id = v_run_id;
end
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'testing_center_load_codex_evidence(text)',
    'testing_center_queue_codex_dry_run(text,text,text,text,text,text)',
    'testing_center_claim_codex_dry_run(text,text,integer)',
    'testing_center_authorize_codex_dispatch(text,text,bigint)',
    'testing_center_record_codex_outcome(text,text,bigint,text,text)',
    'testing_center_fail_codex_before_dispatch(text,text,bigint)'
  ] loop
    execute 'revoke all on function public.' || fn || ' from public, anon, authenticated';
    execute 'grant execute on function public.' || fn || ' to service_role';
  end loop;
end
$$;

comment on table public.testing_center_codex_execution_control is
  'TAU-06F one automatic Codex dry-run dispatch per issue with durable fencing.';
comment on function public.testing_center_load_codex_evidence(text) is
  'TAU-06F service-only canonical evidence projection; never returns report free text or log messages.';
