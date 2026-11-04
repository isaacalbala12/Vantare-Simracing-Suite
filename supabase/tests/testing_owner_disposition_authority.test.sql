-- Characterization before VANTA-131/1936: a revoked operational owner still
-- passes the legacy membership gate, while an operational owner without a
-- Testing Center membership cannot record a disposition.
begin;
select plan(7);

insert into public.profiles(id) values
 ('19360000-0000-4000-8000-000000000001'),
 ('19360000-0000-4000-8000-000000000002'),
 ('19360000-0000-4000-8000-000000000003');
insert into public.testing_center_memberships(user_id,actor_id,role) values
 ('19360000-0000-4000-8000-000000000002','19360000-0000-4000-8000-000000000002','owner'),
 ('19360000-0000-4000-8000-000000000003','19360000-0000-4000-8000-000000000003','tester');
select * from public.operational_access_set(
 '19360000-0000-4000-8000-000000000001','owner','grant',
 'test:vanta1936','Owner without membership','test:vanta1936-a',null);
select * from public.operational_access_set(
 '19360000-0000-4000-8000-000000000002','owner','grant',
 'test:vanta1936','Revoked owner','test:vanta1936-b-grant',null);
select * from public.operational_access_set(
 '19360000-0000-4000-8000-000000000002','owner','revoke',
 'test:vanta1936','Revoked owner','test:vanta1936-b-revoke',null);

insert into public.testing_center_technical_issues(
 technical_issue_id,state,flow_state,origin,owner_account_id)
values ('issue_1936_owner_authority','needs_owner','needs_owner','testing_center',
 '19360000-0000-4000-8000-000000000003');
insert into public.testing_center_candidate_builds(
 candidate_id,technical_issue_id,channel,build_version,exact_sha,author_id,state)
values ('candidate-1936','issue_1936_owner_authority','testers',
 '1.0.0-test',repeat('a',40),'candidate-author','rejected');
insert into public.testing_center_validations(
 validation_id,candidate_id,channel,exact_sha,candidate_author_id,decision,
 actor_id,actor_user_id,actor_role,rejection_reason)
values ('validation_1936_owner_authority','candidate-1936','testers',
 repeat('a',40),'candidate-author','rejected',
 '19360000-0000-4000-8000-000000000003',
 '19360000-0000-4000-8000-000000000003','tester','still_fails');
insert into public.testing_center_validation_snapshots(
 validation_id,technical_issue_id,candidate_id,channel,app_version,
 candidate_sha,actor_id,actor_user_id,actor_role,decision,replay_key,
 decision_digest,projection_digest,transport_digest,sanitized_projection,
 details_markdown,redacted_values,truncated_fields)
values ('validation_1936_owner_authority','issue_1936_owner_authority',
 'candidate-1936','testers','1.0.0-test',repeat('a',40),
 '19360000-0000-4000-8000-000000000003',
 '19360000-0000-4000-8000-000000000003','tester','rejected',
 'replay-1936',repeat('b',64),repeat('c',64),repeat('d',64),'{}',
 'Rejected for local characterization',0,0);

select ok(
 has_function_privilege('service_role',
  'public.testing_center_record_owner_disposition(text,text,text,text,text,text,text,uuid)',
  'execute')
 and not has_function_privilege('anon',
  'public.testing_center_record_owner_disposition(text,text,text,text,text,text,text,uuid)',
  'execute'), 'only service_role can invoke the owner disposition boundary');
select ok(private.is_owner('19360000-0000-4000-8000-000000000001')
 and not private.is_owner('19360000-0000-4000-8000-000000000002'),
 'fixture distinguishes operational owner from revoked legacy member');

create function pg_temp.capture_owner_disposition() returns text
language plpgsql as $$
declare v_state text; v_idempotent boolean;
begin
 select result_issue_state,result_idempotent into v_state,v_idempotent
 from public.testing_center_record_owner_disposition(
  'validation_1936_owner_authority',null,'stop_rollout',
  'Operational owner decision',null,null,null,
  '19360000-0000-4000-8000-000000000001');
 return v_state || ':' || v_idempotent::text;
exception when others then return sqlstate;
end $$;

set local role service_role;
select throws_ok($$
 select * from public.testing_center_record_owner_disposition(
  'missing-validation',null,'stop_rollout','Revoked owner denied',null,null,null,
  '19360000-0000-4000-8000-000000000002')
$$,'42501',null,'revoked owner with old membership is denied');
select throws_ok($$
 select * from public.testing_center_record_owner_disposition(
  'missing-validation',null,'stop_rollout','Tester denied',null,null,null,
  '19360000-0000-4000-8000-000000000003')
$$,'42501',null,'tester account cannot act as owner');
select is(pg_temp.capture_owner_disposition(),'stopped:false',
 'operational owner without membership records a real disposition');
select is((select actor_id from public.testing_center_owner_dispositions
 where rejection_validation_id='validation_1936_owner_authority'),
 '19360000-0000-4000-8000-000000000001',
 'membership-free owner is attributed to the verified account UUID');
select is(pg_temp.capture_owner_disposition(),'stopped:true',
 'same owner decision replays idempotently');
reset role;

select * from finish();
rollback;
