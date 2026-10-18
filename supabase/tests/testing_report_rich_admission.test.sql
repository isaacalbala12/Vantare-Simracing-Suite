-- #1709: full current catalogue, disposable database, no hosted writes.
begin;
select no_plan();

insert into private.clerk_issuers(issuer,authorized_parties,enabled)
values('https://report-1709.clerk.invalid',array['https://app.invalid'],true);
insert into public.profiles(id) values
 ('17090000-0000-4000-8000-000000000001'),
 ('17090000-0000-4000-8000-000000000002'),
 ('17090000-0000-4000-8000-000000000003');
insert into public.account_identities(issuer,subject,account_id) values
 ('https://report-1709.clerk.invalid','user_aaaaaaaaaaaaaaaaaaaaaaaaaaa','17090000-0000-4000-8000-000000000001'),
 ('https://report-1709.clerk.invalid','user_bbbbbbbbbbbbbbbbbbbbbbbbbbb','17090000-0000-4000-8000-000000000002');
insert into public.testing_center_memberships(user_id,actor_id,role) values
 ('17090000-0000-4000-8000-000000000001','tester-1709-a','tester'),
 ('17090000-0000-4000-8000-000000000002','tester-1709-b','tester');

create function pg_temp.rich_report(
 account uuid, key text, batch uuid default null, channel text default 'testers'
) returns jsonb language sql as $$
 select to_jsonb(r) from public.testing_center_report_submit_admitted(
   account,'testing-center.v1',channel,'Informe estructurado',
   'Revisión humana pendiente','Revisión humana pendiente','',
   '1.2.3','windows','Windows 11','hub',false,false,null,null,key,batch) r
$$;

-- Unrelated claims must not identify the report or be changed by the adapter.
select set_config('request.jwt.claims','{"sub":"untrusted","role":"service_role"}',true);
set local role service_role;
select is(pg_temp.rich_report('17090000-0000-4000-8000-000000000001','draft_'||repeat('a',64))->>'idempotent','false','first report returns receipt');
select is(pg_temp.rich_report('17090000-0000-4000-8000-000000000001','draft_'||repeat('a',64))->>'idempotent','true','exact retry preserves receipt');
select is(current_setting('request.jwt.claims'),'{"sub":"untrusted","role":"service_role"}','server adapter never fabricates claims');
select throws_ok($$select pg_temp.rich_report('17090000-0000-4000-8000-000000000003','draft_'||repeat('c',64))$$,
 '42501',null,'account without membership denied');
select throws_ok($$select pg_temp.rich_report('17090000-0000-4000-8000-000000000001','draft_'||repeat('c',64),null,'nightly')$$,
 '42501',null,'tester cannot escalate to nightly');
select throws_ok($$select public.testing_center_report_submit_admitted(
 '17090000-0000-4000-8000-000000000001','testing-center.v1','testers','Private prose',
 'Revisión humana pendiente','Revisión humana pendiente','','1.2.3','windows','Windows 11','hub',false,false,null,null,'draft_'||repeat('c',64))$$,
 '22023',null,'service boundary enforces privacy too');
reset role;
select is((select count(*)::integer from public.testing_center_reports
 where reporter_user_id='17090000-0000-4000-8000-000000000001'),1,'receipt retry writes exactly one report');

-- Synthetic server-validated screenshot; no real bytes or Storage operations.
insert into public.testing_center_evidence_batches(batch_id,reporter_user_id,channel,idempotency_key,manifest_digest)
values('17090000-0000-4000-8000-000000000010','17090000-0000-4000-8000-000000000001','testers','draft_'||repeat('b',64),repeat('b',64));
insert into public.testing_center_screenshot_evidence(evidence_id,batch_id,position,object_path,media_type,byte_size,sha256,width,height)
values('17090000-0000-4000-8000-000000000011','17090000-0000-4000-8000-000000000010',1,
 'v1/0123456789abcdef0123456789abcdef/17090000-0000-4000-8000-000000000010/17090000-0000-4000-8000-000000000011',
 'image/jpeg',100,repeat('b',64),10,10);
set local role service_role;
select throws_ok($$select pg_temp.rich_report('17090000-0000-4000-8000-000000000001','draft_'||repeat('b',64),'17090000-0000-4000-8000-000000000010')$$,
 '55000','testing_center_evidence_not_ready','pending validation remains retryable');
select throws_ok($$select pg_temp.rich_report('17090000-0000-4000-8000-000000000002','draft_'||repeat('b',64),'17090000-0000-4000-8000-000000000010')$$,
 '42501',null,'another valid tester cannot attach this batch');
reset role;
update public.testing_center_screenshot_evidence set state='ready',validated_at=now()
 where batch_id='17090000-0000-4000-8000-000000000010';
update public.testing_center_evidence_batches set state='ready' where batch_id='17090000-0000-4000-8000-000000000010';
set local role service_role;
select is(pg_temp.rich_report('17090000-0000-4000-8000-000000000001','draft_'||repeat('b',64),'17090000-0000-4000-8000-000000000010')->>'idempotent','false','ready batch attaches');
select is(pg_temp.rich_report('17090000-0000-4000-8000-000000000001','draft_'||repeat('b',64),'17090000-0000-4000-8000-000000000010')->>'idempotent','true','attached retry is idempotent');
select throws_ok($$select pg_temp.rich_report('17090000-0000-4000-8000-000000000001','draft_'||repeat('c',64),'17090000-0000-4000-8000-000000000010')$$,
 '23505',null,'different key cannot reuse batch');
reset role;
select is((select count(*)::integer from public.testing_center_evidence e join public.testing_center_reports r using(report_id)
 where r.reporter_user_id='17090000-0000-4000-8000-000000000001' and e.kind='screenshot'),1,'one screenshot attachment after retry');

select ok(not has_function_privilege(r.rolname,p.oid,'execute'),r.rolname||' cannot call private report core')
from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join pg_roles r
where n.nspname='private' and p.proname like 'testing_center_report%_for_account'
 and r.rolname in ('anon','authenticated','service_role','vantare_triage','pilot_profile_writer','vantare_roadmap_publisher');
set local role authenticated;
select throws_ok($$select pg_temp.rich_report('17090000-0000-4000-8000-000000000001','draft_'||repeat('c',64))$$,
 '42501',null,'authenticated cannot bypass Edge via service adapter');
reset role;
set local role anon;
select throws_ok($$select pg_temp.rich_report('17090000-0000-4000-8000-000000000001','draft_'||repeat('c',64))$$,
 '42501',null,'anon cannot call service adapter');
reset role;

update public.account_identities set deleted_at=now()
 where account_id='17090000-0000-4000-8000-000000000001';
set local role service_role;
select throws_ok($$select pg_temp.rich_report('17090000-0000-4000-8000-000000000001','draft_'||repeat('a',64))$$,
 '28000','account_deleted','deleted account cannot retry existing report');
select throws_ok($$select pg_temp.rich_report('17090000-0000-4000-8000-000000000001','draft_'||repeat('b',64),'17090000-0000-4000-8000-000000000010')$$,
 '28000','account_deleted','deleted account cannot retry existing batch');
reset role;
select * from finish();
rollback;
