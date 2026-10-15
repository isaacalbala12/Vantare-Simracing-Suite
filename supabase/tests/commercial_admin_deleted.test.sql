begin;
select plan(7);
insert into private.clerk_issuers(issuer,authorized_parties,enabled)
 values('https://admin-deleted.clerk.invalid',array['https://app.invalid'],true);
insert into public.profiles(id) values('16080000-0000-0000-0000-000000000001'),('16080000-0000-0000-0000-000000000002');
insert into public.account_identities(issuer,subject,account_id) values
 ('https://admin-deleted.clerk.invalid','user_admin_reader','16080000-0000-0000-0000-000000000001'),
 ('https://admin-deleted.clerk.invalid','user_admin_erased','16080000-0000-0000-0000-000000000002');
select * from public.operational_access_set('16080000-0000-0000-0000-000000000001','owner','grant','fixture:admin','fixture','admin-deleted');
select public.apply_clerk_user_event('admin-read-delete',repeat('a',64),'https://admin-deleted.clerk.invalid','user_admin_erased','user.deleted',now(),null);
select lives_ok($$select public.native_admin_execute('16080000-0000-0000-0000-000000000001','https://admin-deleted.clerk.invalid','search_accounts','{"query":"","limit":50}','sandbox')$$,'search including erased account succeeds and audits');
select lives_ok($$select public.native_admin_execute('16080000-0000-0000-0000-000000000001','https://admin-deleted.clerk.invalid','search_accounts','{"query":"erased","subjects":["user_admin_erased"],"limit":50}','sandbox')$$,'directory search including erased account succeeds');
select is(public.native_admin_execute('16080000-0000-0000-0000-000000000001','https://admin-deleted.clerk.invalid','get_account','{"account_id":"16080000-0000-0000-0000-000000000002"}','sandbox')->'account'->>'account_id','16080000-0000-0000-0000-000000000002','get erased account succeeds');
select is((select count(*)::int from public.admin_audit_log where actor_account_id='16080000-0000-0000-0000-000000000001'),3,'all successful reads remain audited');
select ok(exists(select 1 from public.admin_audit_log where action='search_accounts' and after_value::text like '%16080000-0000-0000-0000-000000000002%'),'search audit payload includes erased account');
select throws_ok($$select public.native_admin_execute('16080000-0000-0000-0000-000000000001','https://admin-deleted.clerk.invalid','set_tester','{"account_id":"16080000-0000-0000-0000-000000000002","enabled":true}','sandbox')$$,'28000','account_deleted','mutating erased target still rejected');
select public.apply_clerk_user_event('admin-reader-delete',repeat('b',64),'https://admin-deleted.clerk.invalid','user_admin_reader','user.deleted',now(),null);
select throws_ok($$select public.native_admin_execute('16080000-0000-0000-0000-000000000001','https://admin-deleted.clerk.invalid','get_account','{"account_id":"16080000-0000-0000-0000-000000000002"}','sandbox')$$,'28000','account_deleted','erased actor cannot read');
select * from finish();
rollback;
