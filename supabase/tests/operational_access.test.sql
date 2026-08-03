begin;
select plan(56);

select has_table('public', 'operational_access_assignments', 'operational assignments table exists');
select has_table('public', 'operational_access_audit', 'operational audit table exists');
select has_table('public', 'operational_legacy_grant_retirements', 'legacy retirement audit table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.operational_access_assignments'::regclass), 'assignments have RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.operational_access_audit'::regclass), 'audit has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.operational_legacy_grant_retirements'::regclass), 'legacy retirement audit has RLS');
select ok(not has_table_privilege('authenticated', 'public.operational_access_assignments', 'select'), 'authenticated cannot read assignments');
select ok(not has_table_privilege('authenticated', 'public.operational_access_assignments', 'insert'), 'authenticated cannot grant a role');
select ok(not has_table_privilege('authenticated', 'public.operational_access_assignments', 'update'), 'authenticated cannot edit a role');
select ok(not has_table_privilege('authenticated', 'public.operational_access_assignments', 'delete'), 'authenticated cannot delete a role');
select ok(not has_table_privilege('authenticated', 'public.operational_access_audit', 'select'), 'authenticated cannot read audit data');
select ok(not has_table_privilege('authenticated', 'public.operational_legacy_grant_retirements', 'select'), 'authenticated cannot read legacy retirement audit');
select has_function('public', 'operational_access_set', array['uuid','text','text','text','text','text','timestamp with time zone'], 'admin mutation boundary exists');
select ok(has_function_privilege('service_role', 'public.operational_access_set(uuid,text,text,text,text,text,timestamptz)', 'execute'), 'service role can mutate operational access');
select ok(not has_function_privilege('authenticated', 'public.operational_access_set(uuid,text,text,text,text,text,timestamptz)', 'execute'), 'authenticated cannot call the admin mutation boundary');
select ok(has_function_privilege('service_role', 'public.operational_access_preview(uuid)', 'execute'), 'service role can preview operational access');
select ok(not has_function_privilege('authenticated', 'public.operational_access_preview(uuid)', 'execute'), 'authenticated cannot preview operational access');
select has_function('public', 'operational_legacy_grant_preview', array['uuid'], 'legacy dry-run boundary exists');
select has_function('public', 'operational_legacy_grant_retire', array['uuid','text','text','text'], 'legacy retirement boundary exists');
select ok(has_function_privilege('service_role', 'public.operational_legacy_grant_retire(uuid,text,text,text)', 'execute'), 'service role can retire classified legacy authority');
select ok(not has_function_privilege('authenticated', 'public.operational_legacy_grant_retire(uuid,text,text,text)', 'execute'), 'authenticated cannot retire legacy authority');
select hasnt_column('public', 'operational_access_assignments', 'provider', 'operational roles do not impersonate a commercial provider');

insert into auth.users (id, email)
values ('00000000-0000-4000-8000-000000000247', 'operational-user@example.invalid');
insert into public.profiles (id, email)
values ('00000000-0000-4000-8000-000000000247', 'operational-user@example.invalid')
on conflict (id) do nothing;

insert into public.billing_access_grants (
  user_id, provider, environment, source_type, source_id, capability, status,
  valid_until, resource_modified_at, snapshot_hash, metadata
) values (
  '00000000-0000-4000-8000-000000000247', 'legacy', 'legacy', 'legacy',
  'isa-247-legacy-fixture', 'beta_access', 'active', null, now(),
  repeat('a', 64), jsonb_build_object('fixture', true)
);

select is((select active_count from public.operational_legacy_grant_preview('00000000-0000-4000-8000-000000000247')), 1, 'legacy preview counts active authority');
select is((select capabilities from public.operational_legacy_grant_preview('00000000-0000-4000-8000-000000000247')), array['beta_access']::text[], 'legacy preview returns only capability names');
select is(
  (select outcome from public.operational_legacy_grant_retire(
    '00000000-0000-4000-8000-000000000247', 'isaac-admin',
    'Classified legacy authority retired', 'isa-247-retire-legacy'
  )),
  'applied',
  'classified legacy authority is retired explicitly'
);
select is((select count(*)::integer from public.billing_access_grants where user_id = '00000000-0000-4000-8000-000000000247' and provider = 'legacy' and status = 'active'), 0, 'legacy grant no longer remains active');
select is((select retired_count from public.operational_legacy_grant_retirements where target_user_id = '00000000-0000-4000-8000-000000000247'), 1, 'retirement count is audited');
select is(
  (select outcome from public.operational_legacy_grant_retire(
    '00000000-0000-4000-8000-000000000247', 'isaac-admin',
    'Repeated retirement remains safe', 'isa-247-retire-repeat'
  )),
  'unchanged',
  'legacy retirement is idempotent'
);
select throws_ok(
  $$delete from public.operational_legacy_grant_retirements where target_user_id = '00000000-0000-4000-8000-000000000247'$$,
  'operational_access_audit_is_append_only',
  'legacy retirement audit is append-only'
);
select is((select source from public.user_entitlements where user_id = '00000000-0000-4000-8000-000000000247' and product_key = 'bundle'), 'billing_projection', 'retirement refreshes the derived commercial read model');

select is(
  (select outcome from public.operational_access_set(
    '00000000-0000-4000-8000-000000000247', 'tester', 'grant',
    'isaac-admin', 'Initial tester validation', 'isa-247-grant-tester', null
  )),
  'applied',
  'tester grant is applied'
);
select is((select count(*)::integer from public.operational_access_assignments where user_id = '00000000-0000-4000-8000-000000000247' and status = 'active'), 1, 'one active assignment exists');
select is((select role from public.operational_access_assignments where user_id = '00000000-0000-4000-8000-000000000247' and status = 'active'), 'tester', 'tester role is active');
select is((select expires_at from public.operational_access_assignments where user_id = '00000000-0000-4000-8000-000000000247' and status = 'active'), null, 'server assignment may be permanent');
select is((select granted_by from public.operational_access_assignments where user_id = '00000000-0000-4000-8000-000000000247' and status = 'active'), 'isaac-admin', 'grant actor is auditable');
select is((select count(*)::integer from public.operational_access_audit where target_user_id = '00000000-0000-4000-8000-000000000247'), 1, 'grant appends one audit row');

select is(
  (select outcome from public.operational_access_set(
    '00000000-0000-4000-8000-000000000247', 'tester', 'grant',
    'isaac-admin', 'Duplicate tester validation', 'isa-247-grant-tester-repeat', null
  )),
  'unchanged',
  'identical grant is idempotent'
);
select is((select count(*)::integer from public.operational_access_audit where target_user_id = '00000000-0000-4000-8000-000000000247'), 1, 'idempotent grant does not duplicate audit');

select is(
  (select outcome from public.operational_access_set(
    '00000000-0000-4000-8000-000000000247', 'nightly_tester', 'grant',
    'isaac-admin', 'Promote tester to Nightly', 'isa-247-promote-nightly', null
  )),
  'applied',
  'Nightly promotion is applied'
);
select is((select count(*)::integer from public.operational_access_assignments where user_id = '00000000-0000-4000-8000-000000000247' and status = 'active'), 1, 'role replacement preserves one active role');
select is((select role from public.operational_access_assignments where user_id = '00000000-0000-4000-8000-000000000247' and status = 'active'), 'nightly_tester', 'Nightly tester becomes active');
select is((select status from public.operational_access_assignments where user_id = '00000000-0000-4000-8000-000000000247' and role = 'tester'), 'revoked', 'previous tester role is revoked');
select is((select count(*)::integer from public.operational_access_audit where target_user_id = '00000000-0000-4000-8000-000000000247'), 3, 'replacement records revoke and grant');

select is(
  (select outcome from public.operational_access_set(
    '00000000-0000-4000-8000-000000000247', 'owner', 'grant',
    'isaac-admin', 'Assign designated Vantare owner', 'isa-247-grant-owner', null
  )),
  'applied',
  'owner assignment is applied'
);
select is((select role from public.operational_access_assignments where user_id = '00000000-0000-4000-8000-000000000247' and status = 'active'), 'owner', 'owner is the active role');
select is((select count(*)::integer from public.operational_access_assignments where user_id = '00000000-0000-4000-8000-000000000247' and status = 'active'), 1, 'owner remains the only active role');

select throws_ok(
  $$select * from public.operational_access_set('00000000-0000-4000-8000-000000000247','tester','grant','isaac-admin','Expired assignment','isa-247-expired',now() - interval '1 second')$$,
  'invalid_operational_access_request',
  'expired assignments fail closed'
);
select throws_ok(
  $$select * from public.operational_access_set('00000000-0000-4000-8000-000000000247','tester','grant','Isaac Admin','Invalid actor','isa-247-invalid-actor',null)$$,
  'invalid_operational_access_request',
  'unsanitized actor references are rejected'
);
select throws_ok(
  $$select * from public.operational_access_set('00000000-0000-4000-8000-000000000999','tester','grant','isaac-admin','Unknown account','isa-247-missing-user',null)$$,
  'operational_access_user_not_found',
  'unknown accounts cannot receive access'
);

select is(
  (select outcome from public.operational_access_set(
    '00000000-0000-4000-8000-000000000247', 'owner', 'revoke',
    'isaac-admin', 'Explicit owner revocation', 'isa-247-revoke-owner', null
  )),
  'applied',
  'owner revocation is applied'
);
select is((select count(*)::integer from public.operational_access_assignments where user_id = '00000000-0000-4000-8000-000000000247' and status = 'active'), 0, 'revocation removes active operational access');
select is((select count(*)::integer from public.operational_access_audit where target_user_id = '00000000-0000-4000-8000-000000000247'), 6, 'all grants and replacements are auditable');
select is(
  (select outcome from public.operational_access_set(
    '00000000-0000-4000-8000-000000000247', 'owner', 'revoke',
    'isaac-admin', 'Repeated owner revocation', 'isa-247-revoke-owner-repeat', null
  )),
  'unchanged',
  'repeated revocation is idempotent'
);
select is((select count(*)::integer from public.operational_access_audit where target_user_id = '00000000-0000-4000-8000-000000000247'), 6, 'idempotent revoke does not duplicate audit');
select throws_ok(
  $$update public.operational_access_audit set reason = 'Tampered audit' where target_user_id = '00000000-0000-4000-8000-000000000247'$$,
  'operational_access_audit_is_append_only',
  'audit rows cannot be edited'
);
select is((select count(*)::integer from public.operational_access_preview('00000000-0000-4000-8000-000000000247')), 3, 'preview returns the complete role history');

select * from finish();
rollback;
