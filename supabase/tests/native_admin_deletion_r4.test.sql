begin;
select no_plan();
insert into private.clerk_issuers(issuer,authorized_parties,enabled) values('https://clerk.admin.test',array['https://app.invalid'],true);
insert into public.profiles(id,email,display_name) values
 ('16270000-0000-4000-8000-000000000001','owner@example.invalid','Owner'),
 ('16270000-0000-4000-8000-000000000002','tester@example.invalid','Tester'),
 ('16270000-0000-4000-8000-000000000003','second@example.invalid','Otro dueño');
insert into public.account_identities(issuer,subject,account_id)
 select 'https://clerk.admin.test','user_'||replace(id::text,'-',''),id from public.profiles;
select * from public.operational_access_set('16270000-0000-4000-8000-000000000001','owner','grant','fixture:admin','Prueba R4','fixture:r4');
select * from public.operational_access_set('16270000-0000-4000-8000-000000000003','owner','grant','fixture:admin','Prueba R4','fixture:r4');
select * from public.operational_access_set('16270000-0000-4000-8000-000000000002','tester','grant','fixture:admin','Prueba R4','fixture:r4');
insert into public.testing_contributions(id,account_id,channel,title,body) values('16270000-0000-4000-8000-000000000010','16270000-0000-4000-8000-000000000002','nightly','Privado','Sintético');
create function pg_temp.erase(actor integer,target integer,action text default 'prepare_account_deletion',hash text default repeat('a',64),subject text default 'user_16270000000040008000000000000002',environment text default 'sandbox') returns jsonb language sql as $$
 select public.native_admin_execute(('16270000-0000-4000-8000-'||lpad(actor::text,12,'0'))::uuid,'https://clerk.admin.test',action,
 jsonb_build_object('account_id','16270000-0000-4000-8000-'||lpad(target::text,12,'0'),'confirmation_hash',hash,'clerk_subject',subject),environment) $$;
select is(pg_temp.erase(1,2,'get_account_deletion')->'deletion','null'::jsonb,'consulta de reintento no inicia borrado');
select throws_ok($$select pg_temp.erase(2,1)$$,'42501','native_admin_forbidden','tester no borra');
select throws_ok($$select pg_temp.erase(1,1)$$,'55000','native_admin_owner_conflict','no se borra a sí mismo');
select throws_ok($$select pg_temp.erase(1,3)$$,'55000','native_admin_owner_conflict','otro dueño tampoco se borra');
select throws_ok($$select pg_temp.erase(1,2,'prepare_account_deletion',repeat('a',64),'user_wrong')$$,'P0002','native_admin_not_found','subject ajeno no borra destino');
select throws_ok($$select pg_temp.erase(1,2,'prepare_account_deletion',repeat('a',64),'user_16270000000040008000000000000002','production')$$,'22023','native_admin_invalid','borrado sigue limitado a sandbox');
select is((select count(*)::int from private.admin_account_deletions),0,'rechazos no dejan solicitud');
select lives_ok($$select pg_temp.erase(1,2)$$,'solicitud aplica barrera común #1622');
select ok((select deleted_at is not null from public.account_identities where account_id='16270000-0000-4000-8000-000000000002'),'tombstone duradero');
select ok((select email is null and display_name is null from public.profiles where id='16270000-0000-4000-8000-000000000002'),'PII retirada por flujo común');
select is((select count(*)::int from public.testing_contributions),0,'contribuciones privadas borradas');
select is((select status from public.operational_access_assignments where user_id='16270000-0000-4000-8000-000000000002'),'revoked','grants revocados');
select ok((pg_temp.erase(1,2,'get_account_deletion')->'deletion'->>'deleted_at') is not null,'reintento recupera fecha sin volver a pedir PII a Clerk');
select is(pg_temp.erase(1,2),pg_temp.erase(1,2),'segunda llamada es idempotente');
select throws_ok($$select pg_temp.erase(1,2,'get_account_deletion',repeat('b',64))$$,'22023','native_admin_confirmation_mismatch','reintento exige la confirmación original');
select is((select count(*)::int from public.admin_audit_log where action='delete_account'),1,'una solicitud auditada pese a reintentos');
select ok(not exists(select 1 from public.admin_audit_log where action='delete_account' and (coalesce(before_value::text,'')||coalesce(after_value::text,'')) ~ '(example|user_|confirmation_hash)'),'auditoría no duplica PII ni hash');
select throws_ok($$select private.resolve_account_identity('https://clerk.admin.test','user_16270000000040008000000000000002')$$,'28000','account_deleted','cuenta no resucita');
select ok(not has_table_privilege('service_role','private.admin_account_deletions','SELECT'),'solicitudes privadas');
select ok(not has_function_privilege('service_role','private.native_admin_account_deletion(uuid,uuid,text,text,text)','EXECUTE'),'helper sin acceso directo');
select ok(not has_function_privilege('authenticated','public.native_admin_execute(uuid,text,text,jsonb,text)','EXECUTE'),'cliente no salta validación Edge');
select * from finish(); rollback;
