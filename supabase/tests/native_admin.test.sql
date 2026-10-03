begin;
select no_plan();

select ok(not has_function_privilege('authenticated', 'public.native_resolve_account(text,text)', 'EXECUTE'), 'authenticated cannot bootstrap arbitrary identities');
select ok(has_function_privilege('service_role', 'public.native_resolve_account(text,text)', 'EXECUTE'), 'only backend can resolve verified identities');
select ok(not has_function_privilege('anon', 'public.native_admin_begin(uuid)', 'EXECUTE'), 'anon cannot authorize admin');
select ok(not has_function_privilege('authenticated', 'public.native_admin_execute(uuid,text,text,jsonb,text)', 'EXECUTE'), 'authenticated cannot bypass Edge owner gate');
select ok(not has_table_privilege('authenticated', 'public.admin_audit_log', 'SELECT'), 'audit is private');
select ok(not has_table_privilege('service_role', 'public.admin_audit_log', 'INSERT'), 'audit writes only through transactional RPC');
select ok((select relrowsecurity from pg_class where oid = 'public.admin_audit_log'::regclass), 'audit RLS enabled');
select is(public.native_resolve_account('https://clerk.admin.test', 'user_aaaaaaaaaaaaaaaaaaaaaaaaaaa'),
  public.native_resolve_account('https://clerk.admin.test/', 'user_aaaaaaaaaaaaaaaaaaaaaaaaaaa'), 'shared resolver reuses canonical issuer');
select is((select count(*)::integer from public.account_identities where subject = 'user_aaaaaaaaaaaaaaaaaaaaaaaaaaa'), 1, 'no second mapping');

insert into public.profiles(id) values
  ('00000000-0000-4000-8000-000000001456'),
  ('00000000-0000-4000-8000-000000001452'),
  ('00000000-0000-4000-8000-000000001453');
insert into public.account_identities(issuer,subject,account_id) values
  ('https://clerk.admin.test', 'user_ooooooooooooooooooooooooooo', '00000000-0000-4000-8000-000000001456'),
  ('https://clerk.admin.test', 'user_ttttttttttttttttttttttttttt', '00000000-0000-4000-8000-000000001452');
select * from public.operational_access_set('00000000-0000-4000-8000-000000001456','owner','grant','test:admin','Admin test fixture','test:owner',null);

select throws_ok($$select public.native_admin_begin('00000000-0000-4000-8000-000000001452')$$,
  '42501','native_admin_forbidden','non-owner denied in database');
select is(public.native_admin_begin('00000000-0000-4000-8000-000000001456'), true, 'owner budget accepted');
select lives_ok($$select public.native_admin_execute('00000000-0000-4000-8000-000000001456','https://clerk.admin.test','search_accounts',
  '{"subjects":["user_ttttttttttttttttttttttttttt"],"limit":50}','production')$$, 'search existing internal account');
select is(jsonb_array_length(public.native_admin_execute('00000000-0000-4000-8000-000000001456','https://clerk.admin.test','search_accounts',
  '{"subjects":["unknown"],"limit":50}','production')->'accounts'),0,'unknown directory user is not bootstrapped');
select lives_ok($$select public.native_admin_execute('00000000-0000-4000-8000-000000001456','https://clerk.admin.test','get_account',
  '{"account_id":"00000000-0000-4000-8000-000000001452"}','production')$$, 'get account detail');
select throws_ok($$select public.native_admin_execute('00000000-0000-4000-8000-000000001456','https://clerk.admin.test','search_accounts',
  '{"subjects":[],"limit":51}','production')$$, '22023','native_admin_invalid','SQL search limit');

select lives_ok($$select public.native_admin_execute('00000000-0000-4000-8000-000000001456','https://clerk.admin.test','set_tester',
  '{"account_id":"00000000-0000-4000-8000-000000001452","enabled":true}','production')$$, 'grant tester and membership');
select is((select active from public.testing_center_memberships where user_id = '00000000-0000-4000-8000-000000001452'),true,'internal account membership active without auth.users');
select is((select role from public.operational_access_assignments where user_id = '00000000-0000-4000-8000-000000001452' and status = 'active'),'tester','operational tester active');

-- Real SQL/RLS path for the claims issued by the data JWT; no auth.users fixture.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001452',true);
select set_config('request.jwt.claims','{"iss":"http://127.0.0.1:54321/auth/v1","sub":"00000000-0000-4000-8000-000000001452","role":"authenticated"}',true);
select is(public.testing_center_current_role(),'tester','authenticated UUID sees its own membership');
create temporary table submitted as select * from public.testing_center_submit_report(
  'testing-center.v1','testers','Open Hub','Hub appears','Hub hangs',null,'0.1.0','windows','11','hub',false,false,null,null,'admin-test-submit');
select is((select count(*)::integer from public.testing_center_reports),1,'own report visible through RLS');
select lives_ok($$select public.testing_center_prepare_screenshot_batch('testing-center.screenshot-evidence.v1','testers','admin-test-capture',
  '[{"position":1,"mediaType":"image/jpeg","byteSize":123,"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","width":100,"height":100}]')$$,
  'internal account can prepare screenshot batch without auth.users');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000001453',true);
select is((select count(*)::integer from public.testing_center_reports),0,'another account cannot read report');
select throws_ok($$select public.testing_center_submit_report('testing-center.v1','testers','Open Hub','Hub appears','Hub hangs',null,'0.1.0','windows','11','hub',false,false,null,null,'no-role')$$,
  '42501','testing_center_membership_required','login alone cannot submit');
reset role;

select lives_ok($$select public.native_admin_execute('00000000-0000-4000-8000-000000001456','https://clerk.admin.test','list_reports',
  '{"limit":100,"status":"submitted"}','production')$$,'list actual submitted report');
select lives_ok(format($$select public.native_admin_execute('00000000-0000-4000-8000-000000001456','https://clerk.admin.test','get_report',%L,'production')$$,
  jsonb_build_object('report_id',(select report_id from submitted))::text),'get actual report detail');
select lives_ok(format($$select public.native_admin_execute('00000000-0000-4000-8000-000000001456','https://clerk.admin.test','set_report_status',%L,'production')$$,
  jsonb_build_object('report_id',(select report_id from submitted),'status','closed')::text),'close actual report');
select is((select state from public.testing_center_reports where report_id = (select report_id from submitted)), 'closed','report status persisted');

select lives_ok($$select public.native_admin_execute('00000000-0000-4000-8000-000000001456','https://clerk.admin.test','set_module',
  '{"account_id":"00000000-0000-4000-8000-000000001452","module":"vantare.module.engineer","enabled":true}','production')$$,'grant individual module');
select is((select count(*)::integer from public.billing_access_grants where user_id = '00000000-0000-4000-8000-000000001452' and capability = 'vantare.module.engineer' and status = 'active'),1,'module grant persisted');
select lives_ok($$select public.native_admin_execute('00000000-0000-4000-8000-000000001456','https://clerk.admin.test','set_module',
  '{"account_id":"00000000-0000-4000-8000-000000001452","module":"vantare.module.engineer","enabled":false}','production')$$,'revoke individual module');
select is((select count(*)::integer from public.billing_access_grants where user_id = '00000000-0000-4000-8000-000000001452' and capability = 'vantare.module.engineer' and status = 'active'),0,'module grant revoked');
select lives_ok($$select public.native_admin_execute('00000000-0000-4000-8000-000000001456','https://clerk.admin.test','get_rollout','{}','production')$$,'get rollout');
select lives_ok($$select public.native_admin_execute('00000000-0000-4000-8000-000000001456','https://clerk.admin.test','set_rollout',
  '{"module":"vantare.module.engineer","enabled_for_all":true}','production')$$,'set rollout');
select is((select enabled_for_all from public.module_rollout where module = 'vantare.module.engineer'),true,'rollout persisted');
select is((select count(distinct action)::integer from public.admin_audit_log),9,'all nine actions wrote audit');
select ok((select before_value is not null and after_value is not null from public.admin_audit_log where action = 'set_tester' limit 1),'mutation snapshots audited');
select throws_ok($$update public.admin_audit_log set target = 'tampered'$$, 'P0001','operational_access_audit_is_append_only','audit append-only trigger');

select lives_ok($$select public.native_admin_execute('00000000-0000-4000-8000-000000001456','https://clerk.admin.test','set_tester',
  '{"account_id":"00000000-0000-4000-8000-000000001456","enabled":true}','production')$$,'set_tester on owner preserves owner');
select is((select role from public.operational_access_assignments where user_id = '00000000-0000-4000-8000-000000001456' and status = 'active'),'owner','owner not replaced');
select lives_ok($$select public.native_admin_execute('00000000-0000-4000-8000-000000001456','https://clerk.admin.test','set_tester',
  '{"account_id":"00000000-0000-4000-8000-000000001456","enabled":false}','production')$$,'disable tester on owner preserves owner');
select is((select role from public.testing_center_memberships where user_id = '00000000-0000-4000-8000-000000001456'),'owner','owner membership preserved');
select lives_ok($$select public.native_admin_execute('00000000-0000-4000-8000-000000001456','https://clerk.admin.test','set_tester',
  '{"account_id":"00000000-0000-4000-8000-000000001452","enabled":false}','production')$$,'revoke tester and membership');
select is((select active from public.testing_center_memberships where user_id = '00000000-0000-4000-8000-000000001452'),false,'revoked membership inactive');

create function pg_temp.reject_audit() returns trigger language plpgsql as $$begin raise exception 'test_audit_failure'; end$$;
create trigger test_audit_failure before insert on public.admin_audit_log for each row execute function pg_temp.reject_audit();
select throws_ok($$select public.native_admin_execute('00000000-0000-4000-8000-000000001456','https://clerk.admin.test','set_tester',
  '{"account_id":"00000000-0000-4000-8000-000000001452","enabled":true}','production')$$,'P0001','test_audit_failure','audit failure rolls transaction back');
select is((select active from public.testing_center_memberships where user_id = '00000000-0000-4000-8000-000000001452'),false,'membership unchanged when audit fails');
select is((select status from public.operational_access_assignments where user_id = '00000000-0000-4000-8000-000000001452' and role = 'tester'),'revoked','role unchanged when audit fails');
drop trigger test_audit_failure on public.admin_audit_log;

update public.operational_access_assignments set granted_at = now() - interval '2 days', expires_at = now() - interval '1 day'
where user_id = '00000000-0000-4000-8000-000000001456' and role = 'owner';
select throws_ok($$select public.native_admin_begin('00000000-0000-4000-8000-000000001456')$$,'42501','native_admin_forbidden','expired owner denied');
-- Another live owner can administer the expired owner without replacing it.
select * from public.operational_access_set('00000000-0000-4000-8000-000000001453','owner','grant','test:admin','Admin test fixture','test:second-owner',null);
select throws_ok($$select public.native_admin_execute('00000000-0000-4000-8000-000000001453','https://clerk.admin.test','set_tester',
  '{"account_id":"00000000-0000-4000-8000-000000001456","enabled":true}','production')$$,
  '55000','native_admin_owner_conflict','expired owner is not silently replaced by tester');
update public.operational_access_assignments set expires_at = null where user_id = '00000000-0000-4000-8000-000000001456' and role = 'owner';
select is((select count(*)::integer from generate_series(1,59) where public.native_admin_begin('00000000-0000-4000-8000-000000001456')),59,'first sixty requests accepted');
select is(public.native_admin_begin('00000000-0000-4000-8000-000000001456'),false,'61st request throttled');

select * from finish();
rollback;
