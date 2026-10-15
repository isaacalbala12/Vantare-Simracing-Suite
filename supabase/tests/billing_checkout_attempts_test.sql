begin;
create extension if not exists pgtap;
select plan(20);

select has_table('public', 'billing_checkout_attempts', 'checkout attempts table exists');
select col_is_pk('public', 'billing_checkout_attempts', array['user_id', 'attempt_id'], 'attempt identity is scoped to the account');
select has_column('public', 'billing_checkout_attempts', 'expires_at', 'attempts have explicit expiry');
select is(
  (select relrowsecurity from pg_class where oid = 'public.billing_checkout_attempts'::regclass),
  true,
  'RLS is enabled'
);
select is(has_table_privilege('anon', 'public.billing_checkout_attempts', 'select'), false, 'anonymous clients cannot read attempts');
select is(has_table_privilege('authenticated', 'public.billing_checkout_attempts', 'select'), false, 'authenticated clients cannot read attempts');
select has_function('public', 'claim_billing_checkout_attempt', array['uuid', 'uuid', 'text', 'text', 'text'], 'atomic claim RPC exists');
select has_function('public', 'complete_billing_checkout_attempt', array['uuid', 'uuid', 'text', 'text'], 'exact completion RPC exists');

insert into auth.users (id)
values ('00000000-0000-4000-8000-000000000010')
on conflict (id) do nothing;
-- B03 fixture: internal profile plus an explicit Clerk binding before child rows.
DO $fixture$ BEGIN
  IF to_regclass('private.clerk_issuers') IS NOT NULL THEN
    INSERT INTO private.clerk_issuers(issuer,authorized_parties,enabled)
      VALUES ('https://fixtures.clerk.invalid',ARRAY['https://app.invalid'],true)
      ON CONFLICT (issuer) DO NOTHING;
    INSERT INTO public.profiles(id,email) SELECT id,email FROM auth.users
      ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.account_identities(issuer,subject,account_id)
      SELECT 'https://fixtures.clerk.invalid','user_'||replace(id::text,'-',''),id
      FROM public.profiles ON CONFLICT (issuer,subject) DO NOTHING;
  END IF;
END $fixture$;


select is(
  (select outcome from public.claim_billing_checkout_attempt(
    '00000000-0000-4000-8000-000000000010',
    '00000000-0000-4000-8000-000000000020',
    'pro_monthly', 'sandbox', 'catalog-v2'
  )),
  'claimed',
  'first request claims the attempt'
);
select is(
  (select outcome from public.claim_billing_checkout_attempt(
    '00000000-0000-4000-8000-000000000010',
    '00000000-0000-4000-8000-000000000020',
    'pro_monthly', 'sandbox', 'catalog-v2'
  )),
  'busy',
  'second request cannot claim a creating attempt'
);
select ok(
  public.complete_billing_checkout_attempt(
    '00000000-0000-4000-8000-000000000010',
    '00000000-0000-4000-8000-000000000020',
    'checkout-test', 'https://sandbox.polar.sh/checkout/test'
  ),
  'creating to open changes exactly one row'
);
select is(
  public.complete_billing_checkout_attempt(
    '00000000-0000-4000-8000-000000000010',
    '00000000-0000-4000-8000-000000000020',
    'checkout-test', 'https://sandbox.polar.sh/checkout/test'
  ),
  false,
  'a second completion changes no row'
);
select is(
  (select outcome from public.claim_billing_checkout_attempt(
    '00000000-0000-4000-8000-000000000010',
    '00000000-0000-4000-8000-000000000020',
    'pro_monthly', 'sandbox', 'catalog-v2'
  )),
  'reused',
  'an unexpired open attempt is reused'
);

update public.billing_checkout_attempts
set expires_at = now() - interval '1 second'
where user_id = '00000000-0000-4000-8000-000000000010'
  and attempt_id = '00000000-0000-4000-8000-000000000020';

select is(
  (select outcome from public.claim_billing_checkout_attempt(
    '00000000-0000-4000-8000-000000000010',
    '00000000-0000-4000-8000-000000000020',
    'pro_monthly', 'sandbox', 'catalog-v2'
  )),
  'expired',
  'an expired URL is never reused'
);

-- Fixture has confirmed its only hosted checkout expired unpaid. Support removes
-- the transient attempt; the durable binding remains. No automatic TTL reset.
delete from public.billing_checkout_attempts where user_id='00000000-0000-4000-8000-000000000010';

select is(
  (select outcome from public.claim_billing_checkout_attempt(
    '00000000-0000-4000-8000-000000000010',
    '00000000-0000-4000-8000-000000000022',
    'pro_monthly', 'sandbox', 'catalog-v2'
  )),
  'claimed',
  'a second attempt can be claimed'
);
select ok(
  public.mark_billing_checkout_attempt_uncertain(
    '00000000-0000-4000-8000-000000000010',
    '00000000-0000-4000-8000-000000000022'
  ),
  'creating to uncertain changes exactly one row'
);
select is(
  public.mark_billing_checkout_attempt_uncertain(
    '00000000-0000-4000-8000-000000000010',
    '00000000-0000-4000-8000-000000000022'
  ),
  false,
  'a second uncertain transition changes no row'
);

insert into public.billing_checkout_attempts (
  user_id, attempt_id, checkout_key, environment, catalog_version, status,
  expires_at
) values (
  '00000000-0000-4000-8000-000000000010',
  '00000000-0000-4000-8000-000000000023',
  'pro_monthly', 'sandbox', 'catalog-v2', 'creating',
  now() - interval '25 hours'
);

do $$
begin
  perform outcome from public.claim_billing_checkout_attempt(
    '00000000-0000-4000-8000-000000000010',
    '00000000-0000-4000-8000-000000000024',
    'pro_monthly', 'sandbox', 'catalog-v2'
  );
end;
$$;
select is(
  (select count(*)::integer from public.billing_checkout_attempts
   where attempt_id = '00000000-0000-4000-8000-000000000023'),
  1,
  'expired unresolved attempts are retained for reconciliation, not erased by another claim'
);

delete from public.billing_checkout_attempts where user_id='00000000-0000-4000-8000-000000000010';

select is(
  (select outcome from public.claim_billing_checkout_attempt(
    '00000000-0000-4000-8000-000000000010',
    '00000000-0000-4000-8000-000000000025',
    'pro_annual', 'sandbox', 'catalog-v2'
  )),
  'claimed',
  'Pro annual is an accepted checkout key (ISA-1499)'
);

delete from public.billing_checkout_attempts where user_id='00000000-0000-4000-8000-000000000010';

select is(
  (select outcome from public.claim_billing_checkout_attempt(
    '00000000-0000-4000-8000-000000000010',
    '00000000-0000-4000-8000-000000000026',
    'pro_plus_annual', 'sandbox', 'catalog-v2'
  )),
  'claimed',
  'Pro Plus annual is an accepted checkout key (ISA-1620)'
);

select * from finish();
rollback;
