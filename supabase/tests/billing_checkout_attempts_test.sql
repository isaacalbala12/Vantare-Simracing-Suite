begin;
select plan(5);

select has_table('public', 'billing_checkout_attempts', 'checkout attempts table exists');
select col_is_pk('public', 'billing_checkout_attempts', array['user_id', 'attempt_id'], 'attempt identity is scoped to the account');
select is(
  (select relrowsecurity from pg_class where oid = 'public.billing_checkout_attempts'::regclass),
  true,
  'RLS is enabled'
);
select is(
  has_table_privilege('anon', 'public.billing_checkout_attempts', 'select'),
  false,
  'anonymous clients cannot read attempts'
);
select is(
  has_table_privilege('authenticated', 'public.billing_checkout_attempts', 'select'),
  false,
  'authenticated clients cannot read attempts'
);

select * from finish();
rollback;
