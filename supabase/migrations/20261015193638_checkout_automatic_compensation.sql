-- VANTA-42 / Isaac: automatic compensation, never support-led recovery.
begin;
alter table public.billing_checkout_attempts
 add column resolution text check(resolution in ('unpaid_expired','refunded')),
 add column provider_request_started_at timestamptz,
 add column dispatch_token uuid not null default gen_random_uuid() unique,
 add column dispatch_product_id uuid,
 add column recovery_checkout_id uuid,
 add column provider_checkout_status text;
-- Existing unknown calls remain uncertain; the new protocol records dispatch.
update public.billing_checkout_attempts set provider_request_started_at=created_at;
-- Keep provider IDs/bindings for late events; resolution never deletes evidence.
create table private.billing_checkout_compensations (
 environment text not null check(environment in ('sandbox','production')),
 order_id uuid not null,
 checkout_id uuid not null,
 organization_id uuid not null,
 product_id uuid not null,
 subscription_id uuid,
 attempt_id uuid,
 dispatch_token uuid,
 net_amount bigint not null check(net_amount>0),
 currency text not null check(currency ~ '^[a-z]{3}$'),
 capabilities text[] not null check(cardinality(capabilities) between 1 and 8),
 state text not null default 'waiting' check(state in ('waiting','activated','refunding','refunded')),
 first_seen_at timestamptz not null default now(),
 next_attempt_at timestamptz not null default now()+interval '15 minutes',
 selected_at timestamptz,
 attempt_count integer not null default 0,
 lease_token uuid,
 lease_until timestamptz,
 refund_id uuid,
 last_error_code text,
 alert_pending boolean not null default false,
 alert_next_at timestamptz,
 alert_attempts integer not null default 0,
 alert_delivered_at timestamptz,
 primary key(environment,order_id)
);
create index checkout_compensation_due on private.billing_checkout_compensations(environment,next_attempt_at)
 where state in ('waiting','refunding');
alter table private.billing_checkout_compensations enable row level security;
revoke all on private.billing_checkout_compensations from public,anon,authenticated,service_role;
create table private.billing_checkout_compensation_audit (
 id bigint generated always as identity primary key,
 environment text not null,
 order_id uuid not null,
 observed_at timestamptz not null default now(),
 state text not null,
 code text not null check(code ~ '^[a-z0-9_]{1,64}$'),
 refund_id uuid,
 foreign key(environment,order_id) references private.billing_checkout_compensations
);
alter table private.billing_checkout_compensation_audit enable row level security;
revoke all on private.billing_checkout_compensation_audit from public,anon,authenticated,service_role;

-- Once compensation is selected, late/replayed grants cannot activate it.
-- No account/FK is added for an orphan or a deleted identity.
create or replace view public.billing_effective_access_grants as
select g.* from public.billing_access_grants g
where not exists(select 1 from public.account_identities i where i.account_id=g.user_id and i.deleted_at is not null)
 and not exists(select 1 from public.billing_access_blocks b
   where b.user_id=g.user_id and b.environment=g.environment and b.blocked
    and ((b.source_type=g.source_type and b.source_id=g.source_id)
     or (b.source_type='subscription' and g.source_type='subscription_recovery'
       and b.source_id=g.metadata->>'subscription_id')))
 and not exists(select 1 from private.billing_checkout_compensations c
   where c.environment=g.environment and c.selected_at is not null
    and ((g.source_type='order' and g.source_id=c.order_id::text)
      or (g.source_type='subscription' and g.source_id=c.subscription_id::text)
      or (g.source_type='subscription_recovery' and g.metadata->>'subscription_id'=c.subscription_id::text)));
revoke all on public.billing_effective_access_grants from public,anon,authenticated;
grant select on public.billing_effective_access_grants to service_role;

-- Retained complete source grants prove historical fulfillment even after
-- expiry/deletion. Never refund an old purchase merely because access ended.
create function private.checkout_was_fulfilled(p_environment text,p_order uuid,p_checkout uuid,
 p_product uuid,p_subscription uuid,p_capabilities text[]) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.billing_orders o join public.billing_checkout_bindings b
   on b.environment=o.environment and b.provider_checkout_id=o.provider_checkout_id and b.user_id=o.user_id
  where o.environment=p_environment and o.provider_order_id=p_order::text and o.provider_checkout_id=p_checkout::text
   and o.provider_product_id=p_product::text and not exists(
    select 1 from unnest(p_capabilities) capability where not exists(
     select 1 from public.billing_access_grants g where g.user_id=o.user_id and g.environment=p_environment
      and g.capability=capability and ((g.source_type='order' and g.source_id=p_order::text)
       or (g.source_type='subscription' and g.source_id=p_subscription::text)))))
$$;
revoke all on function private.checkout_was_fulfilled(text,uuid,uuid,uuid,uuid,text[]) from public,anon,authenticated,service_role;

-- API-derived order only: this service RPC does not accept a customer UUID.
create function public.billing_observe_checkout_payment(
 p_environment text,p_order_id uuid,p_checkout_id uuid,p_organization_id uuid,
 p_product_id uuid,p_subscription_id uuid,p_net_amount bigint,p_currency text,p_capabilities text[],
 p_attempt_id uuid default null,p_dispatch_token uuid default null
) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_capabilities is null or cardinality(p_capabilities)=0
    or not p_capabilities <@ array['vantare.plan.pro','vantare.channel.testers','vantare.channel.nightly','vantare.edition.launch_v1']::text[] then
   raise exception 'invalid_compensation_capabilities';
 end if;
 insert into private.billing_checkout_compensations(environment,order_id,checkout_id,organization_id,
   product_id,subscription_id,net_amount,currency,capabilities,state,attempt_id,dispatch_token)
 values(p_environment,p_order_id,p_checkout_id,p_organization_id,p_product_id,p_subscription_id,p_net_amount,p_currency,p_capabilities,
  case when private.checkout_was_fulfilled(p_environment,p_order_id,p_checkout_id,p_product_id,p_subscription_id,p_capabilities)
    then 'activated' else 'waiting' end,
  (select a.attempt_id from public.billing_checkout_attempts a where a.attempt_id=p_attempt_id and a.dispatch_token=p_dispatch_token
    and a.environment=p_environment and a.dispatch_product_id=p_product_id and a.provider_request_started_at is not null),
  (select a.dispatch_token from public.billing_checkout_attempts a where a.attempt_id=p_attempt_id and a.dispatch_token=p_dispatch_token
    and a.environment=p_environment and a.dispatch_product_id=p_product_id and a.provider_request_started_at is not null))
 on conflict do nothing;
 if not exists(select 1 from private.billing_checkout_compensations c where c.environment=p_environment
   and c.order_id=p_order_id and c.checkout_id=p_checkout_id and c.organization_id=p_organization_id
   and c.product_id=p_product_id and c.subscription_id is not distinct from p_subscription_id
   and c.net_amount=p_net_amount and c.currency=p_currency and c.capabilities=p_capabilities) then
   raise exception 'compensation_order_conflict';
 end if;
end $$;

create function public.billing_claim_checkout_compensation(p_environment text,p_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.billing_checkout_compensations; candidate uuid; account uuid; deleted boolean:=false; activated boolean;
begin
 if p_environment not in ('sandbox','production') or p_token is null then raise exception 'invalid_compensation_claim'; end if;
 select order_id into candidate from private.billing_checkout_compensations
 where environment=p_environment and state in ('waiting','refunding') and next_attempt_at<=now()
  and (lease_until is null or lease_until<=now()) order by next_attempt_at,order_id limit 1;
 if candidate is null then return null; end if;
 select coalesce(b.user_id,a.user_id) into account from private.billing_checkout_compensations j
 left join public.billing_checkout_bindings b on j.environment=b.environment and j.checkout_id::text=b.provider_checkout_id
 left join public.billing_checkout_attempts a on a.environment=j.environment and a.attempt_id=j.attempt_id and a.dispatch_token=j.dispatch_token
 where j.environment=p_environment and j.order_id=candidate;
 -- Same #1622 UUID-before-rows order, but financial compensation must survive deletion.
 if account is not null then deleted:=private.lock_account_write(account); end if;
 select * into c from private.billing_checkout_compensations where environment=p_environment and order_id=candidate for update;
 if c.state not in ('waiting','refunding') or c.next_attempt_at>now() or c.lease_until>now() then return null; end if;
 -- Retained complete source grants prove historical fulfillment too: an expired
 -- subscription or a deleted former buyer is not an unactivated purchase.
 if c.selected_at is null then
   activated:=private.checkout_was_fulfilled(c.environment,c.order_id,c.checkout_id,c.product_id,c.subscription_id,c.capabilities);
   if activated then
     update private.billing_checkout_compensations set state='activated' where environment=c.environment and order_id=c.order_id;
     insert into private.billing_checkout_compensation_audit(environment,order_id,state,code)
       values(c.environment,c.order_id,'activated','license_projected');
     return null;
   end if;
   update private.billing_checkout_compensations set selected_at=now(),state='refunding'
     where environment=c.environment and order_id=c.order_id;
   -- Refresh an existing live account only; never recreate anything for #1622.
   if account is not null and not deleted then
     perform public.billing_refresh_entitlement_read_model_at(account,now());
   end if;
 end if;
 update private.billing_checkout_compensations set lease_token=p_token,lease_until=now()+interval '2 minutes',
   attempt_count=attempt_count+1 where environment=c.environment and order_id=c.order_id returning * into c;
 insert into private.billing_checkout_compensation_audit(environment,order_id,state,code)
   values(c.environment,c.order_id,'refunding','attempt_started');
 return to_jsonb(c);
end $$;

create function public.billing_finish_checkout_compensation(
 p_environment text,p_order_id uuid,p_token uuid,p_outcome text,p_refund_id uuid default null,p_code text default null
) returns boolean language plpgsql security definer set search_path='' as $$
declare c private.billing_checkout_compensations; account uuid; deleted boolean:=false;
begin
 -- UUID first if a binding exists; no UUID/customer can be supplied by caller.
 select coalesce(b.user_id,a.user_id) into account from private.billing_checkout_compensations j
 left join public.billing_checkout_bindings b on j.environment=b.environment and j.checkout_id::text=b.provider_checkout_id
 left join public.billing_checkout_attempts a on a.environment=j.environment and a.attempt_id=j.attempt_id and a.dispatch_token=j.dispatch_token
 where j.environment=p_environment and j.order_id=p_order_id;
 if account is not null then deleted:=private.lock_account_write(account); end if;
 select * into c from private.billing_checkout_compensations where environment=p_environment and order_id=p_order_id for update;
 if not found or c.lease_token is distinct from p_token or c.lease_until<=now() or c.state<>'refunding' then return false; end if;
 if p_outcome not in ('refunded','pending','retry') or p_outcome is null
    or (p_code is not null and p_code !~ '^[a-z0-9_]{1,64}$') then raise exception 'invalid_compensation_result'; end if;
 update private.billing_checkout_compensations set
   state=case when p_outcome='refunded' then 'refunded' else 'refunding' end,
   refund_id=coalesce(p_refund_id,refund_id),last_error_code=coalesce(p_code,case when p_outcome='pending' and c.attempt_count>=3 then 'polar_refund_pending' else last_error_code end),
   next_attempt_at=now()+make_interval(secs=>least(3600,30*power(2,least(c.attempt_count-1,7)))::integer),
   lease_token=null,lease_until=null,
   alert_pending=alert_pending or p_outcome='retry' or (p_outcome='pending' and c.attempt_count>=3),
   alert_next_at=case when p_outcome='retry' or (p_outcome='pending' and c.attempt_count>=3) then coalesce(alert_next_at,now()) else alert_next_at end
 where environment=p_environment and order_id=p_order_id;
 insert into private.billing_checkout_compensation_audit(environment,order_id,state,code,refund_id)
 values(p_environment,p_order_id,p_outcome,coalesce(p_code,p_outcome),p_refund_id);
 if p_outcome='refunded' and account is not null and not deleted then
   update public.billing_checkout_attempts set resolution='refunded',checkout_url=null,status='uncertain',updated_at=now()
    where user_id=account and environment=p_environment and (provider_checkout_id=c.checkout_id::text or (attempt_id=c.attempt_id and dispatch_token=c.dispatch_token));
 end if;
 return true;
end $$;

-- Durable Owner outbox: a financial success must not hide an earlier failed alert.
create function public.billing_checkout_owner_alerts(p_environment text)
returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('order_id',order_id,'code',last_error_code,'attempt_count',attempt_count)),'[]')
 from (select * from private.billing_checkout_compensations where environment=p_environment
   and alert_pending and alert_next_at<=now() order by alert_next_at limit 5) c
$$;
create function public.billing_finish_checkout_owner_alert(p_environment text,p_order_id uuid,p_delivered boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 update private.billing_checkout_compensations set alert_pending=not p_delivered,
  alert_attempts=alert_attempts+1,
  alert_delivered_at=case when p_delivered then now() else alert_delivered_at end,
  alert_next_at=now()+make_interval(secs=>least(3600,30*power(2,least(alert_attempts,7)))::integer)
 where environment=p_environment and order_id=p_order_id and alert_pending;
end $$;

-- Unpublished attempts cannot expose a hosted URL. Keep the row and binding,
-- but release their local hold at lease expiry. Published URLs need Polar expiry.
create function public.billing_expire_unpublished_checkouts(p_environment text,p_evaluated_at timestamptz default now())
returns integer language plpgsql security definer set search_path='' as $$
declare a public.billing_checkout_attempts; deleted boolean; n integer:=0;
begin
 for a in select * from public.billing_checkout_attempts where environment=p_environment and resolution is null
   and provider_checkout_id is null and provider_request_started_at is null and status in ('creating','uncertain') and expires_at<=p_evaluated_at
   order by user_id,attempt_id limit 100 loop
   deleted:=private.lock_account_write(a.user_id);
   if not deleted then
     update public.billing_checkout_attempts set resolution='unpaid_expired',updated_at=now()
      where user_id=a.user_id and attempt_id=a.attempt_id and resolution is null
       and provider_checkout_id is null and provider_request_started_at is null and status in ('creating','uncertain') and expires_at<=p_evaluated_at;
     if found then n:=n+1; end if;
   end if;
 end loop;
 return n;
end $$;
create function public.billing_published_checkouts_to_expire(p_environment text)
returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('user_id',user_id,'attempt_id',attempt_id,
  'checkout_id',coalesce(provider_checkout_id,recovery_checkout_id::text),'checkout_key',checkout_key)),'[]')
 from (select * from public.billing_checkout_attempts a where environment=p_environment and resolution is null
   and coalesce(provider_checkout_id,recovery_checkout_id::text) is not null and expires_at<=now() order by updated_at limit 5) a
$$;
create function public.billing_expire_published_checkout(p_environment text,p_user_id uuid,p_attempt_id uuid,p_checkout_id text,p_terminal boolean,p_provider_status text default null)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if private.lock_account_write(p_user_id) then return false; end if;
 update public.billing_checkout_attempts set resolution=case when p_terminal then 'unpaid_expired' else resolution end,
 checkout_url=case when p_terminal then null else checkout_url end,
 status=case when p_terminal then 'uncertain' else status end,provider_checkout_status=coalesce(p_provider_status,provider_checkout_status),updated_at=now()
 where user_id=p_user_id and attempt_id=p_attempt_id and environment=p_environment
  and coalesce(provider_checkout_id,recovery_checkout_id::text)=p_checkout_id and resolution is null and expires_at<=now()
  and (not p_terminal or not exists(select 1 from private.billing_checkout_compensations c
    where c.environment=p_environment and c.checkout_id::text=p_checkout_id and c.state<>'refunded'));
 return found;
end $$;

-- Trusted dispatch nonce correlates a lost checkout ACK without using metadata
-- as an account/entitlement authority. Never publish/recreate a URL or a binding.
create function public.billing_observe_checkout_session(p_environment text,p_checkout_id uuid,
 p_product_id uuid,p_status text,p_attempt_id uuid,p_dispatch_token uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare a public.billing_checkout_attempts;
begin
 if p_status not in ('open','confirmed','succeeded','expired','failed') or p_status is null then raise exception 'invalid_checkout_status'; end if;
 select * into a from public.billing_checkout_attempts where environment=p_environment and attempt_id=p_attempt_id
  and dispatch_token=p_dispatch_token and dispatch_product_id=p_product_id and provider_request_started_at is not null;
 if not found then return false; end if;
 if private.lock_account_write(a.user_id) then return false; end if;
 update public.billing_checkout_attempts set recovery_checkout_id=p_checkout_id,provider_checkout_status=p_status,updated_at=now(),
  resolution=case when p_status in ('expired','failed') and not exists(
    select 1 from private.billing_checkout_compensations c where c.environment=p_environment and c.checkout_id=p_checkout_id and c.state<>'refunded')
    then coalesce(resolution,'unpaid_expired') else resolution end
 where user_id=a.user_id and attempt_id=a.attempt_id and dispatch_token=p_dispatch_token
  and (provider_checkout_id is null or provider_checkout_id=p_checkout_id::text)
  and (recovery_checkout_id is null or recovery_checkout_id=p_checkout_id);
 return found;
end $$;
alter table private.billing_reconciliation_cursor drop constraint billing_reconciliation_cursor_resource_check;
alter table private.billing_reconciliation_cursor add check(resource in ('orders','subscriptions','refunds','disputes','checkouts'));
do $$ declare definition text; begin
 definition:=pg_get_functiondef('public.complete_billing_reconciliation(text,uuid,text,integer)'::regprocedure);
 definition:=replace(definition,$old$('orders','subscriptions','refunds','disputes')$old$,$new$('orders','subscriptions','refunds','disputes','checkouts')$new$);
 execute definition;
end $$;

-- Preserve the reviewed shared guard and #1622 barrier. Only resolved holds stop blocking.
do $$
declare definition text;
begin
 definition:=pg_get_functiondef('public.claim_billing_checkout_attempt(uuid,uuid,text,text,text)'::regprocedure);
 if position('elsif existing.expires_at<=now()' in definition)=0 then raise exception 'shared_claim_body_changed'; end if;
 definition:=replace(definition,'elsif existing.expires_at<=now()','elsif existing.resolution is not null or existing.expires_at<=now()');
 definition:=replace(definition,',1;',',2;');
 definition:=replace(definition,',null::text,1',',null::text,2');
 definition:=replace(definition,',existing.checkout_url,1',',existing.checkout_url,2');
 definition:=replace(definition,'where a.user_id=p_user_id and a.environment=p_environment','where a.user_id=p_user_id and a.environment=p_environment and a.resolution is null');
 execute definition;
 definition:=pg_get_functiondef('public.complete_billing_checkout_attempt(uuid,uuid,text,text)'::regprocedure);
 if position('and expires_at>now()' in definition)=0 then raise exception 'shared_complete_body_changed'; end if;
 definition:=replace(definition,'and expires_at>now()','and expires_at>now() and provider_request_started_at is not null and resolution is null');
 execute definition;
end $$;

create function public.billing_begin_checkout_request(p_user_id uuid,p_attempt_id uuid,p_product_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.lock_accounts_before_rows(array[p_user_id]);
 update public.billing_checkout_attempts set provider_request_started_at=now(),dispatch_product_id=p_product_id,updated_at=now()
 where user_id=p_user_id and attempt_id=p_attempt_id and status='creating'
  and resolution is null and provider_request_started_at is null and expires_at>now();
 if not found then return null; end if;
 return (select jsonb_build_object('dispatch_token',dispatch_token) from public.billing_checkout_attempts where user_id=p_user_id and attempt_id=p_attempt_id);
end $$;
create function public.billing_reject_checkout_request(p_user_id uuid,p_attempt_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform private.lock_accounts_before_rows(array[p_user_id]);
 update public.billing_checkout_attempts set resolution='unpaid_expired',updated_at=now()
 where user_id=p_user_id and attempt_id=p_attempt_id and status in ('creating','uncertain')
  and provider_checkout_id is null and recovery_checkout_id is null and resolution is null
  and not exists(select 1 from private.billing_checkout_compensations c
    where c.environment=billing_checkout_attempts.environment and c.attempt_id=p_attempt_id
     and c.dispatch_token=billing_checkout_attempts.dispatch_token and c.state<>'refunded');
 return found;
end $$;
do $$
declare f regprocedure;
begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in (
   'billing_observe_checkout_session','billing_begin_checkout_request','billing_reject_checkout_request','billing_observe_checkout_payment','billing_claim_checkout_compensation','billing_finish_checkout_compensation',
   'billing_checkout_owner_alerts','billing_finish_checkout_owner_alert','billing_expire_unpublished_checkouts',
   'billing_published_checkouts_to_expire','billing_expire_published_checkout') loop
   execute format('revoke all on function %s from public,anon,authenticated',f);
   execute format('grant execute on function %s to service_role',f);
 end loop;
end $$;
comment on table private.billing_checkout_compensations is
 'Financial compensation ledger, service RPC only. No email/customer/account UUID. Survives account deletion without recreating identity; financial retention follows billing ledger policy.';
commit;
