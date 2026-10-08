begin;
select plan(23);
insert into private.clerk_issuers(issuer, authorized_parties, enabled)
values ('https://clerk.sandbox.invalid', array['https://purchase.sandbox.invalid'], true);

select is((select count(*)::integer from pg_constraint c join pg_class t on t.oid=c.conrelid
  join pg_namespace n on n.oid=t.relnamespace
  where c.contype='f' and c.confrelid='auth.users'::regclass and n.nspname='public'), 0,
  'no product FK references Supabase Auth');
select is((select count(*)::integer from pg_policies where schemaname in ('public','storage')
  and (coalesce(qual,'') like '%auth.uid()%' or coalesce(with_check,'') like '%auth.uid()%')), 0,
  'all active RLS uses internal UUID');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prosrc like '%auth.uid()%'), 0, 'all public RPCs use internal UUID');
select ok(not has_function_privilege('anon', 'public.clerk_bootstrap_account()', 'execute'), 'anonymous bootstrap denied');
select ok(not has_table_privilege('authenticated', 'public.account_identities', 'select'), 'mapping is private');
select ok(not has_function_privilege('authenticated',
  'public.apply_clerk_user_event(text,text,text,text,text,timestamptz,text)', 'execute'), 'user cannot forge webhooks');

set local role authenticated;
select set_config('request.jwt.claims', '{"iss":"https://clerk.sandbox.invalid","sub":"user_first","sid":"sess_test","azp":"https://purchase.sandbox.invalid","role":"authenticated"}', true);
select is(private.current_account(), null::uuid, 'RLS does not create identity');
select set_config('test.first_account', public.clerk_bootstrap_account()::text, true);
select is(public.clerk_bootstrap_account()::text, current_setting('test.first_account'), 'bootstrap idempotent');
select is(private.current_account()::text, current_setting('test.first_account'), 'RLS returns bootstrap UUID');
select is((select count(*)::integer from public.profiles), 1, 'user sees only own profile');
select set_config('request.jwt.claims', '{"iss":"https://clerk.sandbox.invalid","sub":"user_second","sid":"sess_test","azp":"https://purchase.sandbox.invalid","role":"authenticated"}', true);
select set_config('test.second_account', public.clerk_bootstrap_account()::text, true);
select isnt(current_setting('test.first_account'), current_setting('test.second_account'), 'separate Clerk users have separate UUIDs');
select is((select count(*)::integer from public.profiles), 1, 'second user cannot read first user');
select set_config('request.jwt.claims', '{"iss":"https://wrong.invalid","sub":"user_first","sid":"sess_test","azp":"https://purchase.sandbox.invalid","role":"authenticated"}', true);
select throws_ok('select public.clerk_bootstrap_account()', '28000', 'invalid_clerk_session', 'wrong issuer rejected');
select set_config('request.jwt.claims', '{"iss":"https://clerk.sandbox.invalid","sub":"user_first","sid":"sess_test","azp":"https://evil.invalid","role":"authenticated"}', true);
select throws_ok('select public.clerk_bootstrap_account()', '28000', 'invalid_clerk_session', 'wrong authorized party rejected');
select set_config('request.jwt.claims', '{"iss":"https://clerk.sandbox.invalid","sub":"user_first","azp":"https://purchase.sandbox.invalid","role":"authenticated"}', true);
select throws_ok('select public.clerk_bootstrap_account()', '28000', 'invalid_clerk_session', 'OAuth is not a session JWT');
reset role;

select is(public.apply_clerk_user_event('msg_create', repeat('a',64), 'https://clerk.sandbox.invalid',
  'user_first', 'user.created', '2026-10-08T10:00:00Z', 'verified@example.invalid'), 'applied', 'signed create applies');
select is(public.apply_clerk_user_event('msg_create', repeat('a',64), 'https://clerk.sandbox.invalid',
  'user_first', 'user.created', '2026-10-08T10:00:00Z', 'verified@example.invalid'), 'unchanged', 'delivery duplicate has no effect');
select throws_ok($$select public.apply_clerk_user_event('msg_create', repeat('b',64), 'https://clerk.sandbox.invalid',
  'user_first', 'user.created', '2026-10-08T10:00:00Z', null)$$, 'P0001', 'clerk_event_conflict', 'same ID with different body rejected');
select is(public.apply_clerk_user_event('msg_delete', repeat('c',64), 'https://clerk.sandbox.invalid',
  'user_first', 'user.deleted', '2026-10-08T11:00:00Z', null), 'applied', 'delete applies atomically');
select is((select email from public.profiles where id=current_setting('test.first_account')::uuid), null::text, 'profile PII removed');
select is(public.apply_clerk_user_event('msg_late_create', repeat('d',64), 'https://clerk.sandbox.invalid',
  'user_first', 'user.created', '2026-10-08T12:00:00Z', 'late@example.invalid'), 'ignored', 'late create cannot resurrect tombstone');
set local role authenticated;
select set_config('request.jwt.claims', '{"iss":"https://clerk.sandbox.invalid","sub":"user_first","sid":"sess_test","azp":"https://purchase.sandbox.invalid","role":"authenticated"}', true);
select throws_ok('select public.clerk_bootstrap_account()', '28000', 'account_deleted', 'late session cannot reprovision deleted user');
reset role;
select is((select count(*)::integer from auth.users), 0, 'no shadow Supabase Auth user created');
select * from finish();
rollback;
