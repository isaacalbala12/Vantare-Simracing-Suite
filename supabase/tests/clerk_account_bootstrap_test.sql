begin;
select plan(31);

select has_table('public', 'account_identities',
  'external identities have one server-owned mapping table');
select has_schema('private',
  'identity resolution lives outside the exposed public schema');
select has_function('private', 'resolve_current_account', array[]::text[],
  'the private resolver derives the current account without client arguments');
select is((
  select count(*)::integer
  from pg_constraint constraint_row
  where constraint_row.conrelid = 'public.profiles'::regclass
    and constraint_row.confrelid = 'auth.users'::regclass
    and constraint_row.contype = 'f'
), 0, 'profiles is an internal account root rather than an auth.users dependent');

select ok((
  select relrowsecurity from pg_class
  where oid = 'public.account_identities'::regclass
), 'identity mappings have RLS enabled');
select ok(not has_table_privilege('authenticated', 'public.account_identities', 'select'),
  'authenticated cannot read identity mappings');
select ok(not has_table_privilege('authenticated', 'public.account_identities', 'insert'),
  'authenticated cannot create identity mappings directly');
select ok(not has_table_privilege('authenticated', 'public.account_identities', 'update'),
  'authenticated cannot move identity mappings');
select ok(not has_table_privilege('authenticated', 'public.account_identities', 'delete'),
  'authenticated cannot remove identity mappings');
select ok((
  select prosecdef from pg_proc
  where oid = 'private.resolve_current_account()'::regprocedure
), 'the private resolver is security definer');
select is((
  select proconfig[1] from pg_proc
  where oid = 'private.resolve_current_account()'::regprocedure
), 'search_path=""', 'the private resolver pins an empty search path');
select ok(not has_function_privilege(
  'authenticated', 'private.resolve_current_account()', 'execute'
), 'authenticated cannot call the private resolver directly');
select ok(not has_function_privilege(
  'anon', 'public.claim_active_device(text)', 'execute'
), 'anon cannot bootstrap an account through the device RPC');
select ok(has_function_privilege(
  'authenticated', 'public.claim_active_device(text)', 'execute'
), 'authenticated can bootstrap through the existing device RPC');

insert into auth.users (id, email)
values ('00000000-0000-4000-8000-000000000901', 'shared-isa909@example.invalid');

set role authenticated;
select set_config('request.jwt.claims',
  '{"iss":"https://local.supabase.test/auth/v1","sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}', true);
create temporary table isa909_legacy as
select public.claim_active_device('isa909-legacy-device') as account_id;
reset role;

select is((select account_id from isa909_legacy),
  '00000000-0000-4000-8000-000000000901'::uuid,
  'a Supabase Auth issuer preserves its existing account UUID');

set role authenticated;
select set_config('request.jwt.claims',
  '{"iss":"https://clerk.isa909.test","sub":"user_isa909_a","role":"authenticated","email":"shared-isa909@example.invalid"}', true);
create temporary table isa909_clerk_first as
select public.claim_active_device('isa909-clerk-device') as account_id;
reset role;

select ok((select account_id::text from isa909_clerk_first) ~
  '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
  'a Clerk identity receives an internal UUID');
select isnt((select account_id from isa909_clerk_first),
  '00000000-0000-4000-8000-000000000901'::uuid,
  'a matching email never links the Clerk identity to a legacy account');
select is((select count(*)::integer from public.account_identities
  where issuer = 'https://clerk.isa909.test' and subject = 'user_isa909_a'),
  1, 'the first Clerk login creates exactly one identity mapping');
select is((select count(*)::integer from public.profiles
  where id = (select account_id from isa909_clerk_first)),
  1, 'the first Clerk login creates its internal profile');

set role authenticated;
select set_config('request.jwt.claims',
  '{"iss":"https://clerk.isa909.test","sub":"user_isa909_a","role":"authenticated"}', true);
create temporary table isa909_clerk_repeat as
select public.claim_active_device('isa909-clerk-device') as account_id;
reset role;

select is((select account_id from isa909_clerk_repeat),
  (select account_id from isa909_clerk_first),
  'a repeated Clerk login resolves the same account UUID');
select is((select count(*)::integer
  from public.account_identities identity_row
  join public.profiles profile_row on profile_row.id = identity_row.account_id
  where identity_row.issuer = 'https://clerk.isa909.test'
    and identity_row.subject = 'user_isa909_a'),
  1, 'a repeated login creates neither mapping nor profile duplicates');

set role authenticated;
select set_config('request.jwt.claims',
  '{"iss":"https://clerk.isa909.test","sub":"user_isa909_b","role":"authenticated"}', true);
create temporary table isa909_clerk_second as
select public.claim_active_device('isa909-clerk-second-device') as account_id;
reset role;

select isnt((select account_id from isa909_clerk_second),
  (select account_id from isa909_clerk_first),
  'different Clerk subjects receive different internal accounts');

set role authenticated;
select set_config('request.jwt.claims',
  '{"iss":"https://clerk.isa909.test","sub":"00000000-0000-4000-8000-000000000901","role":"authenticated"}', true);
create temporary table isa909_external_uuid as
select public.claim_active_device('isa909-external-uuid-device') as account_id;
reset role;

select isnt((select account_id from isa909_external_uuid),
  '00000000-0000-4000-8000-000000000901'::uuid,
  'a non-Supabase issuer cannot claim a legacy account with a colliding UUID subject');

insert into auth.users (id, email)
values ('00000000-0000-4000-8000-000000000902', 'deleted-isa909@example.invalid');
delete from auth.users where id = '00000000-0000-4000-8000-000000000902';

set role authenticated;
select set_config('request.jwt.claims',
  '{"iss":"https://local.supabase.test/auth/v1","sub":"00000000-0000-4000-8000-000000000902","role":"authenticated"}', true);
select throws_ok(
  $$ select public.claim_active_device('isa909-deleted-legacy') $$,
  'P0001', 'not_authenticated',
  'a deleted Supabase Auth user cannot be remapped as an external identity');
reset role;

set role authenticated;
select set_config('request.jwt.claims',
  '{"iss":"https://clerk.isa909.test","sub":"user_isa909_a","role":"authenticated"}', true);
select is((select user_id from public.read_account_entitlements()),
  (select account_id from isa909_clerk_first),
  'entitlement reads use the mapped account instead of auth.uid()');
select ok((select user_id = (select account_id from isa909_clerk_first) and device_ok
  from public.get_account_entitlements('isa909-clerk-device')),
  'the compatibility read uses the mapped account and device');
select lives_ok(
  $$ select public.reset_active_device('isa909-clerk-reset-device') $$,
  'device reset accepts Clerk claims without casting auth.uid()');
reset role;

select is((select fingerprint_hash from public.devices
  where user_id = (select account_id from isa909_clerk_first)),
  'isa909-clerk-reset-device', 'device reset mutates only the mapped account');

set role authenticated;
select set_config('request.jwt.claims', '{}', true);
select throws_ok(
  $$ select public.claim_active_device('isa909-missing-identity') $$,
  'P0001', 'not_authenticated', 'missing identity claims fail closed');
select set_config('request.jwt.claims',
  '{"iss":"https://clerk.isa909.test","sub":"","role":"authenticated"}', true);
select throws_ok(
  $$ select public.claim_active_device('isa909-empty-subject') $$,
  'P0001', 'not_authenticated', 'an empty subject fails closed');
select set_config('request.jwt.claims',
  '{"iss":"","sub":"user_isa909_missing_issuer","role":"authenticated"}', true);
select throws_ok(
  $$ select public.claim_active_device('isa909-empty-issuer') $$,
  'P0001', 'not_authenticated', 'an empty issuer fails closed');
reset role;

select * from finish();
rollback;
