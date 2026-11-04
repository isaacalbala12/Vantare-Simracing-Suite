-- #1928: characterize the admitted v2 write path before changing its writers.
begin;
select plan(16);

insert into public.profiles(id) values
 ('19280000-0000-4000-8000-000000000001'),
 ('19280000-0000-4000-8000-000000000002'),
 ('19280000-0000-4000-8000-000000000003'),
 ('19280000-0000-4000-8000-000000000004'),
 ('19280000-0000-4000-8000-000000000005'),
 ('19280000-0000-4000-8000-000000000006');
insert into public.testing_center_memberships(user_id,actor_id,role) values
 ('19280000-0000-4000-8000-000000000002','vanta1928-membership-owner','owner'),
 ('19280000-0000-4000-8000-000000000003','vanta1928-tester','tester'),
 ('19280000-0000-4000-8000-000000000004','vanta1928-revoked','owner'),
 ('19280000-0000-4000-8000-000000000005','vanta1928-expired','owner');
select * from public.operational_access_set(
 '19280000-0000-4000-8000-000000000001','owner','grant',
 'test:vanta1928','Operational owner','test:vanta1928-a',null);
select * from public.operational_access_set(
 '19280000-0000-4000-8000-000000000004','owner','grant',
 'test:vanta1928','Revoked owner','test:vanta1928-d-grant',null);
select * from public.operational_access_set(
 '19280000-0000-4000-8000-000000000004','owner','revoke',
 'test:vanta1928','Revoked owner','test:vanta1928-d-revoke',null);
select * from public.operational_access_set(
 '19280000-0000-4000-8000-000000000005','owner','grant',
 'test:vanta1928','Expired owner','test:vanta1928-e',null);
update public.operational_access_assignments
 set granted_at=now()-interval '2 seconds', expires_at=now()-interval '1 second'
 where user_id='19280000-0000-4000-8000-000000000005' and role='owner';

create function pg_temp.vanta1928_report(p_id uuid,p_channel text,p_variant text,p_key text)
returns jsonb language sql volatile as $$
 select jsonb_build_object(
  'contract_version','testing.report.v2','report_id',p_id,'channel',p_channel,
  'title','Channel authority fixture','body','Channel authority fixture',
  'consent',true,'idempotency_key','draft_'||repeat(p_key,64),
  'variant',p_variant
 ) || case when p_variant='triage' then jsonb_build_object(
  'context',jsonb_build_object(
    'app_version','1.2.3','app_channel',p_channel,'game','none',
    'system','{}'::jsonb,'consent',jsonb_build_object(
      'version','triage-v2','items','[]'::jsonb,'accepted_at',clock_timestamp()::text)),
  'attachments','[]'::jsonb) else '{}'::jsonb end
$$;

set local role service_role;
select throws_ok(format('select * from public.testing_report_v2_submit_admitted(%L::uuid,%L::jsonb)',
 '19280000-0000-4000-8000-000000000002',pg_temp.vanta1928_report('19280000-0000-4000-8000-000000000102','nightly','simple','1')),
 '42501','testing_membership_required','membership-only owner cannot submit nightly simple');
select throws_ok(format('select * from public.testing_report_v2_submit_admitted(%L::uuid,%L::jsonb)',
 '19280000-0000-4000-8000-000000000002',pg_temp.vanta1928_report('19280000-0000-4000-8000-000000000103','testers','simple','2')),
 '42501','testing_membership_required','membership-only owner cannot submit testers simple');
select throws_ok(format('select * from public.testing_report_v2_submit_admitted(%L::uuid,%L::jsonb)',
 '19280000-0000-4000-8000-000000000002',pg_temp.vanta1928_report('19280000-0000-4000-8000-000000000104','testers','triage','3')),
 '42501','testing_membership_required','membership-only owner cannot submit testers triage');
select lives_ok(format('select * from public.testing_report_v2_submit_admitted(%L::uuid,%L::jsonb)',
 '19280000-0000-4000-8000-000000000001',pg_temp.vanta1928_report('19280000-0000-4000-8000-000000000105','nightly','simple','4')),
 'operational owner without membership can submit nightly simple');
select lives_ok(format('select * from public.testing_report_v2_submit_admitted(%L::uuid,%L::jsonb)',
 '19280000-0000-4000-8000-000000000001',pg_temp.vanta1928_report('19280000-0000-4000-8000-000000000106','testers','simple','5')),
 'operational owner without membership can submit testers simple');
select lives_ok(format('select * from public.testing_report_v2_submit_admitted(%L::uuid,%L::jsonb)',
 '19280000-0000-4000-8000-000000000001',pg_temp.vanta1928_report('19280000-0000-4000-8000-000000000107','nightly','triage','6')),
 'operational owner without membership can submit nightly triage');
select lives_ok(format('select * from public.testing_report_v2_submit_admitted(%L::uuid,%L::jsonb)',
 '19280000-0000-4000-8000-000000000003',pg_temp.vanta1928_report('19280000-0000-4000-8000-000000000108','testers','simple','7')),
 'tester can still submit testers');
select throws_ok(format('select * from public.testing_report_v2_submit_admitted(%L::uuid,%L::jsonb)',
 '19280000-0000-4000-8000-000000000003',pg_temp.vanta1928_report('19280000-0000-4000-8000-000000000109','nightly','simple','8')),
 '42501','testing_membership_required','tester still cannot submit nightly');
select throws_ok(format('select * from public.testing_report_v2_submit_admitted(%L::uuid,%L::jsonb)',
 '19280000-0000-4000-8000-000000000004',pg_temp.vanta1928_report('19280000-0000-4000-8000-00000000010a','nightly','simple','9')),
 '42501','testing_membership_required','revoked owner cannot submit nightly');
select throws_ok(format('select * from public.testing_report_v2_submit_admitted(%L::uuid,%L::jsonb)',
 '19280000-0000-4000-8000-000000000004',pg_temp.vanta1928_report('19280000-0000-4000-8000-00000000010b','testers','triage','a')),
 '42501','testing_membership_required','revoked owner cannot submit testers triage');
select throws_ok(format('select * from public.testing_report_v2_submit_admitted(%L::uuid,%L::jsonb)',
 '19280000-0000-4000-8000-000000000005',pg_temp.vanta1928_report('19280000-0000-4000-8000-00000000010c','nightly','simple','b')),
 '42501','testing_membership_required','expired owner cannot submit nightly');
select throws_ok(format('select * from public.testing_report_v2_submit_admitted(%L::uuid,%L::jsonb)',
 '19280000-0000-4000-8000-000000000005',pg_temp.vanta1928_report('19280000-0000-4000-8000-00000000010d','testers','simple','c')),
 '42501','testing_membership_required','expired owner cannot submit testers');
select throws_ok(format('select * from public.testing_report_v2_submit_admitted(%L::uuid,%L::jsonb)',
 '19280000-0000-4000-8000-000000000006',pg_temp.vanta1928_report('19280000-0000-4000-8000-00000000010e','testers','simple','d')),
 '42501','testing_membership_required','other account without membership cannot submit');
reset role;
select is((select count(*)::integer from public.testing_contributions
 where account_id in ('19280000-0000-4000-8000-000000000002','19280000-0000-4000-8000-000000000004',
 '19280000-0000-4000-8000-000000000005','19280000-0000-4000-8000-000000000006')),0,
 'denied submissions leave no contribution rows');
select is((select count(*)::integer from public.testing_contributions
 where account_id in ('19280000-0000-4000-8000-000000000001','19280000-0000-4000-8000-000000000003')),4,
 'accepted owner and tester submissions have roots');
select ok(not has_function_privilege('anon','public.testing_report_v2_submit_admitted(uuid,jsonb)','execute'),
 'anonymous cannot call admitted write path');
select * from finish();
rollback;
