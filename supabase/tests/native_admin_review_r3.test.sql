begin;
select no_plan();
insert into public.profiles(id) values ('16270000-0000-4000-8000-000000000001'),('16270000-0000-4000-8000-000000000002');
insert into private.clerk_issuers(issuer,authorized_parties,enabled) values('https://clerk.admin.test',array['https://app.invalid'],true);
insert into public.account_identities(issuer,subject,account_id)
 select 'https://clerk.admin.test','user_'||replace(id::text,'-',''),id from public.profiles;
select * from public.operational_access_set('16270000-0000-4000-8000-000000000001','owner','grant','test:admin','Admin r3','test:r3',null);
insert into public.testing_contributions(id,account_id,channel,title,body,created_at)
 select ('16270000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'16270000-0000-4000-8000-000000000002','nightly','Informe de prueba','Reproducción sintética',timestamptz '2026-10-12 12:00Z'+make_interval(days=>n-10) from generate_series(10,14)n;
-- Production insertion stamps the clock; explicit historical fixture after insert.
update public.testing_contributions set created_at=timestamptz '2026-10-12 12:00Z'+make_interval(days=>case when right(id::text,2)::int=14 then 0 else right(id::text,2)::int-10 end);
create function pg_temp.change(n integer,s text,note text default 'Revisado por Isaac') returns jsonb language sql as $$
 select public.native_admin_execute('16270000-0000-4000-8000-000000000001','https://clerk.admin.test','set_report_status',jsonb_build_object('report_id','16270000-0000-4000-8000-'||lpad(n::text,12,'0'),'status',s,'reason',note),'sandbox') $$;
select throws_ok($$select pg_temp.change(10,'validated','')$$,'22023','testing_review_invalid','aceptación exige nota');
select lives_ok($$select pg_temp.change(10,'validated')$$,'miniapp acepta mediante revisión');
select is((select count(*)::int from public.testing_contribution_reviews),1,'se guarda revisión con decisión');
select is((select note from public.testing_contribution_reviews limit 1),'Revisado por Isaac','se conserva la nota humana');
select throws_ok($$select pg_temp.change(14,'validated')$$,'23514','testing_acceptance_limit','segundo del mismo día rechazado');
select lives_ok($$select pg_temp.change(11,'validated')$$,'segundo día permitido');
select throws_ok($$select pg_temp.change(12,'validated')$$,'23514','testing_acceptance_limit','tercero en semana rechazado');
select lives_ok($$select pg_temp.change(13,'spam')$$,'spam tiene revisión propia');
select is((select item->>'status' from private.native_admin_reports('https://clerk.admin.test') where item->>'report_id'='16270000-0000-4000-8000-000000000013'),'spam','miniapp conserva spam');
insert into public.testing_contribution_attachments values('16270000-0000-4000-8000-000000000010','app_log','synthetic',encode(sha256(convert_to('synthetic','UTF8')),'hex'));
insert into public.testing_contribution_context(contribution_id,app_version,app_channel,game,system,telemetry_summary,consent) values('16270000-0000-4000-8000-000000000010','1.2.3','nightly','none','{}','{"events":[]}','{}');
update public.testing_contribution_reviews set decided_at=clock_timestamp()-interval '91 days';
select private.testing_contribution_purge_evidence();
select is((select count(*)::int from public.testing_contribution_attachments),0,'evidencia aceptada por miniapp se purga a 90 días');
select ok((select telemetry_summary is null from public.testing_contribution_context),'telemetría se purga junto al registro a los 90 días');
select ok(not has_function_privilege('authenticated','private.testing_contribution_review_as(uuid,uuid,text,text,jsonb)','execute'),'cliente no puede invocar motor con actor elegido');
select ok(not has_function_privilege('service_role','private.testing_contribution_review_as(uuid,uuid,text,text,jsonb)','execute'),'service_role no puede invocar motor privado');
insert into public.testing_center_memberships(user_id,actor_id,role) values('16270000-0000-4000-8000-000000000001','admin-owner','owner');
set local request.jwt.claims='{"iss":"https://clerk.admin.test","sub":"user_16270000000040008000000000000001","role":"authenticated","sid":"sess_fixture","azp":"https://app.invalid"}';
select throws_ok($$select public.testing_contribution_review('16270000-0000-4000-8000-000000000013','spam','Revisado',null)$$,'22023','testing_review_invalid','ruta pública de modelo sigue exigiendo propuesta');
select * from finish(); rollback;
