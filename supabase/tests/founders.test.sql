begin;
select no_plan();
select ok(not has_table_privilege('authenticated','private.founders_sale_config','update'),'client cannot change sale dates');
select ok(not has_function_privilege('authenticated','public.billing_purchase_policy(uuid,text,text)','execute'),'eligibility is backend only');
select ok(has_function_privilege('anon','public.founders_sale_window(text)','execute'),'web can read public window');
select is(public.founders_sale_window()->>'amount_cents','5000','fixed 50 EUR');
select is(public.billing_founders_payment_allowed('production','2026-10-26 18:00:00Z'),true,'opening instant is included');
select is(public.billing_founders_payment_allowed('production','2026-10-26 17:59:59.999Z'),false,'before opening denied');
select is(public.billing_founders_payment_allowed('production','2026-11-26 18:00:00Z'),true,'November is no longer a deadline');
select is(public.billing_founders_payment_allowed('production','2026-11-26 17:59:59.999Z'),true,'no end date');
insert into public.profiles(id) values('00000000-0000-4000-8000-000000001661');
update private.founders_sale_config set opens_at=now()+interval '1 day' where environment='sandbox';
select is(public.billing_purchase_policy('00000000-0000-4000-8000-000000001661','sandbox','founders')->>'reason',
 'founders_sale_closed','before launch cannot checkout');
update private.founders_sale_config set opens_at=now()-interval '2 days',sales_enabled=false where environment='sandbox';
select is(public.billing_purchase_policy('00000000-0000-4000-8000-000000001661','sandbox','founders')->>'reason','founders_sale_closed','sales switch closes checkout on the server');
update private.founders_sale_config set opens_at=now()-interval '1 hour',sales_enabled=true where environment='sandbox';
select is(public.billing_purchase_policy('00000000-0000-4000-8000-000000001661','sandbox','founders')->>'reason',null::text,'single configuration controls live window');
select is((select outcome from public.claim_billing_checkout_attempt('00000000-0000-4000-8000-000000001661',
 '00000000-0000-4000-8000-000000001662','founders','sandbox','founders-test')),'claimed','existing checkout claim accepts Founders');
select is(public.billing_purchase_policy('00000000-0000-4000-8000-000000001661','sandbox','launch_lifetime')->>'reason','product_retired','Launch Edition cannot be purchased');
select is((select outcome from public.claim_billing_checkout_attempt('00000000-0000-4000-8000-000000001661',
 '00000000-0000-4000-8000-000000001662','founders','sandbox','founders-test')),'busy','same attempt cannot create second checkout');
select throws_ok($$select public.claim_billing_checkout_attempt('00000000-0000-4000-8000-000000001661',
 '00000000-0000-4000-8000-000000001663','founders','sandbox','founders-test')$$,
 'P0001','founders_checkout_pending','different attempt cannot duplicate checkout');
select throws_ok($$select public.claim_billing_checkout_attempt('00000000-0000-4000-8000-000000001661',
 '00000000-0000-4000-8000-000000001663','pro_monthly','sandbox','founders-test')$$,
 'P0001','founders_checkout_pending','pending Founders blocks new subscription');
delete from public.billing_checkout_attempts where user_id='00000000-0000-4000-8000-000000001661';
insert into public.billing_subscriptions(user_id,provider,provider_subscription_id,status,environment,current_period_end,cancel_at_period_end)
 values('00000000-0000-4000-8000-000000001661','polar','founders-existing-sub','active','sandbox',now()+interval '1 day',false);
select is(public.billing_purchase_policy('00000000-0000-4000-8000-000000001661','sandbox','founders')->>'reason',
 null::text,'a subscription never blocks Founders purchase');
select is((select outcome from public.billing_record_order_snapshot('sandbox','founders-order',
 '00000000-0000-4000-8000-000000001661','founders-product','founders-checkout','paid',true,5000,'eur',0,
 now(),repeat('a',64),null)),'apply','one-time order recorded');
select lives_ok($$select public.billing_sync_order_access('sandbox','founders-order','["vantare.plan.founders"]')$$,'one-time grant projected');
select is(jsonb_array_length(public.billing_founders_subscription_transitions('sandbox','founders-order')),1,'active Pro creates pending end-period cancellation');
select is(jsonb_array_length(public.billing_founders_subscription_transitions('sandbox','founders-order')),1,'replay keeps one pending transition');
select is((select count(*)::integer from private.founders_subscription_transitions),1,'one durable receipt per subscription');
select ok(private.native_admin_account_summary('00000000-0000-4000-8000-000000001661','https://fixture.invalid','sandbox')->'founders_transitions' @> '[{"state":"pending","policy":"end_period"}]','Owner sees pending cancellation immediately');
select lives_ok($$select public.billing_complete_founders_transition('sandbox','founders-existing-sub')$$,'confirmation records completion');
select is(public.billing_founders_subscription_transitions('sandbox','founders-order'),'[]'::jsonb,'completed cancellation is not repeated');
insert into public.billing_subscriptions(user_id,provider,provider_subscription_id,status,environment,current_period_end,cancel_at_period_end)
 values('00000000-0000-4000-8000-000000001661','polar','founders-already-cancelled','active','sandbox',now()+interval '1 day',true);
select is(public.billing_founders_subscription_transitions('sandbox','founders-order'),'[]'::jsonb,'already scheduled cancellation needs no Polar mutation');
select ok(private.native_admin_account_summary('00000000-0000-4000-8000-000000001661','https://fixture.invalid','sandbox')->'founders_transitions' @> '[{"subscription_id":"founders-already-cancelled","state":"completed"}]','Owner also sees a previously scheduled cancellation');
delete from public.billing_subscriptions where user_id='00000000-0000-4000-8000-000000001661';
select is((select count(*)::integer from public.billing_effective_access_grants where source_id='founders-order' and valid_until is null),1,'one perpetual right');
select ok((select expires_at is null and status='active' from public.user_entitlements where user_id='00000000-0000-4000-8000-000000001661' and product_key='bundle'),'compatibility bundle is perpetual');
select is(public.billing_purchase_policy('00000000-0000-4000-8000-000000001661','sandbox','pro_annual')->>'reason',
 'founders_already_owned','Founders owner cannot pay again for subscriptions');
select is(private.native_admin_account_summary('00000000-0000-4000-8000-000000001661','https://fixture.invalid','sandbox')->>'plan','founders','Owner sees distinct Founders plan');
select ok(private.native_admin_account('00000000-0000-4000-8000-000000001661','https://fixture.invalid','sandbox')->'payments' @> '[{"product":"Founders"}]','Owner payment is labelled Founders');
select ok((select bool_and((item->>'plan')::boolean) from jsonb_array_elements(private.native_admin_account_summary('00000000-0000-4000-8000-000000001661','https://fixture.invalid','sandbox')->'module_access') item),'all current modules belong to Founders');
select is((select outcome from public.billing_record_refund_snapshot('sandbox','founders-refund','founders-order',null,
 'succeeded',5000,'eur',now()+interval '1 second',repeat('b',64))),'apply','refund recorded');
select lives_ok($$select public.billing_sync_order_access('sandbox','founders-order','["vantare.plan.founders"]')$$,'refund reconciles same order');
select is((select count(*)::integer from public.billing_effective_access_grants where source_id='founders-order'),0,'refund removes effective Founders right');
select is(private.native_admin_account_summary('00000000-0000-4000-8000-000000001661','https://fixture.invalid','sandbox')->>'plan','free','Owner sees removal after refund');
select is(public.billing_purchase_policy('00000000-0000-4000-8000-000000001669','sandbox','founders')->>'reason','account_unavailable','missing account rejected');
insert into public.account_identities(issuer,subject,account_id,deleted_at) values('https://fixture.invalid','user_founders_deleted','00000000-0000-4000-8000-000000001661',now());
select is(public.billing_purchase_policy('00000000-0000-4000-8000-000000001661','sandbox','founders')->>'reason','account_unavailable','deleted identity rejected');
select throws_ok($$select public.billing_sync_order_access('sandbox','founders-order','["vantare.plan.founders"]')$$,'28000','account_deleted','late order replay after deletion is rejected');
select is((select count(*)::integer from public.billing_effective_access_grants where source_id='founders-order'),0,'late replay cannot resurrect deleted Founders');
select is(public.billing_founders_subscription_transitions('sandbox','founders-order'),'[]'::jsonb,'deleted/refunded account cannot trigger financial actions');
select * from finish();
rollback;
