-- VANTA-131 / final 7b: v2 agent lineage remains readable only to its owner.
begin;
select plan(23);

select ok(to_regclass('public.testing_center_reports') is null,'legacy report root retired');
select ok(to_regclass('private.testing_center_legacy_archive') is null,'empty archive retired');
select ok(to_regclass('public.testing_center_technical_issues') is not null
  and to_regclass('public.testing_center_agent_jobs') is not null,'v2 agent lineage retained');
select ok(not exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid
  where not t.tgisinternal and c.relkind in ('r','p')
    and encode(t.tgargs,'escape') ~ '(public\.|\m(from|join|update|into|references|table)\s+)testing_center_(reports|evidence|triage_results|issue_occurrences|posthog_consent_events|posthog_evidence|report_events|report_payloads|report_submission_keys|screenshot_evidence|evidence_batches|evidence_outbox)\M'),
  'no surviving trigger reads a retired report table');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname not in ('pg_catalog','information_schema') and p.prokind='f'
    and pg_get_functiondef(p.oid) ~ '((public\.|\m(from|join|update|into|references|table)\s+)testing_center_(reports|evidence|triage_results|issue_occurrences|posthog_consent_events|posthog_evidence|report_events|report_payloads|report_submission_keys|screenshot_evidence|evidence_batches|evidence_outbox)|private\.testing_center_legacy_archive)\M'),
  'no surviving function reads a retired report table');
select ok(exists(select 1 from pg_constraint c
  where c.conrelid='public.testing_center_technical_issues'::regclass
    and c.conname='testing_center_technical_issue_no_legacy_report_id'
    and c.contype='c' and pg_get_constraintdef(c.oid) ~ 'report_id IS NULL'),
  'retained technical issue cannot regain a legacy report_id');
select is((select count(*)::integer from pg_policies where schemaname='storage'
  and tablename='objects' and policyname='testing_center_evidence_insert_own_slot'),0,
  'retired capture slot has no authenticated Storage insert policy');

insert into private.clerk_issuers(issuer,authorized_parties,enabled)
values('https://fixtures.clerk.invalid',array['https://app.invalid'],true)
on conflict(issuer) do nothing;
insert into public.profiles(id) values
 ('18960000-0000-4000-8000-000000000071'),
 ('18960000-0000-4000-8000-000000000072');
insert into public.account_identities(issuer,subject,account_id) values
 ('https://fixtures.clerk.invalid','user_18960000000040008000000000000071',
  '18960000-0000-4000-8000-000000000071'),
 ('https://fixtures.clerk.invalid','user_18960000000040008000000000000072',
  '18960000-0000-4000-8000-000000000072');
insert into public.testing_contributions(id,account_id,channel,title,body) values
 ('18960000-0000-4000-8000-000000000073','18960000-0000-4000-8000-000000000071',
  'testers','V2 issue fixture','V2 issue fixture');
insert into public.testing_center_technical_issues(
  technical_issue_id,contribution_id,state,flow_state,origin) values
 ('issue_v2_'||repeat('7',64),'18960000-0000-4000-8000-000000000073',
  'open','queued','orchestrator');
select throws_ok($$insert into public.testing_center_technical_issues
  (technical_issue_id,report_id,state,flow_state,origin)
  values('issue_v2_'||repeat('8',64),'report_'||repeat('8',64),'open','queued','orchestrator')$$,
  '23514');

select lives_ok($$insert into public.testing_center_agent_jobs
  (job_key,technical_issue_id,execution_generation,policy_version,report_digest,dossier_digest,nightly_base_sha,state)
  values(public.testing_center_agent_job_key('issue_v2_'||repeat('7',64),repeat('a',64),repeat('b',40),'testing-center.autofix-policy.v2'),
    'issue_v2_'||repeat('7',64),1,'testing-center.autofix-policy.v2',repeat('a',64),repeat('c',64),repeat('b',40),'triage_queued')$$,
  'agent job insert works after retired root is dropped');
select lives_ok($$insert into public.testing_center_audit
  (audit_id,aggregate_id,from_state,to_state,origin,actor_id,operation_digest)
  values('v2-retirement-audit','issue_v2_'||repeat('7',64),'reported','queued','orchestrator','fixture',repeat('d',64))$$,
  'audit insert works after retired root is dropped');
select lives_ok($$insert into public.testing_center_idempotency
  (idempotency_key,payload_digest,aggregate_id,from_state,to_state,origin)
  values('v2-retirement-key',repeat('e',64),'issue_v2_'||repeat('7',64),'reported','queued','orchestrator')$$,
  'idempotency insert works after retired root is dropped');
select lives_ok($$insert into public.testing_center_effect_outbox
  (effect_id,effect_key,technical_issue_id,primary_report_id,state)
  values('effect_'||repeat('f',64),'github_issue_create:issue_v2_retirement',
    'issue_v2_'||repeat('7',64),'retired-root-placeholder','failed')$$,
  'inert effect outbox insert works after retired root is dropped');
select lives_ok($$insert into public.testing_center_linear_projection_snapshots
  (effect_id,technical_issue_id,primary_report_id,source_snapshot,source_digest,marker,occurrence_count)
  values('effect_'||repeat('f',64),'issue_v2_'||repeat('7',64),'retired-root-placeholder',
    '{}'::jsonb,repeat('f',64),'v2-retirement-marker',1)$$,
  'inert Linear projection insert works after retired root is dropped');

select ok(not has_table_privilege('anon','public.testing_center_technical_issues','SELECT'),
  'anon has no direct issue read');
select ok(not has_table_privilege('authenticated','public.testing_center_technical_issues','INSERT'),
  'authenticated cannot insert an issue');

set local role authenticated;
select set_config('request.headers','{"x-forwarded-for":"203.0.113.10"}',true);
select set_config('request.jwt.claims',
  '{"iss":"https://fixtures.clerk.invalid","sub":"user_18960000000040008000000000000071","role":"authenticated","sid":"sess_fixture","azp":"https://app.invalid"}',true);
select is((select count(*)::integer from public.testing_center_technical_issues
  where technical_issue_id='issue_v2_'||repeat('7',64)),1,
  'reporter reads own v2 issue without legacy root');
select set_config('request.jwt.claims',
  '{"iss":"https://fixtures.clerk.invalid","sub":"user_18960000000040008000000000000072","role":"authenticated","sid":"sess_fixture","azp":"https://app.invalid"}',true);
select is((select count(*)::integer from public.testing_center_technical_issues
  where technical_issue_id='issue_v2_'||repeat('7',64)),0,
  'other account without membership on the same IP cannot read issue');
select set_config('request.jwt.claims','{}',true);
select is((select count(*)::integer from public.testing_center_technical_issues
  where technical_issue_id='issue_v2_'||repeat('7',64)),0,
  'missing identity cannot read issue');
reset role;

-- A Clerk tombstone must retain the technical issue without retaining the report.
select lives_ok($$select public.apply_clerk_user_event(
  'retirement-delete-71',repeat('a',64),'https://fixtures.clerk.invalid',
  'user_18960000000040008000000000000071','user.deleted',now(),null)$$,
  'Clerk deletion succeeds when a v2 contribution has a technical issue');
select ok((select contribution_id is null from public.testing_center_technical_issues
  where technical_issue_id='issue_v2_'||repeat('7',64)),
  'technical issue remains after the account report is erased');
select is((select count(*)::integer from public.testing_contributions
  where account_id='18960000-0000-4000-8000-000000000071'),0,
  'deleted account has no v2 contribution');
select is((select count(*)::integer from public.account_identities
  where account_id='18960000-0000-4000-8000-000000000071'
    and deleted_at is not null),1,'Clerk account is tombstoned');
select ok(exists(select 1 from pg_trigger where tgname='a_account_write_barrier'
  and tgrelid='public.testing_center_audit'::regclass),
  'audit retains the actor write barrier alongside the v2 lineage barrier');

select * from finish();
rollback;
