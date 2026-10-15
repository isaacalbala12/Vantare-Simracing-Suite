begin;
select no_plan();
select ok(not has_table_privilege(role_name,'private.creator_checkout_attributions','select'),role_name||' cannot read attribution') from unnest(array['anon','authenticated','service_role']) role_name;
select ok(not has_function_privilege(role_name,signature,'execute'),role_name||' cannot call '||signature) from unnest(array['anon','authenticated']) role_name cross join unnest(array[
 'public.billing_save_creator_attribution(uuid,text,uuid,text,uuid)',
 'public.billing_set_report_renewal_candidate(text,uuid,text,uuid,integer,timestamptz)',
 'public.billing_creator_renewal_prepare(text,uuid,text,text,text,uuid,text,uuid,integer)',
 'public.billing_creator_renewal_finish(text,text,uuid,boolean)',
 'public.billing_creator_renewal_authorized(text,text,uuid)']) signature;
insert into public.profiles(id) values('00000000-0000-4000-8000-000000001681');
insert into private.admin_creators(creator_id,environment,name,email,code,status,discount_id) values('00000000-0000-4000-8000-000000001682','sandbox','Fixture','fixture@example.invalid','ISAAC','active','00000000-0000-4000-8000-000000001683');
select * from public.claim_billing_checkout_attempt('00000000-0000-4000-8000-000000001681','00000000-0000-4000-8000-000000001684','pro_monthly','sandbox','r4');
select is(public.billing_save_creator_attribution('00000000-0000-4000-8000-000000001681','sandbox','00000000-0000-4000-8000-000000001684','ISAAC','00000000-0000-4000-8000-000000001683'),true,'creator bound before external checkout');
select is(public.complete_billing_checkout_attempt('00000000-0000-4000-8000-000000001681','00000000-0000-4000-8000-000000001684','creator-checkout','https://sandbox.polar.sh/checkout/r4'),true,'durable checkout binding');
select is(public.billing_creator_renewal_prepare('sandbox','00000000-0000-4000-8000-000000001681','forged','creator-sub','creator-order','00000000-0000-4000-8000-000000001685','pro_monthly',null,120),null::jsonb,'metadata alone never attributes sale');
select throws_ok($$select public.billing_creator_renewal_prepare('sandbox','00000000-0000-4000-8000-000000001681','creator-checkout','creator-sub','creator-order','00000000-0000-4000-8000-000000001685','pro_monthly',null,120)$$,'P0001','creator_first_invoice_unpaid','cannot discount before first paid invoice');
select * from public.billing_record_order_snapshot('sandbox','creator-order','00000000-0000-4000-8000-000000001681','00000000-0000-4000-8000-000000001685','creator-checkout','paid',true,399,'eur',0,now(),repeat('a',64),'creator-sub');
insert into public.billing_subscriptions(user_id,provider,provider_subscription_id,status,environment,current_period_end,cancel_at_period_end) values('00000000-0000-4000-8000-000000001681','polar','creator-sub','active','sandbox',now()+interval '1 month',false);
select lives_ok($$select public.billing_set_report_renewal_candidate('sandbox','00000000-0000-4000-8000-000000001681','creator-sub','00000000-0000-4000-8000-000000001686',200,now()+interval '3 months')$$,'reports publishes validated eligibility');
create temporary table prepared as select public.billing_creator_renewal_prepare('sandbox','00000000-0000-4000-8000-000000001681','creator-checkout','creator-sub','creator-order','00000000-0000-4000-8000-000000001685','pro_monthly',null,120) op;
select is((select op->>'discount_id' from prepared),'00000000-0000-4000-8000-000000001686','reports saves 200 vs creator 120, wins');
select is((select op->>'not_applied' from prepared),'creator:reports_save_more_or_equal','losing offer recorded');
select is(public.billing_creator_renewal_prepare('sandbox','00000000-0000-4000-8000-000000001681','creator-checkout','creator-sub','creator-order','00000000-0000-4000-8000-000000001685','pro_monthly',null,120)->>'busy','true','lease prevents concurrent writes');
select is(public.billing_creator_renewal_authorized('sandbox','creator-sub',(select (op->>'token')::uuid from prepared)),true,'live account authorized');
select is(public.billing_creator_renewal_finish('sandbox','creator-sub',(select (op->>'token')::uuid from prepared),false),true,'failure releases lease for replay');
select ok(private.native_admin_account_summary('00000000-0000-4000-8000-000000001681','fixture','sandbox')->'billing_incidents' @> '[{"reason":"creator_renewal_discount_failed"}]','Owner sees failed application');
truncate prepared;
insert into prepared select public.billing_creator_renewal_prepare('sandbox','00000000-0000-4000-8000-000000001681','creator-checkout','creator-sub','creator-order','00000000-0000-4000-8000-000000001685','pro_monthly',null,120);
select is(public.billing_creator_renewal_finish('sandbox','creator-sub',(select (op->>'token')::uuid from prepared),true),true,'verified result acknowledged');
select is(public.billing_creator_renewal_prepare('sandbox','00000000-0000-4000-8000-000000001681',null,'creator-sub','creator-order','00000000-0000-4000-8000-000000001685','pro_monthly',null,120),null::jsonb,'replay never restarts repeating');
select lives_ok($$select public.native_admin_record_payment('sandbox','{"payment_id":"creator-order","account_id":"00000000-0000-4000-8000-000000001681","subscription_id":"creator-sub","product":"Pro mensual","paid_at":"2026-10-26T18:00:00Z","modified_at":"2026-10-26T18:00:00Z","amount_cents":399,"currency":"eur","discount_id":"launch-coupon","refunded_cents":0,"refund_pending":false}'::jsonb)$$,'first receipt has launch coupon, not creator coupon');
select is((select item->>'creator_id' from private.native_admin_creator_lines('sandbox') where item->>'payment_id'='creator-order'),'00000000-0000-4000-8000-000000001682','creator commission attributed independently from launch invoice discount');
select is((select item->>'rate_bp' from private.native_admin_creator_lines('sandbox') where item->>'payment_id'='creator-order'),'3000','first-period commission remains 30 percent');
select ok(private.native_admin_account_summary('00000000-0000-4000-8000-000000001681','fixture','sandbox')->'creator_renewal_operations' @> '[{"state":"completed","not_applied":"creator:reports_save_more_or_equal"}]','Owner sees chosen and not-applied offers');
-- Reconsider later eligibility; absence lets creator win without delaying attribution.
delete from private.report_renewal_candidates;
update private.creator_renewal_operations set state='pending',lease_until=null,lease_token=null;
truncate prepared;
insert into prepared select public.billing_creator_renewal_prepare('sandbox','00000000-0000-4000-8000-000000001681',null,'creator-sub','creator-order','00000000-0000-4000-8000-000000001685','pro_monthly',null,120);
select is((select op->>'discount_id' from prepared),'00000000-0000-4000-8000-000000001683','creator wins when reports is not eligible');
select is(public.billing_creator_renewal_finish('sandbox','creator-sub',gen_random_uuid(),true),false,'foreign lease cannot acknowledge');
update public.billing_orders set reported_refunded_amount=1 where provider_order_id='creator-order';
select is(public.billing_creator_renewal_authorized('sandbox','creator-sub',(select (op->>'token')::uuid from prepared)),false,'refunded initial payment blocks remote changes');
update public.billing_orders set reported_refunded_amount=0 where provider_order_id='creator-order';
insert into public.account_identities(issuer,subject,account_id,deleted_at) values('https://fixture.invalid','creator-deleted','00000000-0000-4000-8000-000000001681',now());
select is(public.billing_creator_renewal_authorized('sandbox','creator-sub',(select (op->>'token')::uuid from prepared)),false,'deleted account blocks remote changes');
select is(public.billing_creator_renewal_finish('sandbox','creator-sub',(select (op->>'token')::uuid from prepared),true),false,'deleted account blocks ACK');
select is(public.billing_creator_renewal_prepare('sandbox','00000000-0000-4000-8000-000000001681',null,'creator-sub','creator-order','00000000-0000-4000-8000-000000001685','pro_monthly',null,120),null::jsonb,'deleted account never prepares a new operation');
select * from finish();
rollback;
