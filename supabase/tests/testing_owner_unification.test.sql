-- VANTA-131 step 8: the matrix characterized in the first commit now agrees.
-- B is a membership-only owner created after the backfill; it has no authority.
begin;
select plan(23);
insert into private.clerk_issuers(issuer,authorized_parties,enabled) values
 ('https://owner-vanta131.clerk.invalid',array['https://app.invalid'],true);
insert into public.profiles(id) values
 ('13100000-0000-4000-8000-000000000001'),
 ('13100000-0000-4000-8000-000000000002'),
 ('13100000-0000-4000-8000-000000000003'),
 ('13100000-0000-4000-8000-000000000004');
insert into public.account_identities(issuer,subject,account_id) values
 ('https://owner-vanta131.clerk.invalid','user_aaaaaaaaaaaaaaaaaaaaaaaaaaa','13100000-0000-4000-8000-000000000001'),
 ('https://owner-vanta131.clerk.invalid','user_bbbbbbbbbbbbbbbbbbbbbbbbbbb','13100000-0000-4000-8000-000000000002'),
 ('https://owner-vanta131.clerk.invalid','user_ccccccccccccccccccccccccccc','13100000-0000-4000-8000-000000000003'),
 ('https://owner-vanta131.clerk.invalid','user_ddddddddddddddddddddddddddd','13100000-0000-4000-8000-000000000004');
select * from public.operational_access_set(
 '13100000-0000-4000-8000-000000000001','owner','grant',
 'test:vanta131','Owner characterization','test:vanta131-owner',null);
insert into public.testing_center_memberships(user_id,actor_id,role) values
 ('13100000-0000-4000-8000-000000000002','vanta131-legacy-owner','owner'),
 ('13100000-0000-4000-8000-000000000004','vanta131-revoked-owner','owner');
select * from public.operational_access_set(
 '13100000-0000-4000-8000-000000000004','owner','grant',
 'test:vanta131','Revoked owner characterization','test:vanta131-revoked-grant',null);
select * from public.operational_access_set(
 '13100000-0000-4000-8000-000000000004','owner','revoke',
 'test:vanta131','Revoked owner characterization','test:vanta131-revoked-revoke',null);
select ok(private.is_owner('13100000-0000-4000-8000-000000000001'),
 'one owner authority recognizes operational owner A');
select ok(not private.is_owner('13100000-0000-4000-8000-000000000002'),
 'membership-only owner B is not an operational owner');
select ok(not private.is_owner('13100000-0000-4000-8000-000000000003'),
 'account without membership or assignment is not owner');
select ok(not private.is_owner('13100000-0000-4000-8000-000000000004'),
 'revoked assignment beats stale owner membership');
select ok(to_regprocedure('public.is_active_owner(uuid)') is null,
 'public owner oracle is retired');
select ok(not has_function_privilege('authenticated','private.is_owner(uuid)','execute'),
 'arbitrary account lookup is private');
select ok(not has_function_privilege('anon','private.is_owner(uuid)','execute'),
 'anonymous cannot call the private owner oracle');
select ok(not has_function_privilege('service_role','private.is_owner(uuid)','execute'),
 'service role cannot call the private owner oracle directly');
update public.operational_access_assignments
 set granted_at=now()-interval '2 seconds', expires_at=now()-interval '1 second'
 where user_id='13100000-0000-4000-8000-000000000001' and role='owner';
select ok(not private.is_owner('13100000-0000-4000-8000-000000000001'),
 'expired owner assignment has no authority');
update public.operational_access_assignments set expires_at=null
 where user_id='13100000-0000-4000-8000-000000000001' and role='owner';
select lives_ok($$select private.native_admin_require_owner('13100000-0000-4000-8000-000000000001')$$,
 'admin recognizes operational owner A');
select throws_ok($$select private.native_admin_require_owner('13100000-0000-4000-8000-000000000002')$$,
 '42501','native_admin_forbidden','admin rejects membership-only owner B');
select set_config('request.jwt.claims',
 '{"iss":"https://owner-vanta131.clerk.invalid","sub":"user_aaaaaaaaaaaaaaaaaaaaaaaaaaa","role":"authenticated","sid":"sess_owner_a","azp":"https://app.invalid"}',true);
set local role authenticated;
select is(public.testing_center_current_role(),'owner',
 'Testing Center recognizes operational owner A without membership');
select is(jsonb_array_length(public.testing_report_patch_candidates('1.2.3')),0,
 'operational owner can inspect patch candidates');
reset role;
set local role service_role;
select lives_ok($$select public.race_schedule_draft_save('Owner fixture','{}',now(),1)$$,
 'operational owner A can save a calendar draft');
select is((select count(*)::integer from public.race_schedule_my_draft()),1,
 'operational owner A can read its calendar draft');
reset role;
select set_config('request.jwt.claims',
 '{"iss":"https://owner-vanta131.clerk.invalid","sub":"user_bbbbbbbbbbbbbbbbbbbbbbbbbbb","role":"authenticated","sid":"sess_owner_b","azp":"https://app.invalid"}',true);
set local role authenticated;
select is(public.testing_center_current_role(),null::text,
 'Testing Center rejects membership-only owner B');
select throws_ok($$select public.testing_report_patch_candidates('1.2.3')$$,
 '42501','testing_owner_required','membership-only account cannot inspect fixes');
select throws_ok($$select public.testing_report_fixed('13100000-0000-4000-8000-000000000099',
 '1.2.3','Review','Summary')$$,'42501','testing_owner_required',
 'membership-only account cannot mark a report fixed');
select ok(not has_function_privilege('anon','public.testing_center_current_role()','execute'),
 'anonymous cannot inspect Testing Center role');
reset role;
set local role service_role;
select throws_ok($$select public.race_schedule_draft_save('Denied fixture','{}',now(),1)$$,
 'P0001','owner role required to import a race schedule',
 'membership-only owner B cannot save a calendar draft');
reset role;
select set_config('request.jwt.claims',
 '{"iss":"https://owner-vanta131.clerk.invalid","sub":"user_ccccccccccccccccccccccccccc","role":"authenticated","sid":"sess_owner_c","azp":"https://app.invalid"}',true);
set local role authenticated;
select is(public.testing_center_current_role(),null::text,
 'account C without membership or assignment has no owner role');
select throws_ok($$select public.testing_report_patch_candidates('1.2.3')$$,
 '42501','testing_owner_required','account C cannot inspect fixes');
reset role;
select set_config('request.jwt.claims',
 '{"iss":"https://owner-vanta131.clerk.invalid","sub":"user_ddddddddddddddddddddddddddd","role":"authenticated","sid":"sess_owner_d","azp":"https://app.invalid"}',true);
set local role authenticated;
select is(public.testing_center_current_role(),null::text,
 'revoked operational owner D cannot regain Testing Center role from membership');
reset role;
select * from finish();
rollback;
