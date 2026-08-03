-- ISA-239 / TAU-07E: Linear projection and durable dry-run outbox.
-- No network call, credential, webhook or client-facing grant is added.

begin;

lock table public.testing_center_pauses in share row exclusive mode;
lock table public.testing_center_effect_outbox in access exclusive mode;

do $$
begin
  if exists (select 1 from public.testing_center_effect_outbox)
    and not exists (
      select 1 from public.testing_center_pauses
      where scope = 'global' and is_paused
    ) then
    raise exception 'testing_center_linear_cutover_requires_global_pause'
      using errcode = '55000';
  end if;
  if exists (
    select 1 from public.testing_center_effect_outbox
    where effect_type = 'github_issue_create' and state = 'claimed'
  ) then
    raise exception 'testing_center_linear_cutover_claimed_github_effect'
      using errcode = '55000';
  end if;
end $$;


revoke all on function public.testing_center_claim_github_effect(text,uuid,integer)
  from public, anon, authenticated, service_role;
revoke all on function public.testing_center_assert_github_effect_unpaused(text,uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.testing_center_complete_github_effect(text,uuid,bigint,text)
  from public, anon, authenticated, service_role;
revoke all on function public.testing_center_fail_github_effect(text,uuid,text)
  from public, anon, authenticated, service_role;
revoke all on function public.testing_center_reconcile_github_effect(text,bigint,text)
  from public, anon, authenticated, service_role;
revoke all on function public.testing_center_triage_report(text)
  from public, anon, authenticated, service_role;

create table public.testing_center_linear_migration_metadata(
  metadata_key text primary key,
  metadata_value text not null
);
insert into public.testing_center_linear_migration_metadata
values (
  'legacy_triage_function',
  pg_catalog.pg_get_functiondef('public.testing_center_triage_report(text)'::regprocedure)
);

alter table public.testing_center_effect_outbox
  drop constraint testing_center_effect_outbox_key_check,
  drop constraint testing_center_effect_outbox_type_check,
  drop constraint testing_center_effect_outbox_state_check,
  drop constraint testing_center_effect_outbox_technical_issue_id_key,
  drop constraint testing_center_effect_outbox_primary_report_id_key,
  add column lease_owner text,
  add column fencing_token bigint not null default 0,
  add constraint testing_center_effect_outbox_key_check check (
    effect_key ~ '^(github|linear)_issue_create:[a-z0-9_]{1,255}$'
  ),
  add constraint testing_center_effect_outbox_type_check check (
    effect_type in ('github_issue_create', 'linear_issue_create')
  ),
  add constraint testing_center_effect_outbox_state_check check (
    state in ('pending', 'claimed', 'completed', 'failed', 'superseded',
      'dry_run_completed', 'needs_owner')
  ),
  add constraint testing_center_effect_outbox_lease_owner_check check (
    (state = 'claimed' and lease_owner is not null and lease_owner <> ''
      and lease_owner !~ '^[[:space:]]|[[:space:]]$'
      and octet_length(lease_owner) <= 128)
    or (state <> 'claimed' and lease_owner is null)
  ),
  add constraint testing_center_effect_outbox_fencing_check check (fencing_token >= 0),
  add constraint testing_center_effect_outbox_issue_type_key
    unique(technical_issue_id, effect_type);

create table public.testing_center_build_identities (
  build_identity_id text primary key check (build_identity_id ~ '^build_[0-9a-f]{64}$'),
  channel text not null check (channel in ('nightly', 'testers')),
  app_version text not null check (
    app_version ~ '^[A-Za-z0-9][A-Za-z0-9._+-]{0,31}$'
  ),
  candidate_sha text not null check (candidate_sha ~ '^[0-9a-f]{40}$'),
  active boolean not null default true,
  registered_by_id text not null check (
    registered_by_id <> '' and registered_by_id !~ '^[[:space:]]|[[:space:]]$'
      and octet_length(registered_by_id) <= 128
  ),
  created_at timestamptz not null default now()
);
create index testing_center_build_identities_lookup_idx
  on public.testing_center_build_identities(channel, app_version) where active;

create table public.testing_center_issue_destinations (
  technical_issue_id text primary key
    references public.testing_center_technical_issues(technical_issue_id) on delete restrict,
  destination text not null check (destination in ('linear', 'github_legacy')),
  active_effect_id text not null unique
    references public.testing_center_effect_outbox(effect_id) on delete restrict,
  decision_state text not null default 'selected'
    check (decision_state in ('selected', 'needs_owner')),
  decision_reason text check (
    (decision_state = 'selected' and decision_reason is null)
    or (decision_state = 'needs_owner' and decision_reason in (
      'legacy_github_completed', 'linear_build_identity_missing',
      'linear_build_identity_ambiguous', 'linear_response_ambiguous'
    ))
  ),
  selected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.testing_center_effect_supersessions(
  legacy_effect_id text primary key
    references public.testing_center_effect_outbox(effect_id) on delete restrict,
  superseded_by_effect_id text not null unique
    references public.testing_center_effect_outbox(effect_id) on delete restrict,
  prior_state text not null check (prior_state in ('pending', 'failed')),
  prior_attempt_count smallint not null,
  prior_last_error_code text,
  prior_next_attempt_at timestamptz,
  prior_lease_token uuid,
  prior_lease_expires_at timestamptz,
  prior_updated_at timestamptz not null,
  superseded_at timestamptz not null default now()
);

create table public.testing_center_linear_projection_snapshots (
  effect_id text primary key
    references public.testing_center_effect_outbox(effect_id) on delete restrict,
  technical_issue_id text not null unique
    references public.testing_center_technical_issues(technical_issue_id) on delete restrict,
  primary_report_id text not null
    references public.testing_center_reports(report_id) on delete restrict,
  source_snapshot jsonb not null,
  source_digest text not null check (source_digest ~ '^[0-9a-f]{64}$'),
  sanitized_projection jsonb,
  projection_digest text check (
    projection_digest is null or projection_digest ~ '^[0-9a-f]{64}$'
  ),
  marker text not null unique,
  occurrence_count bigint not null check (occurrence_count between 1 and 1000000),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint testing_center_linear_snapshot_projection_shape check (
    (sanitized_projection is null and projection_digest is null and completed_at is null)
    or (sanitized_projection is not null and projection_digest is not null
      and completed_at is not null)
  )
);

alter table public.testing_center_linear_migration_metadata enable row level security;
alter table public.testing_center_linear_migration_metadata force row level security;
alter table public.testing_center_build_identities enable row level security;
alter table public.testing_center_build_identities force row level security;
alter table public.testing_center_issue_destinations enable row level security;
alter table public.testing_center_issue_destinations force row level security;
alter table public.testing_center_effect_supersessions enable row level security;
alter table public.testing_center_effect_supersessions force row level security;
alter table public.testing_center_linear_projection_snapshots enable row level security;
alter table public.testing_center_linear_projection_snapshots force row level security;
revoke all on table public.testing_center_linear_migration_metadata,
  public.testing_center_build_identities,
  public.testing_center_issue_destinations,
  public.testing_center_effect_supersessions,
  public.testing_center_linear_projection_snapshots,
  public.testing_center_effect_outbox
from public, anon, authenticated, service_role;
grant select on table public.testing_center_build_identities,
  public.testing_center_issue_destinations,
  public.testing_center_effect_supersessions,
  public.testing_center_linear_projection_snapshots,
  public.testing_center_effect_outbox to service_role;
grant select, insert, update, delete on table public.testing_center_build_identities
to service_role;

create function public.testing_center_validate_issue_destination()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_effect public.testing_center_effect_outbox%rowtype;
begin
  select * into v_effect from public.testing_center_effect_outbox
  where effect_id = new.active_effect_id;
  if not found or v_effect.technical_issue_id <> new.technical_issue_id then
    raise exception 'testing_center_destination_effect_mismatch' using errcode = '23514';
  end if;
  if new.destination = 'linear'
    and (v_effect.effect_type <> 'linear_issue_create' or v_effect.state = 'superseded') then
    raise exception 'testing_center_destination_linear_invalid' using errcode = '23514';
  end if;
  if new.destination = 'github_legacy'
    and (v_effect.effect_type <> 'github_issue_create' or v_effect.state <> 'completed') then
    raise exception 'testing_center_destination_github_legacy_invalid' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger testing_center_issue_destinations_validate
before insert or update on public.testing_center_issue_destinations
for each row execute function public.testing_center_validate_issue_destination();

create function public.testing_center_enforce_selected_effect()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.state <> 'superseded' and not exists (
    select 1 from public.testing_center_issue_destinations
    where technical_issue_id = new.technical_issue_id
      and active_effect_id = new.effect_id
  ) then
    raise exception 'testing_center_effect_has_no_selected_destination' using errcode = '23514';
  end if;
  return null;
end $$;
create constraint trigger testing_center_effect_outbox_selected_destination
after insert or update on public.testing_center_effect_outbox
deferrable initially deferred
for each row execute function public.testing_center_enforce_selected_effect();

insert into public.testing_center_effect_outbox(
  effect_id, effect_key, effect_type, technical_issue_id, primary_report_id,
  state, attempt_count, fencing_token, created_at, updated_at
)
select
  'effect_' || encode(public.digest(convert_to(
    'linear-issue-create:' || legacy.technical_issue_id, 'UTF8'
  ), 'sha256'), 'hex'),
  'linear_issue_create:' || legacy.technical_issue_id,
  'linear_issue_create', legacy.technical_issue_id, legacy.primary_report_id,
  'pending', 0, 0, now(), now()
from public.testing_center_effect_outbox legacy
where legacy.effect_type = 'github_issue_create'
  and legacy.state in ('pending', 'failed');

insert into public.testing_center_effect_supersessions(
  legacy_effect_id, superseded_by_effect_id, prior_state, prior_attempt_count,
  prior_last_error_code, prior_next_attempt_at, prior_lease_token,
  prior_lease_expires_at, prior_updated_at
)
select legacy.effect_id, linear.effect_id, legacy.state, legacy.attempt_count,
  legacy.last_error_code, legacy.next_attempt_at, legacy.lease_token,
  legacy.lease_expires_at, legacy.updated_at
from public.testing_center_effect_outbox legacy
join public.testing_center_effect_outbox linear
  on linear.technical_issue_id = legacy.technical_issue_id
  and linear.effect_type = 'linear_issue_create'
where legacy.effect_type = 'github_issue_create'
  and legacy.state in ('pending', 'failed');

update public.testing_center_effect_outbox
set state = 'superseded', updated_at = now()
where effect_type = 'github_issue_create' and state in ('pending', 'failed');

insert into public.testing_center_issue_destinations(
  technical_issue_id, destination, active_effect_id,
  decision_state, decision_reason
)
select technical_issue_id, 'github_legacy', effect_id,
  'needs_owner', 'legacy_github_completed'
from public.testing_center_effect_outbox
where effect_type = 'github_issue_create' and state = 'completed';

insert into public.testing_center_issue_destinations(
  technical_issue_id, destination, active_effect_id,
  decision_state, decision_reason
)
select technical_issue_id, 'linear', effect_id, 'selected', null
from public.testing_center_effect_outbox
where effect_type = 'linear_issue_create';

create or replace function public.testing_center_triage_report(p_report_id text)
returns table(
  result_report_id text,
  result_triage_state text,
  result_technical_issue_id text,
  result_technical_fingerprint text,
  result_functional_fingerprint text,
  result_effect_id text,
  result_idempotent boolean,
  result_occurrence_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.testing_center_reports%rowtype;
  v_payload public.testing_center_report_payloads%rowtype;
  v_existing public.testing_center_triage_results%rowtype;
  v_issue_id text;
  v_technical_fingerprint text;
  v_functional_fingerprint text;
  v_compatibility_digest text;
  v_effect_id text;
  v_version_family text;
  v_action_normalized text;
  v_expected_normalized text;
  v_observed_normalized text;
  v_technical_signature jsonb;
  v_created_at timestamptz := pg_catalog.now();
  v_occurrence_count bigint;
begin
  if p_report_id is null
    or p_report_id = ''
    or p_report_id ~ '^[[:space:]]|[[:space:]]$'
    or pg_catalog.octet_length(p_report_id) > 256 then
    raise exception 'testing_center_report_id_invalid' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('testing-center-triage-report:' || p_report_id, 0)
  );

  select report.* into v_report
  from public.testing_center_reports as report
  where report.report_id = p_report_id
  for update;

  if not found then
    raise exception 'testing_center_report_not_found' using errcode = 'P0002';
  end if;

  select triage.* into v_existing
  from public.testing_center_triage_results as triage
  where triage.report_id = p_report_id;

  if found then
    select count(*) into v_occurrence_count
    from public.testing_center_issue_occurrences as occurrence
    where occurrence.technical_issue_id = v_existing.technical_issue_id;

    select destination.active_effect_id into v_effect_id
    from public.testing_center_issue_destinations as destination
    where destination.technical_issue_id = v_existing.technical_issue_id;

    return query select
      p_report_id,
      v_existing.triage_state,
      v_existing.technical_issue_id,
      v_existing.technical_fingerprint,
      v_existing.functional_fingerprint,
      v_effect_id,
      true,
      coalesce(v_occurrence_count, 0);
    return;
  end if;

  if v_report.state <> 'submitted' then
    raise exception 'testing_center_report_not_submitted' using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.testing_center_pauses as pause
    where pause.scope = 'global' and pause.is_paused
  ) then
    raise exception 'testing_center_paused' using errcode = '55000';
  end if;

  select payload.* into v_payload
  from public.testing_center_report_payloads as payload
  where payload.report_id = p_report_id;

  if not found or not exists (
    select 1
    from public.testing_center_report_events as event
    where event.report_id = p_report_id and event.event_type = 'submitted'
  ) then
    update public.testing_center_reports
    set state = 'incomplete', updated_at = v_created_at
    where report_id = p_report_id;

    insert into public.testing_center_triage_results (
      report_id, triage_state, incomplete_reason, created_at
    ) values (
      p_report_id, 'incomplete', 'missing_server_context', v_created_at
    );

    return query select
      p_report_id, 'incomplete'::text, null::text, null::text, null::text,
      null::text, false, 0::bigint;
    return;
  end if;

  v_action_normalized := pg_catalog.lower(
    pg_catalog.regexp_replace(pg_catalog.btrim(v_payload.action_text), '[[:space:]]+', ' ', 'g')
  );
  v_expected_normalized := pg_catalog.lower(
    pg_catalog.regexp_replace(pg_catalog.btrim(v_payload.expected_text), '[[:space:]]+', ' ', 'g')
  );
  v_observed_normalized := pg_catalog.lower(
    pg_catalog.regexp_replace(pg_catalog.btrim(v_payload.observed_text), '[[:space:]]+', ' ', 'g')
  );
  v_version_family := coalesce(
    pg_catalog.substring(v_payload.app_version, '([0-9]+[.][0-9]+)'),
    pg_catalog.lower(v_payload.app_version)
  );

  v_functional_fingerprint := pg_catalog.encode(
    public.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'action', v_action_normalized,
          'module', v_payload.module,
          'versionFamily', v_version_family
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
  v_compatibility_digest := pg_catalog.encode(
    public.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'expected', v_expected_normalized,
          'observed', v_observed_normalized
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  if v_payload.include_diagnostic
    and nullif(v_payload.diagnostic_document->>'errorCode', '') is not null
    and v_payload.diagnostic_document->>'errorCode' not in (
      'tester.report', 'unknown', 'none'
    ) then
    select pg_catalog.jsonb_build_object(
      'channel', v_report.channel,
      'errorCode', v_payload.diagnostic_document->>'errorCode',
      'logCodes', coalesce(
        (
          select pg_catalog.jsonb_agg(code_key order by code_key)
          from (
            select distinct (item->>'source') || ':' || (item->>'code') as code_key
            from pg_catalog.jsonb_array_elements(v_payload.diagnostic_document->'logs') as item
            where item->>'level' in ('warn', 'error')
          ) as stable_codes
        ),
        '[]'::jsonb
      ),
      'module', v_payload.module
    ) into v_technical_signature;

    v_technical_fingerprint := pg_catalog.encode(
      public.digest(
        pg_catalog.convert_to(v_technical_signature::text, 'UTF8'),
        'sha256'
      ),
      'hex'
    );
  end if;

  -- The functional lock is always taken. It serializes diagnostic and
  -- non-diagnostic reports that may still be exact-compatible.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'testing-center-functional:' || v_functional_fingerprint || ':' || v_compatibility_digest,
      0
    )
  );
  if v_technical_fingerprint is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'testing-center-technical:' || v_technical_fingerprint,
        0
      )
    );
  end if;

  select issue.technical_issue_id into v_issue_id
  from public.testing_center_technical_issues as issue
  join public.testing_center_issue_occurrences as compatible_occurrence
    on compatible_occurrence.technical_issue_id = issue.technical_issue_id
  where issue.state = 'open'
    and (
      (
        v_technical_fingerprint is not null
        and compatible_occurrence.technical_fingerprint = v_technical_fingerprint
      )
      or (
        compatible_occurrence.functional_fingerprint = v_functional_fingerprint
        and compatible_occurrence.compatibility_digest = v_compatibility_digest
      )
    )
  order by
    case
      when v_technical_fingerprint is not null
        and compatible_occurrence.technical_fingerprint = v_technical_fingerprint
      then 0 else 1
    end,
    compatible_occurrence.created_at,
    issue.technical_issue_id
  limit 1
  for update of issue;

  if v_issue_id is not null and exists (
    select 1
    from public.testing_center_pauses as pause
    where pause.scope = 'flow'
      and pause.technical_issue_id = v_issue_id
      and pause.is_paused
  ) then
    raise exception 'testing_center_paused' using errcode = '55000';
  end if;

  if v_issue_id is null then
    v_issue_id := 'issue_' || pg_catalog.encode(
      public.digest(
        pg_catalog.convert_to('testing-center-issue:' || p_report_id, 'UTF8'),
        'sha256'
      ),
      'hex'
    );
    v_effect_id := 'effect_' || pg_catalog.encode(
      public.digest(
        pg_catalog.convert_to('linear-issue-create:' || v_issue_id, 'UTF8'),
        'sha256'
      ),
      'hex'
    );

    insert into public.testing_center_technical_issues (
      contract_version, technical_issue_id, report_id, state, flow_state,
      origin, retry_count, created_at, updated_at
    ) values (
      'testing-center.v1', v_issue_id, p_report_id, 'open', 'reported',
      'orchestrator', 0, v_created_at, v_created_at
    );

    insert into public.testing_center_issue_occurrences (
      report_id, technical_issue_id, is_primary, technical_fingerprint,
      functional_fingerprint, compatibility_digest, created_at
    ) values (
      p_report_id, v_issue_id, true, v_technical_fingerprint,
      v_functional_fingerprint, v_compatibility_digest, v_created_at
    );

    insert into public.testing_center_effect_outbox (
      effect_id, effect_key, effect_type, technical_issue_id,
      primary_report_id, state, attempt_count, created_at, updated_at
    ) values (
      v_effect_id, 'linear_issue_create:' || v_issue_id,
      'linear_issue_create', v_issue_id, p_report_id,
      'pending', 0, v_created_at, v_created_at
    );

    insert into public.testing_center_issue_destinations (
      technical_issue_id, destination, active_effect_id,
      decision_state, decision_reason, selected_at
    ) values (
      v_issue_id, 'linear', v_effect_id, 'selected', null, v_created_at
    );

    insert into public.testing_center_triage_results (
      report_id, triage_state, technical_issue_id, technical_fingerprint,
      functional_fingerprint, compatibility_digest, created_at
    ) values (
      p_report_id, 'issue_reserved', v_issue_id, v_technical_fingerprint,
      v_functional_fingerprint, v_compatibility_digest, v_created_at
    );

    update public.testing_center_reports
    set state = 'validated', updated_at = v_created_at
    where report_id = p_report_id;

    return query select
      p_report_id, 'issue_reserved'::text, v_issue_id,
      v_technical_fingerprint, v_functional_fingerprint, v_effect_id,
      false, 1::bigint;
    return;
  end if;

  insert into public.testing_center_issue_occurrences (
    report_id, technical_issue_id, is_primary, technical_fingerprint,
    functional_fingerprint, compatibility_digest, created_at
  ) values (
    p_report_id, v_issue_id, false, v_technical_fingerprint,
    v_functional_fingerprint, v_compatibility_digest, v_created_at
  );

  insert into public.testing_center_triage_results (
    report_id, triage_state, technical_issue_id, technical_fingerprint,
    functional_fingerprint, compatibility_digest, created_at
  ) values (
    p_report_id, 'duplicate_linked', v_issue_id, v_technical_fingerprint,
    v_functional_fingerprint, v_compatibility_digest, v_created_at
  );

  update public.testing_center_reports
  set state = 'duplicate_linked', updated_at = v_created_at
  where report_id = p_report_id;

  select count(*) into v_occurrence_count
  from public.testing_center_issue_occurrences as occurrence
  where occurrence.technical_issue_id = v_issue_id;

  select destination.active_effect_id into v_effect_id
  from public.testing_center_issue_destinations as destination
  where destination.technical_issue_id = v_issue_id;

  return query select
    p_report_id, 'duplicate_linked'::text, v_issue_id,
    v_technical_fingerprint, v_functional_fingerprint, v_effect_id,
    false, v_occurrence_count;
end;
$$;

revoke all on function public.testing_center_triage_report(text)
from public, anon, authenticated;
grant execute on function public.testing_center_triage_report(text)
to service_role;



create function public.testing_center_prepare_linear_projection(p_effect_id text)
returns table(
  preparation_status text,
  prepared_source_snapshot jsonb,
  prepared_source_digest text,
  prepared_occurrence_count bigint,
  prepared_marker text
)
language plpgsql security definer set search_path = '' as $$
declare
  v_effect public.testing_center_effect_outbox%rowtype;
  v_existing public.testing_center_linear_projection_snapshots%rowtype;
  v_payload public.testing_center_report_payloads%rowtype;
  v_report public.testing_center_reports%rowtype;
  v_build_count integer;
  v_sha text;
  v_count bigint;
  v_source jsonb;
  v_digest text;
  v_marker text;
  v_reason text;
begin
  lock table public.testing_center_pauses in share mode;
  select * into v_effect from public.testing_center_effect_outbox
  where effect_id = p_effect_id for update;
  if not found or v_effect.effect_type <> 'linear_issue_create' then
    raise exception 'testing_center_linear_effect_not_found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.testing_center_issue_destinations
    where technical_issue_id = v_effect.technical_issue_id
      and destination = 'linear' and active_effect_id = v_effect.effect_id
  ) then
    raise exception 'testing_center_linear_effect_not_selected' using errcode = '55000';
  end if;
  select * into v_existing from public.testing_center_linear_projection_snapshots
  where effect_id = p_effect_id;
  if found then
    return query select 'prepared'::text, v_existing.source_snapshot,
      v_existing.source_digest, v_existing.occurrence_count, v_existing.marker;
    return;
  end if;
  if v_effect.state = 'needs_owner' then
    return query select 'needs_owner'::text, null::jsonb, null::text,
      null::bigint, null::text;
    return;
  end if;
  if v_effect.state not in ('pending', 'failed') then
    raise exception 'testing_center_linear_effect_not_preparable' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.testing_center_pauses pause
    where pause.is_paused and (pause.scope = 'global'
      or (pause.scope = 'flow' and pause.technical_issue_id = v_effect.technical_issue_id))
  ) then
    return query select 'paused'::text, null::jsonb, null::text,
      null::bigint, null::text;
    return;
  end if;
  select * into strict v_report from public.testing_center_reports
  where report_id = v_effect.primary_report_id;
  select * into strict v_payload from public.testing_center_report_payloads
  where report_id = v_effect.primary_report_id;
  select count(*), min(candidate_sha) into v_build_count, v_sha
  from public.testing_center_build_identities
  where channel = v_report.channel and app_version = v_payload.app_version and active;
  if v_build_count <> 1 then
    v_reason := case when v_build_count = 0
      then 'linear_build_identity_missing' else 'linear_build_identity_ambiguous' end;
    update public.testing_center_effect_outbox
    set state = 'needs_owner', lease_token = null, lease_expires_at = null,
      lease_owner = null, next_attempt_at = null, last_error_code = v_reason,
      updated_at = now()
    where effect_id = p_effect_id;
    update public.testing_center_issue_destinations
    set decision_state = 'needs_owner', decision_reason = v_reason, updated_at = now()
    where technical_issue_id = v_effect.technical_issue_id;
    return query select 'needs_owner'::text, null::jsonb, null::text,
      null::bigint, null::text;
    return;
  end if;
  select count(*) into v_count from public.testing_center_issue_occurrences
  where technical_issue_id = v_effect.technical_issue_id;
  if v_count < 1 then
    raise exception 'testing_center_linear_occurrence_missing' using errcode = '55000';
  end if;
  v_marker := '<!-- vantare-testing-center:linear:v1 effect=' || v_effect.effect_id
    || ' issue=' || v_effect.technical_issue_id || ' -->';
  v_source := pg_catalog.jsonb_build_object(
    'contractVersion', 'testing-center.linear-issue.v1',
    'effectId', v_effect.effect_id,
    'technicalIssueId', v_effect.technical_issue_id,
    'occurrenceCount', v_count,
    'replayAvailable', false,
    'report', pg_catalog.jsonb_build_object(
      'reportId', v_report.report_id,
      'channel', v_report.channel,
      'appVersion', v_payload.app_version,
      'osFamily', v_payload.os_family,
      'osVersion', v_payload.os_version,
      'module', v_payload.module,
      'actionText', v_payload.action_text,
      'expectedText', v_payload.expected_text,
      'observedText', v_payload.observed_text,
      'contextText', v_payload.context_text,
      'errorCode', case when v_payload.include_diagnostic
        and nullif(v_payload.diagnostic_document->>'errorCode','') is not null
        and v_payload.diagnostic_document->>'errorCode' not in ('tester.report','unknown','none')
        then v_payload.diagnostic_document->>'errorCode' else null end,
      'candidateSha', v_sha
    )
  );
  v_digest := pg_catalog.encode(public.digest(
    pg_catalog.convert_to(v_source::text, 'UTF8'), 'sha256'), 'hex');
  insert into public.testing_center_linear_projection_snapshots(
    effect_id, technical_issue_id, primary_report_id, source_snapshot,
    source_digest, marker, occurrence_count
  ) values (
    p_effect_id, v_effect.technical_issue_id, v_effect.primary_report_id,
    v_source, v_digest, v_marker, v_count
  );
  return query select 'prepared'::text, v_source, v_digest, v_count, v_marker;
end $$;

create function public.testing_center_claim_linear_effect(
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
  if v_effect.state = 'dry_run_completed' then claim_status := 'dry_run_completed';
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

create function public.testing_center_complete_linear_dry_run(
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
  set sanitized_projection = p_projection, projection_digest = p_projection_digest,
    completed_at = now()
  where effect_id = p_effect_id and sanitized_projection is null;
  if not found then
    raise exception 'testing_center_linear_projection_already_completed' using errcode = '55000';
  end if;
  update public.testing_center_effect_outbox
  set state = 'dry_run_completed', lease_token = null, lease_expires_at = null,
    lease_owner = null, next_attempt_at = null, last_error_code = null,
    updated_at = now()
  where effect_id = p_effect_id;
end $$;

create function public.testing_center_fail_linear_effect(
  p_effect_id text,
  p_worker_id text,
  p_fencing_token bigint,
  p_error_code text
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_error_code not in ('linear_transport_unavailable','linear_store_rejected') then
    raise exception 'testing_center_linear_retry_error_invalid' using errcode = '22023';
  end if;
  update public.testing_center_effect_outbox
  set state = 'failed', lease_token = null, lease_expires_at = null,
    lease_owner = null,
    next_attempt_at = now() + pg_catalog.make_interval(
      secs => pg_catalog.least(300,
        5 * (2 ^ pg_catalog.greatest(attempt_count - 1,0))::integer)),
    last_error_code = p_error_code, updated_at = now()
  where effect_id = p_effect_id and effect_type = 'linear_issue_create'
    and state = 'claimed' and lease_owner = p_worker_id
    and fencing_token = p_fencing_token and lease_expires_at > now();
  if not found then
    raise exception 'testing_center_linear_lease_lost' using errcode = '55000';
  end if;
end $$;

create function public.testing_center_record_linear_ambiguity(
  p_effect_id text,
  p_worker_id text,
  p_fencing_token bigint
)
returns void language plpgsql security definer set search_path = '' as $$
declare v_issue_id text;
begin
  update public.testing_center_effect_outbox
  set state = 'needs_owner', lease_token = null, lease_expires_at = null,
    lease_owner = null, next_attempt_at = null,
    last_error_code = 'linear_response_ambiguous', updated_at = now()
  where effect_id = p_effect_id and effect_type = 'linear_issue_create'
    and state = 'claimed' and lease_owner = p_worker_id
    and fencing_token = p_fencing_token and lease_expires_at > now()
  returning technical_issue_id into v_issue_id;
  if not found then
    raise exception 'testing_center_linear_lease_lost' using errcode = '55000';
  end if;
  update public.testing_center_issue_destinations
  set decision_state = 'needs_owner', decision_reason = 'linear_response_ambiguous',
    updated_at = now()
  where technical_issue_id = v_issue_id and destination = 'linear'
    and active_effect_id = p_effect_id;
end $$;

do $$ declare v_signature text; begin
  foreach v_signature in array array[
    'testing_center_prepare_linear_projection(text)',
    'testing_center_claim_linear_effect(text,text,integer)',
    'testing_center_complete_linear_dry_run(text,text,bigint,text,jsonb,text,text)',
    'testing_center_fail_linear_effect(text,text,bigint,text)',
    'testing_center_record_linear_ambiguity(text,text,bigint)',
    'testing_center_triage_report(text)'
  ] loop
    execute 'revoke all on function public.' || v_signature
      || ' from public, anon, authenticated';
    execute 'grant execute on function public.' || v_signature || ' to service_role';
  end loop;
end $$;

revoke all on function public.testing_center_validate_issue_destination()
from public, anon, authenticated, service_role;
revoke all on function public.testing_center_enforce_selected_effect()
from public, anon, authenticated, service_role;

comment on table public.testing_center_issue_destinations is
  'TAU-07E durable single destination per technical issue, including terminal effects.';
comment on table public.testing_center_effect_supersessions is
  'TAU-07E exact reversible snapshot of superseded inert GitHub effects.';
comment on table public.testing_center_build_identities is
  'TAU-07E server-only channel and app-version to exact candidate SHA registry.';
comment on table public.testing_center_linear_projection_snapshots is
  'TAU-07E durable canonical source and sanitized Linear dry-run projection.';
comment on function public.testing_center_triage_report(text) is
  'TAU-07E explicit Linear reservation with deterministic exact-compatible triage.';

commit;
