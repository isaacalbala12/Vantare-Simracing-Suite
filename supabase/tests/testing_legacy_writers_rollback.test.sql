-- Execute after the 7b1 down migration on disposable PostgreSQL.
begin;
select plan(8);
select ok(has_function_privilege('service_role',
 'public.testing_center_report_submit_admitted(uuid,text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text,uuid)',
 'execute'),'admitted service adapter restored');
select ok(has_function_privilege('service_role','public.testing_center_triage_report(text)','execute'),
 'triage adapter restored');
select ok(has_table_privilege('service_role','public.testing_center_reports','insert'),
 'service direct insert restored');
select ok(has_table_privilege('service_role','public.testing_center_reports','update'),
 'service direct update restored');
select ok(has_table_privilege('service_role','public.testing_center_reports','delete'),
 'service direct delete restored');
select ok(not has_function_privilege('anon',
 'public.testing_center_report_submit_admitted(uuid,text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text,uuid)',
 'execute'),'anon stays closed');
select ok(not has_function_privilege('authenticated',
 'public.testing_center_report_submit_admitted(uuid,text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text,uuid)',
 'execute'),'authenticated stays closed');
select ok(not has_function_privilege('service_role',
 'public.testing_center_submit_report(text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text)',
 'execute'),'older wrapper remains closed');
select * from finish();
rollback;
