begin;
create extension if not exists pgtap;
select no_plan();
-- A known Vantare checkout whose account was deleted has a terminal non-applicable outcome.
update private.billing_compensation_policy set enabled=true,amount_basis='net' where environment='sandbox';
insert into private.clerk_issuers(issuer,authorized_parties,enabled) values('https://refund-eligibility.clerk.invalid',array['https://app.invalid'],true);
insert into public.profiles(id) values('43000000-0000-4000-8000-000000000009');
insert into public.account_identities(issuer,subject,account_id) values('https://refund-eligibility.clerk.invalid','user_terminal','43000000-0000-4000-8000-000000000009');
select * from public.claim_billing_checkout_attempt('43000000-0000-4000-8000-000000000009','43000000-0000-4000-8000-000000000090','pro_monthly','sandbox','test');
select public.billing_begin_checkout_request('43000000-0000-4000-8000-000000000009','43000000-0000-4000-8000-000000000090','43000000-0000-4000-8000-000000000013');
select public.complete_billing_checkout_attempt('43000000-0000-4000-8000-000000000009','43000000-0000-4000-8000-000000000090','43000000-0000-4000-8000-000000000011','https://sandbox.polar.sh/checkout/terminal');
select public.apply_clerk_user_event('delete-terminal',repeat('d',64),'https://refund-eligibility.clerk.invalid','user_terminal','user.deleted',now(),null);

select ok(not has_function_privilege('anon','public.billing_claim_checkout_compensation(text,uuid)','EXECUTE'),'anonymous cannot trigger financial compensation');
select ok(not has_function_privilege('authenticated','public.billing_observe_checkout_payment(text,uuid,uuid,uuid,uuid,uuid,bigint,text,text[],uuid,uuid)','EXECUTE'),'browser cannot enqueue arbitrary refunds');
select ok(not has_table_privilege('service_role','private.billing_checkout_compensations','SELECT'),'service has no raw private ledger access');
select public.billing_observe_checkout_payment('sandbox','43000000-0000-4000-8000-000000000010','43000000-0000-4000-8000-000000000011','43000000-0000-4000-8000-000000000012','43000000-0000-4000-8000-000000000013',null,2500,'eur',array['vantare.plan.pro']);
select public.billing_observe_checkout_payment('sandbox','43000000-0000-4000-8000-000000000010','43000000-0000-4000-8000-000000000011','43000000-0000-4000-8000-000000000012','43000000-0000-4000-8000-000000000013',null,2500,'eur',array['vantare.plan.pro']);
select public.billing_resolve_checkout_non_applicable('sandbox','43000000-0000-4000-8000-000000000010','account_deleted');
select is((select count(*)::integer from private.billing_checkout_compensations),1,'duplicate observation is one durable job');
select throws_ok($$select public.billing_observe_checkout_payment('sandbox','43000000-0000-4000-8000-000000000010','43000000-0000-4000-8000-000000000011','43000000-0000-4000-8000-000000000012','43000000-0000-4000-8000-000000000013',null,3000,'eur',array['vantare.plan.pro'])$$,'P0001','compensation_order_conflict','immutable order snapshot cannot be reassigned');
select is(public.billing_claim_checkout_compensation('sandbox','43000000-0000-4000-8000-000000000020'),null::jsonb,'activation grace prevents premature refund');
update private.billing_checkout_compensations set next_attempt_at=now()-interval '1 second';
select is(public.billing_claim_checkout_compensation('sandbox','43000000-0000-4000-8000-000000000020')->>'state','refunding','paid orphan selected automatically without an account');
select is(public.billing_claim_checkout_compensation('sandbox','43000000-0000-4000-8000-000000000021'),null::jsonb,'live lease blocks a second refund worker');
select is(public.billing_finish_checkout_compensation('sandbox','43000000-0000-4000-8000-000000000010','43000000-0000-4000-8000-000000000021','refunded'),false,'wrong lease cannot acknowledge a refund');
select ok(public.billing_finish_checkout_compensation('sandbox','43000000-0000-4000-8000-000000000010','43000000-0000-4000-8000-000000000020','retry',null,'polar_refund_http_503'),'Polar failure is durably retryable');
select ok((select next_attempt_at>now() and alert_pending and lease_token is null from private.billing_checkout_compensations),'backoff and Owner notice persist atomically with failure');
select is((select count(*)::integer from private.billing_checkout_compensation_audit where code='polar_refund_http_503'),1,'failure has append-only audit');
select public.billing_finish_checkout_owner_alert('sandbox','43000000-0000-4000-8000-000000000010',false);
select ok((select alert_pending from private.billing_checkout_compensations),'failed notice delivery remains pending');
update private.billing_checkout_compensations set next_attempt_at=now()-interval '1 second';
select is(public.billing_claim_checkout_compensation('sandbox','43000000-0000-4000-8000-000000000022')->>'order_id','43000000-0000-4000-8000-000000000010','retry keeps the exact order identity');
select ok(public.billing_finish_checkout_compensation('sandbox','43000000-0000-4000-8000-000000000010','43000000-0000-4000-8000-000000000022','refunded','43000000-0000-4000-8000-000000000030'),'confirmed full refund finishes once');
select ok((select alert_pending from private.billing_checkout_compensations),'financial success cannot silently discard a failed Owner notice');
select is(public.billing_claim_checkout_compensation('sandbox','43000000-0000-4000-8000-000000000023'),null::jsonb,'terminal refund is never claimed twice');

insert into private.clerk_issuers(issuer,authorized_parties,enabled) values('https://compensation.clerk.invalid',array['https://app.invalid'],true);
insert into public.profiles(id) values('43000000-0000-4000-8000-000000000001'),('43000000-0000-4000-8000-000000000002'),('43000000-0000-4000-8000-000000000003');
insert into public.account_identities(issuer,subject,account_id) values
 ('https://compensation.clerk.invalid','user_fulfilled','43000000-0000-4000-8000-000000000001'),
 ('https://compensation.clerk.invalid','user_failed','43000000-0000-4000-8000-000000000002'),
 ('https://compensation.clerk.invalid','user_unpaid','43000000-0000-4000-8000-000000000003');
-- Proper shared dispatch/binding, then an already-fulfilled historical order.
select * from public.claim_billing_checkout_attempt('43000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000040','pro_monthly','sandbox','test');
select is(public.complete_billing_checkout_attempt('43000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000040','43000000-0000-4000-8000-000000000041','https://sandbox.polar.sh/checkout/test'),false,'unmarked dispatch cannot publish a URL');
select ok(public.billing_begin_checkout_request('43000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000040','00000000-0000-0000-0000-000000000003') is not null,'dispatch marker precedes external POST');
select ok(public.complete_billing_checkout_attempt('43000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000040','43000000-0000-4000-8000-000000000041','https://sandbox.polar.sh/checkout/test'),'marked dispatch creates durable binding');
insert into public.billing_orders(user_id,environment,provider_order_id,provider_product_id,provider_checkout_id,status,paid,net_amount,currency,remote_modified_at,snapshot_hash)
values('43000000-0000-4000-8000-000000000001','sandbox','43000000-0000-4000-8000-000000000042','43000000-0000-4000-8000-000000000013','43000000-0000-4000-8000-000000000041','paid',true,2500,'eur',now(),repeat('a',64));
insert into public.billing_access_grants(user_id,provider,environment,source_type,source_id,capability,status,valid_until,resource_modified_at,snapshot_hash)
values('43000000-0000-4000-8000-000000000001','polar','sandbox','order','43000000-0000-4000-8000-000000000042','vantare.plan.pro','revoked',now()-interval '1 day',now(),repeat('a',64));
select public.billing_observe_checkout_payment('sandbox','43000000-0000-4000-8000-000000000042','43000000-0000-4000-8000-000000000041','43000000-0000-4000-8000-000000000012','43000000-0000-4000-8000-000000000013',null,2500,'eur',array['vantare.plan.pro']);
select is((select state from private.billing_checkout_compensations where order_id='43000000-0000-4000-8000-000000000042'),'activated','expired historical license is not an unactivated payment');

-- Unpaid abandoned local claim: automatic release only if no POST was dispatched.
select * from public.claim_billing_checkout_attempt('43000000-0000-4000-8000-000000000003','43000000-0000-4000-8000-000000000050','pro_monthly','sandbox','test');
update public.billing_checkout_attempts set expires_at=now()-interval '1 second' where attempt_id='43000000-0000-4000-8000-000000000050';
select is(public.billing_expire_unpublished_checkouts('sandbox'),1,'undispatched unpaid claim expires automatically');
select is((select outcome from public.claim_billing_checkout_attempt('43000000-0000-4000-8000-000000000003','43000000-0000-4000-8000-000000000051','pro_annual','sandbox','test')),'claimed','next explicit click can buy after unpaid expiry');
select public.billing_begin_checkout_request('43000000-0000-4000-8000-000000000003','43000000-0000-4000-8000-000000000051','00000000-0000-0000-0000-000000000003');
update public.billing_checkout_attempts set expires_at=now()-interval '1 second' where attempt_id='43000000-0000-4000-8000-000000000051';
select is(public.billing_expire_unpublished_checkouts('sandbox'),0,'unknown dispatched request cannot be released on lease expiry');
select is((select outcome from public.claim_billing_checkout_attempt('43000000-0000-4000-8000-000000000003','43000000-0000-4000-8000-000000000052','pro_annual','sandbox','test')),'busy','unknown payment continues blocking another charge');

-- Failed account can be compensated after #1622 without reviving identity.
select * from public.claim_billing_checkout_attempt('43000000-0000-4000-8000-000000000002','43000000-0000-4000-8000-000000000060','pro_monthly','sandbox','test');
select public.billing_begin_checkout_request('43000000-0000-4000-8000-000000000002','43000000-0000-4000-8000-000000000060','00000000-0000-0000-0000-000000000003');
select public.complete_billing_checkout_attempt('43000000-0000-4000-8000-000000000002','43000000-0000-4000-8000-000000000060','43000000-0000-4000-8000-000000000061','https://sandbox.polar.sh/checkout/failed');
select public.billing_observe_checkout_payment('sandbox','43000000-0000-4000-8000-000000000062','43000000-0000-4000-8000-000000000061','43000000-0000-4000-8000-000000000012','43000000-0000-4000-8000-000000000013',null,2500,'eur',array['vantare.plan.pro','vantare.channel.testers']);
update public.billing_checkout_attempts set resolution='unpaid_expired',created_at=now()-interval '2 days' where attempt_id='43000000-0000-4000-8000-000000000060';
select public.billing_resolve_checkout_non_applicable('sandbox','43000000-0000-4000-8000-000000000062','checkout_attempt_expired');
update private.billing_checkout_compensations set next_attempt_at=now()-interval '1 second' where order_id='43000000-0000-4000-8000-000000000062';
select is(public.billing_claim_checkout_compensation('sandbox','43000000-0000-4000-8000-000000000063')->>'state','refunding','missing entitlement bundle selects compensation');
insert into public.billing_access_grants(user_id,provider,environment,source_type,source_id,capability,status,resource_modified_at,snapshot_hash)
values('43000000-0000-4000-8000-000000000002','polar','sandbox','order','43000000-0000-4000-8000-000000000062','vantare.plan.pro','active',now(),repeat('b',64));
select is((select count(*)::integer from public.billing_effective_access_grants where user_id='43000000-0000-4000-8000-000000000002'),0,'late/replayed webhook cannot activate a selected refund');
select public.apply_clerk_user_event('delete-compensation',repeat('c',64),'https://compensation.clerk.invalid','user_failed','user.deleted',now(),null);
select ok(public.billing_finish_checkout_compensation('sandbox','43000000-0000-4000-8000-000000000062','43000000-0000-4000-8000-000000000063','refunded','43000000-0000-4000-8000-000000000064'),'financial settlement survives account deletion');
select ok((select deleted_at is not null from public.account_identities where account_id='43000000-0000-4000-8000-000000000002'),'refund preserves tombstone');
select is((select count(*)::integer from public.billing_effective_access_grants where user_id='43000000-0000-4000-8000-000000000002'),0,'refund never recreates access for deleted identity');
select is((select count(*)::integer from private.billing_checkout_compensation_audit where order_id='43000000-0000-4000-8000-000000000062' and state='refunded'),1,'deletion-safe financial audit retained');
-- A lost POST ACK is recoverable only through the server-generated sealed nonce.
select ok(not public.billing_observe_checkout_session('sandbox','43000000-0000-4000-8000-000000000070','00000000-0000-0000-0000-000000000003','expired','43000000-0000-4000-8000-000000000051','43000000-0000-4000-8000-000000000071'),'foreign metadata cannot release a hold');
select ok(public.billing_observe_checkout_session('sandbox','43000000-0000-4000-8000-000000000070','00000000-0000-0000-0000-000000000003','confirmed','43000000-0000-4000-8000-000000000051',(select dispatch_token from public.billing_checkout_attempts where attempt_id='43000000-0000-4000-8000-000000000051')),'trusted observed session correlates a lost ACK');
select is((select resolution from public.billing_checkout_attempts where attempt_id='43000000-0000-4000-8000-000000000051'),null::text,'confirmed payment still holds after local expiry');
select is((select count(*)::integer from public.billing_checkout_bindings where provider_checkout_id='43000000-0000-4000-8000-000000000070'),0,'session metadata never creates a binding');
select ok(public.billing_observe_checkout_session('sandbox','43000000-0000-4000-8000-000000000070','00000000-0000-0000-0000-000000000003','expired','43000000-0000-4000-8000-000000000051',(select dispatch_token from public.billing_checkout_attempts where attempt_id='43000000-0000-4000-8000-000000000051')),'authoritative terminal unpaid session releases automatically');
select is((select outcome from public.claim_billing_checkout_attempt('43000000-0000-4000-8000-000000000003','43000000-0000-4000-8000-000000000072','pro_monthly','sandbox','test')),'claimed','terminal provider expiry permits exactly a fresh attempt');
select public.billing_begin_checkout_request('43000000-0000-4000-8000-000000000003','43000000-0000-4000-8000-000000000072','00000000-0000-0000-0000-000000000003');
select public.billing_observe_checkout_payment('sandbox','43000000-0000-4000-8000-000000000074','43000000-0000-4000-8000-000000000073','43000000-0000-4000-8000-000000000012','00000000-0000-0000-0000-000000000003',null,2500,'eur',array['vantare.plan.pro'],'43000000-0000-4000-8000-000000000072',(select dispatch_token from public.billing_checkout_attempts where attempt_id='43000000-0000-4000-8000-000000000072'));
update public.billing_checkout_attempts set resolution='unpaid_expired',created_at=now()-interval '2 days' where attempt_id='43000000-0000-4000-8000-000000000072';
select public.billing_resolve_checkout_non_applicable('sandbox','43000000-0000-4000-8000-000000000074','checkout_attempt_expired');
update private.billing_checkout_compensations set next_attempt_at=now()-interval '1 second' where order_id='43000000-0000-4000-8000-000000000074';
select public.billing_claim_checkout_compensation('sandbox','43000000-0000-4000-8000-000000000075');
select ok(public.billing_finish_checkout_compensation('sandbox','43000000-0000-4000-8000-000000000074','43000000-0000-4000-8000-000000000075','refunded'),'lost binding still allows a full financial refund');
select is((select resolution from public.billing_checkout_attempts where attempt_id='43000000-0000-4000-8000-000000000072'),'refunded','sealed dispatch resolves the paid original hold after refund without inventing a binding');
select * from public.claim_billing_checkout_attempt('43000000-0000-4000-8000-000000000003','43000000-0000-4000-8000-000000000080','pro_monthly','sandbox','test');
select public.billing_begin_checkout_request('43000000-0000-4000-8000-000000000003','43000000-0000-4000-8000-000000000080','00000000-0000-0000-0000-000000000003');
select public.mark_billing_checkout_attempt_uncertain('43000000-0000-4000-8000-000000000003','43000000-0000-4000-8000-000000000080');
select ok(public.billing_reject_checkout_request('43000000-0000-4000-8000-000000000003','43000000-0000-4000-8000-000000000080'),'known rejection can be re-ACKed after DB outage/uncertain marker without another POST');
select is((select resolution from public.billing_checkout_attempts where attempt_id='43000000-0000-4000-8000-000000000080'),'unpaid_expired','certain rejection is terminal even after lost ACK');
select * from finish();
rollback;
