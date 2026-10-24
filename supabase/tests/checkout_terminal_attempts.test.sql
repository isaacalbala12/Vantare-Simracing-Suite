-- #1770 / VANTA-96. Provider snapshots, not caller claims, release checkout guards.
begin;
select no_plan();
create function pg_temp.test_id(prefix text, n integer) returns uuid language sql immutable as $$
 select (prefix||'00000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.seed_checkout(n integer) returns void language plpgsql as $$
declare u uuid:=pg_temp.test_id('770',n); a uuid:=pg_temp.test_id('771',n);
 c uuid:=pg_temp.test_id('772',n); o text:=pg_temp.test_id('773',n)::text;
 product uuid:=pg_temp.test_id('779',1);
begin
 insert into public.profiles(id) values(u);
 perform public.claim_billing_checkout_attempt(u,a,'pro_monthly','sandbox','terminal-test');
 perform public.billing_begin_checkout_request(u,a,product);
 perform public.complete_billing_checkout_attempt(u,a,c::text,'https://sandbox.polar.sh/checkout/fixture');
 perform public.billing_record_order_snapshot('sandbox',o,u,product::text,c::text,'paid',true,1000,'eur',0,'2026-10-24T00:00Z',repeat('a',64),pg_temp.test_id('774',n)::text);
 perform public.billing_sync_order_access('sandbox',o,'["vantare.plan.pro"]'::jsonb);
end $$;
create function pg_temp.full_refund(n integer) returns void language plpgsql as $$
begin
 perform public.billing_record_order_snapshot('sandbox',pg_temp.test_id('773',n)::text,pg_temp.test_id('770',n),pg_temp.test_id('779',1)::text,pg_temp.test_id('772',n)::text,'refunded',true,1000,'eur',1000,'2026-10-24T00:10Z',repeat('b',64),pg_temp.test_id('774',n)::text);
 perform public.billing_sync_order_access('sandbox',pg_temp.test_id('773',n)::text,'["vantare.plan.pro"]'::jsonb);
end $$;
create function pg_temp.lifecycle(n integer, state text, cancel_end boolean, stamp timestamptz) returns void language plpgsql as $$
declare grants jsonb;
begin
 grants:=jsonb_build_array(jsonb_build_object('capability','vantare.plan.pro','status',case when state='active' or (state='canceled' and cancel_end) then 'active' else 'revoked' end,'validUntil',now()+interval '1 month'));
 perform public.billing_apply_resource_snapshot('polar','sandbox','subscription',pg_temp.test_id('774',n)::text,pg_temp.test_id('770',n),stamp,repeat('c',64),state,grants);
 perform public.billing_apply_subscription_lifecycle(pg_temp.test_id('770',n),'sandbox',pg_temp.test_id('774',n)::text,pg_temp.test_id('779',1)::text,state,now()-interval '1 day',now()+interval '1 month',now()+interval '1 month',cancel_end,stamp,repeat('c',64),'close',null,null,now(),array['vantare.plan.pro']);
end $$;
create function pg_temp.claim_again(n integer, offset_id integer default 100) returns text language sql as $$
 select outcome from public.claim_billing_checkout_attempt(pg_temp.test_id('770',n),pg_temp.test_id('771',n+offset_id),'pro_monthly','sandbox','terminal-test')
$$;

select pg_temp.seed_checkout(1);
select pg_temp.lifecycle(1,'active',false,'2026-10-24T00:01Z');
select is(pg_temp.claim_again(1),'conflict','paid subscription still prevents another active purchase');
select pg_temp.full_refund(1);
select is((select resolution from public.billing_checkout_attempts where user_id=pg_temp.test_id('770',1)),'refunded','order.refunded closes the paid attempt without compensation');
select ok((select status='uncertain' and checkout_url is null from public.billing_checkout_attempts where user_id=pg_temp.test_id('770',1)),'terminal attempt cannot publish its consumed checkout again');
select is((select count(*)::integer from public.billing_checkout_bindings where user_id=pg_temp.test_id('770',1)),1,'closure retains attribution for late events');
select is(pg_temp.claim_again(1),'claimed','full refund permits a new native/web attempt');
select is(pg_temp.claim_again(1,200),'busy','new reservation still excludes a concurrent checkout');
select is((select outcome from public.claim_billing_checkout_attempt(pg_temp.test_id('770',1),pg_temp.test_id('771',1),'pro_monthly','sandbox','terminal-test')),'expired','original consumed attempt cannot be reused');

select pg_temp.seed_checkout(2);
select public.billing_record_refund_snapshot('sandbox','terminal-pending',pg_temp.test_id('773',2)::text,null,'pending',1000,'eur','2026-10-24T00:02Z',repeat('d',64));
select public.billing_sync_order_access('sandbox',pg_temp.test_id('773',2)::text,'["vantare.plan.pro"]'::jsonb);
select is((select resolution from public.billing_checkout_attempts where user_id=pg_temp.test_id('770',2)),null::text,'pending refund is not terminal proof');
select is(pg_temp.claim_again(2),'busy','pending refund cannot create a second checkout');
select public.billing_record_refund_snapshot('sandbox','terminal-pending',pg_temp.test_id('773',2)::text,null,'failed',1000,'eur','2026-10-24T00:03Z',repeat('e',64));
select public.billing_sync_order_access('sandbox',pg_temp.test_id('773',2)::text,'["vantare.plan.pro"]'::jsonb);
select is(pg_temp.claim_again(2),'busy','failed refund cannot release a paid checkout');

select pg_temp.seed_checkout(3);
select public.billing_record_refund_snapshot('sandbox','terminal-partial',pg_temp.test_id('773',3)::text,null,'succeeded',400,'eur','2026-10-24T00:02Z',repeat('d',64));
select public.billing_sync_order_access('sandbox',pg_temp.test_id('773',3)::text,'["vantare.plan.pro"]'::jsonb);
select is(pg_temp.claim_again(3),'busy','partial refund alone does not prove a completed refund');
select public.billing_record_refund_snapshot('sandbox','terminal-rest',pg_temp.test_id('773',3)::text,null,'succeeded',600,'eur','2026-10-24T00:03Z',repeat('e',64));
select public.billing_sync_order_access('sandbox',pg_temp.test_id('773',3)::text,'["vantare.plan.pro"]'::jsonb);
select is((select resolution from public.billing_checkout_attempts where user_id=pg_temp.test_id('770',3)),'refunded','sum of succeeded refund events closes without order.refunded');
select is(pg_temp.claim_again(3),'claimed','refund-only delivery permits another checkout');

select pg_temp.seed_checkout(4);
select pg_temp.lifecycle(4,'active',false,'2026-10-24T00:01Z');
select pg_temp.lifecycle(4,'revoked',false,'2026-10-24T00:02Z');
select is((select resolution from public.billing_checkout_attempts where user_id=pg_temp.test_id('770',4)),'revoked','subscription.revoked closes its bound paid attempt');
select is(pg_temp.claim_again(4),'claimed','revocation permits a new purchase');
select is(pg_temp.claim_again(4,200),'busy','revocation never releases a newly reserved unbound attempt');

select pg_temp.seed_checkout(5);
select pg_temp.lifecycle(5,'active',false,'2026-10-24T00:01Z');
select pg_temp.lifecycle(5,'canceled',true,'2026-10-24T00:02Z');
select is((select resolution from public.billing_checkout_attempts where user_id=pg_temp.test_id('770',5)),null::text,'cancellation at period end retains the checkout guard');
select is(pg_temp.claim_again(5),'conflict','paid-through cancellation still prevents another active plan');
select pg_temp.lifecycle(5,'canceled',false,'2026-10-24T00:03Z');
select is((select resolution from public.billing_checkout_attempts where user_id=pg_temp.test_id('770',5)),'revoked','immediate cancellation is terminal');
select is(pg_temp.claim_again(5),'claimed','immediate revocation allows repurchase');

select pg_temp.seed_checkout(6);
-- Upgrade fixture: authoritative ledger already refunded before this migration,
-- with no further webhook retry. Only the next real claim may repair the guard.
update public.billing_orders set status='refunded',reported_refunded_amount=1000 where user_id=pg_temp.test_id('770',6);
select is(pg_temp.claim_again(6),'claimed','new claim repairs already-final historical snapshots');
select is((select resolution from public.billing_checkout_attempts where user_id=pg_temp.test_id('770',6) and attempt_id=pg_temp.test_id('771',6)),'refunded','historical repair preserves the old row as terminal');

select pg_temp.seed_checkout(7);
select pg_temp.seed_checkout(8);
select pg_temp.full_refund(7);
select is((select resolution from public.billing_checkout_attempts where user_id=pg_temp.test_id('770',8)),null::text,'another account remains reserved');
select is((select count(*)::integer from public.billing_checkout_attempts where user_id=pg_temp.test_id('770',7)),1,'terminal closure never deletes attempt history');

-- Provider/resource identifiers can repeat across environments; neither they
-- nor a mismatched product may resolve another checkout's durable binding.
select pg_temp.seed_checkout(9);
update public.billing_orders set status='refunded',reported_refunded_amount=1000,
 provider_product_id=pg_temp.test_id('779',2)::text where user_id=pg_temp.test_id('770',9);
select public.billing_sync_order_access('sandbox',pg_temp.test_id('773',9)::text,'["vantare.plan.pro"]'::jsonb);
select is(pg_temp.claim_again(9),'busy','refund of a different dispatched product cannot release the attempt');

select pg_temp.seed_checkout(10);
update public.billing_orders set status='refunded',reported_refunded_amount=1000,
 provider_checkout_id='unbound-other-checkout' where user_id=pg_temp.test_id('770',10);
select public.billing_sync_order_access('sandbox',pg_temp.test_id('773',10)::text,'["vantare.plan.pro"]'::jsonb);
select is(pg_temp.claim_again(10),'busy','unbound refunded order cannot release the published checkout');

select pg_temp.seed_checkout(11);
select public.billing_record_order_snapshot('production',pg_temp.test_id('773',11)::text,pg_temp.test_id('770',11),pg_temp.test_id('779',1)::text,pg_temp.test_id('772',11)::text,'refunded',true,1000,'eur',1000,'2026-10-24T00:10Z',repeat('b',64),pg_temp.test_id('774',11)::text);
select public.billing_sync_order_access('production',pg_temp.test_id('773',11)::text,'["vantare.plan.pro"]'::jsonb);
select is(pg_temp.claim_again(11),'busy','same identifiers in another environment cannot release sandbox');

select is((select outcome from public.billing_record_order_snapshot('sandbox',pg_temp.test_id('773',1)::text,pg_temp.test_id('770',1),pg_temp.test_id('779',1)::text,pg_temp.test_id('772',1)::text,'paid',true,1000,'eur',0,'2026-10-24T00:00Z',repeat('a',64),pg_temp.test_id('774',1)::text)),'stale_noop','late paid snapshot cannot roll back full refund');
select public.billing_sync_order_access('sandbox',pg_temp.test_id('773',1)::text,'["vantare.plan.pro"]'::jsonb);
select is((select resolution from public.billing_checkout_attempts where user_id=pg_temp.test_id('770',1) and attempt_id=pg_temp.test_id('771',1)),'refunded','late paid event never reopens the consumed attempt');
select is((select count(*)::integer from public.billing_checkout_attempts where user_id=pg_temp.test_id('770',1) and resolution is null),1,'late event leaves the new reservation intact');

select ok(not has_function_privilege('anon','private.close_terminal_checkout_attempts(uuid,text)','execute'),'anonymous cannot release attempts');
select ok(not has_function_privilege('authenticated','private.close_terminal_checkout_attempts(uuid,text)','execute'),'authenticated cannot supply terminal proof');
select ok(not has_function_privilege('service_role','private.close_terminal_checkout_attempts(uuid,text)','execute'),'helper remains private to guarded RPCs');
select * from finish();
rollback;
