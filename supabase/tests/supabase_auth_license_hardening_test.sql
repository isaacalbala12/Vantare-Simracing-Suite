begin;
select plan(15);

select ok(has_function_privilege('authenticated', 'public.claim_active_device(text)', 'execute'),
  'authenticated may claim its device explicitly');
select ok(has_function_privilege('authenticated', 'public.read_account_entitlements()', 'execute'),
  'authenticated may read its own entitlements');
select ok(not has_function_privilege('anon', 'public.claim_active_device(text)', 'execute'),
  'anon cannot claim a device');
select ok(not has_function_privilege('anon', 'public.read_account_entitlements()', 'execute'),
  'anon cannot read account entitlements');
select ok(not has_table_privilege('authenticated', 'public.devices', 'insert'),
  'authenticated cannot insert devices directly');
select ok(not has_table_privilege('authenticated', 'public.devices', 'update'),
  'authenticated cannot update devices directly');
select ok(not has_table_privilege('authenticated', 'public.user_entitlements', 'insert'),
  'authenticated cannot manufacture entitlements');
select ok(
  (select prosecdef from pg_proc where oid = 'public.claim_active_device(text)'::regprocedure),
  'device claim is security definer');
select is(
  (select proconfig[1] from pg_proc where oid = 'public.claim_active_device(text)'::regprocedure),
  'search_path=""',
  'device claim pins an empty search path');

insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-4000-8000-000000000088', 'hardening@example.invalid', '{}'::jsonb);
insert into public.user_entitlements (user_id, product_key, status, source)
values ('00000000-0000-4000-8000-000000000088', 'vantare_pro', 'active', 'test');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000088', true);
select lives_ok($$ select public.claim_active_device('fingerprint-a') $$,
  'authenticated user can claim an unbound device');
select is(
  (select active_device from public.read_account_entitlements()),
  'fingerprint-a',
  'pure read returns the claimed device');
reset role;
create temporary table read_guard as
select last_seen_at from public.devices where user_id = '00000000-0000-4000-8000-000000000088';
select pg_sleep(0.01);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000088', true);
select * from public.read_account_entitlements();
reset role;
select is(
  (select d.last_seen_at from public.devices d where d.user_id = '00000000-0000-4000-8000-000000000088'),
  (select last_seen_at from read_guard),
  'entitlement read does not mutate device timestamps');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000088', true);
select lives_ok($$ select public.claim_active_device('fingerprint-b') $$,
  'a conflicting claim is handled without exposing account state');
reset role;
select is(
  (select fingerprint_hash from public.devices where user_id = '00000000-0000-4000-8000-000000000088'),
  'fingerprint-a',
  'a second fingerprint is not silently rebound');

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$ select * from public.read_account_entitlements() $$,
  '42501', null, 'anonymous read is denied');

select * from finish();
rollback;
