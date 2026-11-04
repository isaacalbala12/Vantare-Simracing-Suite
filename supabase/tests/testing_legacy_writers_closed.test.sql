-- VANTA-131 7b1: the writer grants characterized in the first commit are closed.
begin;
select no_plan();
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
select ok(has_table_privilege('service_role',c.oid,'select'),
 'service_role keeps SELECT on '||c.relname)
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in (
 'testing_center_evidence','testing_center_technical_issues',
 'testing_center_screenshot_evidence','testing_center_evidence_batches',
 'testing_center_report_payloads','testing_center_report_submission_keys',
 'testing_center_report_events');
select ok(not has_table_privilege(r.rolname,c.oid,'select'),
 r.rolname||' has no SELECT on '||c.relname)
from pg_class c join pg_namespace n on n.oid=c.relnamespace
cross join pg_roles r
where n.nspname='public' and c.relname in (
 'testing_center_screenshot_evidence','testing_center_evidence_batches',
 'testing_center_report_submission_keys','testing_center_report_events')
and r.rolname in ('anon','authenticated');
select ok(not has_table_privilege('anon','public.testing_center_reports','insert'),
 'anonymous cannot insert directly');
select ok(not has_table_privilege('authenticated','public.testing_center_reports','insert'),
 'authenticated cannot insert directly');
select ok(has_table_privilege('authenticated',c.oid,'select'),
 'existing authenticated history read preserved on '||c.relname)
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in (
 'testing_center_reports','testing_center_evidence',
 'testing_center_technical_issues','testing_center_report_payloads');
select ok(not has_function_privilege(r.rolname,p.oid,'execute'),
 r.rolname||' denied '||p.oid::regprocedure)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join pg_roles r
where n.nspname='public' and p.proname in (
 'testing_center_report_submit_admitted','testing_center_triage_report',
 'testing_center_submit_report','testing_center_submit_report_with_evidence',
 'testing_center_submit_report_without_transport_size',
 'testing_center_prepare_screenshot_batch','testing_center_finalize_screenshot')
and r.rolname in ('anon','authenticated','service_role','vantare_triage');
select ok(not has_table_privilege(r.rolname,c.oid,p.privilege),
 r.rolname||' denied '||p.privilege||' on '||c.relname)
from pg_class c join pg_namespace n on n.oid=c.relnamespace
cross join pg_roles r
cross join (values ('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),
 ('REFERENCES'),('TRIGGER')) p(privilege)
where n.nspname='public' and c.relname in (
 'testing_center_reports','testing_center_evidence',
 'testing_center_technical_issues','testing_center_screenshot_evidence',
 'testing_center_evidence_batches','testing_center_report_payloads',
 'testing_center_report_submission_keys','testing_center_report_events')
and r.rolname in ('anon','authenticated','service_role','vantare_triage');
select ok(not exists (
 select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
 where n.nspname='public' and c.relname in (
  'testing_center_reports','testing_center_evidence',
  'testing_center_technical_issues','testing_center_screenshot_evidence',
  'testing_center_evidence_batches','testing_center_report_payloads',
  'testing_center_report_submission_keys','testing_center_report_events')
  and a.grantee=0 and a.privilege_type in
  ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
 ),'PUBLIC has no direct writer or schema grants on legacy report tables');
set local role service_role;
select throws_ok($$insert into public.testing_center_reports(report_id) values('abuse')$$,
 '42501',null,'service_role cannot bypass RPC closure with direct INSERT');
reset role;
select * from finish();
rollback;
