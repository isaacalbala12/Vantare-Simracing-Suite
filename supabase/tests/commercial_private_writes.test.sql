-- #1702: real guards plus the two intentional non-ownership relationships.
begin;
select no_plan();
select is((select count(*)::integer from pg_trigger where tgname='a_account_write_barrier'
 and tgrelid=any(array['private.mail_contacts'::regclass,'private.mail_deliveries','private.mail_consent_budget',
 'private.admin_account_deletions','private.report_promotions','private.report_promotion_invoices',
 'private.report_promotion_invoice_gaps','private.report_promotion_failures','private.report_promotion_launch_uses',
 'private.report_promotion_changes','private.report_promotion_transfers']::regclass[]) and tgenabled='O' and (tgtype&31)=31),11,
 'all eleven later account-owned tables have the full write barrier');

insert into private.clerk_issuers(issuer,authorized_parties,enabled)
 values('https://write-races.clerk.invalid',array['https://app.invalid'],true);
insert into public.profiles(id) select ('17020000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,4)n;
insert into public.account_identities(issuer,subject,account_id)
 select 'https://write-races.clerk.invalid','user_'||replace(id::text,'-',''),id from public.profiles
 where id::text like '17020000-%';
select * from public.operational_access_set('17020000-0000-4000-8000-000000000001','owner','grant','fixture:1702','Owner fixture','fixture:1702-1');
select * from public.operational_access_set('17020000-0000-4000-8000-000000000002','owner','grant','fixture:1702','Owner fixture','fixture:1702-2');
create function pg_temp.mail(actor integer,action text,params jsonb default '{}') returns jsonb language sql as $$
 select public.mail_admin_execute(('17020000-0000-4000-8000-'||lpad(actor::text,12,'0'))::uuid,action,params,'sandbox') $$;

-- A real campaign, approved by account 1, for an unrelated waiting-list contact.
select public.mail_record_consent(null,'recipient@example.invalid','en',true,'verified_waitlist',true);
create temporary table campaign as select (pg_temp.mail(1,'mail_new')->'campaign'->>'id')::uuid id;
select pg_temp.mail(1,'mail_save',jsonb_build_object('campaign_id',(select id from campaign),'revision',1,
 'name','Fixture','template','news','target_group','waitlist','content',
 (select jsonb_object_agg(lang,jsonb_build_object('subject','Test','body','Hello')) from unnest(array['es','en','it','pt-BR'])lang)));
select pg_temp.mail(1,'mail_approve',jsonb_build_object('campaign_id',(select id from campaign),'revision',2,'confirm',true));

-- Queue real provider cleanup while tombstoning the original approver.
select public.mail_record_consent('17020000-0000-4000-8000-000000000001','author@example.invalid','en',true,'verified_settings',false);
select public.apply_clerk_user_event('1702-delete',repeat('a',64),'https://write-races.clerk.invalid',
 'user_17020000000040008000000000000001','user.deleted',now(),null);
select is((select count(*)::integer from private.mail_contacts where email='author@example.invalid'),0,'deleted author contact is erased');
select is((select count(*)::integer from private.mail_contact_erasures where email='author@example.invalid'),1,'cleanup duty is queued after tombstone');
select is((select approved_by from private.mail_campaigns where id=(select id from campaign)),
 '17020000-0000-4000-8000-000000000001'::uuid,'historical campaign approval is retained');
select ok(pg_temp.mail(2,'mail_claim',jsonb_build_object('campaign_id',(select id from campaign),'revision',2))->'delivery'<>'null'::jsonb,
 'another live Owner can claim the unrelated recipient after the approver is erased');
create temporary table erasure as select public.mail_erasure_claim()->'job' job;
select is((select job->>'email' from erasure),'author@example.invalid','cleanup worker still leases a deleted account duty');
select is(public.mail_erasure_finish((select (job->>'id')::uuid from erasure),(select (job->>'lease')::uuid from erasure),204),true,
 'provider ACK still completes cleanup after tombstone');
select is((select email from private.mail_contact_erasures where id=(select (job->>'id')::uuid from erasure)),null,'ACK removes queue PII');
select ok(not has_table_privilege('service_role','private.mail_contact_erasures','insert')
 and not has_table_privilege('service_role','private.mail_contact_erasures','update')
 and not has_table_privilege('authenticated','private.mail_campaigns','update'),'exceptions do not grant direct table writes');

-- Address replacement is not a durable account identity reassignment. Both old
-- and new owners still participate in the guard and their tombstones apply.
select public.mail_record_consent('17020000-0000-4000-8000-000000000003','reuse@example.invalid','en',false,'verified_settings',false);
select public.mail_record_consent('17020000-0000-4000-8000-000000000003','new@example.invalid','en',true,'verified_settings',false);
select lives_ok($$select public.mail_record_consent('17020000-0000-4000-8000-000000000004','reuse@example.invalid','en',true,'verified_settings',false)$$,
 'a newly verified account can adopt a former suppressed address while both accounts live');
select is((select account_id from private.mail_contacts where email='reuse@example.invalid'),
 '17020000-0000-4000-8000-000000000004'::uuid,'address transfer retains its current verified owner');
select throws_ok($$select public.mail_record_consent('17020000-0000-4000-8000-000000000001','restored@example.invalid','en',true,'verified_settings',false)$$,
 '28000','account_deleted','address transfer cannot resurrect an erased account');

-- The ordinary service admission keeps a deleted account out of budget/contact.
select throws_ok($$insert into private.mail_consent_budget values('17020000-0000-4000-8000-000000000001',now(),1)$$,
 '28000','account_deleted','direct late consent budget writes also hit the shared guard');
select throws_ok($$insert into private.admin_account_deletions(account_id,issuer,subject,confirmation_hash)
 values('17020000-0000-4000-8000-000000000001','https://write-races.clerk.invalid','user_17020000000040008000000000000001',repeat('a',64))$$,
 '28000','account_deleted','a new administrative deletion record cannot be forged after erasure');
select * from finish();
rollback;
