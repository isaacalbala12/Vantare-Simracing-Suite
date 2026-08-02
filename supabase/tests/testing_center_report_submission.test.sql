begin;

select plan(55);

select has_table('public', 'testing_center_report_payloads', 'private report payload table exists');
select has_table('public', 'testing_center_report_submission_keys', 'private report idempotency table exists');
select has_table('public', 'testing_center_report_events', 'private report event table exists');
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename like 'testing_center_%'),
  6,
  'TAU-04A adds exactly one reviewed read policy'
);
select ok(
  (
    select bool_and(relrowsecurity and relforcerowsecurity)
    from pg_class
    where oid = any (array[
      'public.testing_center_report_payloads'::regclass,
      'public.testing_center_report_submission_keys'::regclass,
      'public.testing_center_report_events'::regclass
    ])
  ),
  'all new report tables enable and force RLS'
);
select is(
  (
    select count(*)::integer
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name like 'testing_center_%'
      and grantee = 'authenticated'
      and privilege_type = 'SELECT'
  ),
  6,
  'authenticated receives one additional read-only table grant'
);
select is(
  (
    select count(*)::integer
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name like 'testing_center_%'
      and grantee = 'authenticated'
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')
  ),
  0,
  'authenticated still has no direct Testing Center mutation grant'
);
select is(
  (
    select count(*)::integer
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('testing_center_report_submission_keys', 'testing_center_report_events')
      and grantee = 'authenticated'
  ),
  0,
  'idempotency and report events remain server-only'
);
select ok(
  (
    select prosecdef and proconfig[1] = 'search_path=""'
    from pg_proc
    where oid = 'public.testing_center_submit_report(text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text)'::regprocedure
  ),
  'submission RPC is SECURITY DEFINER with empty search path'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.testing_center_submit_report(text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text)',
    'execute'
  ),
  'authenticated can execute the submission boundary'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.testing_center_submit_report(text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text)',
    'execute'
  ),
  'anon cannot execute the submission boundary'
);
select ok(
  has_table_privilege('service_role', 'public.testing_center_report_payloads', 'select,insert,update,delete')
  and has_table_privilege('service_role', 'public.testing_center_report_submission_keys', 'select,insert,update,delete')
  and has_table_privilege('service_role', 'public.testing_center_report_events', 'select,insert,update,delete'),
  'service_role retains the reviewed administration path'
);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000401', 'report-primary@example.invalid'),
  ('00000000-0000-4000-8000-000000000402', 'report-tester@example.invalid'),
  ('00000000-0000-4000-8000-000000000403', 'report-owner@example.invalid'),
  ('00000000-0000-4000-8000-000000000404', 'report-inactive@example.invalid');

set local role service_role;
insert into public.testing_center_memberships (user_id, actor_id, role, active) values
  ('00000000-0000-4000-8000-000000000401', 'report-primary', 'primary_tester', true),
  ('00000000-0000-4000-8000-000000000402', 'report-tester', 'tester', true),
  ('00000000-0000-4000-8000-000000000403', 'report-owner', 'owner', true),
  ('00000000-0000-4000-8000-000000000404', 'report-inactive', 'primary_tester', false);
reset role;

create function pg_temp.testing_diag(
  p_channel text default 'nightly',
  p_module text default 'hub',
  p_with_logs boolean default false,
  p_generated_at timestamptz default now()
)
returns text
language sql
stable
as $$
  select pg_catalog.jsonb_build_object(
    'contractVersion', 'testing-center.diagnostic.v1',
    'generatedAtUtc', pg_catalog.to_char(p_generated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'application', pg_catalog.jsonb_build_object(
      'version', 'v0.4.0-nightly',
      'channel', p_channel,
      'os', 'windows',
      'arch', 'amd64'
    ),
    'module', p_module,
    'errorCode', 'render.failed',
    'logs', case when p_with_logs then pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'offsetMillis', 120,
        'source', 'frontend',
        'level', 'error',
        'code', 'render.failed',
        'message', 'renderer stopped'
      )
    ) else '[]'::jsonb end,
    'sanitization', pg_catalog.jsonb_build_object(
      'inputLogs', case when p_with_logs then 1 else 0 end,
      'includedLogs', case when p_with_logs then 1 else 0 end,
      'omittedLogs', 0,
      'redactedValues', 0,
      'truncatedMessages', 0
    )
  )::text
$$;

create function pg_temp.testing_digest(p_value text)
returns text
language sql
immutable
as $$
  select pg_catalog.encode(
    public.digest(pg_catalog.convert_to(p_value, 'UTF8'), 'sha256'),
    'hex'
  )
$$;

create function pg_temp.submit_report(
  p_key text,
  p_contract text default 'testing-center.v1',
  p_channel text default 'nightly',
  p_action text default 'Opened the settings panel',
  p_expected text default 'The settings panel should remain visible',
  p_observed text default 'The settings panel closed unexpectedly',
  p_context text default null,
  p_app_version text default 'v0.4.0-nightly',
  p_os_family text default 'windows',
  p_os_version text default 'Windows 11 24H2',
  p_module text default 'hub',
  p_include_diagnostic boolean default false,
  p_include_logs boolean default false,
  p_diagnostic text default null,
  p_digest text default null
)
returns table (report_id text, report_state text, idempotent boolean, created_at timestamptz)
language sql
as $$
  select * from public.testing_center_submit_report(
    p_contract, p_channel, p_action, p_expected, p_observed, p_context,
    p_app_version, p_os_family, p_os_version, p_module,
    p_include_diagnostic, p_include_logs, p_diagnostic, p_digest, p_key
  )
$$;

select throws_ok(
  $$set local role anon; select * from public.testing_center_submit_report('testing-center.v1', 'nightly', 'Did action', 'Expected result', 'Observed result', null, 'v0.4.0', 'windows', 'Windows 11', 'hub', false, false, null, null, 'anon-key')$$,
  '42501', null, 'anon cannot execute report submission'
);
select throws_ok(
  $$select * from public.testing_center_submit_report('testing-center.v1', 'nightly', 'Did action', 'Expected result', 'Observed result', null, 'v0.4.0', 'windows', 'Windows 11', 'hub', false, false, null, null, 'missing-auth-key')$$,
  '42501', null, 'missing authenticated identity fails closed'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000401', true);
select is(
  (select idempotent from pg_temp.submit_report('primary-first')),
  false,
  'primary tester submits one nightly report'
);
reset role;

set local role service_role;
select ok(
  (select count(*) = 1 from public.testing_center_reports where reporter_id = 'report-primary')
  and (select count(*) = 1 from public.testing_center_report_payloads)
  and (select count(*) = 1 from public.testing_center_report_submission_keys)
  and (select count(*) = 1 from public.testing_center_report_events)
  and (select count(*) = 0 from public.testing_center_evidence),
  'first submission creates one report, payload, key and event without synthetic evidence'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000401', true);
select is(
  (select idempotent from pg_temp.submit_report('primary-first')),
  true,
  'identical retry returns the original report'
);
reset role;

set local role service_role;
select ok(
  (select count(*) = 1 from public.testing_center_reports where reporter_id = 'report-primary')
  and (select count(*) = 1 from public.testing_center_report_payloads)
  and (select count(*) = 1 from public.testing_center_report_submission_keys)
  and (select count(*) = 1 from public.testing_center_report_events),
  'idempotent retry preserves exactly one effect'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000401', true);
select throws_ok(
  $$select * from pg_temp.submit_report('primary-first', p_observed => 'A different observed result')$$,
  '23505', null, 'same key with different verified payload conflicts'
);
select throws_ok(
  $$do $collision$ begin
      perform * from pg_temp.submit_report(
        'separator-collision',
        p_action => 'alpha',
        p_expected => 'bravo' || chr(31) || 'charlie'
      );
      perform * from pg_temp.submit_report(
        'separator-collision',
        p_action => 'alpha' || chr(31) || 'bravo',
        p_expected => 'charlie'
      );
    end $collision$;$$,
  '23505', null, 'typed operation digest cannot collide through field separators'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000402', true);
select throws_ok(
  $$select * from pg_temp.submit_report('tester-nightly')$$,
  '42501', null, 'normal tester cannot report against nightly'
);
select is(
  (select report_state from pg_temp.submit_report('tester-beta', p_channel => 'testers')),
  'submitted',
  'normal tester submits in the testers channel'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000404', true);
select throws_ok(
  $$select * from pg_temp.submit_report('inactive-report')$$,
  '42501', null, 'inactive membership cannot submit'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000403', true);
select is(
  (select report_state from pg_temp.submit_report('owner-report')),
  'submitted',
  'owner can submit a nightly report explicitly'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000401', true);
select throws_ok($$select * from pg_temp.submit_report('bad-version', p_contract => 'testing-center.v2')$$, '22023', null, 'future contract fails closed');
select throws_ok($$select * from pg_temp.submit_report('bad-channel', p_channel => 'preview')$$, '22023', null, 'unknown channel fails closed');
select throws_ok($$select * from pg_temp.submit_report('bad-action', p_action => '')$$, '22023', null, 'missing action is rejected');
select throws_ok($$select * from pg_temp.submit_report('bad-expected', p_expected => ' expected result')$$, '22023', null, 'non-canonical expected text is rejected');
select throws_ok($$select * from pg_temp.submit_report('bad-observed', p_observed => repeat('x', 2049))$$, '22023', null, 'oversized observed text is rejected');
select throws_ok($$select * from pg_temp.submit_report('bad-app', p_app_version => 'private version value')$$, '22023', null, 'invalid app version is rejected');
select throws_ok($$select * from pg_temp.submit_report('bad-os', p_os_family => 'linux')$$, '22023', null, 'non-Windows report is rejected in the current product contract');
select throws_ok($$select * from pg_temp.submit_report('bad-os-version', p_os_version => 'Windows 11 / private')$$, '22023', null, 'unsafe OS version is rejected');
select throws_ok($$select * from pg_temp.submit_report('bad-module', p_module => 'private-module')$$, '22023', null, 'unknown module text is rejected');
select throws_ok($$select * from pg_temp.submit_report(' bad-key')$$, '22023', null, 'malformed idempotency key is rejected');
select throws_ok($$select * from pg_temp.submit_report('logs-no-diag', p_include_logs => true)$$, '22023', null, 'logs cannot be included without diagnostic consent');
select throws_ok($$select * from pg_temp.submit_report('payload-no-consent', p_diagnostic => '{}', p_digest => repeat('a', 64))$$, '22023', null, 'diagnostic payload cannot cross without consent');
select throws_ok(
  $$select * from pg_temp.submit_report('bad-digest', p_include_diagnostic => true, p_diagnostic => pg_temp.testing_diag(), p_digest => repeat('a', 64))$$,
  '22023', null, 'diagnostic digest mismatch is rejected'
);
select throws_ok(
  $$select * from pg_temp.submit_report('bad-json', p_include_diagnostic => true, p_diagnostic => '{', p_digest => pg_temp.testing_digest('{'))$$,
  '22023', null, 'malformed diagnostic JSON is rejected'
);
select throws_ok(
  $$select * from pg_temp.submit_report('extra-field', p_include_diagnostic => true, p_diagnostic => (pg_temp.testing_diag()::jsonb || '{"unexpected":"private"}'::jsonb)::text, p_digest => pg_temp.testing_digest((pg_temp.testing_diag()::jsonb || '{"unexpected":"private"}'::jsonb)::text))$$,
  '22023', null, 'unknown diagnostic field is rejected'
);
select throws_ok(
  $$select * from pg_temp.submit_report('mismatch-channel', p_include_diagnostic => true, p_diagnostic => pg_temp.testing_diag('testers'), p_digest => pg_temp.testing_digest(pg_temp.testing_diag('testers')))$$,
  '22023', null, 'diagnostic channel must match the report channel'
);
select throws_ok(
  $$select * from pg_temp.submit_report('logs-optout', p_include_diagnostic => true, p_include_logs => false, p_diagnostic => pg_temp.testing_diag('nightly', 'hub', true), p_digest => pg_temp.testing_digest(pg_temp.testing_diag('nightly', 'hub', true)))$$,
  '22023', null, 'non-empty logs cannot cross when log consent is false'
);
select throws_ok(
  $$select * from pg_temp.submit_report('bad-log-shape', p_include_diagnostic => true, p_include_logs => true, p_diagnostic => jsonb_set(pg_temp.testing_diag()::jsonb, '{logs}', '[{"message":"raw"}]'::jsonb)::text, p_digest => pg_temp.testing_digest(jsonb_set(pg_temp.testing_diag()::jsonb, '{logs}', '[{"message":"raw"}]'::jsonb)::text))$$,
  '22023', null, 'incomplete log shape is rejected'
);
select throws_ok(
  $$select * from pg_temp.submit_report('null-contract', p_include_diagnostic => true, p_diagnostic => jsonb_set(pg_temp.testing_diag()::jsonb, '{contractVersion}', 'null'::jsonb)::text, p_digest => pg_temp.testing_digest(jsonb_set(pg_temp.testing_diag()::jsonb, '{contractVersion}', 'null'::jsonb)::text))$$,
  '22023', null, 'null scalar diagnostic values fail closed'
);
select throws_ok(
  $$select * from pg_temp.submit_report('bad-counters', p_include_diagnostic => true, p_diagnostic => jsonb_set(pg_temp.testing_diag()::jsonb, '{sanitization,inputLogs}', '1'::jsonb)::text, p_digest => pg_temp.testing_digest(jsonb_set(pg_temp.testing_diag()::jsonb, '{sanitization,inputLogs}', '1'::jsonb)::text))$$,
  '22023', null, 'sanitization counters must reconcile with included and omitted logs'
);
select throws_ok(
  $$select * from pg_temp.submit_report('stale-diag', p_include_diagnostic => true, p_diagnostic => pg_temp.testing_diag('nightly', 'hub', false, now() - interval '8 days'), p_digest => pg_temp.testing_digest(pg_temp.testing_diag('nightly', 'hub', false, now() - interval '8 days')))$$,
  '22023', null, 'stale diagnostic package is rejected'
);

select is(
  (select report_state from pg_temp.submit_report(
    'diag-no-logs',
    p_include_diagnostic => true,
    p_diagnostic => pg_temp.testing_diag(),
    p_digest => pg_temp.testing_digest(pg_temp.testing_diag())
  )),
  'submitted',
  'valid diagnostic without logs is accepted explicitly'
);
select is(
  (select report_state from pg_temp.submit_report(
    'diag-with-logs',
    p_module => 'overlay_studio',
    p_include_diagnostic => true,
    p_include_logs => true,
    p_diagnostic => pg_temp.testing_diag('nightly', 'overlay_studio', true),
    p_digest => pg_temp.testing_digest(pg_temp.testing_diag('nightly', 'overlay_studio', true))
  )),
  'submitted',
  'valid diagnostic with separate log consent is accepted'
);
reset role;

set local role service_role;
select ok(
  (
    select payload.diagnostic_transport_digest = evidence.digest
      and event.operation_digest = submission.payload_digest
      and report.report_id = 'report_' || event.operation_digest
      and payload.diagnostic_document ? 'sanitization'
      and not (payload.diagnostic_document ? 'unexpected')
    from public.testing_center_report_submission_keys as submission
    join public.testing_center_reports as report on report.report_id = submission.report_id
    join public.testing_center_report_payloads as payload on payload.report_id = report.report_id
    join public.testing_center_report_events as event on event.report_id = report.report_id
    join public.testing_center_evidence as evidence on evidence.report_id = report.report_id
    where submission.idempotency_key = 'diag-with-logs'
  ),
  'stored diagnostic, evidence, event and idempotency digests remain attributable'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000401', true);
select is((select count(*)::integer from public.testing_center_report_payloads), 3, 'reporter sees all three own payloads');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000402', true);
select is((select count(*)::integer from public.testing_center_report_payloads), 1, 'tester cannot read another reporter payload');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000403', true);
select is((select count(*)::integer from public.testing_center_report_payloads), 5, 'owner can review all submitted payloads');
select throws_ok(
  $$insert into public.testing_center_report_payloads (report_id, action_text, expected_text, observed_text, app_version, os_family, os_version, module, include_diagnostic, include_logs) select report_id, 'Did action', 'Expected result', 'Observed result', 'v0.4.0', 'windows', 'Windows 11', 'hub', false, false from public.testing_center_reports limit 1$$,
  '42501', null, 'authenticated owner still cannot insert payload rows directly'
);
select throws_ok($$select count(*) from public.testing_center_report_submission_keys$$, '42501', null, 'clients cannot enumerate report idempotency keys');
select throws_ok($$select count(*) from public.testing_center_report_events$$, '42501', null, 'clients cannot read raw report submission audit');
select throws_ok($$update public.testing_center_report_payloads set module = 'billing'$$, '42501', null, 'clients cannot mutate submitted payloads directly');
reset role;

select * from finish();
rollback;
