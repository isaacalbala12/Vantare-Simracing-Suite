begin;
select plan(7);

select has_column(
  'public',
  'billing_customers',
  'environment',
  'billing customers identify the Polar environment'
);
select col_type_is(
  'public',
  'billing_customers',
  'environment',
  'text',
  'environment uses a bounded textual contract'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.billing_customers'::regclass
      and conname = 'billing_customers_environment_check'
      and contype = 'c'
  ),
  'only sandbox and production are accepted'
);

select lives_ok(
  $$
    insert into public.billing_customers (
      user_id, provider, provider_customer_id, environment
    ) values
      ('00000000-0000-4000-8000-000000000031', 'polar', 'same-customer', 'sandbox'),
      ('00000000-0000-4000-8000-000000000031', 'polar', 'same-customer', 'production')
  $$,
  'the same logical identity may exist independently in both environments'
);
select is(
  (select count(*)::integer from public.billing_customers where environment is not null),
  2,
  'sandbox and production rows remain distinct'
);
select is(
  (select count(*)::integer from public.billing_customers where environment is null),
  1,
  'legacy rows remain quarantined with a null environment'
);
select throws_ok(
  $$
    insert into public.billing_customers (
      user_id, provider, provider_customer_id, environment
    ) values (
      '00000000-0000-4000-8000-000000000031', 'polar', 'other-customer', 'sandbox'
    )
  $$,
  '23505',
  null,
  'one account cannot have two Polar customers in one environment'
);

select * from finish();
rollback;
