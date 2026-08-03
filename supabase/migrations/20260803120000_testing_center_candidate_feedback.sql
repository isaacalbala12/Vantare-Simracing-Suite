-- ISA-241 / TAU-07G: durable candidate feedback, deterministic dossier
-- snapshots and explicit owner dispositions. No RPC in this migration creates
-- a Linear issue, Codex task, Git branch, PR, merge, deploy or promotion.

begin;

revoke all on function public.testing_center_validate_candidate(
  text,text,text,text,text,text
) from public, anon, authenticated, service_role;

alter table public.testing_center_validations
  drop constraint testing_center_validations_decision_check,
  drop constraint testing_center_validations_reason_check,
  add constraint testing_center_validations_decision_check check (
    decision in ('accepted','rejected','cannot_verify')
  ),
  add constraint testing_center_validations_reason_check check (
    (decision in ('accepted','cannot_verify') and rejection_reason is null)
    or (
      decision = 'rejected' and rejection_reason in (
        'still_fails','regression','incomplete_fix','new_failure','other'
      )
    )
  );

create table public.testing_center_validation_snapshots(
  validation_id text primary key
    references public.testing_center_validations(validation_id) on delete restrict,
  technical_issue_id text not null
    references public.testing_center_technical_issues(technical_issue_id) on delete restrict,
  candidate_id text not null,
  channel text not null check (channel in ('nightly','testers')),
  app_version text not null check (
    app_version <> '' and app_version !~ '^[[:space:]]|[[:space:]]$'
      and octet_length(app_version) <= 32
  ),
  candidate_sha text not null check (candidate_sha ~ '^[0-9a-f]{40}$'),
  actor_id text not null check (
    actor_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  actor_role text not null check (actor_role in ('tester','primary_tester','owner')),
  decision text not null check (decision in ('accepted','rejected','cannot_verify')),
  replay_key text not null unique check (
    replay_key <> '' and octet_length(replay_key) <= 512
  ),
  decision_digest text not null check (decision_digest ~ '^[0-9a-f]{64}$'),
  projection_digest text not null unique check (projection_digest ~ '^[0-9a-f]{64}$'),
  transport_digest text not null unique check (transport_digest ~ '^[0-9a-f]{64}$'),
  sanitized_projection jsonb not null,
  details_markdown text,
  redacted_values integer not null check (redacted_values >= 0),
  truncated_fields integer not null check (truncated_fields >= 0),
  created_at timestamptz not null default now(),
  constraint testing_center_validation_snapshot_details check (
    (decision = 'rejected' and details_markdown is not null
      and octet_length(details_markdown) between 1 and 16384)
    or (decision in ('accepted','cannot_verify') and details_markdown is null)
  ),
  constraint testing_center_validation_snapshot_candidate_fk
    foreign key(candidate_id,channel,candidate_sha)
    references public.testing_center_candidate_builds(candidate_id,channel,exact_sha)
    on delete restrict,
  unique(candidate_id,channel,candidate_sha,actor_id)
);

create table public.testing_center_codex_dossier_snapshots(
  dossier_digest text primary key check (dossier_digest ~ '^[0-9a-f]{64}$'),
  transport_digest text not null unique check (transport_digest ~ '^[0-9a-f]{64}$'),
  dossier_idempotency_key text not null check (
    dossier_idempotency_key <> '' and octet_length(dossier_idempotency_key) <= 512
  ),
  rejection_validation_id text not null
    references public.testing_center_validation_snapshots(validation_id) on delete restrict,
  technical_issue_id text not null
    references public.testing_center_technical_issues(technical_issue_id) on delete restrict,
  candidate_id text not null,
  channel text not null check (channel in ('nightly','testers')),
  candidate_sha text not null check (candidate_sha ~ '^[0-9a-f]{40}$'),
  correction_issue_id text not null check (correction_issue_id ~ '^issue_[0-9a-f]{64}$'),
  target_branch text not null check (
    target_branch ~ '^vantareapp/isa-[0-9]+-[a-z0-9-]{1,60}$'
  ),
  nightly_sha text not null check (nightly_sha ~ '^[0-9a-f]{40}$'),
  status text not null check (status in ('complete','incomplete')),
  canonical_dossier jsonb not null,
  created_at timestamptz not null default now(),
  constraint testing_center_dossier_candidate_fk
    foreign key(candidate_id,channel,candidate_sha)
    references public.testing_center_candidate_builds(candidate_id,channel,exact_sha)
    on delete restrict
);
create index testing_center_dossiers_rejection_idx
  on public.testing_center_codex_dossier_snapshots(rejection_validation_id,status);

create table public.testing_center_owner_dispositions(
  disposition_id text primary key check (disposition_id ~ '^disposition_[0-9a-f]{64}$'),
  rejection_validation_id text not null unique
    references public.testing_center_validation_snapshots(validation_id) on delete restrict,
  technical_issue_id text not null
    references public.testing_center_technical_issues(technical_issue_id) on delete restrict,
  actor_id text not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  disposition text not null check (disposition in (
    'create_correction_subissue','environment_issue','create_separate_issue',
    'dismiss_with_reason','stop_rollout'
  )),
  reason text not null check (
    reason = btrim(reason) and octet_length(reason) between 3 and 2048
  ),
  dossier_digest text
    references public.testing_center_codex_dossier_snapshots(dossier_digest) on delete restrict,
  correction_issue_id text,
  target_branch text,
  nightly_sha text,
  disposition_digest text not null unique check (disposition_digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  constraint testing_center_owner_disposition_correction check (
    (disposition = 'create_correction_subissue'
      and dossier_digest is not null
      and correction_issue_id ~ '^issue_[0-9a-f]{64}$'
      and target_branch ~ '^vantareapp/isa-[0-9]+-[a-z0-9-]{1,60}$'
      and nightly_sha ~ '^[0-9a-f]{40}$')
    or (disposition <> 'create_correction_subissue'
      and dossier_digest is null and correction_issue_id is null
      and target_branch is null and nightly_sha is null)
  )
);

alter table public.testing_center_validation_snapshots enable row level security;
alter table public.testing_center_validation_snapshots force row level security;
alter table public.testing_center_codex_dossier_snapshots enable row level security;
alter table public.testing_center_codex_dossier_snapshots force row level security;
alter table public.testing_center_owner_dispositions enable row level security;
alter table public.testing_center_owner_dispositions force row level security;

revoke all on table public.testing_center_validation_snapshots,
  public.testing_center_codex_dossier_snapshots,
  public.testing_center_owner_dispositions
from public, anon, authenticated, service_role;
grant select on table public.testing_center_validation_snapshots,
  public.testing_center_codex_dossier_snapshots,
  public.testing_center_owner_dispositions
to service_role;

create function public.testing_center_record_validation_projection(
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
  if not found
    or v_membership.actor_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
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

create function public.testing_center_record_codex_dossier(
  p_rejection_validation_id text,
  p_dossier jsonb,
  p_canonical_dossier text,
  p_dossier_digest_source text,
  p_dossier_digest text,
  p_transport_digest text
)
returns table(result_dossier_digest text,result_status text,result_idempotent boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_keys text[];
  v_validation public.testing_center_validation_snapshots%rowtype;
  v_candidate public.testing_center_candidate_builds%rowtype;
  v_existing public.testing_center_codex_dossier_snapshots%rowtype;
  v_status text;
begin
  if p_rejection_validation_id is null
    or pg_catalog.jsonb_typeof(p_dossier) <> 'object'
    or pg_catalog.octet_length(p_canonical_dossier) not between 2 and 32768
    or pg_catalog.octet_length(p_dossier_digest_source) not between 2 and 32768
    or p_dossier_digest !~ '^[0-9a-f]{64}$'
    or p_transport_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'testing_center_dossier_invalid' using errcode='22023';
  end if;
  begin
    if p_canonical_dossier::jsonb is distinct from p_dossier then
      raise exception 'testing_center_dossier_invalid' using errcode='22023';
    end if;
  exception when invalid_text_representation then
    raise exception 'testing_center_dossier_invalid' using errcode='22023';
  end;
  begin
    if p_dossier_digest_source::jsonb is distinct from
      pg_catalog.jsonb_set(p_dossier,'{dossierDigest}',pg_catalog.to_jsonb(''::text)) then
      raise exception 'testing_center_dossier_digest_invalid' using errcode='22023';
    end if;
  exception when invalid_text_representation then
    raise exception 'testing_center_dossier_digest_invalid' using errcode='22023';
  end;
  if pg_catalog.encode(public.digest(
      pg_catalog.convert_to(p_canonical_dossier,'UTF8'),'sha256'),'hex')
      is distinct from p_transport_digest
    or pg_catalog.encode(public.digest(
      pg_catalog.convert_to(p_dossier_digest_source,'UTF8'),'sha256'),'hex')
      is distinct from p_dossier_digest
    or p_dossier->>'dossierDigest' is distinct from p_dossier_digest then
    raise exception 'testing_center_dossier_digest_invalid' using errcode='22023';
  end if;
  select pg_catalog.array_agg(key order by key) into v_keys
  from pg_catalog.jsonb_object_keys(p_dossier) keys(key);
  if v_keys is distinct from array[
      'basePrSha','candidateSha','commandIds','contractVersion','criteria',
      'dossierDigest','dossierIdempotencyKey','evidence','evidenceDigest',
      'evidenceRedactedValues','evidenceTruncatedFields','files','hasReplayUrl',
      'includesRetryOrReleaseCommand','incompleteReasons','nightlyHeadSha',
      'noDeployAllowed','noMergeAllowed','noPromotionAllowed','noRetryAllowed',
      'prBaseRef','rejection','repository','source','status','strategy'
    ]::text[]
    or p_dossier->>'contractVersion' <> 'testing-center.codex-dossier.v1'
    or p_dossier->>'strategy' <> 'sub_issue_new_branch'
    or p_dossier->>'prBaseRef' <> 'nightly'
    or p_dossier->>'candidateSha' !~ '^[0-9a-f]{40}$'
    or p_dossier->>'nightlyHeadSha' !~ '^[0-9a-f]{40}$'
    or p_dossier->>'basePrSha' !~ '^[0-9a-f]{40}$'
    or p_dossier#>>'{repository,owner}' <> 'isaacalbala12'
    or p_dossier#>>'{repository,name}' <> 'Vantare-Simracing-Suite'
    or p_dossier#>>'{repository,environment}' <> 'vantare-codex-cloud'
    or p_dossier#>>'{repository,targetBranch}' !~ '^vantareapp/isa-[0-9]+-[a-z0-9-]{1,60}$'
    or (p_dossier->>'hasReplayUrl')::boolean
    or (p_dossier->>'includesRetryOrReleaseCommand')::boolean
    or not (p_dossier->>'noRetryAllowed')::boolean
    or not (p_dossier->>'noMergeAllowed')::boolean
    or not (p_dossier->>'noDeployAllowed')::boolean
    or not (p_dossier->>'noPromotionAllowed')::boolean
    or p_dossier::text ~* 'https?://' then
    raise exception 'testing_center_dossier_shape_invalid' using errcode='22023';
  end if;
  v_status := p_dossier->>'status';
  if v_status not in ('complete','incomplete')
    or (v_status='complete' and pg_catalog.jsonb_array_length(
      p_dossier->'incompleteReasons') <> 0) then
    raise exception 'testing_center_dossier_status_invalid' using errcode='22023';
  end if;

  select * into v_validation from public.testing_center_validation_snapshots
  where validation_id=p_rejection_validation_id and decision='rejected'
  for update;
  if not found then
    raise exception 'testing_center_dossier_rejection_invalid' using errcode='55000';
  end if;
  select * into strict v_candidate from public.testing_center_candidate_builds
  where candidate_id=v_validation.candidate_id;
  if p_dossier#>>'{source,originalIssue,issueId}' <> v_validation.technical_issue_id
    or p_dossier#>>'{source,candidate,candidateId}' <> v_validation.candidate_id
    or p_dossier#>>'{source,candidate,channel}' <> v_validation.channel
    or p_dossier#>>'{source,candidate,appVersion}' <> v_validation.app_version
    or p_dossier#>>'{source,candidate,candidateSha}' <> v_validation.candidate_sha
    or p_dossier->>'candidateSha' <> v_validation.candidate_sha
    or p_dossier#>>'{source,subIssue,issueId}' !~ '^issue_[0-9a-f]{64}$'
    or p_dossier#>>'{source,subIssue,issueId}' = v_validation.technical_issue_id then
    raise exception 'testing_center_dossier_binding_invalid' using errcode='55000';
  end if;
  select * into v_existing from public.testing_center_codex_dossier_snapshots
  where dossier_digest=p_dossier_digest;
  if found then
    if v_existing.transport_digest <> p_transport_digest
      or v_existing.rejection_validation_id <> p_rejection_validation_id then
      raise exception 'testing_center_dossier_conflict' using errcode='23505';
    end if;
    return query select v_existing.dossier_digest,v_existing.status,true;
    return;
  end if;
  insert into public.testing_center_codex_dossier_snapshots(
    dossier_digest,transport_digest,dossier_idempotency_key,
    rejection_validation_id,technical_issue_id,candidate_id,channel,
    candidate_sha,correction_issue_id,target_branch,nightly_sha,status,
    canonical_dossier
  ) values (
    p_dossier_digest,p_transport_digest,p_dossier->>'dossierIdempotencyKey',
    p_rejection_validation_id,v_validation.technical_issue_id,
    v_validation.candidate_id,v_validation.channel,v_validation.candidate_sha,
    p_dossier#>>'{source,subIssue,issueId}',
    p_dossier#>>'{repository,targetBranch}',p_dossier->>'nightlyHeadSha',
    v_status,p_dossier
  );
  return query select p_dossier_digest,v_status,false;
end $$;

create function public.testing_center_record_owner_disposition(
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
  v_owner public.testing_center_memberships%rowtype;
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
  select * into v_owner from public.testing_center_memberships
  where user_id=p_owner_user_id and active and role='owner' for update;
  if not found then
    raise exception 'testing_center_owner_required' using errcode='42501';
  end if;
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
    || v_owner.actor_id || pg_catalog.chr(31) || p_owner_user_id::text,
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
    v_owner.actor_id,p_owner_user_id,p_disposition,p_reason,p_dossier_digest,
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
      'needs_owner','stopped','testing_center',v_owner.actor_id,p_owner_user_id,
      'owner',v_validation.candidate_sha,v_digest
    );
  end if;
  return query select v_disposition_id,v_target_state,false;
end $$;

do $$ declare v_signature text; begin
  foreach v_signature in array array[
    'testing_center_record_validation_projection(jsonb,text,text,text,text,uuid)',
    'testing_center_record_codex_dossier(text,jsonb,text,text,text,text)',
    'testing_center_record_owner_disposition(text,text,text,text,text,text,text,uuid)'
  ] loop
    execute 'revoke all on function public.' || v_signature
      || ' from public, anon, authenticated';
    execute 'grant execute on function public.' || v_signature || ' to service_role';
  end loop;
end $$;

comment on table public.testing_center_validation_snapshots is
  'TAU-07G exact candidate feedback projection; tester identity remains private.';
comment on table public.testing_center_codex_dossier_snapshots is
  'TAU-07G deterministic sanitized dossier; storage grants no Codex authority.';
comment on table public.testing_center_owner_dispositions is
  'TAU-07G explicit owner decision; same_branch is impossible by constraint.';

commit;
