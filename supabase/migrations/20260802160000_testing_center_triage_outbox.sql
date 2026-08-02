-- ISA-222 / TAU-05A: deterministic triage, exact-compatible deduplication and
-- one durable GitHub issue-create reservation. No network call is made here.

create table public.testing_center_triage_results (
  report_id text primary key
    references public.testing_center_reports(report_id) on delete restrict,
  triage_state text not null
    constraint testing_center_triage_results_state_check check (
      triage_state in ('incomplete', 'issue_reserved', 'duplicate_linked')
    ),
  technical_issue_id text
    references public.testing_center_technical_issues(technical_issue_id) on delete restrict,
  technical_fingerprint text
    constraint testing_center_triage_results_technical_check check (
      technical_fingerprint is null or technical_fingerprint ~ '^[0-9a-f]{64}$'
    ),
  functional_fingerprint text
    constraint testing_center_triage_results_functional_check check (
      functional_fingerprint is null or functional_fingerprint ~ '^[0-9a-f]{64}$'
    ),
  compatibility_digest text
    constraint testing_center_triage_results_compatibility_check check (
      compatibility_digest is null or compatibility_digest ~ '^[0-9a-f]{64}$'
    ),
  incomplete_reason text
    constraint testing_center_triage_results_reason_check check (
      incomplete_reason is null or incomplete_reason in ('missing_server_context')
    ),
  created_at timestamptz not null default now(),
  constraint testing_center_triage_results_shape_check check (
    (
      triage_state = 'incomplete'
      and technical_issue_id is null
      and technical_fingerprint is null
      and functional_fingerprint is null
      and compatibility_digest is null
      and incomplete_reason is not null
    )
    or (
      triage_state in ('issue_reserved', 'duplicate_linked')
      and technical_issue_id is not null
      and functional_fingerprint is not null
      and compatibility_digest is not null
      and incomplete_reason is null
    )
  )
);

create table public.testing_center_issue_occurrences (
  report_id text primary key
    references public.testing_center_reports(report_id) on delete restrict,
  technical_issue_id text not null
    references public.testing_center_technical_issues(technical_issue_id) on delete restrict,
  is_primary boolean not null,
  technical_fingerprint text
    constraint testing_center_issue_occurrences_technical_check check (
      technical_fingerprint is null or technical_fingerprint ~ '^[0-9a-f]{64}$'
    ),
  functional_fingerprint text not null
    constraint testing_center_issue_occurrences_functional_check check (
      functional_fingerprint ~ '^[0-9a-f]{64}$'
    ),
  compatibility_digest text not null
    constraint testing_center_issue_occurrences_compatibility_check check (
      compatibility_digest ~ '^[0-9a-f]{64}$'
    ),
  created_at timestamptz not null default now()
);

create unique index testing_center_issue_occurrences_one_primary_idx
  on public.testing_center_issue_occurrences(technical_issue_id)
  where is_primary;
create index testing_center_issue_occurrences_technical_idx
  on public.testing_center_issue_occurrences(technical_fingerprint, created_at)
  where technical_fingerprint is not null;
create index testing_center_issue_occurrences_functional_idx
  on public.testing_center_issue_occurrences(
    functional_fingerprint, compatibility_digest, created_at
  );

create table public.testing_center_effect_outbox (
  effect_id text primary key
    constraint testing_center_effect_outbox_id_check check (
      effect_id ~ '^effect_[0-9a-f]{64}$'
    ),
  effect_key text not null unique
    constraint testing_center_effect_outbox_key_check check (
      effect_key ~ '^github_issue_create:[a-z0-9_]{1,255}$'
    ),
  effect_type text not null default 'github_issue_create'
    constraint testing_center_effect_outbox_type_check check (
      effect_type = 'github_issue_create'
    ),
  technical_issue_id text not null unique
    references public.testing_center_technical_issues(technical_issue_id) on delete restrict,
  primary_report_id text not null unique
    references public.testing_center_reports(report_id) on delete restrict,
  state text not null default 'pending'
    constraint testing_center_effect_outbox_state_check check (
      state in ('pending', 'claimed', 'completed', 'failed')
    ),
  attempt_count smallint not null default 0
    constraint testing_center_effect_outbox_attempt_check check (
      attempt_count between 0 and 5
    ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint testing_center_effect_outbox_pending_shape_check check (
    state <> 'pending' or attempt_count = 0
  )
);

create index testing_center_effect_outbox_pending_idx
  on public.testing_center_effect_outbox(created_at)
  where state = 'pending';

alter table public.testing_center_triage_results enable row level security;
alter table public.testing_center_triage_results force row level security;
alter table public.testing_center_issue_occurrences enable row level security;
alter table public.testing_center_issue_occurrences force row level security;
alter table public.testing_center_effect_outbox enable row level security;
alter table public.testing_center_effect_outbox force row level security;

revoke all on table public.testing_center_triage_results,
  public.testing_center_issue_occurrences,
  public.testing_center_effect_outbox
from public, anon, authenticated;

grant select, insert, update, delete on table
  public.testing_center_triage_results,
  public.testing_center_issue_occurrences,
  public.testing_center_effect_outbox
to service_role;

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

    select outbox.effect_id into v_effect_id
    from public.testing_center_effect_outbox as outbox
    where outbox.technical_issue_id = v_existing.technical_issue_id;

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
        pg_catalog.convert_to('github-issue-create:' || v_issue_id, 'UTF8'),
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
      v_effect_id, 'github_issue_create:' || v_issue_id,
      'github_issue_create', v_issue_id, p_report_id,
      'pending', 0, v_created_at, v_created_at
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

  select outbox.effect_id into v_effect_id
  from public.testing_center_effect_outbox as outbox
  where outbox.technical_issue_id = v_issue_id;

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

comment on table public.testing_center_triage_results is
  'TAU-05A immutable report triage decision and exact fingerprints.';
comment on table public.testing_center_issue_occurrences is
  'TAU-05A report occurrences linked only by exact-compatible fingerprints.';
comment on table public.testing_center_effect_outbox is
  'TAU-05A durable exactly-once reservation; no external GitHub call is made by this migration.';
comment on function public.testing_center_triage_report(text) is
  'TAU-05A server-only completeness, exact-compatible dedupe and GitHub issue-create reservation.';
