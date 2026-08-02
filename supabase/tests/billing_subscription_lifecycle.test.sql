begin;
select plan(51);

select has_table('public', 'billing_subscription_recovery_cycles', 'recovery cycle audit exists');
select has_column('public', 'billing_subscriptions', 'paid_through', 'subscription stores proven paid through');
select has_column('public', 'billing_subscriptions', 'recovery_until', 'subscription exposes current recovery read model');
select ok((select relrowsecurity from pg_class where oid = 'public.billing_subscription_recovery_cycles'::regclass), 'recovery audit has RLS');
select ok(not has_table_privilege('authenticated', 'public.billing_subscription_recovery_cycles', 'select'), 'authenticated cannot inspect recovery audit');
select ok(not has_function_privilege('authenticated', 'public.billing_apply_subscription_lifecycle(uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,boolean,timestamptz,text,text,timestamptz,timestamptz,timestamptz,text[])', 'execute'), 'authenticated cannot mutate lifecycle');

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000801', 'lifecycle@example.invalid'),
  ('00000000-0000-4000-8000-000000000802', 'created@example.invalid'),
  ('00000000-0000-4000-8000-000000000805', 'capability-removal@example.invalid')
on conflict (id) do nothing;
insert into public.profiles (id, email) values
  ('00000000-0000-4000-8000-000000000801', 'lifecycle@example.invalid'),
  ('00000000-0000-4000-8000-000000000802', 'created@example.invalid'),
  ('00000000-0000-4000-8000-000000000805', 'capability-removal@example.invalid')
on conflict (id) do nothing;

select is((select outcome from public.billing_apply_resource_snapshot(
  'polar','sandbox','subscription','sub-lifecycle','00000000-0000-4000-8000-000000000801',
  '2026-08-01T13:00:00Z',repeat('a',64),'active',
  '[{"capability":"vantare.plan.pro","status":"active","validUntil":"2026-08-02T13:00:00Z"}]'::jsonb
)), 'apply', 'active commercial subscription is projected');
select is((select outcome from public.billing_apply_subscription_lifecycle(
  '00000000-0000-4000-8000-000000000801','sandbox','sub-lifecycle','product-pro','active',
  '2026-07-02T13:00:00Z','2026-08-02T13:00:00Z','2026-08-02T13:00:00Z',false,
  '2026-08-01T13:00:00Z',repeat('a',64),'close',null,null,'2026-08-01T14:00:00Z',array['vantare.plan.pro']
)), 'applied', 'active lifecycle applies only against the exact commercial version');
select is((select paid_through::text from public.billing_subscriptions where provider_subscription_id='sub-lifecycle'), '2026-08-02 13:00:00+00', 'active stores proven paid through');
select is((select status from public.billing_access_grants where source_type='subscription' and source_id='sub-lifecycle'), 'active', 'active commercial grant is bounded and active before expiry');
select is((select valid_until::text from public.billing_access_grants where source_type='subscription' and source_id='sub-lifecycle'), '2026-08-02 13:00:00+00', 'commercial grant never extends past paid through');

select is((select outcome from public.billing_apply_resource_snapshot(
  'polar','sandbox','subscription','sub-created','00000000-0000-4000-8000-000000000802',
  '2026-08-01T13:00:00Z',repeat('1',64),'incomplete',
  '[{"capability":"vantare.plan.pro","status":"revoked","validUntil":null}]'::jsonb
)), 'apply', 'incomplete commercial resource is recorded');
select is((select outcome from public.billing_apply_subscription_lifecycle(
  '00000000-0000-4000-8000-000000000802','sandbox','sub-created','product-pro','incomplete',
  null,null,null,false,'2026-08-01T13:00:00Z',repeat('1',64),'close',null,null,'2026-08-01T14:00:00Z',array['vantare.plan.pro']
)), 'applied', 'incomplete lifecycle is accepted without granting');
select is((select status from public.billing_access_grants where source_type='subscription' and source_id='sub-created'), 'revoked', 'incomplete never grants access');

select is((select outcome from public.billing_apply_resource_snapshot(
  'polar','sandbox','subscription','sub-created','00000000-0000-4000-8000-000000000802',
  '2026-08-01T14:00:00Z',repeat('2',64),'trialing',
  '[{"capability":"vantare.plan.pro","status":"active","validUntil":"2026-08-09T12:00:00Z"}]'::jsonb
)), 'apply', 'trialing commercial state is projected');
select is((select outcome from public.billing_apply_subscription_lifecycle(
  '00000000-0000-4000-8000-000000000802','sandbox','sub-created','product-pro','trialing',
  '2026-08-01T12:00:00Z','2026-08-09T12:00:00Z','2026-08-09T12:00:00Z',false,
  '2026-08-01T14:00:00Z',repeat('2',64),'close',null,null,'2026-08-02T12:00:00Z',array['vantare.plan.pro']
)), 'applied', 'trial lifecycle uses the demonstrated trial end');
select is((select status from public.billing_access_grants where source_id='sub-created'), 'active', 'trial grants before its strict boundary');

select is((select outcome from public.billing_apply_resource_snapshot(
  'polar','sandbox','subscription','sub-created','00000000-0000-4000-8000-000000000802',
  '2026-08-01T15:00:00Z',repeat('3',64),'trialing',
  '[{"capability":"vantare.plan.pro","status":"active","validUntil":"2026-08-12T12:00:00Z"}]'::jsonb
)), 'apply', 'newer trial extension is projected');
select is((select outcome from public.billing_apply_subscription_lifecycle(
  '00000000-0000-4000-8000-000000000802','sandbox','sub-created','product-pro','trialing',
  '2026-08-01T12:00:00Z','2026-08-12T12:00:00Z','2026-08-12T12:00:00Z',false,
  '2026-08-01T15:00:00Z',repeat('3',64),'close',null,null,'2026-08-02T12:00:00Z',array['vantare.plan.pro']
)), 'applied', 'trial extension replaces the bounded end');
select is((select valid_until::text from public.billing_access_grants where source_id='sub-created'), '2026-08-12 12:00:00+00', 'extended trial cannot exceed its new demonstrated end');

select is((select outcome from public.billing_apply_resource_snapshot(
  'polar','sandbox','subscription','sub-created','00000000-0000-4000-8000-000000000802',
  '2026-08-02T12:00:00Z',repeat('4',64),'trialing',
  '[{"capability":"vantare.plan.pro","status":"revoked","validUntil":"2026-08-02T12:00:00Z"}]'::jsonb
)), 'apply', 'trial boundary snapshot is projected');
select is((select outcome from public.billing_apply_subscription_lifecycle(
  '00000000-0000-4000-8000-000000000802','sandbox','sub-created','product-pro','trialing',
  '2026-08-01T12:00:00Z','2026-08-02T12:00:00Z','2026-08-02T12:00:00Z',false,
  '2026-08-02T12:00:00Z',repeat('4',64),'close',null,null,'2026-08-02T12:00:00Z',array['vantare.plan.pro']
)), 'applied', 'trial equality is evaluated deterministically');
select is((select status from public.billing_access_grants where source_id='sub-created'), 'revoked', 'trial is revoked at exact equality');

select is((select outcome from public.billing_apply_resource_snapshot(
  'polar','sandbox','subscription','sub-created','00000000-0000-4000-8000-000000000802',
  '2026-08-02T13:00:00Z',repeat('5',64),'incomplete_expired',
  '[{"capability":"vantare.plan.pro","status":"revoked","validUntil":null}]'::jsonb
)), 'apply', 'incomplete expired state is projected');
select is((select outcome from public.billing_apply_subscription_lifecycle(
  '00000000-0000-4000-8000-000000000802','sandbox','sub-created','product-pro','incomplete_expired',
  null,null,null,false,'2026-08-02T13:00:00Z',repeat('5',64),'close',null,null,'2026-08-02T13:00:00Z',array['vantare.plan.pro']
)), 'applied', 'incomplete expired lifecycle closes access');
select is((select status from public.billing_access_grants where source_id='sub-created'), 'revoked', 'incomplete expired never grants or recovers');

select is((select outcome from public.billing_apply_resource_snapshot(
  'polar','sandbox','subscription','sub-lifecycle','00000000-0000-4000-8000-000000000801',
  '2026-08-02T13:45:00Z',repeat('b',64),'past_due',
  '[{"capability":"vantare.plan.pro","status":"revoked","validUntil":"2026-08-02T13:00:00Z"}]'::jsonb
)), 'apply', 'newer past due commercial state applies');
select is((select outcome from public.billing_apply_subscription_lifecycle(
  '00000000-0000-4000-8000-000000000801','sandbox','sub-lifecycle','product-pro','past_due',
  '2026-07-02T13:00:00Z','2026-08-02T13:00:00Z','2026-08-02T13:00:00Z',false,
  '2026-08-02T13:45:00Z',repeat('b',64),'open','2026-08-02T13:45:00Z','2026-08-02T13:00:00Z','2026-08-02T14:00:00Z',array['vantare.plan.pro']
)), 'applied', 'first demonstrated failure opens one separate recovery source');
select is((select count(*)::integer from public.billing_subscription_recovery_cycles where subscription_id='sub-lifecycle'), 1, 'one paid cycle creates one recovery audit row');
select is((select recovery_until::text from public.billing_subscription_recovery_cycles where subscription_id='sub-lifecycle'), '2026-08-05 13:45:00+00', 'recovery is exactly 72 hours from first observed failure');
select is((select status from public.billing_access_grants where source_type='subscription_recovery' and user_id='00000000-0000-4000-8000-000000000801' and capability='vantare.plan.pro'), 'active', 'recovery is an independent active source');
select is((select status from public.billing_access_grants where source_type='subscription' and source_id='sub-lifecycle'), 'revoked', 'expired commercial source remains revoked during recovery');
select is((select status from public.user_entitlements where user_id='00000000-0000-4000-8000-000000000801' and product_key='bundle'), 'active', 'derived compatibility access is active only from recovery');

select is((select outcome from public.billing_apply_subscription_lifecycle(
  '00000000-0000-4000-8000-000000000801','sandbox','sub-lifecycle','product-pro','past_due',
  '2026-07-02T13:00:00Z','2026-08-02T13:00:00Z','2026-08-02T13:00:00Z',false,
  '2026-08-02T13:45:00Z',repeat('b',64),'open','2026-08-02T13:45:00Z','2026-08-02T13:00:00Z','2026-08-02T15:00:00Z',array['vantare.plan.pro']
)), 'applied', 'same failure retry is idempotent');
select is((select count(*)::integer from public.billing_subscription_recovery_cycles where subscription_id='sub-lifecycle'), 1, 'retry cannot duplicate the cycle');
select is((select recovery_until::text from public.billing_subscription_recovery_cycles where subscription_id='sub-lifecycle'), '2026-08-05 13:45:00+00', 'retry cannot reset recovery');

select is((select outcome from public.billing_apply_subscription_lifecycle(
  '00000000-0000-4000-8000-000000000801','sandbox','sub-lifecycle','product-pro','past_due',
  '2026-07-02T13:00:00Z','2026-08-02T13:00:00Z','2026-08-02T13:00:00Z',false,
  '2026-08-02T13:05:00Z',repeat('c',64),'open','2026-08-02T13:05:00Z','2026-08-02T13:00:00Z','2026-08-02T15:00:00Z',array['vantare.plan.pro']
)), 'applied', 'older proven failure for the same existing cycle is accepted');
select is((select recovery_until::text from public.billing_subscription_recovery_cycles where subscription_id='sub-lifecycle'), '2026-08-05 13:05:00+00', 'late evidence shortens but never extends recovery');

select is((select outcome from public.billing_apply_subscription_lifecycle(
  '00000000-0000-4000-8000-000000000801','sandbox','sub-lifecycle','product-pro','past_due',
  '2026-06-02T13:00:00Z','2026-07-02T13:00:00Z','2026-07-02T13:00:00Z',false,
  '2026-07-02T13:05:00Z',repeat('d',64),'open','2026-07-02T13:05:00Z','2026-07-02T13:00:00Z','2026-08-02T15:00:00Z',array['vantare.plan.pro']
)), 'ignored_version', 'stale evidence for another paid cycle fails closed');
select is((select count(*)::integer from public.billing_subscription_recovery_cycles where subscription_id='sub-lifecycle'), 1, 'wrong-cycle stale evidence creates nothing');

create temporary table expected_subscription_expirations (count integer) on commit drop;
insert into expected_subscription_expirations
select count(*)::integer
from public.billing_access_grants
where status = 'active'
  and source_type in ('subscription', 'subscription_recovery')
  and valid_until <= '2026-08-05T13:05:00Z';
select is(public.billing_expire_subscription_grants('2026-08-05T13:05:00Z'), (select count from expected_subscription_expirations), 'exact recovery boundary expires every due grant');
select is((select status from public.billing_access_grants where source_type='subscription_recovery' and user_id='00000000-0000-4000-8000-000000000801' and capability='vantare.plan.pro'), 'revoked', 'recovery is revoked at equality');
select is((select status from public.user_entitlements where user_id='00000000-0000-4000-8000-000000000801' and product_key='bundle'), 'revoked', 'derived access downgrades at exact boundary');

select is((select outcome from public.billing_apply_resource_snapshot(
  'polar','sandbox','subscription','sub-unproven','00000000-0000-4000-8000-000000000801',
  '2026-08-02T16:00:00Z',repeat('f',64),'past_due',
  '[{"capability":"vantare.plan.pro","status":"revoked","validUntil":null}]'::jsonb
)), 'apply', 'unproven past due resource is projected without access');

select throws_ok(
  $$select * from public.billing_apply_subscription_lifecycle(
    '00000000-0000-4000-8000-000000000801','sandbox','sub-unproven','product-pro','past_due',
    null,null,null,false,'2026-08-02T16:00:00Z',repeat('f',64),'open',null,null,'2026-08-02T16:00:00Z',array['vantare.plan.pro']
  )$$,
  'P0001','subscription_recovery_unproven','past due without proven paid cycle fails closed'
);

select is((select outcome from public.billing_apply_resource_snapshot(
  'polar','sandbox','subscription','sub-capability-removal','00000000-0000-4000-8000-000000000805',
  '2026-08-01T13:00:00Z',repeat('6',64),'active',
  '[{"capability":"vantare.plan.pro","status":"active","validUntil":"2026-08-02T13:00:00Z"},{"capability":"vantare.channel.nightly","status":"active","validUntil":"2026-08-02T13:00:00Z"}]'::jsonb
)), 'apply', 'historical snapshot initially includes nightly');
select is((select outcome from public.billing_apply_resource_snapshot(
  'polar','sandbox','subscription','sub-capability-removal','00000000-0000-4000-8000-000000000805',
  '2026-08-02T13:05:00Z',repeat('7',64),'past_due',
  '[{"capability":"vantare.plan.pro","status":"revoked","validUntil":"2026-08-02T13:00:00Z"}]'::jsonb
)), 'apply', 'current snapshot removes nightly before recovery');
select is((select outcome from public.billing_apply_subscription_lifecycle(
  '00000000-0000-4000-8000-000000000805','sandbox','sub-capability-removal','product-pro','past_due',
  '2026-07-02T13:00:00Z','2026-08-02T13:00:00Z','2026-08-02T13:00:00Z',false,
  '2026-08-02T13:05:00Z',repeat('7',64),'open','2026-08-02T13:05:00Z','2026-08-02T13:00:00Z','2026-08-02T14:00:00Z',array['vantare.plan.pro']
)), 'applied', 'recovery uses the exact current commercial snapshot');
select is((select count(*)::integer from public.billing_access_grants where provider='vantare' and source_type='subscription_recovery' and user_id='00000000-0000-4000-8000-000000000805' and capability='vantare.channel.nightly'), 0, 'removed historical capability never reappears in recovery');
select is((select status from public.billing_access_grants where provider='polar' and source_type='subscription' and source_id='sub-capability-removal' and capability='vantare.channel.nightly'), 'revoked', 'lifecycle never reactivates a removed commercial capability');
select throws_ok(
  $$select * from public.billing_apply_subscription_lifecycle(
    '00000000-0000-4000-8000-000000000805','sandbox','sub-capability-removal','product-pro','past_due',
    '2026-07-02T13:00:00Z','2026-08-02T13:00:00Z','2026-08-02T13:00:00Z',false,
    '2026-08-02T13:05:00Z',repeat('7',64),'open','2026-08-02T13:05:00Z','2026-08-02T13:00:00Z','2026-08-02T14:00:00Z',null
  )$$,
  'P0001','invalid_subscription_lifecycle','missing capability proof fails closed'
);

select * from finish();
rollback;
