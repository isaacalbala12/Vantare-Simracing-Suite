-- VANTA-131 7b1 characterization before closing legacy report writers.
begin;
select plan(11);
select ok(has_function_privilege('service_role',
 'public.testing_center_report_submit_admitted(uuid,text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text,uuid)',
 'execute'),'service_role can still submit a legacy report');
select ok(has_function_privilege('service_role',
 'public.testing_center_triage_report(text)','execute'),
 'service_role can still mutate a legacy report through triage');
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
select ok(has_table_privilege('service_role','public.testing_center_reports','insert'),
 'service_role still has direct legacy INSERT');
select ok(has_table_privilege('service_role','public.testing_center_reports','update'),
 'service_role still has direct legacy UPDATE');
select ok(has_table_privilege('service_role','public.testing_center_reports','delete'),
 'service_role still has direct legacy DELETE');
select ok(not has_table_privilege('anon','public.testing_center_reports','insert'),
 'anonymous cannot insert directly');
select ok(not has_table_privilege('authenticated','public.testing_center_reports','insert'),
 'authenticated cannot insert directly');
select * from finish();
rollback;
