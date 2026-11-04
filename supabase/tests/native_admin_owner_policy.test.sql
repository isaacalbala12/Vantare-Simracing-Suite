-- Step 4: one operational owner predicate; disposable identities only.
begin;
select no_plan();
insert into private.clerk_issuers(issuer,authorized_parties,enabled)
 values('https://admin-policy.invalid',array['https://app.invalid'],true);
insert into public.profiles(id)
 select ('19104400-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,7)n;
select * from public.operational_access_set('19104400-0000-4000-8000-000000000001','owner','grant','test:policy','Owner policy fixture','policy-actor',null);
select * from public.operational_access_set('19104400-0000-4000-8000-000000000002','owner','grant','test:policy','Owner policy fixture','policy-active',now()+interval '1 day');
select * from public.operational_access_set('19104400-0000-4000-8000-000000000003','owner','grant','test:policy','Owner policy fixture','policy-expired',null);
select * from public.operational_access_set('19104400-0000-4000-8000-000000000004','owner','grant','test:policy','Owner policy fixture','policy-revoked',null);
select * from public.operational_access_set('19104400-0000-4000-8000-000000000004','owner','revoke','test:policy','Owner policy fixture','policy-revoke',null);
select * from public.operational_access_set('19104400-0000-4000-8000-000000000007','owner','grant','test:policy','Owner policy fixture','policy-deletion',null);
update public.operational_access_assignments set granted_at=now()-interval '2 days',expires_at=now()-interval '1 day'
 where user_id in('19104400-0000-4000-8000-000000000003','19104400-0000-4000-8000-000000000007');
insert into public.testing_center_memberships(user_id,actor_id,role) values
 ('19104400-0000-4000-8000-000000000001','fixture-policy-actor','owner'),
 ('19104400-0000-4000-8000-000000000005','fixture-policy-legacy','owner');
create function pg_temp.policy(action text, target text, params jsonb default '{}'::jsonb)
 returns jsonb language sql as $$select public.native_admin_execute(
 '19104400-0000-4000-8000-000000000001','https://admin-policy.invalid',action,
 params||jsonb_build_object('account_id',target),'sandbox')$$;
select lives_ok($$select pg_temp.policy('set_tester','19104400-0000-4000-8000-000000000002','{"enabled":true}')$$,'active owner tester enable remains safe');
select lives_ok($$select pg_temp.policy('set_tester','19104400-0000-4000-8000-000000000002','{"enabled":false}')$$,'active owner tester disable remains safe');
select ok(private.is_owner('19104400-0000-4000-8000-000000000002'),'tester toggle preserves operational owner');
select is((select count(*)::integer from public.testing_center_memberships where user_id='19104400-0000-4000-8000-000000000002'),0,'tester toggle never creates a second owner authority');
update public.testing_center_memberships set updated_at=now()-interval '1 day' where user_id='19104400-0000-4000-8000-000000000001';
create temporary table policy_membership_before as select to_jsonb(m) data from public.testing_center_memberships m where user_id='19104400-0000-4000-8000-000000000001';
select pg_temp.policy('set_tester','19104400-0000-4000-8000-000000000001','{"enabled":true}');
select is((select to_jsonb(m) from public.testing_center_memberships m where user_id='19104400-0000-4000-8000-000000000001'),(select data from policy_membership_before),'existing legacy owner membership is not rewritten');
select is((private.native_admin_account_summary('19104400-0000-4000-8000-000000000002','https://admin-policy.invalid','sandbox')->>'owner')::boolean,true,'client sees live operational owner');
select is((private.native_admin_account_summary('19104400-0000-4000-8000-000000000003','https://admin-policy.invalid','sandbox')->>'owner')::boolean,false,'client no longer sees expired owner');
select throws_ok($$select pg_temp.policy('set_blocked','19104400-0000-4000-8000-000000000002','{"blocked":true}')$$,'55000','native_admin_owner_conflict','live owner remains protected');
select throws_ok($$select pg_temp.policy('set_blocked','19104400-0000-4000-8000-000000000001','{"blocked":true}')$$,'55000','native_admin_owner_conflict','self protection remains');
select lives_ok($$select pg_temp.policy('set_blocked','19104400-0000-4000-8000-000000000003','{"blocked":true}')$$,'expired owner target can be blocked by a live owner');
select is((select blocked from private.admin_account_blocks where account_id='19104400-0000-4000-8000-000000000003'),true,'expired owner block persisted');
select lives_ok($$select pg_temp.policy('set_blocked','19104400-0000-4000-8000-000000000004','{"blocked":true}')$$,'revoked owner target can be blocked');
select lives_ok($$select pg_temp.policy('set_blocked','19104400-0000-4000-8000-000000000005','{"blocked":true}')$$,'legacy membership grants no owner protection');
select throws_ok($$select pg_temp.policy('get_account_deletion','19104400-0000-4000-8000-000000000002',jsonb_build_object('confirmation_hash',repeat('a',64)))$$,'55000','native_admin_owner_conflict','live owner cannot be deleted');
select lives_ok($$select pg_temp.policy('get_account_deletion','19104400-0000-4000-8000-000000000007',jsonb_build_object('confirmation_hash',repeat('a',64)))$$,'expired owner is not protected from deletion lookup');
select throws_ok($$select pg_temp.policy('set_tester','19104400-0000-4000-8000-000000000003','{"enabled":true}')$$,'55000','native_admin_owner_conflict','existing expired-role replacement safeguard preserved');
select lives_ok($$select pg_temp.policy('set_tester','19104400-0000-4000-8000-000000000006','{"enabled":true}')$$,'ordinary tester grant preserved');
select is((select role from public.testing_center_memberships where user_id='19104400-0000-4000-8000-000000000006'),'tester','tester role remains tester');
select lives_ok($$select pg_temp.policy('set_tester','19104400-0000-4000-8000-000000000006','{"enabled":false}')$$,'ordinary tester revoke preserved');
select is((select active from public.testing_center_memberships where user_id='19104400-0000-4000-8000-000000000006'),false,'tester membership deactivated');
select throws_ok($$select private.native_admin_require_owner('19104400-0000-4000-8000-000000000003')$$,'42501','native_admin_forbidden','expired actor rejected');
select throws_ok($$select private.native_admin_require_owner('19104400-0000-4000-8000-000000000004')$$,'42501','native_admin_forbidden','revoked actor rejected');
select throws_ok($$select private.native_admin_require_owner('19104400-0000-4000-8000-000000000005')$$,'42501','native_admin_forbidden','legacy-only actor rejected');
select throws_ok($$select private.native_admin_require_owner('19104400-0000-4000-8000-000000000006')$$,'42501','native_admin_forbidden','tester actor rejected');
select throws_ok($$select private.native_admin_require_owner(null)$$,'42501','native_admin_forbidden','missing actor rejected');
select throws_ok($$select private.native_admin_require_owner('garbage'::uuid)$$,'22P02',null,'garbage identity rejected');
select * from finish();
rollback;
