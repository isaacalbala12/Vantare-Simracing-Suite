-- #1711: direct UUID guards preserve retained rows, not live ownership changes.
begin;
select no_plan();
create temporary table ledgers(relation regclass);
insert into ledgers values ('private.creator_checkout_attributions'),('private.creator_renewal_operations'),
 ('private.creator_subscription_revocations'),('private.report_creator_terms'),
 ('private.report_renewal_candidates'),('private.billing_payment_incidents'),
 ('private.lifetime_order_admissions');
select ok(exists(select 1 from pg_trigger where tgrelid=relation and tgname='a_account_write_barrier'
 and tgenabled='O' and (tgtype&31)=31),relation::text||': full enabled write barrier') from ledgers;
select ok(not has_table_privilege('service_role',relation,'insert')
 and not has_table_privilege('authenticated',relation,'update'),relation::text||': direct API writes stay closed') from ledgers;

insert into private.clerk_issuers(issuer,authorized_parties,enabled)
 values('https://account-id.clerk.invalid',array['https://app.invalid'],true);
insert into public.profiles(id) values('17110000-0000-4000-8000-000000000001'),('17110000-0000-4000-8000-000000000002');
insert into public.account_identities(issuer,subject,account_id)
 values('https://account-id.clerk.invalid','user_17110000000040008000000000000001','17110000-0000-4000-8000-000000000001');
insert into private.creator_checkout_attributions values('sandbox','17110000-0000-4000-8000-000000000001',
 '17110000-0000-4000-8000-000000000002','17110000-0000-4000-8000-000000000002','FIXTURE','17110000-0000-4000-8000-000000000002',now());
insert into private.creator_renewal_operations(environment,subscription_id,account_id,creator_id,first_order_id,product_id,checkout_key,creator_discount_id)
 values('sandbox','account-id','17110000-0000-4000-8000-000000000001','17110000-0000-4000-8000-000000000002','account-id',
 '17110000-0000-4000-8000-000000000002','pro_monthly','17110000-0000-4000-8000-000000000002');
insert into private.creator_subscription_revocations values('sandbox','account-id','17110000-0000-4000-8000-000000000001','subscription_revoked',now());
insert into private.report_creator_terms(environment,subscription_id,account_id,duration_months)
 values('sandbox','account-id','17110000-0000-4000-8000-000000000001',6);
insert into private.report_renewal_candidates values('sandbox','account-id','17110000-0000-4000-8000-000000000001',
 '17110000-0000-4000-8000-000000000002',100,now()+interval '1 month');
insert into private.billing_payment_incidents(environment,account_id,resource_id,reason)
 values('sandbox','17110000-0000-4000-8000-000000000001','account-id','fixture');
insert into private.lifetime_order_admissions values('sandbox','account-id','17110000-0000-4000-8000-000000000001','founders','fixture',now());
insert into private.founders_subscription_transitions(environment,subscription_id,account_id,founders_order_id,policy,state,last_reactivation_at)
 values('sandbox','account-id','17110000-0000-4000-8000-000000000001','account-id','end_period','pending','2026-10-27T12:00:00Z');
select throws_ok(format('update %s set account_id=%L where account_id=%L',relation,
 '17110000-0000-4000-8000-000000000002','17110000-0000-4000-8000-000000000001'),
 '28000',null,relation::text||': live owner cannot be reassigned') from ledgers;
-- Begin this rollback-only web fixture after events from the earlier HTTP test.
update private.web_purchase_erasure_consumer set cursor_id=(select coalesce(max(id),0) from private.web_purchase_erasure_events);
select public.apply_clerk_user_event('1711-delete',repeat('a',64),'https://account-id.clerk.invalid',
 'user_17110000000040008000000000000001','user.deleted',now(),null);
select throws_ok(format('update %s set account_id=account_id where account_id=%L',relation,
 '17110000-0000-4000-8000-000000000001'),'28000',null,relation::text||': late UPDATE rejects erased account') from ledgers;
create function pg_temp.retained(r regclass) returns bigint language plpgsql as $$
declare n bigint; begin execute format('select count(*) from %s where account_id=%L',r,
 '17110000-0000-4000-8000-000000000001') into n; return n; end $$;
select is(pg_temp.retained(relation),1::bigint,relation::text||': history survives account erasure') from ledgers;

-- Preserve the real in-flight cancellation ACK contract: closed RPC, matching
-- remote revision, metadata-only completion after deletion; never new work.
select lives_ok($$select public.billing_complete_founders_transition('sandbox','account-id')$$,
 'stale cancellation ACK is harmless after erasure');
select is((select state from private.founders_subscription_transitions where subscription_id='account-id'),'pending',
 'stale revision cannot acknowledge a newer cancellation');
select lives_ok($$select public.billing_complete_founders_transition('sandbox','account-id','2026-10-27T12:00:00Z')$$,
 'matching cancellation ACK remains valid after erasure');
select is((select state from private.founders_subscription_transitions where subscription_id='account-id'),'completed',
 'in-flight cancellation duty completes after erasure');
select is(public.billing_founders_subscription_transitions('sandbox',null,'17110000-0000-4000-8000-000000000001'),
 '[]'::jsonb,'erased account cannot schedule new cancellation work');
select is((select account_id from private.founders_subscription_transitions where subscription_id='account-id'),
 '17110000-0000-4000-8000-000000000001'::uuid,'ACK retains original account provenance');
select ok(not has_table_privilege('service_role','private.founders_subscription_transitions','update')
 and not has_function_privilege('authenticated','public.billing_complete_founders_transition(text,text,timestamptz)','execute'),
 'cancellation exception grants neither raw writes nor client ACK');

-- The web event is deliberately outside live ownership: its only writer is
-- the canonical tombstone, and the consumer confirms an independently signed
-- deletion receipt. Exercise actual pull/ACK after real account deletion.
select is((select count(*)::integer from private.web_purchase_erasure_events
 where account_id='17110000-0000-4000-8000-000000000001'),1,'web duty enqueued after canonical tombstone');
select ok(not has_table_privilege('service_role','private.web_purchase_erasure_events','insert')
 and not has_table_privilege('web_purchase_erasure','private.web_purchase_erasure_events','select')
 and has_function_privilege('web_purchase_erasure','public.web_purchase_erasure_pull(integer)','execute'),
 'web exception retains closed table ACL and dedicated bounded RPC');
insert into private.web_purchase_erasure_proof_key values('sandbox','local-proof-secret-fixture-32-bytes');
set local request.jwt.claims='{"iss":"supabase","role":"web_purchase_erasure","aud":"authenticated","purpose":"web_purchase_erasure"}';
create temporary table web_batch as select public.web_purchase_erasure_pull(1) batch;
select is((select batch#>>'{items,0,account_id}' from web_batch),'17110000-0000-4000-8000-000000000001',
 'bounded web pull still returns erased account duty');
create function pg_temp.web_ack(b jsonb) returns boolean language plpgsql as $$
declare a bigint:=(b->>'cursor')::bigint; z bigint:=(b->>'next_cursor')::bigint;
 n integer:=jsonb_array_length(b->'items'); digest text; frame text;
begin
 select encode(extensions.digest(string_agg((i->>'id')||':'||(i->>'account_id'),E'\n' order by (i->>'id')::bigint),'sha256'),'hex')
 into digest from jsonb_array_elements(b->'items') i;
 frame:='v1'||E'\n'||a||E'\n'||z||E'\n'||n||E'\n0\n'||digest;
 return public.web_purchase_erasure_ack(a,z,n,'sandbox',digest,0,
  encode(extensions.hmac(frame,'local-proof-secret-fixture-32-bytes','sha256'),'hex'));
end $$;
select ok(pg_temp.web_ack((select batch from web_batch)),'proven web ACK succeeds after account erasure');
select ok(pg_temp.web_ack((select batch from web_batch)),'web ACK retry remains idempotent');
select is(jsonb_array_length(public.web_purchase_erasure_pull()->'items'),0,'ACK drains the web duty');
select * from finish();
rollback;
