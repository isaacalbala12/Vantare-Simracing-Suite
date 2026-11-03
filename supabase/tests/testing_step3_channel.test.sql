-- VANTA-131 step 3: server-verified identity must also have candidate membership.
begin;
select plan(12);
insert into public.profiles(id) values
  ('18960000-0000-4000-8000-000000000031'),
  ('18960000-0000-4000-8000-000000000032'),
  ('18960000-0000-4000-8000-000000000033'),
  ('18960000-0000-4000-8000-000000000034');
insert into public.testing_center_memberships(user_id,actor_id,role)
  values('18960000-0000-4000-8000-000000000032','fixture-tester-32','tester'),
    ('18960000-0000-4000-8000-000000000033','fixture-tester-33','tester');
update public.testing_center_memberships set active=false
  where user_id='18960000-0000-4000-8000-000000000033';
insert into private.clerk_issuers(issuer,authorized_parties,enabled)
  values('https://step3.clerk.invalid',array['https://app.invalid'],true);
insert into public.account_identities(issuer,subject,account_id,deleted_at)
  values('https://step3.clerk.invalid','user_aaaaaaaaaaaaaaaaaaaaaaaaaaa',
    '18960000-0000-4000-8000-000000000034',now());

set local role service_role;
select throws_ok($$select public.testing_report_submit_admitted('18960000-0000-4000-8000-000000000031','18960000-0000-4000-8000-000000000041','nightly','Synthetic','Synthetic',true)$$,'42501',null,'nonmember cannot submit nightly');
select throws_ok($$select public.testing_report_submit_admitted('18960000-0000-4000-8000-000000000031','18960000-0000-4000-8000-000000000042','testers','Synthetic','Synthetic',true)$$,'42501',null,'nonmember cannot submit testers');
select lives_ok($$select public.testing_report_submit_admitted('18960000-0000-4000-8000-000000000031','18960000-0000-4000-8000-000000000043','master','Synthetic','Synthetic',true)$$,'authenticated master remains open');
select lives_ok($$select public.testing_report_submit_admitted('18960000-0000-4000-8000-000000000032','18960000-0000-4000-8000-000000000044','testers','Synthetic','Synthetic',true)$$,'tester can submit testers');
select throws_ok($$select public.testing_report_submit_admitted('18960000-0000-4000-8000-000000000032','18960000-0000-4000-8000-000000000045','nightly','Synthetic','Synthetic',true)$$,'42501',null,'tester cannot submit nightly');
select throws_ok($$select public.testing_report_submit_admitted('18960000-0000-4000-8000-000000000031','18960000-0000-4000-8000-000000000046','testers','Synthetic','Synthetic',true)$$,'42501',null,'other user cannot borrow tester membership');
select throws_ok($$select public.testing_report_submit_admitted('18960000-0000-4000-8000-000000000033','18960000-0000-4000-8000-000000000047','testers','Synthetic','Synthetic',true)$$,'42501',null,'inactive membership cannot submit');
select lives_ok($$select public.testing_report_submit_admitted('18960000-0000-4000-8000-000000000032','18960000-0000-4000-8000-000000000048','master','Synthetic','Synthetic',true)$$,'tester account may submit master');
select throws_ok($$select public.testing_report_submit_admitted('18960000-0000-4000-8000-000000000034','18960000-0000-4000-8000-000000000049','master','Synthetic','Synthetic',true)$$,'28000','account_deleted','deleted account cannot submit master');
reset role;
select is((select count(*)::integer from public.testing_contributions where account_id='18960000-0000-4000-8000-000000000031'),1,'only the master report from the nonmember persists');
select ok(not has_function_privilege('anon','public.testing_report_submit_admitted(uuid,uuid,text,text,text,boolean)','execute'),'anon cannot bypass Edge');
select ok(not has_function_privilege('authenticated','public.testing_report_submit_admitted(uuid,uuid,text,text,text,boolean)','execute'),'client cannot bypass Edge');
select * from finish();
rollback;
