-- VANTA-42 R4: least-privilege pull consumer; no destructive HTTP endpoint.
begin;
create role web_purchase_erasure nologin noinherit;
grant web_purchase_erasure to authenticator;
grant usage on schema public to web_purchase_erasure;
create table private.web_purchase_erasure_clock (
 singleton boolean primary key default true check(singleton),
 last_id bigint not null default 0
);
insert into private.web_purchase_erasure_clock values(true,0);
create table private.web_purchase_erasure_events (
 id bigint primary key,
 account_id uuid not null unique,
 deleted_at timestamptz not null default now()
);
create table private.web_purchase_erasure_consumer (
 singleton boolean primary key default true check(singleton),
 cursor_id bigint not null default 0,
 last_success_at timestamptz not null default now(),
 consecutive_failures integer not null default 0,
 last_code text,
 environment text check(environment in ('sandbox','production'))
);
insert into private.web_purchase_erasure_consumer(singleton) values(true);
create table private.billing_owner_notices (
 id uuid primary key default gen_random_uuid(),
 environment text not null check(environment in ('sandbox','production')),
 kind text not null check(kind in ('checkout_verification_pending','web_erasure_failed','web_erasure_worker_stale')),
 correlation_hash text not null check(correlation_hash ~ '^[0-9a-f]{64}$'),
 code text not null check(code ~ '^[a-z0-9_]{1,64}$'),
 created_at timestamptz not null default now(),
 next_attempt_at timestamptz not null default now(),
 attempts integer not null default 0,
 delivered_at timestamptz,
 unique(environment,kind,correlation_hash)
);
do $$ declare t regclass; begin
 foreach t in array array['private.web_purchase_erasure_clock'::regclass,
 'private.web_purchase_erasure_events'::regclass,'private.web_purchase_erasure_consumer'::regclass,
 'private.billing_owner_notices'::regclass] loop
  execute format('alter table %s enable row level security',t);
  execute format('revoke all on %s from public,anon,authenticated,service_role,web_purchase_erasure',t);
 end loop;
end $$;

create function private.enqueue_web_purchase_erasure(p_account uuid) returns void
language plpgsql security definer set search_path='' as $$
declare event_id bigint;
begin
 if exists(select 1 from private.web_purchase_erasure_events where account_id=p_account) then return; end if;
 -- Transactional counter serializes commit order. A sequence alone could let
 -- cursor N+1 commit before N and permanently skip a tombstone.
 update private.web_purchase_erasure_clock set last_id=last_id+1 where singleton returning last_id into event_id;
 insert into private.web_purchase_erasure_events(id,account_id) values(event_id,p_account);
end $$;
revoke all on function private.enqueue_web_purchase_erasure(uuid) from public,anon,authenticated,service_role,web_purchase_erasure;
create function private.record_web_purchase_erasure() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.deleted_at is not null then perform private.enqueue_web_purchase_erasure(new.account_id); end if;
 return new;
end $$;
revoke all on function private.record_web_purchase_erasure() from public,anon,authenticated,service_role,web_purchase_erasure;
create trigger web_purchase_erasure_tombstone after insert or update of deleted_at on public.account_identities
 for each row when(new.deleted_at is not null) execute function private.record_web_purchase_erasure();
do $$ declare account uuid; begin
 for account in select distinct account_id from public.account_identities where deleted_at is not null order by account_id loop
  perform private.enqueue_web_purchase_erasure(account);
 end loop;
end $$;

-- Project-signed server JWT only. A third-party Clerk JWT must not be able
-- to assume this service purpose even if its template exposes a role claim.
create function private.require_web_erasure_credential() returns boolean
language plpgsql stable security definer set search_path='' as $$
declare claims jsonb:=auth.jwt();
begin
 if claims->>'iss' is distinct from 'supabase' or claims->>'role' is distinct from 'web_purchase_erasure'
  or claims->>'aud' is distinct from 'authenticated' or claims->>'purpose' is distinct from 'web_purchase_erasure'
 then raise sqlstate '28000' using message='web_erasure_credential_required'; end if;
 return true;
end $$;
revoke all on function private.require_web_erasure_credential() from public,anon,authenticated,service_role,web_purchase_erasure;
create function public.web_purchase_erasure_pull(p_limit integer default 50) returns jsonb
language sql stable security definer set search_path='' as $$
 with batch as (
  select e.id,e.account_id from private.web_purchase_erasure_events e,
   private.web_purchase_erasure_consumer c where e.id>c.cursor_id order by e.id limit greatest(1,least(p_limit,50))
 ) select jsonb_build_object('cursor',c.cursor_id,
   'next_cursor',coalesce((select max(id) from batch),c.cursor_id),
   'items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'account_id',account_id) order by id) from batch),'[]'))
 from private.web_purchase_erasure_consumer c where private.require_web_erasure_credential()
$$;

create function public.web_purchase_erasure_ack(p_from_cursor bigint,p_to_cursor bigint,p_count integer,p_environment text)
returns boolean language plpgsql security definer set search_path='' as $$
declare c private.web_purchase_erasure_consumer;
begin
 perform private.require_web_erasure_credential();
 if p_environment not in ('sandbox','production') or p_environment is null or p_count not between 0 and 50
    or p_count is null or p_from_cursor is null or p_to_cursor is null then raise exception 'invalid_erasure_ack'; end if;
 select * into c from private.web_purchase_erasure_consumer where singleton for update;
 if p_to_cursor<c.cursor_id then return true; end if;
 if p_from_cursor<>c.cursor_id then return p_to_cursor=c.cursor_id; end if;
 if p_to_cursor<c.cursor_id or (select count(*) from private.web_purchase_erasure_events where id>c.cursor_id and id<=p_to_cursor)<>p_count
   or (p_count>0 and not exists(select 1 from private.web_purchase_erasure_events where id=p_to_cursor)) then return false; end if;
 update private.web_purchase_erasure_consumer set cursor_id=p_to_cursor,last_success_at=now(),
  consecutive_failures=0,last_code=null,environment=p_environment where singleton;
 return true;
end $$;

create function public.web_purchase_erasure_failed(p_code text,p_environment text) returns void
language plpgsql security definer set search_path='' as $$
declare failures integer;
begin
 perform private.require_web_erasure_credential();
 if p_environment not in ('sandbox','production') or p_environment is null or p_code not in
 ('erasure_not_configured','erasure_upstream_unavailable','erasure_invalid_batch','erasure_d1_failed','erasure_ack_failed','attempt_cleanup_failed')
 or p_code is null then raise exception 'invalid_erasure_failure'; end if;
 update private.web_purchase_erasure_consumer set consecutive_failures=consecutive_failures+1,
 last_code=p_code,environment=p_environment where singleton returning consecutive_failures into failures;
 if failures>=3 then
  insert into private.billing_owner_notices(environment,kind,correlation_hash,code)
   values(p_environment,'web_erasure_failed',encode(extensions.digest('web_purchase_erasure:'||(select last_success_at::text from private.web_purchase_erasure_consumer),'sha256'),'hex'),p_code)
   on conflict(environment,kind,correlation_hash) do update set code=excluded.code;
 end if;
end $$;

-- Bounded read-only state lookup for D1 retention. No URLs/customer data or
-- account mutation; key triples come from the Worker's own D1 rows.
create function public.web_purchase_attempt_states(p_keys jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_web_erasure_credential();
 if jsonb_typeof(p_keys) is distinct from 'array' or jsonb_array_length(p_keys)>50 then raise exception 'invalid_attempt_lookup'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('account_id',k.account_id,'attempt_id',k.attempt_id,
  'environment',k.environment,'resolution',a.resolution,'status',a.status,'exists',a.user_id is not null))
 from jsonb_to_recordset(p_keys) k(account_id uuid,attempt_id uuid,environment text)
 left join public.billing_checkout_attempts a on a.user_id=k.account_id and a.attempt_id=k.attempt_id and a.environment=k.environment),'[]');
end $$;

revoke all on function public.web_purchase_erasure_pull(integer),public.web_purchase_erasure_ack(bigint,bigint,integer,text),
 public.web_purchase_erasure_failed(text,text),public.web_purchase_attempt_states(jsonb)
 from public,anon,authenticated,service_role;
grant execute on function public.web_purchase_erasure_pull(integer),public.web_purchase_erasure_ack(bigint,bigint,integer,text),
 public.web_purchase_erasure_failed(text,text),public.web_purchase_attempt_states(jsonb) to web_purchase_erasure;

-- Owner notices use the same durable delivery mechanism as failed refunds.
create function public.billing_operational_owner_alerts(p_environment text) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(row),'[]') from (
  select jsonb_build_object('order_id',c.order_id,'kind','checkout_refund_failed','code',c.last_error_code) row,c.alert_next_at due
   from private.billing_checkout_compensations c where c.environment=p_environment and c.alert_pending and c.alert_next_at<=now()
  union all
  select jsonb_build_object('order_id',n.id,'kind',n.kind,'code',n.code) row,n.next_attempt_at due from private.billing_owner_notices n
   where n.environment=p_environment and n.delivered_at is null and n.next_attempt_at<=now()
  order by due
  limit 5
 ) notices
$$;
create function public.billing_finish_operational_owner_alert(p_environment text,p_order_id uuid,p_kind text,p_delivered boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_kind='checkout_refund_failed' then
  perform public.billing_finish_checkout_owner_alert(p_environment,p_order_id,p_delivered);
 else
  update private.billing_owner_notices set delivered_at=case when p_delivered then now() else delivered_at end,
   next_attempt_at=now()+make_interval(secs=>least(3600,30*power(2,least(attempts,7)))::integer),attempts=attempts+1
   where environment=p_environment and id=p_order_id and kind=p_kind and delivered_at is null;
 end if;
end $$;

create function public.billing_checkout_maintenance(p_environment text) returns void
language plpgsql security definer set search_path='' as $$
declare retained public.billing_checkout_attempts; deleted boolean;
begin
 if p_environment not in ('sandbox','production') or p_environment is null then raise exception 'invalid_checkout_environment'; end if;
 -- Alert unknown dispatched payments, never silently erase them.
 insert into private.billing_owner_notices(environment,kind,correlation_hash,code)
 select p_environment,'checkout_verification_pending',encode(extensions.digest(a.attempt_id::text||':'||p_environment,'sha256'),'hex'),'checkout_verification_pending'
 from public.billing_checkout_attempts a where a.environment=p_environment and a.resolution is null
  and a.provider_request_started_at is not null and a.created_at<now()-interval '1 hour'
  and (a.status in ('creating','uncertain') or a.provider_checkout_status='confirmed') on conflict do nothing;
 -- Independent watchdog: expired/missing Worker credentials cannot suppress alerts
 -- by preventing the Worker from reporting its own failure.
 if exists(select 1 from private.web_purchase_erasure_consumer where last_success_at<now()-interval '15 minutes') then
  insert into private.billing_owner_notices(environment,kind,correlation_hash,code)
   values(p_environment,'web_erasure_worker_stale',encode(extensions.digest('web_purchase_erasure:'||(select last_success_at::text from private.web_purchase_erasure_consumer),'sha256'),'hex'),'erasure_worker_stale')
   on conflict do nothing;
 end if;
 -- Keep durable financial bindings. Purge only terminal transient attempts after 30d.
 for retained in select * from public.billing_checkout_attempts where environment=p_environment and resolution is not null
  and updated_at<now()-interval '30 days' order by user_id,attempt_id limit 100 loop
  deleted:=private.lock_account_write(retained.user_id);
  -- Deleted accounts remain governed by #1622; no account-owned write bypass.
  if not deleted then delete from public.billing_checkout_attempts where user_id=retained.user_id and attempt_id=retained.attempt_id
    and resolution is not null and updated_at<now()-interval '30 days'; end if;
 end loop;
 delete from private.billing_owner_notices where delivered_at<now()-interval '30 days';
 delete from private.billing_checkout_compensation_audit where observed_at<now()-interval '30 days';
end $$;
revoke all on function public.billing_operational_owner_alerts(text),public.billing_finish_operational_owner_alert(text,uuid,text,boolean),
 public.billing_checkout_maintenance(text) from public,anon,authenticated,web_purchase_erasure;
grant execute on function public.billing_operational_owner_alerts(text),public.billing_finish_operational_owner_alert(text,uuid,text,boolean),
 public.billing_checkout_maintenance(text) to service_role;
comment on role web_purchase_erasure is
 'Dedicated short-lived server JWT role: bounded read-only deletion/state pull, fixed consumer ACK/failure only. No account, payment, grant or raw-table write.';
commit;
