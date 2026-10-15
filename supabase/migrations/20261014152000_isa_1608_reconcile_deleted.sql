-- #1608 R4-P1-2: a permanent tombstone is an isolated item, not a global outage.
begin;
set local search_path='';
create function private.billing_event_accounts(p_provider text,p_environment text,p_type text,p_payload jsonb)
returns setof uuid language sql stable security definer set search_path='' as $$
 select c.user_id from public.billing_customers c where c.provider=p_provider and c.environment=p_environment
   and c.provider_customer_id in(p_payload#>>'{data,customer_id}',p_payload#>>'{data,customer,id}')
 union select b.user_id from public.billing_checkout_bindings b where b.environment=p_environment
   and b.provider_checkout_id=p_payload#>>'{data,checkout_id}'
 union select o.user_id from public.billing_orders o where o.provider=p_provider and o.environment=p_environment
   and o.provider_order_id in(p_payload#>>'{data,order_id}',case when p_type like 'order.%' then p_payload#>>'{data,id}' end)
 union select s.user_id from public.billing_subscriptions s where s.provider=p_provider and s.environment=p_environment
   and s.provider_subscription_id in(p_payload#>>'{data,subscription_id}',case when p_type like 'subscription.%' then p_payload#>>'{data,id}' end)
$$;
revoke all on function private.billing_event_accounts(text,text,text,jsonb) from public,anon,authenticated,service_role;
create table private.billing_deleted_observations (
 environment text not null check(environment in ('sandbox','production')),
 observation_hash text not null check(observation_hash ~ '^[0-9a-f]{64}$'),
 first_seen_at timestamptz not null default now(),
 primary key(environment,observation_hash)
);
revoke all on private.billing_deleted_observations from public,anon,authenticated,service_role;
create function private.billing_deleted_event(p_provider text,p_environment text,p_type text,p_payload jsonb,p_hash text)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare owners uuid[]; current_owners uuid[]; account uuid; deleted boolean:=false;
begin
 select array_agg(account_id order by account_id) into owners
   from private.billing_event_accounts(p_provider,p_environment,p_type,p_payload) account_id;
 -- Do not classify contradictory durable links as a deleted account.
 if cardinality(owners)>1 then raise sqlstate '28000' using message='billing_owner_conflict'; end if;
 foreach account in array coalesce(owners,'{}'::uuid[]) loop
   deleted:=private.lock_account_write(account) or deleted;
 end loop;
 select array_agg(account_id order by account_id) into current_owners
   from private.billing_event_accounts(p_provider,p_environment,p_type,p_payload) account_id;
 if current_owners is distinct from owners then raise sqlstate '40001' using message='billing_owner_changed'; end if;
 if deleted then
   -- No UUID, provider ID, email or payload; one digest per observation/retry.
   insert into private.billing_deleted_observations(environment,observation_hash)
     values(p_environment,p_hash) on conflict do nothing;
 end if;
 return deleted;
end $$;
revoke all on function private.billing_deleted_event(text,text,text,jsonb,text) from public,anon,authenticated,service_role;
do $$
declare definition text; marker text:='  insert into public.billing_webhook_inbox (';
begin
 definition:=pg_get_functiondef('public.billing_receive_webhook(text,text,text,text,text,jsonb)'::regprocedure);
 if position(marker in definition)=0 then raise exception 'inbox_body_changed'; end if;
 definition:=replace(definition,marker,$replacement$
  if private.billing_deleted_event(p_provider,p_environment,p_event_type,p_payload,
    encode(extensions.digest(p_provider_event_id||chr(31)||p_payload_hash,'sha256'),'hex')) then
    return query select null::uuid,'account_deleted'::text,true;
    return;
  end if;
$replacement$||marker);
 execute definition;
 -- Disputes bypass inbox; use the same durable, environment-scoped authority.
 definition:=pg_get_functiondef('public.billing_record_dispute_snapshot(text,text,text,boolean,timestamptz,text)'::regprocedure);
 marker:='  select * into o from public.billing_orders';
 if position(marker in definition)=0 then raise exception 'dispute_body_changed'; end if;
 definition:=replace(definition,marker,$replacement$
  if private.billing_deleted_event('polar',p_environment,'dispute.updated',
    jsonb_build_object('data',jsonb_build_object('order_id',p_order_id)),
    encode(extensions.digest(p_dispute_id||chr(31)||p_snapshot_hash,'sha256'),'hex')) then
    return 'account_deleted';
  end if;
$replacement$||marker);
 execute definition;
end $$;
commit;
