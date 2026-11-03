-- VANTA-131 paso 5b: legacy Linear webhook/pilot must not remain callable.
begin;
select plan(11);

select ok(to_regclass('public.testing_center_linear_issue_bindings') is null,
  'Linear issue bindings retired');
select ok(to_regclass('public.testing_center_linear_state_mappings') is null,
  'Linear state mappings retired');
select ok(to_regclass('public.testing_center_linear_reconciliations') is null,
  'Linear reconciliations retired');
select ok(to_regclass('public.testing_center_linear_webhook_deliveries') is null,
  'Linear webhook deliveries retired');

select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname=name),0,name || ' RPC retired')
from (values
  ('testing_center_bind_linear_issue'),
  ('testing_center_upsert_linear_state_mapping'),
  ('testing_center_reconcile_linear_webhook'),
  ('testing_center_claim_linear_effect'),
  ('testing_center_retry_linear_pilot_token'),
  ('testing_center_assert_linear_dispatch'),
  ('testing_center_complete_linear_pilot')
) as retired(name);

select * from finish();
rollback;
