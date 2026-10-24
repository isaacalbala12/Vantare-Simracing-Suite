-- #1770 / VANTA-96. Close a consumed checkout only from durable terminal proof.
-- No provider calls, data deletion, refunds, or changes to purchase flags.
begin;

alter table public.billing_checkout_attempts
 drop constraint billing_checkout_attempts_resolution_check,
 add constraint billing_checkout_attempts_resolution_check
 check (resolution in ('unpaid_expired','refunded','revoked'));

create function private.close_terminal_checkout_attempts(p_user_id uuid, p_environment text)
returns integer language plpgsql volatile security definer set search_path='' as $$
declare changed integer;
begin
 if p_user_id is null or p_environment is null or p_environment not in ('sandbox','production') then
  raise exception 'invalid_terminal_checkout_scope';
 end if;
 -- Same account-before-rows lock as claims, snapshots and account erasure.
 -- This helper is private: no customer-supplied snapshot or terminal flag.
 if private.lock_account_write(p_user_id) then return 0; end if;
 with terminal as (
  select a.attempt_id,
   case when greatest(o.reported_refunded_amount,coalesce((
    select sum(f.amount) from public.billing_refunds f
    where f.provider=o.provider and f.environment=o.environment
     and f.provider_order_id=o.provider_order_id and f.currency=o.currency
     and f.status='succeeded'
   ),0))=o.net_amount then 'refunded' else 'revoked' end as resolution
  from public.billing_checkout_attempts a
  join public.billing_checkout_bindings b
   on b.user_id=a.user_id and b.environment=a.environment and b.attempt_id=a.attempt_id
    and b.checkout_key=a.checkout_key and b.catalog_version=a.catalog_version
    and b.provider_checkout_id=coalesce(a.provider_checkout_id,a.recovery_checkout_id::text)
  join public.billing_orders o
   on o.user_id=b.user_id and o.environment=b.environment and o.provider='polar'
    and o.provider_checkout_id=b.provider_checkout_id and o.paid and o.net_amount>0
    and (a.dispatch_product_id is null or o.provider_product_id=a.dispatch_product_id::text)
  left join public.billing_subscriptions sub
   on sub.user_id=o.user_id and sub.provider=o.provider and sub.environment=o.environment
    and sub.provider_subscription_id=o.provider_subscription_id
    and sub.provider_product_id=o.provider_product_id
  where a.user_id=p_user_id and a.environment=p_environment and a.resolution is null
   and (
    greatest(o.reported_refunded_amount,coalesce((
     select sum(f.amount) from public.billing_refunds f
     where f.provider=o.provider and f.environment=o.environment
      and f.provider_order_id=o.provider_order_id and f.currency=o.currency
      and f.status='succeeded'
    ),0))=o.net_amount
    or (
     (sub.status='revoked' or (sub.status='canceled'
       and (not sub.cancel_at_period_end or sub.paid_through<=now())))
     and not exists (
      select 1 from public.billing_effective_access_grants g
      where g.user_id=o.user_id and g.environment=o.environment and g.status='active'
       and (g.valid_until is null or g.valid_until>now())
       and ((g.source_type='subscription' and g.source_id=o.provider_subscription_id)
        or (g.source_type='subscription_recovery'
         and g.metadata->>'subscription_id'=o.provider_subscription_id))
     )
    )
   )
 )
 update public.billing_checkout_attempts a
 set resolution=t.resolution,status='uncertain',checkout_url=null,updated_at=now()
 from terminal t where a.user_id=p_user_id and a.environment=p_environment
  and a.attempt_id=t.attempt_id and a.resolution is null;
 get diagnostics changed=row_count;
 return changed;
end $$;
revoke all on function private.close_terminal_checkout_attempts(uuid,text)
 from public,anon,authenticated,service_role;
comment on function private.close_terminal_checkout_attempts(uuid,text) is
 'Terminal paid checkout proof from scoped bindings plus full succeeded refund or ended subscription. Keeps history; never releases an unbound/new/pending checkout.';

-- Compose with the existing guarded RPCs, keeping their ACLs, identity barriers,
-- version checks and purchase policy. A changed canonical body stops migration.
do $patch$
declare target record; definition text;
begin
 for target in select * from (values
  ('public.billing_sync_order_access(text,text,jsonb)',
   'perform public.billing_refresh_entitlement_read_model(o.user_id);',
   'perform private.close_terminal_checkout_attempts(o.user_id,p_environment);'),
  ('public.billing_apply_subscription_lifecycle(uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,boolean,timestamptz,text,text,timestamptz,timestamptz,timestamptz,text[])',
   'perform public.billing_refresh_entitlement_read_model_at(p_user_id, p_evaluated_at);',
   'perform private.close_terminal_checkout_attempts(p_user_id,p_environment);'),
  ('public.claim_billing_checkout_attempt(uuid,uuid,text,text,text)',
   'perform private.lock_accounts_before_rows(array[p_user_id]);',
   'perform private.close_terminal_checkout_attempts(p_user_id,p_environment);')
 ) as patches(signature,anchor,addition)
 loop
  definition:=pg_get_functiondef(target.signature::regprocedure);
  if position(target.anchor in definition)=0
   or position(target.anchor in substring(definition from position(target.anchor in definition)+length(target.anchor)))>0
   or position('private.close_terminal_checkout_attempts(' in definition)>0 then
   raise exception 'terminal_checkout_contract_changed: %',target.signature;
  end if;
  execute replace(definition,target.anchor,target.anchor||E'\n  '||target.addition);
 end loop;
end $patch$;

commit;
