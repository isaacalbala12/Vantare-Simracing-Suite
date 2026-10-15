-- Containment only: no trusted IP admission exists in this candidate.
-- All direct attempts must be denied, including retries and spoofed headers.
begin;
select plan(17);
insert into public.profiles(id) values
 ('16100000-0000-0000-0000-000000000001'),('16100000-0000-0000-0000-000000000002');
set local role authenticated;
set local request.headers='{"x-forwarded-for":"192.0.2.10"}';
set local request.jwt.claim.sub='16100000-0000-0000-0000-000000000001';
select throws_ok(format('select public.testing_report_submit(%L,''master'',''Synthetic'',''Synthetic'',true)',
 ('16100000-0000-0000-0000-00000000001'||i::text)::uuid),'42501',null,'first account direct submit closed') from generate_series(1,5) i;
set local request.jwt.claim.sub='16100000-0000-0000-0000-000000000002';
select throws_ok(format('select public.testing_report_submit(%L,''master'',''Synthetic'',''Synthetic'',true)',
 ('16100000-0000-0000-0000-00000000002'||i::text)::uuid),'42501',null,'second account on same IP cannot reset admission') from generate_series(1,5) i;
set local request.jwt.claim.sub='16100000-0000-0000-0000-000000000001';
set local request.headers='{"x-forwarded-for":"192.0.2.11"}';
select throws_ok($$select public.testing_report_submit('16100000-0000-0000-0000-000000000011','master','Synthetic','Synthetic',true)$$,'42501',null,'exact retry from another IP still closed');
set local request.headers='{"x-forwarded-for":"192.0.2.12","x-vantare-admitted":"true"}';
select throws_ok($$select public.testing_report_submit('16100000-0000-0000-0000-000000000011','master','Synthetic','Synthetic',true)$$,'42501',null,'client cannot assert trusted admission');
select ok(not has_function_privilege('authenticated','public.testing_report_submit(uuid,text,text,text,boolean)','execute'),'no public direct execute');
select ok(not has_function_privilege('service_role','public.testing_report_submit(uuid,text,text,text,boolean)','execute'),'service key cannot reopen submit');
select ok(not has_function_privilege('anon','public.testing_report_submit(uuid,text,text,text,boolean)','execute'),'anon closed');
select ok(case when to_regprocedure('public.testing_contribution_submit_v2(uuid,text,text,text,jsonb,jsonb)') is null then true
 else not has_function_privilege('authenticated','public.testing_contribution_submit_v2(uuid,text,text,text,jsonb,jsonb)','execute') end,'pending v2 cannot bypass admission either');
reset role;
select is((select count(*)::integer from public.testing_contributions),0,'unadmitted attempts cannot create reports across accounts');
select * from finish();
rollback;
