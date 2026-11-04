-- Step 6 characterization: server checks the state actually shown to the owner.
begin;
select no_plan();
insert into public.profiles(id) values
 ('19100600-0000-4000-8000-000000000001'),('19100600-0000-4000-8000-000000000002'),
 ('19100600-0000-4000-8000-000000000003');
select * from public.operational_access_set('19100600-0000-4000-8000-000000000001','owner','grant','fixture','Confirmation owner','confirmation-owner',null);
select * from public.operational_access_set('19100600-0000-4000-8000-000000000003','owner','grant','fixture','Expired owner','confirmation-expired',null);
update public.operational_access_assignments set granted_at=now()-interval '2 days',expires_at=now()-interval '1 day'
 where user_id='19100600-0000-4000-8000-000000000003';
create function pg_temp.mail(action text,params jsonb) returns jsonb language sql as $$
 select public.mail_admin_execute('19100600-0000-4000-8000-000000000001',action,params,'sandbox') $$;
create function pg_temp.admin(action text,params jsonb) returns jsonb language sql as $$
 select public.native_admin_execute('19100600-0000-4000-8000-000000000001','https://confirmation.invalid',action,params,'sandbox') $$;
select public.mail_record_consent(null,'confirm-one@example.invalid','es',true,'fixture',true);
insert into private.mail_campaigns(id,environment,target_group,content) values
 ('19100600-0000-4000-8000-000000000010','sandbox','waitlist',
 '{"es":{"subject":"Fixture","body":"Fixture"},"en":{"subject":"Fixture","body":"Fixture"},"it":{"subject":"Fixture","body":"Fixture"},"pt-BR":{"subject":"Fixture","body":"Fixture"}}');
select is((pg_temp.mail('mail_get','{"campaign_id":"19100600-0000-4000-8000-000000000010"}')->>'recipients')::integer,1,
 'campaign detail returns the eligible count used for confirmation');
select throws_ok($$select pg_temp.mail('mail_approve','{"campaign_id":"19100600-0000-4000-8000-000000000010","revision":1,"confirm":true,"expected_recipients":2}')$$,
 '40001','mail_revision_conflict','changed recipient count conflicts atomically');
select is((select state from private.mail_campaigns where id='19100600-0000-4000-8000-000000000010'),'draft','failed approval preserves draft');
select is((select count(*)::integer from private.mail_deliveries where campaign_id='19100600-0000-4000-8000-000000000010'),0,'failed approval does not queue deliveries');
insert into private.mail_campaigns(id,environment) values('19100600-0000-4000-8000-000000000012','sandbox');
select is((pg_temp.mail('mail_save',jsonb_build_object('campaign_id','19100600-0000-4000-8000-000000000012','revision',1,'name','Fixture','template','news','target_group','waitlist','content',(select content from private.mail_campaigns where id='19100600-0000-4000-8000-000000000010')))->>'recipients')::integer,1,'draft save returns recipients');
select ok(not (pg_temp.mail('mail_new','{}') ? 'recipients'),'new campaign does not recount contacts');
select throws_ok($$select pg_temp.mail('mail_cancel','{"campaign_id":"19100600-0000-4000-8000-000000000010","revision":1}')$$,
 'P0001','native_admin_invalid','draft cannot be canceled');
select lives_ok($$select pg_temp.mail('mail_approve','{"campaign_id":"19100600-0000-4000-8000-000000000010","revision":1,"confirm":true,"expected_recipients":1}')$$,'matching count approves');
select ok(not (pg_temp.mail('mail_get','{"campaign_id":"19100600-0000-4000-8000-000000000010"}') ? 'recipients'),'sending detail does not recount contacts');
create temporary table claimed as select (pg_temp.mail('mail_claim','{"campaign_id":"19100600-0000-4000-8000-000000000010","revision":1}')->'delivery'->>'id')::uuid id;
select ok((select id is not null from claimed),'sending campaign can claim a delivery');
select throws_ok($$select pg_temp.mail('mail_cancel','{"campaign_id":"19100600-0000-4000-8000-000000000010","revision":2}')$$,
 'P0001','mail_revision_conflict','stale cancellation leaves the sending campaign intact');
select lives_ok($$select pg_temp.mail('mail_cancel','{"campaign_id":"19100600-0000-4000-8000-000000000010","revision":1}')$$,'owner can cancel a sending campaign');
select is((select state from private.mail_campaigns where id='19100600-0000-4000-8000-000000000010'),'canceled','cancel is durable');
select ok(not exists(select 1 from private.mail_deliveries where campaign_id='19100600-0000-4000-8000-000000000010' and status='pending'),'cancel skips pending deliveries');
select is((pg_temp.mail('mail_can_send',jsonb_build_object('delivery_id',(select id from claimed)))->>'allowed')::boolean,false,
 'a claimed delivery cannot start HTTP after cancellation');
select lives_ok(format($$select pg_temp.mail('mail_finish',%L)$$,jsonb_build_object('delivery_id',(select id from claimed),'status','skipped')),'denied delivery finishes skipped');
select is((select status from private.mail_deliveries where id=(select id from claimed)),'skipped','claim cancel finish leaves no dispatching delivery');
select ok(not (pg_temp.mail('mail_cancel','{"campaign_id":"19100600-0000-4000-8000-000000000010","revision":1}') ? 'recipients'),'cancel ACK does not recount contacts');
insert into private.mail_campaigns(id,environment,state) values('19100600-0000-4000-8000-000000000011','sandbox','completed');
select throws_ok($$select pg_temp.mail('mail_cancel','{"campaign_id":"19100600-0000-4000-8000-000000000011","revision":1}')$$,
 'P0001','native_admin_invalid','completed cannot be canceled');
select ok(not (pg_temp.mail('mail_get','{"campaign_id":"19100600-0000-4000-8000-000000000011"}') ? 'recipients'),'completed detail does not recount contacts');
select is(pg_temp.mail('mail_claim','{"campaign_id":"19100600-0000-4000-8000-000000000010","revision":1}')->'delivery','null'::jsonb,'canceled campaign cannot claim another delivery');
select lives_ok($$select pg_temp.mail('mail_cancel','{"campaign_id":"19100600-0000-4000-8000-000000000010","revision":1}')$$,'cancel retry is idempotent');
select is((select count(*)::integer from private.mail_audit where action='mail_cancel'),1,'cancel retry does not duplicate its audit');
update public.module_rollout set enabled_for_all=true where module='vantare.module.strategy';
select throws_ok($$select pg_temp.admin('set_rollout','{"module":"vantare.module.strategy","enabled_for_all":false,"expected_enabled":false}')$$,
 '40001','account_conflict','stale rollout confirmation conflicts');
select ok((select enabled_for_all from public.module_rollout where module='vantare.module.strategy'),'stale rollout does not change global access');
select lives_ok($$select pg_temp.admin('set_rollout','{"module":"vantare.module.strategy","enabled_for_all":false,"expected_enabled":true}')$$,'fresh rollout confirmation applies');
select throws_ok($$select pg_temp.admin('set_module','{"account_id":"19100600-0000-4000-8000-000000000002","module":"vantare.module.strategy","enabled":true,"expected_enabled":true}')$$,
 '40001','account_conflict','stale individual access conflicts');
select lives_ok($$select pg_temp.admin('set_module','{"account_id":"19100600-0000-4000-8000-000000000002","module":"vantare.module.strategy","enabled":true,"expected_enabled":false}')$$,'fresh individual access applies');
select throws_ok($$select public.mail_admin_execute('19100600-0000-4000-8000-000000000002','mail_cancel','{"campaign_id":"19100600-0000-4000-8000-000000000010","revision":1}','sandbox')$$,
 '42501','native_admin_forbidden','non owner cannot cancel');
select throws_ok($$select public.mail_admin_execute('19100600-0000-4000-8000-000000000003','mail_cancel','{"campaign_id":"19100600-0000-4000-8000-000000000010","revision":1}','sandbox')$$,
 '42501','native_admin_forbidden','expired owner cannot cancel');
select * from finish();
rollback;
