begin;
select plan(61);

select has_table('public', 'testing_center_codex_execution_control', 'durable Codex control exists');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.testing_center_codex_execution_control'::regclass), 'Codex control forces RLS');
select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='testing_center_codex_execution_control'), 0, 'no client policy exists');
select ok(not has_table_privilege('authenticated', 'public.testing_center_codex_execution_control', 'select'), 'authenticated cannot read Codex control');
select ok(has_table_privilege('service_role', 'public.testing_center_codex_execution_control', 'select,insert,update,delete'), 'service role owns Codex control');
select has_column('public', 'testing_center_report_payloads', 'diagnostic_transport_size', 'exact transport size is persisted');
select ok(has_function_privilege('authenticated', 'public.testing_center_submit_report(text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text)', 'execute'), 'authenticated uses the size-aware submit wrapper');
select ok(not has_function_privilege('authenticated', 'public.testing_center_submit_report_without_transport_size(text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text)', 'execute'), 'legacy submit body is not client callable');
select ok(not has_function_privilege('authenticated', 'public.testing_center_load_codex_evidence(text)', 'execute'), 'authenticated cannot load Codex evidence');
select ok(has_function_privilege('service_role', 'public.testing_center_claim_codex_dry_run(text,text,integer)', 'execute'), 'service role can claim a dry-run');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('testing_center_load_codex_evidence','testing_center_queue_codex_dry_run','testing_center_claim_codex_dry_run','testing_center_authorize_codex_dispatch','testing_center_record_codex_outcome','testing_center_fail_codex_before_dispatch') and p.prosecdef and p.proconfig[1]='search_path=""'), 6, 'six Codex functions are hardened');

insert into auth.users(id,email) values ('00000000-0000-4000-8000-000000000701','codex-control@example.invalid');
set role service_role;
insert into public.testing_center_memberships(user_id,actor_id,role,active)
values ('00000000-0000-4000-8000-000000000701','codex-tester','primary_tester',true);
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000701',true);
set role authenticated;
create temporary table wrapper_submission as
select result.*,fixture.payload
from (
  select jsonb_build_object(
    'contractVersion','testing-center.diagnostic.v1','generatedAtUtc',now()::text,
    'application',jsonb_build_object('version','0.1.0','channel','nightly','os','windows','arch','amd64'),
    'module','testing_center','errorCode','ui.wrapper','logs','[]'::jsonb,
    'sanitization',jsonb_build_object('inputLogs',0,'includedLogs',0,'omittedLogs',0,'redactedValues',0,'truncatedMessages',0)
  )::text as payload
) as fixture
cross join lateral public.testing_center_submit_report(
  'testing-center.v1','nightly','Open wrapper','Wrapper stores exact size','Wrapper stores nothing',null,
  '0.1.0','windows','Windows 11','testing_center',true,false,fixture.payload,
  encode(public.digest(convert_to(fixture.payload,'UTF8'),'sha256'),'hex'),'codex-wrapper-test'
) as result;
reset role;
select is((select report_state from wrapper_submission),'submitted','authenticated wrapper submits the report');
select is((select payload_row.diagnostic_transport_size=octet_length(wrapper.payload) from wrapper_submission wrapper join public.testing_center_report_payloads payload_row on payload_row.report_id=wrapper.report_id),true,'wrapper stores exact transport byte size');
set role service_role;

create temporary table diagnostic_fixture as
select payload,
  encode(public.digest(convert_to(payload,'UTF8'),'sha256'),'hex') as digest,
  octet_length(payload)::integer as byte_size
from (
  select jsonb_build_object(
    'contractVersion','testing-center.diagnostic.v1',
    'generatedAtUtc','2026-08-02T00:00:00Z',
    'application',jsonb_build_object('version','0.1.0','channel','nightly','os','windows','arch','amd64'),
    'module','testing_center',
    'errorCode','ui.button.disabled',
    'logs',jsonb_build_array(jsonb_build_object('offsetMillis',1,'source','frontend','level','error','code','private.code','message','tester@example.com Bearer secret-token')),
    'sanitization',jsonb_build_object('inputLogs',1,'includedLogs',1,'omittedLogs',0,'redactedValues',0,'truncatedMessages',0)
  )::text as payload
) as source;

insert into public.testing_center_reports(report_id,reporter_id,reporter_user_id,reporter_role,channel,state)
values
  ('report_'||repeat('d',64),'codex-tester','00000000-0000-4000-8000-000000000701','primary_tester','nightly','validated'),
  ('report_'||repeat('e',64),'codex-tester','00000000-0000-4000-8000-000000000701','primary_tester','nightly','validated'),
  ('report_'||repeat('f',64),'codex-tester','00000000-0000-4000-8000-000000000701','primary_tester','nightly','validated'),
  ('report_'||repeat('9',64),'codex-tester','00000000-0000-4000-8000-000000000701','primary_tester','nightly','validated');

insert into public.testing_center_report_payloads(
  report_id,action_text,expected_text,observed_text,app_version,os_family,os_version,module,
  include_diagnostic,include_logs,diagnostic_document,diagnostic_transport_digest,diagnostic_transport_size
)
select report_id,'Open Testing Center','Button becomes enabled','Button remains disabled','0.1.0','windows','Windows 11','testing_center',
  true,true,fixture.payload::jsonb,fixture.digest,
  case when report_id='report_'||repeat('9',64) then null else fixture.byte_size end
from (values
  ('report_'||repeat('d',64)),('report_'||repeat('e',64)),
  ('report_'||repeat('f',64)),('report_'||repeat('9',64))
) as reports(report_id)
cross join diagnostic_fixture as fixture;

insert into public.testing_center_evidence(evidence_id,report_id,kind,digest)
select 'evidence_'||substr(report_id,8),report_id,'diagnostic',fixture.digest
from (values
  ('report_'||repeat('d',64)),('report_'||repeat('e',64)),
  ('report_'||repeat('f',64)),('report_'||repeat('9',64))
) as reports(report_id)
cross join diagnostic_fixture as fixture;

insert into public.testing_center_technical_issues(technical_issue_id,report_id,state,flow_state,origin)
values
  ('issue_'||repeat('a',64),'report_'||repeat('d',64),'open','queued','orchestrator'),
  ('issue_'||repeat('b',64),'report_'||repeat('e',64),'open','queued','orchestrator'),
  ('issue_'||repeat('c',64),'report_'||repeat('f',64),'open','queued','orchestrator'),
  ('issue_'||repeat('9',64),'report_'||repeat('9',64),'open','queued','orchestrator');

create temporary table loaded_evidence as
select * from public.testing_center_load_codex_evidence('issue_'||repeat('a',64));
select is((select count(*)::integer from loaded_evidence),1,'loader returns one evidence row');
select is((select encode(public.digest(convert_to(evidence_text,'UTF8'),'sha256'),'hex')=evidence_digest from loaded_evidence),true,'evidence digest covers exact canonical text');
select is((select source_diagnostic_digest=(select digest from diagnostic_fixture) from loaded_evidence),true,'source transport digest is preserved');
select is((select (evidence_text::jsonb->'source'->>'diagnosticByteSize')::integer=(select byte_size from diagnostic_fixture) from loaded_evidence),true,'source transport size is preserved');
select is((select position('tester@example.com' in evidence_text) from loaded_evidence),0,'free log message is omitted');
select is((select position('private.code' in evidence_text) from loaded_evidence),0,'free log code is omitted');
select ok((select evidence_text::jsonb->'logs'->0->>'source'='frontend' from loaded_evidence),'allowlisted log metadata remains');
select is((select count(*)::integer from jsonb_object_keys((select evidence_text::jsonb from loaded_evidence))),6,'evidence projection has a closed root shape');

create temporary table first_queue as select * from public.testing_center_queue_codex_dry_run(
  'issue_'||repeat('a',64),repeat('1',64),(select evidence_digest from loaded_evidence),repeat('2',40),repeat('3',40),repeat('4',64)
);
select is((select queue_status from first_queue),'queued','first automatic dry-run is queued');
select is((select count(*)::integer from public.testing_center_codex_execution_control),1,'one durable control row exists');
select is((select attempt::text||':'||state from public.testing_center_codex_runs where technical_issue_id='issue_'||repeat('a',64)),'1:queued','automatic run uses attempt one');
select is((select queue_status from public.testing_center_queue_codex_dry_run('issue_'||repeat('a',64),repeat('1',64),(select evidence_digest from loaded_evidence),repeat('2',40),repeat('3',40),repeat('4',64))),'existing','identical queue retry is idempotent');
select throws_ok($$select * from public.testing_center_queue_codex_dry_run('issue_'||repeat('a',64),repeat('5',64),(select evidence_digest from loaded_evidence),repeat('2',40),repeat('3',40),repeat('4',64))$$,'23505','testing_center_codex_queue_conflict','changed request cannot consume another automatic attempt');
select throws_ok($$select * from public.testing_center_queue_codex_dry_run('issue_'||repeat('a',64),repeat('1',64),repeat('0',64),repeat('2',40),repeat('3',40),repeat('4',64))$$,'22023','testing_center_codex_evidence_digest_mismatch','queue revalidates server evidence digest');

select throws_ok($$select * from public.testing_center_claim_codex_dry_run('issue_'||repeat('a',64),'INVALID WORKER',60)$$,'22023','testing_center_codex_claim_invalid','invalid worker fails closed');
create temporary table claim_a as select * from public.testing_center_claim_codex_dry_run('issue_'||repeat('a',64),'worker-a',60);
select is((select claim_status from claim_a),'claimed','first worker claims');
select is((select fencing_token from claim_a),1::bigint,'first claim receives fencing token one');
select is((select state from public.testing_center_codex_execution_control where technical_issue_id='issue_'||repeat('a',64)),'claimed','claim is durable');
select is((select claim_status from public.testing_center_claim_codex_dry_run('issue_'||repeat('a',64),'worker-b',60)),'busy','second worker cannot share active lease');

insert into public.testing_center_pauses(pause_id,scope,technical_issue_id,is_paused,reason_code,requested_by_id,requested_by_user_id,requested_by_role)
values ('codex-flow-pause','flow','issue_'||repeat('a',64),true,'owner_test','owner','00000000-0000-4000-8000-000000000701','owner');
select throws_ok($$select * from public.testing_center_authorize_codex_dispatch('issue_'||repeat('a',64),'worker-a',1)$$,'55000','testing_center_paused','late pause is rechecked immediately before dispatch');
update public.testing_center_pauses set is_paused=false where pause_id='codex-flow-pause';
update public.testing_center_codex_execution_control set lease_expires_at=now()-interval '1 second' where technical_issue_id='issue_'||repeat('a',64);
create temporary table claim_b as select * from public.testing_center_claim_codex_dry_run('issue_'||repeat('a',64),'worker-b',60);
select is((select claim_status from claim_b),'claimed','expired pre-dispatch lease is recoverable after restart');
select is((select fencing_token from claim_b),2::bigint,'recovery increments monotonic fence');
select throws_ok($$select * from public.testing_center_authorize_codex_dispatch('issue_'||repeat('a',64),'worker-a',1)$$,'55000','testing_center_codex_lease_lost','stale worker cannot dispatch');
select lives_ok($$select * from public.testing_center_authorize_codex_dispatch('issue_'||repeat('a',64),'worker-b',2)$$,'current fenced worker receives one dispatch permit');
select is((select state||':'||dispatch_count from public.testing_center_codex_execution_control where technical_issue_id='issue_'||repeat('a',64)),'dispatching:1','dispatch permit is durable and counted once');
select is((select claim_status from public.testing_center_claim_codex_dry_run('issue_'||repeat('a',64),'worker-c',60)),'busy','dispatching work is never reclaimed automatically');
select lives_ok($$select public.testing_center_record_codex_outcome('issue_'||repeat('a',64),'worker-b',2,'ambiguous_response',null)$$,'ambiguous response is recorded without retry');
select is((select state||':'||outcome_code from public.testing_center_codex_execution_control where technical_issue_id='issue_'||repeat('a',64)),'needs_owner:ambiguous_response','ambiguity routes to owner');
select is((select state from public.testing_center_codex_runs where technical_issue_id='issue_'||repeat('a',64)),'needs_owner','run mirrors owner gate');
select is((select claim_status from public.testing_center_claim_codex_dry_run('issue_'||repeat('a',64),'worker-c',60)),'needs_owner','ambiguous run cannot retry automatically');

create temporary table loaded_b as select * from public.testing_center_load_codex_evidence('issue_'||repeat('b',64));
select is((select queue_status from public.testing_center_queue_codex_dry_run('issue_'||repeat('b',64),repeat('5',64),(select evidence_digest from loaded_b),repeat('6',40),repeat('7',40),repeat('8',64))),'queued','second issue queues after terminal ambiguity');
insert into public.testing_center_pauses(pause_id,scope,technical_issue_id,is_paused,reason_code,requested_by_id,requested_by_user_id,requested_by_role)
values ('codex-global-pause','global',null,true,'owner_test','owner','00000000-0000-4000-8000-000000000701','owner');
select is((select claim_status from public.testing_center_claim_codex_dry_run('issue_'||repeat('b',64),'worker-a',60)),'paused','global pause blocks claim');
update public.testing_center_pauses set is_paused=false where pause_id='codex-global-pause';
select is((select claim_status from public.testing_center_claim_codex_dry_run('issue_'||repeat('b',64),'worker-a',60)),'claimed','unpaused issue can claim');
select lives_ok($$select * from public.testing_center_authorize_codex_dispatch('issue_'||repeat('b',64),'worker-a',1)$$,'second issue receives dispatch permit');
select lives_ok($$select public.testing_center_record_codex_outcome('issue_'||repeat('b',64),'worker-a',1,'proposed',repeat('9',64))$$,'closed dry-run outcome completes');
select is((select state||':'||outcome_code||':'||dispatch_count from public.testing_center_codex_execution_control where technical_issue_id='issue_'||repeat('b',64)),'completed:proposed:1','completed outcome is durable');
select is((select state from public.testing_center_codex_runs where technical_issue_id='issue_'||repeat('b',64)),'completed','run mirrors completion');
select is((select claim_status from public.testing_center_claim_codex_dry_run('issue_'||repeat('b',64),'worker-b',60)),'completed','completed run never reclaims');

create temporary table loaded_c as select * from public.testing_center_load_codex_evidence('issue_'||repeat('c',64));
select is((select queue_status from public.testing_center_queue_codex_dry_run('issue_'||repeat('c',64),repeat('a',64),(select evidence_digest from loaded_c),repeat('b',40),repeat('c',40),repeat('d',64))),'queued','third issue queues for pre-dispatch failure');
update public.testing_center_technical_issues set flow_state='stopped' where technical_issue_id='issue_'||repeat('c',64);
select is((select claim_status from public.testing_center_claim_codex_dry_run('issue_'||repeat('c',64),'worker-a',60)),'not_ready','stopped issue cannot retain automation authority');
update public.testing_center_technical_issues set flow_state='queued' where technical_issue_id='issue_'||repeat('c',64);
select is((select claim_status from public.testing_center_claim_codex_dry_run('issue_'||repeat('c',64),'worker-a',60)),'claimed','third issue claims');
select lives_ok($$select public.testing_center_fail_codex_before_dispatch('issue_'||repeat('c',64),'worker-a',1)$$,'pre-dispatch failure closes automatic attempt');
select is((select state||':'||outcome_code||':'||dispatch_count from public.testing_center_codex_execution_control where technical_issue_id='issue_'||repeat('c',64)),'failed:pre_dispatch_failure:0','failure before effect performs no dispatch');
select is((select claim_status from public.testing_center_claim_codex_dry_run('issue_'||repeat('c',64),'worker-b',60)),'failed','failed automatic attempt cannot retry');
select is((select count(*)::integer from public.testing_center_codex_execution_control where technical_issue_id='issue_'||repeat('c',64)),1,'one issue has at most one automatic control row');

select throws_ok($$select * from public.testing_center_load_codex_evidence('issue_'||repeat('9',64))$$,'22023','testing_center_codex_evidence_invalid','legacy row without exact transport size fails closed');
update public.testing_center_report_payloads set diagnostic_document=diagnostic_document||'{"extra":"private"}'::jsonb where report_id='report_'||repeat('d',64);
select throws_ok($$select * from public.testing_center_load_codex_evidence('issue_'||repeat('a',64))$$,'22023','testing_center_codex_evidence_invalid','tampered stored diagnostic shape fails closed');

select * from finish();
rollback;
