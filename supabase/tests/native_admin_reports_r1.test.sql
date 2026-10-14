begin;
select no_plan();
insert into public.profiles(id) values ('00000000-0000-4000-8000-000000001627'),('00000000-0000-4000-8000-000000001628');
select * from public.operational_access_set('00000000-0000-4000-8000-000000001627','owner','grant','test:admin','Admin r1','test:r1',null);
insert into public.testing_contributions(id,account_id,channel,title,body) values
 ('00000000-0000-4000-8000-000000001629','00000000-0000-4000-8000-000000001628','nightly','El calendario no abre','Pulso Calendario y se cierra.');
select is(jsonb_array_length(public.native_admin_execute('00000000-0000-4000-8000-000000001627','https://clerk.admin.test','list_reports','{"limit":100}','sandbox')->'reports'),1,'lista incluye informes actuales del tester');
select is(public.native_admin_execute('00000000-0000-4000-8000-000000001627','https://clerk.admin.test','get_report','{"report_id":"00000000-0000-4000-8000-000000001629"}','sandbox')->'report'->>'status','submitted','estado recibido normalizado');
select lives_ok($$select public.native_admin_execute('00000000-0000-4000-8000-000000001627','https://clerk.admin.test','set_report_status','{"report_id":"00000000-0000-4000-8000-000000001629","status":"in_review"}','sandbox')$$,'se puede poner en revisión');
select is(public.native_admin_execute('00000000-0000-4000-8000-000000001627','https://clerk.admin.test','get_report','{"report_id":"00000000-0000-4000-8000-000000001629"}','sandbox')->'report'->>'status','in_review','relectura confirma revisión');
select * from finish(); rollback;
