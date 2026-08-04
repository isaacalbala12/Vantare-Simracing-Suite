-- ISA-243 / TAU-07I: fail-closed pilot completion for the first real
-- Supabase -> Linear issue. This adds no scheduler, Codex or promotion path.

begin;

alter table public.testing_center_effect_outbox
  drop constraint testing_center_effect_outbox_external_shape_check,
  add constraint testing_center_effect_outbox_external_shape_check check (
    (state = 'completed' and effect_type = 'github_issue_create'
      and external_issue_number > 0 and external_issue_node_id is not null)
    or (state = 'completed' and effect_type = 'linear_issue_create'
      and external_issue_number is null and external_issue_node_id is null)
    or (state <> 'completed'
      and external_issue_number is null and external_issue_node_id is null)
  );

alter table public.testing_center_linear_issue_bindings
  add column external_identifier text,
  add column external_url text,
  add column projection_digest text,
  add constraint testing_center_linear_binding_public_metadata check (
    (external_identifier is null and external_url is null and projection_digest is null)
    or (
      external_identifier ~ '^[A-Z][A-Z0-9]{0,15}-[1-9][0-9]{0,9}$'
      and external_url ~ ('^https://linear[.]app/vantareapp/issue/'
        || external_identifier || '/[A-Za-z0-9._~!$&''()*+,;=:@%/-]+$')
      and projection_digest ~ '^[0-9a-f]{64}$'
    )
  );

create or replace function public.testing_center_claim_linear_effect(
  p_effect_id text,
  p_worker_id text,
  p_lease_seconds integer default 60
)
returns table(
  claim_status text,
  technical_issue_id text,
  fencing_token bigint,
  lease_expires_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
declare v_effect public.testing_center_effect_outbox%rowtype;
begin
  if p_worker_id is null
    or p_worker_id !~ '^[a-z0-9][a-z0-9._-]{0,63}$'
    or p_lease_seconds not between 10 and 300 then
    raise exception 'testing_center_linear_claim_invalid' using errcode = '22023';
  end if;
  lock table public.testing_center_pauses in share mode;
  select * into v_effect from public.testing_center_effect_outbox
  where effect_id = p_effect_id for update;
  if not found or v_effect.effect_type <> 'linear_issue_create' then
    raise exception 'testing_center_linear_effect_not_found' using errcode = 'P0002';
  end if;
  if v_effect.state = 'completed' then claim_status := 'completed';
  elsif v_effect.state = 'dry_run_completed' then claim_status := 'dry_run_completed';
  elsif v_effect.state = 'needs_owner' then claim_status := 'needs_owner';
  elsif v_effect.state = 'superseded' or not exists (
    select 1 from public.testing_center_issue_destinations as destination
    where destination.technical_issue_id = v_effect.technical_issue_id
      and destination.destination = 'linear'
      and destination.active_effect_id = v_effect.effect_id
  ) then claim_status := 'not_selected';
  elsif not exists (
    select 1 from public.testing_center_linear_projection_snapshots
    where effect_id = v_effect.effect_id
  ) then claim_status := 'not_prepared';
  elsif v_effect.state in ('claimed','failed')
    and (v_effect.state = 'failed' or v_effect.lease_expires_at <= now())
    and exists (
      select 1 from public.testing_center_linear_projection_snapshots snapshot
      where snapshot.effect_id = v_effect.effect_id
        and snapshot.sanitized_projection is not null
    ) then
    update public.testing_center_effect_outbox effect
    set state = 'needs_owner', lease_token = null, lease_expires_at = null,
      lease_owner = null, next_attempt_at = null,
      last_error_code = 'linear_response_ambiguous', updated_at = now()
    where effect.effect_id = p_effect_id returning effect.* into v_effect;
    update public.testing_center_issue_destinations
    set decision_state = 'needs_owner',
      decision_reason = 'linear_response_ambiguous', updated_at = now()
    where technical_issue_id = v_effect.technical_issue_id
      and destination = 'linear' and active_effect_id = v_effect.effect_id;
    claim_status := 'needs_owner';
  elsif exists (
    select 1 from public.testing_center_pauses pause
    where pause.is_paused and (pause.scope = 'global'
      or (pause.scope = 'flow' and pause.technical_issue_id = v_effect.technical_issue_id))
  ) then claim_status := 'paused';
  elsif v_effect.state = 'claimed' and v_effect.lease_expires_at > now()
    then claim_status := 'busy';
  elsif v_effect.state = 'failed' and v_effect.next_attempt_at > now()
    then claim_status := 'retry_scheduled';
  elsif v_effect.attempt_count >= 5 then claim_status := 'exhausted';
  else
    update public.testing_center_effect_outbox effect
    set state = 'claimed', attempt_count = effect.attempt_count + 1,
      lease_token = public.gen_random_uuid(), lease_owner = p_worker_id,
      lease_expires_at = now() + pg_catalog.make_interval(secs => p_lease_seconds),
      fencing_token = effect.fencing_token + 1,
      next_attempt_at = null, last_error_code = null, updated_at = now()
    where effect.effect_id = p_effect_id returning effect.* into v_effect;
    claim_status := 'claimed';
  end if;
  technical_issue_id := v_effect.technical_issue_id;
  fencing_token := v_effect.fencing_token;
  lease_expires_at := v_effect.lease_expires_at;
  return next;
end $$;

create function public.testing_center_retry_linear_pilot_token(
  p_effect_id text,
  p_worker_id text,
  p_fencing_token bigint,
  p_projection_digest text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_effect public.testing_center_effect_outbox%rowtype;
begin
  select * into v_effect from public.testing_center_effect_outbox
  where effect_id = p_effect_id for update;
  if not found or v_effect.effect_type <> 'linear_issue_create'
    or v_effect.state <> 'claimed'
    or v_effect.lease_owner is distinct from p_worker_id
    or v_effect.fencing_token is distinct from p_fencing_token
    or v_effect.lease_expires_at <= now() then
    raise exception 'testing_center_linear_lease_lost' using errcode = '55000';
  end if;
  update public.testing_center_linear_projection_snapshots
  set sanitized_projection = null, projection_digest = null, completed_at = null
  where effect_id = p_effect_id and projection_digest = p_projection_digest
    and sanitized_projection is not null;
  if not found then
    raise exception 'testing_center_linear_projection_integrity_invalid'
      using errcode = '22023';
  end if;
  update public.testing_center_effect_outbox
  set state = 'failed', lease_token = null, lease_expires_at = null,
    lease_owner = null,
    next_attempt_at = now() + pg_catalog.make_interval(
      secs => least(300,
        5 * (2 ^ greatest(attempt_count - 1,0))::integer)),
    last_error_code = 'linear_transport_unavailable', updated_at = now()
  where effect_id = p_effect_id;
end $$;

create function public.testing_center_assert_linear_dispatch(
  p_effect_id text,
  p_worker_id text,
  p_fencing_token bigint,
  p_source_digest text,
  p_projection jsonb,
  p_canonical_projection text,
  p_projection_digest text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_effect public.testing_center_effect_outbox%rowtype;
  v_snapshot public.testing_center_linear_projection_snapshots%rowtype;
  v_digest text;
  v_keys text[];
  v_report jsonb;
begin
  lock table public.testing_center_pauses in share mode;
  select * into v_effect from public.testing_center_effect_outbox
  where effect_id = p_effect_id for update;
  if not found or v_effect.effect_type <> 'linear_issue_create'
    or v_effect.state <> 'claimed'
    or v_effect.lease_owner is distinct from p_worker_id
    or v_effect.fencing_token is distinct from p_fencing_token
    or v_effect.lease_expires_at <= now() then
    raise exception 'testing_center_linear_lease_lost' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.testing_center_pauses pause
    where pause.is_paused and (pause.scope = 'global'
      or (pause.scope = 'flow' and pause.technical_issue_id = v_effect.technical_issue_id))
  ) then
    raise exception 'testing_center_paused' using errcode = '55000';
  end if;
  if not exists (
    select 1 from public.testing_center_issue_destinations destination
    where destination.technical_issue_id = v_effect.technical_issue_id
      and destination.destination = 'linear'
      and destination.active_effect_id = v_effect.effect_id
      and destination.decision_state = 'selected'
  ) then
    raise exception 'testing_center_linear_effect_not_selected' using errcode = '55000';
  end if;
  select * into v_snapshot from public.testing_center_linear_projection_snapshots
  where effect_id = p_effect_id for update;
  if not found then
    raise exception 'testing_center_linear_projection_not_prepared' using errcode = '55000';
  end if;
  begin
    if p_canonical_projection::jsonb is distinct from p_projection then
      raise exception 'testing_center_linear_projection_integrity_invalid'
        using errcode = '22023';
    end if;
  exception when invalid_text_representation then
    raise exception 'testing_center_linear_projection_integrity_invalid'
      using errcode = '22023';
  end;
  v_digest := pg_catalog.encode(public.digest(
    pg_catalog.convert_to(p_canonical_projection,'UTF8'),'sha256'),'hex');
  if pg_catalog.jsonb_typeof(p_projection) <> 'object' then
    raise exception 'testing_center_linear_projection_integrity_invalid'
      using errcode = '22023';
  end if;
  select pg_catalog.array_agg(key order by key) into v_keys
  from pg_catalog.jsonb_object_keys(p_projection) as keys(key);
  v_report := v_snapshot.source_snapshot->'report';
  if p_source_digest is distinct from v_snapshot.source_digest
    or v_keys is distinct from array[
      'contractVersion','description','effectId','labels','marker','operation',
      'project','serverMetadataDigest','sourceDigest','status','team',
      'technicalIssueId','title'
    ]::text[]
    or p_projection->>'contractVersion' <> 'testing-center.linear-issue.v1'
    or p_projection->>'operation' <> 'create_issue'
    or p_projection->>'effectId' <> v_snapshot.effect_id
    or p_projection->>'technicalIssueId' <> v_snapshot.technical_issue_id
    or p_projection->>'sourceDigest' <> v_snapshot.source_digest
    or p_projection->>'marker' <> v_snapshot.marker
    or p_projection->>'team' <> 'Vantare'
    or p_projection->>'project' <> 'Testing Center'
    or p_projection->>'status' <> 'Triage'
    or p_projection->>'serverMetadataDigest'
      <> '65511d3f3ca28f43acd775c2a25902825730c892ba6e76860576dd0fdfc0caff'
    or p_projection->'labels' is distinct from pg_catalog.jsonb_build_array(
      'testing-center','needs-triage','channel:' || (v_report->>'channel'),
      'module:' || (v_report->>'module'),'status:needs-triage')
    or pg_catalog.jsonb_typeof(p_projection->'title') <> 'string'
    or pg_catalog.octet_length(p_projection->>'title') not between 1 and 255
    or pg_catalog.jsonb_typeof(p_projection->'description') <> 'string'
    or pg_catalog.octet_length(p_projection->>'description') not between 1 and 32768
    or pg_catalog.strpos(p_projection->>'description', v_snapshot.marker) <> 1
    or p_projection_digest is distinct from v_digest
    or p_projection ?| array['assignee','assigneeId','priority','delegate',
      'instructions','commands','branch','baseBranch'] then
    raise exception 'testing_center_linear_projection_integrity_invalid'
      using errcode = '22023';
  end if;
  update public.testing_center_linear_projection_snapshots
  set sanitized_projection = p_projection,
    projection_digest = p_projection_digest,
    completed_at = coalesce(completed_at, now())
  where effect_id = p_effect_id
    and (sanitized_projection is null or (
      sanitized_projection = p_projection
      and projection_digest = p_projection_digest
    ));
  if not found then
    raise exception 'testing_center_linear_projection_conflict' using errcode = '23505';
  end if;
end $$;

create function public.testing_center_complete_linear_pilot(
  p_effect_id text,
  p_worker_id text,
  p_fencing_token bigint,
  p_projection_digest text,
  p_external_issue_id uuid,
  p_organization_id uuid,
  p_external_identifier text,
  p_external_url text,
  p_bound_by_id text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_effect public.testing_center_effect_outbox%rowtype;
  v_snapshot public.testing_center_linear_projection_snapshots%rowtype;
begin
  if p_external_issue_id is null or p_organization_id is null
    or p_projection_digest !~ '^[0-9a-f]{64}$'
    or p_external_identifier !~ '^[A-Z][A-Z0-9]{0,15}-[1-9][0-9]{0,9}$'
    or p_external_url !~ ('^https://linear[.]app/vantareapp/issue/'
      || p_external_identifier || '/[A-Za-z0-9._~!$&''()*+,;=:@%/-]+$')
    or p_bound_by_id is null
    or p_bound_by_id !~ '^[a-z0-9][a-z0-9._-]{0,127}$' then
    raise exception 'testing_center_linear_pilot_result_invalid' using errcode = '22023';
  end if;
  select * into v_effect from public.testing_center_effect_outbox
  where effect_id = p_effect_id for update;
  if not found or v_effect.effect_type <> 'linear_issue_create'
    or v_effect.state <> 'claimed'
    or v_effect.lease_owner is distinct from p_worker_id
    or v_effect.fencing_token is distinct from p_fencing_token
    or v_effect.lease_expires_at <= now() then
    raise exception 'testing_center_linear_lease_lost' using errcode = '55000';
  end if;
  select * into v_snapshot from public.testing_center_linear_projection_snapshots
  where effect_id = p_effect_id for update;
  if not found or v_snapshot.projection_digest is distinct from p_projection_digest
    or v_snapshot.sanitized_projection is null then
    raise exception 'testing_center_linear_projection_integrity_invalid'
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.testing_center_issue_destinations destination
    where destination.technical_issue_id = v_effect.technical_issue_id
      and destination.destination = 'linear'
      and destination.active_effect_id = v_effect.effect_id
      and destination.decision_state = 'selected'
  ) then
    raise exception 'testing_center_linear_effect_not_selected' using errcode = '55000';
  end if;
  insert into public.testing_center_linear_issue_bindings(
    external_issue_id, organization_id, technical_issue_id, effect_id,
    bound_by_id, external_identifier, external_url, projection_digest
  ) values (
    p_external_issue_id, p_organization_id, v_effect.technical_issue_id,
    v_effect.effect_id, p_bound_by_id, p_external_identifier, p_external_url,
    p_projection_digest
  );
  insert into public.testing_center_linear_reconciliations(
    technical_issue_id, effect_id, external_issue_id, observed_state
  ) values (
    v_effect.technical_issue_id, v_effect.effect_id, p_external_issue_id,
    'linear_created'
  );
  update public.testing_center_effect_outbox
  set state = 'completed', lease_token = null, lease_expires_at = null,
    lease_owner = null, next_attempt_at = null, last_error_code = null,
    updated_at = now()
  where effect_id = p_effect_id;
end $$;

revoke all on function public.testing_center_assert_linear_dispatch(
  text,text,bigint,text,jsonb,text,text
) from public, anon, authenticated;
grant execute on function public.testing_center_assert_linear_dispatch(
  text,text,bigint,text,jsonb,text,text
) to service_role;

revoke all on function public.testing_center_retry_linear_pilot_token(
  text,text,bigint,text
) from public, anon, authenticated;
grant execute on function public.testing_center_retry_linear_pilot_token(
  text,text,bigint,text
) to service_role;

revoke all on function public.testing_center_complete_linear_pilot(
  text,text,bigint,text,uuid,uuid,text,text,text
) from public, anon, authenticated;
grant execute on function public.testing_center_complete_linear_pilot(
  text,text,bigint,text,uuid,uuid,text,text,text
) to service_role;

comment on function public.testing_center_assert_linear_dispatch(
  text,text,bigint,text,jsonb,text,text
) is 'TAU-07I final pause, lease and projection gate immediately before Linear.';
comment on function public.testing_center_complete_linear_pilot(
  text,text,bigint,text,uuid,uuid,text,text,text
) is 'TAU-07I atomic durable binding after one externally confirmed Linear create.';

commit;
