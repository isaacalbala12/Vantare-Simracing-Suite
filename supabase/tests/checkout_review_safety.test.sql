begin;
create extension if not exists pgtap;
select no_plan();
select ok(not exists(select 1 from private.billing_compensation_policy where enabled),'automatic refund kill switch is off in every environment');
select ok(not has_table_privilege('service_role','private.billing_compensation_policy','UPDATE'),'runtime cannot silently enable refunds');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname not in ('web_purchase_erasure_pull','web_purchase_erasure_ack','web_purchase_erasure_failed','web_purchase_attempt_states')
 and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
 and has_function_privilege('web_purchase_erasure',p.oid,'EXECUTE')),0,'erasure role cannot inherit other application RPCs through PUBLIC');

select public.billing_observe_checkout_payment('sandbox','46000000-0000-4000-8000-000000000010','46000000-0000-4000-8000-000000000011','46000000-0000-4000-8000-000000000012','46000000-0000-4000-8000-000000000013',null,2500,'eur',array['vantare.plan.pro']);
select is((select count(*)::integer from private.billing_checkout_compensations),0,'creator link/historical order without Vantare attempt cannot enter automatic compensation');
select is((select count(*)::integer from private.billing_owner_notices where code='checkout_without_vantare_attempt'),1,'unbound channel becomes Owner incident instead of refund');

insert into private.clerk_issuers(issuer,authorized_parties,enabled) values('https://review.clerk.invalid',array['https://app.invalid'],true);
insert into public.profiles(id) values('46000000-0000-4000-8000-000000000001');
insert into public.account_identities(issuer,subject,account_id) values('https://review.clerk.invalid','user_review','46000000-0000-4000-8000-000000000001');
select * from public.claim_billing_checkout_attempt('46000000-0000-4000-8000-000000000001','46000000-0000-4000-8000-000000000020','pro_monthly','sandbox','review');
select public.billing_begin_checkout_request('46000000-0000-4000-8000-000000000001','46000000-0000-4000-8000-000000000020','46000000-0000-4000-8000-000000000013');
select public.billing_observe_checkout_payment('sandbox','46000000-0000-4000-8000-000000000010','46000000-0000-4000-8000-000000000011','46000000-0000-4000-8000-000000000012','46000000-0000-4000-8000-000000000013',null,2500,'eur',array['vantare.plan.pro'],'46000000-0000-4000-8000-000000000020',(select dispatch_token from public.billing_checkout_attempts where attempt_id='46000000-0000-4000-8000-000000000020'));
update private.billing_checkout_compensations set next_attempt_at=now()-interval '1 second';
select is(public.billing_claim_checkout_compensation('sandbox','46000000-0000-4000-8000-000000000030'),null::jsonb,'kill switch blocks even a genuine sealed attempt');
select ok((select selected_at is null from private.billing_checkout_compensations),'disabled switch never suppresses access grants');
update private.billing_compensation_policy set enabled=true,amount_basis='net' where environment='sandbox';
update private.billing_checkout_compensations set next_attempt_at=now()-interval '1 second';
select is(public.billing_claim_checkout_compensation('sandbox','46000000-0000-4000-8000-000000000030'),null::jsonb,'missing webhook disposition never auto-refunds after grace');
select ok(not public.billing_resolve_checkout_non_applicable('sandbox','46000000-0000-4000-8000-000000000010','account_deleted'),'live account cannot be labeled deleted by callback');
select ok(not public.billing_resolve_checkout_non_applicable('sandbox','46000000-0000-4000-8000-000000000010','checkout_attempt_expired'),'unexpired attempt is not terminal');

update public.billing_checkout_attempts set created_at=now()-interval '25 hours',expires_at=now()-interval '1 hour';
select is(public.billing_expire_unpublished_checkouts('sandbox'),1,'unpublished marked unknown is released after 24h without exposing an old URL');
select is((select count(*)::integer from private.billing_owner_notices where code='unpublished_checkout_expired_unconfirmed'),1,'uncertain expiry has visible Owner incident');
select ok(public.billing_resolve_checkout_non_applicable('sandbox','46000000-0000-4000-8000-000000000010','checkout_attempt_expired'),'expired sealed attempt can acquire explicit terminal webhook disposition');

insert into public.billing_webhook_inbox(provider,environment,provider_event_id,event_type,payload_hash,payload,status,last_error_code)
values('polar','sandbox','review-pending','order.paid',repeat('a',64),'{"type":"order.paid","data":{"id":"46000000-0000-4000-8000-000000000010","checkout_id":"46000000-0000-4000-8000-000000000011"}}','failed','database_unavailable');
update private.billing_checkout_compensations set next_attempt_at=now()-interval '1 second';
select is(public.billing_claim_checkout_compensation('sandbox','46000000-0000-4000-8000-000000000030'),null::jsonb,'pending/failed inbox still prevents refund selection');
update public.billing_webhook_inbox set status='quarantined',quarantine_reason='missing_subscription_period_end' where provider_event_id='review-pending';
update private.billing_checkout_compensations set next_attempt_at=now()-interval '1 second';
select is(public.billing_claim_checkout_compensation('sandbox','46000000-0000-4000-8000-000000000030'),null::jsonb,'generic quarantine is not no-applicable');
update public.billing_webhook_inbox set quarantine_reason='checkout_attempt_expired' where provider_event_id='review-pending';
update private.billing_checkout_compensations set next_attempt_at=now()-interval '1 second';
select is(public.billing_claim_checkout_compensation('sandbox','46000000-0000-4000-8000-000000000030')->>'refund_amount_basis','net','only proven terminal disposition selects the configured refund policy');
select is((select selected_at is not null from private.billing_checkout_compensations),true,'eligible selection is durably recorded');
-- A delayed valid webhook finishes the waiting job rather than creating a refund incident.
select * from public.claim_billing_checkout_attempt('46000000-0000-4000-8000-000000000001','46000000-0000-4000-8000-000000000040','pro_monthly','sandbox','review');
select public.billing_begin_checkout_request('46000000-0000-4000-8000-000000000001','46000000-0000-4000-8000-000000000040','46000000-0000-4000-8000-000000000013');
select public.complete_billing_checkout_attempt('46000000-0000-4000-8000-000000000001','46000000-0000-4000-8000-000000000040','46000000-0000-4000-8000-000000000041','https://sandbox.polar.sh/checkout/slow-valid');
select public.billing_observe_checkout_payment('sandbox','46000000-0000-4000-8000-000000000042','46000000-0000-4000-8000-000000000041','46000000-0000-4000-8000-000000000012','46000000-0000-4000-8000-000000000013',null,2500,'eur',array['vantare.plan.pro']);
insert into public.billing_orders(user_id,environment,provider_order_id,provider_product_id,provider_checkout_id,status,paid,net_amount,currency,remote_modified_at,snapshot_hash)
values('46000000-0000-4000-8000-000000000001','sandbox','46000000-0000-4000-8000-000000000042','46000000-0000-4000-8000-000000000013','46000000-0000-4000-8000-000000000041','paid',true,2500,'eur',now(),repeat('a',64));
insert into public.billing_access_grants(user_id,provider,environment,source_type,source_id,capability,status,resource_modified_at,snapshot_hash)
values('46000000-0000-4000-8000-000000000001','polar','sandbox','order','46000000-0000-4000-8000-000000000042','vantare.plan.pro','active',now(),repeat('a',64));
update private.billing_checkout_compensations set next_attempt_at=now()-interval '1 second' where order_id='46000000-0000-4000-8000-000000000042';
select public.billing_claim_checkout_compensation('sandbox','46000000-0000-4000-8000-000000000043');
select is((select state from private.billing_checkout_compensations where order_id='46000000-0000-4000-8000-000000000042'),'activated','late valid webhook completes waiting job without refund');
select ok((select selected_at is null from private.billing_checkout_compensations where order_id='46000000-0000-4000-8000-000000000042'),'valid delayed license never suppressed');
select * from finish();
rollback;
