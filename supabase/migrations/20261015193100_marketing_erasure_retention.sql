-- #1636 R3-2. Bounded automatic retries and PII retention; unresolved duty stays visible.
begin;
alter table private.mail_contact_erasures drop constraint mail_contact_erasures_state_check;
alter table private.mail_contact_erasures drop constraint mail_contact_erasures_outcome_check;
alter table private.mail_contact_erasures drop constraint mail_contact_erasures_check;
alter table private.mail_contact_erasures add column email_fingerprint text check(email_fingerprint ~ '^[a-f0-9]{64}$');
alter table private.mail_contact_erasures add column failed_at timestamptz;
update private.mail_contact_erasures set email_fingerprint=encode(sha256(convert_to(email,'UTF8')),'hex') where email is not null;
alter table private.mail_contact_erasures add constraint mail_erasure_state check(state in('pending','processing','completed','failed'));
alter table private.mail_contact_erasures add constraint mail_erasure_outcome check(outcome in('deleted','already_absent','retry','attempt_limit','retention_limit','manual_deleted','manual_absent'));
alter table private.mail_contact_erasures add constraint mail_erasure_failed_receipt check(state<>'failed' or email_fingerprint is not null);
alter table private.mail_contact_erasures add constraint mail_erasure_pii check((state in('completed','failed'))=(email is null));
create index mail_erasure_failed_fingerprint on private.mail_contact_erasures(email_fingerprint) where state='failed';

create or replace function private.mail_queue_contact_erasure() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(1636,300);
 -- Drain a PUT started at the lease boundary (4s HTTP plus 6s safety margin).
 insert into private.mail_contact_erasures(email,account_id,next_attempt_at,email_fingerprint)
 values(old.email,coalesce(old.erasure_account,old.account_id),greatest(clock_timestamp(),old.sync_lease_until+interval '10 seconds'),
  encode(sha256(convert_to(old.email,'UTF8')),'hex'))
 on conflict(email) where email is not null do nothing;
 insert into private.mail_audit(action,target,detail) values('erasure_queued','contact','{}');
 return old;
end $$;

-- Call on the maintenance schedule regardless of Brevo credentials/send flags.
-- Also called by claim and Owner reads, so an inactive provider cannot prolong PII retention.
create function public.mail_erasure_expire() returns integer
language plpgsql security definer set search_path='' as $$
declare expired integer;
begin
 perform pg_advisory_xact_lock(1636,300);
 with expired_jobs as (
  update private.mail_contact_erasures set state='failed',email=null,lease=null,lease_until=null,
   failed_at=clock_timestamp(),outcome=case when created_at<=clock_timestamp()-interval '24 hours' then 'retention_limit' else 'attempt_limit' end
  where state in('pending','processing') and (created_at<=clock_timestamp()-interval '24 hours'
   or (attempts>=8 and (state='pending' or lease_until<=clock_timestamp())))
  returning id,outcome,attempts,last_http_status
 ), audited as (
  insert into private.mail_audit(action,target,detail)
  select 'erasure_failed',id::text,jsonb_build_object('reason',outcome,'attempt',attempts,'http_status',last_http_status) from expired_jobs returning 1
 ) select count(*)::integer into expired from audited;
 return expired;
end $$;

create or replace function public.mail_erasure_claim() returns jsonb
language plpgsql security definer set search_path='' as $$
declare job private.mail_contact_erasures%rowtype;
begin
 perform public.mail_erasure_expire();
 select * into job from private.mail_contact_erasures where
  (state='pending' and next_attempt_at<=clock_timestamp()) or
  (state='processing' and lease_until<=clock_timestamp())
 order by next_attempt_at,id limit 1 for update;
 if not found then return jsonb_build_object('job',null); end if;
 update private.mail_contact_erasures set state='processing',lease=gen_random_uuid(),
  lease_until=clock_timestamp()+interval '60 seconds',attempts=attempts+1
  where id=job.id returning * into job;
 return jsonb_build_object('job',jsonb_build_object('id',job.id,'email',job.email,'lease',job.lease));
end $$;

create or replace function public.mail_erasure_finish(p_id uuid,p_lease uuid,p_http_status integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare job private.mail_contact_erasures%rowtype; success boolean; failed boolean; reason text;
begin
 perform pg_advisory_xact_lock(1636,300);
 if p_http_status is null or p_http_status not between 0 and 599 then raise exception 'native_admin_invalid'; end if;
 select * into job from private.mail_contact_erasures where id=p_id and lease=p_lease and state='processing' for update;
 if not found then return false; end if;
 success:=p_http_status in(204,404);
 failed:=not success and (job.attempts>=8 or job.created_at<=clock_timestamp()-interval '24 hours');
 reason:=case when success then case p_http_status when 204 then 'deleted' else 'already_absent' end
  when failed then case when job.created_at<=clock_timestamp()-interval '24 hours' then 'retention_limit' else 'attempt_limit' end else 'retry' end;
 update private.mail_contact_erasures set state=case when success then 'completed' when failed then 'failed' else 'pending' end,
  email=case when success or failed then null else email end,email_fingerprint=case when success then null else email_fingerprint end,lease=null,lease_until=null,last_http_status=p_http_status,
  outcome=reason,completed_at=case when success then clock_timestamp() end,failed_at=case when failed then clock_timestamp() end,
  next_attempt_at=clock_timestamp()+make_interval(secs=>least(3600,5*power(2,least(job.attempts-1,10)))::integer)
 where id=job.id;
 insert into private.mail_audit(action,target,detail) values(case when failed then 'erasure_failed' else 'erasure_result' end,job.id::text,
  jsonb_build_object('completed',success,'failed',failed,'reason',reason,'http_status',p_http_status,'attempt',job.attempts));
 return true;
end $$;

create or replace function public.mail_record_consent(p_account uuid,p_email text,p_locale text,p_consent boolean,p_evidence text,p_waitlist boolean default false)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_account is not null and private.lock_account_write(p_account) then raise sqlstate '28000' using message='account_deleted'; end if;
 perform pg_advisory_xact_lock(1636,300);
 if exists(select 1 from private.mail_contact_erasures where
  (email=lower(btrim(p_email)) and state in('pending','processing')) or
  (state='failed' and email_fingerprint=encode(sha256(convert_to(lower(btrim(p_email)),'UTF8')),'hex'))) then
  if p_consent then raise exception 'mail_erasure_pending' using errcode='40001'; end if;
  return;
 end if;
 perform private.mail_record_consent_v1(p_account,p_email,p_locale,p_consent,p_evidence,p_waitlist);
end $$;

alter function public.mail_admin_execute(uuid,text,jsonb,text) rename to mail_admin_execute_v2;
alter function public.mail_admin_execute_v2(uuid,text,jsonb,text) set schema private;
revoke all on function private.mail_admin_execute_v2(uuid,text,jsonb,text) from public,anon,authenticated,service_role;
create function public.mail_admin_execute(p_actor uuid,p_action text,p_params jsonb,p_environment text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare response jsonb; failures jsonb;
begin
 -- Inner function authenticates Owner and takes the existing account/queue locks first.
 response:=private.mail_admin_execute_v2(p_actor,p_action,p_params,p_environment);
 if p_action='mail_list' then
  perform public.mail_erasure_expire();
  select coalesce(jsonb_agg(to_jsonb(f)),'[]') into failures from (
   select id,attempts,last_http_status,outcome as reason,failed_at from private.mail_contact_erasures
   where state='failed' order by failed_at,id limit 20
  ) f;
  response:=response||jsonb_build_object('cleanup',jsonb_build_object(
   'pending',(select count(*) from private.mail_contact_erasures where state in('pending','processing')),
   'completed',(select count(*) from private.mail_contact_erasures where state='completed'),
   'failed',(select count(*) from private.mail_contact_erasures where state='failed'),'failures',failures));
 end if;
 return response;
end $$;
revoke all on function public.mail_admin_execute(uuid,text,jsonb,text),public.mail_erasure_expire() from public,anon,authenticated,service_role;
grant execute on function public.mail_admin_execute(uuid,text,jsonb,text),public.mail_erasure_expire() to service_role;
-- Existing rows already over retention must not wait for the first deployment tick.
select public.mail_erasure_expire();
commit;
