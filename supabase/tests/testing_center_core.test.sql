begin;

select plan(72);

select has_table('public', 'testing_center_reports', 'reports table exists');
select has_table('public', 'testing_center_evidence', 'evidence table exists');
select has_table('public', 'testing_center_technical_issues', 'technical issues table exists');
select has_table('public', 'testing_center_codex_runs', 'codex runs table exists');
select has_table('public', 'testing_center_candidate_builds', 'candidate builds table exists');
select has_table('public', 'testing_center_validations', 'validations table exists');
select has_table('public', 'testing_center_promotions', 'promotions table exists');
select has_table('public', 'testing_center_audit', 'audit table exists');
select has_table('public', 'testing_center_idempotency', 'idempotency table exists');
select has_table('public', 'testing_center_pauses', 'pauses table exists');

select is(
  (
    select count(*)::integer
    from information_schema.columns
    where table_schema = 'public'
      and (table_name, column_name) in (
        ('testing_center_reports', 'report_id'),
        ('testing_center_evidence', 'evidence_id'),
        ('testing_center_technical_issues', 'technical_issue_id'),
        ('testing_center_codex_runs', 'run_id'),
        ('testing_center_candidate_builds', 'candidate_id'),
        ('testing_center_validations', 'validation_id'),
        ('testing_center_promotions', 'promotion_id'),
        ('testing_center_audit', 'audit_id'),
        ('testing_center_idempotency', 'idempotency_key'),
        ('testing_center_pauses', 'pause_id')
      )
      and data_type = 'text'
      and column_default is null
  ),
  10,
  'contract identifiers are opaque text without generated defaults'
);

select is(
  (
    select count(*)::integer
    from pg_constraint
    where contype = 'f'
      and conrelid in (
        select c.oid
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname like 'testing_center_%'
      )
  ),
  13,
  'all expected foreign keys exist'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conname = 'testing_center_validations_candidate_fk'
      and pg_get_constraintdef(oid) like
        'FOREIGN KEY (candidate_id, channel, exact_sha, candidate_author_id)%'
  ),
  'validation uses candidate, channel, SHA and author composite foreign key'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conname = 'testing_center_promotions_validation_fk'
      and pg_get_constraintdef(oid) like
        'FOREIGN KEY (validation_id, candidate_id, from_channel, validated_sha, validation_decision)%'
  ),
  'promotion uses validation, candidate, channel, SHA and decision composite foreign key'
);

select is(
  (
    select count(*)::integer
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'i'
      and c.relname = any (array[
        'testing_center_reports_reporter_idx',
        'testing_center_evidence_report_idx',
        'testing_center_issues_flow_idx',
        'testing_center_codex_runs_issue_idx',
        'testing_center_candidates_issue_idx',
        'testing_center_validations_candidate_idx',
        'testing_center_validations_actor_idx',
        'testing_center_promotions_candidate_idx',
        'testing_center_audit_aggregate_idx',
        'testing_center_idempotency_aggregate_idx'
      ])
  ),
  10,
  'all focal lookup indexes exist'
);

select ok(
  exists (
    select 1
    from pg_index
    where indrelid = 'public.testing_center_candidate_builds'::regclass
      and indisunique
      and pg_get_indexdef(indexrelid) like '%(candidate_id, channel, exact_sha)%'
  ),
  'candidate has composite uniqueness for channel and exact SHA'
);

select ok(
  exists (
    select 1
    from pg_index
    where indrelid = 'public.testing_center_validations'::regclass
      and indisunique
      and pg_get_indexdef(indexrelid) like
        '%(validation_id, candidate_id, channel, exact_sha, decision)%'
  ),
  'validation exposes the composite key required by promotions'
);

select is(
  (
    select count(*)::integer
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname like 'testing_center_%'
      and c.relkind = 'r'
      and c.relrowsecurity
  ),
  10,
  'RLS is enabled on every Testing Center table'
);

select is(
  (
    select count(*)::integer
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname like 'testing_center_%'
      and c.relkind = 'r'
      and c.relforcerowsecurity
  ),
  10,
  'RLS is forced on every Testing Center table'
);

select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename like 'testing_center_%'),
  0,
  'Testing Center has zero RLS policies'
);

select is(
  (
    select count(*)::integer
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name like 'testing_center_%'
      and grantee in ('PUBLIC', 'anon', 'authenticated')
  ),
  0,
  'PUBLIC, anon and authenticated have no table grants'
);

select is(
  (
    select count(*)::integer
    from information_schema.tables t
    where t.table_schema = 'public'
      and t.table_name like 'testing_center_%'
      and has_table_privilege('service_role', format('%I.%I', t.table_schema, t.table_name), 'select,insert,update,delete')
  ),
  10,
  'service_role retains the server DML path'
);

select is(
  (
    select count(*)::integer
    from pg_tables
    where schemaname = 'public'
      and tablename like 'testing_center_%'
      and tableowner = 'postgres'
  ),
  10,
  'the migration owner retains ownership of every table'
);

select is(
  (
    select count(*)::integer
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'testing_center_%'
  ),
  0,
  'this cut creates no transition functions or RPCs'
);

set local role anon;
select throws_ok(
  $$select count(*) from public.testing_center_reports$$,
  '42501',
  null,
  'anon cannot read Testing Center rows'
);
select throws_ok(
  $$insert into public.testing_center_reports (report_id, reporter_id, reporter_user_id, reporter_role, channel, state) values ('anon-report', 'anon', '00000000-0000-4000-8000-000000000209', 'tester', 'nightly', 'draft')$$,
  '42501',
  null,
  'anon cannot write Testing Center rows'
);
reset role;

set local role authenticated;
select throws_ok(
  $$select count(*) from public.testing_center_reports$$,
  '42501',
  null,
  'authenticated cannot read Testing Center rows'
);
select throws_ok(
  $$insert into public.testing_center_reports (report_id, reporter_id, reporter_user_id, reporter_role, channel, state) values ('auth-report', 'auth', '00000000-0000-4000-8000-000000000209', 'tester', 'nightly', 'draft')$$,
  '42501',
  null,
  'authenticated cannot write Testing Center rows'
);
reset role;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000209', 'reporter@example.invalid'),
  ('00000000-0000-4000-8000-000000000210', 'validator@example.invalid'),
  ('00000000-0000-4000-8000-000000000211', 'owner@example.invalid');

set local role service_role;
select lives_ok(
  $test$
  do $$
  begin
    insert into public.testing_center_reports (
      report_id, reporter_id, reporter_user_id, reporter_role, channel, state
    ) values (
      'report-valid', 'tester-opaque', '00000000-0000-4000-8000-000000000209',
      'tester', 'nightly', 'submitted'
    );
    insert into public.testing_center_evidence (evidence_id, report_id, kind, digest)
      values ('evidence-valid', 'report-valid', 'diagnostic', repeat('d', 64));
    insert into public.testing_center_technical_issues (
      technical_issue_id, report_id, state, flow_state, origin
    ) values ('issue-valid', 'report-valid', 'open', 'reported', 'testing_center');
    insert into public.testing_center_codex_runs (
      run_id, technical_issue_id, attempt, state, origin
    ) values ('run-valid', 'issue-valid', 1, 'queued', 'orchestrator');
    insert into public.testing_center_candidate_builds (
      candidate_id, technical_issue_id, channel, build_version, exact_sha,
      author_id, state
    ) values (
      'candidate-valid', 'issue-valid', 'nightly', '0.1.0-nightly.209',
      repeat('a', 40), 'codex-author', 'pending'
    );
    insert into public.testing_center_validations (
      validation_id, candidate_id, channel, exact_sha, candidate_author_id,
      decision, actor_id, actor_user_id, actor_role
    ) values (
      'validation-valid', 'candidate-valid', 'nightly', repeat('a', 40),
      'codex-author', 'accepted', 'primary-tester',
      '00000000-0000-4000-8000-000000000210', 'primary_tester'
    );
    insert into public.testing_center_promotions (
      promotion_id, candidate_id, validation_id, from_channel, to_channel,
      exact_sha, validated_sha, state
    ) values (
      'promotion-valid', 'candidate-valid', 'validation-valid', 'nightly',
      'testers', repeat('a', 40), repeat('a', 40), 'pending'
    );
    insert into public.testing_center_audit (
      audit_id, aggregate_id, from_state, to_state, origin, actor_id,
      operation_digest
    ) values (
      'audit-valid', 'issue-valid', 'reported', 'queued', 'orchestrator',
      'orchestrator-main', repeat('e', 64)
    );
    insert into public.testing_center_idempotency (
      idempotency_key, payload_digest, aggregate_id, from_state, to_state, origin
    ) values (
      'idem-valid', repeat('f', 64), 'issue-valid', 'reported', 'queued',
      'orchestrator'
    );
    insert into public.testing_center_pauses (
      pause_id, scope, technical_issue_id, reason_code, requested_by_id,
      requested_by_user_id
    ) values
      ('pause-global', 'global', null, 'maintenance', 'owner-opaque',
       '00000000-0000-4000-8000-000000000211'),
      ('pause-flow', 'flow', 'issue-valid', 'needs_review', 'owner-opaque',
       '00000000-0000-4000-8000-000000000211');
  end
  $$
  $test$,
  'service_role inserts a minimal structurally valid graph'
);

select is(
  (
    select (
      (select count(*) from public.testing_center_reports) = 1
      and (select count(*) from public.testing_center_evidence) = 1
      and (select count(*) from public.testing_center_technical_issues) = 1
      and (select count(*) from public.testing_center_codex_runs) = 1
      and (select count(*) from public.testing_center_candidate_builds) = 1
      and (select count(*) from public.testing_center_validations) = 1
      and (select count(*) from public.testing_center_promotions) = 1
      and (select count(*) from public.testing_center_audit) = 1
      and (select count(*) from public.testing_center_idempotency) = 1
      and (select count(*) from public.testing_center_pauses) = 2
    )::integer
  ),
  1,
  'the valid graph is present exactly once'
);

select throws_ok(
  $$insert into public.testing_center_reports (contract_version, report_id, reporter_id, reporter_user_id, reporter_role, channel, state) values ('testing-center.v2', 'report-version', 'tester', '00000000-0000-4000-8000-000000000209', 'tester', 'nightly', 'draft')$$,
  '23514', null, 'unknown contract version is rejected'
);
select throws_ok(
  $$insert into public.testing_center_reports (report_id, reporter_id, reporter_user_id, reporter_role, channel, state) values ('report-tab' || chr(9), 'tester', '00000000-0000-4000-8000-000000000209', 'tester', 'nightly', 'draft')$$,
  '23514', null, 'opaque identifiers reject trailing non-space whitespace like the Go contract'
);
select throws_ok(
  $$insert into public.testing_center_reports (report_id, reporter_id, reporter_user_id, reporter_role, channel, state) values ('report-channel', 'tester', '00000000-0000-4000-8000-000000000209', 'tester', 'preview', 'draft')$$,
  '23514', null, 'unknown report channel is rejected'
);
select throws_ok(
  $$insert into public.testing_center_reports (report_id, reporter_id, reporter_user_id, reporter_role, channel, state) values ('report-state', 'tester', '00000000-0000-4000-8000-000000000209', 'tester', 'nightly', 'unknown')$$,
  '23514', null, 'unknown report state is rejected'
);
select throws_ok(
  $$insert into public.testing_center_technical_issues (technical_issue_id, report_id, state, flow_state, origin) values ('issue-origin', 'report-valid', 'open', 'reported', 'client')$$,
  '23514', null, 'unknown origin is rejected'
);
select throws_ok(
  $$insert into public.testing_center_candidate_builds (candidate_id, technical_issue_id, channel, build_version, exact_sha, author_id, state) values ('candidate-empty-sha', 'issue-valid', 'nightly', 'build', '', 'codex-author', 'pending')$$,
  '23514', null, 'empty candidate SHA is rejected'
);
select throws_ok(
  $$insert into public.testing_center_candidate_builds (candidate_id, technical_issue_id, channel, build_version, exact_sha, author_id, state) values ('candidate-bad-sha', 'issue-valid', 'nightly', 'build', 'ABC123', 'codex-author', 'pending')$$,
  '23514', null, 'malformed candidate SHA is rejected'
);
select throws_ok(
  $$insert into public.testing_center_evidence (evidence_id, report_id, kind, digest) values ('evidence-digest', 'report-valid', 'diagnostic', 'not-a-digest')$$,
  '23514', null, 'malformed evidence digest is rejected'
);
select throws_ok(
  $$insert into public.testing_center_evidence (evidence_id, report_id, kind, digest) values ('evidence-fk', 'missing-report', 'diagnostic', repeat('a', 64))$$,
  '23503', null, 'evidence with missing report is rejected'
);
select throws_ok(
  $$insert into public.testing_center_codex_runs (run_id, technical_issue_id, attempt, state, origin) values ('run-fk', 'missing-issue', 1, 'queued', 'orchestrator')$$,
  '23503', null, 'codex run with missing issue is rejected'
);
select throws_ok(
  $$insert into public.testing_center_candidate_builds (candidate_id, technical_issue_id, channel, build_version, exact_sha, author_id, state) values ('candidate-fk', 'missing-issue', 'nightly', 'build', repeat('b', 40), 'codex-author', 'pending')$$,
  '23503', null, 'candidate with missing issue is rejected'
);
select throws_ok(
  $$insert into public.testing_center_validations (validation_id, candidate_id, channel, exact_sha, candidate_author_id, decision, actor_id, actor_user_id, actor_role) values ('validation-channel', 'candidate-valid', 'testers', repeat('a', 40), 'codex-author', 'accepted', 'other-tester', '00000000-0000-4000-8000-000000000210', 'tester')$$,
  '23503', null, 'validation with a mismatched candidate channel is rejected'
);
select throws_ok(
  $$insert into public.testing_center_validations (validation_id, candidate_id, channel, exact_sha, candidate_author_id, decision, actor_id, actor_user_id, actor_role) values ('validation-sha', 'candidate-valid', 'nightly', repeat('b', 40), 'codex-author', 'accepted', 'other-tester', '00000000-0000-4000-8000-000000000210', 'primary_tester')$$,
  '23503', null, 'validation with a mismatched candidate SHA is rejected'
);
select throws_ok(
  $$insert into public.testing_center_validations (validation_id, candidate_id, channel, exact_sha, candidate_author_id, decision, actor_id, actor_user_id, actor_role) values ('validation-author', 'candidate-valid', 'nightly', repeat('a', 40), 'other-author', 'accepted', 'other-tester', '00000000-0000-4000-8000-000000000210', 'primary_tester')$$,
  '23503', null, 'validation with a mismatched candidate author is rejected'
);
select throws_ok(
  $$insert into public.testing_center_validations (validation_id, candidate_id, channel, exact_sha, candidate_author_id, decision, actor_id, actor_user_id, actor_role) values ('validation-self', 'candidate-valid', 'nightly', repeat('a', 40), 'codex-author', 'accepted', 'codex-author', '00000000-0000-4000-8000-000000000210', 'primary_tester')$$,
  '23514', null, 'self-validation is rejected'
);
select throws_ok(
  $$insert into public.testing_center_validations (validation_id, candidate_id, channel, exact_sha, candidate_author_id, decision, actor_id, actor_user_id, actor_role, rejection_reason) values ('validation-accepted-reason', 'candidate-valid', 'nightly', repeat('a', 40), 'codex-author', 'accepted', 'other-tester', '00000000-0000-4000-8000-000000000210', 'primary_tester', 'other')$$,
  '23514', null, 'accepted validation cannot contain a rejection reason'
);
select throws_ok(
  $$insert into public.testing_center_validations (validation_id, candidate_id, channel, exact_sha, candidate_author_id, decision, actor_id, actor_user_id, actor_role) values ('validation-rejected-no-reason', 'candidate-valid', 'nightly', repeat('a', 40), 'codex-author', 'rejected', 'other-tester', '00000000-0000-4000-8000-000000000210', 'primary_tester')$$,
  '23514', null, 'rejected validation requires a known rejection reason'
);
select throws_ok(
  $$insert into public.testing_center_promotions (promotion_id, candidate_id, validation_id, from_channel, to_channel, exact_sha, validated_sha, state) values ('promotion-candidate', 'missing-candidate', 'validation-valid', 'nightly', 'testers', repeat('a', 40), repeat('a', 40), 'pending')$$,
  '23503', null, 'promotion with a missing candidate is rejected'
);
insert into public.testing_center_candidate_builds (
  candidate_id, technical_issue_id, channel, build_version, exact_sha, author_id, state
) values (
  'candidate-missing-validation', 'issue-valid', 'nightly',
  'missing-validation-build', repeat('d', 40), 'codex-author', 'pending'
);
select throws_ok(
  $$insert into public.testing_center_promotions (promotion_id, candidate_id, validation_id, from_channel, to_channel, exact_sha, validated_sha, state) values ('promotion-validation', 'candidate-missing-validation', 'missing-validation', 'nightly', 'testers', repeat('d', 40), repeat('d', 40), 'pending')$$,
  '23503', null, 'promotion with a missing validation is rejected'
);
select throws_ok(
  $$insert into public.testing_center_promotions (promotion_id, candidate_id, validation_id, from_channel, to_channel, exact_sha, validated_sha, state) values ('promotion-route', 'candidate-valid', 'validation-valid', 'nightly', 'master', repeat('a', 40), repeat('a', 40), 'pending')$$,
  '23514', null, 'promotion cannot skip the testers channel'
);
select throws_ok(
  $$insert into public.testing_center_promotions (promotion_id, candidate_id, validation_id, from_channel, to_channel, exact_sha, validated_sha, state) values ('promotion-sha', 'candidate-valid', 'validation-valid', 'nightly', 'testers', repeat('a', 40), repeat('b', 40), 'pending')$$,
  '23514', null, 'promotion with a SHA not validated for its candidate is rejected'
);
select throws_ok(
  $test$
  do $$
  begin
    insert into public.testing_center_candidate_builds (
      candidate_id, technical_issue_id, channel, build_version, exact_sha, author_id, state
    ) values ('candidate-auth-null', 'issue-valid', 'nightly', 'auth-null-build', repeat('b', 40), 'codex-author', 'pending');
    insert into public.testing_center_validations (
      validation_id, candidate_id, channel, exact_sha, candidate_author_id,
      decision, actor_id, actor_user_id, actor_role
    ) values (
      'validation-auth-null', 'candidate-auth-null', 'nightly', repeat('b', 40),
      'codex-author', 'accepted', 'primary-tester',
      '00000000-0000-4000-8000-000000000210', 'primary_tester'
    );
    insert into public.testing_center_promotions (
      promotion_id, candidate_id, validation_id, from_channel, to_channel,
      exact_sha, validated_sha, state, authorized_by_user_id,
      authorized_by_role, authorized_origin
    ) values (
      'promotion-auth-null', 'candidate-auth-null', 'validation-auth-null',
      'nightly', 'testers', repeat('b', 40), repeat('b', 40), 'authorized',
      '00000000-0000-4000-8000-000000000210', 'primary_tester',
      'testing_center'
    );
  end
  $$
  $test$,
  '23514', null, 'authorized promotion requires an explicit opaque actor id'
);
select lives_ok(
  $test$
  do $$
  begin
    insert into public.testing_center_candidate_builds (
      candidate_id, technical_issue_id, channel, build_version, exact_sha, author_id, state
    ) values ('candidate-authorized', 'issue-valid', 'nightly', 'authorized-build', repeat('c', 40), 'codex-author', 'pending');
    insert into public.testing_center_validations (
      validation_id, candidate_id, channel, exact_sha, candidate_author_id,
      decision, actor_id, actor_user_id, actor_role
    ) values (
      'validation-authorized', 'candidate-authorized', 'nightly', repeat('c', 40),
      'codex-author', 'accepted', 'primary-tester',
      '00000000-0000-4000-8000-000000000210', 'primary_tester'
    );
    insert into public.testing_center_promotions (
      promotion_id, candidate_id, validation_id, from_channel, to_channel,
      exact_sha, validated_sha, state, authorized_by_id, authorized_by_user_id,
      authorized_by_role, authorized_origin
    ) values (
      'promotion-authorized', 'candidate-authorized', 'validation-authorized',
      'nightly', 'testers', repeat('c', 40), repeat('c', 40), 'authorized',
      'primary-tester', '00000000-0000-4000-8000-000000000210',
      'primary_tester', 'testing_center'
    );
  end
  $$
  $test$,
  'authorized promotion accepts a complete human authorization snapshot'
);
select throws_ok(
  $$insert into public.testing_center_promotions (promotion_id, candidate_id, validation_id, from_channel, to_channel, exact_sha, validated_sha, state) values ('promotion-duplicate', 'candidate-valid', 'validation-valid', 'nightly', 'testers', repeat('a', 40), repeat('a', 40), 'pending')$$,
  '23505', null, 'one candidate SHA cannot create duplicate promotion records for the same route'
);
select throws_ok(
  $$insert into public.testing_center_idempotency (idempotency_key, payload_digest, aggregate_id, from_state, to_state, origin) values ('idem-valid', repeat('0', 64), 'issue-valid', 'reported', 'queued', 'orchestrator')$$,
  '23505', null, 'same aggregate and idempotency key cannot accept a conflicting payload'
);
select lives_ok(
  $$insert into public.testing_center_idempotency (idempotency_key, payload_digest, aggregate_id, from_state, to_state, origin) values ('idem-valid', repeat('0', 64), 'another-aggregate', 'reported', 'queued', 'orchestrator')$$,
  'idempotency keys are scoped by opaque aggregate id'
);
select throws_ok(
  $$insert into public.testing_center_idempotency (idempotency_key, payload_digest, aggregate_id, from_state, to_state, origin) values ('idem-sensitive-missing-sha', repeat('1', 64), 'issue-valid', 'nightly_candidate', 'nightly_accepted', 'testing_center')$$,
  '23514', null, 'a SHA-sensitive transition cannot persist idempotency without exact SHA'
);
select lives_ok(
  $$insert into public.testing_center_idempotency (idempotency_key, payload_digest, aggregate_id, from_state, to_state, exact_sha, origin) values ('idem-sensitive-valid', repeat('2', 64), 'issue-valid', 'nightly_candidate', 'nightly_accepted', repeat('a', 40), 'testing_center')$$,
  'a SHA-sensitive transition persists idempotency when exact SHA is present'
);
select lives_ok(
  $$insert into public.testing_center_idempotency (idempotency_key, payload_digest, aggregate_id, from_state, to_state, origin) values ('idem-needs-owner', repeat('3', 64), 'issue-valid', 'nightly_candidate', 'needs_owner', 'orchestrator')$$,
  'needs_owner escalation remains exempt from SHA like the Go transition contract'
);
select throws_ok(
  $$insert into public.testing_center_pauses (pause_id, scope, technical_issue_id, reason_code, requested_by_id, requested_by_user_id) values ('pause-global-issue', 'global', 'issue-valid', 'bad_scope', 'owner', '00000000-0000-4000-8000-000000000211')$$,
  '23514', null, 'global pause cannot point to one flow'
);
select throws_ok(
  $$insert into public.testing_center_pauses (pause_id, scope, technical_issue_id, reason_code, requested_by_id, requested_by_user_id) values ('pause-flow-null', 'flow', null, 'bad_scope', 'owner', '00000000-0000-4000-8000-000000000211')$$,
  '23514', null, 'flow pause requires a technical issue'
);
select throws_ok(
  $$insert into public.testing_center_audit (audit_id, aggregate_id, from_state, to_state, origin, actor_id, actor_user_id, actor_role, operation_digest) values ('audit-origin', 'issue-valid', 'reported', 'queued', 'codex', 'codex-agent', '00000000-0000-4000-8000-000000000210', 'tester', repeat('a', 64))$$,
  '23514', null, 'automated audit origins cannot impersonate human identity fields'
);
select throws_ok(
  $$insert into public.testing_center_audit (audit_id, aggregate_id, from_state, to_state, origin, actor_id, operation_digest) values ('audit-same-state', 'issue-valid', 'queued', 'queued', 'orchestrator', 'orchestrator-main', repeat('a', 64))$$,
  '23514', null, 'audit rejects a no-op state pair'
);
select throws_ok(
  $$insert into public.testing_center_candidate_builds (candidate_id, technical_issue_id, channel, build_version, exact_sha, author_id, state) values ('candidate-channel', 'issue-valid', 'master', 'build', repeat('c', 40), 'codex-author', 'pending')$$,
  '23514', null, 'candidate channel outside validation stages is rejected'
);
select throws_ok(
  $$insert into public.testing_center_codex_runs (run_id, technical_issue_id, attempt, state, origin) values ('run-state', 'issue-valid', 2, 'completed', 'codex')$$,
  '23514', null, 'unknown codex run state is rejected'
);
select throws_ok(
  $$insert into public.testing_center_promotions (promotion_id, candidate_id, validation_id, from_channel, to_channel, exact_sha, validated_sha, state) values ('promotion-state', 'candidate-valid', 'validation-valid', 'nightly', 'testers', repeat('a', 40), repeat('a', 40), 'released')$$,
  '23514', null, 'unknown promotion state is rejected'
);
select throws_ok(
  $$insert into public.testing_center_evidence (evidence_id, report_id, kind, digest) values ('evidence-duplicate', 'report-valid', 'diagnostic', repeat('d', 64))$$,
  '23505', null, 'duplicate report evidence identity is rejected'
);
select throws_ok(
  $$insert into public.testing_center_technical_issues (technical_issue_id, report_id, state, flow_state, origin) values ('issue-duplicate-report', 'report-valid', 'open', 'reported', 'testing_center')$$,
  '23505', null, 'one report cannot open multiple technical issue aggregates'
);
select throws_ok(
  $$insert into public.testing_center_codex_runs (run_id, technical_issue_id, attempt, state, origin) values ('run-duplicate-attempt', 'issue-valid', 1, 'running', 'codex')$$,
  '23505', null, 'codex attempt number is unique per technical issue'
);
select throws_ok(
  $$insert into public.testing_center_candidate_builds (candidate_id, technical_issue_id, channel, build_version, exact_sha, author_id, state) values ('candidate-duplicate-sha', 'issue-valid', 'nightly', 'other-build', repeat('a', 40), 'other-author', 'pending')$$,
  '23505', null, 'candidate SHA is unique per issue and channel'
);
select throws_ok(
  $$insert into public.testing_center_validations (validation_id, candidate_id, channel, exact_sha, candidate_author_id, decision, actor_id, actor_user_id, actor_role) values ('validation-duplicate-actor', 'candidate-valid', 'nightly', repeat('a', 40), 'codex-author', 'accepted', 'primary-tester', '00000000-0000-4000-8000-000000000210', 'primary_tester')$$,
  '23505', null, 'one actor cannot validate the same candidate SHA twice'
);
select throws_ok(
  $$insert into public.testing_center_pauses (pause_id, scope, technical_issue_id, reason_code, requested_by_id, requested_by_user_id) values ('pause-global-duplicate', 'global', null, 'duplicate', 'owner', '00000000-0000-4000-8000-000000000211')$$,
  '23505', null, 'only one global pause row can exist'
);

reset role;
select * from finish();
rollback;
