-- VANTA-131 / #1936: operational owner is the sole disposition authority.
begin;

create or replace function public.testing_center_record_owner_disposition(
  p_rejection_validation_id text,
  p_dossier_digest text,
  p_disposition text,
  p_reason text,
  p_correction_issue_id text,
  p_target_branch text,
  p_nightly_sha text,
  p_owner_user_id uuid
)
returns table(result_disposition_id text,result_issue_state text,result_idempotent boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_actor_id text;
  v_validation public.testing_center_validation_snapshots%rowtype;
  v_issue public.testing_center_technical_issues%rowtype;
  v_dossier public.testing_center_codex_dossier_snapshots%rowtype;
  v_existing public.testing_center_owner_dispositions%rowtype;
  v_digest text;
  v_disposition_id text;
  v_target_state text;
begin
  if p_owner_user_id is null or p_disposition not in (
      'create_correction_subissue','environment_issue','create_separate_issue',
      'dismiss_with_reason','stop_rollout'
    ) or p_reason is null or p_reason <> btrim(p_reason)
    or pg_catalog.octet_length(p_reason) not between 3 and 2048 then
    raise exception 'testing_center_owner_disposition_invalid' using errcode='22023';
  end if;
  if not private.is_owner(p_owner_user_id) then
    raise exception 'testing_center_owner_required' using errcode='42501';
  end if;
  -- Keep the historical actor identifier for exact replay; an operational
  -- owner without Testing Center membership uses the canonical account UUID.
  select m.actor_id into v_actor_id from public.testing_center_memberships m
  where m.user_id=p_owner_user_id;
  v_actor_id := coalesce(v_actor_id,p_owner_user_id::text);
  select * into v_validation from public.testing_center_validation_snapshots
  where validation_id=p_rejection_validation_id and decision='rejected'
  for update;
  if not found then
    raise exception 'testing_center_owner_rejection_invalid' using errcode='55000';
  end if;
  select * into strict v_issue from public.testing_center_technical_issues
  where technical_issue_id=v_validation.technical_issue_id for update;
  v_digest := pg_catalog.encode(public.digest(pg_catalog.convert_to(
    p_rejection_validation_id || pg_catalog.chr(31)
    || coalesce(p_dossier_digest,'') || pg_catalog.chr(31)
    || p_disposition || pg_catalog.chr(31) || p_reason || pg_catalog.chr(31)
    || coalesce(p_correction_issue_id,'') || pg_catalog.chr(31)
    || coalesce(p_target_branch,'') || pg_catalog.chr(31)
    || coalesce(p_nightly_sha,'') || pg_catalog.chr(31)
    || v_actor_id || pg_catalog.chr(31) || p_owner_user_id::text,
    'UTF8'),'sha256'),'hex');
  v_disposition_id := 'disposition_' || v_digest;
  select * into v_existing from public.testing_center_owner_dispositions
  where rejection_validation_id=p_rejection_validation_id;
  if found then
    if v_existing.disposition_digest <> v_digest then
      raise exception 'testing_center_owner_disposition_conflict' using errcode='23505';
    end if;
    return query select v_existing.disposition_id,v_issue.flow_state,true;
    return;
  end if;
  if v_issue.flow_state <> 'needs_owner' then
    raise exception 'testing_center_owner_issue_not_blocked' using errcode='55000';
  end if;
  if p_disposition='create_correction_subissue' then
    if p_dossier_digest is null or p_correction_issue_id is null
      or p_target_branch is null or p_nightly_sha is null then
      raise exception 'testing_center_owner_complete_dossier_required'
        using errcode='55000';
    end if;
    select * into v_dossier from public.testing_center_codex_dossier_snapshots
    where dossier_digest=p_dossier_digest
      and rejection_validation_id=p_rejection_validation_id
      and status='complete';
    if not found or v_dossier.correction_issue_id <> p_correction_issue_id
      or v_dossier.target_branch <> p_target_branch
      or v_dossier.nightly_sha <> p_nightly_sha then
      raise exception 'testing_center_owner_complete_dossier_required'
        using errcode='55000';
    end if;
    v_target_state := 'needs_owner';
  else
    if p_dossier_digest is not null or p_correction_issue_id is not null
      or p_target_branch is not null or p_nightly_sha is not null then
      raise exception 'testing_center_owner_disposition_fields_invalid'
        using errcode='22023';
    end if;
    v_target_state := 'stopped';
  end if;
  insert into public.testing_center_owner_dispositions(
    disposition_id,rejection_validation_id,technical_issue_id,actor_id,
    actor_user_id,disposition,reason,dossier_digest,correction_issue_id,
    target_branch,nightly_sha,disposition_digest
  ) values (
    v_disposition_id,p_rejection_validation_id,v_validation.technical_issue_id,
    v_actor_id,p_owner_user_id,p_disposition,p_reason,p_dossier_digest,
    p_correction_issue_id,p_target_branch,p_nightly_sha,v_digest
  );
  if v_target_state='stopped' then
    update public.testing_center_technical_issues
    set flow_state='stopped',updated_at=now()
    where technical_issue_id=v_validation.technical_issue_id;
    insert into public.testing_center_audit(
      contract_version,audit_id,aggregate_id,from_state,to_state,origin,
      actor_id,actor_user_id,actor_role,exact_sha,operation_digest
    ) values (
      'testing-center.v1','audit_' || v_digest,v_validation.technical_issue_id,
      'needs_owner','stopped','testing_center',v_actor_id,p_owner_user_id,
      'owner',v_validation.candidate_sha,v_digest
    );
  end if;
  return query select v_disposition_id,v_target_state,false;
end $$;

revoke all on function public.testing_center_record_owner_disposition(text,text,text,text,text,text,text,uuid) from public, anon, authenticated, service_role;
grant execute on function public.testing_center_record_owner_disposition(text,text,text,text,text,text,text,uuid) to service_role;

create or replace function public.testing_center_validate_candidate(
  p_contract_version text,
  p_candidate_id text,
  p_exact_sha text,
  p_decision text,
  p_rejection_reason text,
  p_idempotency_key text
)
returns table (
  validation_id text,
  candidate_id text,
  exact_sha text,
  decision text,
  resulting_state text,
  idempotent boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.current_account();
  v_actor_id text;
  v_role text;
  v_issue_id text;
  v_channel text;
  v_candidate_sha text;
  v_candidate_author text;
  v_candidate_state text;
  v_issue_state text;
  v_from_state text;
  v_to_state text;
  v_candidate_result text;
  v_validation_id text;
  v_audit_id text;
  v_operation_digest text;
  v_existing_idempotency public.testing_center_idempotency%rowtype;
  v_existing_validation public.testing_center_validations%rowtype;
begin
  if v_user_id is null then
    raise exception 'testing_center_auth_required' using errcode = '42501';
  end if;

  select membership.actor_id, membership.role
  into v_actor_id, v_role
  from public.testing_center_memberships as membership
  where membership.user_id = v_user_id
    and membership.active;

  if private.is_owner(v_user_id) then
    v_actor_id := coalesce(v_actor_id, v_user_id::text);
    v_role := 'owner';
  elsif coalesce(v_role, '') not in ('tester', 'primary_tester') then
    raise exception 'testing_center_membership_required' using errcode = '42501';
  end if;

  if p_contract_version is distinct from 'testing-center.v1' then
    raise exception 'testing_center_contract_version_invalid' using errcode = '22023';
  end if;
  if p_candidate_id is null
    or p_candidate_id = ''
    or p_candidate_id ~ '^[[:space:]]|[[:space:]]$'
    or octet_length(p_candidate_id) > 256 then
    raise exception 'testing_center_candidate_id_invalid' using errcode = '22023';
  end if;
  if p_exact_sha is null
    or p_exact_sha !~ '^(?:[0-9a-f]{40}|[0-9a-f]{64})$' then
    raise exception 'testing_center_sha_invalid' using errcode = '22023';
  end if;
  if p_idempotency_key is null
    or p_idempotency_key = ''
    or p_idempotency_key ~ '^[[:space:]]|[[:space:]]$'
    or octet_length(p_idempotency_key) > 256 then
    raise exception 'testing_center_idempotency_key_invalid' using errcode = '22023';
  end if;
  if p_decision not in ('accepted', 'rejected') then
    raise exception 'testing_center_decision_invalid' using errcode = '22023';
  end if;
  if (p_decision = 'accepted' and p_rejection_reason is not null)
    or (
      p_decision = 'rejected'
      and (
        p_rejection_reason is null
        or p_rejection_reason not in (
          'still_fails', 'regression', 'incomplete_fix', 'new_failure', 'other'
        )
      )
    ) then
    raise exception 'testing_center_rejection_reason_invalid' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_candidate_id, 0)
  );

  select candidate.technical_issue_id,
    candidate.channel,
    candidate.exact_sha,
    candidate.author_id,
    candidate.state,
    issue.flow_state
  into v_issue_id,
    v_channel,
    v_candidate_sha,
    v_candidate_author,
    v_candidate_state,
    v_issue_state
  from public.testing_center_candidate_builds as candidate
  join public.testing_center_technical_issues as issue
    on issue.technical_issue_id = candidate.technical_issue_id
  where candidate.candidate_id = p_candidate_id
  for update of candidate, issue;

  if not found then
    raise exception 'testing_center_candidate_not_found' using errcode = 'P0002';
  end if;
  if v_candidate_sha <> p_exact_sha then
    raise exception 'testing_center_stale_sha' using errcode = '55000';
  end if;
  if v_actor_id = v_candidate_author then
    raise exception 'testing_center_self_validation_forbidden' using errcode = '42501';
  end if;

  if v_channel = 'nightly' then
    if v_role not in ('primary_tester', 'owner') then
      raise exception 'testing_center_nightly_role_required' using errcode = '42501';
    end if;
    v_from_state := 'nightly_candidate';
    v_to_state := case p_decision
      when 'accepted' then 'nightly_accepted'
      else 'nightly_rejected'
    end;
  elsif v_channel = 'testers' then
    if v_role not in ('tester', 'primary_tester', 'owner') then
      raise exception 'testing_center_testers_role_required' using errcode = '42501';
    end if;
    v_from_state := 'testers_candidate';
    v_to_state := case p_decision
      when 'accepted' then 'testers_accepted'
      else 'testers_rejected'
    end;
  else
    raise exception 'testing_center_candidate_channel_invalid' using errcode = '22023';
  end if;

  v_candidate_result := case p_decision
    when 'accepted' then 'accepted'
    else 'rejected'
  end;
  v_operation_digest := pg_catalog.encode(
    public.digest(
      pg_catalog.convert_to(
        p_contract_version || pg_catalog.chr(31)
        || p_candidate_id || pg_catalog.chr(31)
        || p_exact_sha || pg_catalog.chr(31)
        || p_decision || pg_catalog.chr(31)
        || coalesce(p_rejection_reason, '') || pg_catalog.chr(31)
        || v_actor_id || pg_catalog.chr(31)
        || v_user_id::text || pg_catalog.chr(31)
        || v_role,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
  v_validation_id := 'validation_' || v_operation_digest;
  v_audit_id := 'audit_' || v_operation_digest;

  select idempotency.*
  into v_existing_idempotency
  from public.testing_center_idempotency as idempotency
  where idempotency.aggregate_id = v_issue_id
    and idempotency.idempotency_key = p_idempotency_key;

  if found then
    if v_existing_idempotency.payload_digest <> v_operation_digest
      or v_existing_idempotency.from_state <> v_from_state
      or v_existing_idempotency.to_state <> v_to_state
      or v_existing_idempotency.exact_sha is distinct from p_exact_sha
      or v_existing_idempotency.origin <> 'testing_center' then
      raise exception 'testing_center_idempotency_conflict' using errcode = '23505';
    end if;

    select validation.*
    into v_existing_validation
    from public.testing_center_validations as validation
    where validation.validation_id = v_validation_id
      and validation.candidate_id = p_candidate_id
      and validation.channel = v_channel
      and validation.exact_sha = p_exact_sha
      and validation.decision = p_decision
      and validation.actor_id = v_actor_id
      and validation.actor_user_id = v_user_id
      and validation.actor_role = v_role
      and validation.rejection_reason is not distinct from p_rejection_reason;

    if not found then
      raise exception 'testing_center_idempotency_result_missing' using errcode = '23505';
    end if;

    return query select
      v_existing_validation.validation_id,
      v_existing_validation.candidate_id,
      v_existing_validation.exact_sha,
      v_existing_validation.decision,
      v_to_state,
      true;
    return;
  end if;

  if v_candidate_state <> 'pending' or v_issue_state <> v_from_state then
    raise exception 'testing_center_candidate_not_pending' using errcode = '55000';
  end if;
  if exists (
    select 1
    from public.testing_center_pauses as pause
    where pause.is_paused
      and (
        pause.scope = 'global'
        or (pause.scope = 'flow' and pause.technical_issue_id = v_issue_id)
      )
  ) then
    raise exception 'testing_center_paused' using errcode = '55000';
  end if;
  if exists (
    select 1
    from public.testing_center_validations as validation
    where validation.candidate_id = p_candidate_id
      and validation.channel = v_channel
      and validation.exact_sha = p_exact_sha
      and validation.actor_id = v_actor_id
  ) then
    raise exception 'testing_center_validation_conflict' using errcode = '23505';
  end if;

  insert into public.testing_center_idempotency (
    contract_version,
    idempotency_key,
    payload_digest,
    aggregate_id,
    from_state,
    to_state,
    exact_sha,
    origin
  ) values (
    'testing-center.v1',
    p_idempotency_key,
    v_operation_digest,
    v_issue_id,
    v_from_state,
    v_to_state,
    p_exact_sha,
    'testing_center'
  );

  insert into public.testing_center_validations (
    contract_version,
    validation_id,
    candidate_id,
    channel,
    exact_sha,
    candidate_author_id,
    decision,
    actor_id,
    actor_user_id,
    actor_role,
    actor_origin,
    rejection_reason
  ) values (
    'testing-center.v1',
    v_validation_id,
    p_candidate_id,
    v_channel,
    p_exact_sha,
    v_candidate_author,
    p_decision,
    v_actor_id,
    v_user_id,
    v_role,
    'testing_center',
    p_rejection_reason
  );

  update public.testing_center_candidate_builds
  set state = v_candidate_result,
    updated_at = now()
  where testing_center_candidate_builds.candidate_id = p_candidate_id;

  update public.testing_center_technical_issues
  set flow_state = v_to_state,
    updated_at = now()
  where testing_center_technical_issues.technical_issue_id = v_issue_id;

  insert into public.testing_center_audit (
    contract_version,
    audit_id,
    aggregate_id,
    from_state,
    to_state,
    origin,
    actor_id,
    actor_user_id,
    actor_role,
    exact_sha,
    operation_digest
  ) values (
    'testing-center.v1',
    v_audit_id,
    v_issue_id,
    v_from_state,
    v_to_state,
    'testing_center',
    v_actor_id,
    v_user_id,
    v_role,
    p_exact_sha,
    v_operation_digest
  );

  return query select
    v_validation_id,
    p_candidate_id,
    p_exact_sha,
    p_decision,
    v_to_state,
    false;
end
$$;

revoke all on function public.testing_center_validate_candidate(text,text,text,text,text,text)
  from public, anon, authenticated, service_role;

create or replace function public.testing_center_record_validation_projection(
  p_projection jsonb,
  p_canonical_projection text,
  p_projection_digest_source text,
  p_projection_digest text,
  p_transport_digest text,
  p_actor_user_id uuid
)
returns table(
  result_validation_id text,
  result_decision text,
  result_issue_state text,
  result_candidate_state text,
  result_idempotent boolean
)
language plpgsql security definer set search_path = '' as $$
declare
  v_keys text[];
  v_sanitization_keys text[];
  v_candidate public.testing_center_candidate_builds%rowtype;
  v_issue public.testing_center_technical_issues%rowtype;
  v_membership public.testing_center_memberships%rowtype;
  v_has_membership boolean;
  v_existing public.testing_center_validation_snapshots%rowtype;
  v_validation_id text;
  v_replay_key text;
  v_decision text;
  v_details text;
  v_from_state text;
  v_to_state text;
  v_candidate_state text;
  v_audit_digest text;
begin
  if p_actor_user_id is null or pg_catalog.jsonb_typeof(p_projection) <> 'object'
    or p_canonical_projection is null
    or pg_catalog.octet_length(p_canonical_projection) not between 2 and 32768
    or pg_catalog.octet_length(p_projection_digest_source) not between 2 and 32768
    or p_projection_digest !~ '^[0-9a-f]{64}$'
    or p_transport_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'testing_center_validation_projection_invalid'
      using errcode = '22023';
  end if;
  begin
    if p_canonical_projection::jsonb is distinct from p_projection then
      raise exception 'testing_center_validation_projection_invalid'
        using errcode = '22023';
    end if;
  exception when invalid_text_representation then
    raise exception 'testing_center_validation_projection_invalid'
      using errcode = '22023';
  end;
  begin
    if p_projection_digest_source::jsonb is distinct from
      p_projection - 'projectionDigest' then
      raise exception 'testing_center_validation_projection_digest_invalid'
        using errcode = '22023';
    end if;
  exception when invalid_text_representation then
    raise exception 'testing_center_validation_projection_digest_invalid'
      using errcode = '22023';
  end;
  if pg_catalog.encode(public.digest(
      pg_catalog.convert_to(p_canonical_projection,'UTF8'),'sha256'),'hex')
      is distinct from p_transport_digest
    or pg_catalog.encode(public.digest(
      pg_catalog.convert_to(p_projection_digest_source,'UTF8'),'sha256'),'hex')
      is distinct from p_projection_digest
    or p_projection->>'projectionDigest' is distinct from p_projection_digest then
    raise exception 'testing_center_validation_projection_digest_invalid'
      using errcode = '22023';
  end if;
  select pg_catalog.array_agg(key order by key) into v_keys
  from pg_catalog.jsonb_object_keys(p_projection) keys(key);
  select pg_catalog.array_agg(key order by key) into v_sanitization_keys
  from pg_catalog.jsonb_object_keys(p_projection->'sanitization') keys(key);
  if v_keys is distinct from array[
      'actorRole','appVersion','candidateId','candidateSha','channel',
      'contractVersion','decision','decisionDigest','detailsMarkdown','issueId',
      'operation','projectionDigest','replayKey','sanitization'
    ]::text[]
    or v_sanitization_keys is distinct from array['redactedValues','truncatedFields']::text[]
    or p_projection->>'contractVersion' <> 'testing-center.rejection.v1'
    or p_projection->>'operation' <> 'record_validation'
    or p_projection->>'issueId' !~ '^issue_[0-9a-f]{64}$'
    or p_projection->>'candidateId' !~ '^[A-Za-z0-9._-]{1,64}$'
    or p_projection->>'channel' not in ('nightly','testers')
    or p_projection->>'appVersion' = ''
    or pg_catalog.octet_length(p_projection->>'appVersion') > 32
    or p_projection->>'candidateSha' !~ '^[0-9a-f]{40}$'
    or p_projection->>'actorRole' not in ('tester','primary_tester','owner')
    or p_projection->>'decision' not in ('accepted','rejected','cannot_verify')
    or p_projection->>'decisionDigest' !~ '^[0-9a-f]{64}$'
    or pg_catalog.jsonb_typeof(p_projection->'sanitization') <> 'object'
    or pg_catalog.jsonb_typeof(p_projection->'sanitization'->'redactedValues') <> 'number'
    or pg_catalog.jsonb_typeof(p_projection->'sanitization'->'truncatedFields') <> 'number'
    or (p_projection#>>'{sanitization,redactedValues}')::integer < 0
    or (p_projection#>>'{sanitization,truncatedFields}')::integer < 0 then
    raise exception 'testing_center_validation_projection_shape_invalid'
      using errcode = '22023';
  end if;

  select * into v_membership from public.testing_center_memberships
  where user_id = p_actor_user_id and active for update;
  v_has_membership := found;
  if private.is_owner(p_actor_user_id) then
    v_membership.actor_id := coalesce(v_membership.actor_id, p_actor_user_id::text);
    v_membership.role := 'owner';
  elsif not v_has_membership
    or coalesce(v_membership.role, '') not in ('tester', 'primary_tester') then
    raise exception 'testing_center_validation_membership_invalid'
      using errcode = '42501';
  end if;
  if v_membership.actor_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or v_membership.role <> p_projection->>'actorRole' then
    raise exception 'testing_center_validation_membership_invalid'
      using errcode = '42501';
  end if;
  if (p_projection->>'channel' = 'nightly'
      and v_membership.role not in ('primary_tester','owner'))
    or (p_projection->>'channel' = 'testers'
      and v_membership.role not in ('tester','primary_tester','owner')) then
    raise exception 'testing_center_validation_role_invalid' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_projection->>'candidateId',0)
  );
  select * into v_candidate from public.testing_center_candidate_builds
  where candidate_id = p_projection->>'candidateId' for update;
  if not found
    or v_candidate.technical_issue_id <> p_projection->>'issueId'
    or v_candidate.channel <> p_projection->>'channel'
    or v_candidate.build_version <> p_projection->>'appVersion'
    or v_candidate.exact_sha <> p_projection->>'candidateSha'
    or v_candidate.author_id = v_membership.actor_id then
    raise exception 'testing_center_validation_candidate_invalid'
      using errcode = '55000';
  end if;
  select * into strict v_issue from public.testing_center_technical_issues
  where technical_issue_id = v_candidate.technical_issue_id for update;

  v_replay_key := 'validation:' || v_candidate.technical_issue_id || ':'
    || v_candidate.candidate_id || ':' || v_candidate.channel || ':'
    || v_candidate.exact_sha || ':' || v_membership.actor_id;
  if p_projection->>'replayKey' is distinct from v_replay_key then
    raise exception 'testing_center_validation_replay_key_invalid'
      using errcode = '22023';
  end if;
  select * into v_existing from public.testing_center_validation_snapshots
  where replay_key = v_replay_key;
  if found then
    if v_existing.projection_digest <> p_projection_digest
      or v_existing.actor_user_id <> p_actor_user_id then
      raise exception 'testing_center_validation_replay_conflict'
        using errcode = '23505';
    end if;
    return query select v_existing.validation_id, v_existing.decision,
      v_issue.flow_state, v_candidate.state, true;
    return;
  end if;
  if v_candidate.state not in ('pending','accepted')
    or v_issue.flow_state not in (
      'nightly_candidate','nightly_accepted','testers_candidate','testers_accepted'
    ) then
    raise exception 'testing_center_candidate_not_open_for_feedback'
      using errcode = '55000';
  end if;
  if exists (
    select 1 from public.testing_center_pauses pause
    where pause.is_paused and (pause.scope='global'
      or (pause.scope='flow' and pause.technical_issue_id=v_issue.technical_issue_id))
  ) then
    raise exception 'testing_center_paused' using errcode = '55000';
  end if;

  v_decision := p_projection->>'decision';
  v_details := case when p_projection->'detailsMarkdown' = 'null'::jsonb
    then null else p_projection->>'detailsMarkdown' end;
  if (v_decision='rejected' and (v_details is null
      or v_details !~ '^## Rechazo:' or v_details ~* 'https?://|@[A-Za-z0-9]'))
    or (v_decision in ('accepted','cannot_verify') and v_details is not null) then
    raise exception 'testing_center_validation_details_invalid'
      using errcode = '22023';
  end if;

  v_from_state := v_issue.flow_state;
  if v_decision = 'rejected' then
    v_to_state := 'needs_owner';
    v_candidate_state := 'rejected';
  elsif v_decision = 'accepted' then
    v_to_state := case v_candidate.channel
      when 'nightly' then 'nightly_accepted' else 'testers_accepted' end;
    v_candidate_state := 'accepted';
  else
    v_to_state := v_issue.flow_state;
    v_candidate_state := v_candidate.state;
  end if;
  v_validation_id := 'validation_' || p_projection_digest;

  insert into public.testing_center_validations(
    contract_version,validation_id,candidate_id,channel,exact_sha,
    candidate_author_id,decision,actor_id,actor_user_id,actor_role,
    actor_origin,rejection_reason
  ) values (
    'testing-center.v1',v_validation_id,v_candidate.candidate_id,
    v_candidate.channel,v_candidate.exact_sha,v_candidate.author_id,v_decision,
    v_membership.actor_id,p_actor_user_id,v_membership.role,'testing_center',
    case when v_decision='rejected' then 'other' else null end
  );
  insert into public.testing_center_validation_snapshots(
    validation_id,technical_issue_id,candidate_id,channel,app_version,
    candidate_sha,actor_id,actor_user_id,actor_role,decision,replay_key,
    decision_digest,projection_digest,transport_digest,sanitized_projection,details_markdown,
    redacted_values,truncated_fields
  ) values (
    v_validation_id,v_issue.technical_issue_id,v_candidate.candidate_id,
    v_candidate.channel,v_candidate.build_version,v_candidate.exact_sha,
    v_membership.actor_id,p_actor_user_id,v_membership.role,v_decision,
    v_replay_key,p_projection->>'decisionDigest',p_projection_digest,
    p_transport_digest,p_projection,
    v_details,(p_projection#>>'{sanitization,redactedValues}')::integer,
    (p_projection#>>'{sanitization,truncatedFields}')::integer
  );

  if v_candidate.state is distinct from v_candidate_state then
    update public.testing_center_candidate_builds
    set state=v_candidate_state,updated_at=now()
    where candidate_id=v_candidate.candidate_id;
  end if;
  if v_issue.flow_state is distinct from v_to_state then
    update public.testing_center_technical_issues
    set flow_state=v_to_state,updated_at=now()
    where technical_issue_id=v_issue.technical_issue_id;
    v_audit_digest := pg_catalog.encode(public.digest(pg_catalog.convert_to(
      'candidate-feedback' || pg_catalog.chr(31) || p_projection_digest,
      'UTF8'),'sha256'),'hex');
    insert into public.testing_center_audit(
      contract_version,audit_id,aggregate_id,from_state,to_state,origin,
      actor_id,actor_user_id,actor_role,exact_sha,operation_digest
    ) values (
      'testing-center.v1','audit_' || v_audit_digest,v_issue.technical_issue_id,
      v_from_state,v_to_state,'testing_center',v_membership.actor_id,
      p_actor_user_id,v_membership.role,v_candidate.exact_sha,v_audit_digest
    );
  end if;
  if v_decision='rejected' then
    update public.testing_center_promotions
    set state='blocked',authorized_by_id=null,authorized_by_user_id=null,
      authorized_by_role=null,authorized_origin=null,updated_at=now()
    where candidate_id=v_candidate.candidate_id
      and exact_sha=v_candidate.exact_sha and state in ('pending','authorized');
  end if;
  return query select v_validation_id,v_decision,v_to_state,v_candidate_state,false;
end $$;

revoke all on function public.testing_center_record_validation_projection(jsonb,text,text,text,text,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.testing_center_record_validation_projection(jsonb,text,text,text,text,uuid)
  to service_role;

commit;
