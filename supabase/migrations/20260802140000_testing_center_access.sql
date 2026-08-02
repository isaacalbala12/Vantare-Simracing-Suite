-- ISA-210 / TAU-02C: server-derived roles, read-only RLS and one safe
-- candidate-validation RPC for testing-center.v1.

create table public.testing_center_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  actor_id text not null unique
    constraint testing_center_memberships_actor_check check (
      actor_id <> ''
      and actor_id !~ '^[[:space:]]|[[:space:]]$'
      and octet_length(actor_id) <= 256
    ),
  role text not null
    constraint testing_center_memberships_role_check check (
      role in ('tester', 'primary_tester', 'owner')
    ),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.testing_center_memberships enable row level security;
alter table public.testing_center_memberships force row level security;

revoke all on table public.testing_center_memberships from public, anon, authenticated;
grant select, insert, update, delete on table public.testing_center_memberships to service_role;

create or replace function public.testing_center_current_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select membership.role
  from public.testing_center_memberships as membership
  where membership.user_id = auth.uid()
    and membership.active
$$;

create or replace function public.testing_center_can_view_channel(p_channel text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case public.testing_center_current_role()
    when 'owner' then p_channel in ('nightly', 'testers')
    when 'primary_tester' then p_channel in ('nightly', 'testers')
    when 'tester' then p_channel = 'testers'
    else false
  end
$$;

revoke all on function public.testing_center_current_role() from public, anon;
revoke all on function public.testing_center_can_view_channel(text) from public, anon;
grant execute on function public.testing_center_current_role() to authenticated;
grant execute on function public.testing_center_can_view_channel(text) to authenticated;

grant select on table public.testing_center_memberships,
  public.testing_center_reports,
  public.testing_center_evidence,
  public.testing_center_technical_issues,
  public.testing_center_candidate_builds
to authenticated;

create policy testing_center_memberships_select_self
  on public.testing_center_memberships
  for select
  to authenticated
  using (user_id = auth.uid() and active);

create policy testing_center_reports_select_own
  on public.testing_center_reports
  for select
  to authenticated
  using (
    reporter_user_id = auth.uid()
    or public.testing_center_current_role() = 'owner'
  );

create policy testing_center_evidence_select_own
  on public.testing_center_evidence
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.testing_center_reports as report
      where report.report_id = testing_center_evidence.report_id
        and (
          report.reporter_user_id = auth.uid()
          or public.testing_center_current_role() = 'owner'
        )
    )
  );

create policy testing_center_issues_select_own
  on public.testing_center_technical_issues
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.testing_center_reports as report
      where report.report_id = testing_center_technical_issues.report_id
        and (
          report.reporter_user_id = auth.uid()
          or public.testing_center_current_role() = 'owner'
        )
    )
  );

create policy testing_center_candidates_select_channel
  on public.testing_center_candidate_builds
  for select
  to authenticated
  using (public.testing_center_can_view_channel(channel));

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
  v_user_id uuid := auth.uid();
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

  if not found then
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

revoke all on function public.testing_center_validate_candidate(
  text, text, text, text, text, text
) from public, anon;
grant execute on function public.testing_center_validate_candidate(
  text, text, text, text, text, text
) to authenticated;

comment on table public.testing_center_memberships is
  'TAU-02C server-owned Testing Center roles; clients cannot self-assign.';
comment on function public.testing_center_validate_candidate(
  text, text, text, text, text, text
) is 'TAU-02C authenticated, fail-closed and idempotent candidate validation.';
