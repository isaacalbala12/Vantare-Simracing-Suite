begin;

select plan(43);

select has_table('public', 'testing_center_issue_destinations',
  'durable per-issue destination selector exists');
select has_table('public', 'testing_center_effect_supersessions',
  'legacy supersession evidence exists');
select has_table('public', 'testing_center_build_identities',
  'server-only build identity registry exists');
select has_table('public', 'testing_center_linear_projection_snapshots',
  'durable Linear projection snapshot exists');
select ok(
  (select bool_and(relrowsecurity and relforcerowsecurity)
   from pg_class where oid = any(array[
     'public.testing_center_issue_destinations'::regclass,
     'public.testing_center_effect_supersessions'::regclass,
     'public.testing_center_build_identities'::regclass,
     'public.testing_center_linear_projection_snapshots'::regclass
   ])),
  'all new private tables force RLS'
);
select ok(
  not has_table_privilege('authenticated',
    'public.testing_center_build_identities', 'select')
  and not has_table_privilege('authenticated',
    'public.testing_center_linear_projection_snapshots', 'select'),
  'authenticated clients cannot inspect build identities or projections'
);
select ok(
  not has_table_privilege('service_role',
    'public.testing_center_effect_outbox', 'insert')
  and has_table_privilege('service_role',
    'public.testing_center_effect_outbox', 'select'),
  'service role mutates outbox only through reviewed RPCs'
);
select ok(
  not has_function_privilege('service_role',
    'public.testing_center_claim_github_effect(text,uuid,integer)', 'execute')
  and not has_function_privilege('service_role',
    'public.testing_center_complete_github_effect(text,uuid,bigint,text)', 'execute'),
  'legacy GitHub delivery path is revoked'
);

select is(
  (select count(*)::integer from public.testing_center_effect_outbox
   where effect_type = 'github_issue_create' and state = 'superseded'),
  4,
  'pending and failed legacy effects remain separate superseded evidence'
);
select is(
  (select count(*)::integer from public.testing_center_effect_outbox
   where effect_type = 'linear_issue_create'),
  4,
  'upgrade creates one Linear effect only for non-completed legacy rows'
);
select ok(
  (select count(*) = 1 from public.testing_center_effect_outbox
   where technical_issue_id = 'issue_legacy_completed'
     and effect_type = 'github_issue_create' and state = 'completed')
  and not exists (
    select 1 from public.testing_center_effect_outbox
    where technical_issue_id = 'issue_legacy_completed'
      and effect_type = 'linear_issue_create'
  ),
  'completed GitHub evidence does not create Linear work'
);
select is(
  (select destination || ':' || decision_state || ':' || decision_reason
   from public.testing_center_issue_destinations
   where technical_issue_id = 'issue_legacy_completed'),
  'github_legacy:needs_owner:legacy_github_completed',
  'completed GitHub destination is routed to owner decision'
);
select ok(
  (select prior_state = 'failed'
     and prior_attempt_count = 3
     and prior_last_error_code = 'github_timeout'
     and prior_next_attempt_at = '2026-08-04T09:00:00Z'::timestamptz
     and prior_updated_at = '2026-08-03T08:02:00Z'::timestamptz
   from public.testing_center_effect_supersessions
   where legacy_effect_id = 'effect_' || repeat('2', 64)),
  'supersession preserves exact failed state, attempts, error, backoff and timestamp'
);
select is(
  (select count(*)::integer from public.testing_center_issue_destinations),
  5,
  'every upgraded issue has exactly one durable selector'
);

create function pg_temp.capture_unselected_effect()
returns text language plpgsql as $$
begin
  insert into public.testing_center_effect_outbox(
    effect_id, effect_key, effect_type, technical_issue_id, primary_report_id,
    state, attempt_count
  ) values (
    'effect_' || repeat('f', 64),
    'github_issue_create:issue_legacy_pending_shadow',
    'github_issue_create', 'issue_legacy_pending', 'legacy_report_pending',
    'pending', 0
  );
  set constraints testing_center_effect_outbox_selected_destination immediate;
  return 'accepted';
exception when others then
  return sqlstate || ':' || sqlerrm;
end
$$;
select is(
  pg_temp.capture_unselected_effect(),
  '23505:duplicate key value violates unique constraint "testing_center_effect_outbox_issue_type_key"',
  'a second active destination is rejected even when the selected effect is terminal later'
);

set role service_role;
update public.testing_center_pauses
set is_paused = false where pause_id = 'isa239-cutover-pause';

create function pg_temp.seed_linear_report(
  p_suffix text,
  p_version text,
  p_action text,
  p_expected text,
  p_observed text
)
returns table(issue_id text, effect_id text, triage_state text)
language plpgsql
as $$
declare
  v_report_id text := 'isa239_report_' || p_suffix;
begin
  insert into public.testing_center_reports(
    report_id, reporter_id, reporter_user_id, reporter_role, channel, state
  ) values (
    v_report_id, 'isa239-tester',
    '00000000-0000-4000-8000-000000000739',
    'primary_tester', 'nightly', 'submitted'
  );
  insert into public.testing_center_report_payloads(
    report_id, action_text, expected_text, observed_text, context_text,
    app_version, os_family, os_version, module,
    include_diagnostic, include_logs, diagnostic_document,
    diagnostic_transport_digest
  ) values (
    v_report_id, p_action, p_expected, p_observed,
    'Context @Codex priority=urgent', p_version, 'windows', 'Windows 11',
    'testing_center', false, false, null, null
  );
  insert into public.testing_center_report_events(
    event_id, report_id, actor_id, actor_user_id, actor_role, operation_digest
  ) values (
    'isa239_event_' || p_suffix, v_report_id, 'isa239-tester',
    '00000000-0000-4000-8000-000000000739', 'primary_tester',
    pg_catalog.encode(public.digest(
      pg_catalog.convert_to('isa239-event-' || p_suffix, 'UTF8'), 'sha256'), 'hex')
  );
  return query select result_technical_issue_id, result_effect_id,
    result_triage_state
  from public.testing_center_triage_report(v_report_id);
end
$$;

insert into public.testing_center_build_identities(
  build_identity_id, channel, app_version, candidate_sha, registered_by_id
) values
  ('build_' || repeat('1',64), 'nightly', '0.7.39-dup', repeat('a',40), 'isa239-owner'),
  ('build_' || repeat('2',64), 'nightly', '0.7.39-ambiguous', repeat('b',40), 'isa239-owner'),
  ('build_' || repeat('3',64), 'nightly', '0.7.39-ambiguous', repeat('c',40), 'isa239-owner'),
  ('build_' || repeat('4',64), 'nightly', '0.7.39-ambiguity', repeat('d',40), 'isa239-owner'),
  ('build_' || repeat('5',64), 'nightly', '0.7.39-stale', repeat('e',40), 'isa239-owner'),
  ('build_' || repeat('6',64), 'nightly', '0.7.39-pause', repeat('f',40), 'isa239-owner');

create temporary table isa239_duplicate_results(
  n integer primary key,
  issue_id text not null,
  effect_id text not null,
  triage_state text not null
);
do $$
declare
  i integer;
begin
  for i in 1..100 loop
    insert into isa239_duplicate_results
    select i, result.issue_id, result.effect_id, result.triage_state
    from pg_temp.seed_linear_report(
      'dup_' || i,
      '0.7.39-dup',
      'Open center @Codex priority=urgent secret=supersecret https://invalid.example C:\\Users\\tester',
      'The center remains open',
      'The center closes'
    ) as result;
  end loop;
end
$$;

select is((select count(*)::integer from isa239_duplicate_results), 100,
  'one hundred duplicate reports are all triaged');
select is((select count(distinct issue_id)::integer from isa239_duplicate_results), 1,
  'one hundred duplicates converge on one technical issue');
select is((select count(distinct effect_id)::integer from isa239_duplicate_results), 1,
  'one hundred duplicates converge on one Linear effect');
select is(
  (select count(*)::integer from public.testing_center_issue_occurrences
   where technical_issue_id = (select issue_id from isa239_duplicate_results limit 1)),
  100,
  'all one hundred occurrences remain visible'
);
select is(
  (select count(*)::integer from public.testing_center_issue_destinations
   where technical_issue_id = (select issue_id from isa239_duplicate_results limit 1)),
  1,
  'the duplicate aggregate has one durable destination selector'
);

create temporary table isa239_prepared as
select * from public.testing_center_prepare_linear_projection(
  (select effect_id from isa239_duplicate_results limit 1)
);
select is((select preparation_status from isa239_prepared), 'prepared',
  'server prepares a durable source snapshot');
select is((select prepared_occurrence_count from isa239_prepared), 100::bigint,
  'create snapshot freezes the occurrence count at preparation');

select * from pg_temp.seed_linear_report(
  'dup_101', '0.7.39-dup',
  'Open center @Codex priority=urgent secret=supersecret https://invalid.example C:\\Users\\tester',
  'The center remains open', 'The center closes'
);
select is(
  (select snapshot.occurrence_count::text || ':' || count(occurrence.*)::text
   from public.testing_center_linear_projection_snapshots as snapshot
   join public.testing_center_issue_occurrences as occurrence
     using (technical_issue_id)
   where snapshot.effect_id = (select effect_id from isa239_duplicate_results limit 1)
   group by snapshot.occurrence_count),
  '100:101',
  'later occurrences do not rewrite the create snapshot'
);
select is(
  (select source_snapshot->'report'->>'candidateSha'
   from public.testing_center_linear_projection_snapshots
   where effect_id = (select effect_id from isa239_duplicate_results limit 1)),
  repeat('a', 40),
  'candidate SHA comes only from the server build registry'
);

create temporary table isa239_projection as
select pg_catalog.jsonb_build_object(
  'contractVersion', 'testing-center.linear-issue.v1',
  'operation', 'create_issue',
  'effectId', snapshot.effect_id,
  'technicalIssueId', snapshot.technical_issue_id,
  'sourceDigest', snapshot.source_digest,
  'marker', snapshot.marker,
  'title', '[Testing Center] testing_center · '
    || pg_catalog.right(snapshot.technical_issue_id, 12),
  'description', snapshot.marker
    || E'\n# Issue técnico de Testing Center\n\n[redacted tester evidence]',
  'labels', pg_catalog.jsonb_build_array(
    'testing-center', 'needs-triage',
    'channel:' || (snapshot.source_snapshot->'report'->>'channel'),
    'module:' || (snapshot.source_snapshot->'report'->>'module'),
    'status:needs-triage'),
  'team', 'Vantare',
  'project', 'Testing Center',
  'status', 'Triage',
  'serverMetadataDigest',
    '65511d3f3ca28f43acd775c2a25902825730c892ba6e76860576dd0fdfc0caff'
) as document
from public.testing_center_linear_projection_snapshots as snapshot
where snapshot.effect_id = (select effect_id from isa239_duplicate_results limit 1);
select is((select document->'labels' from isa239_projection),
  '["testing-center", "needs-triage", "channel:nightly", "module:testing_center", "status:needs-triage"]'::jsonb,
  'labels are fixed server metadata');
select is(
  (select (document->>'team') || ':' || (document->>'project') || ':'
     || (document->>'status')
   from isa239_projection),
  'Vantare:Testing Center:Triage',
  'team, project and status are server-owned constants'
);
select ok(
  (select document->>'description' not like '%@Codex%'
    and document->>'description' not like '%supersecret%'
    and document->>'description' not like '%https://invalid.example%'
    and document->>'description' not like '%C:\\Users\\tester%'
   from isa239_projection),
  'persisted projection does not copy hostile source text'
);
select ok(
  (select not document ?| array[
    'assignee', 'assigneeId', 'priority', 'delegate', 'instructions',
    'commands', 'branch', 'baseBranch'
  ] from isa239_projection),
  'projection has no tester-controlled operational fields'
);

create temporary table isa239_integrity_claim as
select * from public.testing_center_claim_linear_effect(
  (select effect_id from isa239_duplicate_results limit 1), 'integrity-worker', 60
);
select is((select claim_status from isa239_integrity_claim), 'claimed',
  'prepared effect can be claimed once');

create function pg_temp.capture_complete(
  p_source_digest text,
  p_projection jsonb,
  p_canonical_projection text,
  p_projection_digest text
)
returns text language plpgsql as $$
begin
  perform public.testing_center_complete_linear_dry_run(
    (select effect_id from isa239_duplicate_results limit 1),
    'integrity-worker',
    (select fencing_token from isa239_integrity_claim),
    p_source_digest, p_projection, p_canonical_projection, p_projection_digest
  );
  return 'accepted';
exception when others then
  return sqlstate || ':' || sqlerrm;
end
$$;
select is(
  pg_temp.capture_complete(repeat('0',64),
    (select document from isa239_projection),
    (select document::text from isa239_projection),
    pg_catalog.encode(public.digest(pg_catalog.convert_to(
      (select document::text from isa239_projection), 'UTF8'), 'sha256'), 'hex')),
  '22023:testing_center_linear_projection_integrity_invalid',
  'arbitrary source digest fails closed'
);
select is(
  pg_temp.capture_complete(
    (select prepared_source_digest from isa239_prepared),
    (select document || '{"priority":1}'::jsonb from isa239_projection),
    (select (document || '{"priority":1}'::jsonb)::text from isa239_projection),
    pg_catalog.encode(public.digest(pg_catalog.convert_to(
      (select (document || '{"priority":1}'::jsonb)::text from isa239_projection),
      'UTF8'), 'sha256'), 'hex')),
  '22023:testing_center_linear_projection_integrity_invalid',
  'mutated snapshot and forbidden field fail closed'
);
select is(
  pg_temp.capture_complete(
    (select prepared_source_digest from isa239_prepared),
    (select document from isa239_projection),
    (select document::text from isa239_projection), repeat('9',64)),
  '22023:testing_center_linear_projection_integrity_invalid',
  'arbitrary projection digest fails closed'
);
select is(
  pg_temp.capture_complete(
    (select prepared_source_digest from isa239_prepared),
    (select document from isa239_projection),
    (select document::text from isa239_projection),
    pg_catalog.encode(public.digest(pg_catalog.convert_to(
      (select document::text from isa239_projection), 'UTF8'), 'sha256'), 'hex')),
  'accepted',
  'exact PostgreSQL-canonical projection completes the dry-run'
);
select ok(
  (select effect.state = 'dry_run_completed'
    and snapshot.sanitized_projection = projection.document
    and snapshot.projection_digest = pg_catalog.encode(public.digest(
      pg_catalog.convert_to(projection.document::text, 'UTF8'), 'sha256'), 'hex')
   from public.testing_center_effect_outbox as effect
   join public.testing_center_linear_projection_snapshots as snapshot using (effect_id)
   cross join isa239_projection as projection
   where effect.effect_id = (select effect_id from isa239_duplicate_results limit 1)),
  'completed dry-run persists exact projection and canonical digest'
);

create temporary table isa239_missing as
select * from pg_temp.seed_linear_report(
  'missing_build', '0.7.39-missing',
  'Open missing build', 'Build exists', 'Build is absent'
);
select is(
  (select preparation_status from public.testing_center_prepare_linear_projection(
    (select effect_id from isa239_missing))),
  'needs_owner',
  'missing server build identity routes to owner without a projection'
);
select ok(
  (select state = 'needs_owner' and next_attempt_at is null
    and last_error_code = 'linear_build_identity_missing'
   from public.testing_center_effect_outbox
   where effect_id = (select effect_id from isa239_missing)),
  'missing build identity is terminal and non-retryable'
);

create temporary table isa239_ambiguous_build as
select * from pg_temp.seed_linear_report(
  'ambiguous_build', '0.7.39-ambiguous',
  'Open ambiguous build', 'One SHA exists', 'Two SHAs exist'
);
select is(
  (select preparation_status from public.testing_center_prepare_linear_projection(
    (select effect_id from isa239_ambiguous_build))),
  'needs_owner',
  'ambiguous server build identity routes to owner'
);

create temporary table isa239_ambiguity as
select * from pg_temp.seed_linear_report(
  'ambiguity', '0.7.39-ambiguity',
  'Open ambiguous response', 'One response exists', 'Response is unknown'
);
select * from public.testing_center_prepare_linear_projection(
  (select effect_id from isa239_ambiguity));
create temporary table isa239_ambiguity_claim as
select * from public.testing_center_claim_linear_effect(
  (select effect_id from isa239_ambiguity), 'ambiguity-worker', 60
);
select public.testing_center_record_linear_ambiguity(
  (select effect_id from isa239_ambiguity), 'ambiguity-worker',
  (select fencing_token from isa239_ambiguity_claim)
);
select ok(
  (select state = 'needs_owner' and next_attempt_at is null
    and last_error_code = 'linear_response_ambiguous'
   from public.testing_center_effect_outbox
   where effect_id = (select effect_id from isa239_ambiguity)),
  'ambiguous response becomes terminal needs_owner without retry'
);
create temporary table isa239_ambiguity_reclaims(status text);
do $$
begin
  for i in 1..100 loop
    insert into isa239_ambiguity_reclaims
    select claim_status from public.testing_center_claim_linear_effect(
      (select effect_id from isa239_ambiguity), 'retry-' || i, 60
    );
  end loop;
end
$$;
select is(
  (select count(*)::text || ':' || count(*) filter(where status = 'needs_owner')::text
   from isa239_ambiguity_reclaims),
  '100:100',
  'one hundred claims cannot reclaim an ambiguous effect'
);

create temporary table isa239_stale as
select * from pg_temp.seed_linear_report(
  'stale', '0.7.39-stale',
  'Open stale lease', 'One worker owns it', 'A stale worker returns'
);
select * from public.testing_center_prepare_linear_projection(
  (select effect_id from isa239_stale));
create temporary table isa239_stale_a as
select * from public.testing_center_claim_linear_effect(
  (select effect_id from isa239_stale), 'stale-a', 60
);
reset role;
update public.testing_center_effect_outbox
set lease_expires_at = pg_catalog.now() - interval '1 second'
where effect_id = (select effect_id from isa239_stale);
set role service_role;
create temporary table isa239_stale_b as
select * from public.testing_center_claim_linear_effect(
  (select effect_id from isa239_stale), 'stale-b', 60
);
select is(
  (select b.fencing_token - a.fencing_token
   from isa239_stale_a a cross join isa239_stale_b b),
  1::bigint,
  'reclaim increments fencing monotonically'
);
select throws_ok(
  format(
    'select public.testing_center_record_linear_ambiguity(%L,%L,%s)',
    (select effect_id from isa239_stale), 'stale-a',
    (select fencing_token from isa239_stale_a)
  ),
  '55000', 'testing_center_linear_lease_lost',
  'stale worker cannot resolve the newer claim'
);

create temporary table isa239_pause as
select * from pg_temp.seed_linear_report(
  'pause', '0.7.39-pause',
  'Open pause', 'Completion waits', 'Pause wins'
);
select * from public.testing_center_prepare_linear_projection(
  (select effect_id from isa239_pause));
create temporary table isa239_pause_claim as
select * from public.testing_center_claim_linear_effect(
  (select effect_id from isa239_pause), 'pause-worker', 60
);
insert into public.testing_center_pauses(
  pause_id, scope, technical_issue_id, is_paused, reason_code,
  requested_by_id, requested_by_user_id, requested_by_role
) values (
  'isa239-flow-pause', 'flow', (select issue_id from isa239_pause), true,
  'owner_stop', 'isa239-owner',
  '00000000-0000-4000-8000-000000000739', 'owner'
);
create function pg_temp.capture_paused_completion()
returns text language plpgsql as $$
declare
  v_projection jsonb;
  v_source_digest text;
  v_projection_digest text;
begin
  select source_digest into v_source_digest
  from public.testing_center_linear_projection_snapshots
  where effect_id = (select effect_id from isa239_pause);
  select pg_catalog.jsonb_build_object(
    'contractVersion', 'testing-center.linear-issue.v1',
    'operation', 'create_issue',
    'effectId', snapshot.effect_id,
    'technicalIssueId', snapshot.technical_issue_id,
    'sourceDigest', snapshot.source_digest,
    'marker', snapshot.marker,
    'title', '[Testing Center] testing_center · '
      || pg_catalog.right(snapshot.technical_issue_id, 12),
    'description', snapshot.marker || E'\nPaused completion fixture',
    'labels', pg_catalog.jsonb_build_array(
      'testing-center', 'needs-triage',
      'channel:' || (snapshot.source_snapshot->'report'->>'channel'),
      'module:' || (snapshot.source_snapshot->'report'->>'module'),
      'status:needs-triage'),
    'team', 'Vantare', 'project', 'Testing Center', 'status', 'Triage',
    'serverMetadataDigest',
      '65511d3f3ca28f43acd775c2a25902825730c892ba6e76860576dd0fdfc0caff'
  ) into v_projection
  from public.testing_center_linear_projection_snapshots as snapshot
  where snapshot.effect_id = (select effect_id from isa239_pause);
  v_projection_digest := pg_catalog.encode(public.digest(
    pg_catalog.convert_to(v_projection::text, 'UTF8'), 'sha256'), 'hex');
  perform public.testing_center_complete_linear_dry_run(
    (select effect_id from isa239_pause), 'pause-worker',
    (select fencing_token from isa239_pause_claim),
    v_source_digest, v_projection, v_projection::text, v_projection_digest
  );
  return 'accepted';
exception when others then
  return sqlstate || ':' || sqlerrm;
end
$$;
select is(pg_temp.capture_paused_completion(),
  '55000:testing_center_paused',
  'pause is rechecked immediately before completion');
select is(
  (select state from public.testing_center_effect_outbox
   where effect_id = (select effect_id from isa239_pause)),
  'claimed',
  'late pause leaves the claim unresolved for explicit owner handling'
);

select * from finish();
rollback;
