begin;
select plan(71);

select has_table('public','testing_center_agent_jobs','v2 jobs table exists');
select has_table('public','testing_center_agent_effect_outbox','v2 effect outbox exists');
select has_table('public','testing_center_agent_callbacks','v2 callbacks exist');
select has_table('public','testing_center_agent_reservations','v2 reservations exist');
select has_table('public','testing_center_agent_audit','v2 audit exists');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.testing_center_agent_jobs'::regclass),'jobs force RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.testing_center_agent_effect_outbox'::regclass),'outbox forces RLS');
select ok(not has_table_privilege('authenticated','public.testing_center_agent_jobs','select'),'authenticated cannot read jobs');
select ok(has_table_privilege('service_role','public.testing_center_agent_jobs','select'),'service role can read jobs');
select ok(not has_table_privilege('service_role','public.testing_center_agent_jobs','insert'),'service role cannot bypass job functions');
select ok(has_function_privilege('service_role','public.testing_center_queue_agent_job(text,text,integer,text,text,text,text)','execute'),'service role can queue jobs');
select ok(not has_function_privilege('authenticated','public.testing_center_queue_agent_job(text,text,integer,text,text,text,text)','execute'),'authenticated cannot queue jobs');
select is((
  select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in (
    'testing_center_agent_job_key','testing_center_agent_transition_allowed',
    'testing_center_transition_agent_job',
    'testing_center_queue_agent_effect','testing_center_queue_agent_job',
    'testing_center_claim_agent_effect','testing_center_reserve_agent_effect',
    'testing_center_complete_agent_effect','testing_center_expire_reserved_agent_effect',
    'testing_center_record_agent_callback','testing_center_reserve_agent_resource'
  ) and p.prosecdef and p.proconfig[1]='search_path=""'
),11,'all eleven v2 functions are hardened');

insert into auth.users(id,email)
values ('00000000-0000-4000-8000-000000000320','isa320@example.invalid');
insert into public.testing_center_reports(
  report_id,reporter_id,reporter_user_id,reporter_role,channel,state
)
select 'report_'||repeat(n,64),'isa320-tester','00000000-0000-4000-8000-000000000320',
  'primary_tester','nightly','validated'
from unnest(array['1','2','3','4','5','6','7']) n;

create temporary table isa320_job_keys as
select n,public.testing_center_agent_job_key(
  'issue_'||repeat(n,64),report_digest,nightly_sha,'testing-center.autofix-policy.v2'
) as job_key
from (values
  ('1',repeat('b',64),repeat('d',40)),('2',repeat('2',64),repeat('2',40)),
  ('3',repeat('3',64),repeat('3',40)),('4',repeat('4',64),repeat('4',40)),
  ('5',repeat('5',64),repeat('5',40)),('6',repeat('6',64),repeat('6',40)),
  ('7',repeat('7',64),repeat('7',40))
) as inputs(n,report_digest,nightly_sha);
grant select on isa320_job_keys to service_role;

select ok((select job_key~'^[0-9a-f]{64}$' from isa320_job_keys where n='1'),'canonical job key is a lowercase SHA-256');
select ok(not has_function_privilege('authenticated','public.testing_center_agent_job_key(text,text,text,text)','execute'),'clients cannot derive authoritative job keys through RPC');
insert into public.testing_center_technical_issues(
  technical_issue_id,report_id,state,flow_state,origin
)
select 'issue_'||repeat(n,64),'report_'||repeat(n,64),'open','queued','orchestrator'
from unnest(array['1','2','3','4','5','6','7']) n;

set role service_role;
select throws_ok(
  $$select * from public.testing_center_queue_agent_job(
    repeat('a',64),'issue_'||repeat('1',64),1,'testing-center.autofix-policy.v2',
    repeat('b',64),repeat('c',64),repeat('d',40))$$,
  '22023','testing_center_agent_job_key_mismatch','caller cannot choose a non-canonical job key'
);
select throws_ok(
  $$select * from public.testing_center_queue_agent_job(
    (select job_key from isa320_job_keys where n='1'),'issue_'||repeat('1',64),2,'testing-center.autofix-policy.v2',
    repeat('b',64),repeat('c',64),repeat('d',40))$$,
  '22023','testing_center_agent_job_invalid','generation greater than one is rejected'
);
create temporary table first_queue as select * from public.testing_center_queue_agent_job(
  (select job_key from isa320_job_keys where n='1'),'issue_'||repeat('1',64),1,'testing-center.autofix-policy.v2',
  repeat('b',64),repeat('c',64),repeat('d',40)
);
select is((select queue_status from first_queue),'queued','first queue creates the job');
select is((select count(*)::integer from public.testing_center_agent_jobs where job_key=(select job_key from isa320_job_keys where n='1')),1,'one durable job exists');
select is((select count(*)::integer from public.testing_center_agent_effect_outbox where job_key=(select job_key from isa320_job_keys where n='1') and effect_target='triage'),1,'queue creates one triage effect');
select is((select queue_status from public.testing_center_queue_agent_job(
  (select job_key from isa320_job_keys where n='1'),'issue_'||repeat('1',64),1,'testing-center.autofix-policy.v2',
  repeat('b',64),repeat('c',64),repeat('d',40)
)),'existing','identical queue replay is idempotent');
select is((select count(*)::integer from public.testing_center_agent_jobs where technical_issue_id='issue_'||repeat('1',64)),1,'queue replay cannot create another generation');
select throws_ok(
  $$select * from public.testing_center_queue_agent_job(
    (select job_key from isa320_job_keys where n='1'),'issue_'||repeat('1',64),1,'testing-center.autofix-policy.v2',
    repeat('b',64),repeat('e',64),repeat('d',40))$$,
  '23505','testing_center_agent_job_conflict','changed immutable dossier conflicts'
);
select throws_ok(
  $$select public.testing_center_transition_agent_job(
    (select job_key from isa320_job_keys where n='1'),'triage_queued','eligible','test-worker',repeat('1',64))$$,
  '55000','testing_center_agent_job_transition_illegal','closed state machine rejects skipped transitions'
);
select throws_ok(
  $$select * from public.testing_center_claim_agent_effect('INVALID WORKER',60)$$,
  '22023','testing_center_agent_claim_invalid','invalid worker fails closed'
);
create temporary table first_claim as select * from public.testing_center_claim_agent_effect('worker-a',60);
select is((select count(*)::integer from first_claim),1,'first worker claims one effect');
select is((select fencing_token from first_claim),1::bigint,'first claim receives fence one');
select is((select count(*)::integer from public.testing_center_claim_agent_effect('worker-b',60)),0,'second worker cannot share the active lease');
select is(public.testing_center_reserve_agent_effect((select effect_id from first_claim),'worker-a',1),'reserved','current fence reserves the external effect');
select is((select triage_dispatch_count from public.testing_center_agent_jobs where job_key=(select job_key from isa320_job_keys where n='1')),1::smallint,'triage dispatch is reserved exactly once');
select throws_ok(
  $$select public.testing_center_reserve_agent_effect((select effect_id from first_claim),'worker-b',1)$$,
  '55000','testing_center_agent_effect_fencing_stale','stale worker cannot reserve a dispatch'
);
select is(public.testing_center_complete_agent_effect((select effect_id from first_claim),'worker-a',1,'delivered',repeat('2',64)),'completed','delivered effect completes');
select is((select state from public.testing_center_agent_effect_outbox where effect_id=(select effect_id from first_claim)),'completed','completed effect is durable');
select is(public.testing_center_complete_agent_effect((select effect_id from first_claim),'worker-a',1,'delivered',repeat('2',64)),'completed','identical effect completion replays');

create temporary table eligible_callback as select * from public.testing_center_record_agent_callback(
  'delivery-eligible',(select job_key from isa320_job_keys where n='1'),repeat('d',40),'triage','eligible',repeat('3',64)
);
select is((select callback_status from eligible_callback),'applied','eligible triage callback applies');
select is((select state from public.testing_center_agent_jobs where job_key=(select job_key from isa320_job_keys where n='1')),'eligible','triage callback reaches eligible through triaged');
select is((select count(*)::integer from public.testing_center_agent_callbacks where job_key=(select job_key from isa320_job_keys where n='1')),1,'callback is durable once');
select is((select count(*)::integer from public.testing_center_agent_effect_outbox where job_key=(select job_key from isa320_job_keys where n='1') and effect_target='fix'),1,'eligible callback queues one fix effect');
select is((select state from public.testing_center_agent_jobs where job_key=(select job_key from isa320_job_keys where n='1')),'eligible','triage callback does not start RED');
select is((select callback_status from public.testing_center_record_agent_callback(
  'delivery-eligible',(select job_key from isa320_job_keys where n='1'),repeat('d',40),'triage','eligible',repeat('3',64)
)),'duplicate','identical callback replay converges');
select is((select count(*)::integer from public.testing_center_agent_callbacks where job_key=(select job_key from isa320_job_keys where n='1')),1,'callback replay stays single');
select is((select count(*)::integer from public.testing_center_agent_effect_outbox where job_key=(select job_key from isa320_job_keys where n='1') and effect_target='fix'),1,'callback replay cannot duplicate fix dispatch');
select is(public.testing_center_reserve_agent_resource((select job_key from isa320_job_keys where n='1'),'branch','branch-a',repeat('4',64)),'reserved','first branch reservation is durable');
select is(public.testing_center_reserve_agent_resource((select job_key from isa320_job_keys where n='1'),'branch','branch-a',repeat('4',64)),'existing','identical reservation replays');
select is(public.testing_center_reserve_agent_resource((select job_key from isa320_job_keys where n='1'),'branch','branch-conflict',repeat('5',64)),'needs_owner','conflicting reservation routes to owner');
select is((select state from public.testing_center_agent_jobs where job_key=(select job_key from isa320_job_keys where n='1')),'needs_owner','reservation ambiguity closes automation');
select throws_ok(
  $$select public.testing_center_transition_agent_job(
    (select job_key from isa320_job_keys where n='1'),'needs_owner','eligible','test-worker',repeat('6',64))$$,
  '55000','testing_center_agent_job_transition_illegal','terminal needs_owner cannot become executable'
);

select is((select queue_status from public.testing_center_queue_agent_job(
  (select job_key from isa320_job_keys where n='2'),'issue_'||repeat('2',64),1,'testing-center.autofix-policy.v2',
  repeat('2',64),repeat('7',64),repeat('2',40)
)),'queued','second job queues');
select throws_ok(
  $$select * from public.testing_center_queue_agent_effect(
    (select job_key from isa320_job_keys where n='2'),'github_dispatch','fix',repeat('7',64))$$,
  '55000','testing_center_agent_effect_phase_invalid','fix cannot queue before deterministic eligibility'
);
select is((select callback_status from public.testing_center_record_agent_callback(
  'delivery-out-of-order',(select job_key from isa320_job_keys where n='2'),repeat('2',40),'fix','accepted',repeat('8',64)
)),'needs_owner','out-of-order fix callback routes to owner');
select is((select state from public.testing_center_agent_jobs where job_key=(select job_key from isa320_job_keys where n='2')),'needs_owner','out-of-order job is terminal');
select throws_ok(
  $$select * from public.testing_center_record_agent_callback(
    'delivery-wrong-pair',(select job_key from isa320_job_keys where n='2'),repeat('2',40),'triage','accepted',repeat('8',64))$$,
  '22023','testing_center_agent_callback_invalid','callback kind and outcome are a closed pair'
);

select is((select queue_status from public.testing_center_queue_agent_job(
  (select job_key from isa320_job_keys where n='3'),'issue_'||repeat('3',64),1,'testing-center.autofix-policy.v2',
  repeat('3',64),repeat('9',64),repeat('3',40)
)),'queued','third job queues for ambiguous effect');
create temporary table ambiguous_claim as select * from public.testing_center_claim_agent_effect('worker-c',60);
select is(public.testing_center_reserve_agent_effect((select effect_id from ambiguous_claim),'worker-c',(select fencing_token from ambiguous_claim)),'reserved','ambiguous test reserves its effect');
select is(public.testing_center_complete_agent_effect((select effect_id from ambiguous_claim),'worker-c',(select fencing_token from ambiguous_claim),'ambiguous',repeat('a',64)),'needs_owner','ambiguous external response never retries');
select is((select state from public.testing_center_agent_jobs where job_key=(select job_key from isa320_job_keys where n='3')),'needs_owner','ambiguous response routes job to owner');

select is((select queue_status from public.testing_center_queue_agent_job(
  (select job_key from isa320_job_keys where n='4'),'issue_'||repeat('4',64),1,'testing-center.autofix-policy.v2',
  repeat('4',64),repeat('b',64),repeat('4',40)
)),'queued','fourth job queues before kill switch');
insert into public.testing_center_pauses(
  pause_id,scope,technical_issue_id,is_paused,reason_code,requested_by_id,
  requested_by_user_id,requested_by_role
) values (
  'isa320-flow-pause','flow','issue_'||repeat('4',64),true,'owner_test','owner',
  '00000000-0000-4000-8000-000000000320','owner'
);
select is((select count(*)::integer from public.testing_center_claim_agent_effect('worker-d',60)),0,'flow kill switch blocks the external claim');

create temporary table reclaim_queue as select * from public.testing_center_queue_agent_job(
  (select job_key from isa320_job_keys where n='5'),'issue_'||repeat('5',64),1,'testing-center.autofix-policy.v2',
  repeat('5',64),repeat('c',64),repeat('5',40)
);
create temporary table reclaim_a as select * from public.testing_center_claim_agent_effect('worker-e',60);
reset role;
update public.testing_center_agent_effect_outbox set lease_expires_at=pg_catalog.now()-interval '1 second'
where effect_id=(select effect_id from reclaim_a);
set role service_role;
create temporary table reclaim_b as select * from public.testing_center_claim_agent_effect('worker-f',60);
select is((select fencing_token from reclaim_b),2::bigint,'expired unreserved claim is reclaimed with fence two');
select throws_ok(
  $$select public.testing_center_reserve_agent_effect(
    (select effect_id from reclaim_a),'worker-e',1)$$,
  '55000','testing_center_agent_effect_fencing_stale','expired fence cannot mutate reclaimed effect'
);
select is(public.testing_center_reserve_agent_effect(
  (select effect_id from reclaim_b),'worker-f',2),'reserved','new fence can reserve reclaimed effect');
reset role;
update public.testing_center_agent_effect_outbox set lease_expires_at=pg_catalog.now()-interval '1 second'
where effect_id=(select effect_id from reclaim_b);
set role service_role;
select is((select count(*)::integer from public.testing_center_claim_agent_effect('worker-g',60)),0,'expired reserved effect is never redispatched');
select is(public.testing_center_expire_reserved_agent_effect(
  (select effect_id from reclaim_b),pg_catalog.now()),'needs_owner','expired reservation reconciles without retry');
select is((select state from public.testing_center_agent_jobs where job_key=(select job_key from isa320_job_keys where n='5')),'needs_owner','expired reservation closes the job for owner review');

create temporary table terminal_queue as select * from public.testing_center_queue_agent_job(
  (select job_key from isa320_job_keys where n='6'),'issue_'||repeat('6',64),1,'testing-center.autofix-policy.v2',
  repeat('6',64),repeat('d',64),repeat('6',40)
);
create temporary table terminal_claim as select * from public.testing_center_claim_agent_effect('worker-h',60);
select public.testing_center_transition_agent_job(
  (select job_key from isa320_job_keys where n='6'),'triage_queued','needs_owner','test-worker',repeat('f',64)
);
select throws_ok(
  $$select public.testing_center_reserve_agent_effect(
    (select effect_id from terminal_claim),'worker-h',(select fencing_token from terminal_claim))$$,
  '55000','testing_center_agent_job_not_executable','reserve rechecks terminal job state immediately before dispatch'
);

reset role;
select throws_ok(
  $$insert into public.testing_center_agent_jobs(
    job_key,technical_issue_id,execution_generation,policy_version,report_digest,
    dossier_digest,nightly_base_sha,state
  ) values (
    (select job_key from isa320_job_keys where n='7'),'issue_'||repeat('7',64),2,'testing-center.autofix-policy.v2',
    repeat('7',64),repeat('d',64),repeat('7',40),'triage_queued')$$,
  '23514',null,'table constraint rejects execution generation two'
);
select throws_ok(
  $$insert into public.testing_center_agent_effect_outbox(
    effect_id,job_key,effect_kind,effect_target,effect_generation,payload_digest
  ) values ('bad-pair',(select job_key from isa320_job_keys where n='5'),'github_dispatch','callback',1,repeat('e',64))$$,
  '23514',null,'effect kind and target are a closed pair'
);
select ok((select count(*)>0 from public.testing_center_agent_audit),'state transitions append audit history');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.testing_center_agent_callbacks'::regclass),'callbacks force RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.testing_center_agent_reservations'::regclass),'reservations force RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.testing_center_agent_audit'::regclass),'audit forces RLS');

select * from finish();
rollback;
