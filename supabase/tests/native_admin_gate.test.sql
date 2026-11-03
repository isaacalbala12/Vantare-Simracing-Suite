begin;
select no_plan();
select ok(not has_function_privilege('anon','public.native_admin_gate()','execute'),
 'anonymous callers cannot spend the budget directly');
select ok(not has_function_privilege('authenticated','public.native_admin_gate()','execute'),
 'authenticated callers cannot spend the budget directly');
select ok(has_function_privilege('service_role','public.native_admin_gate()','execute'),
 'only backend can call gate');
select ok(not has_table_privilege('service_role','private.native_admin_gate_rate','select'),
 'backend has no direct budget reads');
select ok(not has_table_privilege('service_role','private.native_admin_gate_rate','update'),
 'backend cannot reset budget');
delete from private.native_admin_gate_rate;
set local role service_role;
-- A single SQL statement shares one statement_timestamp: no minute-boundary flake.
select is((select count(*)::integer from generate_series(1,125)
 where public.native_admin_gate()),120,'exactly first 120 calls pass in one minute');
reset role;
select is((select requests from private.native_admin_gate_rate),121,
 'rejected traffic saturates counter without overflow');
update private.native_admin_gate_rate set window_start=statement_timestamp()-interval '2 minutes';
set local role service_role;
select is(public.native_admin_gate(),true,'new minute restores capacity');
reset role;
select is((select requests from private.native_admin_gate_rate),1,'new minute starts at one');
select is((select count(*)::integer from private.native_admin_gate_rate),1,'one global row, no identity or token storage');
select ok(not has_function_privilege('anon','public.native_admin_preflight(text,text)','execute'),'preflight closed to anon');
select ok(not has_function_privilege('authenticated','public.native_admin_preflight(text,text)','execute'),'preflight closed to authenticated');
insert into private.clerk_issuers(issuer,authorized_parties,enabled)
 values('https://admin-preflight.invalid',array['https://app.invalid'],true);
insert into public.profiles(id) values('00000000-0000-4000-8000-000000001910');
insert into public.account_identities(issuer,subject,account_id)
 values('https://admin-preflight.invalid','user_preflight','00000000-0000-4000-8000-000000001910');
create temp table preflight_counts as select (select count(*) from public.profiles) profiles,(select count(*) from public.account_identities) identities;
select throws_ok($$select public.native_admin_preflight('https://admin-preflight.invalid','user_unmapped')$$,'42501','native_admin_forbidden','unmapped JWT is denied');
select is((select count(*) from public.profiles),(select profiles from preflight_counts),'unknown JWT creates no profile');
select is((select count(*) from public.account_identities),(select identities from preflight_counts),'unknown JWT creates no identity');
select throws_ok($$select public.native_admin_preflight('https://admin-preflight.invalid','user_preflight')$$,'42501','native_admin_forbidden','registered non-owner is denied');
select * from public.operational_access_set('00000000-0000-4000-8000-000000001910','owner','grant','test:r10-preflight','Preflight test','test:r10-preflight',null);
select is(public.native_admin_preflight('https://admin-preflight.invalid','user_preflight'),'00000000-0000-4000-8000-000000001910'::uuid,'owner lookup returns existing UUID');
select is((select requests from private.native_admin_gate_rate),1,'owner preflight consumes no global budget');
update public.operational_access_assignments set granted_at=now()-interval '1 day', expires_at=now()-interval '1 minute' where user_id='00000000-0000-4000-8000-000000001910' and role='owner';
select throws_ok($$select public.native_admin_preflight('https://admin-preflight.invalid','user_preflight')$$,'42501','native_admin_forbidden','expired owner denied before budget');
update public.operational_access_assignments set expires_at=null where user_id='00000000-0000-4000-8000-000000001910' and role='owner';
update public.account_identities set deleted_at=now() where account_id='00000000-0000-4000-8000-000000001910';
select throws_ok($$select public.native_admin_preflight('https://admin-preflight.invalid','user_preflight')$$,'42501','native_admin_forbidden','deleted identity denied before budget');
select * from finish();
rollback;
