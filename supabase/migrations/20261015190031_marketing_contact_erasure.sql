-- #1636 R2 / P2-1. Durable provider erasure, inert until its worker is configured.
begin;
alter table private.mail_contacts add column sync_lease uuid;
alter table private.mail_contacts add column sync_lease_until timestamptz;
create table private.mail_contact_erasures (
 id uuid primary key default gen_random_uuid(),
 email text check(email=lower(btrim(email)) and length(email)<=320),
 account_id uuid references public.profiles(id) on delete set null,
 state text not null default 'pending' check(state in('pending','processing','completed')),
 attempts integer not null default 0 check(attempts>=0),
 next_attempt_at timestamptz not null default clock_timestamp(),
 lease uuid,lease_until timestamptz,
 last_http_status integer check(last_http_status between 0 and 599),
 outcome text check(outcome in('deleted','already_absent','retry')),
 created_at timestamptz not null default clock_timestamp(),completed_at timestamptz,
 check((state='completed')=(email is null))
);
create unique index mail_erasure_active_email on private.mail_contact_erasures(email) where email is not null;
create index mail_erasure_due on private.mail_contact_erasures(next_attempt_at) where state<>'completed';
alter table private.mail_contact_erasures enable row level security;
revoke all on private.mail_contact_erasures from public,anon,authenticated,service_role;

create function private.mail_queue_contact_erasure() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(1636,300);
 -- Drain only after an already-leased sync has expired. A sync cannot start after DELETE.
 insert into private.mail_contact_erasures(email,account_id,next_attempt_at)
 values(old.email,coalesce(old.erasure_account,old.account_id),greatest(clock_timestamp(),old.sync_lease_until))
 on conflict(email) where email is not null do nothing;
 insert into private.mail_audit(action,target,detail) values('erasure_queued','contact','{}');
 return old;
end $$;
create trigger mail_queue_contact_erasure before delete on private.mail_contacts
 for each row execute function private.mail_queue_contact_erasure();
revoke all on function private.mail_queue_contact_erasure() from public,anon,authenticated,service_role;

create function public.mail_erasure_claim() returns jsonb
language plpgsql security definer set search_path='' as $$
declare job private.mail_contact_erasures%rowtype;
begin
 perform pg_advisory_xact_lock(1636,300);
 select * into job from private.mail_contact_erasures where
  (state='pending' and next_attempt_at<=clock_timestamp()) or
  (state='processing' and lease_until<=clock_timestamp())
 order by next_attempt_at,id limit 1 for update;
 if not found then return jsonb_build_object('job',null); end if;
 update private.mail_contact_erasures set state='processing',lease=gen_random_uuid(),
  lease_until=clock_timestamp()+interval '60 seconds',attempts=least(attempts+1,1000000)
  where id=job.id returning * into job;
 return jsonb_build_object('job',jsonb_build_object('id',job.id,'email',job.email,'lease',job.lease));
end $$;

create function public.mail_erasure_finish(p_id uuid,p_lease uuid,p_http_status integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare job private.mail_contact_erasures%rowtype; success boolean;
begin
 perform pg_advisory_xact_lock(1636,300);
 if p_http_status is null or p_http_status not between 0 and 599 then raise exception 'native_admin_invalid'; end if;
 select * into job from private.mail_contact_erasures where id=p_id and lease=p_lease and state='processing' for update;
 if not found then return false; end if;
 success:=p_http_status in(204,404);
 update private.mail_contact_erasures set state=case when success then 'completed' else 'pending' end,
  email=case when success then null else email end,lease=null,lease_until=null,last_http_status=p_http_status,
  outcome=case p_http_status when 204 then 'deleted' when 404 then 'already_absent' else 'retry' end,
  completed_at=case when success then clock_timestamp() end,
  next_attempt_at=clock_timestamp()+make_interval(secs=>least(3600,5*power(2,least(job.attempts-1,10)))::integer)
 where id=job.id;
 insert into private.mail_audit(action,target,detail) values('erasure_result',job.id::text,
  jsonb_build_object('completed',success,'http_status',p_http_status,'attempt',job.attempts));
 return true;
end $$;
revoke all on function public.mail_erasure_claim(),public.mail_erasure_finish(uuid,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.mail_erasure_claim(),public.mail_erasure_finish(uuid,uuid,integer) to service_role;

-- Keep the existing v1 behavior; the wrapper adds erasure/sync fencing only.
alter function public.mail_admin_execute(uuid,text,jsonb,text) rename to mail_admin_execute_v1;
alter function public.mail_admin_execute_v1(uuid,text,jsonb,text) set schema private;
revoke all on function private.mail_admin_execute_v1(uuid,text,jsonb,text) from public,anon,authenticated,service_role;
create function public.mail_admin_execute(p_actor uuid,p_action text,p_params jsonb,p_environment text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare contact private.mail_contacts%rowtype; response jsonb;
begin
 if p_actor is null or private.lock_account_write(p_actor) then raise exception 'native_admin_forbidden' using errcode='42501'; end if;
 perform private.native_admin_require_owner(p_actor);
 perform pg_advisory_xact_lock(1636,300);
 if p_environment is null or p_environment not in('sandbox','production') or jsonb_typeof(p_params) is distinct from 'object' then raise exception 'native_admin_invalid'; end if;
 if p_action='mail_sync_lease' then
  if p_params-array['email','revision']<>'{}' then raise exception 'native_admin_invalid'; end if;
  select * into contact from private.mail_contacts where email=p_params->>'email' and revision=(p_params->>'revision')::bigint
   and (sync_lease_until is null or sync_lease_until<clock_timestamp()) for update;
  if not found then return jsonb_build_object('allowed',false); end if;
  update private.mail_contacts set sync_lease=gen_random_uuid(),sync_lease_until=clock_timestamp()+interval '60 seconds'
   where email=contact.email returning * into contact;
  return jsonb_build_object('allowed',true,'lease',contact.sync_lease,'consent',contact.consent,
   'groups',private.mail_groups(contact.email,p_environment));
 elsif p_action='mail_sync_ack' then
  if p_params-array['email','revision','lease']<>'{}' then raise exception 'native_admin_invalid'; end if;
  update private.mail_contacts set synced_revision=case when revision=(p_params->>'revision')::bigint then revision else synced_revision end,
   sync_lease=null,sync_lease_until=null where email=p_params->>'email' and sync_lease=(p_params->>'lease')::uuid;
  return '{}'::jsonb;
 end if;
 response:=private.mail_admin_execute_v1(p_actor,p_action,p_params,p_environment);
 if p_action='mail_list' then
  response:=response||jsonb_build_object('cleanup',jsonb_build_object(
   'pending',(select count(*) from private.mail_contact_erasures where state<>'completed'),
   'completed',(select count(*) from private.mail_contact_erasures where state='completed')));
 end if;
 return response;
end $$;
revoke all on function public.mail_admin_execute(uuid,text,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.mail_admin_execute(uuid,text,jsonb,text) to service_role;

alter function public.mail_record_consent(uuid,text,text,boolean,text,boolean) rename to mail_record_consent_v1;
alter function public.mail_record_consent_v1(uuid,text,text,boolean,text,boolean) set schema private;
revoke all on function private.mail_record_consent_v1(uuid,text,text,boolean,text,boolean) from public,anon,authenticated,service_role;
create function public.mail_record_consent(p_account uuid,p_email text,p_locale text,p_consent boolean,p_evidence text,p_waitlist boolean default false)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_account is not null and private.lock_account_write(p_account) then raise sqlstate '28000' using message='account_deleted'; end if;
 perform pg_advisory_xact_lock(1636,300);
 if exists(select 1 from private.mail_contact_erasures where email=lower(btrim(p_email)) and state<>'completed') then
  if p_consent then raise exception 'mail_erasure_pending' using errcode='40001'; end if;
  return;
 end if;
 perform private.mail_record_consent_v1(p_account,p_email,p_locale,p_consent,p_evidence,p_waitlist);
end $$;
revoke all on function public.mail_record_consent(uuid,text,text,boolean,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.mail_record_consent(uuid,text,text,boolean,text,boolean) to service_role;
commit;
