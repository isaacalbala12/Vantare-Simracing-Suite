-- Step 10 characterization. Synthetic identities; transaction always rolled back.
begin;
select no_plan();
insert into private.clerk_issuers(issuer,authorized_parties,enabled)
 values('https://audit-minimal.invalid',array['https://app.invalid'],true);
insert into public.profiles(id,email,display_name) values
 ('19101000-0000-4000-8000-000000000001','actor@example.invalid','Fixture actor'),
 ('19101000-0000-4000-8000-000000000002','target@example.invalid','Fixture target');
insert into public.account_identities(issuer,subject,account_id) values
 ('https://audit-minimal.invalid','user_audit_target','19101000-0000-4000-8000-000000000002');
select * from public.operational_access_set('19101000-0000-4000-8000-000000000001',
 'owner','grant','test:audit','Minimal audit fixture','audit-actor',null);
create function pg_temp.audit_action(action text,params jsonb) returns jsonb language sql as $$
 select public.native_admin_execute('19101000-0000-4000-8000-000000000001',
 'https://audit-minimal.invalid',action,
 params||jsonb_build_object('account_id','19101000-0000-4000-8000-000000000002'),'sandbox')
$$;
select lives_ok($$select pg_temp.audit_action('set_tester','{"enabled":true}')$$,
 'owner can change tester before erasure');
select is((select count(*)::int from public.admin_audit_log where action='set_tester'
 and actor_account_id='19101000-0000-4000-8000-000000000001'),1,
 'successful mutation keeps its audit evidence');
select ok(not exists(select 1 from public.admin_audit_log where action='set_tester'
 and (jsonb_path_exists(coalesce(before_value,'{}'),'$.**.payments')
   or jsonb_path_exists(coalesce(after_value,'{}'),'$.**.payments')
   or jsonb_path_exists(coalesce(before_value,'{}'),'$.**.plan')
   or jsonb_path_exists(coalesce(after_value,'{}'),'$.**.plan'))),
 'mutation audit does not duplicate full account/payment summaries');
select is(private.admin_audit_fields('{"enabled":true}','set_tester'),'{"enabled":true}'::jsonb,
 'second pass preserves an already-minimized true value');
insert into private.mail_audit(id,actor,action,target,detail) values
 ('19101000-0000-4000-8000-000000000011','19101000-0000-4000-8000-000000000001','consent','19101000-0000-4000-8000-000000000002','{"consent":true}'),
 ('19101000-0000-4000-8000-000000000012','19101000-0000-4000-8000-000000000002','consent','contact','{"consent":true}');
insert into public.admin_audit_log(id,actor_account_id,action,target) values
 ('19101000-0000-4000-8000-000000000013','19101000-0000-4000-8000-000000000002','get_rollout','get_rollout');
create temporary table audit_effect_event as select jsonb_build_object(
 'request_id','19101000-0000-4000-8000-000000000021',
 'effect_id','19101000-0000-4000-8000-000000000022','action','set_blocked',
 'effect','clerk_ban','target_hash',encode(sha256(convert_to('user_audit_target','UTF8')),'hex'),
 'outcome','started') event;
select public.native_admin_record_effect('19101000-0000-4000-8000-000000000001',event,
 '19101000-0000-4000-8000-000000000002') from audit_effect_event;
select public.native_admin_record_effect('19101000-0000-4000-8000-000000000001',event||'{"outcome":"succeeded"}',
 '19101000-0000-4000-8000-000000000002') from audit_effect_event;
select public.native_admin_record_effect('19101000-0000-4000-8000-000000000001',
 event||'{"effect_id":"19101000-0000-4000-8000-000000000023"}',
 '19101000-0000-4000-8000-000000000002') from audit_effect_event;
select public.native_admin_record_effect('19101000-0000-4000-8000-000000000001',
 event||'{"effect_id":"19101000-0000-4000-8000-000000000023","outcome":"unknown"}',
 '19101000-0000-4000-8000-000000000002') from audit_effect_event;
insert into private.mail_contacts(id,email,account_id,locale,evidence,consent,sync_lease,sync_lease_until)
 values('19101000-0000-4000-8000-000000000031','effect-target@example.invalid',
 '19101000-0000-4000-8000-000000000002','es','fixture',true,
 '19101000-0000-4000-8000-000000000032',clock_timestamp()+interval '60 seconds');
select public.native_admin_record_mail_sync('19101000-0000-4000-8000-000000000001',
 '19101000-0000-4000-8000-000000000021','19101000-0000-4000-8000-000000000033',
 'brevo_contact_upsert','19101000-0000-4000-8000-000000000031',
 '19101000-0000-4000-8000-000000000032','started');
select public.native_admin_record_mail_sync('19101000-0000-4000-8000-000000000001',
 '19101000-0000-4000-8000-000000000021','19101000-0000-4000-8000-000000000033',
 'brevo_contact_upsert','19101000-0000-4000-8000-000000000031',
 '19101000-0000-4000-8000-000000000032','unknown',503);
insert into private.mail_campaigns(id,environment,state,approved_by) values
 ('19101000-0000-4000-8000-000000000034','sandbox','sending','19101000-0000-4000-8000-000000000001');
insert into private.mail_deliveries(id,campaign_id,email,locale,status,reserved_at) values
 ('19101000-0000-4000-8000-000000000035','19101000-0000-4000-8000-000000000034',
 'effect-target@example.invalid','es','dispatching',now());
select public.native_admin_record_mail_send('19101000-0000-4000-8000-000000000001',
 '19101000-0000-4000-8000-000000000021','19101000-0000-4000-8000-000000000036',
 '19101000-0000-4000-8000-000000000035','sandbox','started');
select public.native_admin_record_mail_send('19101000-0000-4000-8000-000000000001',
 '19101000-0000-4000-8000-000000000021','19101000-0000-4000-8000-000000000036',
 '19101000-0000-4000-8000-000000000035','sandbox','succeeded',201);
insert into private.mail_contact_erasures(id,email,account_id,email_fingerprint,state,lease,lease_until)
 values('19101000-0000-4000-8000-000000000037','old-effect-target@example.invalid',
 '19101000-0000-4000-8000-000000000002',repeat('a',64),'processing',
 '19101000-0000-4000-8000-000000000038',clock_timestamp()+interval '60 seconds');
select public.native_admin_record_mail_erasure('19101000-0000-4000-8000-000000000037',
 '19101000-0000-4000-8000-000000000038','19101000-0000-4000-8000-000000000021',
 '19101000-0000-4000-8000-000000000039','started');
select public.native_admin_record_mail_erasure('19101000-0000-4000-8000-000000000037',
 '19101000-0000-4000-8000-000000000038','19101000-0000-4000-8000-000000000021',
 '19101000-0000-4000-8000-000000000039','unknown',503);
select lives_ok($$select pg_temp.audit_action('prepare_account_deletion',
 jsonb_build_object('confirmation_hash',repeat('a',64),'clerk_subject','user_audit_target'))$$,
 'the real deletion path prepares a durable tombstone');
select ok((select email is null and display_name is null from public.profiles
 where id='19101000-0000-4000-8000-000000000002'),'erasure removes profile PII');
select ok(not exists(select 1 from public.admin_audit_log
 where target='19101000-0000-4000-8000-000000000002'),
 'erasure removes the link from closed audit to the target');
select ok(not exists(select 1 from public.admin_audit_log where action='set_tester'
 and (jsonb_path_exists(coalesce(before_value,'{}'),'$.**.account_id')
   or jsonb_path_exists(coalesce(after_value,'{}'),'$.**.account_id'))),
 'erasure leaves no copied target summary in previous audit entries');
select ok(exists(select 1 from public.admin_audit_log where action='set_tester'
 and actor_account_id='19101000-0000-4000-8000-000000000001' and occurred_at is not null),
 'minimal evidence still records actor action and time');
select is((select target from public.admin_audit_log where action='set_tester'
 and actor_account_id='19101000-0000-4000-8000-000000000001'),'erased','real erasure rewrites live admin row to erased');
select is((select target from private.mail_audit where id='19101000-0000-4000-8000-000000000011'),'erased','real erasure rewrites live mail row to erased');
select ok((select actor_account_id is null from public.admin_audit_log where id='19101000-0000-4000-8000-000000000013'),'erasure removes deleted actor from admin audit');
select ok((select actor is null from private.mail_audit where id='19101000-0000-4000-8000-000000000012'),'erasure removes deleted actor from mail audit');
select pg_temp.audit_action('get_account','{}');
insert into private.mail_audit(id,actor,action,target,detail) values
 ('19101000-0000-4000-8000-000000000014','19101000-0000-4000-8000-000000000001','consent','19101000-0000-4000-8000-000000000002','{}');
select is((select target from public.admin_audit_log where action='get_account'
 and actor_account_id='19101000-0000-4000-8000-000000000001'),'erased','admin row written after erasure stays erased');
select is((select target from private.mail_audit where id='19101000-0000-4000-8000-000000000014'),'erased','mail row written after erasure stays erased');
select ok(not exists(select 1 from private.admin_effects
 where effect_id='19101000-0000-4000-8000-000000000022' and target_hash<>'erased'),
 'real deletion removes hashes from all closed effect events');
select ok((select target_hash<>'erased' from private.admin_effects
 where effect_id='19101000-0000-4000-8000-000000000023' and outcome='started'),
 'pending effect keeps its intent hash after account erasure');
select public.native_admin_reconcile_effect('19101000-0000-4000-8000-000000000001',
 '19101000-0000-4000-8000-000000000023');
set constraints all immediate;
select ok(not exists(select 1 from private.admin_effects
 where effect_id='19101000-0000-4000-8000-000000000023' and target_hash<>'erased'),
 'reconcile removes the hash of a pending erased account');
select ok(not exists(select 1 from private.admin_effects where target_account='19101000-0000-4000-8000-000000000002'),
 'erasure retains no account UUID in effect associations');
select ok(not exists(select 1 from private.admin_effects
 where effect_id='19101000-0000-4000-8000-000000000036' and target_hash<>'erased'),
 'SMTP closed effects erase their delivery hashes when the account is erased');
select is((select count(*)::integer from private.admin_pending_effects
 where effect_id in('19101000-0000-4000-8000-000000000033','19101000-0000-4000-8000-000000000039')
 and target_hash<>'erased'),2,'Brevo sync and DELETE keep pending hashes');
set constraints all deferred;
select public.native_admin_reconcile_effect('19101000-0000-4000-8000-000000000001',
 '19101000-0000-4000-8000-000000000033');
select public.native_admin_reconcile_effect('19101000-0000-4000-8000-000000000001',
 '19101000-0000-4000-8000-000000000039');
set constraints all immediate;
select ok(not exists(select 1 from private.admin_effects
 where effect_id in('19101000-0000-4000-8000-000000000033','19101000-0000-4000-8000-000000000039')
 and target_hash<>'erased'),'Brevo reconcile erases hashes after source contact/lease disappeared');
set constraints all deferred;
select public.native_admin_record_effect('19101000-0000-4000-8000-000000000001',
 event||'{"effect_id":"19101000-0000-4000-8000-000000000024","action":"delete_account","effect":"clerk_delete"}',
 '19101000-0000-4000-8000-000000000002') from audit_effect_event;
select is(public.native_admin_record_effect('19101000-0000-4000-8000-000000000001',
 event||'{"effect_id":"19101000-0000-4000-8000-000000000024","action":"delete_account","effect":"clerk_delete","outcome":"succeeded"}',
 '19101000-0000-4000-8000-000000000002'),true,'result after tombstone validates the original hash before redaction') from audit_effect_event;
set constraints all immediate;
select ok(not exists(select 1 from private.admin_effects
 where effect_id='19101000-0000-4000-8000-000000000024' and target_hash<>'erased'),
 'a new successful provider effect on an erased account also drops its hash');
select ok(has_function_privilege('service_role','public.native_admin_record_effect(uuid,jsonb,uuid)','EXECUTE')
 and not has_function_privilege('service_role','public.native_admin_record_effect(uuid,jsonb)','EXECUTE')
 and not has_function_privilege('anon','public.native_admin_record_effect(uuid,jsonb,uuid)','EXECUTE')
 and not has_function_privilege('authenticated','public.native_admin_record_effect(uuid,jsonb,uuid)','EXECUTE'),
 'only the account-bound recorder is exposed to service_role');
insert into private.mail_audit(id,actor,action,target,detail) values
 ('19101000-0000-4000-8000-000000000015','19101000-0000-4000-8000-000000000002','consent','contact','{}');
select ok((select actor is null from private.mail_audit where id='19101000-0000-4000-8000-000000000015'),
 'mail entry after account erasure cannot reintroduce the deleted actor');
select * from finish();
rollback;
