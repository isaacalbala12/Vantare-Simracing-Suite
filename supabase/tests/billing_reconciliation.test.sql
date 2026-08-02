begin;
select plan(17);

select has_function(
  'public',
  'billing_apply_reconciliation_plan',
  array['uuid','text','text','text','text','timestamp with time zone','jsonb'],
  'atomic reconciliation function exists'
);
select ok(not has_function_privilege('anon', 'public.billing_apply_reconciliation_plan(uuid,text,text,text,text,timestamptz,jsonb)', 'execute'), 'anon cannot reconcile');
select ok(not has_function_privilege('authenticated', 'public.billing_apply_reconciliation_plan(uuid,text,text,text,text,timestamptz,jsonb)', 'execute'), 'authenticated cannot reconcile');
select ok(has_function_privilege('service_role', 'public.billing_apply_reconciliation_plan(uuid,text,text,text,text,timestamptz,jsonb)', 'execute'), 'service role can reconcile');

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000601', 'reconciliation@example.invalid')
on conflict (id) do nothing;
insert into public.profiles (id, email) values
  ('00000000-0000-4000-8000-000000000601', 'reconciliation@example.invalid')
on conflict (id) do nothing;

select is(
  (select status || ':' || changed from public.billing_apply_reconciliation_plan(
    '00000000-0000-4000-8000-000000000601',
    'sandbox', 'manual', repeat('a',64), repeat('b',64),
    '2026-08-02T12:00:00Z',
    '[{"provider":"polar","environment":"sandbox","resourceType":"subscription","resourceId":"sub-reconcile","userId":"00000000-0000-4000-8000-000000000601","modifiedAt":"2026-08-02T11:00:00Z","snapshotHash":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","state":"active","grants":[{"capability":"vantare.plan.pro","status":"active","validUntil":"2026-09-02T11:00:00Z"}]}]'::jsonb
  )),
  'applied:1',
  'first apply changes one resource'
);
select is((select count(*)::integer from public.billing_commercial_resources where resource_id = 'sub-reconcile'), 1, 'reconciliation creates the resource');
select is((select status from public.billing_access_grants where source_id = 'sub-reconcile'), 'active', 'reconciliation creates the grant');
select is((select status from public.billing_reconciliation_runs where plan_hash = repeat('b',64)), 'applied', 'applied run is audited');

create temp table reconciliation_before_repeat as
select xmin::text resource_xmin from public.billing_commercial_resources where resource_id = 'sub-reconcile';
select is(
  (select status || ':' || changed from public.billing_apply_reconciliation_plan(
    '00000000-0000-4000-8000-000000000601',
    'sandbox', 'scheduled', repeat('a',64), repeat('b',64),
    '2026-08-02T12:00:00Z',
    '[{"provider":"polar","environment":"sandbox","resourceType":"subscription","resourceId":"sub-reconcile","userId":"00000000-0000-4000-8000-000000000601","modifiedAt":"2026-08-02T11:00:00Z","snapshotHash":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","state":"active","grants":[{"capability":"vantare.plan.pro","status":"active","validUntil":"2026-09-02T11:00:00Z"}]}]'::jsonb
  )),
  'unchanged:0',
  'same plan is repeatable'
);
select is((select xmin::text from public.billing_commercial_resources where resource_id = 'sub-reconcile'), (select resource_xmin from reconciliation_before_repeat), 'repeat performs no resource write');
select is((select count(*)::integer from public.billing_reconciliation_runs where plan_hash = repeat('b',64)), 1, 'repeat does not duplicate audit rows');

select is(
  (select status || ':' || changed from public.billing_apply_reconciliation_plan(
    '00000000-0000-4000-8000-000000000601',
    'sandbox', 'manual', repeat('d',64), repeat('e',64),
    '2026-08-02T12:05:00Z',
    '[{"provider":"polar","environment":"sandbox","resourceType":"subscription","resourceId":"sub-reconcile","userId":"00000000-0000-4000-8000-000000000601","modifiedAt":"2026-08-02T11:00:00Z","snapshotHash":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff","state":"active","grants":[]}]'::jsonb
  )),
  'quarantined:0',
  'equal remote version with a different hash is quarantined atomically'
);
select is((select status from public.billing_access_grants where source_id = 'sub-reconcile'), 'active', 'quarantined plan leaves grants unchanged');
select is((select count(*)::integer from public.billing_reconciliation_runs where plan_hash = repeat('e',64) and status = 'quarantined'), 1, 'quarantined plan is audited');
select is((select count(*)::integer from public.billing_commercial_resources where resource_id = 'sub-reconcile'), 1, 'quarantine creates no duplicate resource');

select throws_ok(
  $$select * from public.billing_apply_reconciliation_plan(
    '00000000-0000-4000-8000-000000000601',
    'sandbox', 'manual', repeat('6',64), repeat('7',64),
    '2026-08-02T12:10:00Z',
    jsonb_build_array(jsonb_build_object(
      'provider', 'polar',
      'environment', 'sandbox',
      'resourceType', 'subscription',
      'resourceId', 'oversized-plan',
      'userId', '00000000-0000-4000-8000-000000000601',
      'modifiedAt', '2026-08-02T12:10:00Z',
      'snapshotHash', repeat('8',64),
      'state', 'active',
      'grants', '[]'::jsonb,
      'padding', repeat('x',262144)
    ))
  )$$,
  'P0001', 'invalid_reconciliation_plan',
  'the RPC rejects a plan larger than the audit table can store'
);
select is(
  (select count(*)::integer from public.billing_commercial_resources where resource_id = 'oversized-plan'),
  0,
  'an oversized plan is rejected before any commercial write'
);

select * from finish();
rollback;
