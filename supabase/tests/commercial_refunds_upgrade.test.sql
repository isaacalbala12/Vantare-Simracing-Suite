begin;
select plan(26);
insert into private.clerk_issuers(issuer,authorized_parties,enabled)
 values('https://refund.clerk.invalid',array['https://app.invalid'],true);
select is(public.native_resolve_account('https://refund.clerk.invalid','user_aaaaaaaaaaaaaaaaaaaaaaaaaaa'),
 '11111111-1111-4111-8111-111111111111'::uuid,'historical refund owner stays resolvable');
-- No new event, order sync or refresh precedes these cutover assertions.
select is((select count(*)::int from public.billing_effective_access_grants where source_id='historical-partial'),0,
 'pre-cutover partial succeeded refund immediately removes effective source');
select is((select count(*)::int from public.billing_effective_access_grants where source_id='historical-pending'),0,
 'pre-cutover pending refund immediately blocks source');
select is((select count(*)::int from public.billing_effective_access_grants where source_id='historical-aggregate'),0,
 'pre-cutover positive aggregate blocks without refund event');
select is((select count(*)::int from public.billing_access_blocks where blocked),4,'all historical active restrictions backfilled');
select is((select count(*)::int from public.billing_access_blocks where cause_type='refund'),5,'all real refund versions retained, including failed/canceled');
select is((select count(*)::int from public.billing_access_blocks where cause_type='order_refund'),8,'all order aggregates initialized');
select is((select status from public.user_entitlements where user_id='11111111-1111-4111-8111-111111111111' and product_key='bundle'),
 'revoked','partial refund read model refreshed within migration');
select is((select status from public.user_entitlements where user_id='22222222-2222-4222-8222-222222222222' and product_key='bundle'),
 'revoked','pending refund read model refreshed within migration');
select is((select status from public.user_entitlements where user_id='33333333-3333-4333-8333-333333333333' and product_key='bundle'),
 'revoked','aggregate read model refreshed within migration');
select is((select count(*)::int from public.billing_effective_access_grants where source_id in ('historical-failed','historical-canceled')),
 2,'failed and canceled historical refunds do not restrict sources');
select is((select status from public.user_entitlements where user_id='44444444-4444-4444-8444-444444444444' and product_key='bundle'),
 'active','unrestricted historical read model remains active');
select is((select count(*)::int from public.billing_effective_access_grants where environment='sandbox' and source_id='shared-order'),
 0,'mixed account refunded source blocked');
select is((select count(*)::int from public.billing_effective_access_grants where environment='production' and source_id='shared-order'),
 1,'same source ID in another environment survives');
select is((select count(*)::int from public.billing_effective_access_grants where source_id='independent-launch'),1,'independent purchase survives');
select is((select count(*)::int from public.billing_effective_access_grants where source_id='independent-sub'),1,'independent subscription survives');
select is((select status from public.user_entitlements where user_id='55555555-5555-4555-8555-555555555555' and product_key='bundle'),
 'active','affected account retains read model from legitimate source');
select is((select count(*)::int from public.billing_access_grants where status='active'),9,'base grants/history unchanged by backfill');
select is((select count(*)::int from public.billing_refunds),5,'no synthetic refund created for aggregate');
select is((select count(*)::int from public.billing_refunds where provider_payment_id like 'old-payment-%'),5,'historical payment IDs unchanged');
select ok((select bool_and(remote_modified_at='2026-10-08T10:01Z'::timestamptz and snapshot_hash=repeat('b',64))
 from public.billing_access_blocks where cause_type='refund'),'refund versions/hashes come from ledger');
select ok((select bool_and(remote_modified_at='2026-10-08T10:00Z'::timestamptz and snapshot_hash=repeat('a',64))
 from public.billing_access_blocks where cause_type='order_refund'),'aggregate versions/hashes come from orders');
select public.billing_refresh_entitlement_read_model('11111111-1111-4111-8111-111111111111');
select is((select status from public.user_entitlements where user_id='11111111-1111-4111-8111-111111111111' and product_key='bundle'),
 'revoked','ordinary read model refresh cannot bypass historical block');
-- Subsequent transitions keep the same immutable attribution/version rules.
select public.billing_record_refund_snapshot('sandbox','refund-historical-pending','historical-pending',null,
 'canceled',1000,'eur','2026-10-08T10:02Z',repeat('c',64));
select public.billing_sync_order_access('sandbox','historical-pending','["vantare.edition.launch_v1"]');
select is((select count(*)::int from public.billing_effective_access_grants where source_id='historical-pending'),1,'later canceled refund clears its historical block');
select is((select status from public.user_entitlements where user_id='22222222-2222-4222-8222-222222222222' and product_key='bundle'),
 'active','later valid cancellation refreshes read model');
select is((select count(*)::int from public.billing_effective_access_grants where source_id='historical-partial'),0,
 'cancellation of another refund preserves succeeded historical restriction');
select * from finish();
rollback;
