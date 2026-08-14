begin;
set local search_path = public,extensions;
select plan(45);

select has_table('public','testing_center_agent_phase_callbacks','phase callback ledger exists');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.testing_center_agent_phase_callbacks'::regclass),'phase callback ledger forces RLS');
select ok(has_function_privilege('service_role','public.testing_center_record_agent_phase_callback(text,text,text,text,text,text,bigint,bigint,text)','execute'),'service role can apply phase callbacks');
select ok(not has_function_privilege('authenticated','public.testing_center_record_agent_phase_callback(text,text,text,text,text,text,bigint,bigint,text)','execute'),'clients cannot apply phase callbacks');
select ok(has_function_privilege('authenticated','public.testing_center_get_agent_job_state(text)','execute'),'authenticated tester can load its visible state');

insert into auth.users(id,email) values
  ('00000000-0000-4000-8000-000000000324','isa324@example.invalid'),
  ('00000000-0000-4000-8000-000000000325','other@example.invalid');
insert into public.testing_center_memberships(user_id,actor_id,role,active)
values ('00000000-0000-4000-8000-000000000324','isa324-owner','owner',true);
insert into public.testing_center_reports(
  report_id,reporter_id,reporter_user_id,reporter_role,channel,state
) values
  ('report_'||repeat('a',64),'isa324-owner','00000000-0000-4000-8000-000000000324','owner','nightly','validated'),
  ('report_'||repeat('b',64),'isa324-owner','00000000-0000-4000-8000-000000000324','owner','nightly','validated'),
  ('report_'||repeat('c',64),'isa324-owner','00000000-0000-4000-8000-000000000324','owner','nightly','validated'),
  ('report_'||repeat('d',64),'isa324-owner','00000000-0000-4000-8000-000000000324','owner','nightly','validated'),
  ('report_'||repeat('e',64),'isa324-owner','00000000-0000-4000-8000-000000000324','owner','nightly','validated'),
  ('report_'||repeat('f',64),'isa324-owner','00000000-0000-4000-8000-000000000324','owner','nightly','validated');
insert into public.testing_center_technical_issues(
  technical_issue_id,report_id,state,flow_state,origin
) values
  ('issue_'||repeat('a',64),'report_'||repeat('a',64),'open','queued','orchestrator'),
  ('issue_'||repeat('b',64),'report_'||repeat('b',64),'open','queued','orchestrator'),
  ('issue_'||repeat('c',64),'report_'||repeat('c',64),'open','queued','orchestrator'),
  ('issue_'||repeat('d',64),'report_'||repeat('d',64),'open','queued','orchestrator'),
  ('issue_'||repeat('e',64),'report_'||repeat('e',64),'open','queued','orchestrator'),
  ('issue_'||repeat('f',64),'report_'||repeat('f',64),'open','queued','orchestrator');

create temporary table isa324_jobs as
select n,public.testing_center_agent_job_key(
  'issue_'||repeat(n,64),repeat(n,64),repeat(n,40),'testing-center.autofix-policy.v2'
) job_key
from unnest(array['a','b','c','d','e','f']) n;
grant select on isa324_jobs to service_role;

insert into public.testing_center_agent_jobs(
  job_key,technical_issue_id,execution_generation,policy_version,
  report_digest,dossier_digest,nightly_base_sha,state,candidate_head_sha
)
select job_key,'issue_'||repeat(n,64),1,'testing-center.autofix-policy.v2',
  repeat(n,64),repeat('d',64),repeat(n,40),
  case when n='a' then 'eligible' when n='f' then 'diff_verified' else 'merge_queued' end,
  case when n='a' then null when n='f' then repeat('4',40) else repeat('e',40) end
from isa324_jobs;

insert into public.testing_center_agent_effect_outbox(
  effect_id,job_key,effect_kind,effect_target,effect_generation,payload_digest,
  state,fencing_token,dispatch_reserved,outcome_digest
)
select job_key||':fix:1',job_key,'github_dispatch','fix',1,repeat('d',64),
  'completed',7,true,repeat('f',64)
from isa324_jobs;
insert into public.testing_center_agent_reservations(
  reservation_key,job_key,reservation_kind,binding_digest,reviewed_head_sha
)
select 'v0.1.0.7-nightly.'||row_number() over(order by n),job_key,
  'nightly_release',repeat('d',64),case when n='a' then null when n='f' then repeat('4',40) else repeat('e',40) end
from isa324_jobs;

set role service_role;
select is((select callback_status from public.testing_center_record_fenced_agent_callback(
  'fix-start',(select job_key from isa324_jobs where n='a'),repeat('c',40),
  'fix','accepted',repeat('1',64),7
)),'applied','current dispatch fence starts RED exactly once');
select is((select state from public.testing_center_agent_jobs where job_key=(select job_key from isa324_jobs where n='a')),'red_running','fix acceptance creates the missing red_running state');
select is((select callback_status from public.testing_center_record_fenced_agent_callback(
  'fix-start',(select job_key from isa324_jobs where n='a'),repeat('c',40),
  'fix','accepted',repeat('1',64),7
)),'duplicate','fenced fix callback replays');

create temporary table red_callback as select * from public.testing_center_record_agent_phase_callback(
  'phase-red',(select job_key from isa324_jobs where n='a'),repeat('c',40),null,
  'red_verified',repeat('2',64),7,1001
);
select is((select callback_status from red_callback),'applied','RED phase applies with current fix fence');
select is((select candidate_head_sha from public.testing_center_agent_jobs where job_key=(select job_key from isa324_jobs where n='a')),repeat('c',40),'first RED callback binds candidate HEAD');
select is((select callback_status from public.testing_center_record_agent_phase_callback(
  'phase-red',(select job_key from isa324_jobs where n='a'),repeat('c',40),null,
  'red_verified',repeat('2',64),7,1001
)),'duplicate','old phase delivery replays after later transitions');

select is((select job_state from public.testing_center_record_agent_phase_callback(
  'phase-green',(select job_key from isa324_jobs where n='a'),repeat('c',40),null,
  'green_running',repeat('3',64),7,1001
)),'green_running','GREEN transition applies');
select is((select job_state from public.testing_center_record_agent_phase_callback(
  'phase-diff',(select job_key from isa324_jobs where n='a'),repeat('4',40),null,
  'diff_verified',repeat('4',64),7,1001
)),'diff_verified','diff transition applies');
select is((select candidate_head_sha from public.testing_center_agent_jobs where job_key=(select job_key from isa324_jobs where n='a')),repeat('4',40),'diff binds the final reviewed candidate HEAD after GREEN');
select is((select job_state from public.testing_center_record_agent_phase_callback(
  'phase-review',(select job_key from isa324_jobs where n='a'),repeat('4',40),null,
  'review_approved',repeat('5',64),7,1001
)),'review_approved','review transition applies');
select is((select job_state from public.testing_center_record_agent_phase_callback(
  'phase-ci',(select job_key from isa324_jobs where n='a'),repeat('4',40),null,
  'ci_running',repeat('6',64),7,1001
)),'ci_running','CI transition applies');
select is((select job_state from public.testing_center_record_agent_phase_callback(
  'phase-queue',(select job_key from isa324_jobs where n='a'),repeat('4',40),null,
  'merge_queued',repeat('7',64),7,1001
)),'merge_queued','queue transition applies');
select is((select reviewed_head_sha from public.testing_center_agent_reservations where job_key=(select job_key from isa324_jobs where n='a')),repeat('4',40),'queue binds reservation to final reviewed HEAD before merge');

select is((select job_state from public.testing_center_record_agent_phase_callback(
  'phase-merged',(select job_key from isa324_jobs where n='a'),repeat('9',40),repeat('4',40),
  'merged_nightly',repeat('8',64),2001,2001,'v0.1.0.7-nightly.1'
)),'merged_nightly','merge callback binds exact merge SHA and closeout fence');
select is((select merge_sha from public.testing_center_agent_reservations where job_key=(select job_key from isa324_jobs where n='a')),repeat('9',40),'reservation stores exact merge SHA');
select is((select job_state from public.testing_center_record_agent_phase_callback(
  'phase-smoke',(select job_key from isa324_jobs where n='a'),repeat('9',40),repeat('4',40),
  'smoke_running',repeat('9',64),2001,2001,'v0.1.0.7-nightly.1'
)),'smoke_running','smoke transition uses the same closeout fence');
select is((select job_state from public.testing_center_record_agent_phase_callback(
  'phase-tag',(select job_key from isa324_jobs where n='a'),repeat('9',40),repeat('4',40),
  'nightly_tagged',repeat('a',64),2001,2001,'v0.1.0.7-nightly.1'
)),'nightly_tagged','tag transition follows smoke');
select is((select job_state from public.testing_center_record_agent_phase_callback(
  'phase-complete',(select job_key from isa324_jobs where n='a'),repeat('9',40),repeat('4',40),
  'completed',repeat('b',64),2001,2001,'v0.1.0.7-nightly.1'
)),'completed','verified closeout reaches completed');
select is((select state from public.testing_center_agent_reservations where job_key=(select job_key from isa324_jobs where n='a')),'confirmed','completed confirms the reserved tag');
select is((select callback_status from public.testing_center_record_agent_phase_callback(
  'phase-red',(select job_key from isa324_jobs where n='a'),repeat('c',40),null,
  'red_verified',repeat('2',64),7,1001
)),'duplicate','replaying an old exact delivery after completion cannot poison the job');

select is((select job_state from public.testing_center_record_agent_phase_callback(
  'failure-merged',(select job_key from isa324_jobs where n='b'),repeat('8',40),repeat('e',40),
  'merged_nightly',repeat('c',64),3001,3001,'v0.1.0.7-nightly.2'
)),'merged_nightly','failure candidate starts closeout');
select is((select job_state from public.testing_center_record_agent_phase_callback(
  'failure-smoke',(select job_key from isa324_jobs where n='b'),repeat('8',40),repeat('e',40),
  'smoke_running',repeat('d',64),3001,3001,'v0.1.0.7-nightly.2'
)),'smoke_running','failure candidate enters smoke');
select is((select job_state from public.testing_center_record_agent_phase_callback(
  'failure-red',(select job_key from isa324_jobs where n='b'),repeat('8',40),repeat('e',40),
  'smoke_failed',repeat('e',64),3001,3001,'v0.1.0.7-nightly.2'
)),'smoke_failed','smoke failure applies');
select is((select state from public.testing_center_agent_reservations where job_key=(select job_key from isa324_jobs where n='b')),'annulled','smoke failure atomically annuls the tag reservation');
select is((select job_state from public.testing_center_record_agent_phase_callback(
  'failure-pr',(select job_key from isa324_jobs where n='b'),repeat('8',40),repeat('e',40),
  'revert_pr_open',repeat('f',64),3001,3001,'v0.1.0.7-nightly.2'
)),'revert_pr_open','annulled reservation still permits revert PR state');
select is((select job_state from public.testing_center_record_agent_phase_callback(
  'failure-reverted',(select job_key from isa324_jobs where n='b'),repeat('8',40),repeat('e',40),
  'reverted',repeat('0',64),3001,3999,'v0.1.0.7-nightly.2'
)),'reverted','verified revert closes the serial lock');
select is((select run_id from public.testing_center_agent_phase_callbacks where delivery_id='failure-reverted'),3999::bigint,'revert completion keeps the original server-bound fence across a later workflow run');

select is((select job_state from public.testing_center_record_agent_phase_callback(
  'stale-merged',(select job_key from isa324_jobs where n='c'),repeat('7',40),repeat('e',40),
  'merged_nightly',repeat('1',64),5000,5000,'v0.1.0.7-nightly.3'
)),'merged_nightly','newer closeout fence binds before stale delivery test');
select is((select callback_status from public.testing_center_record_agent_phase_callback(
  'stale-smoke',(select job_key from isa324_jobs where n='c'),repeat('7',40),repeat('e',40),
  'smoke_running',repeat('2',64),4999,4999,'v0.1.0.7-nightly.3'
)),'needs_owner','closeout rejects a genuinely older equal token and run');
select is((select state from public.testing_center_agent_jobs where job_key=(select job_key from isa324_jobs where n='c')),'needs_owner','stale closeout fence closes automation');

select is((select job_state from public.testing_center_record_agent_phase_callback(
  'owner-merged',(select job_key from isa324_jobs where n='d'),repeat('6',40),repeat('e',40),
  'merged_nightly',repeat('3',64),6000,6000,'v0.1.0.7-nightly.4'
)),'merged_nightly','release-failure candidate binds closeout');
select is((select job_state from public.testing_center_record_agent_phase_callback(
  'owner-smoke',(select job_key from isa324_jobs where n='d'),repeat('6',40),repeat('e',40),
  'smoke_running',repeat('4',64),6000,6000,'v0.1.0.7-nightly.4'
)),'smoke_running','release-failure candidate reaches smoke');
select is((select job_state from public.testing_center_record_agent_phase_callback(
  'owner-release-failed',(select job_key from isa324_jobs where n='d'),repeat('6',40),repeat('e',40),
  'closeout_failed',repeat('5',64),6000,6000,'v0.1.0.7-nightly.4'
)),'needs_owner','release failure becomes an explicit owner-visible state');
select is((select state from public.testing_center_agent_reservations where job_key=(select job_key from isa324_jobs where n='d')),'needs_owner','release failure keeps the serial reservation escalated');

select is((select callback_status from public.testing_center_record_agent_phase_callback(
  'wrong-tag-merged',(select job_key from isa324_jobs where n='e'),repeat('5',40),repeat('e',40),
  'merged_nightly',repeat('6',64),7000,7000,'v0.1.0.7-nightly.999'
)),'needs_owner','merge callback rejects a tag different from the premerge reservation');
select is((select state from public.testing_center_agent_jobs where job_key=(select job_key from isa324_jobs where n='e')),'needs_owner','wrong reserved tag closes automation before smoke or release');

select is((select callback_status from public.testing_center_record_agent_phase_callback(
  'stale-red-head',(select job_key from isa324_jobs where n='f'),repeat('c',40),null,
  'review_approved',repeat('7',64),7,1001
)),'needs_owner','post-diff phases reject the earlier RED HEAD');
select is((select state from public.testing_center_agent_jobs where job_key=(select job_key from isa324_jobs where n='f')),'needs_owner','stale pre-GREEN HEAD closes automation');

reset role;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000324","role":"authenticated"}';
set role authenticated;
select is((select state from public.testing_center_get_agent_job_state('report_'||repeat('a',64))),'completed','reporter can load its own agent state');
reset role;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000325","role":"authenticated"}';
set role authenticated;
select is((select count(*)::integer from public.testing_center_get_agent_job_state('report_'||repeat('a',64))),0,'another user cannot load the agent state');

select * from finish();
rollback;
