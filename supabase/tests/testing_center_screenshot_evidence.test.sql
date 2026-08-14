begin;
select plan(71);

select has_table('public', 'testing_center_evidence_batches', 'private batch table exists');
select has_table('public', 'testing_center_screenshot_evidence', 'private screenshot slot table exists');
select has_table('public', 'testing_center_evidence_outbox', 'durable evidence outbox exists');

select is(
  (select public::integer from storage.buckets where id = 'testing-center-evidence'),
  0,
  'evidence bucket is private'
);
select is(
  (select file_size_limit from storage.buckets where id = 'testing-center-evidence'),
  10485760::bigint,
  'evidence bucket limits each object to 10 MiB'
);
select is(
  (select allowed_mime_types from storage.buckets where id = 'testing-center-evidence'),
  array['image/png','image/jpeg']::text[],
  'evidence bucket accepts only PNG and JPEG'
);

select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.testing_center_evidence_batches'::regclass),
  'batch table enables and forces RLS'
);
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.testing_center_screenshot_evidence'::regclass),
  'slot table enables and forces RLS'
);
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.testing_center_evidence_outbox'::regclass),
  'outbox enables and forces RLS'
);

select is(
  (select count(*)::integer from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in ('testing_center_evidence_batches','testing_center_screenshot_evidence','testing_center_evidence_outbox')
     and grantee = 'authenticated'),
  0,
  'authenticated has no direct table privileges'
);
select is(
  (select count(*)::integer from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in ('testing_center_evidence_batches','testing_center_screenshot_evidence','testing_center_evidence_outbox')
     and grantee = 'service_role'
     and privilege_type in ('SELECT','INSERT','UPDATE','DELETE')),
  12,
  'service_role administers all private evidence tables'
);
select is(
  (select count(*)::integer from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname like 'testing_center_evidence_%'),
  1,
  'storage exposes exactly one evidence policy'
);
select ok(
  exists(select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'testing_center_evidence_insert_own_slot'
      and cmd = 'INSERT' and roles = array['authenticated']::name[]),
  'the only client storage policy is authenticated INSERT'
);

select has_function(
  'public', 'testing_center_prepare_screenshot_batch',
  array['text','text','text','jsonb'],
  'prepare RPC has the approved signature'
);
select has_function(
  'public', 'testing_center_finalize_screenshot',
  array['uuid','uuid'],
  'finalize RPC has the approved signature'
);
select has_function(
  'public', 'testing_center_submit_report_with_evidence',
  array['text','text','text','text','text','text','text','text','text','text','boolean','boolean','text','text','text','uuid'],
  'submit-with-evidence is additive to the 15-argument RPC'
);
select ok(
  has_function_privilege('authenticated', 'public.testing_center_prepare_screenshot_batch(text,text,text,jsonb)', 'execute'),
  'authenticated may prepare a screenshot batch'
);
select ok(
  has_function_privilege('authenticated', 'public.testing_center_finalize_screenshot(uuid,uuid)', 'execute'),
  'authenticated may finalize its screenshot slot'
);
select ok(
  has_function_privilege('authenticated', 'public.testing_center_submit_report_with_evidence(text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text,uuid)', 'execute'),
  'authenticated may submit a ready owned batch'
);
select is(
  (select prosecdef from pg_proc where oid = 'public.testing_center_prepare_screenshot_batch(text,text,text,jsonb)'::regprocedure),
  true,
  'prepare is SECURITY DEFINER'
);
select is(
  (select proconfig from pg_proc where oid = 'public.testing_center_prepare_screenshot_batch(text,text,text,jsonb)'::regprocedure),
  array['search_path=""']::text[],
  'prepare uses an empty search_path'
);

insert into auth.users(id,email) values
  ('00000000-0000-4000-8000-000000000501','evidence-primary@example.invalid'),
  ('00000000-0000-4000-8000-000000000502','evidence-tester@example.invalid'),
  ('00000000-0000-4000-8000-000000000503','evidence-inactive@example.invalid');
set local role service_role;
insert into public.testing_center_memberships(user_id,actor_id,role,active) values
  ('00000000-0000-4000-8000-000000000501','evidence-primary','primary_tester',true),
  ('00000000-0000-4000-8000-000000000502','evidence-tester','tester',true),
  ('00000000-0000-4000-8000-000000000503','evidence-inactive','primary_tester',false);
reset role;

create function pg_temp.manifest(p_sha text default repeat('a',64), p_size integer default 1024)
returns jsonb language sql immutable as $$
  select jsonb_build_array(jsonb_build_object(
    'position',1,'mediaType','image/png','byteSize',p_size,
    'sha256',p_sha,'width',100,'height',100
  ))
$$;

create function pg_temp.manifest_count(p_count integer, p_size integer default 1024)
returns jsonb language sql immutable as $$
  select jsonb_agg(jsonb_build_object(
    'position',position,'mediaType','image/png','byteSize',p_size,
    'sha256',lpad(to_hex(position),64,'0'),'width',100,'height',100
  ) order by position)
  from generate_series(1,p_count) as position
$$;

set local role anon;
select throws_ok(
  $$select * from public.testing_center_prepare_screenshot_batch('testing-center.screenshot-evidence.v1','nightly','anon-key',pg_temp.manifest())$$,
  '42501', null, 'anonymous prepare is rejected'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000503',true);
select throws_ok(
  $$select * from public.testing_center_prepare_screenshot_batch('testing-center.screenshot-evidence.v1','nightly','inactive-key',pg_temp.manifest())$$,
  '42501', null, 'inactive membership is rejected'
);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000502',true);
select throws_ok(
  $$select * from public.testing_center_prepare_screenshot_batch('testing-center.screenshot-evidence.v1','nightly','tester-nightly',pg_temp.manifest())$$,
  '42501', null, 'tester cannot prepare for nightly'
);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000501',true);
select throws_ok(
  $$select * from public.testing_center_prepare_screenshot_batch('wrong','nightly','bad-contract',pg_temp.manifest())$$,
  '22023', null, 'unknown contract fails closed'
);
select throws_ok(
  $$select * from public.testing_center_prepare_screenshot_batch('testing-center.screenshot-evidence.v1','preview','bad-channel',pg_temp.manifest())$$,
  '22023', null, 'unknown channel fails closed'
);
select throws_ok(
  $$select * from public.testing_center_prepare_screenshot_batch('testing-center.screenshot-evidence.v1','nightly','bad-key','[]'::jsonb)$$,
  '22023', null, 'empty manifest is rejected'
);
select throws_ok(
  $$select * from public.testing_center_prepare_screenshot_batch('testing-center.screenshot-evidence.v1','nightly','bad-extra','[{"position":1,"mediaType":"image/png","byteSize":1,"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","width":1,"height":1,"name":"private.png"}]'::jsonb)$$,
  '22023', null, 'unknown manifest keys are rejected'
);
select throws_ok(
  $$select * from public.testing_center_prepare_screenshot_batch('testing-center.screenshot-evidence.v1','nightly','bad-mime','[{"position":1,"mediaType":"image/gif","byteSize":1,"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","width":1,"height":1}]'::jsonb)$$,
  '22023', null, 'unsupported MIME is rejected'
);
select throws_ok(
  $$select * from public.testing_center_prepare_screenshot_batch('testing-center.screenshot-evidence.v1','nightly','bad-size',pg_temp.manifest(repeat('a',64),10485761))$$,
  '22023', null, 'object above 10 MiB is rejected'
);
select throws_ok(
  $$select * from public.testing_center_prepare_screenshot_batch('testing-center.screenshot-evidence.v1','nightly','bad-sha',pg_temp.manifest(repeat('A',64)))$$,
  '22023', null, 'SHA must be lowercase hex'
);
select throws_ok(
  $$select * from public.testing_center_prepare_screenshot_batch('testing-center.screenshot-evidence.v1','nightly','bad-pixels','[{"position":1,"mediaType":"image/png","byteSize":1,"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","width":10000,"height":5000}]'::jsonb)$$,
  '22023', null, 'more than 40 megapixels is rejected'
);
select throws_ok(
  $$select * from public.testing_center_prepare_screenshot_batch('testing-center.screenshot-evidence.v1','nightly','eleven-slots',pg_temp.manifest_count(11))$$,
  '22023', null, 'an eleventh screenshot is rejected'
);
create temporary table maximum_batch_result as
select * from public.testing_center_prepare_screenshot_batch(
  'testing-center.screenshot-evidence.v1','nightly','maximum-batch',
  pg_temp.manifest_count(10,10485760)
);
select is(
  (select jsonb_array_length(slots) from maximum_batch_result),
  10,
  'ten screenshots at the 100 MiB aggregate boundary are accepted'
);
reset role;
select is(
  (select sum(byte_size)::bigint from public.testing_center_screenshot_evidence
   where batch_id=(select batch_id from maximum_batch_result)),
  104857600::bigint,
  'the accepted aggregate limit is exactly 100 MiB'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000501',true);
create temporary table prepared_result as
select * from public.testing_center_prepare_screenshot_batch(
  'testing-center.screenshot-evidence.v1','nightly','prepare-key',
  '[{"position":1,"mediaType":"image/png","byteSize":1024,"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","width":100,"height":100},{"position":2,"mediaType":"image/jpeg","byteSize":2048,"sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","width":200,"height":100}]'::jsonb
);
grant select on prepared_result to service_role;
select is((select idempotent from prepared_result),false,'first prepare is not idempotent');
select is((select jsonb_array_length(slots) from prepared_result),2,'prepare returns two sanitized slots');
select ok(
  (select slots::text !~* 'evidence-primary|example|private|filename|reporter' from prepared_result),
  'prepare response contains no reporter PII or filenames'
);
select is(
  (select count(*)::integer from public.testing_center_prepare_screenshot_batch(
    'testing-center.screenshot-evidence.v1','nightly','prepare-key',
    '[{"position":1,"mediaType":"image/png","byteSize":1024,"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","width":100,"height":100},{"position":2,"mediaType":"image/jpeg","byteSize":2048,"sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","width":200,"height":100}]'::jsonb
  ) where idempotent),
  1,
  'same key and manifest reuses the batch'
);
select throws_ok(
  $$select * from public.testing_center_prepare_screenshot_batch('testing-center.screenshot-evidence.v1','nightly','prepare-key',pg_temp.manifest(repeat('b',64)))$$,
  '23505', null, 'same key with changed manifest conflicts'
);
reset role;
select is((select count(*)::integer from public.testing_center_evidence_batches where batch_id=(select batch_id from prepared_result)),1,'prepare creates exactly one requested batch');
select is((select count(*)::integer from public.testing_center_screenshot_evidence where batch_id=(select batch_id from prepared_result)),2,'prepare creates exactly two requested slots');
select ok(
  (select bool_and(object_path !~* 'evidence-primary|example|prepare-key')
   from public.testing_center_screenshot_evidence
   where batch_id=(select batch_id from prepared_result)),
  'server-owned object path is opaque'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000501',true);
select throws_ok(
  $$insert into storage.objects(bucket_id,name,owner_id) values ('testing-center-evidence','chosen/by/client','00000000-0000-4000-8000-000000000501')$$,
  '42501', null, 'client cannot choose a storage path'
);
insert into storage.objects(bucket_id,name,owner_id)
select 'testing-center-evidence',slot->>'objectPath','00000000-0000-4000-8000-000000000501'
from prepared_result cross join lateral jsonb_array_elements(slots) slot;
select lives_ok(
  $$select 1$$,
  'exact owned slot path was inserted without upsert'
);
select throws_ok(
  $$update storage.objects set name = name || '-overwrite' where bucket_id='testing-center-evidence'$$,
  '42501', null, 'client cannot update or upsert evidence objects'
);
select throws_ok(
  $$delete from storage.objects where bucket_id='testing-center-evidence'$$,
  '42501', null, 'client cannot delete evidence objects'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000502',true);
select throws_ok(
  format('select * from public.testing_center_finalize_screenshot(%L::uuid,%L::uuid)',
    (select batch_id from prepared_result),(select (slots->0->>'evidenceId') from prepared_result)),
  '42501', null, 'another user cannot finalize the slot'
);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000501',true);
select is(
  (select idempotent from public.testing_center_finalize_screenshot(
    (select batch_id from prepared_result),
    (select (slots->0->>'evidenceId')::uuid from prepared_result)
  )),
  false,
  'first finalize queues one validation'
);
select is(
  (select idempotent from public.testing_center_finalize_screenshot(
    (select batch_id from prepared_result),
    (select (slots->0->>'evidenceId')::uuid from prepared_result)
  )),
  true,
  'finalize retry is idempotent'
);
reset role;
select is((select count(*)::integer from public.testing_center_evidence_outbox where kind='validate' and evidence_id=(select (slots->0->>'evidenceId')::uuid from prepared_result)),1,'partial finalize creates one validate job');
select is((select state from public.testing_center_screenshot_evidence where evidence_id=(select (slots->0->>'evidenceId')::uuid from prepared_result)),'uploaded','partial finalize leaves the finalized slot uploaded');
select is((select state from public.testing_center_screenshot_evidence where evidence_id=(select (slots->1->>'evidenceId')::uuid from prepared_result)),'prepared','partial finalize leaves the other slot prepared');
select is((select state from public.testing_center_evidence_batches where batch_id=(select batch_id from prepared_result)),'uploading','partial finalize leaves the batch uploading');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000501',true);
select is(
  (select idempotent from public.testing_center_finalize_screenshot(
    (select batch_id from prepared_result),
    (select (slots->1->>'evidenceId')::uuid from prepared_result)
  )),
  false,
  'last finalize queues its validation'
);
select is(
  (select idempotent from public.testing_center_finalize_screenshot(
    (select batch_id from prepared_result),
    (select (slots->1->>'evidenceId')::uuid from prepared_result)
  )),
  true,
  'last finalize retry is idempotent'
);
reset role;
select is((select count(*)::integer from public.testing_center_evidence_outbox where kind='validate' and evidence_id in (select evidence_id from public.testing_center_screenshot_evidence where batch_id=(select batch_id from prepared_result))),2,'two finalized slots create exactly two validate jobs');
select is((select count(*)::integer from public.testing_center_screenshot_evidence where batch_id=(select batch_id from prepared_result) and state='validating'),2,'last finalize moves every uploaded slot to validating');
select is((select state from public.testing_center_evidence_batches where batch_id=(select batch_id from prepared_result)),'validating','last finalize moves the batch to validating');

select ok(
  (select pg_get_constraintdef(oid) from pg_constraint where conname='testing_center_screenshot_evidence_failure_check')
    ~ 'invalid_size.*invalid_media_type.*digest_mismatch.*invalid_signature.*invalid_dimensions.*object_missing.*validation_failed',
  'failure codes include every ISA-349 value'
);
select ok(
  (select pg_get_constraintdef(oid) from pg_constraint where conname='testing_center_screenshot_evidence_failure_check')
    !~ 'size_mismatch|mime_mismatch|signature_invalid|dimensions_invalid|decode_failed',
  'failure codes contain no aliases or extra values'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000501',true);
select throws_ok(
  $$select * from public.testing_center_submit_report_with_evidence('testing-center.v1','nightly','Opened settings','Settings stays visible','Settings closed',null,'v0.4.0-nightly','windows','Windows 11','hub',false,false,null,null,'prepare-key',(select batch_id from prepared_result))$$,
  '55000', null, 'submit rejects a batch that is not fully ready'
);
reset role;
set local role service_role;
update public.testing_center_screenshot_evidence
set state='rejected',failure_code='validation_failed',validated_at=now(),updated_at=now()
where evidence_id=(select (slots->0->>'evidenceId')::uuid from prepared_result);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000501',true);
select throws_ok(
  $$select * from public.testing_center_submit_report_with_evidence('testing-center.v1','nightly','Opened settings','Settings stays visible','Settings closed',null,'v0.4.0-nightly','windows','Windows 11','hub',false,false,null,null,'prepare-key',(select batch_id from prepared_result))$$,
  '55000', null, 'submit rejects a batch containing rejected evidence'
);
reset role;
set local role service_role;
update public.testing_center_screenshot_evidence set state='ready',failure_code=null,validated_at=now(),updated_at=now()
where batch_id=(select batch_id from prepared_result);
update public.testing_center_evidence_batches set state='ready',updated_at=now()
where batch_id=(select batch_id from prepared_result);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000502',true);
select throws_ok(
  $$select * from public.testing_center_submit_report_with_evidence('testing-center.v1','nightly','Opened settings','Settings stays visible','Settings closed',null,'v0.4.0-nightly','windows','Windows 11','hub',false,false,null,null,'prepare-key',(select batch_id from prepared_result))$$,
  '42501', null, 'another user cannot submit the batch'
);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000501',true);
create temporary table submitted_result as
select * from public.testing_center_submit_report_with_evidence(
  'testing-center.v1','nightly','Opened settings','Settings stays visible','Settings closed',null,
  'v0.4.0-nightly','windows','Windows 11','hub',false,false,null,null,'prepare-key',
  (select batch_id from prepared_result)
);
select is((select idempotent from submitted_result),false,'first evidence submit creates the report');
select is(
  (select idempotent from public.testing_center_submit_report_with_evidence(
    'testing-center.v1','nightly','Opened settings','Settings stays visible','Settings closed',null,
    'v0.4.0-nightly','windows','Windows 11','hub',false,false,null,null,'prepare-key',
    (select batch_id from prepared_result)
  )),
  true,
  'evidence submit retry converges'
);
reset role;
select is((select state from public.testing_center_evidence_batches where batch_id=(select batch_id from prepared_result)),'attached','successful submit attaches the batch');
select ok(
  (select bool_and(report_id is not null) from public.testing_center_screenshot_evidence
   where batch_id=(select batch_id from prepared_result)),
  'every slot links to the report'
);
select is(
  (select count(*)::integer from public.testing_center_evidence where kind='screenshot' and report_id=(select report_id from submitted_result)),
  2,
  'submit adds one canonical digest per distinct screenshot'
);
select is(
  (select count(*)::integer from public.testing_center_reports where report_id=(select report_id from submitted_result)),
  1,
  'evidence submit creates exactly one report through the existing RPC'
);
select ok(
  has_function_privilege('authenticated','public.testing_center_submit_report(text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text)','execute'),
  'the existing report RPC remains callable with its exact signature'
);

select * from finish();
rollback;
