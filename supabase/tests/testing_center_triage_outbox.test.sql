begin;

select plan(40);

select has_table('public', 'testing_center_triage_results', 'triage result table exists');
select has_table('public', 'testing_center_issue_occurrences', 'issue occurrence table exists');
select has_table('public', 'testing_center_effect_outbox', 'effect outbox table exists');
select ok(
  (
    select bool_and(relrowsecurity and relforcerowsecurity)
    from pg_class
    where oid = any (array[
      'public.testing_center_triage_results'::regclass,
      'public.testing_center_issue_occurrences'::regclass,
      'public.testing_center_effect_outbox'::regclass
    ])
  ),
  'all TAU-05A tables enable and force RLS'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'testing_center_triage_results',
        'testing_center_issue_occurrences',
        'testing_center_effect_outbox'
      )
  ),
  0,
  'TAU-05A adds no client policy'
);
select is(
  (
    select count(*)::integer
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in (
        'testing_center_triage_results',
        'testing_center_issue_occurrences',
        'testing_center_effect_outbox'
      )
      and grantee in ('anon', 'authenticated')
  ),
  0,
  'anon and authenticated receive no direct TAU-05A table grant'
);
select ok(
  has_table_privilege('service_role', 'public.testing_center_triage_results', 'select,insert,update,delete')
  and has_table_privilege('service_role', 'public.testing_center_issue_occurrences', 'select,insert,update,delete')
  and has_table_privilege('service_role', 'public.testing_center_effect_outbox', 'select,insert,update,delete'),
  'service_role retains the reviewed server path'
);
select ok(
  (
    select prosecdef and proconfig[1] = 'search_path=""'
    from pg_proc
    where oid = 'public.testing_center_triage_report(text)'::regprocedure
  ),
  'triage function is SECURITY DEFINER with empty search path'
);
select ok(
  has_function_privilege('service_role', 'public.testing_center_triage_report(text)', 'execute'),
  'service_role can execute triage'
);
select ok(
  not has_function_privilege('authenticated', 'public.testing_center_triage_report(text)', 'execute'),
  'authenticated cannot execute server triage'
);
select ok(
  not has_function_privilege('anon', 'public.testing_center_triage_report(text)', 'execute'),
  'anon cannot execute server triage'
);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000501', 'triage-reporter@example.invalid'),
  ('00000000-0000-4000-8000-000000000502', 'triage-owner@example.invalid');

create function pg_temp.seed_triage_report(
  p_report_id text,
  p_action text,
  p_expected text,
  p_observed text,
  p_error_code text default null,
  p_module text default 'hub',
  p_state text default 'submitted'
)
returns void
language plpgsql
as $$
declare
  v_has_diagnostic boolean := p_error_code is not null;
begin
  insert into public.testing_center_reports (
    report_id, reporter_id, reporter_user_id, reporter_role, channel, state
  ) values (
    p_report_id, 'triage-reporter',
    '00000000-0000-4000-8000-000000000501', 'primary_tester',
    'nightly', p_state
  );

  if p_state = 'submitted' then
    insert into public.testing_center_report_payloads (
      report_id, action_text, expected_text, observed_text, context_text,
      app_version, os_family, os_version, module,
      include_diagnostic, include_logs, diagnostic_document,
      diagnostic_transport_digest
    ) values (
      p_report_id, p_action, p_expected, p_observed, 'Deterministic test context',
      'v0.4.7-nightly', 'windows', 'Windows 11 24H2', p_module,
      v_has_diagnostic, false,
      case when v_has_diagnostic then pg_catalog.jsonb_build_object(
        'errorCode', p_error_code,
        'logs', '[]'::jsonb
      ) else null end,
      case when v_has_diagnostic then repeat('d', 64) else null end
    );
    insert into public.testing_center_report_events (
      event_id, report_id, actor_id, actor_user_id, actor_role,
      operation_digest
    ) values (
      'event_' || p_report_id, p_report_id, 'triage-reporter',
      '00000000-0000-4000-8000-000000000501', 'primary_tester',
      repeat('e', 64)
    );
  end if;
end;
$$;

set role service_role;

select throws_ok(
  $$select * from public.testing_center_triage_report(' bad')$$,
  '22023',
  'testing_center_report_id_invalid',
  'invalid report identifiers fail closed'
);
select throws_ok(
  $$select * from public.testing_center_triage_report('report_missing')$$,
  'P0002',
  'testing_center_report_not_found',
  'missing reports fail closed'
);

select pg_temp.seed_triage_report(
  'report_draft', 'Open the hub panel', 'The panel remains open',
  'The panel closes', null, 'hub', 'draft'
);
select throws_ok(
  $$select * from public.testing_center_triage_report('report_draft')$$,
  '55000',
  'testing_center_report_not_submitted',
  'draft reports cannot enter triage'
);

select pg_temp.seed_triage_report(
  'report_paused', 'Open the paused panel', 'The panel remains open',
  'The panel closes'
);
insert into public.testing_center_pauses (
  pause_id, scope, is_paused, reason_code, requested_by_id,
  requested_by_user_id, requested_by_role
) values (
  'pause_triage_global', 'global', true, 'owner_test', 'triage-owner',
  '00000000-0000-4000-8000-000000000502', 'owner'
);
select throws_ok(
  $$select * from public.testing_center_triage_report('report_paused')$$,
  '55000',
  'testing_center_paused',
  'global pause blocks triage before reservation'
);
select is(
  (select count(*)::integer from public.testing_center_triage_results where report_id = 'report_paused'),
  0,
  'a paused report creates no triage result'
);
update public.testing_center_pauses set is_paused = false where pause_id = 'pause_triage_global';

insert into public.testing_center_reports (
  report_id, reporter_id, reporter_user_id, reporter_role, channel, state
) values (
  'report_incomplete', 'triage-reporter',
  '00000000-0000-4000-8000-000000000501', 'primary_tester',
  'nightly', 'submitted'
);
create temporary table isa222_incomplete as
select * from public.testing_center_triage_report('report_incomplete');
select is(
  (select result_triage_state from isa222_incomplete),
  'incomplete',
  'missing server context is classified as incomplete'
);
select is(
  (select state from public.testing_center_reports where report_id = 'report_incomplete'),
  'incomplete',
  'incomplete classification is visible on the report'
);
select is(
  (select count(*)::integer from public.testing_center_effect_outbox),
  0,
  'incomplete reports never reserve an external effect'
);

select pg_temp.seed_triage_report(
  'report_primary', 'Open the hub panel', 'The panel remains open',
  'The panel closes unexpectedly', 'ui.panel.closed'
);
create temporary table isa222_primary as
select * from public.testing_center_triage_report('report_primary');
select is(
  (select result_triage_state from isa222_primary),
  'issue_reserved',
  'a complete first occurrence reserves one issue-create effect'
);
select is(
  (select state from public.testing_center_reports where report_id = 'report_primary'),
  'validated',
  'the primary report becomes validated'
);
select ok(
  (
    select result_technical_fingerprint ~ '^[0-9a-f]{64}$'
      and result_functional_fingerprint ~ '^[0-9a-f]{64}$'
    from isa222_primary
  ),
  'technical and functional fingerprints are deterministic SHA-256 values'
);
select is(
  (
    select
      (select count(*) from public.testing_center_technical_issues where report_id = 'report_primary')::text
      || ':' ||
      (select count(*) from public.testing_center_issue_occurrences where report_id = 'report_primary')::text
      || ':' ||
      (select count(*) from public.testing_center_effect_outbox where primary_report_id = 'report_primary')::text
  ),
  '1:1:1',
  'primary triage atomically creates issue, occurrence and reservation'
);

create temporary table isa222_retry as
select * from public.testing_center_triage_report('report_primary');
select is(
  (select result_idempotent from isa222_retry),
  true,
  'retrying the same report returns the persisted decision'
);
select is(
  (
    select count(*)::integer
    from public.testing_center_issue_occurrences
    where technical_issue_id = (select result_technical_issue_id from isa222_primary)
  ),
  1,
  'retrying the same report creates no second occurrence'
);

select pg_temp.seed_triage_report(
  'report_normalized', 'OPEN  THE HUB PANEL', 'THE PANEL REMAINS OPEN',
  'THE PANEL CLOSES UNEXPECTEDLY', null
);
create temporary table isa222_normalized as
select * from public.testing_center_triage_report('report_normalized');
select is(
  (select result_triage_state from isa222_normalized),
  'duplicate_linked',
  'case and internal whitespace normalization remains exact-compatible'
);
select is(
  (select count(*)::integer from public.testing_center_effect_outbox),
  1,
  'an exact-compatible duplicate does not reserve another create effect'
);

select pg_temp.seed_triage_report(
  'report_changed_observed', 'Open the hub panel', 'The panel remains open',
  'The panel renders in the wrong colour', null
);
create temporary table isa222_changed as
select * from public.testing_center_triage_report('report_changed_observed');
select isnt(
  (select result_technical_issue_id from isa222_changed),
  (select result_technical_issue_id from isa222_primary),
  'same action alone never merges a different observed result'
);

select pg_temp.seed_triage_report(
  'report_technical', 'Use a different path', 'A different result is expected',
  'A different symptom is shown', 'ui.panel.closed'
);
create temporary table isa222_technical as
select * from public.testing_center_triage_report('report_technical');
select is(
  (select result_technical_issue_id from isa222_technical),
  (select result_technical_issue_id from isa222_primary),
  'an exact technical signature links different prose to the active issue'
);

select pg_temp.seed_triage_report(
  'report_learned_primary', 'Launch the simulator', 'The simulator should launch',
  'The launcher remains idle', null, 'launcher'
);
create temporary table isa222_learned_primary as
select * from public.testing_center_triage_report('report_learned_primary');
select pg_temp.seed_triage_report(
  'report_learned_diagnostic', 'Launch the simulator', 'The simulator should launch',
  'The launcher remains idle', 'launcher.start.failed', 'launcher'
);
create temporary table isa222_learned_diagnostic as
select * from public.testing_center_triage_report('report_learned_diagnostic');
select pg_temp.seed_triage_report(
  'report_learned_match', 'Use the recent session shortcut', 'The session should open',
  'Nothing starts', 'launcher.start.failed', 'launcher'
);
create temporary table isa222_learned_match as
select * from public.testing_center_triage_report('report_learned_match');
select is(
  (select result_technical_issue_id from isa222_learned_match),
  (select result_technical_issue_id from isa222_learned_primary),
  'an active issue learns an exact technical signature from a later occurrence'
);

select pg_temp.seed_triage_report(
  'report_generic_a', 'Open the calendar', 'The calendar should open',
  'The calendar stays hidden', 'tester.report', 'calendar'
);
create temporary table isa222_generic_a as
select * from public.testing_center_triage_report('report_generic_a');
select pg_temp.seed_triage_report(
  'report_generic_b', 'Delete a calendar event', 'The event should disappear',
  'The event remains visible', 'tester.report', 'calendar'
);
create temporary table isa222_generic_b as
select * from public.testing_center_triage_report('report_generic_b');
select isnt(
  (select result_technical_issue_id from isa222_generic_b),
  (select result_technical_issue_id from isa222_generic_a),
  'the generic in-app tester.report code never merges unrelated prose'
);

insert into public.testing_center_pauses (
  pause_id, scope, technical_issue_id, is_paused, reason_code,
  requested_by_id, requested_by_user_id, requested_by_role
) values (
  'pause_triage_flow', 'flow',
  (select result_technical_issue_id from isa222_primary), true,
  'owner_test', 'triage-owner',
  '00000000-0000-4000-8000-000000000502', 'owner'
);
select pg_temp.seed_triage_report(
  'report_flow_paused', 'Another route', 'Another expectation',
  'Another observation', 'ui.panel.closed'
);
select throws_ok(
  $$select * from public.testing_center_triage_report('report_flow_paused')$$,
  '55000',
  'testing_center_paused',
  'a flow pause blocks a matching occurrence'
);
select is(
  (select count(*)::integer from public.testing_center_triage_results where report_id = 'report_flow_paused'),
  0,
  'flow pause leaves the new report retryable and creates no effect'
);
update public.testing_center_pauses set is_paused = false where pause_id = 'pause_triage_flow';

update public.testing_center_technical_issues
set state = 'closed', flow_state = 'stopped'
where technical_issue_id = (select result_technical_issue_id from isa222_primary);
select pg_temp.seed_triage_report(
  'report_after_close', 'Open the hub panel', 'The panel remains open',
  'The panel closes unexpectedly', 'ui.panel.closed'
);
create temporary table isa222_after_close as
select * from public.testing_center_triage_report('report_after_close');
select isnt(
  (select result_technical_issue_id from isa222_after_close),
  (select result_technical_issue_id from isa222_primary),
  'a closed issue is not silently reopened by deduplication'
);

do $$
declare
  i integer;
  v_report_id text;
begin
  for i in 1..100 loop
    v_report_id := 'bulk_' || pg_catalog.lpad(i::text, 3, '0');
    perform pg_temp.seed_triage_report(
      v_report_id,
      'Start telemetry recording',
      'Recording should start',
      'Recording remains stopped',
      null,
      'telemetry'
    );
    perform public.testing_center_triage_report(v_report_id);
  end loop;
end;
$$;
select is(
  (
    select count(distinct technical_issue_id)::integer
    from public.testing_center_triage_results
    where report_id like 'bulk\_%' escape '\'
  ),
  1,
  '100 exact-compatible reports converge on one technical issue'
);
select is(
  (
    select count(*)::integer
    from public.testing_center_issue_occurrences
    where technical_issue_id = (
      select technical_issue_id
      from public.testing_center_triage_results
      where report_id = 'bulk_001'
    )
  ),
  100,
  'all 100 reports remain visible as occurrences'
);
select is(
  (
    select count(*)::integer
    from public.testing_center_effect_outbox
    where technical_issue_id = (
      select technical_issue_id
      from public.testing_center_triage_results
      where report_id = 'bulk_001'
    )
  ),
  1,
  '100 repetitions reserve exactly one GitHub issue-create effect'
);
select is(
  (
    select count(*)::integer
    from public.testing_center_triage_results
    where report_id like 'bulk\_%' escape '\'
      and triage_state = 'incomplete'
  ),
  0,
  'no complete bulk report is discarded as incomplete'
);
select is(
  (
    select count(*)::integer
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'testing_center_effect_outbox'
      and column_name in ('assignee', 'codex_run_id', 'payload', 'request_body')
  ),
  0,
  'TAU-05A outbox contains no assignee, Codex dispatch or GitHub body'
);
select is(
  (
    select count(*)::integer
    from public.testing_center_effect_outbox
    where state <> 'pending' or attempt_count <> 0
  ),
  0,
  'TAU-05A never claims or executes an external effect'
);

reset role;
select * from finish();
rollback;
