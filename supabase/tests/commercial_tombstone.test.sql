begin;
select plan(19);
insert into private.clerk_issuers(issuer,authorized_parties,enabled)
values('https://delete.clerk.invalid',array['https://app.invalid'],true);
select set_config('test.account',public.native_resolve_account('https://delete.clerk.invalid','user_aaaaaaaaaaaaaaaaaaaaaaaaaaa')::text,true);
insert into public.account_identities(issuer,subject,account_id)
values('https://delete.clerk.invalid','user_historical_alias',current_setting('test.account')::uuid);
update public.profiles set email='erase@example.invalid',display_name='Erase me' where id=current_setting('test.account')::uuid;
insert into public.billing_access_grants(user_id,provider,environment,source_type,source_id,capability,status,resource_modified_at,snapshot_hash)
values(current_setting('test.account')::uuid,'polar','sandbox','order','retained-order','launch_bundle','active',now(),repeat('a',64));
insert into storage.objects(bucket_id,name,owner_id) values('testing-center-evidence','private-deleted.png',current_setting('test.account')::uuid);
set local role authenticated;
select set_config('request.jwt.claims','{"iss":"https://delete.clerk.invalid","sub":"user_aaaaaaaaaaaaaaaaaaaaaaaaaaa","sid":"sess_prior","azp":"https://app.invalid","role":"authenticated"}',true);
select is(private.current_account()::text,current_setting('test.account'),'previous session maps to the historic UUID');
select lives_ok($$select public.reset_active_device(repeat('a',64))$$,'previous bearer can reset before deletion');
reset role;
select public.apply_clerk_user_event('update-before-delete',repeat('f',64),'https://delete.clerk.invalid','user_aaaaaaaaaaaaaaaaaaaaaaaaaaa','user.updated',now()+interval '1 hour','erase@example.invalid');
select is(public.apply_clerk_user_event('deleted-1',repeat('a',64),'https://delete.clerk.invalid','user_aaaaaaaaaaaaaaaaaaaaaaaaaaa','user.deleted',now(),null),'applied','signed deletion applies');
select is((select user_event_at from public.account_identities where issuer='https://delete.clerk.invalid' and subject='user_aaaaaaaaaaaaaaaaaaaaaaaaaaa'),now()+interval '1 hour','deletion dominates while version timestamp stays monotonic');
select is(public.apply_clerk_user_event('deleted-1',repeat('a',64),'https://delete.clerk.invalid','user_aaaaaaaaaaaaaaaaaaaaaaaaaaa','user.deleted',now(),null),'unchanged','duplicate deletion is idempotent');
select is(public.apply_clerk_user_event('updated-late',repeat('b',64),'https://delete.clerk.invalid','user_aaaaaaaaaaaaaaaaaaaaaaaaaaa','user.updated',now()+interval '1 hour','resurrect@example.invalid'),'ignored','later update cannot resurrect');
select is((select email from public.profiles where id=current_setting('test.account')::uuid),null::text,'PII erased');
select is((select count(*)::int from public.account_identities where account_id=current_setting('test.account')::uuid and deleted_at is null),0,'historical aliases of the UUID also tombstoned');
select is((select count(*)::int from public.devices where user_id=current_setting('test.account')::uuid),0,'device removed');
select is((select count(*)::int from public.clerk_deletion_objects('https://delete.clerk.invalid','user_aaaaaaaaaaaaaaaaaaaaaaaaaaa')),1,'Storage removal queued durably');
select is((select count(*)::int from storage.objects where name='private-deleted.png'),1,'SQL does not delete bytes behind Storage API');
select lives_ok($$select public.clerk_deletion_completed('https://delete.clerk.invalid','user_aaaaaaaaaaaaaaaaaaaaaaaaaaa','testing-center-evidence',array['private-deleted.png'])$$,'Storage acknowledgement drains only the deleted identity queue');
update public.billing_access_grants set status='active' where source_id='retained-order';
select is((select status from public.billing_access_grants where source_id='retained-order'),'revoked','late Polar mutation keeps source revoked');
select is((select count(*)::int from public.billing_access_grants where source_id='retained-order'),1,'financial trace retained');
select throws_ok($$select public.native_resolve_account('https://delete.clerk.invalid','user_aaaaaaaaaaaaaaaaaaaaaaaaaaa')$$,'28000','account_deleted','new license/bearer cannot resolve tombstone');
set local role authenticated;
select is(private.current_account(),null::uuid,'previous bearer denied immediately, before expiry');
select throws_ok($$select public.reset_active_device(repeat('b',64))$$,'28000','not_authenticated','previous bearer cannot reset');
select is((select count(*)::int from public.profiles),0,'previous bearer cannot read profile via RLS');
reset role;
select is(public.apply_clerk_user_event('delete-before-create',repeat('c',64),'https://delete.clerk.invalid','user_bbbbbbbbbbbbbbbbbbbbbbbbbbb','user.deleted',now(),null),'applied','delete before bootstrap persists tombstone');
select * from finish();
rollback;
