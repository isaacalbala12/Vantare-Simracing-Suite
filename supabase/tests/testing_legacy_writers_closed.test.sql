-- VANTA-131 7b1: the writer grants characterized in the first commit are closed.
begin;
select plan(13);
select ok(not has_function_privilege('service_role',
 'public.testing_center_report_submit_admitted(uuid,text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text,uuid)',
 'execute'),'service_role cannot submit a legacy report');
select ok(not has_function_privilege('service_role',
 'public.testing_center_triage_report(text)','execute'),
 'service_role cannot mutate a legacy report through triage');
select ok(not has_function_privilege('service_role',
 'public.testing_center_submit_report(text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text)',
 'execute'),'old simple writer is already closed');
select ok(not has_function_privilege('service_role',
 'public.testing_center_submit_report_with_evidence(text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text,uuid)',
 'execute'),'old evidence writer is already closed');
select ok(not has_function_privilege('anon',
 'public.testing_center_report_submit_admitted(uuid,text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text,uuid)',
 'execute'),'anonymous cannot submit through the admitted adapter');
select ok(not has_function_privilege('authenticated',
 'public.testing_center_report_submit_admitted(uuid,text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text,uuid)',
 'execute'),'authenticated cannot submit through the admitted adapter');
select ok(not has_table_privilege('service_role','public.testing_center_reports','insert'),
 'service_role has no direct legacy INSERT');
select ok(not has_table_privilege('service_role','public.testing_center_reports','update'),
 'service_role has no direct legacy UPDATE');
select ok(not has_table_privilege('service_role','public.testing_center_reports','delete'),
 'service_role has no direct legacy DELETE');
select ok(has_table_privilege('service_role','public.testing_center_reports','select'),
 'service_role can still read legacy history for mapping');
select ok(not has_table_privilege('anon','public.testing_center_reports','insert'),
 'anonymous cannot insert directly');
select ok(not has_table_privilege('authenticated','public.testing_center_reports','insert'),
 'authenticated cannot insert directly');
set local role service_role;
select throws_ok($$insert into public.testing_center_reports(report_id) values('abuse')$$,
 '42501',null,'service_role cannot bypass RPC closure with direct INSERT');
reset role;
select * from finish();
rollback;
