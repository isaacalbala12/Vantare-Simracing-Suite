-- Synthetic LOCAL fixtures only. Invoked by run-triage-local.py, never production.
begin;
select no_plan();
insert into public.profiles(id) select ('15940000-0000-0000-0000-' || lpad(i::text,12,'0'))::uuid from generate_series(1,5) i;
insert into public.testing_center_memberships(user_id,actor_id,role) values
 ('15940000-0000-0000-0000-000000000001','1594-a','primary_tester'),
 ('15940000-0000-0000-0000-000000000002','1594-b','tester'),
 ('15940000-0000-0000-0000-000000000003','1594-owner','owner'),
 ('15940000-0000-0000-0000-000000000004','1594-owner2','owner');
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

select is((select count(*)::integer from pg_class where oid in ('public.testing_contribution_context'::regclass,
 'public.testing_contribution_attachments'::regclass,'public.testing_contribution_reviews'::regclass) and relrowsecurity and relforcerowsecurity),3,'all new tables force RLS');
select ok(not (select rolcanlogin or rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolreplication or rolinherit from pg_roles where rolname='vantare_triage'),'read role inert and unprivileged');
select ok(not has_column_privilege('vantare_triage','public.testing_contributions','account_id','select'),'worker cannot read account UUID');
select ok(not has_column_privilege('vantare_triage','public.testing_contribution_context','posthog_session_id','select'),'worker cannot read analytics session');
select ok(not has_table_privilege('vantare_triage','public.testing_contribution_reviews','select'),'worker cannot read reviews');
select ok(not has_function_privilege('vantare_triage','public.testing_contribution_review(uuid,text,text,jsonb)','execute'),'worker cannot confirm proposal');
select ok(not has_function_privilege('anon','public.testing_contribution_submit_v2(uuid,text,text,text,jsonb,jsonb)','execute'),'anon cannot submit');
select ok(not has_function_privilege('service_role','public.testing_contribution_review(uuid,text,text,jsonb)','execute'),'service role is not the human confirmation path');
select ok(not has_schema_privilege('authenticated','private','usage'),'private schema ACL stays closed');

set local role authenticated;
set local request.jwt.claim.sub = '15940000-0000-0000-0000-000000000001';
select lives_ok($$select public.testing_contribution_submit_v2('15940000-0000-0000-0000-000000000010','testers','Failure',repeat('steps expected actual ',12),pg_temp.ctx(),pg_temp.att())$$,'atomic upload with hardware and cropped log');
select is((select count(*)::integer from public.testing_contribution_context),1,'own context visible');
select is((select count(*)::integer from public.testing_contribution_attachments),1,'own attachment visible');
select is((select telemetry_summary from public.testing_contribution_context),null::jsonb,'PostHog summary remains absent');
select is((select state from public.testing_contributions),'received','upload never auto-accepts');
select lives_ok($$select public.testing_contribution_submit_v2('15940000-0000-0000-0000-000000000010','testers','Failure',repeat('steps expected actual ',12),pg_temp.ctx(),pg_temp.att())$$,'exact retry idempotent');
select throws_ok($$select public.testing_contribution_submit_v2('15940000-0000-0000-0000-000000000010','testers','Failure',repeat('steps expected actual ',12),pg_temp.ctx()||'{"game":"acc"}',pg_temp.att())$$,'23505','testing_contribution_conflict','changed context cannot replace evidence');
select throws_ok($$select public.testing_contribution_submit_v2('15940000-0000-0000-0000-000000000010','testers','Failure',repeat('steps expected actual ',12),pg_temp.ctx(),'[]')$$,'23505','testing_contribution_conflict','changed attachments rejected');
select throws_ok($$select public.testing_contribution_review('15940000-0000-0000-0000-000000000010','accepted','confirmed',pg_temp.proposal())$$,'42501','testing_owner_required','tester cannot accept own report');
select throws_ok($$update public.testing_contributions set state='accepted'$$,'42501',null,'direct acceptance denied');
select throws_ok($$insert into public.testing_contribution_reviews values(null,null,null,null,null,null,null,null,null)$$,'42501',null,'direct review insert denied');
select throws_ok($$select public.testing_contribution_submit_v2('15940000-0000-0000-0000-000000000011','testers','Bad',repeat('x',210),pg_temp.ctx()||'{"system":{"username":"private"}}',pg_temp.att())$$,'23514',null,'system username rejected');
select throws_ok($$select public.testing_contribution_submit_v2('15940000-0000-0000-0000-000000000011','testers','Bad',repeat('x',210),pg_temp.ctx()||'{"system":{"gpu":[{"serial":"private"}]}}',pg_temp.att())$$,'23514',null,'nested serial rejected');
select throws_ok($$select public.testing_contribution_submit_v2('15940000-0000-0000-0000-000000000011','testers','Bad',repeat('x',210),pg_temp.ctx()||'{"system":{"overlays_active":["secret-process"]}}',pg_temp.att())$$,'23514',null,'arbitrary process denied');
select throws_ok($$select public.testing_contribution_submit_v2('15940000-0000-0000-0000-000000000011','testers','Bad',repeat('x',210),pg_temp.ctx()||'{"system":{"ram_gb":"lots"}}',pg_temp.att())$$,'23514',null,'hardware wrong type denied');
select throws_ok($$select public.testing_contribution_submit_v2('15940000-0000-0000-0000-000000000011','testers','Bad',repeat('x',210),pg_temp.ctx(),jsonb_set(pg_temp.att(),'{0,sha256}',to_jsonb(repeat('0',64))))$$,'23514',null,'attachment hash must match exact bytes');
select is((select count(*)::integer from public.testing_contributions),1,'invalid child uploads leave no orphan parent');
select throws_ok($$select public.testing_contribution_submit_v2('15940000-0000-0000-0000-000000000011','testers','Bad',repeat('x',210),pg_temp.ctx()||'{"email":"private@example.invalid"}',pg_temp.att())$$,'22023','testing_context_invalid','unknown context key rejected');
select throws_ok($$select public.testing_contribution_submit_v2('15940000-0000-0000-0000-000000000011','testers','Bad',repeat('x',210),pg_temp.ctx()||'{"app_channel":"nightly"}',pg_temp.att())$$,'22023','testing_context_invalid','context build channel must match parent');
select throws_ok($$select public.testing_contribution_submit_v2('15940000-0000-0000-0000-000000000011','testers','Bad',repeat('x',210),pg_temp.ctx()||'{"consent":{}}',pg_temp.att())$$,'22023','testing_consent_required','missing external AI consent denied');
select throws_ok($$select public.testing_contribution_submit_v2('15940000-0000-0000-0000-000000000011','testers','Bad',repeat('x',210),jsonb_set(pg_temp.ctx(),'{consent,items}','[]'),pg_temp.att())$$,'22023','testing_unconsented_data','unchecked hardware not uploaded');
select throws_ok($$select public.testing_contribution_submit_v2('15940000-0000-0000-0000-000000000011','testers','Bad',repeat('x',210),jsonb_set(pg_temp.ctx(),'{consent,items}','["system"]'),pg_temp.att())$$,'22023','testing_attachments_invalid','unchecked log not uploaded');
select lives_ok($$select public.testing_contribution_submit_v2('15940000-0000-0000-0000-000000000011','testers','No evidence',repeat('x',210),jsonb_set(jsonb_set(pg_temp.ctx(),'{consent,items}','[]'),'{system}','{}'),'[]')$$,'all optional evidence can be unchecked');
select lives_ok($$select public.testing_contribution_submit('15940000-0000-0000-0000-000000000012','testers','Legacy','text')$$,'legacy RPC preserved');
select is((select count(*)::integer from public.testing_contribution_context),2,'legacy report has no invented context');
select throws_ok($$select public.testing_contribution_submit_v2('15940000-0000-0000-0000-000000000013','testers','Oversize',repeat('x',210),pg_temp.ctx(),jsonb_build_array(jsonb_build_object('kind','app_log','content',repeat('ÃƒÂ©',131073),'sha256',encode(sha256(convert_to(repeat('ÃƒÂ©',131073),'UTF8')),'hex'))))$$,'23514',null,'attachment limit measured in UTF8 bytes');
select throws_ok($$select public.testing_contribution_submit_v2('15940000-0000-0000-0000-000000000013','testers','Duplicate',repeat('x',210),pg_temp.ctx(),pg_temp.att()||pg_temp.att())$$,'23505',null,'duplicate attachment kinds denied atomically');

set local request.jwt.claim.sub = '15940000-0000-0000-0000-000000000002';
select is((select count(*)::integer from public.testing_contribution_context),0,'B cannot read A context');
select is((select count(*)::integer from public.testing_contribution_attachments),0,'B cannot read A log');
select throws_ok($$select public.testing_contribution_submit_v2('15940000-0000-0000-0000-000000000010','testers','Failure',repeat('steps expected actual ',12),pg_temp.ctx(),pg_temp.att())$$,'23505','testing_contribution_conflict','other account cannot replay A UUID');
set local request.jwt.claim.sub = '15940000-0000-0000-0000-000000000005';
select throws_ok($$select public.testing_contribution_submit_v2('15940000-0000-0000-0000-000000000015','testers','None','text',pg_temp.ctx(),pg_temp.att())$$,'42501','testing_membership_required','account without membership denied');
set local request.jwt.claim.sub = '15940000-0000-0000-0000-000000000003';
select is((select count(*)::integer from public.testing_contribution_attachments),1,'owner can inspect evidence for confirmation');
select throws_ok($$select public.testing_contribution_review('15940000-0000-0000-0000-000000000010','accepted','confirmed',null)$$,'22023','testing_review_invalid','confirmation requires proposal snapshot');
select throws_ok($$select public.testing_contribution_review('15940000-0000-0000-0000-000000000010','accepted','',pg_temp.proposal())$$,'22023','testing_review_invalid','confirmation requires human note');
select throws_ok($$select public.testing_contribution_review('15940000-0000-0000-0000-000000000010','accepted','confirmed',pg_temp.proposal()||'{"confidence":2}')$$,'22023','testing_review_invalid','unbounded confidence denied');
select throws_ok($$select public.testing_contribution_review('15940000-0000-0000-0000-000000000010','accepted','confirmed',pg_temp.proposal()||'{"schema":null}')$$,'22023','testing_review_invalid','null proposal schema denied');
select throws_ok($$select public.testing_contribution_review('15940000-0000-0000-0000-000000000010','accepted','confirmed',pg_temp.proposal()||'{"criteria":{"contenido_minimo":"si","evidencia":"si","no_duplicado":"si","account_id":"private"}}')$$,'22023','testing_review_invalid','unknown nested proposal data denied');
select throws_ok($$select public.testing_contribution_review('15940000-0000-0000-0000-000000000010','accepted','confirmed',pg_temp.proposal()-'evidence_refs')$$,'22023','testing_review_invalid','incomplete proposal denied');
select lives_ok($$select public.testing_contribution_review('15940000-0000-0000-0000-000000000010','accepted','confirmed',pg_temp.proposal())$$,'owner confirms proposal explicitly');
select is((select state from public.testing_contributions where id='15940000-0000-0000-0000-000000000010'),'accepted','confirmed state persisted');
select is((select reviewer from public.testing_contribution_reviews),'15940000-0000-0000-0000-000000000003'::uuid,'reviewer derived from authenticated UUID');
select is((select model from public.testing_contribution_reviews),'opencode-go/deepseek-v4.1-flash','DeepSeek model audited');
select lives_ok($$select public.testing_contribution_review('15940000-0000-0000-0000-000000000010','accepted','confirmed',pg_temp.proposal())$$,'exact confirmation retry idempotent');
select throws_ok($$select public.testing_contribution_review('15940000-0000-0000-0000-000000000010','declined','changed',pg_temp.proposal())$$,'23505','testing_review_conflict','confirmed verdict immutable');
select throws_ok($$select public.testing_contribution_review('15940000-0000-0000-0000-000000000011','accepted','confirmed',pg_temp.proposal())$$,'23514','testing_acceptance_limit','one accepted per submission day');
select lives_ok($$select public.testing_contribution_review('15940000-0000-0000-0000-000000000011','spam','confirmed spam',pg_temp.proposal()||'{"verdict":"spam"}')$$,'spam decision recorded separately from discount');
select throws_ok($$select public.testing_contribution_review('15940000-0000-0000-0000-000000000099','declined','confirmed',pg_temp.proposal())$$,'P0002','testing_contribution_missing','unknown report denied');

reset role;
update public.testing_contributions set created_at='2026-10-12T12:00:00Z' where id='15940000-0000-0000-0000-000000000010';
update public.testing_contributions set created_at='2026-10-13T12:00:00Z' where id='15940000-0000-0000-0000-000000000012';
insert into public.testing_contributions(id,account_id,channel,title,body,created_at) values
 ('15940000-0000-0000-0000-000000000016','15940000-0000-0000-0000-000000000001','testers','Third','text','2026-10-14T12:00:00Z'),
 ('15940000-0000-0000-0000-000000000017','15940000-0000-0000-0000-000000000002','testers','Old','text',statement_timestamp()-interval '31 days');
set local role authenticated;
set local request.jwt.claim.sub = '15940000-0000-0000-0000-000000000003';
select lives_ok($$select public.testing_contribution_review('15940000-0000-0000-0000-000000000012','accepted','confirmed',pg_temp.proposal())$$,'second acceptance on another day');
select throws_ok($$select public.testing_contribution_review('15940000-0000-0000-0000-000000000016','accepted','confirmed',pg_temp.proposal())$$,'23514','testing_acceptance_limit','third acceptance in UTC week denied');
reset role;
update public.testing_center_memberships set active=false where user_id='15940000-0000-0000-0000-000000000003';
set local role authenticated;
select throws_ok($$select public.testing_contribution_review('15940000-0000-0000-0000-000000000016','declined','confirmed',pg_temp.proposal())$$,'42501','testing_owner_required','revoked owner cannot decide');
set local request.jwt.claim.sub = '15940000-0000-0000-0000-000000000002';
select is((select count(*)::integer from public.testing_contribution_reviews),0,'B cannot read A review');
set local request.jwt.claim.sub = '15940000-0000-0000-0000-000000000001';
select is((select count(*)::integer from public.testing_contribution_reviews),3,'author can read own reviews');
reset role;
set local role vantare_triage;
select is((select count(*)::integer from public.testing_contributions),4,'read role excludes reports older than 30 days');
select throws_ok($$select account_id from public.testing_contributions$$,'42501',null,'actual UUID read denied');
select throws_ok($$select posthog_session_id from public.testing_contribution_context$$,'42501',null,'actual session read denied');
select throws_ok($$select * from public.testing_contribution_reviews$$,'42501',null,'actual review read denied');
select throws_ok($$select public.testing_contribution_review('15940000-0000-0000-0000-000000000016','accepted','confirmed',pg_temp.proposal())$$,'42501',null,'actual worker confirmation denied');
select throws_ok($$update public.testing_contributions set state='accepted'$$,'42501',null,'actual worker write denied');
select throws_ok($$select private.testing_contribution_purge_evidence()$$,'42501',null,'worker cannot purge evidence');
reset role;
set local role anon;
select throws_ok($$select * from public.testing_contribution_context$$,'42501',null,'anon context denied');
select throws_ok($$select * from public.testing_contribution_attachments$$,'42501',null,'anon attachments denied');
select throws_ok($$select * from public.testing_contribution_reviews$$,'42501',null,'anon reviews denied');
reset role;
select ok(not private.testing_telemetry_valid('{"events":[{"name":"open","at":"2026-10-13","email":"private@example.invalid"}]}'),'nested analytics identifiers denied');
select ok(not private.testing_telemetry_valid(jsonb_build_object('errors',(select jsonb_agg(jsonb_build_object('type','error','message','m','fingerprint','f')) from generate_series(1,21)))),'more than 20 errors denied');
select ok(not private.testing_telemetry_valid('{"performance":{"overlay_fps":{"p50":"slow","p95":10}}}'),'performance requires numeric values');
select ok(private.testing_telemetry_valid('{"errors":[{"type":"error","message":"redacted","first_line":"redacted","fingerprint":"f"}],"events":[{"name":"open","at":"2026-10-13T00:00:00Z"}],"performance":{"overlay_fps":{"p50":60,"p95":59}}}'),'bounded telemetry shape accepted');
update public.testing_contribution_reviews set decided_at=clock_timestamp()-interval '91 days'
 where contribution_id='15940000-0000-0000-0000-000000000010';
update public.testing_contribution_context set telemetry_summary='{"events":[]}' where contribution_id='15940000-0000-0000-0000-000000000010';
select lives_ok($$select private.testing_contribution_purge_evidence()$$,'retention purge can run administratively');
select is((select count(*)::integer from public.testing_contribution_attachments),0,'expired evidence deleted');
select is((select telemetry_summary from public.testing_contribution_context where contribution_id='15940000-0000-0000-0000-000000000010'),null::jsonb,'expired telemetry purged');
select is((select count(*)::integer from public.testing_contribution_context),2,'system and consent retained');
select is((select count(*)::integer from public.testing_contribution_reviews),3,'human audit retained');
delete from public.profiles where id='15940000-0000-0000-0000-000000000003';
select is((select count(*)::integer from public.testing_contribution_reviews where reviewer is null),3,'deleting reviewer keeps audit without blocking account deletion');
delete from public.profiles where id='15940000-0000-0000-0000-000000000001';
select is((select count(*)::integer from public.testing_contribution_context),0,'deleting author cascades context');
select is((select count(*)::integer from public.testing_contribution_reviews),0,'deleting author cascades private review');
select * from finish();
rollback;
