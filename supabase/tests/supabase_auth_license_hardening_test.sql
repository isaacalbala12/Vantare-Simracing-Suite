begin;
select plan(48);

select ok(has_function_privilege('authenticated', 'public.claim_active_device(text)', 'execute'),
  'authenticated may claim its device explicitly');
select ok(has_function_privilege('authenticated', 'public.read_account_entitlements()', 'execute'),
  'authenticated may read its own entitlements');
select ok(has_function_privilege('authenticated', 'public.get_account_entitlements(text)', 'execute'),
  'authenticated may call the compatibility entitlement read');
select ok(has_function_privilege('authenticated', 'public.reset_active_device(text)', 'execute'),
  'authenticated may reset its active device');
select ok(not has_function_privilege('anon', 'public.claim_active_device(text)', 'execute'),
  'anon cannot claim a device');
select ok(not has_function_privilege('anon', 'public.read_account_entitlements()', 'execute'),
  'anon cannot read account entitlements');
select ok(not has_function_privilege('anon', 'public.get_account_entitlements(text)', 'execute'),
  'anon cannot call the compatibility entitlement read');
select ok(not has_function_privilege('anon', 'public.reset_active_device(text)', 'execute'),
  'anon cannot reset a device');
select ok(not has_table_privilege('authenticated', 'public.devices', 'insert'),
  'authenticated cannot insert devices directly');
select ok(not has_table_privilege('authenticated', 'public.devices', 'update'),
  'authenticated cannot update devices directly');
select ok(not has_table_privilege('authenticated', 'public.user_entitlements', 'insert'),
  'authenticated cannot manufacture entitlements');
select ok(not has_table_privilege('authenticated', 'public.billing_customers', 'update'),
  'authenticated cannot alter billing identities');
select ok(
  (select prosecdef from pg_proc where oid = 'public.claim_active_device(text)'::regprocedure),
  'device claim is security definer');
select is(
  (select proconfig[1] from pg_proc where oid = 'public.claim_active_device(text)'::regprocedure),
  'search_path=""',
  'device claim pins an empty search path');
select ok((select prosecdef from pg_proc where oid = 'public.read_account_entitlements()'::regprocedure),
  'entitlement read is security definer');
select is((select proconfig[1] from pg_proc where oid = 'public.read_account_entitlements()'::regprocedure),
  'search_path=""', 'entitlement read pins an empty search path');
select ok((select prosecdef from pg_proc where oid = 'public.get_account_entitlements(text)'::regprocedure),
  'compatibility read is security definer');
select is((select proconfig[1] from pg_proc where oid = 'public.get_account_entitlements(text)'::regprocedure),
  'search_path=""', 'compatibility read pins an empty search path');
select ok((select prosecdef from pg_proc where oid = 'public.reset_active_device(text)'::regprocedure),
  'device reset is security definer');
select is((select proconfig[1] from pg_proc where oid = 'public.reset_active_device(text)'::regprocedure),
  'search_path=""', 'device reset pins an empty search path');

select ok(has_function_privilege('service_role', 'public.claim_billing_checkout_attempt(uuid,uuid,text,text,text)', 'execute'),
  'service role may claim checkout attempts');
select ok(has_function_privilege('service_role', 'public.complete_billing_checkout_attempt(uuid,uuid,text,text)', 'execute'),
  'service role may complete checkout attempts');
select ok(has_function_privilege('service_role', 'public.mark_billing_checkout_attempt_uncertain(uuid,uuid)', 'execute'),
  'service role may quarantine uncertain checkout attempts');
select ok(not has_function_privilege('anon', 'public.claim_billing_checkout_attempt(uuid,uuid,text,text,text)', 'execute'),
  'anon cannot claim checkout attempts');
select ok(not has_function_privilege('authenticated', 'public.claim_billing_checkout_attempt(uuid,uuid,text,text,text)', 'execute'),
  'authenticated cannot claim checkout attempts directly');
select ok(not has_function_privilege('anon', 'public.complete_billing_checkout_attempt(uuid,uuid,text,text)', 'execute'),
  'anon cannot complete checkout attempts');
select ok(not has_function_privilege('authenticated', 'public.complete_billing_checkout_attempt(uuid,uuid,text,text)', 'execute'),
  'authenticated cannot complete checkout attempts directly');
select ok(not has_function_privilege('anon', 'public.mark_billing_checkout_attempt_uncertain(uuid,uuid)', 'execute'),
  'anon cannot quarantine checkout attempts');
select ok(not has_function_privilege('authenticated', 'public.mark_billing_checkout_attempt_uncertain(uuid,uuid)', 'execute'),
  'authenticated cannot quarantine checkout attempts directly');
select ok((select prosecdef from pg_proc where oid = 'public.claim_billing_checkout_attempt(uuid,uuid,text,text,text)'::regprocedure),
  'checkout claim is security definer');
select is((select proconfig[1] from pg_proc where oid = 'public.claim_billing_checkout_attempt(uuid,uuid,text,text,text)'::regprocedure),
  'search_path=""', 'checkout claim pins an empty search path');
select ok((select prosecdef from pg_proc where oid = 'public.complete_billing_checkout_attempt(uuid,uuid,text,text)'::regprocedure),
  'checkout completion is security definer');
select is((select proconfig[1] from pg_proc where oid = 'public.complete_billing_checkout_attempt(uuid,uuid,text,text)'::regprocedure),
  'search_path=""', 'checkout completion pins an empty search path');
select ok((select prosecdef from pg_proc where oid = 'public.mark_billing_checkout_attempt_uncertain(uuid,uuid)'::regprocedure),
  'checkout quarantine is security definer');
select is((select proconfig[1] from pg_proc where oid = 'public.mark_billing_checkout_attempt_uncertain(uuid,uuid)'::regprocedure),
  'search_path=""', 'checkout quarantine pins an empty search path');

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
select ok(
  (select device_bound from public.read_account_entitlements()),
  'pure read reports that a device is bound without claiming it is this device');
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
select throws_ok($$ select public.claim_active_device('fingerprint') $$,
  '42501', null, 'anonymous device claim is denied at runtime');
select throws_ok($$ select * from public.read_account_entitlements() $$,
  '42501', null, 'anonymous read is denied');
select throws_ok($$ select * from public.get_account_entitlements('fingerprint') $$,
  '42501', null, 'anonymous compatibility read is denied at runtime');
select throws_ok($$ select public.reset_active_device('fingerprint') $$,
  '42501', null, 'anonymous reset is denied at runtime');
reset role;

update public.devices set last_reset_at = null
where user_id = '00000000-0000-4000-8000-000000000088';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000088', true);
select lives_ok($$ select public.reset_active_device('fingerprint-new') $$,
  'reset binds the explicit current fingerprint');
reset role;
select is(
  (select fingerprint_hash from public.devices where user_id = '00000000-0000-4000-8000-000000000088'),
  'fingerprint-new', 'reset replaces the bound device with the explicit fingerprint');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000088', true);
select throws_ok($$ select public.reset_active_device('fingerprint-another') $$,
  'P0001', 'rate_limit: solo 1 reset cada 24h', 'a second reset inside 24 hours is denied');

select * from finish();
rollback;
