-- VANTA-131 / final 7b: v2 agent lineage remains readable only to its owner.
begin;
select plan(9);

select ok(to_regclass('public.testing_center_reports') is null,'legacy report root retired');
select ok(to_regclass('private.testing_center_legacy_archive') is null,'empty archive retired');
select ok(to_regclass('public.testing_center_technical_issues') is not null
  and to_regclass('public.testing_center_agent_jobs') is not null,'v2 agent lineage retained');
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

select * from finish();
rollback;
