begin;
select plan(24);
insert into public.profiles(id) values('4b6d8919-1c89-492d-a0e2-364124c17878');
select is((select outcome from public.billing_record_order_snapshot('sandbox','order-launch',
  '4b6d8919-1c89-492d-a0e2-364124c17878','launch-product',null,'paid',true,3000,'eur',0,'2026-10-08T10:00Z',repeat('a',64),null)),
  'apply','Launch order applies');
select public.billing_sync_order_access('sandbox','order-launch','["vantare.edition.launch_v1"]');
select is((select count(*)::integer from public.billing_effective_access_grants),1,'Launch grants perpetual effective access');
select is((select outcome from public.billing_record_refund_snapshot('sandbox','refund-launch','order-launch',null,
  'pending',1000,'eur','2026-10-08T10:01Z',repeat('b',64))),'apply','official refund requires no payment ID');
select public.billing_sync_order_access('sandbox','order-launch','["vantare.edition.launch_v1"]');
select is((select count(*)::integer from public.billing_effective_access_grants),0,'pending refund blocks license');
select is((select outcome from public.billing_record_refund_snapshot('sandbox','refund-launch','order-launch',null,
  'failed',1000,'eur','2026-10-08T10:02Z',repeat('c',64))),'apply','failed refund applies');
select public.billing_sync_order_access('sandbox','order-launch','["vantare.edition.launch_v1"]');
select is((select count(*)::integer from public.billing_effective_access_grants),1,'failed refund restores license');
select is(public.billing_record_dispute_snapshot('sandbox','dispute-launch','order-launch',true,'2026-10-08T10:03Z',repeat('d',64)),
  'applied','open dispute applies');
select is((select count(*)::integer from public.billing_effective_access_grants),0,'open dispute suspends');
select is(public.billing_record_dispute_snapshot('sandbox','dispute-launch','order-launch',false,'2026-10-08T10:04Z',repeat('e',64)),
  'applied','customer victory applies');
select is((select count(*)::integer from public.billing_effective_access_grants),1,'customer victory restores');
select public.billing_record_dispute_snapshot('sandbox','dispute-launch','order-launch',true,'2026-10-08T10:03Z',repeat('d',64));
select is((select count(*)::integer from public.billing_effective_access_grants),1,'late dispute cannot re-suspend');
select public.billing_record_refund_snapshot('sandbox','refund-issued','order-launch',null,'succeeded',1000,'eur','2026-10-08T10:05Z',repeat('f',64));
select public.billing_sync_order_access('sandbox','order-launch','["vantare.edition.launch_v1"]');
select is((select count(*)::integer from public.billing_effective_access_grants),0,'issued partial refund retires source');
select public.billing_record_order_snapshot('sandbox','order-pro','4b6d8919-1c89-492d-a0e2-364124c17878',
  'pro-product',null,'paid',true,599,'eur',0,'2026-10-08T10:00Z',repeat('1',64),'subscription-pro');
select public.billing_sync_order_access('sandbox','order-pro','["vantare.plan.pro"]');
select is((select count(*)::integer from public.billing_access_grants where source_id='order-pro'),0,'Pro invoice never grants perpetual Pro');
insert into public.billing_access_grants(user_id,provider,environment,source_type,source_id,capability,status,valid_until,resource_modified_at,snapshot_hash)
  values('4b6d8919-1c89-492d-a0e2-364124c17878','polar','sandbox','subscription','subscription-pro','vantare.plan.pro',
    'active','2026-11-08T10:00Z','2026-10-08T10:00Z',repeat('1',64));
select public.billing_record_refund_snapshot('sandbox','refund-pro','order-pro',null,'pending',599,'eur','2026-10-08T10:01Z',repeat('2',64));
select public.billing_sync_order_access('sandbox','order-pro','["vantare.plan.pro"]');
select is((select count(*)::integer from public.billing_effective_access_grants where capability='vantare.plan.pro'),0,'Pro refund blocks subscription grant');
-- A later subscription update changes the base grant, but cannot clear a refund.
update public.billing_access_grants set status='active',resource_modified_at='2026-10-08T10:02Z' where source_id='subscription-pro';
select public.billing_refresh_entitlement_read_model_at('4b6d8919-1c89-492d-a0e2-364124c17878','2026-10-08T10:03Z');
select is((select status from public.user_entitlements where user_id='4b6d8919-1c89-492d-a0e2-364124c17878' and product_key='bundle'),
  'revoked','later subscription cannot lift refund');
select public.billing_record_refund_snapshot('sandbox','refund-pro','order-pro',null,'canceled',599,'eur','2026-10-08T10:04Z',repeat('3',64));
select public.billing_sync_order_access('sandbox','order-pro','["vantare.plan.pro"]');
select is((select count(*)::integer from public.billing_effective_access_grants where capability='vantare.plan.pro'),1,'canceled refund restores paid-through base');
select is((select valid_until from public.billing_effective_access_grants where capability='vantare.plan.pro'),
  '2026-11-08T10:00Z'::timestamptz,'restoration does not extend subscription');
select public.billing_refresh_entitlement_read_model_at('4b6d8919-1c89-492d-a0e2-364124c17878','2026-11-09T10:00Z');
select is((select status from public.user_entitlements where user_id='4b6d8919-1c89-492d-a0e2-364124c17878' and product_key='bundle'),
  'revoked','expired paid-through stays expired');
select is(public.claim_billing_reconciliation('sandbox','00000000-0000-0000-0000-000000000001'),
  '{"resource":"orders","page":1}'::jsonb,'reconciliation starts at first page');
select is(public.claim_billing_reconciliation('sandbox','00000000-0000-0000-0000-000000000002'),null::jsonb,'overlapping worker refused');
select is(public.complete_billing_reconciliation('sandbox','00000000-0000-0000-0000-000000000002','refunds',2),false,'other lease cannot move cursor');
select is(public.complete_billing_reconciliation('sandbox','00000000-0000-0000-0000-000000000001','refunds',2),true,'owner checkpoints page');
select is(public.release_billing_reconciliation('sandbox','00000000-0000-0000-0000-000000000001',true),true,'outage releases lease');
select is(public.claim_billing_reconciliation('sandbox','00000000-0000-0000-0000-000000000002'),
  '{"resource":"refunds","page":2}'::jsonb,'restart retains pending cursor');
select * from finish();
rollback;
