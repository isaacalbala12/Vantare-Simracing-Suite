begin;
select no_plan();
insert into public.profiles(id) values('00000000-0000-4000-8000-000000001741'),('00000000-0000-4000-8000-000000001742');
select * from public.operational_access_set('00000000-0000-4000-8000-000000001741','owner','grant','test:hardening','Owner fixture','test:hardening',null);
create function pg_temp.mail(action text,params jsonb default '{}') returns jsonb language sql as $$select public.mail_admin_execute('00000000-0000-4000-8000-000000001741',action,params,'sandbox')$$;
select public.mail_record_consent(null,'sync-'||i||'@example.invalid','es',true,'verified_waitlist',true) from generate_series(1,7)i;
create temporary table page as select pg_temp.mail('mail_sync_page') data;
select is(jsonb_array_length((select data->'contacts' from page)),5,'sync page bounded to five contacts');
select ok((select bool_and((x->>'id') ~ '^[a-f0-9-]{36}$') from page,jsonb_array_elements(data->'contacts')x),'continuation IDs are opaque UUIDs');
select throws_ok($$select pg_temp.mail('mail_sync_page','{"cursor":"person@example.invalid"}')$$,'P0001','native_admin_invalid','cursor cannot carry a clear address');
do $$declare row jsonb;lease jsonb;begin
 for row in select x from page,jsonb_array_elements(data->'contacts')x loop
  lease:=pg_temp.mail('mail_sync_lease',jsonb_build_object('email',row->>'email','revision',row->'revision'));
  perform pg_temp.mail('mail_sync_ack',jsonb_build_object('email',row->>'email','revision',row->'revision','lease',lease->>'lease'));
 end loop;
end $$;
select is(jsonb_array_length(pg_temp.mail('mail_sync_page')->'contacts'),2,'ACKed projections no longer consume pages');
select public.mail_record_consent(null,(select data->'contacts'->0->>'email' from page),'es',false,'verified_waitlist',true);
select ok(exists(select 1 from jsonb_array_elements(pg_temp.mail('mail_sync_page',jsonb_build_object('cursor',(select data->'contacts'->4->>'id' from page)))->'contacts')x
 where x->>'email'=(select data->'contacts'->0->>'email' from page)),'change behind an old cursor is not lost');
create temporary table leased as select pg_temp.mail('mail_sync_lease',jsonb_build_object('email',(select data->'contacts'->0->>'email' from page),'revision',2)) data;
select public.mail_record_consent(null,(select data->'contacts'->0->>'email' from page),'es',true,'verified_waitlist',true);
select pg_temp.mail('mail_sync_ack',jsonb_build_object('email',(select data->'contacts'->0->>'email' from page),'revision',2,'lease',(select data->>'lease' from leased)));
select ok(exists(select 1 from jsonb_array_elements(pg_temp.mail('mail_sync_page')->'contacts')x
 where x->>'email'=(select data->'contacts'->0->>'email' from page)),'change during HTTP remains dirty after stale ACK');
select ok(jsonb_array_length(public.mail_admin_execute('00000000-0000-4000-8000-000000001741','mail_sync_page','{}','production')->'contacts')>0,'sandbox ACK does not hide production changes');
-- Group changes without contact revision changes must also be resynced.
select public.mail_record_consent('00000000-0000-4000-8000-000000001742','role@example.invalid','en',true,'verified_settings',false);
create temporary table role_lease as select pg_temp.mail('mail_sync_lease','{"email":"role@example.invalid","revision":1}') data;
select pg_temp.mail('mail_sync_ack',jsonb_build_object('email','role@example.invalid','revision',1,'lease',(select data->>'lease' from role_lease)));
select * from public.operational_access_set('00000000-0000-4000-8000-000000001742','tester','grant','test:sync-role','Tester fixture','test:sync-role',null);
select ok((select (sync_state->'sandbox') is distinct from private.mail_sync_projection(email,'sandbox') from private.mail_contacts where email='role@example.invalid'),'role change dirties actual projection without synthetic contact writes');
-- Bounded reevaluation: 25 withdrawn rows cannot all be scanned by one reservation.
insert into private.mail_campaigns(id,environment,state,approved_by,approved_at,target_group)values('00000000-0000-4000-8000-000000001749','sandbox','sending','00000000-0000-4000-8000-000000001741',now(),'waitlist');
select public.mail_record_consent(null,'withdrawn-'||i||'@example.invalid','it',false,'verified_waitlist',true) from generate_series(1,25)i;
insert into private.mail_deliveries(campaign_id,email,locale)select '00000000-0000-4000-8000-000000001749',email,'it' from private.mail_contacts where email like 'withdrawn-%';
select throws_ok($$insert into private.mail_deliveries(campaign_id,email,locale)values('00000000-0000-4000-8000-000000001749','role@example.invalid','it" onload="bad')$$,'23514',null,'locale CHECK rejects attribute injection');
select is(pg_temp.mail('mail_claim','{"campaign_id":"00000000-0000-4000-8000-000000001749","revision":1}')->'more_pending','true'::jsonb,'bounded skip returns continuation without reserving an ineligible recipient');
select is((select count(*)::integer from private.mail_deliveries where status='pending'),5,'one reservation rechecks at most twenty pending rows');
select is((select count(*)::integer from private.mail_quota_reservations),0,'withdrawn rows consume no send quota');
select pg_temp.mail('mail_claim','{"campaign_id":"00000000-0000-4000-8000-000000001749","revision":1}');
select is((select state from private.mail_campaigns where id='00000000-0000-4000-8000-000000001749'),'completed','later bounded pass finishes skipped campaign');
-- Per-token and global budgets persist denial and contain only opaque hashes.
select ok(not has_function_privilege('anon','public.mail_unsubscribe_budget(text)','execute'),'public limiter RPC is server-only');
select public.mail_unsubscribe_budget(repeat('a',64)) from generate_series(1,20);
select is(public.mail_unsubscribe_budget(repeat('a',64)),false,'twenty-one requests for a signed token are denied');
select is(public.mail_unsubscribe_budget(repeat('a',64)),false,'denial does not reset its counter');
select public.mail_unsubscribe_budget() from generate_series(1,600);
select is(public.mail_unsubscribe_budget(),false,'global request budget enforced before signature work');
select ok(not exists(select 1 from private.mail_unsubscribe_rate where bucket like '%@%'),'limiter never stores an address');
select * from finish();
rollback;
