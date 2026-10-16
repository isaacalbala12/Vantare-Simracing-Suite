begin;
select no_plan();
select ok(not has_table_privilege(role_name,'private.creator_checkout_attributions','select'),role_name||' cannot read attribution') from unnest(array['anon','authenticated','service_role']) role_name;
select ok(not has_function_privilege(role_name,signature,'execute'),role_name||' cannot call '||signature) from unnest(array['anon','authenticated']) role_name cross join unnest(array[
 'public.claim_billing_creator_checkout_attempt(uuid,uuid,text,text,text,text,uuid)',
 'public.billing_save_creator_attribution(uuid,text,uuid,text,uuid)',
 'public.billing_set_report_renewal_candidate(text,uuid,text,uuid,integer,timestamptz)',
 'public.billing_creator_renewal_prepare(text,uuid,text,text,text,uuid,text,uuid,integer)',
 'public.billing_creator_renewal_finish(text,text,uuid,boolean)',
 'public.billing_creator_renewal_authorized(text,text,uuid)']) signature;
select ok(has_function_privilege('service_role',signature,'execute'),'service may execute '||signature) from unnest(array[
 'public.claim_billing_creator_checkout_attempt(uuid,uuid,text,text,text,text,uuid)',
 'public.billing_save_creator_attribution(uuid,text,uuid,text,uuid)',
 'public.billing_set_report_renewal_candidate(text,uuid,text,uuid,integer,timestamptz)',
 'public.billing_creator_renewal_prepare(text,uuid,text,text,text,uuid,text,uuid,integer)',
 'public.billing_creator_renewal_finish(text,text,uuid,boolean)',
 'public.billing_creator_renewal_authorized(text,text,uuid)']) signature;
select ok(pg_get_userbyid(proowner)='postgres' and proconfig @> array['search_path=""'],'fixed owner and search_path: '||proname) from pg_proc where oid in (
 'public.claim_billing_creator_checkout_attempt(uuid,uuid,text,text,text,text,uuid)'::regprocedure,
 'public.billing_save_creator_attribution(uuid,text,uuid,text,uuid)'::regprocedure,
 'public.billing_set_report_renewal_candidate(text,uuid,text,uuid,integer,timestamptz)'::regprocedure,
 'public.billing_creator_renewal_prepare(text,uuid,text,text,text,uuid,text,uuid,integer)'::regprocedure,
 'public.billing_creator_renewal_finish(text,text,uuid,boolean)'::regprocedure,
 'public.billing_creator_renewal_authorized(text,text,uuid)'::regprocedure);
insert into public.profiles(id) values('00000000-0000-4000-8000-000000001681');
insert into private.admin_creators(creator_id,environment,name,email,code,status,discount_id) values('00000000-0000-4000-8000-000000001682','sandbox','Fixture','fixture@example.invalid','ISAAC','active','00000000-0000-4000-8000-000000001683');
select throws_ok($$select * from public.claim_billing_creator_checkout_attempt('00000000-0000-4000-8000-000000001681','00000000-0000-4000-8000-000000001687','pro_monthly','sandbox','r4','UNKNOWN','00000000-0000-4000-8000-000000001683')$$,'P0002','query returned no rows','invalid creator rolls back claim before Polar');
select is((select count(*)::integer from public.billing_checkout_attempts where attempt_id='00000000-0000-4000-8000-000000001687'),0,'failed creator never strands a checkout');
select throws_ok($$select * from public.claim_billing_creator_checkout_attempt('00000000-0000-4000-8000-000000001681','00000000-0000-4000-8000-000000001690','pro_monthly','sandbox','r5','ISAAC','00000000-0000-4000-8000-000000001699')$$,'P0001','creator_coupon_mismatch','foreign coupon rolls back a fresh attributed checkout');
select is((select count(*)::integer from private.creator_checkout_attributions where attempt_id='00000000-0000-4000-8000-000000001690'),0,'foreign coupon never enters attribution ledger');
select throws_ok($$select * from public.claim_billing_creator_checkout_attempt('00000000-0000-4000-8000-000000001681','00000000-0000-4000-8000-000000001691','pro_annual','sandbox','r5','ISAAC','00000000-0000-4000-8000-000000001683')$$,'P0001','creator_coupon_mismatch','monthly coupon cannot attribute an annual checkout');
update private.admin_creators set annual_discount_id='00000000-0000-4000-8000-000000001688' where code='ISAAC';
select is((select outcome from public.claim_billing_creator_checkout_attempt('00000000-0000-4000-8000-000000001681','00000000-0000-4000-8000-000000001691','pro_annual','sandbox','r5','ISAAC','00000000-0000-4000-8000-000000001688')),'claimed','annual coupon bound to the same creator is accepted');
-- Close the annual fixture before starting another family member (shared app/web guard).
select public.billing_reject_checkout_request('00000000-0000-4000-8000-000000001681','00000000-0000-4000-8000-000000001691');
select * from public.claim_billing_checkout_attempt('00000000-0000-4000-8000-000000001681','00000000-0000-4000-8000-000000001684','pro_monthly','sandbox','r4');
select is(public.billing_save_creator_attribution('00000000-0000-4000-8000-000000001681','sandbox','00000000-0000-4000-8000-000000001684','ISAAC','00000000-0000-4000-8000-000000001683'),true,'creator bound before external checkout');
select throws_ok($$select public.billing_save_creator_attribution('00000000-0000-4000-8000-000000001681','sandbox','00000000-0000-4000-8000-000000001684','ISAAC','not-a-uuid'::uuid)$$,'22P02',null,'coupon format rejected by UUID type');
select throws_ok($$select public.billing_save_creator_attribution('00000000-0000-4000-8000-000000001681','sandbox','00000000-0000-4000-8000-000000001684','ISAAC','00000000-0000-4000-8000-000000001699')$$,'P0001','creator_coupon_mismatch','foreign coupon cannot be attached to creator');
select throws_ok($$select public.billing_save_creator_attribution('00000000-0000-4000-8000-000000001681','sandbox','00000000-0000-4000-8000-000000001684','ISAAC',null)$$,'P0001','creator_coupon_mismatch','null coupon rejected explicitly');
select public.billing_begin_checkout_request('00000000-0000-4000-8000-000000001681','00000000-0000-4000-8000-000000001684','00000000-0000-4000-8000-000000001685');
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
select throws_ok($$select public.billing_set_report_renewal_candidate('sandbox','00000000-0000-4000-8000-000000001681','creator-sub','00000000-0000-4000-8000-000000001686',200,now()+interval '3 months')$$,'P0001','renewal_selection_busy','reports cannot race a leased creator PATCH');
select is((select count(*)::integer from private.report_renewal_candidates),0,'failed publication rolls back eligibility candidate');
select is(public.billing_creator_renewal_finish('sandbox','creator-sub',(select (op->>'token')::uuid from prepared),true),true,'creator application confirmed before later report');
select lives_ok($$select public.billing_set_report_renewal_candidate('sandbox','00000000-0000-4000-8000-000000001681','creator-sub','00000000-0000-4000-8000-000000001686',200,now()+interval '3 months')$$,'later report can publish after creator ACK');
select is((select state from private.creator_renewal_operations where subscription_id='creator-sub'),'pending','later report reopens selection');
truncate prepared;
insert into prepared select public.billing_creator_renewal_prepare('sandbox','00000000-0000-4000-8000-000000001681',null,'creator-sub','creator-order','00000000-0000-4000-8000-000000001685','pro_monthly',null,120);
select is((select op->>'discount_id' from prepared),'00000000-0000-4000-8000-000000001686','later report wins without requiring a new checkout or attribution');
update public.billing_orders set reported_refunded_amount=1 where provider_order_id='creator-order';
select is(public.billing_creator_renewal_authorized('sandbox','creator-sub',(select (op->>'token')::uuid from prepared)),false,'refunded initial payment blocks remote changes');
select is(public.billing_creator_revocation('prepare','sandbox','00000000-0000-4000-8000-000000001681','creator-sub','foreign-order','refund'),null::jsonb,'refund of an unbound order cannot revoke creator benefit');
select is(public.billing_creator_revocation('prepare','sandbox','00000000-0000-4000-8000-000000001681','creator-sub',null,'reconcile'),null::jsonb,'ordinary active event cannot initiate revocation');
-- R5 F1: a refund arriving during a lease fences the original writer.
select is(public.billing_creator_revocation('prepare','sandbox','00000000-0000-4000-8000-000000001681','creator-sub','creator-order','refund')->>'busy','true','refund waits for in-flight discount operation');
select is(public.billing_creator_renewal_finish('sandbox','creator-sub',(select (op->>'token')::uuid from prepared),true),false,'refund fences late successful apply ACK');
select is(public.billing_creator_renewal_finish('sandbox','creator-sub',(select (op->>'token')::uuid from prepared),false),true,'old writer releases lease after revocation');
truncate prepared;
insert into prepared select public.billing_creator_revocation('prepare','sandbox','00000000-0000-4000-8000-000000001681','creator-sub','creator-order','refund');
select is((select op->>'creator_discount_id' from prepared),'00000000-0000-4000-8000-000000001683','revocation uses stored creator coupon, not current launch config');
select is(public.billing_creator_revocation('authorize','sandbox','00000000-0000-4000-8000-000000001681','creator-sub',p_token=>(select (op->>'token')::uuid from prepared))->>'authorized','true','revocation lease authorized');
select is(public.billing_creator_revocation('finish','sandbox','00000000-0000-4000-8000-000000001681','creator-sub',p_token=>(select (op->>'token')::uuid from prepared),p_success=>false)->>'completed','true','failed removal releases lease');
select ok(private.native_admin_account_summary('00000000-0000-4000-8000-000000001681','fixture','sandbox')->'billing_incidents' @> '[{"reason":"creator_renewal_revocation_failed"}]','Owner sees failed removal');
truncate prepared;
insert into prepared select public.billing_creator_revocation('prepare','sandbox','00000000-0000-4000-8000-000000001681','creator-sub',null,'reconcile');
select is(public.billing_creator_revocation('finish','sandbox','00000000-0000-4000-8000-000000001681','creator-sub',p_token=>gen_random_uuid(),p_success=>true),null::jsonb,'foreign token cannot finish removal');
select is(public.billing_creator_revocation('finish','sandbox','00000000-0000-4000-8000-000000001681','creator-sub',p_token=>(select (op->>'token')::uuid from prepared),p_success=>true)->>'completed','true','confirmed removal recorded');
select is(public.billing_creator_revocation('prepare','sandbox','00000000-0000-4000-8000-000000001681','creator-sub','creator-order','refund'),null::jsonb,'refund replay never repeats removal');
select is((select not_applied from private.creator_renewal_operations where subscription_id='creator-sub'),'creator:revoked','Owner sees retired creator benefit');
select is(public.billing_creator_renewal_prepare('sandbox','00000000-0000-4000-8000-000000001681','creator-checkout','creator-sub','creator-order','00000000-0000-4000-8000-000000001685','pro_monthly',null,120),null::jsonb,'refund permanently prevents reapplication');
select is(public.billing_creator_revocation('prepare','sandbox','00000000-0000-4000-8000-000000001681','before-paid',null,'subscription_revoked'),null::jsonb,'revocation before first payment has no remote operation');
select is((select count(*)::integer from private.creator_subscription_revocations where subscription_id='before-paid'),1,'revocation before payment remains durable');
select is(public.billing_creator_renewal_prepare('sandbox','00000000-0000-4000-8000-000000001681','creator-checkout','before-paid','creator-order','00000000-0000-4000-8000-000000001685','pro_monthly',null,120),null::jsonb,'late payment cannot start a revoked subscription benefit');
select ok(not has_function_privilege(role_name,'public.billing_creator_revocation(text,text,uuid,text,text,text,uuid,boolean)','execute'),'client cannot revoke or ACK') from unnest(array['anon','authenticated']) role_name;
select ok(has_function_privilege('service_role','public.billing_creator_revocation(text,text,uuid,text,text,text,uuid,boolean)','execute'),'server may reconcile revocation');
select ok(not has_table_privilege('service_role','private.creator_subscription_revocations','select'),'revocation marker is private');
update public.billing_orders set reported_refunded_amount=0 where provider_order_id='creator-order';
insert into public.account_identities(issuer,subject,account_id,deleted_at) values('https://fixture.invalid','creator-deleted','00000000-0000-4000-8000-000000001681',now());
select is(public.billing_creator_renewal_authorized('sandbox','creator-sub',(select (op->>'token')::uuid from prepared)),false,'deleted account blocks remote changes');
select is(public.billing_creator_renewal_finish('sandbox','creator-sub',(select (op->>'token')::uuid from prepared),true),false,'deleted account blocks ACK');
select is(public.billing_creator_renewal_prepare('sandbox','00000000-0000-4000-8000-000000001681',null,'creator-sub','creator-order','00000000-0000-4000-8000-000000001685','pro_monthly',null,120),null::jsonb,'deleted account never prepares a new operation');
select ok(pg_get_userbyid(proowner)='postgres' and proconfig @> array['search_path=""'],'fixed owner/search_path on R5 function '||proname) from pg_proc where oid in ('public.native_admin_execute(uuid,text,text,jsonb,text)'::regprocedure,'public.billing_creator_revocation(text,text,uuid,text,text,text,uuid,boolean)'::regprocedure);
select ok(not has_function_privilege('service_role','private.native_admin_execute_before_creator_coupon(uuid,text,text,jsonb,text)','execute'),'old Owner entrypoint cannot bypass the new boundary');
select * from finish();
rollback;
