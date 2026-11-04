-- Admin's legacy read and status update remain available until #1924.
begin;
select no_plan();
insert into private.clerk_issuers(issuer,authorized_parties,enabled)
values('https://legacy-admin-7b1.invalid',array['https://app.invalid'],true);
insert into auth.users(id,email) values
 ('18960000-0000-4000-8000-0000000007b1','legacy-7b1@example.invalid');
insert into public.profiles(id) values
 ('18960000-0000-4000-8000-0000000007b1') on conflict (id) do nothing;
insert into public.account_identities(issuer,subject,account_id) values
 ('https://legacy-admin-7b1.invalid','user_legacy_admin_7b1',
  '18960000-0000-4000-8000-0000000007b1');
select * from public.operational_access_set(
 '18960000-0000-4000-8000-0000000007b1','owner','grant',
 'test:legacy-admin','Legacy admin fixture','test:owner',null);
insert into public.testing_center_reports
 (report_id,reporter_id,reporter_user_id,reporter_role,channel,state)
values('report_'||repeat('8',64),'legacy-7b1',
 '18960000-0000-4000-8000-0000000007b1','tester','testers','submitted');
select lives_ok($$select public.native_admin_execute(
 '18960000-0000-4000-8000-0000000007b1',
 'https://legacy-admin-7b1.invalid','list_reports',
 '{"limit":100,"status":"submitted"}','production')$$,
 'admin can still read legacy reports while writers are closed');
select lives_ok(format($$select public.native_admin_execute(
 '18960000-0000-4000-8000-0000000007b1',
 'https://legacy-admin-7b1.invalid','set_report_status',%L,'production')$$,
 jsonb_build_object('report_id','report_'||repeat('8',64),'status','closed')::text),
 'admin status update remains available until #1924');
select is((select state from public.testing_center_reports
 where report_id='report_'||repeat('8',64)),'closed',
 'admin status update persisted');
select * from finish();
rollback;
