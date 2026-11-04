begin;
select no_plan();
select ok(has_function_privilege('service_role','public.native_admin_claim_mail_erasure(uuid,uuid,uuid)','execute'),'service atomic claim callable');
select ok(not has_function_privilege('anon','public.native_admin_claim_mail_erasure(uuid,uuid,uuid)','execute'),'anon atomic claim denied');
select ok(not has_function_privilege('authenticated','public.native_admin_claim_mail_erasure(uuid,uuid,uuid)','execute'),'authenticated atomic claim denied');
insert into public.profiles(id) values
 ('19105600-0000-4000-8000-000000000001'),
 ('19105600-0000-4000-8000-000000000002'),
 ('19105600-0000-4000-8000-000000000003');
select * from public.operational_access_set('19105600-0000-4000-8000-000000000001','owner','grant','fixture','Brevo owner','brevo-owner',null);
select * from public.operational_access_set('19105600-0000-4000-8000-000000000002','owner','grant','fixture','Brevo reviewer','brevo-reviewer',null);
insert into private.mail_contact_erasures(id,email,email_fingerprint,state,lease,lease_until)
 values('19105600-0000-4000-8000-000000000010','brevo-sql@example.invalid',repeat('b',64),'processing',
 '19105600-0000-4000-8000-000000000011',clock_timestamp()+interval '1 hour');
select ok(has_function_privilege('service_role','public.native_admin_record_mail_erasure(uuid,uuid,uuid,uuid,text,integer,uuid)','execute'),'service recorder callable');
select ok(not has_function_privilege('anon','public.native_admin_record_mail_erasure(uuid,uuid,uuid,uuid,text,integer,uuid)','execute'),'anon denied');
select ok(not has_function_privilege('authenticated','public.native_admin_record_mail_erasure(uuid,uuid,uuid,uuid,text,integer,uuid)','execute'),'authenticated denied');
select ok(not has_table_privilege('service_role','private.admin_effects','insert'),'no direct journal insert');
set local role service_role;
select throws_ok($$select public.native_admin_record_mail_erasure('19105600-0000-4000-8000-000000000010','19105600-0000-4000-8000-000000000012','19105600-0000-4000-8000-000000000020','19105600-0000-4000-8000-000000000021','started')$$,'22023','native_admin_invalid','wrong lease cannot start');
select throws_ok($$select public.native_admin_record_mail_erasure('19105600-0000-4000-8000-000000000010','19105600-0000-4000-8000-000000000011','19105600-0000-4000-8000-000000000020','19105600-0000-4000-8000-000000000021','started',null,'19105600-0000-4000-8000-000000000003')$$,'42501','native_admin_forbidden','non-owner cannot impersonate admin');
select is(public.native_admin_record_mail_erasure('19105600-0000-4000-8000-000000000010','19105600-0000-4000-8000-000000000011','19105600-0000-4000-8000-000000000020','19105600-0000-4000-8000-000000000021','started'),true,'worker with lease records intent');
select is(public.native_admin_record_mail_erasure('19105600-0000-4000-8000-000000000010','19105600-0000-4000-8000-000000000011','19105600-0000-4000-8000-000000000020','19105600-0000-4000-8000-000000000021','unknown'),true,'worker records unknown');
reset role;
select is((select count(*)::integer from private.admin_pending_effects where effect_id='19105600-0000-4000-8000-000000000021'),1,'unknown uses existing pending view');
set local role service_role;
select throws_ok($$select public.native_admin_reconcile_effect('19105600-0000-4000-8000-000000000003','19105600-0000-4000-8000-000000000021')$$,'42501','native_admin_forbidden','non-owner cannot reconcile');
select is(public.native_admin_reconcile_effect('19105600-0000-4000-8000-000000000002','19105600-0000-4000-8000-000000000021'),true,'existing owner reconcile closes Brevo');
reset role;
select is((select count(*)::integer from private.admin_pending_effects where effect_id='19105600-0000-4000-8000-000000000021'),0,'reconciled no longer pending');
set local role service_role;
select throws_ok($$select public.native_admin_record_mail_erasure('19105600-0000-4000-8000-000000000010','19105600-0000-4000-8000-000000000011','19105600-0000-4000-8000-000000000020','19105600-0000-4000-8000-000000000021','succeeded',204)$$,'22023','native_admin_invalid','late result cannot reopen reconciled intent');
select is(public.native_admin_record_mail_erasure('19105600-0000-4000-8000-000000000010','19105600-0000-4000-8000-000000000011','19105600-0000-4000-8000-000000000030','19105600-0000-4000-8000-000000000031','started',null,'19105600-0000-4000-8000-000000000001'),true,'owner records own actor');
select is(public.native_admin_record_mail_erasure('19105600-0000-4000-8000-000000000010','19105600-0000-4000-8000-000000000011','19105600-0000-4000-8000-000000000050','19105600-0000-4000-8000-000000000051','started'),true,'second worker intent');
select is(public.native_admin_record_mail_erasure('19105600-0000-4000-8000-000000000010','19105600-0000-4000-8000-000000000011','19105600-0000-4000-8000-000000000050','19105600-0000-4000-8000-000000000051','failed',403),true,'HTTP403 is definitive failed');
select throws_ok($$select public.native_admin_record_mail_erasure('19105600-0000-4000-8000-000000000010','19105600-0000-4000-8000-000000000011','19105600-0000-4000-8000-000000000050','19105600-0000-4000-8000-000000000051','succeeded',403)$$,'22023','native_admin_invalid','HTTP403 cannot be succeeded');
select throws_ok($$select public.native_admin_record_mail_erasure('19105600-0000-4000-8000-000000000010','19105600-0000-4000-8000-000000000011','19105600-0000-4000-8000-000000000050','19105600-0000-4000-8000-000000000051','unknown',503)$$,'22023','native_admin_invalid','conflicting terminal result rejected');
select throws_ok($$select public.native_admin_record_mail_erasure('19105600-0000-4000-8000-000000000010','19105600-0000-4000-8000-000000000011','19105600-0000-4000-8000-000000000060','19105600-0000-4000-8000-000000000061','succeeded',204)$$,'22023','native_admin_invalid','result without intent rejected');
reset role;
update public.operational_access_assignments set granted_at=now()-interval '2 days',expires_at=now()-interval '1 day' where user_id='19105600-0000-4000-8000-000000000001';
update private.mail_contact_erasures set lease_until=clock_timestamp()-interval '1 second' where id='19105600-0000-4000-8000-000000000010';
set local role service_role;
select is(public.native_admin_record_mail_erasure('19105600-0000-4000-8000-000000000010','19105600-0000-4000-8000-000000000011','19105600-0000-4000-8000-000000000030','19105600-0000-4000-8000-000000000031','succeeded',404,'19105600-0000-4000-8000-000000000001'),true,'matching result closes after actor/lease expiry');
reset role;
select is((select provider_status from private.admin_effects where effect_id='19105600-0000-4000-8000-000000000031' and outcome='succeeded'),404::smallint,'DELETE404 explicit');
set local role service_role;
select throws_ok($$select public.native_admin_record_mail_erasure('19105600-0000-4000-8000-000000000010','19105600-0000-4000-8000-000000000011','19105600-0000-4000-8000-000000000040','19105600-0000-4000-8000-000000000041','started')$$,'22023','native_admin_invalid','expired lease cannot create another intent');
reset role;
select throws_ok($$select public.native_admin_record_mail_erasure('19105600-0000-4000-8000-000000000010','19105600-0000-4000-8000-000000000011','19105600-0000-4000-8000-000000000070','19105600-0000-4000-8000-000000000071','started',null,'19105600-0000-4000-8000-000000000001')$$,'42501','native_admin_forbidden','expired owner cannot start another admin effect');
select ok(not exists(select 1 from private.admin_effects where effect='brevo_delete' and (to_jsonb(admin_effects)::text like '%@%' or to_jsonb(admin_effects)::text like '%https://%' or to_jsonb(admin_effects)::text like '%19105600-0000-4000-8000-000000000011%')),'journal has no email URL or lease');
set local role service_role;
reset role;
select * from finish();
rollback;
