-- R5: compensation is opt-in and requires authoritative terminal disposition.
begin;
create table private.billing_compensation_policy (
 environment text primary key check(environment in ('sandbox','production')),
 enabled boolean not null default false,
 amount_basis text check(amount_basis in ('net','gross'))
);
insert into private.billing_compensation_policy(environment) values('sandbox'),('production');
create table private.billing_checkout_dispositions (
 environment text not null,
 order_id uuid not null,
 reason text not null check(reason in ('account_deleted','checkout_attempt_expired')),
 resolved_at timestamptz not null default now(),
 primary key(environment,order_id)
);
create table private.web_purchase_erasure_proof_key (
 environment text primary key check(environment in ('sandbox','production')),
 proof_key text not null check(length(proof_key)>=32)
);
alter table private.billing_compensation_policy enable row level security;
alter table private.billing_checkout_dispositions enable row level security;
alter table private.web_purchase_erasure_proof_key enable row level security;
revoke all on private.billing_compensation_policy,private.billing_checkout_dispositions,private.web_purchase_erasure_proof_key
 from public,anon,authenticated,service_role,web_purchase_erasure;
alter table private.billing_owner_notices drop constraint billing_owner_notices_kind_check;
alter table private.billing_owner_notices add check(kind in ('checkout_verification_pending','web_erasure_failed','web_erasure_worker_stale','checkout_review'));
alter table private.billing_checkout_compensations add column refund_amount_basis text check(refund_amount_basis in ('net','gross'));

create function public.billing_checkout_incident(p_environment text,p_correlation text,p_code text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_environment not in ('sandbox','production') or p_environment is null or p_code is null
  or p_code !~ '^[a-z0-9_]{1,64}$' or length(coalesce(p_correlation,''))>128 then raise exception 'invalid_checkout_incident'; end if;
 insert into private.billing_owner_notices(environment,kind,correlation_hash,code)
 values(p_environment,'checkout_review',encode(extensions.digest(coalesce(p_correlation,'unknown')||':'||p_code,'sha256'),'hex'),p_code)
 on conflict do nothing;
end $$;
revoke all on function public.billing_checkout_incident(text,text,text) from public,anon,authenticated,web_purchase_erasure;
grant execute on function public.billing_checkout_incident(text,text,text) to service_role;

alter function public.billing_observe_checkout_payment(text,uuid,uuid,uuid,uuid,uuid,bigint,text,text[],uuid,uuid)
 rename to observe_checkout_payment_unchecked;
alter function public.observe_checkout_payment_unchecked(text,uuid,uuid,uuid,uuid,uuid,bigint,text,text[],uuid,uuid) set schema private;
revoke all on function private.observe_checkout_payment_unchecked(text,uuid,uuid,uuid,uuid,uuid,bigint,text,text[],uuid,uuid)
 from public,anon,authenticated,service_role,web_purchase_erasure;
create function public.billing_observe_checkout_payment(
 p_environment text,p_order_id uuid,p_checkout_id uuid,p_organization_id uuid,p_product_id uuid,
 p_subscription_id uuid,p_net_amount bigint,p_currency text,p_capabilities text[],
 p_attempt_id uuid default null,p_dispatch_token uuid default null) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.billing_checkout_bindings b where b.environment=p_environment and b.provider_checkout_id=p_checkout_id::text)
 and not exists(select 1 from public.billing_checkout_attempts a where a.environment=p_environment
  and a.attempt_id=p_attempt_id and a.dispatch_token=p_dispatch_token and a.dispatch_product_id=p_product_id
  and a.provider_request_started_at is not null) then
  perform public.billing_checkout_incident(p_environment,p_order_id::text,'checkout_without_vantare_attempt');
  return;
 end if;
 perform private.observe_checkout_payment_unchecked(p_environment,p_order_id,p_checkout_id,p_organization_id,p_product_id,
 p_subscription_id,p_net_amount,p_currency,p_capabilities,p_attempt_id,p_dispatch_token);
end $$;
revoke all on function public.billing_observe_checkout_payment(text,uuid,uuid,uuid,uuid,uuid,bigint,text,text[],uuid,uuid)
 from public,anon,authenticated,web_purchase_erasure;
grant execute on function public.billing_observe_checkout_payment(text,uuid,uuid,uuid,uuid,uuid,bigint,text,text[],uuid,uuid) to service_role;

-- Called only after the real webhook processor returned its outcome. Recheck
-- the canonical tombstone/expired sealed attempt; never trust the callback alone.
create function public.billing_resolve_checkout_non_applicable(p_environment text,p_order_id uuid,p_reason text) returns boolean
language plpgsql security definer set search_path='' as $$
declare c private.billing_checkout_compensations; a public.billing_checkout_attempts;
begin
 select * into c from private.billing_checkout_compensations where environment=p_environment and order_id=p_order_id;
 if not found then return false; end if;
 if p_reason='account_deleted' then
  if not exists(select 1 from public.billing_checkout_bindings b join public.account_identities i on i.account_id=b.user_id
    where b.environment=p_environment and b.provider_checkout_id=c.checkout_id::text and i.deleted_at is not null) then return false; end if;
 elsif p_reason='checkout_attempt_expired' then
  select * into a from public.billing_checkout_attempts where environment=p_environment
   and ((attempt_id=c.attempt_id and dispatch_token=c.dispatch_token and dispatch_product_id=c.product_id)
    or exists(select 1 from public.billing_checkout_bindings b where b.environment=p_environment and b.provider_checkout_id=c.checkout_id::text
      and b.user_id=billing_checkout_attempts.user_id and b.attempt_id=billing_checkout_attempts.attempt_id));
  if not found then return false; end if;
  perform private.lock_accounts_before_rows(array[a.user_id]);
  if not exists(select 1 from public.billing_checkout_attempts where user_id=a.user_id and attempt_id=a.attempt_id
   and resolution='unpaid_expired' and created_at<now()-interval '24 hours') then return false; end if;
  -- This is now an explicit terminal policy decision, not a generic quarantine.
  update public.billing_webhook_inbox set quarantine_reason='checkout_attempt_expired',updated_at=now()
   where provider='polar' and environment=p_environment and status='quarantined' and quarantine_reason='unresolved_user_id'
    and payload#>>'{data,id}'=c.order_id::text;
 else return false;
 end if;
 insert into private.billing_checkout_dispositions(environment,order_id,reason) values(p_environment,p_order_id,p_reason) on conflict do nothing;
 update private.billing_checkout_compensations set next_attempt_at=greatest(now(),first_seen_at+interval '15 minutes')
  where environment=p_environment and order_id=p_order_id and state='waiting' and selected_at is null;
 return true;
end $$;
revoke all on function public.billing_resolve_checkout_non_applicable(text,uuid,text) from public,anon,authenticated,web_purchase_erasure;
grant execute on function public.billing_resolve_checkout_non_applicable(text,uuid,text) to service_role;

alter function public.billing_claim_checkout_compensation(text,uuid) rename to claim_checkout_compensation_unchecked;
alter function public.claim_checkout_compensation_unchecked(text,uuid) set schema private;
revoke all on function private.claim_checkout_compensation_unchecked(text,uuid) from public,anon,authenticated,service_role,web_purchase_erasure;
create function public.billing_claim_checkout_compensation(p_environment text,p_token uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.billing_checkout_compensations; basis text; enabled boolean; job jsonb;
begin
 select p.enabled,p.amount_basis into enabled,basis from private.billing_compensation_policy p where p.environment=p_environment;
 for c in select * from private.billing_checkout_compensations where environment=p_environment
  and state in ('waiting','refunding') and next_attempt_at<=now() and (lease_until is null or lease_until<=now())
  order by next_attempt_at,order_id limit 50 loop
  if c.selected_at is null and private.checkout_was_fulfilled(c.environment,c.order_id,c.checkout_id,c.product_id,c.subscription_id,c.capabilities) then
   update private.billing_checkout_compensations set state='activated' where environment=c.environment and order_id=c.order_id
    and selected_at is null and state='waiting';
   continue;
  end if;
  if not coalesce(enabled,false) or basis is null then
   perform public.billing_checkout_incident(p_environment,c.order_id::text,'automatic_refunds_disabled');
  elsif not exists(select 1 from private.billing_checkout_dispositions d where d.environment=p_environment and d.order_id=c.order_id)
   or exists(select 1 from public.billing_webhook_inbox i where i.provider='polar' and i.environment=p_environment
    and (i.payload#>>'{data,id}'=c.order_id::text or i.payload#>>'{data,checkout_id}'=c.checkout_id::text)
    and (i.status in ('received','processing','failed') or
     (i.status='quarantined' and coalesce(i.quarantine_reason,'') not in ('account_deleted','checkout_attempt_expired')))) then
   perform public.billing_checkout_incident(p_environment,c.order_id::text,'checkout_requires_owner_review');
  else
   update private.billing_checkout_compensations set refund_amount_basis=coalesce(refund_amount_basis,basis) where environment=p_environment and order_id=c.order_id;
   -- The reviewed implementation locks UUID before the financial row and
   -- rechecks historical fulfillment. Only this public guarded wrapper can call it.
   job:=private.claim_checkout_compensation_unchecked(p_environment,p_token);
   if job is not null and job->>'order_id'<>c.order_id::text then raise exception 'compensation_candidate_changed'; end if;
   return job;
  end if;
  update private.billing_checkout_compensations set next_attempt_at=now()+interval '1 hour'
   where environment=p_environment and order_id=c.order_id and (lease_until is null or lease_until<=now());
 end loop;
 return null;
end $$;
revoke all on function public.billing_claim_checkout_compensation(text,uuid) from public,anon,authenticated,web_purchase_erasure;
grant execute on function public.billing_claim_checkout_compensation(text,uuid) to service_role;

-- A never-published, unrecovered dispatched attempt has a bounded 24h hold.
-- No old hosted URL is made reusable; any late order must pass the terminal
-- disposition above. Known/published/confirmed sessions still require Polar.
create or replace function public.billing_expire_unpublished_checkouts(p_environment text,p_evaluated_at timestamptz default now())
returns integer language plpgsql security definer set search_path='' as $$
declare a public.billing_checkout_attempts; n integer:=0;
begin
 for a in select * from public.billing_checkout_attempts where environment=p_environment and resolution is null
  and provider_checkout_id is null and recovery_checkout_id is null and status in ('creating','uncertain')
  and expires_at<=p_evaluated_at
  and (provider_request_started_at is null or (dispatch_product_id is not null and created_at<p_evaluated_at-interval '24 hours'))
 order by user_id,attempt_id limit 100 loop
  if private.lock_account_write(a.user_id) then continue; end if;
  update public.billing_checkout_attempts set resolution='unpaid_expired',updated_at=now()
   where user_id=a.user_id and attempt_id=a.attempt_id and resolution is null and provider_checkout_id is null and recovery_checkout_id is null
    and (provider_request_started_at is null or (dispatch_product_id is not null and created_at<p_evaluated_at-interval '24 hours'));
  if found then
   n:=n+1;
   if a.provider_request_started_at is not null then
    perform public.billing_checkout_incident(p_environment,a.attempt_id::text,'unpublished_checkout_expired_unconfirmed');
   end if;
  end if;
 end loop;
 return n;
end $$;

-- ACK evidence uses a second independent key, never the pull JWT. Only a Worker
-- that checked zero remaining rows and possesses the receipt key can advance it.
create function public.web_purchase_erasure_ack(p_from_cursor bigint,p_to_cursor bigint,p_count integer,p_environment text,
 p_erasure_digest text,p_remaining_rows integer,p_receipt text) returns boolean
language plpgsql security definer set search_path='' as $$
declare expected text; secret text; frame text; count_actual integer;
begin
 perform private.require_web_erasure_credential();
 if p_from_cursor is null or p_to_cursor is null or p_count is null or p_count not between 0 and 50
  or p_remaining_rows is distinct from 0 then return false; end if;
 select proof_key into secret from private.web_purchase_erasure_proof_key where environment=p_environment;
 if secret is null then return false; end if;
 select count(*)::integer,encode(extensions.digest(coalesce(string_agg(id::text||':'||account_id::text,E'\n' order by id),''),'sha256'),'hex')
 into count_actual,expected from private.web_purchase_erasure_events where id>p_from_cursor and id<=p_to_cursor;
 if count_actual<>p_count or p_erasure_digest is distinct from expected then return false; end if;
 frame:='v1'||E'\n'||p_from_cursor||E'\n'||p_to_cursor||E'\n'||p_count||E'\n0\n'||expected;
 if p_receipt is null or p_receipt !~ '^[0-9a-f]{64}$'
  or p_receipt<>encode(extensions.hmac(frame,secret,'sha256'),'hex') then return false; end if;
 -- Inline the original CAS after evidence validation; the legacy ACK is disabled below.
 declare c private.web_purchase_erasure_consumer; begin
 select * into c from private.web_purchase_erasure_consumer where singleton for update;
 if p_to_cursor<c.cursor_id then return true; end if;
 if p_from_cursor<>c.cursor_id then return p_to_cursor=c.cursor_id; end if;
 if p_to_cursor<c.cursor_id or (p_count>0 and not exists(select 1 from private.web_purchase_erasure_events where id=p_to_cursor)) then return false; end if;
 update private.web_purchase_erasure_consumer set cursor_id=p_to_cursor,last_success_at=now(),consecutive_failures=0,last_code=null,environment=p_environment where singleton;
 return true;
 end;
end $$;
create or replace function public.web_purchase_erasure_ack(p_from_cursor bigint,p_to_cursor bigint,p_count integer,p_environment text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform private.require_web_erasure_credential();
 return false;
end $$;
revoke all on function public.web_purchase_erasure_ack(bigint,bigint,integer,text) from public,anon,authenticated,service_role,web_purchase_erasure;
revoke all on function public.web_purchase_erasure_ack(bigint,bigint,integer,text,text,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.web_purchase_erasure_ack(bigint,bigint,integer,text,text,integer,text) to web_purchase_erasure;

-- Remove inherited PUBLIC execution from application RPCs. Preserve access
-- for the three existing API principals that already inherited it; the private
-- erasure consumer must have only its explicit RPC grants.
do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public'
 and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
 and exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where acl.grantee=0 and acl.privilege_type='EXECUTE') loop
  execute format('revoke execute on function %s from public',f.signature);
  execute format('grant execute on function %s to anon,authenticated,service_role',f.signature);
 end loop;
end $$;
commit;
