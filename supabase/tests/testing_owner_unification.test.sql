-- VANTA-131 step 8 characterization: operational owner and Testing Center owner diverge.
-- Run against disposable PostgreSQL after the current migrations.
begin;
select no_plan();
insert into private.clerk_issuers(issuer,authorized_parties,enabled) values
 ('https://owner-vanta131.clerk.invalid',array['https://app.invalid'],true);
insert into public.profiles(id) values
 ('13100000-0000-4000-8000-000000000001'),
 ('13100000-0000-4000-8000-000000000002'),
 ('13100000-0000-4000-8000-000000000003');
insert into public.account_identities(issuer,subject,account_id) values
 ('https://owner-vanta131.clerk.invalid','user_aaaaaaaaaaaaaaaaaaaaaaaaaaa','13100000-0000-4000-8000-000000000001'),
 ('https://owner-vanta131.clerk.invalid','user_bbbbbbbbbbbbbbbbbbbbbbbbbbb','13100000-0000-4000-8000-000000000002'),
 ('https://owner-vanta131.clerk.invalid','user_ccccccccccccccccccccccccccc','13100000-0000-4000-8000-000000000003');
select * from public.operational_access_set(
 '13100000-0000-4000-8000-000000000001','owner','grant',
 'test:vanta131','Owner characterization','test:vanta131-owner',null);
insert into public.testing_center_memberships(user_id,actor_id,role) values
 ('13100000-0000-4000-8000-000000000002','vanta131-legacy-owner','owner');
select ok(public.is_active_owner('13100000-0000-4000-8000-000000000001'),
 'calendar recognizes operational owner A');
select ok(not public.is_active_owner('13100000-0000-4000-8000-000000000002'),
 'calendar does not recognize membership-only owner B');
select lives_ok($$select private.native_admin_require_owner('13100000-0000-4000-8000-000000000001')$$,
 'admin recognizes operational owner A');
select throws_ok($$select private.native_admin_require_owner('13100000-0000-4000-8000-000000000002')$$,
 '42501','native_admin_forbidden','admin rejects membership-only owner B');
select set_config('request.jwt.claims',
 '{"iss":"https://owner-vanta131.clerk.invalid","sub":"user_aaaaaaaaaaaaaaaaaaaaaaaaaaa","role":"authenticated","sid":"sess_owner_a","azp":"https://app.invalid"}',true);
set local role authenticated;
select is(public.testing_center_current_role(),null::text,
 'Testing Center does not recognize operational owner A without membership');
reset role;
select set_config('request.jwt.claims',
 '{"iss":"https://owner-vanta131.clerk.invalid","sub":"user_bbbbbbbbbbbbbbbbbbbbbbbbbbb","role":"authenticated","sid":"sess_owner_b","azp":"https://app.invalid"}',true);
set local role authenticated;
select is(public.testing_center_current_role(),'owner',
 'Testing Center recognizes membership-only owner B');
select ok(not has_function_privilege('anon','public.is_active_owner(uuid)','execute'),
 'anonymous cannot query calendar owner oracle');
reset role;
select * from finish();
rollback;
