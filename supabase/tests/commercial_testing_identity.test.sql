-- All migrations applied. Real server ACLs, no manufactured JWT identity.
begin;
select no_plan();
insert into private.clerk_issuers(issuer,authorized_parties,enabled) values
 ('https://testing-r9.clerk.invalid',array['https://app.invalid'],true);
insert into public.profiles(id) values
 ('16090000-0000-0000-0000-000000000001'),('16090000-0000-0000-0000-000000000002');
insert into public.account_identities(issuer,subject,account_id) values
 ('https://testing-r9.clerk.invalid','user_r9','16090000-0000-0000-0000-000000000001');
insert into public.testing_center_memberships(user_id,actor_id,role) values
 ('16090000-0000-0000-0000-000000000001','r9-tester','tester');
create function pg_temp.ctx() returns jsonb language sql as $$ select jsonb_build_object(
  'app_version','1.2.3','app_channel','testers','game','lmu','game_version','1.0',
  'system',jsonb_build_object('os',jsonb_build_object('name','Windows','version','11','build','26100'),
    'cpu',jsonb_build_object('model','CPU','cores',8),'gpu',jsonb_build_array(jsonb_build_object('model','GPU','driver_version','1.0')),
    'ram_gb',32,'displays',jsonb_build_array(jsonb_build_object('width',1920,'height',1080,'hz',144,'dpi_scale',1,'primary',true)),
    'overlays_active',jsonb_build_array('OBS','Vantare'),'obs_active',true),
  'telemetry_summary',null,'posthog_session_id',null,
  'consent',jsonb_build_object('version','triage-v2','items',jsonb_build_array('system','app_log'),
    'accepted_at','2026-10-13T00:00:00Z')) $$;
create function pg_temp.att() returns jsonb language sql as $$ select jsonb_build_array(jsonb_build_object(
  'kind','app_log','content','ERROR example','sha256',encode(sha256(convert_to('ERROR example','UTF8')),'hex'))) $$;
create function pg_temp.proposal() returns jsonb language sql as $$ select
 '{"schema":"vantare.triage.v2","verdict":"valido","confidence":0.9,"summary":"Synthetic test","criteria":{"contenido_minimo":"si","evidencia":"si","no_duplicado":"si"},"trazable":"si","duplicate_of":null,"severity":"media","area":"telemetria","preliminary_fix":null,"reasons":["Evidence reviewed"],"evidence_refs":["log:L1-L1"]}'::jsonb $$;


-- Deliberately unrelated claims: adapters must neither trust nor replace them.
select set_config('request.jwt.claims','{"sub":"untrusted","role":"service_role"}',true);
set local role service_role;
select lives_ok($$select public.testing_contribution_submit_admitted(
 '16090000-0000-0000-0000-000000000001','16090000-0000-0000-0000-000000000011','testers',
 '[contenido retirado por privacidad]','[contenido retirado por privacidad]',pg_temp.ctx(),pg_temp.att())$$,'live triage sends exact context and attachment');
select is(current_setting('request.jwt.claims'),'{"sub":"untrusted","role":"service_role"}', 'adapter preserves caller claims');
select lives_ok($$select public.testing_contribution_submit_admitted(
 '16090000-0000-0000-0000-000000000001','16090000-0000-0000-0000-000000000011','testers',
 '[contenido retirado por privacidad]','[contenido retirado por privacidad]',pg_temp.ctx(),pg_temp.att())$$,'exact triage retry works');
select throws_ok($$select public.testing_contribution_submit_admitted(
 '16090000-0000-0000-0000-000000000002','16090000-0000-0000-0000-000000000011','testers',
 '[contenido retirado por privacidad]','[contenido retirado por privacidad]',pg_temp.ctx(),pg_temp.att())$$,'42501',null,'other account without membership cannot send');
select lives_ok($$select public.testing_report_submit_admitted(
 '16090000-0000-0000-0000-000000000001','16090000-0000-0000-0000-000000000012','master','Synthetic','Synthetic',true)$$,'live classic report sends');
reset role;
select is((select count(*)::integer from public.testing_contribution_context),1,'triage context persisted');
select is((select count(*)::integer from public.testing_contribution_attachments),1,'triage attachment persisted');
select is((select count(*)::integer from public.testing_report_followup where consent),2,'both paths preserve consent');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','private','pilot_private') and p.prosrc ~ 'set_config.*request.jwt'), 'catalogue has no synthetic claim writer');
select ok(not has_function_privilege(r.rolname,p.oid,'execute'),r.rolname||' cannot execute '||p.oid::regprocedure)
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join pg_roles r
 where n.nspname='private' and p.proname like 'testing_%_for_account'
 and r.rolname in ('anon','authenticated','service_role','vantare_triage','pilot_profile_writer','vantare_roadmap_publisher');
-- current_account still rejects incomplete synthetic claims.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"16090000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select is(private.current_account(),null::uuid,'B01 identity boundary stays closed to synthetic claims');
select throws_ok($$select public.testing_report_submit_admitted(
 '16090000-0000-0000-0000-000000000001','16090000-0000-0000-0000-000000000013','master','Synthetic','Synthetic',true)$$,'42501',null,'client cannot choose adapter account');
reset role;
select public.apply_clerk_user_event('r9-delete',repeat('d',64),'https://testing-r9.clerk.invalid','user_r9','user.deleted',now(),null);
-- Even restoring membership as an administrator cannot undo a tombstone.
-- The normal membership barrier also correctly refuses resurrection.
select throws_ok($$update public.testing_center_memberships set active=true where user_id='16090000-0000-0000-0000-000000000001'$$,'28000',null,'deleted membership cannot resurrect');
set local role service_role;
select throws_ok($$select public.testing_report_submit_admitted(
 '16090000-0000-0000-0000-000000000001','16090000-0000-0000-0000-000000000014','master','Synthetic','Synthetic',true)$$,'28000','account_deleted','deleted classic report denied');
select throws_ok($$select public.testing_contribution_submit_admitted(
 '16090000-0000-0000-0000-000000000001','16090000-0000-0000-0000-000000000015','testers',
 '[contenido retirado por privacidad]','[contenido retirado por privacidad]',pg_temp.ctx(),pg_temp.att())$$,'28000','account_deleted','deleted triage report denied');
reset role;
select is((select count(*)::integer from public.testing_contributions),0,'no report survives or returns after deletion');
select is((select count(*)::integer from public.testing_contribution_context),0,'context purged');
select is((select count(*)::integer from public.testing_contribution_attachments),0,'attachments purged');
select * from finish();
rollback;
