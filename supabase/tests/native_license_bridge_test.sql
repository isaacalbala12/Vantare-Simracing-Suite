begin;
select no_plan();

select has_function('public', 'native_claim_license_device', array['text', 'text', 'text'],
  'native bootstrap has a service-only RPC');
select ok((select prosecdef from pg_proc where oid =
  'public.native_claim_license_device(text,text,text)'::regprocedure), 'RPC is security definer');
select is((select proconfig[1] from pg_proc where oid =
  'public.native_claim_license_device(text,text,text)'::regprocedure), 'search_path=""',
  'RPC pins an empty search path');
select ok(not has_function_privilege('anon',
  'public.native_claim_license_device(text,text,text)', 'execute'), 'anon cannot submit identities');
select ok(not has_function_privilege('authenticated',
  'public.native_claim_license_device(text,text,text)', 'execute'), 'authenticated cannot submit identities');
select ok(has_function_privilege('service_role',
  'public.native_claim_license_device(text,text,text)', 'execute'), 'service_role can submit validated identities');
select ok(not exists (select 1 from pg_proc p, lateral aclexplode(p.proacl) acl
  where p.oid = 'public.native_claim_license_device(text,text,text)'::regprocedure
  and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'), 'PUBLIC has no EXECUTE');
select ok(not has_function_privilege('service_role',
  'private.resolve_account_identity(text,text)', 'execute'), 'service_role cannot bypass the RPC resolver');
select ok(not has_function_privilege('service_role',
  'private.claim_account_device(uuid,text)', 'execute'), 'service_role cannot bind an arbitrary UUID');
select ok(has_function_privilege('authenticated',
  'public.claim_active_device(text)', 'execute'), 'existing authenticated device RPC remains available');

set local role anon;
select throws_ok($$select public.native_claim_license_device(
  'https://clerk.isa1444.test', 'user_' || repeat('a', 27), repeat('a', 64))$$,
  '42501', null, 'anon execution fails');
reset role;
set local role authenticated;
select throws_ok($$select public.native_claim_license_device(
  'https://clerk.isa1444.test', 'user_' || repeat('a', 27), repeat('a', 64))$$,
  '42501', null, 'authenticated execution fails');
reset role;

create temporary table native_test_accounts (name text primary key, account_id uuid);
grant all on native_test_accounts to service_role, authenticated;
set local role service_role;
insert into native_test_accounts values ('first', public.native_claim_license_device(
  'https://clerk.isa1444.test', 'user_' || repeat('a', 27), repeat('a', 64)));
insert into native_test_accounts values ('repeat', public.native_claim_license_device(
  'https://clerk.isa1444.test', 'user_' || repeat('a', 27), repeat('a', 64)));
insert into native_test_accounts values ('other-subject', public.native_claim_license_device(
  'https://clerk.isa1444.test', 'user_' || repeat('b', 27), repeat('a', 64)));
insert into native_test_accounts values ('other-issuer', public.native_claim_license_device(
  'https://other-clerk.isa1444.test', 'user_' || repeat('a', 27), repeat('a', 64)));
insert into native_test_accounts values ('slash', public.native_claim_license_device(
  'https://clerk.isa1444.test/', 'user_' || repeat('a', 27), repeat('a', 64)));
insert into native_test_accounts values ('other-device', public.native_claim_license_device(
  'https://clerk.isa1444.test', 'user_' || repeat('a', 27), repeat('b', 64)));
reset role;

select is((select account_id from native_test_accounts where name = 'repeat'),
  (select account_id from native_test_accounts where name = 'first'), 'same pair returns same UUID');
select is((select count(*)::integer from public.account_identities where
  issuer = 'https://clerk.isa1444.test' and subject = 'user_' || repeat('a', 27)),
  1, 'bootstrap creates exactly one mapping');
select is((select count(*)::integer from public.profiles where id =
  (select account_id from native_test_accounts where name = 'first')), 1, 'bootstrap creates one profile');
select is((select count(*)::integer from auth.users where id =
  (select account_id from native_test_accounts where name = 'first')), 0, 'bootstrap does not fabricate auth.users');
select isnt((select account_id from native_test_accounts where name = 'other-subject'),
  (select account_id from native_test_accounts where name = 'first'), 'different subject has another account');
select isnt((select account_id from native_test_accounts where name = 'other-issuer'),
  (select account_id from native_test_accounts where name = 'first'), 'different issuer has another account');
select is((select account_id from native_test_accounts where name = 'slash'),
  (select account_id from native_test_accounts where name = 'first'), 'issuer trailing slash does not duplicate account');
select is((select fingerprint_hash from public.devices where user_id =
  (select account_id from native_test_accounts where name = 'other-device')), repeat('a', 64),
  'claim preserves the original active device rather than resetting it');
select is((select count(*)::integer from public.billing_access_grants where user_id =
  (select account_id from native_test_accounts where name = 'first')), 0, 'bootstrap creates no commercial grants');

set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object(
  'iss', 'https://clerk.isa1444.test/', 'sub', 'user_' || repeat('a', 27), 'role', 'authenticated')::text, true);
insert into native_test_accounts values ('tpa', public.claim_active_device(repeat('a', 64)));
reset role;
select is((select account_id from native_test_accounts where name = 'tpa'),
  (select account_id from native_test_accounts where name = 'first'), 'TPA and native reuse the same resolver and UUID');

insert into public.profiles (id) values
  ('00000000-0000-4000-8000-000000001444'), ('00000000-0000-4000-8000-000000002444');
insert into public.account_identities (issuer, subject, account_id) values
  ('https://old-clerk.isa1444.test/', 'user_' || repeat('c', 27), '00000000-0000-4000-8000-000000001444');
set local role service_role;
select is(public.native_claim_license_device('https://old-clerk.isa1444.test',
  'user_' || repeat('c', 27), repeat('a', 64)), '00000000-0000-4000-8000-000000001444'::uuid,
  'preexisting slash mapping is reused without rewriting it');
reset role;
insert into public.account_identities (issuer, subject, account_id) values
  ('https://old-clerk.isa1444.test', 'user_' || repeat('c', 27), '00000000-0000-4000-8000-000000002444');
set local role service_role;
select throws_ok($$select public.native_claim_license_device('https://old-clerk.isa1444.test',
  'user_' || repeat('c', 27), repeat('a', 64))$$, 'P0001', 'account_conflict',
  'two canonical-equivalent mappings fail closed without email linking');
select throws_ok($$select public.native_claim_license_device('https://clerk.isa1444.test',
  'user_' || repeat('d', 27), 'invalid')$$, 'P0001', 'invalid_identity', 'RPC rejects invalid fingerprint');
select throws_ok($$select public.native_claim_license_device('https://clerk.isa1444.test',
  'org_invalid', repeat('a', 64))$$, 'P0001', 'invalid_identity', 'RPC rejects non-user subject');
select throws_ok($$select public.native_claim_license_device('https://local.test/auth/v1',
  'user_' || repeat('d', 27), repeat('a', 64))$$, 'P0001', 'invalid_identity', 'native cannot impersonate legacy issuer');
reset role;

select * from finish();
rollback;
