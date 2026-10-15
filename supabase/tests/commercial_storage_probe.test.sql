begin;
select plan(8);
insert into private.clerk_issuers(issuer,authorized_parties,enabled)
 values('https://probe.clerk.invalid',array['https://app.invalid'],true);
insert into public.profiles(id) values('16080000-0000-0000-0000-000000000003');
insert into public.account_identities(issuer,subject,account_id)
 values('https://probe.clerk.invalid','user_probe','16080000-0000-0000-0000-000000000003');
insert into storage.s3_multipart_uploads(id,upload_signature,bucket_id,key,version,owner_id)
 values('probe-id','fixture','testing-center-evidence','probe-key','fixture','16080000-0000-0000-0000-000000000003');
select public.apply_clerk_user_event('probe-delete',repeat('a',64),'https://probe.clerk.invalid','user_probe','user.deleted',now(),null);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select set_config('storage.operation','storage.s3.upload.abort_multipart',true);
select set_config('request.method','DELETE',true);
select set_config('request.path','/s3/testing-center-evidence/probe-key?uploadId=probe-id',true);
select lives_ok($$insert into storage.objects(bucket_id,name,version,owner_id)
 values('testing-center-evidence','probe-key','1','16080000-0000-0000-0000-000000000003')$$,'abort probe accepts empty returning');
select is((select count(*)::int from storage.objects where name='probe-key'),0,'even forged SQL context cannot persist probe data');
select throws_ok($$insert into storage.objects(bucket_id,name,version) values('testing-center-evidence','wrong-key','1')$$,'28000','storage_deletion_abort_probe_invalid','pending upload cannot authorize another key');
select throws_ok($$insert into storage.objects(bucket_id,name,version) values('testing-center-evidence','probe-key','real-version')$$,'28000','storage_deletion_abort_probe_invalid','real version cannot use probe');
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select throws_ok($$insert into storage.objects(bucket_id,name,version) values('testing-center-evidence','probe-key','1')$$,'28000','storage_deletion_abort_probe_invalid','user JWT cannot use probe');
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select set_config('storage.operation','storage.s3.upload.create_multipart',true);
select throws_ok($$insert into storage.objects(bucket_id,name,version,owner_id) values('testing-center-evidence','probe-key','1','16080000-0000-0000-0000-000000000003')$$,'28000','account_deleted','create operation still hits tombstone');
select is((select count(*)::int from storage.objects where name='probe-key'),0,'no persistent objects after all probes');
select is((select count(*)::int from private.clerk_deleted_uploads where upload_id='probe-id'),1,'only Storage abort success can lead to queue ACK');
select * from finish();
rollback;
