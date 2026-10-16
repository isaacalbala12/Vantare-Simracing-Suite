begin;
select no_plan();
insert into public.profiles(id) values('00000000-0000-4000-8000-000000001781'),('00000000-0000-4000-8000-000000001782');
select * from public.operational_access_set('00000000-0000-4000-8000-000000001781','owner','grant','test:retention','Owner fixture','test:retention',null);
create function pg_temp.mail(actor uuid default '00000000-0000-4000-8000-000000001781') returns jsonb language sql as $$select public.mail_admin_execute(actor,'mail_list','{}','sandbox')$$;
select public.mail_record_consent(null,'bad-key@example.invalid','es',true,'verified_waitlist',true);
select public.mail_forget_waitlist('bad-key@example.invalid');
create temporary table failed_job as select id from private.mail_contact_erasures where email='bad-key@example.invalid';
do $$declare job jsonb;begin
 for i in 1..8 loop
  update private.mail_contact_erasures set next_attempt_at=now()-interval '1 second' where id=(select id from failed_job);
  job:=public.mail_erasure_claim()->'job';
  perform public.mail_erasure_finish((job->>'id')::uuid,(job->>'lease')::uuid,401);
 end loop;
end $$;
select is((select state from private.mail_contact_erasures where id=(select id from failed_job)),'failed','eighth provider failure is terminal');
select is((select email from private.mail_contact_erasures where id=(select id from failed_job)),null,'terminal failure removes the temporary address');
select is(public.mail_erasure_claim()->'job','null'::jsonb,'exhausted DELETE is never retried automatically');
select is((pg_temp.mail()->'cleanup'->>'failed')::integer,1,'Owner sees persistent failure alert');
select is(pg_temp.mail()->'cleanup'->'failures'->0->>'id',(select id::text from failed_job),'Owner can identify the obligation by opaque receipt');
select ok(not (pg_temp.mail()->'cleanup')::text like '%example.invalid%','failure alert contains no raw address');
select throws_ok($$select pg_temp.mail('00000000-0000-4000-8000-000000001782')$$,'42501','native_admin_forbidden','non-Owner cannot read erasure failures');
select throws_ok($$select public.mail_record_consent(null,'bad-key@example.invalid','es',true,'verified_waitlist',true)$$,'40001','mail_erasure_pending','purging the queue address does not authorize resurrection');
select public.mail_record_consent(null,'expired@example.invalid','en',true,'verified_waitlist',true);
select public.mail_forget_waitlist('expired@example.invalid');
create temporary table aged as select id from private.mail_contact_erasures where email='expired@example.invalid';
update private.mail_contact_erasures set created_at=now()-interval '25 hours' where id=(select id from aged);
-- Reading the Owner panel also expires age-limited rows even when delivery flags are disabled.
select pg_temp.mail();
select is((select state from private.mail_contact_erasures where id=(select id from aged)),'failed','24h retention expires independently of attempts');
select is((select email from private.mail_contact_erasures where id=(select id from aged)),null,'expired address is purged');
select is((select attempts from private.mail_contact_erasures where id=(select id from aged)),0,'expiry performs no provider HTTP');
select is((pg_temp.mail()->'cleanup'->>'failed')::integer,2,'unresolved obligations remain visible together');
select ok(not has_function_privilege('authenticated','public.mail_erasure_expire()','execute'),'retention maintenance is server-only');
select ok(not exists(select 1 from private.mail_audit where detail::text like '%example.invalid%'),'failure audit has no address');
-- Even a worker crash on the final attempt cannot hold PII or restart DELETE indefinitely.
select public.mail_record_consent(null,'crashed@example.invalid','it',true,'verified_waitlist',true);
select public.mail_forget_waitlist('crashed@example.invalid');
update private.mail_contact_erasures set state='processing',attempts=8,lease=gen_random_uuid(),lease_until=now()-interval '1 second' where email='crashed@example.invalid';
select is(public.mail_erasure_claim()->'job','null'::jsonb,'crashed last lease becomes failed instead of ninth attempt');
select is((pg_temp.mail()->'cleanup'->>'failed')::integer,3,'crashed obligation is visible to Owner');
-- Only a separately verified manual provider deletion closes the obligation.
-- This privileged test simulates that operator-only transaction; no public ACK exists.
update private.mail_contact_erasures set state='completed',outcome='manual_absent',completed_at=clock_timestamp(),email_fingerprint=null where id=(select id from failed_job);
select lives_ok($$select public.mail_record_consent(null,'bad-key@example.invalid','es',true,'verified_waitlist',true)$$,'new signup waits for manual provider confirmation before it can return');
select * from finish();
rollback;
