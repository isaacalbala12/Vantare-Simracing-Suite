-- Execute after the 7b1 down migration on disposable PostgreSQL.
begin;
select no_plan();
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
select ok(has_table_privilege('service_role',c.oid,p.privilege),
 'original '||p.privilege||' restored on '||c.relname)
from pg_class c join pg_namespace n on n.oid=c.relnamespace
cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) p(privilege)
where n.nspname='public' and c.relname in (
 'testing_center_reports','testing_center_evidence',
 'testing_center_technical_issues','testing_center_screenshot_evidence',
 'testing_center_evidence_batches','testing_center_report_payloads',
 'testing_center_report_submission_keys','testing_center_report_events');
select ok(not has_table_privilege('service_role',c.oid,p.privilege),
 'original '||p.privilege||' remains absent on '||c.relname)
from pg_class c join pg_namespace n on n.oid=c.relnamespace
cross join (values ('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(privilege)
where n.nspname='public' and c.relname in (
 'testing_center_reports','testing_center_evidence',
 'testing_center_technical_issues','testing_center_screenshot_evidence',
 'testing_center_evidence_batches','testing_center_report_payloads',
 'testing_center_report_submission_keys','testing_center_report_events');
select ok(has_table_privilege('authenticated',
 'public.testing_center_report_payloads','select'),
 'authenticated keeps its original own-payload SELECT grant');
select * from finish();
rollback;
