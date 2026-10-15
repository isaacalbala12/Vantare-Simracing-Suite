begin;
select no_plan();
insert into public.profiles(id) values('00000000-0000-4000-8000-000000001636'),('00000000-0000-4000-8000-000000001637');
select * from public.operational_access_set('00000000-0000-4000-8000-000000001636','owner','grant','test:mail','Mail fixture','test:mail-owner',null);
create function pg_temp.mail(action text,params jsonb default '{}') returns jsonb language sql as $$
 select public.mail_admin_execute('00000000-0000-4000-8000-000000001636',action,params,'sandbox') $$;
select ok(not has_function_privilege('authenticated','public.mail_admin_execute(uuid,text,jsonb,text)','execute'),'client cannot call privileged mail RPC');
select ok(not has_function_privilege('anon','public.mail_unsubscribe(text)','execute'),'withdrawal requires signed Edge route');
select ok(not has_table_privilege('service_role','private.mail_contacts','select'),'contacts private even from generic service table access');
select throws_ok($$select public.mail_admin_execute('00000000-0000-4000-8000-000000001637','mail_list','{}','sandbox')$$,'42501','native_admin_forbidden','non Owner denied in SQL');
select lives_ok($$select public.mail_record_consent(null,'yes@example.invalid','es',true,'verified_waitlist_checkbox_v1',true)$$,'explicit waitlist consent');
select public.mail_record_consent(null,'no@example.invalid','en',false,'verified_waitlist_checkbox_v1',true);
select is(private.mail_groups('yes@example.invalid','sandbox'),array['waitlist'],'only consented waitlist group');
select is(private.mail_groups('no@example.invalid','sandbox'),null,'no consent means no groups');
create temporary table campaign as select (pg_temp.mail('mail_new')->'campaign'->>'id')::uuid id;
select is((pg_temp.mail('mail_list')->>'quota_remaining')::integer,300,'initial quota');
select throws_ok(format($$select pg_temp.mail('mail_approve',%L)$$,jsonb_build_object('campaign_id',(select id from campaign),'revision',1,'confirm',true)),'P0001','native_admin_invalid','blank draft never approves');
select lives_ok(format($$select pg_temp.mail('mail_save',%L)$$,jsonb_build_object('campaign_id',(select id from campaign),'revision',1,'name','Prueba','template','news','target_group','waitlist','content',(select jsonb_object_agg(lang,jsonb_build_object('subject','Test','body','Hello')) from unnest(array['es','en','it','pt-BR']) lang))),'save all four reviewed variants');
select throws_ok(format($$select pg_temp.mail('mail_approve',%L)$$,jsonb_build_object('campaign_id',(select id from campaign),'revision',1,'confirm',true)),'P0001','mail_revision_conflict','stale approval refused');
select throws_ok(format($$select pg_temp.mail('mail_approve',%L)$$,jsonb_build_object('campaign_id',(select id from campaign),'revision',2,'confirm',false)),'P0001','native_admin_invalid','explicit confirmation required');
select is(pg_temp.mail('mail_claim',jsonb_build_object('campaign_id',(select id from campaign),'revision',2))->'delivery','null'::jsonb,'unapproved claim produces no recipient');
select pg_temp.mail('mail_approve',jsonb_build_object('campaign_id',(select id from campaign),'revision',2,'confirm',true));
select is((select count(*)::integer from private.mail_deliveries),1,'only consented recipient queued');
select pg_temp.mail('mail_approve',jsonb_build_object('campaign_id',(select id from campaign),'revision',2,'confirm',true));
select is((select count(*)::integer from private.mail_deliveries),1,'duplicate approval never duplicates recipients');
select throws_ok(format($$select public.mail_admin_execute('00000000-0000-4000-8000-000000001636','mail_get',%L,'production')$$,jsonb_build_object('campaign_id',(select id from campaign))),'P0001','native_admin_not_found','environment isolated');
select public.mail_unsubscribe('yes@example.invalid');
select public.mail_unsubscribe('yes@example.invalid');
select is((select consent from private.mail_contacts where email='yes@example.invalid'),false,'one unsubscribe withdraws all consent idempotently');
select is((select status from private.mail_deliveries limit 1),'skipped','queued recipient withdrawn');
select public.mail_record_consent(null,'yes@example.invalid','es',true,'new_explicit_checkbox',true);
select is((select status from private.mail_deliveries limit 1),'skipped','later consent does not restore old queued delivery');
-- 301 eligible contacts exercise one global reservation budget across campaigns.
select public.mail_record_consent(null,'quota-'||i||'@example.invalid','en',true,'local_quota_fixture',true) from generate_series(1,301) i;
create temporary table quota as select (pg_temp.mail('mail_new')->'campaign'->>'id')::uuid id;
select pg_temp.mail('mail_save',jsonb_build_object('campaign_id',(select id from quota),'revision',1,'name','Quota','template','offer','target_group','waitlist','content',(select jsonb_object_agg(lang,jsonb_build_object('subject','S','body','B')) from unnest(array['es','en','it','pt-BR']) lang)));
select pg_temp.mail('mail_approve',jsonb_build_object('campaign_id',(select id from quota),'revision',2,'confirm',true));
select pg_temp.mail('mail_claim',jsonb_build_object('campaign_id',(select id from quota),'revision',2)) is not null from generate_series(1,300);
select is((select count(*)::integer from private.mail_deliveries where reserved_at is not null),300,'exactly 300 reserved in rolling 24 hours');
select is(pg_temp.mail('mail_claim',jsonb_build_object('campaign_id',(select id from quota),'revision',2))->'delivery','null'::jsonb,'301st refused');
select is((pg_temp.mail('mail_list')->>'quota_remaining')::integer,0,'global quota zero');
select is((select count(distinct email)::integer from private.mail_deliveries where reserved_at is not null),300,'no recipient claimed twice');
select is((select count(*)::integer from private.mail_deliveries where status='dispatching'),300,'lost ACK stays dispatching and is never automatically retried');
update private.mail_deliveries set reserved_at=now()-interval '25 hours' where reserved_at is not null;
update private.mail_quota_reservations set reserved_at=now()-interval '25 hours';
select ok(pg_temp.mail('mail_claim',jsonb_build_object('campaign_id',(select id from quota),'revision',2))->'delivery'<>'null'::jsonb,'next day permits remaining recipient');
select public.mail_unsubscribe((select email from private.mail_deliveries where status='dispatching' order by reserved_at desc limit 1));
select is(pg_temp.mail('mail_can_send',jsonb_build_object('delivery_id',(select id from private.mail_deliveries where status='dispatching' order by reserved_at desc limit 1)))->'allowed','false'::jsonb,'withdrawal checked again immediately before provider');
select throws_ok($$update private.mail_audit set action='tampered'$$,'P0001','operational_access_audit_is_append_only','mail audit immutable');
-- Actual entitlement and role projections, no client-supplied group flags.
select public.mail_record_consent('00000000-0000-4000-8000-000000001637','member@example.invalid','it',true,'verified_member_checkbox',false);
select is(private.mail_groups('member@example.invalid','sandbox'),array['free'],'Gratis from account without grants');
insert into public.billing_access_grants(user_id,provider,environment,source_type,source_id,capability,status,resource_modified_at,snapshot_hash)
values('00000000-0000-4000-8000-000000001637','polar','sandbox','subscription','mail-pro','vantare.plan.pro','active',now(),repeat('a',64));
select is(private.mail_groups('member@example.invalid','sandbox'),array['pro'],'Pro from active effective entitlement');
insert into public.billing_access_grants(user_id,provider,environment,source_type,source_id,capability,status,resource_modified_at,snapshot_hash)
values('00000000-0000-4000-8000-000000001637','polar','sandbox','subscription','mail-plus','vantare.channel.nightly','active',now(),repeat('b',64));
select is(private.mail_groups('member@example.invalid','sandbox'),array['pro_plus'],'Pro Plus from plan and nightly entitlement');
insert into public.billing_access_grants(user_id,provider,environment,source_type,source_id,capability,status,resource_modified_at,snapshot_hash)
values('00000000-0000-4000-8000-000000001637','polar','sandbox','order','mail-launch','vantare.edition.launch_v1','active',now(),repeat('c',64));
select ok('launch'=any(private.mail_groups('member@example.invalid','sandbox')),'Launch uses edition capability, not invented source type');
select ok(not 'launch'=any(private.mail_groups('member@example.invalid','production')),'sandbox entitlement not used in production');
select * from public.operational_access_set('00000000-0000-4000-8000-000000001637','tester','grant','test:mail','Tester fixture','test:mail-tester',null);
select ok('testers'=any(private.mail_groups('member@example.invalid','sandbox')),'tester operational role');
insert into private.admin_creators(environment,name,email,code,status,discount_id) values('sandbox','Local creator','member@example.invalid','MAILLOCAL','active','fake-discount');
select ok('creators'=any(private.mail_groups('member@example.invalid','sandbox')),'active creator by verified contact email');
insert into private.admin_account_blocks(account_id,blocked) values('00000000-0000-4000-8000-000000001637',true);
select is(private.mail_groups('member@example.invalid','sandbox'),null,'blocked account excluded from every group');
delete from private.admin_account_blocks where account_id='00000000-0000-4000-8000-000000001637';
select public.mail_unsubscribe('member@example.invalid');
select is(private.mail_groups('member@example.invalid','sandbox'),null,'one consent withdrawal excludes every role and paid group');
select throws_ok($$select public.mail_admin_execute('00000000-0000-4000-8000-000000001636','mail_claim','{"campaign_id":"00000000-0000-4000-8000-000000001636","revision":1,"email":"forged@example.invalid"}','sandbox')$$,'P0001','native_admin_invalid','closed SQL claim cannot inject recipient');
-- Even hard local erasure cannot release a reserved send slot.
create temporary table quota_before as select count(*) n from private.mail_quota_reservations;
delete from private.mail_contacts where email=(select email from private.mail_deliveries where reserved_at is not null limit 1);
select is((select count(*) from private.mail_quota_reservations),(select n from quota_before),'quota survives PII erasure');
-- Address replacement suppresses the old one but retains its erasure ownership.
select public.mail_record_consent('00000000-0000-4000-8000-000000001637','changed@example.invalid','it',true,'new_verified_primary',false);
select is((select consent from private.mail_contacts where email='member@example.invalid'),false,'old verified address suppressed after change');
select is((select account_id from private.mail_contacts where email='member@example.invalid'),null::uuid,'old address no longer gets paid groups');
insert into private.clerk_issuers(issuer,authorized_parties,enabled) values('https://clerk.mail.test',array['https://app.invalid'],true);
insert into public.account_identities(issuer,subject,account_id) values('https://clerk.mail.test','user_mmmmmmmmmmmmmmmmmmmmmmmmmmm','00000000-0000-4000-8000-000000001637');
update public.account_identities set deleted_at=now() where account_id='00000000-0000-4000-8000-000000001637';
select is((select count(*)::integer from private.mail_contacts where email in('member@example.invalid','changed@example.invalid')),0,'tombstone erases current and previous mail addresses');
select throws_ok($$select public.mail_record_consent('00000000-0000-4000-8000-000000001637','resurrect@example.invalid','en',true,'forged_after_delete',false)$$,'28000','account_deleted','consent cannot resurrect erased account');
select * from finish();
rollback;
