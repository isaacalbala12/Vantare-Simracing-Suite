begin;
select no_plan();
-- Synthetic fixtures only. Do not weaken the policy CHECK to invent v2 owners.
insert into public.profiles(id) values
 ('19100000-0000-4000-8000-000000000001'),
 ('19100000-0000-4000-8000-000000000002'),
 ('19100000-0000-4000-8000-000000000003');
select * from public.operational_access_set('19100000-0000-4000-8000-000000000001',
 'owner','grant','test:r10','Admin characterization','test:r10-actor',null);
select * from public.operational_access_set('19100000-0000-4000-8000-000000000002',
 'owner','grant','test:r10','Admin characterization','test:r10-target',null);

select lives_ok($$select private.native_admin_require_owner('19100000-0000-4000-8000-000000000002')$$,
 'active policy v1 owner is authorized');
select throws_ok($$select private.native_admin_require_owner('19100000-0000-4000-8000-000000000003')$$,
 '42501','native_admin_forbidden','non-owner is rejected');
select throws_ok($$update public.operational_access_assignments set policy_version=2
 where user_id='19100000-0000-4000-8000-000000000002'$$,
 '23514',null,'policy v2 owner cannot exist under the current schema');

select throws_ok($$select public.native_admin_execute('19100000-0000-4000-8000-000000000001',
 'https://admin.invalid','set_blocked','{"account_id":"19100000-0000-4000-8000-000000000002","blocked":true}','sandbox')$$,
 '55000','native_admin_owner_conflict','active owner target cannot be blocked');
select throws_ok($$select public.native_admin_execute('19100000-0000-4000-8000-000000000001',
 'https://admin.invalid','prepare_account_deletion','{"account_id":"19100000-0000-4000-8000-000000000002","confirmation_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","clerk_subject":"user_ooooooooooooooooooooooooooo"}','sandbox')$$,
 '55000','native_admin_owner_conflict','active owner target cannot be deleted');
select lives_ok($$select public.native_admin_execute('19100000-0000-4000-8000-000000000001',
 'https://admin.invalid','set_tester','{"account_id":"19100000-0000-4000-8000-000000000002","enabled":true}','sandbox')$$,
 'set_tester preserves active owner');
select is((select role from public.testing_center_memberships
 where user_id='19100000-0000-4000-8000-000000000002'),'owner',
 'characterization: set_tester writes owner into Testing Center');

update public.operational_access_assignments set granted_at=now()-interval '2 days',
 expires_at=now()-interval '1 day' where user_id='19100000-0000-4000-8000-000000000002';
select throws_ok($$select private.native_admin_require_owner('19100000-0000-4000-8000-000000000002')$$,
 '42501','native_admin_forbidden','expired owner cannot administer');
select throws_ok($$select public.native_admin_execute('19100000-0000-4000-8000-000000000001',
 'https://admin.invalid','set_blocked','{"account_id":"19100000-0000-4000-8000-000000000002","blocked":true}','sandbox')$$,
 '55000','native_admin_owner_conflict','characterization: expired owner remains protected from blocking');
select throws_ok($$select public.native_admin_execute('19100000-0000-4000-8000-000000000001',
 'https://admin.invalid','prepare_account_deletion','{"account_id":"19100000-0000-4000-8000-000000000002","confirmation_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","clerk_subject":"user_ooooooooooooooooooooooooooo"}','sandbox')$$,
 '55000','native_admin_owner_conflict','characterization: expired owner remains protected from deletion');
select throws_ok($$select public.native_admin_execute('19100000-0000-4000-8000-000000000001',
 'https://admin.invalid','set_tester','{"account_id":"19100000-0000-4000-8000-000000000002","enabled":true}','sandbox')$$,
 '55000','native_admin_owner_conflict','expired owner is not replaced with tester');
select is((select role from public.testing_center_memberships
 where user_id='19100000-0000-4000-8000-000000000002'),'owner',
 'characterization: old owner membership is unchanged after expiry');

-- Capture the complete live wrapper chain before R6 rebuilds the migration base.
-- Normalize CRLF because the Windows and Unix checkouts contain identical SQL.
create temporary table expected_admin_definitions(name text, digest text);
insert into expected_admin_definitions values
 ('private.mail_admin_execute_v1','056d902efb77dab1f45b22cfa00bb464'),
 ('private.mail_admin_execute_v2','21ed996991731a2489fcaf87a81f7c36'),
 ('private.native_admin_account','5515fa4910bff94e39e8d7e44e2d23be'),
 ('private.native_admin_account_before_1593','084f6aea3e40b54ee1adb6eac42dadec'),
 ('private.native_admin_account_before_1661_reports','cda5fcaaad48df5997c98cbdc6341cc4'),
 ('private.native_admin_account_deletion','b235508f5e50e5c41e727046a05b16b4'),
 ('private.native_admin_account_summary','715d0d6c83bbb5942f5d278384ad3f14'),
 ('private.native_admin_account_v1','25137a4d2f324589a90d29f20848212a'),
 ('private.native_admin_execute_before_creator_coupon','f104f96d62494d1ece25e8e234f6a244'),
 ('private.native_admin_execute_v1','08197d847f456872b354a5f8e7eca671'),
 ('public.mail_admin_execute','80d2ff8b4ece907c5f5fee0d11a9d1dc'),
 ('public.native_admin_execute','9e870a1e6c54ee88133a2e55ab81bc87');
create temporary table actual_admin_definitions as
select n.nspname || '.' || p.proname || '|' || md5(replace(pg_get_functiondef(p.oid), E'\r\n', E'\n')) as fingerprint
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','private') and
 (p.proname like 'native_admin_execute%' or p.proname like 'native_admin_account%'
  or p.proname like 'mail_admin_execute%')
order by n.nspname,p.proname;
select results_eq(
 $$select fingerprint collate "C" from actual_admin_definitions order by fingerprint collate "C"$$,
 $$select (name || '|' || digest) collate "C" from expected_admin_definitions order by (name || '|' || digest) collate "C"$$,
 '12 live definitions: 4 approved report-root changes, 8 unchanged wrappers/mail');
select * from finish();
rollback;
