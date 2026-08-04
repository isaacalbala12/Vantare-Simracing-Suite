begin;

select plan(56);

select has_table('public', 'testing_center_memberships', 'server-owned memberships table exists');
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename like 'testing_center_%'
  ),
  5,
  'only the five reviewed read policies exist'
);
select ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_class
    where oid = 'public.testing_center_memberships'::regclass
  ),
  'memberships enable and force RLS'
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
  5,
  'authenticated receives select on exactly five reviewed tables'
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
  'authenticated receives no direct mutation privilege'
);
select is(
  (
    select count(*)::integer
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name like 'testing_center_%'
      and grantee in ('PUBLIC', 'anon')
  ),
  0,
  'PUBLIC and anon receive no Testing Center table grants'
);
select is(
  (
    select count(*)::integer
    from pg_proc
    where oid = any (array[
      'public.testing_center_current_role()'::regprocedure,
      'public.testing_center_can_view_channel(text)'::regprocedure,
      'public.testing_center_validate_candidate(text,text,text,text,text,text)'::regprocedure
    ])
      and prosecdef
      and proconfig[1] = 'search_path=""'
  ),
  3,
  'all access functions are SECURITY DEFINER with an empty search path'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.testing_center_validate_candidate(text,text,text,text,text,text)',
    'execute'
  ),
  'authenticated can execute only the validation boundary'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.testing_center_validate_candidate(text,text,text,text,text,text)',
    'execute'
  ),
  'anon cannot execute the validation boundary'
);
select ok(
  has_table_privilege(
    'service_role',
    'public.testing_center_memberships',
    'select,insert,update,delete'
  ),
  'service_role retains the membership administration path'
);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000301', 'tester-a@example.invalid'),
  ('00000000-0000-4000-8000-000000000302', 'tester-b@example.invalid'),
  ('00000000-0000-4000-8000-000000000303', 'primary@example.invalid'),
  ('00000000-0000-4000-8000-000000000304', 'beta@example.invalid'),
  ('00000000-0000-4000-8000-000000000305', 'owner@example.invalid'),
  ('00000000-0000-4000-8000-000000000306', 'inactive@example.invalid'),
  ('00000000-0000-4000-8000-000000000307', 'self@example.invalid');

set local role service_role;

insert into public.testing_center_memberships (user_id, actor_id, role, active) values
  ('00000000-0000-4000-8000-000000000301', 'tester-a', 'tester', true),
  ('00000000-0000-4000-8000-000000000302', 'tester-b', 'tester', true),
  ('00000000-0000-4000-8000-000000000303', 'primary-main', 'primary_tester', true),
  ('00000000-0000-4000-8000-000000000304', 'beta-main', 'tester', true),
  ('00000000-0000-4000-8000-000000000305', 'owner-main', 'owner', true),
  ('00000000-0000-4000-8000-000000000306', 'inactive-main', 'primary_tester', false),
  ('00000000-0000-4000-8000-000000000307', 'codex-author', 'primary_tester', true);

create function pg_temp.seed_testing_candidate(
  p_suffix text,
  p_reporter uuid,
  p_channel text,
  p_sha text,
  p_author text default 'codex-author'
)
returns void
language plpgsql
as $$
declare
  v_flow_state text := case p_channel
    when 'nightly' then 'nightly_candidate'
    else 'testers_candidate'
  end;
begin
  insert into public.testing_center_reports (
    report_id, reporter_id, reporter_user_id, reporter_role, channel, state
  ) values (
    'report-' || p_suffix,
    'reporter-' || p_suffix,
    p_reporter,
    'tester',
    p_channel,
    'validated'
  );
  insert into public.testing_center_technical_issues (
    technical_issue_id, report_id, state, flow_state, origin
  ) values (
    'issue-' || p_suffix,
    'report-' || p_suffix,
    'open',
    v_flow_state,
    'orchestrator'
  );
  insert into public.testing_center_candidate_builds (
    candidate_id, technical_issue_id, channel, build_version,
    exact_sha, author_id, state
  ) values (
    'candidate-' || p_suffix,
    'issue-' || p_suffix,
    p_channel,
    'build-' || p_suffix,
    p_sha,
    p_author,
    'pending'
  );
end
$$;

select pg_temp.seed_testing_candidate(
  'own-a', '00000000-0000-4000-8000-000000000301', 'nightly', repeat('a', 40)
);
select pg_temp.seed_testing_candidate(
  'own-b', '00000000-0000-4000-8000-000000000302', 'testers', repeat('b', 40)
);
insert into public.testing_center_evidence (evidence_id, report_id, kind, digest) values
  ('evidence-own-a', 'report-own-a', 'diagnostic', repeat('a', 64)),
  ('evidence-own-b', 'report-own-b', 'diagnostic', repeat('b', 64));
insert into public.testing_center_codex_runs (
  run_id, technical_issue_id, attempt, state, origin
) values ('run-private', 'issue-own-a', 1, 'queued', 'orchestrator');

select pg_temp.seed_testing_candidate(
  'accept', '00000000-0000-4000-8000-000000000301', 'nightly', repeat('c', 40)
);
select pg_temp.seed_testing_candidate(
  'tester-denied', '00000000-0000-4000-8000-000000000301', 'nightly', repeat('d', 40)
);
select pg_temp.seed_testing_candidate(
  'beta', '00000000-0000-4000-8000-000000000302', 'testers', repeat('e', 40)
);
select pg_temp.seed_testing_candidate(
  'stale', '00000000-0000-4000-8000-000000000301', 'nightly', repeat('f', 40)
);
select pg_temp.seed_testing_candidate(
  'inactive', '00000000-0000-4000-8000-000000000301', 'nightly', repeat('1', 40)
);
select pg_temp.seed_testing_candidate(
  'self', '00000000-0000-4000-8000-000000000301', 'nightly', repeat('2', 40), 'codex-author'
);
select pg_temp.seed_testing_candidate(
  'global', '00000000-0000-4000-8000-000000000301', 'nightly', repeat('3', 40)
);
select pg_temp.seed_testing_candidate(
  'flow', '00000000-0000-4000-8000-000000000301', 'nightly', repeat('4', 40)
);
select pg_temp.seed_testing_candidate(
  'other', '00000000-0000-4000-8000-000000000301', 'nightly', repeat('5', 40)
);
select pg_temp.seed_testing_candidate(
  'reject', '00000000-0000-4000-8000-000000000301', 'nightly', repeat('6', 40)
);
select pg_temp.seed_testing_candidate(
  'owner', '00000000-0000-4000-8000-000000000301', 'nightly', repeat('7', 40)
);

reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000301', true);
select is((select count(*)::integer from public.testing_center_memberships), 1, 'tester sees only own active membership');
select ok(
  (select count(*) = 1 from public.testing_center_reports where report_id = 'report-own-a')
  and (select count(*) = 0 from public.testing_center_reports where report_id = 'report-own-b'),
  'tester sees own report and not another tester report'
);
select is((select count(*)::integer from public.testing_center_evidence), 1, 'tester sees only evidence for own report');
select ok(
  (select count(*) = 1 from public.testing_center_technical_issues where technical_issue_id = 'issue-own-a')
  and (select count(*) = 0 from public.testing_center_technical_issues where technical_issue_id = 'issue-own-b'),
  'tester sees own issue and not another tester issue'
);
select is((select count(*)::integer from public.testing_center_candidate_builds where channel = 'nightly'), 0, 'tester cannot see nightly candidates');
select ok((select count(*) from public.testing_center_candidate_builds where channel = 'testers') >= 1, 'tester can see testers candidates');
select throws_ok(
  $$insert into public.testing_center_reports (report_id, reporter_id, reporter_user_id, reporter_role, channel, state) values ('direct-report', 'tester-a', '00000000-0000-4000-8000-000000000301', 'tester', 'nightly', 'draft')$$,
  '42501', null, 'client cannot insert reports directly in this server-only cut'
);
select throws_ok(
  $$update public.testing_center_candidate_builds set state = 'accepted' where candidate_id = 'candidate-own-b'$$,
  '42501', null, 'client cannot mutate candidate state directly'
);
select throws_ok(
  $$insert into public.testing_center_validations (validation_id, candidate_id, channel, exact_sha, candidate_author_id, decision, actor_id, actor_user_id, actor_role) values ('forged-validation', 'candidate-own-b', 'testers', repeat('b', 40), 'codex-author', 'accepted', 'tester-a', '00000000-0000-4000-8000-000000000301', 'owner')$$,
  '42501', null, 'client cannot forge a direct validation or role'
);
select throws_ok(
  $$update public.testing_center_memberships set role = 'owner' where user_id = '00000000-0000-4000-8000-000000000301'$$,
  '42501', null, 'client cannot self-assign a role'
);
select throws_ok(
  $$select count(*) from public.testing_center_codex_runs$$,
  '42501', null, 'client cannot read private Codex runs directly'
);
select throws_ok(
  $$select count(*) from public.testing_center_audit$$,
  '42501', null, 'client cannot read the private audit log directly'
);
select throws_ok(
  $$select count(*) from public.testing_center_validations$$,
  '42501', null, 'client cannot enumerate validator UUIDs from the raw validation table'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000303', true);
select ok((select count(*) from public.testing_center_candidate_builds where channel = 'nightly') >= 1, 'primary tester sees nightly candidates');
select ok((select count(*) from public.testing_center_candidate_builds where channel = 'testers') >= 1, 'primary tester also sees testers candidates');
select is((select count(*)::integer from public.testing_center_reports), 0, 'primary tester does not inherit access to reporter data');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000305', true);
select ok((select count(*) from public.testing_center_reports) >= 2, 'owner can review all reports');
select ok((select count(*) from public.testing_center_evidence) >= 2, 'owner can review all report evidence');
select ok((select count(*) from public.testing_center_technical_issues) >= 2, 'owner can review all report issues');
select ok((select count(*) from public.testing_center_candidate_builds) >= 2, 'owner can review both candidate channels');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000306', true);
select is(public.testing_center_current_role(), null, 'inactive membership resolves to no role');
select is((select count(*)::integer from public.testing_center_memberships), 0, 'inactive tester cannot read membership row');
select is((select count(*)::integer from public.testing_center_candidate_builds), 0, 'inactive tester cannot read candidates');
reset role;

set local role anon;
select throws_ok(
  $$select * from public.testing_center_validate_candidate('testing-center.v1', 'candidate-accept', repeat('c', 40), 'accepted', null, 'anon-key')$$,
  '42501', null, 'anon cannot execute validation RPC'
);
select throws_ok(
  $$select count(*) from public.testing_center_reports$$,
  '42501', null, 'anon cannot read Testing Center tables'
);
reset role;

select throws_ok(
  $$select * from public.testing_center_validate_candidate('testing-center.v1', 'candidate-accept', repeat('c', 40), 'accepted', null, 'no-auth-key')$$,
  '42501', null, 'missing authenticated identity fails closed'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000303', true);
select is(
  (select idempotent from public.testing_center_validate_candidate(
    'testing-center.v1', 'candidate-accept', repeat('c', 40), 'accepted', null,
    'accept-key'
  )),
  false,
  'primary tester accepts one exact nightly candidate'
);
reset role;

set local role service_role;
select ok(
  (select state = 'accepted' from public.testing_center_candidate_builds where candidate_id = 'candidate-accept')
  and (select flow_state = 'nightly_accepted' from public.testing_center_technical_issues where technical_issue_id = 'issue-accept')
  and (select count(*) = 1 from public.testing_center_validations where candidate_id = 'candidate-accept')
  and (select count(*) = 1 from public.testing_center_audit where aggregate_id = 'issue-accept')
  and (select count(*) = 1 from public.testing_center_idempotency where aggregate_id = 'issue-accept')
  and (
    select audit.operation_digest = idempotency.payload_digest
      and audit.operation_digest ~ '^[0-9a-f]{64}$'
      and validation.validation_id = 'validation_' || audit.operation_digest
      and audit.audit_id = 'audit_' || audit.operation_digest
    from public.testing_center_audit as audit
    join public.testing_center_idempotency as idempotency
      on idempotency.aggregate_id = audit.aggregate_id
    join public.testing_center_validations as validation
      on validation.candidate_id = 'candidate-accept'
    where audit.aggregate_id = 'issue-accept'
  ),
  'accepted vote updates candidate and issue with one validation, audit and idempotency record'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000303', true);
select is(
  (select idempotent from public.testing_center_validate_candidate(
    'testing-center.v1', 'candidate-accept', repeat('c', 40), 'accepted', null,
    'accept-key'
  )),
  true,
  'identical retry returns the original validation without side effects'
);
reset role;

set local role service_role;
select ok(
  (select count(*) = 1 from public.testing_center_validations where candidate_id = 'candidate-accept')
  and (select count(*) = 1 from public.testing_center_audit where aggregate_id = 'issue-accept')
  and (select count(*) = 1 from public.testing_center_idempotency where aggregate_id = 'issue-accept'),
  'idempotent retry preserves exactly one effect'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000303', true);
select throws_ok(
  $$select * from public.testing_center_validate_candidate('testing-center.v1', 'candidate-accept', repeat('c', 40), 'rejected', 'other', 'accept-key')$$,
  '23505', null, 'same idempotency key with another verified payload fails closed'
);
select throws_ok(
  $$select * from public.testing_center_validate_candidate('testing-center.v1', 'candidate-accept', repeat('c', 40), 'accepted', null, 'accept-new-key')$$,
  '55000', null, 'a new key cannot vote again after candidate transition'
);
select throws_ok(
  $$select * from public.testing_center_validate_candidate('testing-center.v2', 'candidate-stale', repeat('f', 40), 'accepted', null, 'version-key')$$,
  '22023', null, 'future contract version fails closed'
);
select throws_ok(
  $$select * from public.testing_center_validate_candidate('testing-center.v1', 'candidate-stale', repeat('f', 40), 'accepted', null, ' bad-key')$$,
  '22023', null, 'malformed idempotency key fails closed'
);
select throws_ok(
  $$select * from public.testing_center_validate_candidate('testing-center.v1', 'candidate-stale', repeat('0', 40), 'accepted', null, 'stale-key')$$,
  '55000', null, 'stale SHA cannot validate a newer candidate'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000301', true);
select throws_ok(
  $$select * from public.testing_center_validate_candidate('testing-center.v1', 'candidate-tester-denied', repeat('d', 40), 'accepted', null, 'tester-nightly-key')$$,
  '42501', null, 'normal tester cannot validate nightly'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000304', true);
select is(
  (select resulting_state from public.testing_center_validate_candidate(
    'testing-center.v1', 'candidate-beta', repeat('e', 40), 'accepted', null,
    'beta-key'
  )),
  'testers_accepted',
  'tester validates an exact testers-channel candidate'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000306', true);
select throws_ok(
  $$select * from public.testing_center_validate_candidate('testing-center.v1', 'candidate-inactive', repeat('1', 40), 'accepted', null, 'inactive-key')$$,
  '42501', null, 'inactive membership cannot validate'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000307', true);
select throws_ok(
  $$select * from public.testing_center_validate_candidate('testing-center.v1', 'candidate-self', repeat('2', 40), 'accepted', null, 'self-key')$$,
  '42501', null, 'candidate author cannot validate its own work'
);
reset role;

set local role service_role;
insert into public.testing_center_pauses (
  pause_id, scope, technical_issue_id, reason_code, requested_by_id,
  requested_by_user_id
) values (
  'pause-access-global', 'global', null, 'test_global', 'owner-main',
  '00000000-0000-4000-8000-000000000305'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000303', true);
select throws_ok(
  $$select * from public.testing_center_validate_candidate('testing-center.v1', 'candidate-global', repeat('3', 40), 'accepted', null, 'global-key')$$,
  '55000', null, 'global pause blocks candidate validation'
);
reset role;

set local role service_role;
update public.testing_center_pauses set is_paused = false where pause_id = 'pause-access-global';
insert into public.testing_center_pauses (
  pause_id, scope, technical_issue_id, reason_code, requested_by_id,
  requested_by_user_id
) values (
  'pause-access-flow', 'flow', 'issue-flow', 'test_flow', 'owner-main',
  '00000000-0000-4000-8000-000000000305'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000303', true);
select throws_ok(
  $$select * from public.testing_center_validate_candidate('testing-center.v1', 'candidate-flow', repeat('4', 40), 'accepted', null, 'flow-key')$$,
  '55000', null, 'flow pause blocks only its candidate aggregate'
);
select is(
  (select resulting_state from public.testing_center_validate_candidate(
    'testing-center.v1', 'candidate-other', repeat('5', 40), 'accepted', null,
    'other-key'
  )),
  'nightly_accepted',
  'pause on another flow does not block a valid candidate'
);
select throws_ok(
  $$select * from public.testing_center_validate_candidate('testing-center.v1', 'candidate-reject', repeat('6', 40), 'accepted', 'other', 'accepted-reason-key')$$,
  '22023', null, 'accepted decision cannot carry a rejection reason'
);
select throws_ok(
  $$select * from public.testing_center_validate_candidate('testing-center.v1', 'candidate-reject', repeat('6', 40), 'rejected', null, 'missing-reason-key')$$,
  '22023', null, 'rejected decision requires a structured reason'
);
select is(
  (select resulting_state from public.testing_center_validate_candidate(
    'testing-center.v1', 'candidate-reject', repeat('6', 40), 'rejected',
    'still_fails', 'reject-key'
  )),
  'nightly_rejected',
  'structured rejection records the rejected state'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000305', true);
select is(
  (select resulting_state from public.testing_center_validate_candidate(
    'testing-center.v1', 'candidate-owner', repeat('7', 40), 'accepted', null,
    'owner-key'
  )),
  'nightly_accepted',
  'owner retains explicit nightly validation authority'
);
reset role;

select * from finish();
rollback;
