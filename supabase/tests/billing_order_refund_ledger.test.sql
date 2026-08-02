begin;
select plan(37);

select has_table('public', 'billing_orders', 'order ledger exists');
select has_table('public', 'billing_refunds', 'refund ledger exists');
select ok((select relrowsecurity from pg_class where oid = 'public.billing_orders'::regclass), 'orders have RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.billing_refunds'::regclass), 'refunds have RLS');
select ok(not has_table_privilege('authenticated', 'public.billing_orders', 'select'), 'orders are server-only');
select ok(not has_table_privilege('authenticated', 'public.billing_refunds', 'select'), 'refunds are server-only');
select ok(not has_function_privilege('authenticated', 'public.billing_sync_order_access(text,text,jsonb)', 'execute'), 'clients cannot sync access');

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000901', 'ledger@example.invalid')
on conflict (id) do nothing;
insert into public.profiles (id, email) values
  ('00000000-0000-4000-8000-000000000901', 'ledger@example.invalid')
on conflict (id) do nothing;
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000902', 'collision@example.invalid')
on conflict (id) do nothing;
insert into public.profiles (id, email) values
  ('00000000-0000-4000-8000-000000000902', 'collision@example.invalid')
on conflict (id) do nothing;

select is((select outcome from public.billing_record_order_snapshot(
  'sandbox','order-a','00000000-0000-4000-8000-000000000901','product-launch','checkout-a',
  'paid',true,3000,'eur',0,'2026-08-02T10:00:00Z',repeat('a',64)
)), 'apply', 'paid order is recorded');
select lives_ok($$select public.billing_sync_order_access('sandbox','order-a','["vantare.edition.launch_v1","vantare.plan.pro"]'::jsonb)$$, 'paid order access syncs');
select is((select status from public.billing_access_grants where source_type='order' and source_id='order-a' limit 1), 'active', 'paid order grants access');

select is((select outcome from public.billing_record_order_snapshot(
  'sandbox','order-a','00000000-0000-4000-8000-000000000901','product-launch','checkout-other',
  'paid',true,3000,'eur',0,'2026-08-02T10:00:30Z',repeat('0',64)
)), 'invalid_attribution', 'conflicting checkout identity fails closed');

select is((select outcome from public.billing_record_order_snapshot(
  'sandbox','order-a','00000000-0000-4000-8000-000000000901','product-launch','checkout-a',
  'refunded',true,3000,'eur',3000,'2026-08-02T10:01:00Z',repeat('b',64)
)), 'apply', 'aggregate full refund is retained');
select lives_ok($$select public.billing_sync_order_access('sandbox','order-a','["vantare.edition.launch_v1","vantare.plan.pro"]'::jsonb)$$, 'aggregate can be reconciled');
select is((select status from public.billing_access_grants where source_type='order' and source_id='order-a' limit 1), 'active', 'aggregate alone never revokes');

select is((select outcome from public.billing_record_refund_snapshot(
  'sandbox','refund-a','order-a','payment-a','succeeded',1000,'eur',
  '2026-08-02T10:02:00Z',repeat('c',64)
)), 'apply', 'first attributed partial refund is recorded');
select lives_ok($$select public.billing_sync_order_access('sandbox','order-a','["vantare.edition.launch_v1","vantare.plan.pro"]'::jsonb)$$, 'partial refund syncs');
select is((select status from public.billing_access_grants where source_type='order' and source_id='order-a' limit 1), 'active', 'partial refund keeps access');

select is((select outcome from public.billing_record_refund_snapshot(
  'sandbox','refund-failed','order-a','payment-failed','failed',2000,'eur',
  '2026-08-02T10:03:00Z',repeat('d',64)
)), 'apply', 'failed refund is audited');
select lives_ok($$select public.billing_sync_order_access('sandbox','order-a','["vantare.edition.launch_v1","vantare.plan.pro"]'::jsonb)$$, 'failed refund syncs without access mutation');
select is((select status from public.billing_access_grants where source_type='order' and source_id='order-a' limit 1), 'active', 'failed refund never revokes');

select is((select outcome from public.billing_record_refund_snapshot(
  'sandbox','refund-b','order-a','payment-b','succeeded',2000,'eur',
  '2026-08-02T10:04:00Z',repeat('e',64)
)), 'apply', 'second attributed partial refund is recorded');
select lives_ok($$select public.billing_sync_order_access('sandbox','order-a','["vantare.edition.launch_v1","vantare.plan.pro"]'::jsonb)$$, 'total attributed refund syncs');
select is((select status from public.billing_access_grants where source_type='order' and source_id='order-a' limit 1), 'revoked', 'sum of succeeded refunds revokes exactly the order grant');

select is((select outcome from public.billing_record_order_snapshot(
  'sandbox','order-b','00000000-0000-4000-8000-000000000901','product-launch','checkout-b',
  'paid',true,3000,'eur',0,'2026-08-02T11:00:00Z',repeat('f',64)
)), 'apply', 'second purchase of same product is independent');
select lives_ok($$select public.billing_sync_order_access('sandbox','order-b','["vantare.edition.launch_v1","vantare.plan.pro"]'::jsonb)$$, 'second purchase access syncs');
select is((select status from public.billing_access_grants where source_type='order' and source_id='order-b' limit 1), 'active', 'refund of old order does not revoke later purchase');

select is((select outcome from public.billing_record_order_snapshot(
  'sandbox','order-c','00000000-0000-4000-8000-000000000901','product-launch','checkout-c',
  'paid',true,3000,'eur',0,'2026-08-02T12:00:00Z',repeat('8',64)
)), 'apply', 'third order is recorded for collision guard');
insert into public.billing_commercial_resources (
  user_id, provider, environment, resource_type, resource_id,
  remote_state, remote_modified_at, snapshot_hash
) values (
  '00000000-0000-4000-8000-000000000902', 'polar', 'sandbox', 'order', 'order-c',
  'paid', '2026-08-02T12:00:00Z', repeat('9',64)
);
select throws_ok(
  $$select public.billing_sync_order_access('sandbox','order-c','["vantare.edition.launch_v1"]'::jsonb)$$,
  'commercial_resource_owner_mismatch',
  'a colliding commercial resource owner fails closed'
);

select is((select outcome from public.billing_record_refund_snapshot(
  'sandbox','refund-missing','order-missing','payment-missing','succeeded',3000,'eur',
  '2026-08-02T11:01:00Z',repeat('1',64)
)), 'missing_order', 'refund without attributable order fails closed');
select is((select outcome from public.billing_record_refund_snapshot(
  'sandbox','refund-currency','order-b','payment-currency','succeeded',3000,'usd',
  '2026-08-02T11:02:00Z',repeat('2',64)
)), 'currency_mismatch', 'currency mismatch fails closed');
select is((select outcome from public.billing_record_refund_snapshot(
  'sandbox','refund-excess','order-b','payment-excess','succeeded',3001,'eur',
  '2026-08-02T11:03:00Z',repeat('3',64)
)), 'refund_total_exceeds_order', 'refund sum above net amount fails closed');

select is((select outcome from public.billing_record_refund_snapshot(
  'sandbox','refund-pending','order-b','payment-pending','pending',3000,'eur',
  '2026-08-02T11:04:00Z',repeat('4',64)
)), 'apply', 'pending refund is recorded without revocation');
select is((select outcome from public.billing_record_refund_snapshot(
  'sandbox','refund-pending','order-b','payment-pending','succeeded',3000,'eur',
  '2026-08-02T11:05:00Z',repeat('5',64)
)), 'apply', 'pending refund can become succeeded');
select is((select outcome from public.billing_record_refund_snapshot(
  'sandbox','refund-pending','order-b','payment-pending','failed',3000,'eur',
  '2026-08-02T11:06:00Z',repeat('6',64)
)), 'invalid_transition', 'succeeded refund cannot regress');
select is((select outcome from public.billing_record_refund_snapshot(
  'sandbox','refund-pending','order-b','payment-pending','succeeded',3000,'eur',
  '2026-08-02T11:05:00Z',repeat('5',64)
)), 'duplicate', 'identical refund replay is idempotent');
select is((select outcome from public.billing_record_refund_snapshot(
  'sandbox','refund-pending','order-b','payment-pending','succeeded',3000,'eur',
  '2026-08-02T11:04:30Z',repeat('7',64)
)), 'stale_noop', 'older refund replay cannot change state');

select is((select count(*)::integer from information_schema.columns where table_schema='public' and table_name in ('billing_orders','billing_refunds') and column_name in ('email','name','billing_address','invoice_number')), 0, 'ledger schema stores no duplicate PII');

select * from finish();
rollback;
