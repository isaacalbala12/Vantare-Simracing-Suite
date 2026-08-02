begin;
select plan(43);

select has_table('public', 'billing_commercial_resources', 'commercial resources table exists');
select has_table('public', 'billing_access_grants', 'access grants table exists');
select has_table('public', 'billing_reconciliation_runs', 'reconciliation audit table exists');

select ok((select relrowsecurity from pg_class where oid = 'public.billing_commercial_resources'::regclass), 'resource projection has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.billing_access_grants'::regclass), 'grants have RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.billing_reconciliation_runs'::regclass), 'reconciliation audit has RLS');

select ok(not has_table_privilege('authenticated', 'public.billing_commercial_resources', 'select'), 'authenticated cannot inspect commercial resources');
select ok(not has_table_privilege('authenticated', 'public.billing_access_grants', 'select'), 'authenticated cannot inspect grants directly');
select ok(not has_table_privilege('authenticated', 'public.billing_reconciliation_runs', 'select'), 'authenticated cannot inspect reconciliation audit');
select ok(not has_function_privilege('anon', 'public.billing_apply_resource_snapshot(text,text,text,text,uuid,timestamptz,text,text,jsonb)', 'execute'), 'anon cannot apply snapshots');
select ok(not has_function_privilege('authenticated', 'public.billing_apply_resource_snapshot(text,text,text,text,uuid,timestamptz,text,text,jsonb)', 'execute'), 'authenticated cannot apply snapshots');
select ok(
  exists(select 1 from pg_constraint where conname = 'user_entitlements_active_derived_check' and convalidated),
  'active compatibility entitlements are constrained to the derived bundle'
);

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000501', 'projection@example.invalid'),
  ('00000000-0000-4000-8000-000000000502', 'legacy@example.invalid'),
  ('00000000-0000-4000-8000-000000000503', 'capability-root@example.invalid')
on conflict (id) do nothing;
insert into public.profiles (id, email) values
  ('00000000-0000-4000-8000-000000000501', 'projection@example.invalid'),
  ('00000000-0000-4000-8000-000000000502', 'legacy@example.invalid'),
  ('00000000-0000-4000-8000-000000000503', 'capability-root@example.invalid')
on conflict (id) do nothing;

select is(
  (select outcome from public.billing_apply_resource_snapshot(
    'polar', 'sandbox', 'order', 'order-a',
    '00000000-0000-4000-8000-000000000501',
    '2026-08-02T12:00:00Z', repeat('a', 64), 'paid',
    '[{"capability":"vantare.edition.launch_v1","status":"active","validUntil":null},{"capability":"vantare.channel.testers","status":"active","validUntil":null}]'::jsonb
  )),
  'apply',
  'first resource snapshot applies'
);
select is((select count(*)::integer from public.billing_access_grants where source_id = 'order-a' and status = 'active'), 2, 'one order creates independent capability grants');
select is((select status || ':' || source from public.user_entitlements where user_id = '00000000-0000-4000-8000-000000000501' and product_key = 'bundle'), 'active:billing_projection', 'legacy entitlement is only a derived read model');

create temp table projection_before_duplicate as
select xmin::text as resource_xmin
from public.billing_commercial_resources where resource_id = 'order-a';
create temp table grants_before_duplicate as
select string_agg(xmin::text, ',' order by capability) as grant_xmins
from public.billing_access_grants where source_id = 'order-a';

select is(
  (select outcome from public.billing_apply_resource_snapshot(
    'polar', 'sandbox', 'order', 'order-a',
    '00000000-0000-4000-8000-000000000501',
    '2026-08-02T12:00:00Z', repeat('a', 64), 'paid',
    '[{"capability":"vantare.edition.launch_v1","status":"active","validUntil":null},{"capability":"vantare.channel.testers","status":"active","validUntil":null}]'::jsonb
  )),
  'duplicate',
  'same timestamp and hash is idempotent'
);
select is((select xmin::text from public.billing_commercial_resources where resource_id = 'order-a'), (select resource_xmin from projection_before_duplicate), 'duplicate does not write the resource');
select is((select string_agg(xmin::text, ',' order by capability) from public.billing_access_grants where source_id = 'order-a'), (select grant_xmins from grants_before_duplicate), 'duplicate does not write grants');

select is(
  (select outcome from public.billing_apply_resource_snapshot(
    'polar', 'sandbox', 'order', 'order-a',
    '00000000-0000-4000-8000-000000000501',
    '2026-08-02T11:59:59Z', repeat('b', 64), 'pending', '[]'::jsonb
  )),
  'stale_noop',
  'older snapshot is rejected without reverting state'
);
select is((select stale_event_count from public.billing_commercial_resources where resource_id = 'order-a'), 1, 'stale rejection is auditable');
select is((select remote_state from public.billing_commercial_resources where resource_id = 'order-a'), 'paid', 'stale event leaves current state intact');
select is((select count(*)::integer from public.billing_access_grants where source_id = 'order-a' and status = 'active'), 2, 'stale event leaves grants intact');

select is(
  (select outcome from public.billing_apply_resource_snapshot(
    'polar', 'sandbox', 'order', 'order-a',
    '00000000-0000-4000-8000-000000000501',
    '2026-08-02T12:00:00Z', repeat('c', 64), 'paid', '[]'::jsonb
  )),
  'version_conflict',
  'same version with a different hash is quarantinable conflict'
);
select is((select conflict_count from public.billing_commercial_resources where resource_id = 'order-a'), 1, 'version conflict is auditable');
select is((select count(*)::integer from public.billing_access_grants where source_id = 'order-a' and status = 'active'), 2, 'version conflict performs no grant writes');

select is(
  (select outcome from public.billing_apply_resource_snapshot(
    'polar', 'sandbox', 'order', 'order-b',
    '00000000-0000-4000-8000-000000000501',
    '2026-08-02T12:30:00Z', repeat('d', 64), 'paid',
    '[{"capability":"vantare.edition.launch_v1","status":"active","validUntil":null}]'::jsonb
  )),
  'apply',
  'a second order is an independent source'
);
select is(
  (select outcome from public.billing_apply_resource_snapshot(
    'polar', 'sandbox', 'order', 'order-a',
    '00000000-0000-4000-8000-000000000501',
    '2026-08-02T13:00:00Z', repeat('e', 64), 'refunded',
    '[{"capability":"vantare.edition.launch_v1","status":"revoked","validUntil":"2026-08-02T13:00:00Z"},{"capability":"vantare.channel.testers","status":"revoked","validUntil":"2026-08-02T13:00:00Z"}]'::jsonb
  )),
  'apply',
  'newer refund changes only its order source'
);
select is((select count(*)::integer from public.billing_access_grants where source_id = 'order-a' and status = 'revoked'), 2, 'refunded order grants are revoked');
select is((select count(*)::integer from public.billing_access_grants where source_id = 'order-b' and status = 'active'), 1, 'independent order remains active');
select is((select status from public.user_entitlements where user_id = '00000000-0000-4000-8000-000000000501' and product_key = 'bundle'), 'active', 'derived capability remains active while another source is valid');

insert into public.billing_access_grants (
  user_id, provider, environment, source_type, source_id, capability, status,
  valid_until, resource_modified_at, snapshot_hash, metadata
) values (
  '00000000-0000-4000-8000-000000000502', 'legacy', 'legacy', 'legacy',
  'unknown-lifetime-order', 'vantare.edition.launch_v1', 'active', null, '2026-08-02T10:00:00Z',
  repeat('f', 64), '{"preservation":"unknown_source"}'::jsonb
);
select lives_ok(
  $$select public.billing_refresh_entitlement_read_model('00000000-0000-4000-8000-000000000502')$$,
  'unknown legacy lifetime source can be projected safely'
);
select is(
  (select outcome from public.billing_apply_resource_snapshot(
    'polar', 'sandbox', 'subscription', 'subscription-z',
    '00000000-0000-4000-8000-000000000502',
    '2026-08-02T14:00:00Z', repeat('1', 64), 'revoked',
    '[{"capability":"vantare.plan.pro","status":"revoked","validUntil":"2026-08-02T14:00:00Z"}]'::jsonb
  )),
  'apply',
  'a revoked subscription is projected independently'
);
select is((select status from public.user_entitlements where user_id = '00000000-0000-4000-8000-000000000502' and product_key = 'bundle'), 'active', 'absence of a lifetime order in Customer State preserves unknown lifetime access');

insert into public.billing_access_grants (
  user_id, provider, environment, source_type, source_id, capability, status,
  valid_until, resource_modified_at, snapshot_hash, metadata
) values (
  '00000000-0000-4000-8000-000000000503', 'polar', 'sandbox', 'benefit_grant',
  'channel-only', 'vantare.channel.testers', 'active', null,
  '2026-08-02T10:00:00Z', repeat('5',64), '{}'::jsonb
);
select public.billing_refresh_entitlement_read_model('00000000-0000-4000-8000-000000000503');
select is((select status from public.user_entitlements where user_id = '00000000-0000-4000-8000-000000000503' and product_key = 'bundle'), 'revoked', 'channel-only grant cannot create bundle access');
select is(
  (select outcome from public.billing_apply_resource_snapshot(
    'polar', 'sandbox', 'subscription', 'root-pro',
    '00000000-0000-4000-8000-000000000503',
    '2026-08-02T11:00:00Z', repeat('6',64), 'active',
    '[{"capability":"vantare.plan.pro","status":"active","validUntil":"2026-09-02T11:00:00Z"}]'::jsonb
  )),
  'apply',
  'Pro root capability applies independently'
);
select is((select status from public.user_entitlements where user_id = '00000000-0000-4000-8000-000000000503' and product_key = 'bundle'), 'active', 'Pro root capability grants bundle access');
select is(
  (select outcome from public.billing_apply_resource_snapshot(
    'polar', 'sandbox', 'subscription', 'root-pro',
    '00000000-0000-4000-8000-000000000503',
    '2026-08-02T12:00:00Z', repeat('7',64), 'revoked',
    '[{"capability":"vantare.plan.pro","status":"revoked","validUntil":"2026-08-02T12:00:00Z"}]'::jsonb
  )),
  'apply',
  'the final root revocation applies'
);
select is(
  (select status from public.user_entitlements where user_id = '00000000-0000-4000-8000-000000000503' and product_key = 'bundle'),
  'revoked',
  'revoking the final root revokes bundle while the channel grant remains'
);
select is((select status from public.billing_access_grants where source_id = 'channel-only'), 'active', 'revoking the final root does not revoke the independent channel source');
select throws_ok(
  $$insert into public.user_entitlements (user_id,product_key,status,source) values ('00000000-0000-4000-8000-000000000503','vantare.channel.testers','active','support')$$,
  '23514',
  null,
  'an active parallel entitlement authority is rejected'
);

select throws_ok(
  $$select * from public.billing_apply_resource_snapshot('polar','sandbox','refund','bad','00000000-0000-4000-8000-000000000501','2026-08-02T15:00:00Z',repeat('2',64),'bad','[]'::jsonb)$$,
  'P0001', 'invalid_commercial_snapshot', 'unknown resource type fails closed'
);
select throws_ok(
  $$select * from public.billing_apply_resource_snapshot('polar','sandbox','order','bad-grant','00000000-0000-4000-8000-000000000501','2026-08-02T15:00:00Z',repeat('3',64),'paid','[{"capability":"vantare.plan.pro","status":"invented"}]'::jsonb)$$,
  'P0001', 'invalid_commercial_grant', 'invalid grant status fails closed'
);
select throws_ok(
  $$select * from public.billing_apply_resource_snapshot('polar','sandbox','order','order-b','00000000-0000-4000-8000-000000000502','2026-08-02T16:00:00Z',repeat('4',64),'paid','[]'::jsonb)$$,
  'P0001', 'commercial_resource_owner_mismatch', 'resource ownership cannot move between accounts'
);

select * from finish();
rollback;
