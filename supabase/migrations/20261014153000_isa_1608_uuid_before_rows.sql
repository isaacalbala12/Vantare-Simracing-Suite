-- #1608 R4-P2-2. Supported RPC order: all UUIDs (sorted), then rows.
begin;
set local search_path='';
create function private.lock_accounts_before_rows(p_accounts uuid[])
returns void language plpgsql volatile security definer set search_path='' as $$
declare account uuid;
begin
 for account in select distinct a from unnest(p_accounts) a where a is not null order by a loop
   if private.lock_account_write(account) then raise sqlstate '28000' using message='account_deleted'; end if;
 end loop;
end $$;
revoke all on function private.lock_accounts_before_rows(uuid[]) from public,anon,authenticated,service_role;
-- PostgreSQL locks UPDATE/DELETE tuples before a BEFORE ROW trigger. That
-- fallback must never wait on a UUID while holding a tuple: abort/retry the
-- entire transaction with 40001. INSERT can also follow earlier rows/UUIDs in
-- a multi-statement transaction, so its fallback uses the same nonwaiting rule.
create function private.lock_account_row_write(p_account uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
begin
 if current_setting('transaction_isolation')<>'read committed' then
   raise sqlstate '25001' using message='account_write_read_committed_required';
 end if;
 if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(p_account::text,1608)) then
   raise sqlstate '40001' using message='account_write_retry_before_rows';
 end if;
 return exists(select 1 from public.account_identities where account_id=p_account and deleted_at is not null);
end $$;
revoke all on function private.lock_account_row_write(uuid) from public,anon,authenticated,service_role;
do $$
declare definition text;
begin
 definition:=pg_get_functiondef('private.guard_account_write()'::regprocedure);
 definition:=replace(definition,'if private.lock_account_write(account) then deleted:=true; end if;',
   'if private.lock_account_row_write(account) then deleted:=true; end if;');
 execute definition;
end $$;
-- Transform the current deployed bodies, preserving business checks and ACLs.
-- Only explicit RPCs are changed, never a broad rewrite of all functions.
do $$
declare r record; definition text; prefix text; owners text; entries integer:=0;
begin
 for r in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   join pg_language l on l.oid=p.prolang
   where n.nspname='public' and l.lanname='plpgsql' and p.proname in (
     'operational_access_set','operational_legacy_grant_retire',
     'claim_billing_checkout_attempt','complete_billing_checkout_attempt','mark_billing_checkout_attempt_uncertain',
     'billing_apply_resource_snapshot','billing_apply_reconciliation_plan','billing_apply_subscription_lifecycle',
     'billing_record_order_snapshot','billing_refresh_entitlement_read_model_at',
     'billing_record_refund_snapshot','billing_sync_order_access','billing_record_dispute_snapshot',
     'billing_expire_subscription_grants')
 loop
   entries:=entries+1;
   definition:=pg_get_functiondef(r.oid);
   if r.proname='billing_record_refund_snapshot' then
     owners:=$q$array(select lock_order.user_id from public.billing_orders lock_order where lock_order.environment=p_environment
       and lock_order.provider='polar' and lock_order.provider_order_id=trim(p_order_id)
       union select lock_order.user_id from public.billing_orders lock_order join public.billing_refunds f
         on lock_order.provider=f.provider and lock_order.environment=f.environment and lock_order.provider_order_id=f.provider_order_id
       where f.environment=p_environment and f.provider_refund_id=trim(p_refund_id))$q$;
   elsif r.proname in ('billing_sync_order_access','billing_record_dispute_snapshot') then
     owners:=$q$array(select lock_order.user_id from public.billing_orders lock_order where lock_order.environment=p_environment
       and lock_order.provider='polar' and lock_order.provider_order_id=p_order_id)$q$;
   elsif r.proname='billing_expire_subscription_grants' then
     -- Batch sweep knows its complete UUID set before any updates.
     owners:=$q$array(select user_id from (
       select user_id from public.billing_access_grants where status='active' and valid_until<=p_evaluated_at
       union select user_id from public.billing_subscription_recovery_cycles where closed_at is null and recovery_until<=p_evaluated_at
       union select user_id from public.billing_subscriptions where recovery_until<=p_evaluated_at) live
       where not exists(select 1 from public.account_identities i where i.account_id=live.user_id and i.deleted_at is not null))$q$;
     -- An erased account's retained recovery history must not stop the sweep.
     definition:=replace(definition,'and p_evaluated_at >= grant_row.valid_until',
       'and p_evaluated_at >= grant_row.valid_until and not exists(select 1 from public.account_identities i where i.account_id=grant_row.user_id and i.deleted_at is not null)');
     definition:=replace(definition,'and p_evaluated_at >= cycle.recovery_until',
       'and p_evaluated_at >= cycle.recovery_until and not exists(select 1 from public.account_identities i where i.account_id=cycle.user_id and i.deleted_at is not null)');
     definition:=replace(definition,'and p_evaluated_at >= subscription.recovery_until',
       'and p_evaluated_at >= subscription.recovery_until and not exists(select 1 from public.account_identities i where i.account_id=subscription.user_id and i.deleted_at is not null)');
   elsif r.proname='billing_record_order_snapshot' then
     owners:=$q$array[p_user_id] || array(select lock_order.user_id from public.billing_orders lock_order
       where lock_order.environment=p_environment and lock_order.provider='polar' and lock_order.provider_order_id=trim(p_order_id))$q$;
   elsif r.proname='billing_apply_resource_snapshot' then
     owners:=$q$array[p_user_id] || array(select user_id from public.billing_commercial_resources
       where provider=p_provider and environment=p_environment and resource_type=p_resource_type and resource_id=trim(p_resource_id))$q$;
   elsif r.proname='billing_apply_subscription_lifecycle' then
     owners:=$q$array[p_user_id] || array(select user_id from public.billing_commercial_resources
       where provider='polar' and environment=p_environment and resource_type='subscription' and resource_id=trim(p_subscription_id)
       union select user_id from public.billing_subscriptions where provider='polar' and environment=p_environment and provider_subscription_id=trim(p_subscription_id))$q$;
   elsif r.proname='billing_apply_reconciliation_plan' then
     owners:=$q$array[p_user_id] || array(select r.user_id from public.billing_commercial_resources r
       join jsonb_array_elements(p_operations) op on r.provider='polar' and r.environment=p_environment
         and r.resource_type=op->>'resourceType' and r.resource_id=op->>'resourceId')$q$;
   else
     if not (select 'p_user_id'=any(proargnames) from pg_proc where oid=r.oid) then
       raise exception 'rpc_owner_parameter_changed: %',r.proname;
     end if;
     owners:='array[p_user_id]';
   end if;
   prefix:='begin'||chr(10)||'  perform private.lock_accounts_before_rows('||owners||');';
   definition:=regexp_replace(definition,'\mbegin\M',prefix,'i');
   execute definition;
 end loop;
 if entries<>14 then raise exception 'rpc_lock_inventory_changed: %',entries; end if;
end $$;
-- Checkout garbage collection was a cross-account DELETE in a single-account
-- RPC. Restrict it to that account so its entry lock covers every deleted row.
do $$
declare definition text;
begin
 definition:=pg_get_functiondef('public.claim_billing_checkout_attempt(uuid,uuid,text,text,text)'::regprocedure);
 definition:=replace(definition,'where expires_at < now() - interval ''24 hours''',
   'where user_id=p_user_id and expires_at < now() - interval ''24 hours''');
 execute definition;
end $$;
commit;
