begin;
select plan(5);
insert into private.clerk_issuers(issuer,authorized_parties,enabled)
 values('https://pilot-delete.clerk.invalid',array['https://app.invalid'],true);
insert into public.profiles(id) values('16080000-0000-0000-0000-000000000004');
insert into public.account_identities(issuer,subject,account_id)
 values('https://pilot-delete.clerk.invalid','user_pilot_delete','16080000-0000-0000-0000-000000000004');
insert into public.pilot_profiles(account_id,profile) values('16080000-0000-0000-0000-000000000004','{"public_name":"Erase me"}');
insert into pilot_private.operations(account_id,op_id,result) values('16080000-0000-0000-0000-000000000004',gen_random_uuid(),'{"public_name":"Erase me"}');
insert into storage.objects(bucket_id,name) values('pilot-photos','16080000-0000-0000-0000-000000000004/'||repeat('a',64)||'.jpg');
select public.apply_clerk_user_event('pilot-delete',repeat('a',64),'https://pilot-delete.clerk.invalid','user_pilot_delete','user.deleted',now(),null);
select is((select count(*)::int from public.pilot_profiles where account_id='16080000-0000-0000-0000-000000000004'),0,'pilot PII removed');
select is((select count(*)::int from pilot_private.operations where account_id='16080000-0000-0000-0000-000000000004'),0,'pilot receipt copies removed');
select is((select count(*)::int from public.clerk_deletion_objects('https://pilot-delete.clerk.invalid','user_pilot_delete') where bucket_id='pilot-photos'),1,'ownerless photo queued by UUID path');
select throws_ok($$insert into storage.objects(bucket_id,name) values('pilot-photos','16080000-0000-0000-0000-000000000004/'||repeat('b',64)||'.jpg')$$,'28000','account_deleted','new photo path rejected');
select throws_ok($$insert into pilot_private.operations(account_id,op_id,result) values('16080000-0000-0000-0000-000000000004',gen_random_uuid(),'{}')$$,'28000','account_deleted','new receipt rejected');
select * from finish();
rollback;
