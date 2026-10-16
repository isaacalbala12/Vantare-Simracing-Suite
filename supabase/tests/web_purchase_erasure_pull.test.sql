begin;
create extension if not exists pgtap;
select no_plan();
insert into private.web_purchase_erasure_proof_key values('sandbox','local-proof-secret-fixture-32-bytes');
-- Test-only helper signs receipts as an independent key holder. The consumer
-- itself cannot read this key (checked separately) or use the legacy ACK.
create function pg_temp.proven_erasure_ack(a bigint,b bigint,c integer,e text) returns boolean
language plpgsql security definer set search_path='' as $$
declare digest text; receipt text; frame text;
begin
 select encode(extensions.digest(coalesce(string_agg(id::text||':'||account_id::text,E'\n' order by id),''),'sha256'),'hex')
 into digest from private.web_purchase_erasure_events where id>a and id<=b;
 frame:='v1'||E'\n'||a||E'\n'||b||E'\n'||c||E'\n0\n'||digest;
 receipt:=encode(extensions.hmac(frame,'local-proof-secret-fixture-32-bytes','sha256'),'hex');
 return public.web_purchase_erasure_ack(a,b,c,e,digest,0,receipt);
end $$;

set local request.jwt.claims='{"iss":"supabase","role":"web_purchase_erasure","aud":"authenticated","purpose":"web_purchase_erasure"}';
select ok(has_function_privilege('web_purchase_erasure','public.web_purchase_erasure_pull(integer)','EXECUTE'),'dedicated role can pull deleted UUIDs');
select ok(has_function_privilege('web_purchase_erasure','public.web_purchase_erasure_ack(bigint,bigint,integer,text,text,integer,text)','EXECUTE'),'dedicated role can ACK its fixed consumer');
select ok(not has_function_privilege('anon','public.web_purchase_erasure_pull(integer)','EXECUTE'),'anonymous cannot read deletion stream');
select ok(not has_function_privilege('authenticated','public.web_purchase_erasure_pull(integer)','EXECUTE'),'customer cannot read other deleted UUIDs');
select ok(not has_function_privilege('service_role','public.web_purchase_erasure_pull(integer)','EXECUTE'),'Worker pull uses its own credential, not service role');
select ok(not has_function_privilege('web_purchase_erasure','public.claim_billing_checkout_attempt(uuid,uuid,text,text,text)','EXECUTE'),'erasure credential cannot create checkout');
select ok(not has_function_privilege('web_purchase_erasure','public.billing_finish_checkout_compensation(text,uuid,uuid,text,uuid,text)','EXECUTE'),'erasure credential cannot trigger/refund payments');
select ok(not has_table_privilege('web_purchase_erasure','public.profiles','UPDATE'),'erasure credential cannot mutate accounts');
select ok(not has_table_privilege('web_purchase_erasure','private.web_purchase_erasure_events','SELECT'),'erasure role has no raw private table access');
select is((select provolatile::text from pg_proc where oid='public.web_purchase_erasure_pull(integer)'::regprocedure),'s','pull RPC is read-only STABLE');
select is((select provolatile::text from pg_proc where oid='public.web_purchase_attempt_states(jsonb)'::regprocedure),'s','D1 state lookup is read-only STABLE');
insert into private.clerk_issuers(issuer,authorized_parties,enabled) values('https://erasure.clerk.invalid',array['https://app.invalid'],true);
insert into public.profiles(id) values('44000000-0000-4000-8000-000000000001'),('44000000-0000-4000-8000-000000000002'),('44000000-0000-4000-8000-000000000003');
insert into public.account_identities(issuer,subject,account_id) values
 ('https://erasure.clerk.invalid','user_deleted_a','44000000-0000-4000-8000-000000000001'),
 ('https://erasure.clerk.invalid','user_deleted_b','44000000-0000-4000-8000-000000000002'),
 ('https://erasure.clerk.invalid','user_live','44000000-0000-4000-8000-000000000003');
select is(jsonb_array_length(public.web_purchase_erasure_pull()->'items'),0,'live accounts are never exposed in deletion stream');
select public.apply_clerk_user_event('erasure-a',repeat('a',64),'https://erasure.clerk.invalid','user_deleted_a','user.deleted',now(),null);
select public.apply_clerk_user_event('erasure-b',repeat('b',64),'https://erasure.clerk.invalid','user_deleted_b','user.deleted',now(),null);
select public.apply_clerk_user_event('erasure-a',repeat('a',64),'https://erasure.clerk.invalid','user_deleted_a','user.deleted',now(),null);
select is((select count(*)::integer from private.web_purchase_erasure_events),2,'duplicate canonical deletion creates one event per account');
select is(jsonb_array_length(public.web_purchase_erasure_pull(1)->'items'),1,'pull pagination is bounded');
select is((public.web_purchase_erasure_pull(1)#>>'{items,0,account_id}'),'44000000-0000-4000-8000-000000000001','first page contains only the first deleted UUID');
select is((public.web_purchase_erasure_pull()->>'cursor')::bigint,0::bigint,'read-only pulls never advance cursor');
select ok(not pg_temp.proven_erasure_ack(0,2,1,'sandbox'),'incorrect batch count cannot skip a tombstone');
set local role web_purchase_erasure;
set local request.jwt.claims='{"iss":"https://clerk.invalid","role":"web_purchase_erasure","aud":"authenticated","purpose":"web_purchase_erasure"}';
select throws_ok($$select public.web_purchase_erasure_pull()$$,'28000','web_erasure_credential_required','Clerk token cannot become the private erasure consumer');
set local request.jwt.claims='{"iss":"supabase","role":"web_purchase_erasure","aud":"authenticated","purpose":"web_purchase_erasure"}';
select ok(pg_temp.proven_erasure_ack(0,1,1,'sandbox'),'least-privilege consumer can confirm one page');
select ok(pg_temp.proven_erasure_ack(0,1,1,'sandbox'),'lost ACK/repeated ACK is idempotent');
select is((public.web_purchase_erasure_pull()#>>'{items,0,account_id}'),'44000000-0000-4000-8000-000000000002','next page starts after confirmed cursor');
select ok(pg_temp.proven_erasure_ack(1,2,1,'sandbox'),'second page commits without deleting any account');
select is(jsonb_array_length(public.web_purchase_erasure_pull()->'items'),0,'fully confirmed stream drains');
select throws_ok($$select * from private.web_purchase_erasure_events$$,'42501',null,'consumer cannot bypass bounded RPC');
reset role;
select ok((select deleted_at is null from public.account_identities where account_id='44000000-0000-4000-8000-000000000003'),'ACK cannot delete or change a live account');
select public.web_purchase_erasure_failed('erasure_d1_failed','sandbox');
select public.web_purchase_erasure_failed('erasure_d1_failed','sandbox');
select is((select count(*)::integer from private.billing_owner_notices where kind='web_erasure_failed'),0,'first two failures do not spam Owner');
select public.web_purchase_erasure_failed('erasure_d1_failed','sandbox');
select is((select count(*)::integer from private.billing_owner_notices where kind='web_erasure_failed'),1,'third consecutive failure creates durable Owner notice');
select ok((select code='erasure_d1_failed' and delivered_at is null from private.billing_owner_notices where kind='web_erasure_failed'),'notice contains a closed code and remains deliverable');
select ok(pg_temp.proven_erasure_ack(2,2,0,'sandbox'),'empty successful poll is a heartbeat');
select is((select consecutive_failures from private.web_purchase_erasure_consumer),0,'success resets consecutive failure count');
update private.web_purchase_erasure_consumer set last_success_at=now()-interval '16 minutes';
select public.billing_checkout_maintenance('sandbox');
select is((select count(*)::integer from private.billing_owner_notices where kind='web_erasure_worker_stale'),1,'independent watchdog detects expired JWT or missing Worker');
select is((select count(*)::integer from private.billing_owner_notices where correlation_hash like '%44000000%'),0,'Owner correlation contains no account UUID');
select * from public.claim_billing_checkout_attempt('44000000-0000-4000-8000-000000000003','44000000-0000-4000-8000-000000000010','pro_monthly','sandbox','erasure-test');
set local role web_purchase_erasure;
select is((public.web_purchase_attempt_states('[{"account_id":"44000000-0000-4000-8000-000000000003","attempt_id":"44000000-0000-4000-8000-000000000010","environment":"sandbox"}]')#>>'{0,status}'),'creating','bounded D1 lookup returns canonical status without URL/nonce');
select throws_ok($$select public.web_purchase_attempt_states('{}')$$,'P0001','invalid_attempt_lookup','invalid lookup batch rejected');
reset role;
select ok(not has_function_privilege('web_purchase_erasure','public.web_purchase_erasure_ack(bigint,bigint,integer,text)','EXECUTE'),'legacy unproven ACK is unavailable');
select ok(not has_table_privilege('web_purchase_erasure','private.web_purchase_erasure_proof_key','SELECT'),'pull JWT cannot read independent proof key');
select ok(not public.web_purchase_erasure_ack(2,2,0,'sandbox',repeat('a',64),0,repeat('b',64)),'forged digest/MAC cannot ACK even with pull JWT');
select ok(not public.web_purchase_erasure_ack(2,2,0,'sandbox',encode(extensions.digest('','sha256'),'hex'),1,repeat('b',64)),'nonzero remaining D1 rows cannot be acknowledged');
select * from finish();
rollback;
