begin;
select no_plan();
insert into public.profiles(id) values('16270000-0000-4000-8000-000000000001'),('16270000-0000-4000-8000-000000000002');
select * from public.operational_access_set('16270000-0000-4000-8000-000000000001','owner','grant','test:admin','Admin r4','test:r4',null);
-- Historical dates fixture, independent of the submission quota.
alter table public.testing_contributions disable trigger testing_report_limit;
insert into public.testing_contributions(id,account_id,channel,title,body)
 select ('16270000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'16270000-0000-4000-8000-000000000002','nightly','Informe sintético','Reproducción' from generate_series(10,16)n;
alter table public.testing_contributions enable trigger testing_report_limit;
update public.testing_contributions set created_at=timestamptz '2026-10-12 12:00Z'+make_interval(days=>case when right(id::text,2)::int=14 then 0 else right(id::text,2)::int-10 end);
create function pg_temp.change(n integer,s text) returns jsonb language sql as $$
 select public.native_admin_execute('16270000-0000-4000-8000-000000000001','https://clerk.admin.test','set_report_status',jsonb_build_object('report_id','16270000-0000-4000-8000-'||lpad(n::text,12,'0'),'status',s,'reason','Revisado','fixed_in_version','1.2.3'),'sandbox') $$;
select lives_ok($$select pg_temp.change(10,'validated')$$,'aceptar informe');
select lives_ok($$select pg_temp.change(13,'rejected')$$,'rechazar informe');
select lives_ok($$select pg_temp.change(15,'spam')$$,'marcar spam');
select throws_ok(format('select pg_temp.change(%s,%L)',n,s),'23505','testing_review_conflict','decisión final no vuelve a '||s)
 from unnest(array[10,13,15])n cross join unnest(array['submitted','in_review'])s;
select is((select state from public.testing_contributions where id='16270000-0000-4000-8000-000000000010'),'accepted','reapertura denegada conserva aceptación');
select throws_ok($$select pg_temp.change(14,'validated')$$,'23514','testing_acceptance_limit','reapertura denegada no libera cupo diario');
select lives_ok($$select pg_temp.change(10,'fixed')$$,'aceptado pasa a arreglado');
select throws_ok($$select pg_temp.change(10,'in_review')$$,'23505','testing_review_conflict','arreglado tampoco se reabre');
select throws_ok($$select pg_temp.change(14,'validated')$$,'23514','testing_acceptance_limit','arreglado sigue ocupando cupo diario');
select lives_ok($$select pg_temp.change(11,'validated')$$,'otro día admite segundo informe');
select throws_ok($$select pg_temp.change(12,'validated')$$,'23514','testing_acceptance_limit','arreglado sigue ocupando cupo semanal');
select lives_ok($$select pg_temp.change(16,'in_review')$$,'informe sin decidir puede entrar en revisión');
select lives_ok($$select pg_temp.change(16,'submitted')$$,'informe sin decidir puede volver a recibido');
-- Recorded acceptance counts even for a row reopened by an older server.
alter table public.testing_contributions disable trigger user;
update public.testing_contributions set state='reviewing' where id='16270000-0000-4000-8000-000000000010';
alter table public.testing_contributions enable trigger user;
select throws_ok($$select pg_temp.change(10,'submitted')$$,'23505','testing_review_conflict','revisión duradera bloquea informe reabierto anteriormente');
select throws_ok($$select pg_temp.change(14,'validated')$$,'23514','testing_acceptance_limit','revisión duradera mantiene cupo de reapertura antigua');
insert into public.testing_center_reports(report_id,reporter_id,reporter_user_id,reporter_role,channel,state) values('r4-legacy','fixture','16270000-0000-4000-8000-000000000002','tester','nightly','submitted');
select lives_ok($$select public.native_admin_execute('16270000-0000-4000-8000-000000000001','https://clerk.admin.test','set_report_status','{"report_id":"r4-legacy","status":"spam","reason":"Prueba"}','sandbox')$$,'spam admitido en informes antiguos');
select is((select state from public.testing_center_reports where report_id='r4-legacy'),'spam','estado spam persistido');
select * from finish(); rollback;
