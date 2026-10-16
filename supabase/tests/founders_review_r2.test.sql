begin;
select no_plan();
-- M1: sandbox changes never close production.
update private.founders_sale_config set opens_at=now()-interval '1 day',sales_enabled=(environment='production');
select is(public.founders_sale_window('sandbox')->>'available','false','sandbox disabled');
select is(public.founders_sale_window('production')->>'available','true','production remains open');
select is(public.billing_founders_payment_allowed('sandbox',now()),false,'payment checks sandbox switch');
select is(public.billing_founders_payment_allowed('production',now()),true,'payment checks production switch');
update private.founders_sale_config set sales_enabled=true where environment='sandbox';
-- M2: no anonymous/client access to internal SECURITY DEFINER functions.
select ok(not has_function_privilege(role_name,signature,'execute'),role_name||' cannot execute '||signature)
from unnest(array['anon','authenticated']) role_name cross join unnest(array[
 'public.billing_founders_payment_allowed(text,timestamptz)',
 'public.billing_founders_subscription_transitions(text,text,uuid,text,timestamptz)',
 'public.billing_complete_founders_transition(text,text,timestamptz)',
 'public.billing_admit_lifetime_order(uuid,text,text,text,text)']) signature;
select ok(has_function_privilege('service_role',signature,'execute'),'service role can execute '||signature)
from unnest(array['public.billing_founders_payment_allowed(text,timestamptz)',
 'public.billing_founders_subscription_transitions(text,text,uuid,text,timestamptz)',
 'public.billing_complete_founders_transition(text,text,timestamptz)',
 'public.billing_admit_lifetime_order(uuid,text,text,text,text)']) signature;
insert into public.profiles(id) values('00000000-0000-4000-8000-000000001671'),('00000000-0000-4000-8000-000000001672');
select is(public.billing_admit_lifetime_order('00000000-0000-4000-8000-000000001671','sandbox','launch_lifetime','new-launch','legacy-product'),'launch_payment_retired','B1 new Launch denied');
select is((select count(*)::integer from public.billing_orders where provider_order_id='new-launch'),0,'denied Launch never reaches ledger');
select ok(private.native_admin_account_summary('00000000-0000-4000-8000-000000001671','fixture','sandbox')->'billing_incidents' @> '[{"reason":"launch_payment_retired","severity":"critical"}]','Owner sees retired payment');
select public.billing_record_order_snapshot('sandbox','historical-launch','00000000-0000-4000-8000-000000001671','legacy-product',null,'paid',true,3000,'eur',0,now(),repeat('a',64),null);
select is(public.billing_admit_lifetime_order('00000000-0000-4000-8000-000000001671','sandbox','launch_lifetime','historical-launch','legacy-product'),null::text,'historical Launch replay allowed');
select lives_ok($$select public.billing_sync_order_access('sandbox','historical-launch','["vantare.edition.launch_v1","vantare.channel.testers"]')$$,'historical Launch rights retained');
select public.billing_record_refund_snapshot('sandbox','legacy-refund','historical-launch',null,'succeeded',3000,'eur',now()+interval '1 second',repeat('b',64));
select public.billing_sync_order_access('sandbox','historical-launch','["vantare.edition.launch_v1","vantare.channel.testers"]');
select is((select count(*)::integer from public.billing_effective_access_grants where source_id='historical-launch'),0,'historical refund removes Launch and Testers');
select is(public.billing_admit_lifetime_order('00000000-0000-4000-8000-000000001672','sandbox','founders','first-founders','founders-product'),null::text,'first Founders admission');
select is(public.billing_purchase_policy('00000000-0000-4000-8000-000000001672','sandbox','founders')->>'reason','founders_payment_pending','admission blocks checkout before grant and beyond lease');
select is(public.billing_admit_lifetime_order('00000000-0000-4000-8000-000000001672','sandbox','founders','second-founders','founders-product'),'founders_duplicate_payment','second order denied before grant');
select is(public.billing_admit_lifetime_order('00000000-0000-4000-8000-000000001672','sandbox','founders','first-founders','founders-product'),null::text,'same order remains idempotent');
select ok(private.native_admin_account_summary('00000000-0000-4000-8000-000000001672','fixture','sandbox')->'billing_incidents' @> '[{"reason":"founders_duplicate_payment","severity":"critical"}]','Owner sees duplicate payment critical');
select public.billing_record_order_snapshot('sandbox','first-founders','00000000-0000-4000-8000-000000001672','founders-product',null,'paid',true,5000,'eur',0,now(),repeat('c',64),null);
select public.billing_sync_order_access('sandbox','first-founders','["vantare.plan.founders"]');
insert into public.billing_subscriptions(user_id,provider,provider_subscription_id,status,environment,current_period_end,cancel_at_period_end)
 values('00000000-0000-4000-8000-000000001672','polar','founder-pro','active','sandbox',now()+interval '1 day',false);
select is(jsonb_array_length(public.billing_founders_subscription_transitions('sandbox','first-founders')),1,'initial renewal stop scheduled');
select public.billing_complete_founders_transition('sandbox','founder-pro');
-- Remote uncancel is a new revision; repeats of that revision must not reopen a completed effect.
select is(jsonb_array_length(public.billing_founders_subscription_transitions('sandbox',null,'00000000-0000-4000-8000-000000001672','founder-pro','2026-10-27T12:00:00Z')),1,'portal reactivation reschedules cancellation');
select public.billing_complete_founders_transition('sandbox','founder-pro','2026-10-27T12:00:00Z');
select is(public.billing_founders_subscription_transitions('sandbox',null,'00000000-0000-4000-8000-000000001672','founder-pro','2026-10-27T12:00:00Z'),'[]'::jsonb,'same remote revision does not reopen completion');
select ok(private.native_admin_account_summary('00000000-0000-4000-8000-000000001672','fixture','sandbox')->'billing_incidents' @> '[{"reason":"founders_subscription_reactivated"}]','Owner sees reactivation');
insert into public.billing_checkout_bindings(environment,provider_checkout_id,user_id,attempt_id,checkout_key,catalog_version)
 values('sandbox','pending-paid-checkout','00000000-0000-4000-8000-000000001671','00000000-0000-4000-8000-000000001673','founders','fixture');
insert into public.billing_webhook_inbox(environment,provider,provider_event_id,event_type,payload_hash,payload)
 values('sandbox','polar','pending-paid-event','order.paid',repeat('d',64),'{"type":"order.paid","data":{"id":"pending-paid-order","checkout_id":"pending-paid-checkout","paid":true}}');
select is(public.billing_purchase_policy('00000000-0000-4000-8000-000000001671','sandbox','founders')->>'reason','founders_payment_pending','received paid order blocks checkout before processing regardless of expired lease');
select is(public.billing_purchase_policy('00000000-0000-4000-8000-000000001671','production','founders')->>'reason',null::text,'pending sandbox payment does not block production');
insert into public.profiles(id) values('00000000-0000-4000-8000-000000001674');
select public.billing_record_order_snapshot('sandbox','previous-founder','00000000-0000-4000-8000-000000001674','founders-product',null,'paid',true,5000,'eur',0,now(),repeat('e',64),null);
select public.billing_sync_order_access('sandbox','previous-founder','["vantare.plan.founders"]');
select is(public.billing_admit_lifetime_order('00000000-0000-4000-8000-000000001674','sandbox','founders','duplicate-existing-grant','founders-product'),'founders_duplicate_payment','existing grant rejects a second order even without new admission row');
select public.billing_founders_subscription_transitions('sandbox',null,'00000000-0000-4000-8000-000000001672','founder-pro','2026-10-27T13:00:00Z');
select public.billing_complete_founders_transition('sandbox','founder-pro','2026-10-27T12:00:00Z');
select is((select state from private.founders_subscription_transitions where subscription_id='founder-pro'),'pending','old confirmation cannot clear newer reactivation');
select public.billing_complete_founders_transition('sandbox','founder-pro','2026-10-27T13:00:00Z');
select is((select state from private.founders_subscription_transitions where subscription_id='founder-pro'),'completed','matching revision completes cancellation');
select * from finish();
rollback;
