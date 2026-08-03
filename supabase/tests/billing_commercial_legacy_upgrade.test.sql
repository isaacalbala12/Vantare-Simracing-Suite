begin;
select plan(11);

select is(
  (select status from public.billing_access_grants where source_id = '00000000-0000-4000-8000-000000000701'),
  'active',
  'past_due with paid-through evidence remains temporarily active'
);
select cmp_ok(
  (select valid_until from public.billing_access_grants where source_id = '00000000-0000-4000-8000-000000000701'),
  '<=',
  (select resource_modified_at + interval '3 days' from public.billing_access_grants where source_id = '00000000-0000-4000-8000-000000000701'),
  'past_due validity is capped at three days from the last observed update'
);
select is(
  (select status || ':' || source from public.user_entitlements where user_id = '00000000-0000-4000-8000-000000000701' and product_key = 'bundle'),
  'active:billing_projection',
  'bounded past_due evidence is converted to the derived read-model'
);
select cmp_ok(
  (select expires_at from public.user_entitlements where user_id = '00000000-0000-4000-8000-000000000701' and product_key = 'bundle'),
  '<=',
  (select updated_at + interval '3 days' from public.billing_access_grants where source_id = '00000000-0000-4000-8000-000000000701'),
  'derived access cannot outlive the bounded legacy grant'
);

select is(
  (select status from public.billing_access_grants where source_id = '00000000-0000-4000-8000-000000000702'),
  'revoked',
  'past_due without paid-through evidence fails closed'
);
select is(
  (select valid_until from public.billing_access_grants where source_id = '00000000-0000-4000-8000-000000000702'),
  (select resource_modified_at from public.billing_access_grants where source_id = '00000000-0000-4000-8000-000000000702'),
  'unproven past_due access receives no synthetic future validity'
);
select is(
  (select status || ':' || source from public.user_entitlements where user_id = '00000000-0000-4000-8000-000000000702' and product_key = 'bundle'),
  'revoked:billing_projection',
  'unproven past_due access is revoked in the derived read-model'
);
select ok(
  (select expires_at <= now() from public.user_entitlements where user_id = '00000000-0000-4000-8000-000000000702' and product_key = 'bundle'),
  'revoked derived access has no future expiry'
);

select is(
  (select capability from public.billing_access_grants where source_id = '00000000-0000-4000-8000-000000000703'),
  'vantare.plan.pro',
  'known legacy Pro semantics are preserved as a root grant'
);
select is(
  (select status || ':' || source from public.user_entitlements where user_id = '00000000-0000-4000-8000-000000000703' and product_key = 'bundle'),
  'active:billing_projection',
  'legacy Pro access is represented by the derived bundle row'
);
select is(
  (select status || ':' || source from public.user_entitlements where user_id = '00000000-0000-4000-8000-000000000703' and product_key = 'vantare_pro'),
  'revoked:billing_projection',
  'the old product row no longer acts as a parallel authority'
);

select * from finish();
rollback;
