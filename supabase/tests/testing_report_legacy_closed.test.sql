-- #1709 phase 2. A legitimate tester would have succeeded before the close.
begin;
select no_plan();
insert into private.clerk_issuers(issuer,authorized_parties,enabled)
 values('https://closed-1709.clerk.invalid',array['https://app.invalid'],true);
insert into public.profiles(id) values('17090000-0000-4000-8000-000000000090');
insert into public.account_identities(issuer,subject,account_id)
 values('https://closed-1709.clerk.invalid','user_ccccccccccccccccccccccccccc','17090000-0000-4000-8000-000000000090');
insert into public.testing_center_memberships(user_id,actor_id,role)
 values('17090000-0000-4000-8000-000000000090','tester-1709-closed','tester');
-- B03/B01 require Clerk session ids matching ^sess_[a-zA-Z0-9_]+$.
-- An invalid sid would make current_account() NULL even with every barrier.
select set_config('request.jwt.claims','{"iss":"https://closed-1709.clerk.invalid","sub":"user_ccccccccccccccccccccccccccc","role":"authenticated","sid":"sess_fixture","azp":"https://app.invalid"}',true);

select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('testing_center_submit_report',
 'testing_center_submit_report_with_evidence','testing_center_submit_report_without_transport_size')),3,'all three legacy signatures remain accounted for');
-- Includes PUBLIC inheritance and any overload: no open wrapper or inner alias.
select ok(not has_function_privilege(r.rolname,p.oid,'execute'),r.rolname||' denied '||p.oid::regprocedure)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join pg_roles r
where n.nspname='public' and p.proname in ('testing_center_submit_report',
 'testing_center_submit_report_with_evidence','testing_center_submit_report_without_transport_size')
 and r.rolname in ('anon','authenticated','service_role');

set local role authenticated;
select is(private.current_account(),'17090000-0000-4000-8000-000000000090'::uuid,'fixture is a valid bound client identity');
select throws_ok($$select public.testing_center_submit_report('testing-center.v1','testers',
 'Informe estructurado','Revisión humana pendiente','Revisión humana pendiente','',
 '1.2.3','windows','Windows 11','hub',false,false,null,null,'draft_'||repeat('d',64))$$,
 '42501',null,'legitimate tester is denied direct legacy report');
select throws_ok($$select public.testing_center_submit_report_with_evidence('testing-center.v1','testers',
 'Informe estructurado','Revisión humana pendiente','Revisión humana pendiente','',
 '1.2.3','windows','Windows 11','hub',false,false,null,null,'draft_'||repeat('d',64),
 '17090000-0000-4000-8000-000000000091')$$,
 '42501',null,'legacy evidence wrapper denied too');
select throws_ok($$select public.testing_center_submit_report_without_transport_size('testing-center.v1','testers',
 'Informe estructurado','Revisión humana pendiente','Revisión humana pendiente','',
 '1.2.3','windows','Windows 11','hub',false,false,null,null,'draft_'||repeat('d',64))$$,
 '42501',null,'legacy inner alias cannot bypass admission');
reset role;
select ok(has_function_privilege('authenticated','public.testing_center_prepare_screenshot_batch(text,text,text,jsonb)','execute'), 'preparing screenshots remains possible');
select ok(has_function_privilege('authenticated','public.testing_center_finalize_screenshot(uuid,uuid)','execute'), 'finalizing screenshots remains possible');
select is((select count(*)::integer from public.testing_center_reports
 where reporter_user_id='17090000-0000-4000-8000-000000000090'),0,'no report written through closed routes');
select * from finish();
rollback;
