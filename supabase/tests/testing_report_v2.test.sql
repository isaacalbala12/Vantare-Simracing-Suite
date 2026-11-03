-- VANTA-131 7a: one report root, idempotent receipt, candidate membership and closed ACL.
begin;
select plan(16);
insert into public.profiles(id) values
 ('18960000-0000-4000-8000-000000000071'),
 ('18960000-0000-4000-8000-000000000073');
insert into public.testing_center_memberships(user_id,actor_id,role) values
 ('18960000-0000-4000-8000-000000000073','fixture-tester-73','tester');

select ok(not has_function_privilege('anon','public.testing_report_v2_submit_admitted(uuid,jsonb)','execute'),'anon cannot submit v2');
select ok(not has_function_privilege('authenticated','public.testing_report_v2_submit_admitted(uuid,jsonb)','execute'),'client cannot bypass Edge');
select ok(has_function_privilege('service_role','public.testing_report_v2_submit_admitted(uuid,jsonb)','execute'),'Edge can submit v2');
set local role service_role;
select lives_ok($$select * from public.testing_report_v2_submit_admitted(
 '18960000-0000-4000-8000-000000000071',
 '{"contract_version":"testing.report.v2","report_id":"18960000-0000-4000-8000-000000000072","channel":"master","title":"Synthetic","body":"Synthetic","consent":true,"idempotency_key":"draft_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","variant":"simple"}'::jsonb)$$,'simple v2 creates one root');
select lives_ok($$select * from public.testing_report_v2_submit_admitted(
 '18960000-0000-4000-8000-000000000071',
 '{"contract_version":"testing.report.v2","report_id":"18960000-0000-4000-8000-000000000072","channel":"master","title":"Synthetic","body":"Synthetic","consent":true,"idempotency_key":"draft_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","variant":"simple"}'::jsonb)$$,'exact retry returns receipt');
select throws_ok($$select * from public.testing_report_v2_submit_admitted(
 '18960000-0000-4000-8000-000000000071',
 '{"contract_version":"testing.report.v2","report_id":"18960000-0000-4000-8000-000000000074","channel":"master","title":"Changed","body":"Synthetic","consent":true,"idempotency_key":"draft_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","variant":"simple"}'::jsonb)$$,'23505',null,'changed body cannot borrow key');
select throws_ok($$select * from public.testing_report_v2_submit_admitted(
 '18960000-0000-4000-8000-000000000071',
 '{"contract_version":"testing.report.v2","report_id":"18960000-0000-4000-8000-000000000075","channel":"nightly","title":"Synthetic","body":"Synthetic","consent":true,"idempotency_key":"draft_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","variant":"simple"}'::jsonb)$$,'42501',null,'nonmember cannot submit nightly');
select throws_ok($$select * from public.testing_report_v2_submit_admitted(
 '18960000-0000-4000-8000-000000000073',
 '{"contract_version":"testing.report.v2","report_id":"18960000-0000-4000-8000-000000000076","channel":"nightly","title":"Synthetic","body":"Synthetic","consent":true,"idempotency_key":"draft_cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","variant":"simple"}'::jsonb)$$,'42501',null,'tester cannot borrow nightly');
select lives_ok($$select * from public.testing_report_v2_submit_admitted(
 '18960000-0000-4000-8000-000000000073',
 '{"contract_version":"testing.report.v2","report_id":"18960000-0000-4000-8000-000000000077","channel":"testers","title":"Synthetic","body":"Synthetic","consent":true,"idempotency_key":"draft_dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","variant":"simple"}'::jsonb)$$,'tester can submit testers');
select lives_ok(format('select * from public.testing_report_v2_submit_admitted(%L,%L::jsonb)',
 '18960000-0000-4000-8000-000000000073',
 jsonb_build_object('contract_version','testing.report.v2','report_id','18960000-0000-4000-8000-000000000078',
  'channel','testers','title','[contenido retirado por privacidad]','body','[contenido retirado por privacidad]',
  'consent',true,'idempotency_key','draft_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  'variant','triage','context',jsonb_build_object('app_version','1.2.3','app_channel','testers',
    'game','none','system','{}'::jsonb,'consent',jsonb_build_object('version','triage-v2','items','[]'::jsonb,
      'accepted_at',clock_timestamp()::text)),'attachments','[]'::jsonb)::text),
  'triage v2 writes the same contribution root');
reset role;
select is((select count(*)::integer from public.testing_contribution_context where contribution_id='18960000-0000-4000-8000-000000000078'),1,
  'triage context follows the root');
set local role service_role;
select lives_ok($$select * from public.testing_report_v2_submit_admitted(
 '18960000-0000-4000-8000-000000000071',
 '{"contract_version":"testing.report.v2","report_id":"18960000-0000-4000-8000-000000000079","channel":"master","title":"Informe estructurado","body":"Revisión humana pendiente","consent":true,"idempotency_key":"draft_ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff","variant":"diagnostic","context":{"module":"hub","app_version":"1.2.3","os_family":"windows","os_version":"11"}}'::jsonb)$$,'diagnostic v2 writes the same contribution root');
reset role;
select is((select report_metadata->>'module' from public.testing_report_followup where contribution_id='18960000-0000-4000-8000-000000000079'),'hub',
  'diagnostic metadata follows the root');
select is((select count(*)::integer from public.testing_contributions where id in
 ('18960000-0000-4000-8000-000000000072','18960000-0000-4000-8000-000000000077')),2,'one contribution per accepted report');
select is((select count(*)::integer from public.testing_center_reports where reporter_user_id='18960000-0000-4000-8000-000000000071'),0,'v2 never writes legacy reports');
select is((select count(*)::integer from private.testing_report_v2_keys where account_id='18960000-0000-4000-8000-000000000071'),2,'exact retry did not add a third key');
select * from finish();
rollback;
