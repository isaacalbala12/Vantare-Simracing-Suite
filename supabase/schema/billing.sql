-- Generated from disposable PostgreSQL; read-only. Do not edit.
-- Name: billing_creator_renewal_prepare_before_1593(text, uuid, text, text, text, uuid, text, uuid, integer); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.billing_creator_renewal_prepare_before_1593(p_environment text, p_user uuid, p_checkout text, p_subscription text, p_order text, p_product uuid, p_key text, p_initial_discount uuid, p_creator_savings integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_attr private.creator_checkout_attributions%rowtype; v_op private.creator_renewal_operations%rowtype; v_report private.report_renewal_candidates%rowtype; v_token uuid;
begin
 if private.lock_account_write(p_user) then return null; end if;
 if not exists(select 1 from public.profiles where id=p_user) or exists(select 1 from public.account_identities where account_id=p_user and deleted_at is not null) then return null; end if;
 if exists(select 1 from private.creator_subscription_revocations where environment=p_environment and subscription_id=p_subscription) then return null; end if;
 select * into v_op from private.creator_renewal_operations where environment=p_environment and subscription_id=p_subscription for update;
 if not found then
  select a.* into v_attr from private.creator_checkout_attributions a join public.billing_checkout_bindings b on b.environment=a.environment and b.user_id=a.account_id and b.attempt_id=a.attempt_id
  where b.environment=p_environment and b.provider_checkout_id=p_checkout and b.user_id=p_user and b.checkout_key=p_key;
  if not found then return null; end if;
  if not exists(select 1 from public.billing_orders where environment=p_environment and provider_order_id=p_order and user_id=p_user and provider_subscription_id=p_subscription and provider_product_id=p_product::text and paid and reported_refunded_amount=0 and not exists(select 1 from public.billing_orders prior_order where prior_order.environment=p_environment and prior_order.provider_subscription_id=p_subscription and (prior_order.reported_refunded_amount>0 or exists(select 1 from public.billing_refunds refund where refund.environment=p_environment and refund.provider_order_id=prior_order.provider_order_id and refund.status='succeeded' and refund.amount>0)))) then raise exception 'creator_first_invoice_unpaid'; end if;
  insert into private.creator_renewal_operations(environment,subscription_id,account_id,creator_id,first_order_id,product_id,checkout_key,creator_discount_id,initial_discount_id)
  values(p_environment,p_subscription,p_user,v_attr.creator_id,p_order,p_product,p_key,v_attr.discount_id,p_initial_discount);
  select * into v_op from private.creator_renewal_operations where environment=p_environment and subscription_id=p_subscription for update;
 end if;
 if v_op.account_id<>p_user or v_op.product_id<>p_product or v_op.checkout_key<>p_key then raise exception 'creator_subscription_conflict'; end if;
 if v_op.revocation_requested_at is not null then return null; end if;
 if v_op.state='completed' then return null; end if;
 if v_op.lease_until>now() then return jsonb_build_object('busy',true); end if;
 select * into v_report from private.report_renewal_candidates where environment=p_environment and subscription_id=p_subscription and account_id=p_user and valid_until>now();
 if found and p_key not like '%annual' and v_report.savings_cents>=p_creator_savings then
  v_op.selected_discount_id:=v_report.discount_id; v_op.not_applied:='creator:reports_save_more_or_equal';
 else
  v_op.selected_discount_id:=v_op.creator_discount_id;
  v_op.not_applied:=case when v_report.discount_id is not null then 'reports:creator_saves_more' else null end;
 end if;
 v_token:=gen_random_uuid();
 update private.creator_renewal_operations set selected_discount_id=v_op.selected_discount_id,not_applied=v_op.not_applied,lease_token=v_token,lease_until=now()+interval '60 seconds' where environment=p_environment and subscription_id=p_subscription;
 return jsonb_build_object('token',v_token,'discount_id',v_op.selected_discount_id,'creator_discount_id',v_op.creator_discount_id,'report_discount_id',v_report.discount_id,'initial_discount_id',v_op.initial_discount_id,'not_applied',v_op.not_applied);
end $$;


--

-- Name: billing_creator_revocation_before_1593(text, text, uuid, text, text, text, uuid, boolean); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.billing_creator_revocation_before_1593(p_stage text, p_environment text, p_user uuid, p_subscription text, p_order text DEFAULT NULL::text, p_reason text DEFAULT NULL::text, p_token uuid DEFAULT NULL::uuid, p_success boolean DEFAULT NULL::boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_op private.creator_renewal_operations%rowtype; v_token uuid;
begin
 if p_stage not in ('prepare','authorize','finish') or p_environment not in ('sandbox','production') then raise exception 'creator_revocation_invalid'; end if;
 if private.lock_account_write(p_user) then return null; end if;
 if not exists(select 1 from public.profiles where id=p_user) or exists(select 1 from public.account_identities where account_id=p_user and deleted_at is not null) then return null; end if;
 if p_stage='prepare' then
  if p_reason not in ('refund','subscription_revoked','reconcile') or p_reason is null then raise exception 'creator_revocation_invalid'; end if;
  if p_reason='refund' and not exists(select 1 from public.billing_orders o where o.environment=p_environment and o.provider_order_id=p_order and o.user_id=p_user and o.provider_subscription_id=p_subscription and (o.reported_refunded_amount>0 or exists(select 1 from public.billing_refunds refund where refund.environment=p_environment and refund.provider_order_id=o.provider_order_id and refund.status='succeeded' and refund.amount>0))) then return null; end if;
  if p_reason='reconcile' then
   if not exists(select 1 from private.creator_subscription_revocations where environment=p_environment and subscription_id=p_subscription and account_id=p_user) then return null; end if;
  else
   insert into private.creator_subscription_revocations values(p_environment,p_subscription,p_user,p_reason,now()) on conflict do nothing;
  end if;
  if not exists(select 1 from private.creator_subscription_revocations where environment=p_environment and subscription_id=p_subscription and account_id=p_user) then raise exception 'creator_revocation_owner_conflict'; end if;
 end if;
 select * into v_op from private.creator_renewal_operations where environment=p_environment and subscription_id=p_subscription and account_id=p_user for update;
 if not found then return null; end if;
 if p_stage='prepare' then
  if v_op.revocation_completed_at is not null then return null; end if;
  update private.creator_renewal_operations set revocation_requested_at=coalesce(revocation_requested_at,now()),revocation_reason=coalesce(revocation_reason,(select reason from private.creator_subscription_revocations where environment=p_environment and subscription_id=p_subscription)) where environment=p_environment and subscription_id=p_subscription;
  if v_op.lease_until>now() then return jsonb_build_object('busy',true); end if;
  v_token:=gen_random_uuid();
  update private.creator_renewal_operations set lease_token=v_token,lease_until=now()+interval '60 seconds',state='pending',completed_at=null where environment=p_environment and subscription_id=p_subscription;
  return jsonb_build_object('token',v_token,'creator_discount_id',v_op.creator_discount_id,'product_id',v_op.product_id);
 end if;
 if v_op.revocation_requested_at is null or v_op.lease_token is distinct from p_token or v_op.lease_until<=now() then return null; end if;
 if p_stage='authorize' then return jsonb_build_object('authorized',true); end if;
 if p_success is null then raise exception 'creator_revocation_invalid'; end if;
 update private.creator_renewal_operations set lease_until=null,lease_token=null,
  revocation_completed_at=case when p_success then now() else null end,
  state=case when p_success then 'completed' else 'pending' end,
  completed_at=case when p_success then now() else null end,
  selected_discount_id=case when p_success and selected_discount_id=creator_discount_id then null else selected_discount_id end,
  not_applied=case when p_success then 'creator:revoked' else 'creator:revocation_pending' end
 where environment=p_environment and subscription_id=p_subscription;
 if not p_success then insert into private.billing_payment_incidents(environment,account_id,resource_id,reason) values(p_environment,p_user,p_subscription,'creator_renewal_revocation_failed') on conflict do nothing; end if;
 return jsonb_build_object('completed',true);
end $$;


--

-- Name: billing_deleted_event(text, text, text, jsonb, text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.billing_deleted_event(p_provider text, p_environment text, p_type text, p_payload jsonb, p_hash text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--

-- Name: billing_event_accounts(text, text, text, jsonb); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.billing_event_accounts(p_provider text, p_environment text, p_type text, p_payload jsonb) RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
 select c.user_id from public.billing_customers c where c.provider=p_provider and c.environment=p_environment
   and c.provider_customer_id in(p_payload#>>'{data,customer_id}',p_payload#>>'{data,customer,id}')
 union select b.user_id from public.billing_checkout_bindings b where b.environment=p_environment
   and b.provider_checkout_id=p_payload#>>'{data,checkout_id}'
 union select o.user_id from public.billing_orders o where o.provider=p_provider and o.environment=p_environment
   and o.provider_order_id in(p_payload#>>'{data,order_id}',case when p_type like 'order.%' then p_payload#>>'{data,id}' end)
 union select s.user_id from public.billing_subscriptions s where s.provider=p_provider and s.environment=p_environment
   and s.provider_subscription_id in(p_payload#>>'{data,subscription_id}',case when p_type like 'subscription.%' then p_payload#>>'{data,id}' end)
$$;


--

-- Name: billing_launch_checkout_before_1593_guard(uuid, text, text, text, text, timestamp with time zone, uuid, uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.billing_launch_checkout_before_1593_guard(p_account uuid, p_environment text, p_product text, p_discount text, p_key text, p_now timestamp with time zone, p_attempt uuid, p_replaces uuid DEFAULT NULL::uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare discount text; used private.report_promotion_launch_uses; prior public.billing_checkout_attempts;
begin
 if private.lock_account_write(p_account) then raise sqlstate '28000' using message='account_deleted'; end if;
 if p_attempt is null then raise sqlstate '22023' using message='promotion_attempt_required'; end if;
 if not private.report_promotion_eligible(p_now) then return null; end if;
 -- Only service_role calls this with the canonical #1661 allowlisted server offer.
 if p_environment is null or p_key is null or p_environment not in ('sandbox','production') or p_key not in ('pro_monthly','pro_annual','pro_plus_monthly','pro_plus_annual')
 or p_product is null or p_discount is null then raise exception 'invalid_launch_offer'; end if;
 discount:=p_discount;
 select * into used from private.report_promotion_launch_uses where account_id=p_account and environment=p_environment for update;
 if used.consumed_at is not null then return null; end if;
 if exists(select 1 from private.report_promotions where account_id=p_account and environment=p_environment)
 or exists(select 1 from public.billing_subscriptions b where b.user_id=p_account and b.environment=p_environment and b.provider='polar')
 or exists(select 1 from public.billing_orders b where b.user_id=p_account and b.environment=p_environment and b.provider='polar' and b.paid and b.provider_subscription_id is not null) then
  insert into private.report_promotion_launch_uses(account_id,environment,product_id,reserved_at,consumed_at) values(p_account,p_environment,p_product,p_now,p_now)
   on conflict(account_id,environment) do update set consumed_at=coalesce(private.report_promotion_launch_uses.consumed_at,excluded.consumed_at);
  return null;
 end if;
 if used.account_id is not null then
   if used.attempt_id=p_attempt and used.product_id=p_product then return discount; end if;
   select * into prior from public.billing_checkout_attempts where user_id=p_account and attempt_id=used.attempt_id and environment=p_environment;
   if prior.resolution is null and (p_now<greatest(used.reserved_at+interval '30 minutes',prior.expires_at)
    or (used.remote_pending and coalesce(used.checkout_id,prior.provider_checkout_id) is not null and p_replaces is distinct from used.attempt_id)) then
     raise sqlstate '55000' using message='promotion_checkout_pending';
   end if;
   -- CAS under the B03 account lock: another replacement invalidates old proof.
   if p_replaces is not null and p_replaces is distinct from used.attempt_id then
     raise sqlstate '55000' using message='promotion_checkout_pending';
   end if;
   if used.remote_pending and coalesce(used.checkout_id,prior.provider_checkout_id) is null then
     perform public.report_promotion_failed(p_account,p_environment,'promotion_checkout_recovered',p_now);
   end if;
   update private.report_promotion_launch_uses set attempt_id=p_attempt,product_id=p_product,reserved_at=p_now,checkout_id=null,remote_pending=false where account_id=p_account and environment=p_environment;
 else
   insert into private.report_promotion_launch_uses(account_id,environment,product_id,attempt_id,reserved_at) values(p_account,p_environment,p_product,p_attempt,p_now);
 end if;
 return discount;
end $$;


--

-- Name: billing_set_report_candidate_before_1593(text, uuid, text, uuid, integer, timestamp with time zone); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.billing_set_report_candidate_before_1593(p_environment text, p_user uuid, p_subscription text, p_discount uuid, p_savings integer, p_valid_until timestamp with time zone) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
 if not exists(select 1 from public.profiles where id=p_user) or exists(select 1 from public.account_identities where account_id=p_user and deleted_at is not null) then raise exception 'account_deleted'; end if;
 if not exists(select 1 from public.billing_subscriptions where environment=p_environment and user_id=p_user and provider_subscription_id=p_subscription) then raise exception 'report_subscription_unbound'; end if;
 -- VANTA-39 fixed monthly discounts only; a different contract needs review.
 if p_savings not in (200,300) or p_valid_until<=now() then raise exception 'report_candidate_invalid'; end if;
 insert into private.report_renewal_candidates values(p_environment,p_subscription,p_user,p_discount,p_savings,p_valid_until)
 on conflict(environment,subscription_id) do update set discount_id=excluded.discount_id,savings_cents=excluded.savings_cents,valid_until=excluded.valid_until
 where report_renewal_candidates.account_id=excluded.account_id;
 -- A later accepted report must be reconsidered by the same leased writer.
 if exists(select 1 from private.creator_renewal_operations where environment=p_environment and subscription_id=p_subscription and lease_until>now()) then raise exception 'renewal_selection_busy'; end if;
 update private.creator_renewal_operations set state='pending',completed_at=null,lease_token=null,lease_until=null
 where environment=p_environment and subscription_id=p_subscription and account_id=p_user
 and checkout_key in ('pro_monthly','pro_plus_monthly') and selected_discount_id is distinct from p_discount;

end $$;


--

-- Name: checkout_was_fulfilled(text, uuid, uuid, uuid, uuid, text[]); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.checkout_was_fulfilled(p_environment text, p_order uuid, p_checkout uuid, p_product uuid, p_subscription uuid, p_capabilities text[]) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
 select exists(select 1 from public.billing_orders o join public.billing_checkout_bindings b
   on b.environment=o.environment and b.provider_checkout_id=o.provider_checkout_id and b.user_id=o.user_id
  where o.environment=p_environment and o.provider_order_id=p_order::text and o.provider_checkout_id=p_checkout::text
   and o.provider_product_id=p_product::text and not exists(
    select 1 from unnest(p_capabilities) capability where not exists(
     select 1 from public.billing_access_grants g where g.user_id=o.user_id and g.environment=p_environment
      and g.capability=capability and ((g.source_type='order' and g.source_id=p_order::text)
       or (g.source_type='subscription' and g.source_id=p_subscription::text)))))
$$;


--

-- Name: billing_admit_lifetime_order(uuid, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_admit_lifetime_order(p_user_id uuid, p_environment text, p_checkout_key text, p_order_id text, p_product_id text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_reason text;
begin
 if p_environment not in ('sandbox','production') or p_checkout_key not in ('founders','launch_lifetime')
 or nullif(p_order_id,'') is null or nullif(p_product_id,'') is null then raise exception 'invalid_admission'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,0));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text||':billing',0));
 if not exists(select 1 from public.profiles where id=p_user_id)
 or exists(select 1 from public.account_identities where account_id=p_user_id and deleted_at is not null)
 then raise exception using errcode='28000',message='account_deleted'; end if;
 -- Recorded history is replayable and refundable; never admit an unseen Launch order.
 if exists(select 1 from public.billing_orders where environment=p_environment and provider_order_id=p_order_id
   and user_id=p_user_id and provider_product_id=p_product_id) then return null; end if;
 if p_checkout_key='launch_lifetime' then v_reason:='launch_payment_retired';
 elsif exists(select 1 from private.lifetime_order_admissions where environment=p_environment and account_id=p_user_id and order_id<>p_order_id)
 or exists(select 1 from public.billing_effective_access_grants where environment=p_environment and user_id=p_user_id
   and capability='vantare.plan.founders' and status='active' and source_id<>p_order_id)
 or exists(select 1 from public.billing_orders where environment=p_environment and user_id=p_user_id
   and provider_product_id=p_product_id and provider_order_id<>p_order_id and paid)
 then v_reason:='founders_duplicate_payment';
 else
  insert into private.lifetime_order_admissions values(p_environment,p_order_id,p_user_id,p_checkout_key,p_product_id,now())
  on conflict(environment,order_id) do nothing;
  if not exists(select 1 from private.lifetime_order_admissions where environment=p_environment and order_id=p_order_id
    and account_id=p_user_id and product_id=p_product_id) then v_reason:='order_refund_ledger_invalid_attribution'; end if;
 end if;
 if v_reason is not null then
  insert into private.billing_payment_incidents(environment,account_id,resource_id,reason)
  values(p_environment,p_user_id,p_order_id,v_reason) on conflict do nothing;
 end if;
 return v_reason;
end $$;


--

-- Name: billing_apply_reconciliation_plan(uuid, text, text, text, text, timestamp with time zone, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_apply_reconciliation_plan(p_user_id uuid, p_environment text, p_trigger_kind text, p_snapshot_hash text, p_plan_hash text, p_observed_at timestamp with time zone, p_operations jsonb) RETURNS TABLE(status text, changed integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare
  v_operation jsonb;
  v_existing public.billing_commercial_resources%rowtype;
  v_outcome text;
  v_changed integer := 0;
begin
  perform private.lock_accounts_before_rows(array[p_user_id] || array(select r.user_id from public.billing_commercial_resources r
       join jsonb_array_elements(p_operations) op on r.provider='polar' and r.environment=p_environment
         and r.resource_type=op->>'resourceType' and r.resource_id=op->>'resourceId'));
  if p_environment not in ('sandbox', 'production')
     or p_trigger_kind not in ('manual', 'scheduled')
     or p_snapshot_hash !~ '^[0-9a-f]{64}$'
     or p_plan_hash !~ '^[0-9a-f]{64}$'
     or p_observed_at is null
     or jsonb_typeof(p_operations) <> 'array'
     or jsonb_array_length(p_operations) > 256
     or octet_length(p_operations::text) > 262144 then
    raise exception 'invalid_reconciliation_plan';
  end if;

  -- Serialize every reconciliation for one account before checking
  -- idempotency. This also covers first-seen resources, where no projection
  -- row exists yet to lock.
  perform 1
  from public.profiles p
  where p.id = p_user_id
  for update;
  if not found then
    raise exception 'reconciliation_user_not_found';
  end if;

  if exists (
    select 1 from public.billing_reconciliation_runs r
    where r.provider = 'polar'
      and r.environment = p_environment
      and r.user_id = p_user_id
      and r.snapshot_hash = p_snapshot_hash
      and r.plan_hash = p_plan_hash
  ) then
    return query select 'unchanged'::text, 0;
    return;
  end if;

  perform 1
  from public.billing_commercial_resources r
  join jsonb_array_elements(p_operations) op
    on r.provider = 'polar'
   and r.environment = p_environment
   and r.resource_type = op->>'resourceType'
   and r.resource_id = op->>'resourceId'
  order by r.resource_type, r.resource_id
  for update of r;

  for v_operation in select value from jsonb_array_elements(p_operations)
  loop
    if v_operation->>'provider' <> 'polar'
       or v_operation->>'environment' <> p_environment
       or v_operation->>'userId' <> p_user_id::text
       or (v_operation->>'resourceType') not in ('order', 'subscription', 'benefit_grant')
       or nullif(trim(v_operation->>'resourceId'), '') is null
       or nullif(trim(v_operation->>'state'), '') is null
       or (v_operation->>'snapshotHash') !~ '^[0-9a-f]{64}$'
       or jsonb_typeof(v_operation->'grants') <> 'array' then
      raise exception 'invalid_reconciliation_operation';
    end if;

    select * into v_existing
    from public.billing_commercial_resources r
    where r.provider = 'polar'
      and r.environment = p_environment
      and r.resource_type = v_operation->>'resourceType'
      and r.resource_id = v_operation->>'resourceId';
    if found and v_existing.user_id <> p_user_id then
      raise exception 'commercial_resource_owner_mismatch';
    end if;
    if found
       and (v_operation->>'modifiedAt')::timestamptz = v_existing.remote_modified_at
       and v_operation->>'snapshotHash' <> v_existing.snapshot_hash then
      insert into public.billing_reconciliation_runs (
        user_id, provider, environment, trigger_kind, snapshot_hash, plan_hash,
        observed_hash, plan, operation_count, changed_count, status
      ) values (
        p_user_id, 'polar', p_environment, p_trigger_kind, p_snapshot_hash,
        p_plan_hash, p_snapshot_hash, p_operations,
        jsonb_array_length(p_operations), 0, 'quarantined'
      );
      return query select 'quarantined'::text, 0;
      return;
    end if;
  end loop;

  for v_operation in select value from jsonb_array_elements(p_operations)
  loop
    select applied.outcome
    into v_outcome
    from public.billing_apply_resource_snapshot(
      'polar',
      p_environment,
      v_operation->>'resourceType',
      v_operation->>'resourceId',
      p_user_id,
      (v_operation->>'modifiedAt')::timestamptz,
      v_operation->>'snapshotHash',
      v_operation->>'state',
      v_operation->'grants'
    ) applied;
    if v_outcome = 'version_conflict' then
      raise exception 'reconciliation_version_conflict';
    end if;
    if v_outcome = 'apply' then v_changed := v_changed + 1; end if;
  end loop;

  insert into public.billing_reconciliation_runs (
    user_id, provider, environment, trigger_kind, snapshot_hash, plan_hash,
    observed_hash, plan, operation_count, changed_count, status
  ) values (
    p_user_id, 'polar', p_environment, p_trigger_kind, p_snapshot_hash,
    p_plan_hash, p_snapshot_hash, p_operations, jsonb_array_length(p_operations),
    v_changed, case when v_changed > 0 then 'applied' else 'unchanged' end
  );
  return query select
    case when v_changed > 0 then 'applied' else 'unchanged' end::text,
    v_changed;
end;
$_$;


--

-- Name: billing_apply_resource_snapshot(text, text, text, text, uuid, timestamp with time zone, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_apply_resource_snapshot(p_provider text, p_environment text, p_resource_type text, p_resource_id text, p_user_id uuid, p_modified_at timestamp with time zone, p_snapshot_hash text, p_state text, p_grants jsonb) RETURNS TABLE(outcome text, grants_changed integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare
  v_resource public.billing_commercial_resources%rowtype;
  v_grant jsonb;
  v_capabilities text[] := '{}'::text[];
  v_changed integer := 0;
  v_revoked integer := 0;
  v_status text;
  v_valid_until timestamptz;
  v_is_new boolean := false;
begin
  perform private.lock_accounts_before_rows(array[p_user_id] || array(select user_id from public.billing_commercial_resources
       where provider=p_provider and environment=p_environment and resource_type=p_resource_type and resource_id=trim(p_resource_id)));
  if p_provider <> 'polar'
     or p_environment not in ('sandbox', 'production')
     or p_resource_type not in ('order', 'subscription', 'benefit_grant')
     or p_resource_id is null or length(trim(p_resource_id)) not between 1 and 200
     or p_state is null or length(trim(p_state)) not between 1 and 80
     or p_modified_at is null
     or p_snapshot_hash !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_grants) <> 'array'
     or jsonb_array_length(p_grants) > 32 then
    raise exception 'invalid_commercial_snapshot';
  end if;

  insert into public.billing_commercial_resources (
    user_id, provider, environment, resource_type, resource_id,
    remote_state, remote_modified_at, snapshot_hash
  ) values (
    p_user_id, p_provider, p_environment, p_resource_type, trim(p_resource_id),
    trim(p_state), p_modified_at, p_snapshot_hash
  ) on conflict (provider, environment, resource_type, resource_id) do nothing
  returning * into v_resource;

  if found then
    v_is_new := true;
  else
    select * into v_resource
    from public.billing_commercial_resources r
    where r.provider = p_provider
      and r.environment = p_environment
      and r.resource_type = p_resource_type
      and r.resource_id = trim(p_resource_id)
    for update;
  end if;

  if v_resource.user_id <> p_user_id then
    raise exception 'commercial_resource_owner_mismatch';
  end if;

  if not v_is_new and p_modified_at < v_resource.remote_modified_at then
    update public.billing_commercial_resources
    set stale_event_count = stale_event_count + 1,
        last_stale_event_at = now(),
        updated_at = now()
    where id = v_resource.id;
    return query select 'stale_noop'::text, 0;
    return;
  end if;

  if not v_is_new and p_modified_at = v_resource.remote_modified_at then
    if p_snapshot_hash = v_resource.snapshot_hash then
      return query select 'duplicate'::text, 0;
      return;
    else
      update public.billing_commercial_resources
      set conflict_count = conflict_count + 1,
          updated_at = now()
      where id = v_resource.id;
      return query select 'version_conflict'::text, 0;
      return;
    end if;
  end if;

  if not v_is_new then
    update public.billing_commercial_resources
    set remote_state = trim(p_state),
        remote_modified_at = p_modified_at,
        snapshot_hash = p_snapshot_hash,
        updated_at = now()
    where id = v_resource.id;
  end if;

  for v_grant in select value from jsonb_array_elements(p_grants)
  loop
    if jsonb_typeof(v_grant) <> 'object'
       or nullif(trim(v_grant->>'capability'), '') is null
       or length(trim(v_grant->>'capability')) > 128
       or (v_grant->>'status') not in ('active', 'revoked') then
      raise exception 'invalid_commercial_grant';
    end if;
    v_status := v_grant->>'status';
    begin
      v_valid_until := nullif(v_grant->>'validUntil', '')::timestamptz;
    exception when invalid_datetime_format then
      raise exception 'invalid_commercial_grant';
    end;
    v_capabilities := array_append(v_capabilities, trim(v_grant->>'capability'));

    insert into public.billing_access_grants (
      user_id, provider, environment, source_type, source_id, capability,
      status, valid_until, resource_modified_at, snapshot_hash, metadata
    ) values (
      p_user_id, p_provider, p_environment, p_resource_type, trim(p_resource_id),
      trim(v_grant->>'capability'), v_status, v_valid_until, p_modified_at,
      p_snapshot_hash, jsonb_build_object('remote_state', trim(p_state))
    )
    on conflict (provider, environment, source_type, source_id, capability)
    do update set
      user_id = excluded.user_id,
      status = excluded.status,
      valid_until = excluded.valid_until,
      resource_modified_at = excluded.resource_modified_at,
      snapshot_hash = excluded.snapshot_hash,
      metadata = excluded.metadata,
      updated_at = now();
    v_changed := v_changed + 1;
  end loop;

  update public.billing_access_grants
  set status = 'revoked',
      valid_until = least(coalesce(valid_until, p_modified_at), p_modified_at),
      resource_modified_at = p_modified_at,
      snapshot_hash = p_snapshot_hash,
      updated_at = now()
  where provider = p_provider
    and environment = p_environment
    and source_type = p_resource_type
    and source_id = trim(p_resource_id)
    and not (capability = any(v_capabilities))
    and status <> 'revoked';
  get diagnostics v_revoked = row_count;
  v_changed := v_changed + v_revoked;

  perform public.billing_refresh_entitlement_read_model(p_user_id);
  return query select 'apply'::text, v_changed;
end;
$_$;


--

-- Name: billing_apply_subscription_lifecycle(uuid, text, text, text, text, timestamp with time zone, timestamp with time zone, timestamp with time zone, boolean, timestamp with time zone, text, text, timestamp with time zone, timestamp with time zone, timestamp with time zone, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_apply_subscription_lifecycle(p_user_id uuid, p_environment text, p_subscription_id text, p_product_id text, p_status text, p_period_start timestamp with time zone, p_remote_period_end timestamp with time zone, p_paid_through timestamp with time zone, p_cancel_at_period_end boolean, p_modified_at timestamp with time zone, p_snapshot_hash text, p_recovery_action text, p_failure_at timestamp with time zone, p_cycle_paid_through timestamp with time zone, p_evaluated_at timestamp with time zone, p_capabilities text[]) RETURNS TABLE(outcome text, effective_recovery_until timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare
  v_resource public.billing_commercial_resources%rowtype;
  v_subscription public.billing_subscriptions%rowtype;
  v_cycle public.billing_subscription_recovery_cycles%rowtype;
  v_exact_version boolean;
  v_accept_older_failure boolean := false;
  v_source_id text;
  v_grant record;
  v_recovery_status text;
begin
  perform private.lock_accounts_before_rows(array[p_user_id] || array(select user_id from public.billing_commercial_resources
       where provider='polar' and environment=p_environment and resource_type='subscription' and resource_id=trim(p_subscription_id)
       union select user_id from public.billing_subscriptions where provider='polar' and environment=p_environment and provider_subscription_id=trim(p_subscription_id)));
  if p_environment not in ('sandbox', 'production')
     or p_subscription_id is null or length(trim(p_subscription_id)) not between 1 and 200
     or p_product_id is null or length(trim(p_product_id)) not between 1 and 200
     or p_status not in ('incomplete','incomplete_expired','trialing','active','canceled','uncanceled','past_due','unpaid','revoked')
     or p_modified_at is null or p_evaluated_at is null
     or p_snapshot_hash !~ '^[0-9a-f]{64}$'
     or p_capabilities is null
     or cardinality(p_capabilities) not between 1 and 64
     or exists (
       select 1 from unnest(p_capabilities) capability
       where nullif(trim(capability), '') is null or length(trim(capability)) > 128
     )
     or p_recovery_action not in ('open','close','none') then
    raise exception 'invalid_subscription_lifecycle';
  end if;

  select * into v_resource
  from public.billing_commercial_resources resource
  where resource.provider = 'polar'
    and resource.environment = p_environment
    and resource.resource_type = 'subscription'
    and resource.resource_id = trim(p_subscription_id)
  for update;
  if not found then raise exception 'subscription_resource_not_found'; end if;
  if v_resource.user_id <> p_user_id then
    raise exception 'commercial_resource_owner_mismatch';
  end if;

  select * into v_subscription
  from public.billing_subscriptions subscription
  where subscription.provider = 'polar'
    and subscription.environment = p_environment
    and subscription.provider_subscription_id = trim(p_subscription_id)
  for update;

  v_exact_version := v_resource.remote_modified_at = p_modified_at
    and v_resource.snapshot_hash = p_snapshot_hash;
  v_accept_older_failure := p_status = 'past_due'
    and p_recovery_action = 'open'
    and v_resource.remote_state = 'past_due'
    and p_modified_at < v_resource.remote_modified_at
    and v_subscription.status = 'past_due'
    and v_subscription.paid_through is not null
    and p_remote_period_end = v_subscription.paid_through
    and p_cycle_paid_through = v_subscription.paid_through
    and exists (
      select 1
      from public.billing_subscription_recovery_cycles cycle
      where cycle.provider = 'polar'
        and cycle.environment = p_environment
        and cycle.subscription_id = trim(p_subscription_id)
        and cycle.cycle_paid_through = v_subscription.paid_through
    );
  if not v_exact_version and not v_accept_older_failure then
    return query select 'ignored_version'::text, null::timestamptz;
    return;
  end if;

  if v_exact_version then
    insert into public.billing_subscriptions (
      user_id, provider, environment, provider_subscription_id,
      provider_product_id, provider_price_id, status, current_period_start,
      current_period_end, paid_through, cancel_at_period_end, metadata, updated_at
    ) values (
      p_user_id, 'polar', p_environment, trim(p_subscription_id),
      trim(p_product_id), null, p_status, p_period_start, p_paid_through,
      p_paid_through, p_cancel_at_period_end,
      jsonb_build_object('derived', true, 'lifecycle_version', 1), p_modified_at
    )
    on conflict (provider, environment, provider_subscription_id) do update set
      user_id = excluded.user_id,
      provider_product_id = excluded.provider_product_id,
      status = excluded.status,
      current_period_start = excluded.current_period_start,
      current_period_end = excluded.current_period_end,
      paid_through = excluded.paid_through,
      cancel_at_period_end = excluded.cancel_at_period_end,
      metadata = excluded.metadata,
      updated_at = excluded.updated_at
    where excluded.updated_at >= public.billing_subscriptions.updated_at;

    select * into v_subscription
    from public.billing_subscriptions subscription
    where subscription.provider = 'polar'
      and subscription.environment = p_environment
      and subscription.provider_subscription_id = trim(p_subscription_id)
    for update;
  end if;

  if p_recovery_action = 'open' then
    if p_status <> 'past_due' or p_failure_at is null
       or p_cycle_paid_through is null or v_subscription.paid_through is null
       or p_failure_at <> p_modified_at
       or p_cycle_paid_through <> v_subscription.paid_through then
      raise exception 'subscription_recovery_unproven';
    end if;

    insert into public.billing_subscription_recovery_cycles (
      user_id, provider, environment, subscription_id, cycle_paid_through,
      first_failure_at, recovery_until
    ) values (
      p_user_id, 'polar', p_environment, trim(p_subscription_id),
      p_cycle_paid_through, p_failure_at, p_failure_at + interval '72 hours'
    )
    on conflict (provider, environment, subscription_id, cycle_paid_through)
    do update set
      first_failure_at = least(
        public.billing_subscription_recovery_cycles.first_failure_at,
        excluded.first_failure_at
      ),
      recovery_until = least(
        public.billing_subscription_recovery_cycles.first_failure_at,
        excluded.first_failure_at
      ) + interval '72 hours',
      updated_at = now()
    returning * into v_cycle;

    update public.billing_subscription_recovery_cycles cycle
    set closed_at = coalesce(cycle.closed_at, p_failure_at),
        close_reason = coalesce(cycle.close_reason, 'superseded_cycle'),
        updated_at = now()
    where cycle.provider = 'polar'
      and cycle.environment = p_environment
      and cycle.subscription_id = trim(p_subscription_id)
      and cycle.cycle_paid_through <> p_cycle_paid_through
      and cycle.closed_at is null;

    v_source_id := 'recovery:' || encode(digest(
      trim(p_subscription_id) || ':' || p_cycle_paid_through::text,
      'sha256'
    ), 'hex');
    v_recovery_status := case
      when v_cycle.closed_at is null and p_evaluated_at < v_cycle.recovery_until
        then 'active'
      else 'revoked'
    end;

    update public.billing_access_grants grant_row
    set status = 'revoked',
        valid_until = least(coalesce(grant_row.valid_until, p_modified_at), p_modified_at),
        updated_at = now()
    where grant_row.provider = 'vantare'
      and grant_row.environment = p_environment
      and grant_row.source_type = 'subscription_recovery'
      and grant_row.source_id = v_source_id
      and not (grant_row.capability = any(p_capabilities))
      and grant_row.status <> 'revoked';

    for v_grant in
      select distinct trim(capability) as capability
      from unnest(p_capabilities) capability
    loop
      insert into public.billing_access_grants (
        user_id, provider, environment, source_type, source_id, capability,
        status, valid_until, resource_modified_at, snapshot_hash, metadata
      ) values (
        p_user_id, 'vantare', p_environment, 'subscription_recovery',
        v_source_id, v_grant.capability, v_recovery_status,
        v_cycle.recovery_until, v_cycle.first_failure_at,
        encode(digest(
          trim(p_subscription_id) || ':' || p_cycle_paid_through::text || ':' ||
          v_cycle.first_failure_at::text,
          'sha256'
        ), 'hex'),
        jsonb_build_object(
          'authority', 'vantare_recovery_policy',
          'subscription_id', trim(p_subscription_id),
          'cycle_paid_through', p_cycle_paid_through
        )
      )
      on conflict (provider, environment, source_type, source_id, capability)
      do update set
        status = excluded.status,
        valid_until = excluded.valid_until,
        resource_modified_at = excluded.resource_modified_at,
        snapshot_hash = excluded.snapshot_hash,
        metadata = excluded.metadata,
        updated_at = now();
    end loop;

    update public.billing_subscriptions
    set recovery_cycle_paid_through = v_cycle.cycle_paid_through,
        recovery_started_at = v_cycle.first_failure_at,
        recovery_until = v_cycle.recovery_until,
        updated_at = greatest(updated_at, p_modified_at)
    where provider = 'polar'
      and environment = p_environment
      and provider_subscription_id = trim(p_subscription_id);
  else
    if v_exact_version then
      update public.billing_subscription_recovery_cycles cycle
      set closed_at = coalesce(cycle.closed_at, p_modified_at),
          close_reason = coalesce(cycle.close_reason, p_status),
          updated_at = now()
      where cycle.provider = 'polar'
        and cycle.environment = p_environment
        and cycle.subscription_id = trim(p_subscription_id)
        and cycle.closed_at is null;

      update public.billing_access_grants grant_row
      set status = 'revoked',
          valid_until = least(coalesce(grant_row.valid_until, p_modified_at), p_modified_at),
          updated_at = now()
      where grant_row.provider = 'vantare'
        and grant_row.environment = p_environment
        and grant_row.source_type = 'subscription_recovery'
        and grant_row.metadata->>'subscription_id' = trim(p_subscription_id)
        and grant_row.status <> 'revoked';

      update public.billing_subscriptions
      set recovery_cycle_paid_through = null,
          recovery_started_at = null,
          recovery_until = null
      where provider = 'polar'
        and environment = p_environment
        and provider_subscription_id = trim(p_subscription_id);
    end if;
  end if;

  -- A late first-failure correction may update only Vantare's recovery source.
  -- The commercial projection remains owned by the exact Polar resource version.
  if v_exact_version then
    update public.billing_access_grants grant_row
    set status = case
          when p_status in ('active','uncanceled','trialing')
            and p_paid_through is not null and p_evaluated_at < p_paid_through
            then 'active'
          when p_status = 'canceled' and p_cancel_at_period_end
            and p_paid_through is not null and p_evaluated_at < p_paid_through
            then 'active'
          when p_status = 'past_due' and v_subscription.paid_through is not null
            and p_evaluated_at < v_subscription.paid_through
            then 'active'
          else 'revoked'
        end,
        valid_until = coalesce(v_subscription.paid_through, p_paid_through, p_evaluated_at),
        updated_at = now()
    where grant_row.provider = 'polar'
      and grant_row.environment = p_environment
      and grant_row.source_type = 'subscription'
      and grant_row.source_id = trim(p_subscription_id)
      and grant_row.capability = any(p_capabilities);
  end if;

  perform public.billing_refresh_entitlement_read_model_at(p_user_id, p_evaluated_at);
  perform private.close_terminal_checkout_attempts(p_user_id,p_environment);
  return query select 'applied'::text, v_cycle.recovery_until;
end;
$_$;


--

-- Name: billing_begin_checkout_request(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_begin_checkout_request(p_user_id uuid, p_attempt_id uuid, p_product_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
 perform private.lock_accounts_before_rows(array[p_user_id]);
 update public.billing_checkout_attempts set provider_request_started_at=now(),dispatch_product_id=p_product_id,updated_at=now()
 where user_id=p_user_id and attempt_id=p_attempt_id and status='creating'
  and resolution is null and provider_request_started_at is null and expires_at>now();
 if not found then return null; end if;
 return (select jsonb_build_object('dispatch_token',dispatch_token) from public.billing_checkout_attempts where user_id=p_user_id and attempt_id=p_attempt_id);
end $$;


--

-- Name: billing_checkout_incident(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_checkout_incident(p_environment text, p_correlation text, p_code text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
begin
 if p_environment not in ('sandbox','production') or p_environment is null or p_code is null
  or p_code !~ '^[a-z0-9_]{1,64}$' or length(coalesce(p_correlation,''))>128 then raise exception 'invalid_checkout_incident'; end if;
 insert into private.billing_owner_notices(environment,kind,correlation_hash,code)
 values(p_environment,'checkout_review',encode(extensions.digest(coalesce(p_correlation,'unknown')||':'||p_code,'sha256'),'hex'),p_code)
 on conflict do nothing;
end $_$;


--

-- Name: billing_checkout_maintenance(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_checkout_maintenance(p_environment text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--

-- Name: billing_checkout_owner_alerts(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_checkout_owner_alerts(p_environment text) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
 select coalesce(jsonb_agg(jsonb_build_object('order_id',order_id,'code',last_error_code,'attempt_count',attempt_count)),'[]')
 from (select * from private.billing_checkout_compensations where environment=p_environment
   and alert_pending and alert_next_at<=now() order by alert_next_at limit 5) c
$$;


--

-- Name: billing_claim_checkout_compensation(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_claim_checkout_compensation(p_environment text, p_token uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--

-- Name: billing_claim_webhook(uuid, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_claim_webhook(p_inbox_id uuid, p_lease_token uuid, p_lease_seconds integer DEFAULT 60) RETURNS TABLE(claim_status text, inbox_id uuid, provider text, provider_event_id text, event_type text, payload jsonb, attempt_count integer, next_attempt_at timestamp with time zone, lease_expires_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_row public.billing_webhook_inbox%rowtype;
begin
  if p_lease_token is null or p_lease_seconds not between 10 and 300 then
    raise exception 'invalid_webhook_lease';
  end if;

  select * into v_row
  from public.billing_webhook_inbox i
  where i.id = p_inbox_id
  for update;

  if not found then
    raise exception 'webhook_not_found';
  end if;

  if v_row.status = 'processed' then
    claim_status := 'processed';
  elsif v_row.status = 'quarantined' then
    claim_status := 'quarantined';
  elsif v_row.status = 'processing' and v_row.lease_expires_at > now() then
    claim_status := 'busy';
  elsif v_row.status = 'failed' and v_row.next_attempt_at > now() then
    claim_status := 'retry_scheduled';
  elsif v_row.attempt_count >= v_row.max_attempts then
    update public.billing_webhook_inbox
    set status = 'quarantined',
        quarantine_reason = coalesce(quarantine_reason, 'retry_limit_reached'),
        lease_token = null,
        lease_expires_at = null,
        updated_at = now()
    where id = p_inbox_id;
    claim_status := 'quarantined';
  else
    update public.billing_webhook_inbox as inbox
    set status = 'processing',
        attempt_count = inbox.attempt_count + 1,
        lease_token = p_lease_token,
        lease_expires_at = now() + make_interval(secs => p_lease_seconds),
        processing_started_at = now(),
        updated_at = now()
    where inbox.id = p_inbox_id
    returning inbox.* into v_row;
    claim_status := 'claimed';
  end if;

  inbox_id := v_row.id;
  provider := v_row.provider;
  provider_event_id := v_row.provider_event_id;
  event_type := v_row.event_type;
  payload := v_row.payload;
  attempt_count := v_row.attempt_count;
  next_attempt_at := v_row.next_attempt_at;
  lease_expires_at := v_row.lease_expires_at;
  return next;
end;
$$;


--

-- Name: billing_claim_webhook_effect(uuid, text, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_claim_webhook_effect(p_inbox_id uuid, p_effect_key text, p_lease_token uuid, p_lease_seconds integer DEFAULT 60) RETURNS TABLE(claim_status text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare
  v_row public.billing_webhook_effects%rowtype;
begin
  if p_effect_key !~ '^[a-z0-9_:-]{1,96}$'
     or p_lease_token is null
     or p_lease_seconds not between 10 and 300 then
    raise exception 'invalid_effect_claim';
  end if;

  insert into public.billing_webhook_effects (inbox_id, effect_key)
  values (p_inbox_id, p_effect_key)
  on conflict (inbox_id, effect_key) do nothing;

  select * into v_row
  from public.billing_webhook_effects e
  where e.inbox_id = p_inbox_id and e.effect_key = p_effect_key
  for update;

  if v_row.status = 'completed' then
    claim_status := 'completed';
  elsif v_row.status = 'processing' and v_row.lease_expires_at > now() then
    claim_status := 'busy';
  else
    update public.billing_webhook_effects
    set status = 'processing',
        attempt_count = attempt_count + 1,
        lease_token = p_lease_token,
        lease_expires_at = now() + make_interval(secs => p_lease_seconds),
        last_error_code = null,
        updated_at = now()
    where inbox_id = p_inbox_id and effect_key = p_effect_key;
    claim_status := 'claimed';
  end if;
  return next;
end;
$_$;


--

-- Name: billing_complete_founders_transition(text, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_complete_founders_transition(p_environment text, p_subscription_id text, p_revision timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
 update private.founders_subscription_transitions set state='completed',updated_at=now()
 where environment=p_environment and subscription_id=p_subscription_id and state='pending'
 and last_reactivation_at is not distinct from p_revision
$$;


--

-- Name: billing_complete_webhook(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_complete_webhook(p_inbox_id uuid, p_lease_token uuid) RETURNS TABLE(completed boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  update public.billing_webhook_inbox
  set status = 'processed',
      processed_at = now(),
      lease_token = null,
      lease_expires_at = null,
      last_error_code = null,
      updated_at = now()
  where id = p_inbox_id
    and status = 'processing'
    and lease_token = p_lease_token;
  completed := found;
  return next;
end;
$$;


--

-- Name: billing_complete_webhook_effect(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_complete_webhook_effect(p_inbox_id uuid, p_effect_key text, p_lease_token uuid) RETURNS TABLE(completed boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  update public.billing_webhook_effects
  set status = 'completed',
      completed_at = now(),
      lease_token = null,
      lease_expires_at = null,
      last_error_code = null,
      updated_at = now()
  where inbox_id = p_inbox_id
    and effect_key = p_effect_key
    and status = 'processing'
    and lease_token = p_lease_token;
  completed := found;
  return next;
end;
$$;


--

-- Name: billing_creator_renewal_authorized(text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_creator_renewal_authorized(p_environment text, p_subscription text, p_token uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
 select exists(select 1 from private.creator_renewal_operations op join public.profiles p on p.id=op.account_id
 where op.environment=p_environment and op.subscription_id=p_subscription and op.lease_token=p_token and op.lease_until>now() and op.state='pending' and op.revocation_requested_at is null and not exists(select 1 from private.creator_subscription_revocations where environment=p_environment and subscription_id=p_subscription)
 and not exists(select 1 from public.account_identities where account_id=op.account_id and deleted_at is not null)
 and exists(select 1 from public.billing_orders where environment=op.environment and provider_order_id=op.first_order_id and paid and reported_refunded_amount=0 and not exists(select 1 from public.billing_orders prior_order where prior_order.environment=p_environment and prior_order.provider_subscription_id=p_subscription and (prior_order.reported_refunded_amount>0 or exists(select 1 from public.billing_refunds refund where refund.environment=p_environment and refund.provider_order_id=prior_order.provider_order_id and refund.status='succeeded' and refund.amount>0))))
 and not exists(select 1 from public.billing_effective_access_grants where environment=op.environment and user_id=op.account_id and capability='vantare.plan.founders' and status='active'))
$$;


--

-- Name: billing_creator_renewal_finish(text, text, uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_creator_renewal_finish(p_environment text, p_subscription text, p_token uuid, p_success boolean) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_op private.creator_renewal_operations%rowtype;
begin
 select * into v_op from private.creator_renewal_operations where environment=p_environment and subscription_id=p_subscription for update;
 if p_success and v_op.revocation_requested_at is not null then return false; end if;
 if not found or v_op.lease_token is distinct from p_token or (p_success and v_op.lease_until<=now()) then return false; end if;
 if not exists(select 1 from public.profiles where id=v_op.account_id) or exists(select 1 from public.account_identities where account_id=v_op.account_id and deleted_at is not null) then return false; end if;
 update private.creator_renewal_operations set state=case when p_success then 'completed' else 'pending' end,completed_at=case when p_success then now() else null end,lease_until=null,lease_token=null where environment=p_environment and subscription_id=p_subscription;
 if not p_success then
  insert into private.billing_payment_incidents(environment,account_id,resource_id,reason) values(p_environment,v_op.account_id,p_subscription,'creator_renewal_discount_failed') on conflict do nothing;
 end if;
 return true;
end $$;


--

-- Name: billing_creator_renewal_prepare(text, uuid, text, text, text, uuid, text, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_creator_renewal_prepare(p_environment text, p_user uuid, p_checkout text, p_subscription text, p_order text, p_product uuid, p_key text, p_initial_discount uuid, p_creator_savings integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
 declare staged jsonb;
 begin
  -- Publishing, preparing and report-only claims use the same B03 lock.
  -- The installed selector no longer acquires the legacy seed-0 lock.
  -- No unlocked candidate
  -- publisher may clear a token while its PATCH is in flight.
  if private.lock_account_write(p_user) then return null; end if;
  -- A late/reconciled attribution cannot race an already leased report-only PATCH.
  if exists(select 1 from private.report_promotion_changes r where r.environment=p_environment and r.subscription_id=p_subscription and r.account_id=p_user and r.renewal_token is null and r.lease_until>clock_timestamp() and r.applied_at is null and r.superseded_at is null) then
   return jsonb_build_object('busy',true);
  end if;
  -- A report-campaign account has exactly one external writer: #1593 refreshes
  -- its actual settled budget before using the shared #1661 selector. Webhook
  -- retries must not reattach a stale/exhausted report candidate on their own.
  -- Stage immutable attribution/initial payment if needed, then hand off without
  -- an external operation or a failure/quarantine of the webhook.
  if exists(select 1 from private.report_promotions r where r.account_id=p_user and r.environment=p_environment) then
   if not exists(select 1 from private.creator_renewal_operations c where c.environment=p_environment and c.subscription_id=p_subscription) then
    staged:=private.billing_creator_renewal_prepare_before_1593(p_environment,p_user,p_checkout,p_subscription,p_order,p_product,p_key,p_initial_discount,p_creator_savings);
    if staged is not null and staged->>'busy' is distinct from 'true' then
     update private.creator_renewal_operations set lease_token=null,lease_until=null,state='pending'
      where environment=p_environment and subscription_id=p_subscription and lease_token=(staged->>'token')::uuid;
    end if;
   end if;
   return null;
  end if;
  return private.report_creator_bound(p_environment,p_subscription,
   private.billing_creator_renewal_prepare_before_1593(p_environment,p_user,p_checkout,p_subscription,p_order,p_product,p_key,p_initial_discount,case when private.report_creator_end(p_environment,p_subscription,clock_timestamp())<=clock_timestamp() then 0 else p_creator_savings end),clock_timestamp());
 end $$;


--

-- Name: billing_creator_revocation(text, text, uuid, text, text, text, uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_creator_revocation(p_stage text, p_environment text, p_user uuid, p_subscription text, p_order text DEFAULT NULL::text, p_reason text DEFAULT NULL::text, p_token uuid DEFAULT NULL::uuid, p_success boolean DEFAULT NULL::boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  declare result jsonb; managed jsonb;
  begin
   if private.lock_account_write(p_user) then return null; end if;
   result:=private.billing_creator_revocation_before_1593(p_stage,p_environment,p_user,p_subscription,p_order,p_reason,p_token,p_success);
   if result->>'token' is not null then
    select coalesce(jsonb_agg(r.discount_id::text),'[]') into managed from private.report_creator_remainders r
     where r.environment=p_environment and r.product_id=(result->>'product_id')::uuid and r.creator_discount_id=(result->>'creator_discount_id')::uuid;
    result:=result||jsonb_build_object('managed_creator_ids',managed);
   end if;
   return result;
  end $$;


--

-- Name: billing_expire_published_checkout(text, uuid, uuid, text, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_expire_published_checkout(p_environment text, p_user_id uuid, p_attempt_id uuid, p_checkout_id text, p_terminal boolean, p_provider_status text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--

-- Name: billing_expire_subscription_grants(timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_expire_subscription_grants(p_evaluated_at timestamp with time zone) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_user_id uuid;
  v_user_ids uuid[];
  v_changed integer;
begin
  perform private.lock_accounts_before_rows(array(select user_id from (
       select user_id from public.billing_access_grants where status='active' and valid_until<=p_evaluated_at
       union select user_id from public.billing_subscription_recovery_cycles where closed_at is null and recovery_until<=p_evaluated_at
       union select user_id from public.billing_subscriptions where recovery_until<=p_evaluated_at) live
       where not exists(select 1 from public.account_identities i where i.account_id=live.user_id and i.deleted_at is not null)));
  if p_evaluated_at is null then raise exception 'invalid_evaluation_time'; end if;
  with expired as (
    update public.billing_access_grants grant_row
    set status = 'revoked', updated_at = now()
    where grant_row.source_type in ('subscription','subscription_recovery')
      and grant_row.status = 'active'
      and grant_row.valid_until is not null
      and p_evaluated_at >= grant_row.valid_until and not exists(select 1 from public.account_identities i where i.account_id=grant_row.user_id and i.deleted_at is not null)
    returning grant_row.user_id
  )
  select count(*)::integer, array_agg(distinct user_id)
  into v_changed, v_user_ids
  from expired;

  update public.billing_subscription_recovery_cycles cycle
  set closed_at = cycle.recovery_until,
      close_reason = 'expired',
      updated_at = now()
  where cycle.closed_at is null
    and p_evaluated_at >= cycle.recovery_until and not exists(select 1 from public.account_identities i where i.account_id=cycle.user_id and i.deleted_at is not null);

  update public.billing_subscriptions subscription
  set recovery_cycle_paid_through = null,
      recovery_started_at = null,
      recovery_until = null
  where subscription.recovery_until is not null
    and p_evaluated_at >= subscription.recovery_until and not exists(select 1 from public.account_identities i where i.account_id=subscription.user_id and i.deleted_at is not null);

  foreach v_user_id in array coalesce(v_user_ids, array[]::uuid[])
  loop
    perform public.billing_refresh_entitlement_read_model_at(
      v_user_id,
      p_evaluated_at
    );
  end loop;
  return v_changed;
end;
$$;


--

-- Name: FUNCTION billing_expire_subscription_grants(p_evaluated_at timestamp with time zone); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.billing_expire_subscription_grants(p_evaluated_at timestamp with time zone) IS 'Revokes subscription and recovery grants at the exact boundary now >= valid_until.';


--

-- Name: billing_expire_unpublished_checkouts(text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_expire_unpublished_checkouts(p_environment text, p_evaluated_at timestamp with time zone DEFAULT now()) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--

-- Name: billing_fail_webhook(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_fail_webhook(p_inbox_id uuid, p_lease_token uuid, p_error_code text) RETURNS TABLE(failure_status text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare
  v_attempt_count integer;
  v_max_attempts integer;
begin
  if p_error_code !~ '^[a-z0-9_]{1,64}$' then
    raise exception 'invalid_error_code';
  end if;

  select i.attempt_count, i.max_attempts
    into v_attempt_count, v_max_attempts
  from public.billing_webhook_inbox i
  where i.id = p_inbox_id
    and i.status = 'processing'
    and i.lease_token = p_lease_token
  for update;

  if not found then
    raise exception 'webhook_lease_lost';
  end if;

  failure_status := case
    when v_attempt_count >= v_max_attempts then 'quarantined'
    else 'failed'
  end;

  update public.billing_webhook_inbox
  set status = failure_status,
      next_attempt_at = now() + make_interval(
        secs => least(3600, 30 * power(2, greatest(0, v_attempt_count - 1))::integer)
      ),
      lease_token = null,
      lease_expires_at = null,
      last_error_code = p_error_code,
      quarantine_reason = case
        when failure_status = 'quarantined' then 'retry_limit_reached'
        else quarantine_reason
      end,
      updated_at = now()
  where id = p_inbox_id;
  return next;
end;
$_$;


--

-- Name: billing_fail_webhook_effect(uuid, text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_fail_webhook_effect(p_inbox_id uuid, p_effect_key text, p_lease_token uuid, p_error_code text) RETURNS TABLE(failed boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
begin
  if p_error_code !~ '^[a-z0-9_]{1,64}$' then
    raise exception 'invalid_error_code';
  end if;
  update public.billing_webhook_effects
  set status = 'failed',
      lease_token = null,
      lease_expires_at = null,
      last_error_code = p_error_code,
      updated_at = now()
  where inbox_id = p_inbox_id
    and effect_key = p_effect_key
    and status = 'processing'
    and lease_token = p_lease_token;
  failed := found;
  return next;
end;
$_$;


--

-- Name: billing_finish_checkout_compensation(text, uuid, uuid, text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_finish_checkout_compensation(p_environment text, p_order_id uuid, p_token uuid, p_outcome text, p_refund_id uuid DEFAULT NULL::uuid, p_code text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
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
end $_$;


--

-- Name: billing_finish_checkout_owner_alert(text, uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_finish_checkout_owner_alert(p_environment text, p_order_id uuid, p_delivered boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
 update private.billing_checkout_compensations set alert_pending=not p_delivered,
  alert_attempts=alert_attempts+1,
  alert_delivered_at=case when p_delivered then now() else alert_delivered_at end,
  alert_next_at=now()+make_interval(secs=>least(3600,30*power(2,least(alert_attempts,7)))::integer)
 where environment=p_environment and order_id=p_order_id and alert_pending;
end $$;


--

-- Name: billing_finish_operational_owner_alert(text, uuid, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_finish_operational_owner_alert(p_environment text, p_order_id uuid, p_kind text, p_delivered boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
 if p_kind='checkout_refund_failed' then
  perform public.billing_finish_checkout_owner_alert(p_environment,p_order_id,p_delivered);
 else
  update private.billing_owner_notices set delivered_at=case when p_delivered then now() else delivered_at end,
   next_attempt_at=now()+make_interval(secs=>least(3600,30*power(2,least(attempts,7)))::integer),attempts=attempts+1
   where environment=p_environment and id=p_order_id and kind=p_kind and delivered_at is null;
 end if;
end $$;


--

-- Name: billing_founders_payment_allowed(text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_founders_payment_allowed(p_environment text, p_paid_at timestamp with time zone) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
 select coalesce((select sales_enabled and p_paid_at>=opens_at
 from private.founders_sale_config where environment=p_environment),false)
$$;


--

-- Name: billing_founders_subscription_transitions(text, text, uuid, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_founders_subscription_transitions(p_environment text, p_order_id text, p_user_id uuid DEFAULT NULL::uuid, p_subscription_id text DEFAULT NULL::text, p_revision timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_user uuid; v_policy text; v_order text;
begin
 select user_id,source_id into v_user,v_order from public.billing_effective_access_grants
 where environment=p_environment and source_type='order' and (source_id=p_order_id or (p_order_id is null and user_id=p_user_id))
 and capability='vantare.plan.founders' and status='active' and valid_until is null limit 1;
 if v_user is null then return '[]'::jsonb; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text,0));
 if exists(select 1 from public.account_identities where account_id=v_user and deleted_at is not null)
 or not exists(select 1 from public.profiles where id=v_user) then return '[]'::jsonb; end if;
 select subscription_transition into strict v_policy from private.founders_sale_config where environment=p_environment;
 insert into private.founders_subscription_transitions
 (environment,subscription_id,account_id,founders_order_id,policy,state,paid_period_end,last_reactivation_at)
 select p_environment,s.provider_subscription_id,v_user,v_order,v_policy,
 case when s.cancel_at_period_end then 'completed' else 'pending' end,s.current_period_end,p_revision
 from public.billing_subscriptions s where s.user_id=v_user and s.environment=p_environment
 and (p_subscription_id is null or s.provider_subscription_id=p_subscription_id)
 and s.provider='polar' and s.status in ('active','trialing','past_due','unpaid')

 on conflict(environment,subscription_id) do update set
 founders_order_id=excluded.founders_order_id,policy=excluded.policy,state=excluded.state,
 paid_period_end=excluded.paid_period_end,last_reactivation_at=coalesce(excluded.last_reactivation_at,private.founders_subscription_transitions.last_reactivation_at),updated_at=now()
 where private.founders_subscription_transitions.founders_order_id<>excluded.founders_order_id
 or (excluded.last_reactivation_at is not null and (private.founders_subscription_transitions.last_reactivation_at is null or excluded.last_reactivation_at>private.founders_subscription_transitions.last_reactivation_at));
 if p_revision is not null and exists(select 1 from private.founders_subscription_transitions where environment=p_environment and subscription_id=p_subscription_id) then
 insert into private.billing_payment_incidents(environment,account_id,resource_id,reason) values(p_environment,v_user,p_subscription_id,'founders_subscription_reactivated') on conflict do nothing;
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object('subscription_id',subscription_id,'policy',policy,'revision',last_reactivation_at))
 from private.founders_subscription_transitions where environment=p_environment and account_id=v_user
 and state='pending'),'[]'::jsonb);
end $$;


--

-- Name: billing_launch_checkout(uuid, text, text, text, text, timestamp with time zone, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_launch_checkout(p_account uuid, p_environment text, p_product text, p_discount text, p_key text, p_now timestamp with time zone, p_attempt uuid, p_replaces uuid DEFAULT NULL::uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare offer private.billing_launch_offers;
begin
 if private.lock_account_write(p_account) then raise sqlstate '28000' using message='account_deleted'; end if;
 if p_attempt is null then raise sqlstate '22023' using message='promotion_attempt_required'; end if;
 if p_now is null or not isfinite(p_now)
  or p_product is null or p_product !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  or p_discount is null or p_discount !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 then raise sqlstate '22023' using message='launch_offer_not_allowed'; end if;
 select * into offer from private.billing_launch_offers
 where environment=p_environment and checkout_key=p_key
  and product_id=p_product::uuid and discount_id=p_discount::uuid;
 if not found then raise sqlstate '22023' using message='launch_offer_not_allowed'; end if;
 if p_now<offer.starts_at or p_now>=offer.ends_at then return null; end if;
 return private.billing_launch_checkout_before_1593_guard(p_account,p_environment,offer.product_id::text,offer.discount_id::text,p_key,p_now,p_attempt,p_replaces);
end $_$;


--

-- Name: billing_observability_snapshot(text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_observability_snapshot(p_environment text, p_now timestamp with time zone DEFAULT now()) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_snapshot jsonb;
begin
  if p_environment not in ('sandbox', 'production') or p_now is null then
    raise exception 'invalid_billing_observability_request';
  end if;

  select jsonb_build_object(
    'schemaVersion', 1,
    'environment', p_environment,
    'observedAt', p_now,
    'inbox', jsonb_build_object(
      'received', count(*) filter (where i.status = 'received'),
      'processing', count(*) filter (where i.status = 'processing'),
      'failed', count(*) filter (where i.status = 'failed'),
      'quarantined', count(*) filter (where i.status = 'quarantined'),
      'retryDue', count(*) filter (
        where i.status = 'failed' and i.next_attempt_at <= p_now
      ),
      'orphaned', count(*) filter (
        where i.status = 'processing' and i.lease_expires_at < p_now
      ),
      'duplicateDeliveries', coalesce(sum(i.duplicate_count), 0),
      'oldestPendingSeconds', greatest(0, coalesce(floor(extract(epoch from
        p_now - min(i.received_at) filter (
          where i.status in ('received', 'processing', 'failed')
        )
      )), 0)),
      'unclassified', (
        select count(*) from public.billing_webhook_inbox legacy
        where legacy.provider = 'polar'
          and legacy.environment = 'unclassified'
      ),
      'replays24h', (
        select count(*) from public.billing_webhook_replay_audit a
        join public.billing_webhook_inbox replayed on replayed.id = a.inbox_id
        where a.requested_at >= p_now - interval '24 hours'
          and replayed.provider = 'polar'
          and replayed.environment = p_environment
      )
    ),
    'reconciliation', jsonb_build_object(
      'runs24h', (
        select count(*) from public.billing_reconciliation_runs r
        where r.environment = p_environment
          and r.created_at >= p_now - interval '24 hours'
      ),
      'quarantined24h', (
        select count(*) from public.billing_reconciliation_runs r
        where r.environment = p_environment
          and r.status = 'quarantined'
          and r.created_at >= p_now - interval '24 hours'
      ),
      'changed24h', (
        select coalesce(sum(r.changed_count), 0)
        from public.billing_reconciliation_runs r
        where r.environment = p_environment
          and r.created_at >= p_now - interval '24 hours'
      ),
      'lastSuccessfulAgeSeconds', coalesce((
        select floor(extract(epoch from p_now - max(r.created_at)))
        from public.billing_reconciliation_runs r
        where r.environment = p_environment
          and r.status in ('applied', 'unchanged')
          and r.created_at <= p_now
      ), 0)
    ),
    'projection', jsonb_build_object(
      'resourcesWithConflicts', (
        select count(*) from public.billing_commercial_resources r
        where r.environment = p_environment and r.conflict_count > 0
      ),
      'staleEvents24h', (
        select coalesce(sum(r.stale_event_count), 0)
        from public.billing_commercial_resources r
        where r.environment = p_environment
          and r.last_stale_event_at >= p_now - interval '24 hours'
      ),
      'incoherentActiveGrants', (
        select count(*) from public.billing_access_grants g
        where g.environment = p_environment
          and g.status = 'active'
          and (
            g.valid_until <= p_now
            or (
              g.source_type in ('subscription', 'subscription_recovery')
              and g.valid_until is null
            )
          )
      )
    )
  ) into v_snapshot
  from public.billing_webhook_inbox i
  where i.provider = 'polar'
    and i.environment = p_environment;

  return v_snapshot;
end;
$$;


--

-- Name: FUNCTION billing_observability_snapshot(p_environment text, p_now timestamp with time zone); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.billing_observability_snapshot(p_environment text, p_now timestamp with time zone) IS 'Aggregate-only BIL-10 operational snapshot. Contains no customer or provider resource identifiers.';


--

-- Name: billing_observe_checkout_payment(text, uuid, uuid, uuid, uuid, uuid, bigint, text, text[], uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_observe_checkout_payment(p_environment text, p_order_id uuid, p_checkout_id uuid, p_organization_id uuid, p_product_id uuid, p_subscription_id uuid, p_net_amount bigint, p_currency text, p_capabilities text[], p_attempt_id uuid DEFAULT NULL::uuid, p_dispatch_token uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--

-- Name: billing_observe_checkout_session(text, uuid, uuid, text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_observe_checkout_session(p_environment text, p_checkout_id uuid, p_product_id uuid, p_status text, p_attempt_id uuid, p_dispatch_token uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--

-- Name: billing_operational_owner_alerts(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_operational_owner_alerts(p_environment text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
 select coalesce(jsonb_agg(row),'[]') from (
  select jsonb_build_object('order_id',c.order_id,'kind','checkout_refund_failed','code',c.last_error_code,
    'attempt_count',c.attempt_count) row,c.alert_next_at due
   from private.billing_checkout_compensations c where c.environment=p_environment and c.alert_pending and c.alert_next_at<=now()
  union all
  select jsonb_build_object('order_id',n.id,'kind',n.kind,'code',n.code) row,n.next_attempt_at due from private.billing_owner_notices n
   where n.environment=p_environment and n.delivered_at is null and n.next_attempt_at<=now()
  order by due
  limit 5
 ) notices
$$;


--

-- Name: billing_owner_alert_claim(text, text, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_owner_alert_claim(p_environment text, p_type text, p_id text, p_code text, p_lease uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare r private.billing_owner_alert_inbox%rowtype;
begin
  if p_lease is null then raise exception 'owner_alert_invalid_lease' using errcode='22023'; end if;
  delete from private.billing_owner_alert_inbox where (environment,alert_type,alert_id) in (
    select environment,alert_type,alert_id from private.billing_owner_alert_inbox
    where sent_at < clock_timestamp()-interval '30 days' limit 100 for update skip locked
  );
  insert into private.billing_owner_alert_inbox(environment,alert_type,alert_id,code)
    values(p_environment,p_type,p_id,p_code) on conflict do nothing;
  select * into strict r from private.billing_owner_alert_inbox
    where environment=p_environment and alert_type=p_type and alert_id=p_id for update;
  if r.sent_at is not null then return jsonb_build_object('state','sent'); end if;
  if r.lease_expires_at > clock_timestamp() then return jsonb_build_object('state','busy'); end if;
  update private.billing_owner_alert_inbox set lease_token=p_lease,
    lease_expires_at=clock_timestamp()+interval '60 seconds', attempts=attempts+1
    where environment=p_environment and alert_type=p_type and alert_id=p_id;
  -- First received code is immutable; replay cannot change the email content.
  return jsonb_build_object('state','claimed','email_key',r.email_key,'code',r.code);
end $$;


--

-- Name: billing_owner_alert_finish(text, text, text, uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_owner_alert_finish(p_environment text, p_type text, p_id text, p_lease uuid, p_sent boolean) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if p_sent is null then raise exception 'owner_alert_invalid_result' using errcode='22023'; end if;
  update private.billing_owner_alert_inbox set
    sent_at=case when p_sent then clock_timestamp() else null end,
    lease_token=null, lease_expires_at=null
    where environment=p_environment and alert_type=p_type and alert_id=p_id
      and lease_token=p_lease and lease_expires_at>clock_timestamp() and sent_at is null;
  return found;
end $$;


--

-- Name: billing_published_checkouts_to_expire(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_published_checkouts_to_expire(p_environment text) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
 select coalesce(jsonb_agg(jsonb_build_object('user_id',user_id,'attempt_id',attempt_id,
  'checkout_id',coalesce(provider_checkout_id,recovery_checkout_id::text),'checkout_key',checkout_key)),'[]')
 from (select * from public.billing_checkout_attempts a where environment=p_environment and resolution is null
   and coalesce(provider_checkout_id,recovery_checkout_id::text) is not null and expires_at<=now() order by updated_at limit 5) a
$$;


--

-- Name: billing_purchase_policy(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_purchase_policy(p_user_id uuid, p_environment text, p_checkout_key text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_reason text; v_config private.founders_sale_config%rowtype;
begin
 if p_environment not in ('sandbox','production') or p_checkout_key not in
 ('founders','launch_lifetime','pro_monthly','pro_annual','pro_plus_monthly','pro_plus_annual')
 then raise exception 'invalid_purchase_policy'; end if;
 select * into strict v_config from private.founders_sale_config where environment=p_environment;
 if not exists(select 1 from public.profiles where id=p_user_id) or
   exists(select 1 from public.account_identities where account_id=p_user_id and deleted_at is not null) then
   v_reason:='account_unavailable';
 elsif exists(select 1 from private.admin_account_blocks where account_id=p_user_id and blocked) then
   v_reason:='account_unavailable';
 elsif exists(select 1 from public.billing_effective_access_grants where user_id=p_user_id
   and environment=p_environment and capability='vantare.plan.founders'
   and status='active' and valid_until is null) then
   v_reason:='founders_already_owned';
 elsif exists(select 1 from private.lifetime_order_admissions where environment=p_environment and account_id=p_user_id)
 or exists(select 1 from public.billing_webhook_inbox i join public.billing_checkout_bindings b
   on b.environment=i.environment and b.provider_checkout_id=i.payload->'data'->>'checkout_id'
   where i.environment=p_environment and b.user_id=p_user_id and b.checkout_key='founders'
   and i.event_type='order.paid' and i.payload->'data'->>'paid'='true'
   and i.status in ('received','processing','failed','quarantined')) then
   v_reason:='founders_payment_pending';
 elsif p_checkout_key='launch_lifetime' then
   v_reason:='product_retired';
 elsif p_checkout_key='founders' then
   if now()<v_config.opens_at or not v_config.sales_enabled then
     v_reason:='founders_sale_closed';
   end if;
 end if;
 return jsonb_build_object('reason',v_reason);
end $$;


--

-- Name: billing_purge_webhook_payloads(timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_purge_webhook_payloads(p_processed_before timestamp with time zone DEFAULT (now() - '30 days'::interval), p_quarantined_before timestamp with time zone DEFAULT (now() - '180 days'::interval)) RETURNS TABLE(purged_count integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  update public.billing_webhook_inbox
  set payload = '{"purged":true}'::jsonb,
      payload_purged_at = now(),
      updated_at = now()
  where payload_purged_at is null
    and (
      (status = 'processed' and processed_at < p_processed_before)
      or (status = 'quarantined' and updated_at < p_quarantined_before)
    );
  get diagnostics purged_count = row_count;
  return next;
end;
$$;


--

-- Name: billing_quarantine_webhook(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_quarantine_webhook(p_inbox_id uuid, p_lease_token uuid, p_reason_code text) RETURNS TABLE(quarantined boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
begin
  if p_reason_code !~ '^[a-z0-9_:-]{1,96}$' then
    raise exception 'invalid_quarantine_reason';
  end if;
  update public.billing_webhook_inbox
  set status = 'quarantined',
      quarantine_reason = p_reason_code,
      lease_token = null,
      lease_expires_at = null,
      updated_at = now()
  where id = p_inbox_id
    and status = 'processing'
    and lease_token = p_lease_token;
  quarantined := found;
  return next;
end;
$_$;


--

-- Name: billing_receive_webhook(text, text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_receive_webhook(p_provider text, p_provider_event_id text, p_event_type text, p_payload_hash text, p_payload jsonb) RETURNS TABLE(inbox_id uuid, delivery_status text, payload_matches boolean)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select * from public.billing_receive_webhook(
    p_provider,
    'unclassified',
    p_provider_event_id,
    p_event_type,
    p_payload_hash,
    p_payload
  );
$$;


--

-- Name: billing_receive_webhook(text, text, text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_receive_webhook(p_provider text, p_environment text, p_provider_event_id text, p_event_type text, p_payload_hash text, p_payload jsonb) RETURNS TABLE(inbox_id uuid, delivery_status text, payload_matches boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_id uuid;
  v_status text;
  v_hash text;
begin
  if p_provider !~ '^[a-z0-9_-]{1,32}$'
     or p_environment not in ('sandbox', 'production', 'unclassified')
     or nullif(trim(p_provider_event_id), '') is null
     or length(p_provider_event_id) > 255
     or nullif(trim(p_event_type), '') is null
     or length(p_event_type) > 128
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or p_payload is null then
    raise exception 'invalid_webhook_receipt';
  end if;


  if private.billing_deleted_event(p_provider,p_environment,p_event_type,p_payload,
    encode(extensions.digest(p_provider_event_id||chr(31)||p_payload_hash,'sha256'),'hex')) then
    return query select null::uuid,'account_deleted'::text,true;
    return;
  end if;
  insert into public.billing_webhook_inbox (
    provider, environment, provider_event_id, event_type, payload_hash, payload
  ) values (
    p_provider, p_environment, p_provider_event_id, p_event_type,
    p_payload_hash, p_payload
  )
  on conflict (provider, environment, provider_event_id) do nothing
  returning id, status, payload_hash into v_id, v_status, v_hash;

  if v_id is null then
    select i.id, i.status, i.payload_hash
      into v_id, v_status, v_hash
    from public.billing_webhook_inbox i
    where i.provider = p_provider
      and i.environment = p_environment
      and i.provider_event_id = p_provider_event_id
    for update;

    if v_hash <> p_payload_hash then
      update public.billing_webhook_inbox
      set status = 'quarantined',
          quarantine_reason = 'payload_hash_mismatch',
          lease_token = null,
          lease_expires_at = null,
          updated_at = now()
      where id = v_id;
      v_status := 'quarantined';
    else
      update public.billing_webhook_inbox
      set duplicate_count = duplicate_count + 1,
          last_duplicate_at = now(),
          updated_at = now()
      where id = v_id;
    end if;
  end if;

  inbox_id := v_id;
  delivery_status := v_status;
  payload_matches := v_hash = p_payload_hash;
  return next;
end;
$_$;


--

-- Name: billing_reconciliation_item_failed(text, text, text, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_reconciliation_item_failed(p_environment text, p_resource text, p_item_key text, p_resource_id text, p_now timestamp with time zone DEFAULT clock_timestamp()) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
begin
 if p_environment is null or p_environment not in ('sandbox','production')
  or p_resource is null or p_resource not in ('subscriptions','refunds','disputes')
  or p_item_key is null or p_item_key !~ '^[a-f0-9]{64}$'
  or (p_resource_id is not null and length(p_resource_id) not between 1 and 200)
  or p_now is null or not isfinite(p_now) then
  raise sqlstate '22023' using message='invalid_reconciliation_incident';
 end if;
 insert into private.billing_reconciliation_item_failures(environment,resource,item_key,resource_id,first_at,last_at)
 values(p_environment,p_resource,p_item_key,p_resource_id,p_now,p_now)
 on conflict(environment,resource,item_key) do update set
 attempts=private.billing_reconciliation_item_failures.attempts+1,
 first_at=least(private.billing_reconciliation_item_failures.first_at,excluded.first_at),
 last_at=greatest(private.billing_reconciliation_item_failures.last_at,excluded.last_at);
end $_$;


--

-- Name: billing_record_dispute_snapshot(text, text, text, boolean, timestamp with time zone, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_record_dispute_snapshot(p_environment text, p_dispute_id text, p_order_id text, p_blocked boolean, p_modified_at timestamp with time zone, p_snapshot_hash text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare o public.billing_orders; b public.billing_access_blocks;
begin
  perform private.lock_account_write((select lock_order.user_id
       from public.billing_orders lock_order where lock_order.environment=p_environment
       and lock_order.provider='polar' and lock_order.provider_order_id=p_order_id));
  if p_environment not in ('sandbox','production') or p_blocked is null or p_modified_at is null
    or p_dispute_id is null or length(p_dispute_id) not between 1 and 200
    or p_snapshot_hash is null or p_snapshot_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_dispute_snapshot'; end if;

  if private.billing_deleted_event('polar',p_environment,'dispute.updated',
    jsonb_build_object('data',jsonb_build_object('order_id',p_order_id)),
    encode(extensions.digest(p_dispute_id||chr(31)||p_snapshot_hash,'sha256'),'hex')) then
    return 'account_deleted';
  end if;
  select * into o from public.billing_orders where environment=p_environment and provider_order_id=p_order_id for update;
  if not found then return 'missing_order'; end if;
  select * into b from public.billing_access_blocks where environment=p_environment and cause_type='dispute' and cause_id=p_dispute_id for update;
  if found then
    if b.user_id<>o.user_id or b.source_id<>coalesce(o.provider_subscription_id,p_order_id)
      or b.source_type<>(case when o.provider_subscription_id is null then 'order' else 'subscription' end) then
      raise exception 'dispute_attribution_conflict';
    end if;
    if p_modified_at<b.remote_modified_at then return 'applied'; end if;
    if p_modified_at=b.remote_modified_at and p_snapshot_hash<>b.snapshot_hash then raise exception 'dispute_version_conflict'; end if;
  end if;
  insert into public.billing_access_blocks(environment,source_type,source_id,cause_type,cause_id,user_id,blocked,remote_modified_at,snapshot_hash)
    values(p_environment,case when o.provider_subscription_id is null then 'order' else 'subscription' end,
      coalesce(o.provider_subscription_id,p_order_id),'dispute',p_dispute_id,o.user_id,p_blocked,p_modified_at,p_snapshot_hash)
    on conflict(environment,cause_type,cause_id) do update set blocked=excluded.blocked,
      remote_modified_at=excluded.remote_modified_at,snapshot_hash=excluded.snapshot_hash
    where billing_access_blocks.user_id=excluded.user_id and billing_access_blocks.source_type=excluded.source_type
      and billing_access_blocks.source_id=excluded.source_id
      and (billing_access_blocks.remote_modified_at<excluded.remote_modified_at
        or (billing_access_blocks.remote_modified_at=excluded.remote_modified_at
          and billing_access_blocks.snapshot_hash=excluded.snapshot_hash));
  if not found then raise exception 'dispute_concurrent_conflict'; end if;
  perform public.billing_refresh_entitlement_read_model(o.user_id);
  return 'applied';
end $_$;


--

-- Name: billing_record_order_snapshot(text, text, uuid, text, text, text, boolean, bigint, text, bigint, timestamp with time zone, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_record_order_snapshot(p_environment text, p_order_id text, p_user_id uuid, p_product_id text, p_checkout_id text, p_status text, p_paid boolean, p_net_amount bigint, p_currency text, p_reported_refunded_amount bigint, p_modified_at timestamp with time zone, p_snapshot_hash text, p_subscription_id text DEFAULT NULL::text) RETURNS TABLE(outcome text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare
  v_order public.billing_orders%rowtype;
  v_succeeded bigint;
begin
  perform private.lock_accounts_before_rows(array[p_user_id] || array(select lock_order.user_id from public.billing_orders lock_order
       where lock_order.environment=p_environment and lock_order.provider='polar' and lock_order.provider_order_id=trim(p_order_id)));
  if (p_environment is null or p_environment not in ('sandbox', 'production'))
     or nullif(trim(p_order_id), '') is null or length(trim(p_order_id)) > 200
     or nullif(trim(p_product_id), '') is null or length(trim(p_product_id)) > 200
     or (p_checkout_id is not null and length(trim(p_checkout_id)) not between 1 and 200)
     or (p_status is null or p_status not in ('paid', 'partially_refunded', 'refunded'))
     or p_paid is not true
     or p_net_amount is null or p_net_amount <= 0
     or p_currency !~ '^[a-z]{3}$'
     or p_reported_refunded_amount is null
     or p_reported_refunded_amount < 0
     or p_reported_refunded_amount > p_net_amount
     or (p_status = 'paid' and p_reported_refunded_amount <> 0)
     or (p_status = 'partially_refunded' and (p_reported_refunded_amount = 0 or p_reported_refunded_amount = p_net_amount))
     or (p_status = 'refunded' and p_reported_refunded_amount <> p_net_amount)
     or p_modified_at is null
     or p_snapshot_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_order_snapshot';
  end if;

  select * into v_order
  from public.billing_orders order_row
  where order_row.provider = 'polar'
    and order_row.environment = p_environment
    and order_row.provider_order_id = trim(p_order_id)
  for update;

  if not found then
    insert into public.billing_orders (
      user_id, environment, provider_order_id, provider_product_id,
      provider_checkout_id, provider_subscription_id, status, paid, net_amount, currency,
      reported_refunded_amount, remote_modified_at, snapshot_hash
    ) values (
      p_user_id, p_environment, trim(p_order_id), trim(p_product_id),
      nullif(trim(p_checkout_id), ''), nullif(trim(p_subscription_id), ''), p_status, true, p_net_amount, p_currency,
      p_reported_refunded_amount, p_modified_at, p_snapshot_hash
    ) on conflict (provider, environment, provider_order_id) do nothing;
    if found then
      return query select 'apply'::text;
      return;
    end if;

    select * into v_order
    from public.billing_orders order_row
    where order_row.provider = 'polar'
      and order_row.environment = p_environment
      and order_row.provider_order_id = trim(p_order_id)
    for update;
    if not found then
      raise exception 'order_insert_race';
    end if;
  end if;

  if v_order.provider_subscription_id is distinct from nullif(trim(p_subscription_id), '')
     or v_order.user_id <> p_user_id
     or v_order.provider_product_id <> trim(p_product_id)
     or (v_order.provider_checkout_id is not null
       and nullif(trim(p_checkout_id), '') is not null
       and v_order.provider_checkout_id <> nullif(trim(p_checkout_id), ''))
     or v_order.net_amount <> p_net_amount
     or v_order.currency <> p_currency then
    return query select 'invalid_attribution'::text;
    return;
  end if;
  if p_modified_at < v_order.remote_modified_at then
    update public.billing_orders set
      stale_event_count = stale_event_count + 1,
      last_stale_event_at = now(), updated_at = now()
    where id = v_order.id;
    return query select 'stale_noop'::text;
    return;
  end if;
  if p_modified_at = v_order.remote_modified_at then
    if p_snapshot_hash = v_order.snapshot_hash then
      return query select 'duplicate'::text;
    else
      update public.billing_orders set
        conflict_count = conflict_count + 1, updated_at = now()
      where id = v_order.id;
      return query select 'version_conflict'::text;
    end if;
    return;
  end if;

  select coalesce(sum(amount), 0) into v_succeeded
  from public.billing_refunds refund
  where refund.provider = 'polar'
    and refund.environment = p_environment
    and refund.provider_order_id = trim(p_order_id)
    and refund.status = 'succeeded';
  if v_succeeded > p_net_amount then
    return query select 'refund_total_exceeds_order'::text;
    return;
  end if;

  update public.billing_orders set
    provider_checkout_id = coalesce(nullif(trim(p_checkout_id), ''), provider_checkout_id),
    status = p_status, reported_refunded_amount = p_reported_refunded_amount,
    remote_modified_at = p_modified_at, snapshot_hash = p_snapshot_hash,
    updated_at = now()
  where id = v_order.id;
  return query select 'apply'::text;
end;
$_$;


--

-- Name: billing_record_refund_snapshot(text, text, text, text, text, bigint, text, timestamp with time zone, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_record_refund_snapshot(p_environment text, p_refund_id text, p_order_id text, p_payment_id text, p_status text, p_amount bigint, p_currency text, p_modified_at timestamp with time zone, p_snapshot_hash text) RETURNS TABLE(outcome text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare
  v_order public.billing_orders%rowtype;
  v_refund public.billing_refunds%rowtype;
  v_total bigint;
begin
  perform private.lock_accounts_before_rows(array(select lock_order.user_id from public.billing_orders lock_order where lock_order.environment=p_environment
       and lock_order.provider='polar' and lock_order.provider_order_id=trim(p_order_id)
       union select lock_order.user_id from public.billing_orders lock_order join public.billing_refunds f
         on lock_order.provider=f.provider and lock_order.environment=f.environment and lock_order.provider_order_id=f.provider_order_id
       where f.environment=p_environment and f.provider_refund_id=trim(p_refund_id)));
  if (p_environment is null or p_environment not in ('sandbox', 'production'))
     or nullif(trim(p_refund_id), '') is null or length(trim(p_refund_id)) > 200
     or nullif(trim(p_order_id), '') is null or length(trim(p_order_id)) > 200
     or (p_payment_id is not null and length(trim(p_payment_id)) not between 1 and 200)
     or (p_status is null or p_status not in ('pending', 'succeeded', 'failed', 'canceled'))
     or p_amount is null or p_amount <= 0
     or p_currency !~ '^[a-z]{3}$'
     or p_modified_at is null
     or p_snapshot_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_refund_snapshot';
  end if;

  select * into v_order
  from public.billing_orders order_row
  where order_row.provider = 'polar'
    and order_row.environment = p_environment
    and order_row.provider_order_id = trim(p_order_id)
  for update;
  if not found then
    return query select 'missing_order'::text;
    return;
  end if;
  if v_order.currency <> p_currency then
    return query select 'currency_mismatch'::text;
    return;
  end if;

  select * into v_refund
  from public.billing_refunds refund
  where refund.provider = 'polar'
    and refund.environment = p_environment
    and refund.provider_refund_id = trim(p_refund_id)
  for update;
  if found then
    if v_refund.provider_order_id <> trim(p_order_id)
       or (v_refund.provider_payment_id is not null and p_payment_id is not null
         and v_refund.provider_payment_id <> nullif(trim(p_payment_id), ''))
       or v_refund.amount <> p_amount
       or v_refund.currency <> p_currency then
      return query select 'invalid_attribution'::text;
      return;
    end if;
    if p_modified_at < v_refund.remote_modified_at then
      update public.billing_refunds set
        stale_event_count = stale_event_count + 1,
        last_stale_event_at = now(), updated_at = now()
      where id = v_refund.id;
      return query select 'stale_noop'::text;
      return;
    end if;
    if p_modified_at = v_refund.remote_modified_at then
      if p_snapshot_hash = v_refund.snapshot_hash then
        return query select 'duplicate'::text;
      else
        update public.billing_refunds set
          conflict_count = conflict_count + 1, updated_at = now()
        where id = v_refund.id;
        return query select 'version_conflict'::text;
      end if;
      return;
    end if;
    if v_refund.status = 'succeeded' and p_status <> 'succeeded' then
      return query select 'invalid_transition'::text;
      return;
    end if;
  end if;

  select coalesce(sum(amount), 0) into v_total
  from public.billing_refunds refund
  where refund.provider = 'polar'
    and refund.environment = p_environment
    and refund.provider_order_id = trim(p_order_id)
    and refund.status = 'succeeded'
    and (v_refund.id is null or refund.id <> v_refund.id);
  if p_status = 'succeeded' then v_total := v_total + p_amount; end if;
  if v_total > v_order.net_amount then
    return query select 'refund_total_exceeds_order'::text;
    return;
  end if;

  insert into public.billing_refunds (
    environment, provider_refund_id, provider_order_id, provider_payment_id,
    status, amount, currency, remote_modified_at, snapshot_hash
  ) values (
    p_environment, trim(p_refund_id), trim(p_order_id),
    nullif(trim(p_payment_id), ''), p_status, p_amount, p_currency,
    p_modified_at, p_snapshot_hash
  ) on conflict (provider, environment, provider_refund_id) do update set
    status = excluded.status,
    remote_modified_at = excluded.remote_modified_at,
    snapshot_hash = excluded.snapshot_hash,
    updated_at = now()
    where billing_refunds.provider_order_id=excluded.provider_order_id
      and billing_refunds.amount=excluded.amount and billing_refunds.currency=excluded.currency
      and (billing_refunds.provider_payment_id is null or excluded.provider_payment_id is null
        or billing_refunds.provider_payment_id=excluded.provider_payment_id)
      and billing_refunds.remote_modified_at<excluded.remote_modified_at
      and (billing_refunds.status<>'succeeded' or excluded.status='succeeded');
  if not found then return query select 'invalid_attribution'::text; return; end if;
  return query select 'apply'::text;
end;
$_$;


--

-- Name: billing_refresh_entitlement_read_model(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_refresh_entitlement_read_model(p_user_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select public.billing_refresh_entitlement_read_model_at(p_user_id, now())
$$;


--

-- Name: billing_refresh_entitlement_read_model_at(uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_refresh_entitlement_read_model_at(p_user_id uuid, p_evaluated_at timestamp with time zone) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_active_count integer;
  v_has_lifetime boolean;
  v_expires_at timestamptz;
begin
  perform private.lock_accounts_before_rows(array[p_user_id]);
  if p_evaluated_at is null then raise exception 'invalid_evaluation_time'; end if;
  select count(*)::integer, bool_or(g.valid_until is null), max(g.valid_until)
  into v_active_count, v_has_lifetime, v_expires_at
  from public.billing_effective_access_grants g
  where g.user_id = p_user_id
    and g.status = 'active'
    and g.capability in ('vantare.plan.pro', 'vantare.edition.launch_v1', 'vantare.plan.founders')
    and (g.valid_until is null or p_evaluated_at < g.valid_until);

  insert into public.user_entitlements (
    user_id, product_key, status, source, expires_at, metadata, updated_at
  ) values (
    p_user_id,
    'bundle',
    case when v_active_count > 0 then 'active' else 'revoked' end,
    'billing_projection',
    case
      when v_active_count = 0 then p_evaluated_at
      when v_has_lifetime then null
      else v_expires_at
    end,
    jsonb_build_object('derived', true, 'active_source_count', v_active_count),
    p_evaluated_at
  )
  on conflict (user_id, product_key) do update set
    status = excluded.status,
    source = excluded.source,
    expires_at = excluded.expires_at,
    metadata = excluded.metadata,
    updated_at = excluded.updated_at;
end;
$$;


--

-- Name: billing_reject_checkout_request(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_reject_checkout_request(p_user_id uuid, p_attempt_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--

-- Name: billing_replay_webhook(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_replay_webhook(p_inbox_id uuid, p_actor_id text, p_reason_code text) RETURNS TABLE(replay_queued boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare
  v_previous_status text;
begin
  if p_actor_id !~ '^[a-z0-9_-]{3,64}$'
     or p_reason_code !~ '^[a-z0-9_:-]{3,96}$' then
    raise exception 'invalid_replay_audit';
  end if;

  select i.status into v_previous_status
  from public.billing_webhook_inbox i
  where i.id = p_inbox_id
  for update;

  if not found then
    raise exception 'webhook_not_found';
  end if;
  if v_previous_status = 'processing' then
    raise exception 'webhook_is_processing';
  end if;
  if exists (
    select 1 from public.billing_webhook_inbox i
    where i.id = p_inbox_id and i.payload_purged_at is not null
  ) then
    raise exception 'webhook_payload_purged';
  end if;

  insert into public.billing_webhook_replay_audit (
    inbox_id, actor_id, reason_code, previous_status
  ) values (
    p_inbox_id, p_actor_id, p_reason_code, v_previous_status
  );

  update public.billing_webhook_inbox
  set status = 'received',
      attempt_count = 0,
      next_attempt_at = now(),
      lease_token = null,
      lease_expires_at = null,
      last_error_code = null,
      quarantine_reason = null,
      processed_at = null,
      replay_count = replay_count + 1,
      updated_at = now()
  where id = p_inbox_id;

  replay_queued := true;
  return next;
end;
$_$;


--

-- Name: billing_resolve_checkout_non_applicable(text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_resolve_checkout_non_applicable(p_environment text, p_order_id uuid, p_reason text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--

-- Name: billing_save_creator_attribution(uuid, text, uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_save_creator_attribution(p_user uuid, p_environment text, p_attempt uuid, p_code text, p_discount uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_creator uuid; v_key text; v_expected text;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,0));
 if not exists(select 1 from public.profiles where id=p_user) or exists(select 1 from public.account_identities where account_id=p_user and deleted_at is not null) then raise exception 'account_deleted'; end if;
 select checkout_key into v_key from public.billing_checkout_attempts where user_id=p_user and attempt_id=p_attempt and environment=p_environment and status='creating' and checkout_key in ('pro_monthly','pro_annual','pro_plus_monthly','pro_plus_annual');
 if not found then raise exception 'creator_attempt_invalid'; end if;
 select creator_id,case when v_key like '%annual' then annual_discount_id::text else discount_id end into strict v_creator,v_expected from private.admin_creators where environment=p_environment and code=p_code and status='active';
 if p_discount is null or p_discount='00000000-0000-0000-0000-000000000000'::uuid or v_expected is distinct from p_discount::text then raise exception 'creator_coupon_mismatch'; end if;
 insert into private.creator_checkout_attributions values(p_environment,p_user,p_attempt,v_creator,p_code,p_discount,now()) on conflict do nothing;
 return exists(select 1 from private.creator_checkout_attributions where environment=p_environment and account_id=p_user and attempt_id=p_attempt and creator_id=v_creator and discount_id=p_discount and code=p_code);
end $$;


--

-- Name: billing_set_report_renewal_candidate(text, uuid, text, uuid, integer, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_set_report_renewal_candidate(p_environment text, p_user uuid, p_subscription text, p_discount uuid, p_savings integer, p_valid_until timestamp with time zone) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
 begin
  if private.lock_account_write(p_user) then raise exception 'account_deleted'; end if;
  perform private.billing_set_report_candidate_before_1593(p_environment,p_user,p_subscription,p_discount,p_savings,p_valid_until);
 end $$;


--

-- Name: billing_sync_order_access(text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.billing_sync_order_access(p_environment text, p_order_id text, p_capabilities jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare o public.billing_orders; refund public.billing_refunds; v_capability text; capabilities text[] := '{}';
begin
  perform private.lock_accounts_before_rows(array(select lock_order.user_id from public.billing_orders lock_order where lock_order.environment=p_environment
       and lock_order.provider='polar' and lock_order.provider_order_id=p_order_id));
  if p_environment not in ('sandbox','production') or p_capabilities is null or jsonb_typeof(p_capabilities)<>'array'
    or jsonb_array_length(p_capabilities) not between 1 and 32 then raise exception 'invalid_order_access_sync'; end if;
  if exists(select 1 from jsonb_array_elements(p_capabilities) item
    where jsonb_typeof(item)<>'string' or length(trim(item #>> '{}')) not between 1 and 128) then
    raise exception 'invalid_capability';
  end if;
  select * into o from public.billing_orders where environment=p_environment and provider_order_id=p_order_id for update;
  if not found then raise exception 'missing_order'; end if;
  insert into public.billing_commercial_resources(user_id,provider,environment,resource_type,resource_id,
    remote_state,remote_modified_at,snapshot_hash,metadata)
    values(o.user_id,'polar',p_environment,'order',p_order_id,o.status,o.remote_modified_at,o.snapshot_hash,
      jsonb_build_object('net_amount',o.net_amount,'currency',o.currency,'subscription_id',o.provider_subscription_id))
    on conflict(provider,environment,resource_type,resource_id) do update set remote_state=excluded.remote_state,
      remote_modified_at=excluded.remote_modified_at,snapshot_hash=excluded.snapshot_hash,metadata=excluded.metadata,updated_at=now()
    where billing_commercial_resources.user_id=excluded.user_id;
  if not found then raise exception 'commercial_resource_owner_mismatch'; end if;
  -- An authoritative aggregate is independently sufficient; no synthetic refund.
  insert into public.billing_access_blocks(environment,source_type,source_id,cause_type,cause_id,user_id,blocked,remote_modified_at,snapshot_hash)
    values(p_environment,case when o.provider_subscription_id is null then 'order' else 'subscription' end,
      coalesce(o.provider_subscription_id,p_order_id),'order_refund',p_order_id,o.user_id,
      o.reported_refunded_amount>0,o.remote_modified_at,o.snapshot_hash)
    on conflict(environment,cause_type,cause_id) do update set blocked=excluded.blocked,
      remote_modified_at=excluded.remote_modified_at,snapshot_hash=excluded.snapshot_hash
    where billing_access_blocks.user_id=excluded.user_id
      and billing_access_blocks.source_type=excluded.source_type and billing_access_blocks.source_id=excluded.source_id
      and billing_access_blocks.remote_modified_at<=excluded.remote_modified_at;
  if not found then raise exception 'aggregate_block_attribution_conflict'; end if;
  for refund in select * from public.billing_refunds where environment=p_environment and provider_order_id=p_order_id
  loop
    insert into public.billing_access_blocks(environment,source_type,source_id,cause_type,cause_id,user_id,blocked,remote_modified_at,snapshot_hash)
    values(p_environment,case when o.provider_subscription_id is null then 'order' else 'subscription' end,
      coalesce(o.provider_subscription_id,p_order_id),'refund',refund.provider_refund_id,o.user_id,
      refund.status in ('pending','succeeded'),refund.remote_modified_at,refund.snapshot_hash)
    on conflict(environment,cause_type,cause_id) do update set blocked=excluded.blocked,
      remote_modified_at=excluded.remote_modified_at,snapshot_hash=excluded.snapshot_hash
    where billing_access_blocks.user_id=excluded.user_id
      and billing_access_blocks.source_type=excluded.source_type and billing_access_blocks.source_id=excluded.source_id
      and billing_access_blocks.remote_modified_at<=excluded.remote_modified_at;
    if not found then raise exception 'refund_block_attribution_conflict'; end if;
  end loop;
  -- Subscription orders never grant perpetual Pro. Their base grant remains
  -- owned by subscription lifecycle; clearing a block preserves paid-through.
  if o.provider_subscription_id is null then
    for v_capability in select jsonb_array_elements_text(p_capabilities)
    loop
      v_capability := trim(v_capability);
      capabilities := array_append(capabilities,v_capability);
      if length(v_capability) not between 1 and 128 then raise exception 'invalid_capability'; end if;
      insert into public.billing_access_grants(user_id,provider,environment,source_type,source_id,capability,status,valid_until,resource_modified_at,snapshot_hash,metadata)
      values(o.user_id,'polar',p_environment,'order',p_order_id,v_capability,'active',null,o.remote_modified_at,o.snapshot_hash,'{}'::jsonb)
      on conflict(provider,environment,source_type,source_id,capability) do update
        set status='active',valid_until=null,resource_modified_at=excluded.resource_modified_at,snapshot_hash=excluded.snapshot_hash
        where billing_access_grants.user_id=excluded.user_id;
      if not found then raise exception 'access_grant_owner_mismatch'; end if;
    end loop;
    update public.billing_access_grants g set status='revoked',valid_until=coalesce(g.valid_until,now())
      where g.provider='polar' and g.environment=p_environment and g.source_type='order'
        and g.source_id=p_order_id and g.user_id=o.user_id and not(g.capability=any(capabilities));
  end if;
  perform public.billing_refresh_entitlement_read_model(o.user_id);
  perform private.close_terminal_checkout_attempts(o.user_id,p_environment);
end $$;


--

-- Name: web_purchase_attempt_states(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_purchase_attempt_states(p_keys jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
 perform private.require_web_erasure_credential();
 if jsonb_typeof(p_keys) is distinct from 'array' or jsonb_array_length(p_keys)>50 then raise exception 'invalid_attempt_lookup'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('account_id',k.account_id,'attempt_id',k.attempt_id,
  'environment',k.environment,'resolution',a.resolution,'status',a.status,'exists',a.user_id is not null))
 from jsonb_to_recordset(p_keys) k(account_id uuid,attempt_id uuid,environment text)
 left join public.billing_checkout_attempts a on a.user_id=k.account_id and a.attempt_id=k.attempt_id and a.environment=k.environment),'[]');
end $$;


--

-- Name: web_purchase_erasure_ack(bigint, bigint, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_purchase_erasure_ack(p_from_cursor bigint, p_to_cursor bigint, p_count integer, p_environment text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
 perform private.require_web_erasure_credential();
 return false;
end $$;


--

-- Name: web_purchase_erasure_ack(bigint, bigint, integer, text, text, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_purchase_erasure_ack(p_from_cursor bigint, p_to_cursor bigint, p_count integer, p_environment text, p_erasure_digest text, p_remaining_rows integer, p_receipt text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
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
end $_$;


--

-- Name: web_purchase_erasure_failed(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_purchase_erasure_failed(p_code text, p_environment text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--

-- Name: web_purchase_erasure_pull(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.web_purchase_erasure_pull(p_limit integer DEFAULT 50) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
 with batch as (
  select e.id,e.account_id from private.web_purchase_erasure_events e,
   private.web_purchase_erasure_consumer c where e.id>c.cursor_id order by e.id limit greatest(1,least(p_limit,50))
 ) select jsonb_build_object('cursor',c.cursor_id,
   'next_cursor',coalesce((select max(id) from batch),c.cursor_id),
   'items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'account_id',account_id) order by id) from batch),'[]'))
 from private.web_purchase_erasure_consumer c where private.require_web_erasure_credential()
$$;


--

-- Name: billing_checkout_compensation_audit; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.billing_checkout_compensation_audit (
    id bigint NOT NULL,
    environment text NOT NULL,
    order_id uuid NOT NULL,
    observed_at timestamp with time zone DEFAULT now() NOT NULL,
    state text NOT NULL,
    code text NOT NULL,
    refund_id uuid,
    CONSTRAINT billing_checkout_compensation_audit_code_check CHECK ((code ~ '^[a-z0-9_]{1,64}$'::text))
);


--

-- Name: billing_checkout_compensation_audit_id_seq; Type: SEQUENCE; Schema: private; Owner: -
--

ALTER TABLE private.billing_checkout_compensation_audit ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME private.billing_checkout_compensation_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--

-- Name: billing_checkout_compensations; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.billing_checkout_compensations (
    environment text NOT NULL,
    order_id uuid NOT NULL,
    checkout_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    product_id uuid NOT NULL,
    subscription_id uuid,
    attempt_id uuid,
    dispatch_token uuid,
    net_amount bigint NOT NULL,
    currency text NOT NULL,
    capabilities text[] NOT NULL,
    state text DEFAULT 'waiting'::text NOT NULL,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    next_attempt_at timestamp with time zone DEFAULT (now() + '00:15:00'::interval) NOT NULL,
    selected_at timestamp with time zone,
    attempt_count integer DEFAULT 0 NOT NULL,
    lease_token uuid,
    lease_until timestamp with time zone,
    refund_id uuid,
    last_error_code text,
    alert_pending boolean DEFAULT false NOT NULL,
    alert_next_at timestamp with time zone,
    alert_attempts integer DEFAULT 0 NOT NULL,
    alert_delivered_at timestamp with time zone,
    refund_amount_basis text,
    CONSTRAINT billing_checkout_compensations_capabilities_check CHECK (((cardinality(capabilities) >= 1) AND (cardinality(capabilities) <= 8))),
    CONSTRAINT billing_checkout_compensations_currency_check CHECK ((currency ~ '^[a-z]{3}$'::text)),
    CONSTRAINT billing_checkout_compensations_environment_check CHECK ((environment = ANY (ARRAY['sandbox'::text, 'production'::text]))),
    CONSTRAINT billing_checkout_compensations_net_amount_check CHECK ((net_amount > 0)),
    CONSTRAINT billing_checkout_compensations_refund_amount_basis_check CHECK ((refund_amount_basis = ANY (ARRAY['net'::text, 'gross'::text]))),
    CONSTRAINT billing_checkout_compensations_state_check CHECK ((state = ANY (ARRAY['waiting'::text, 'activated'::text, 'refunding'::text, 'refunded'::text])))
);


--

-- Name: TABLE billing_checkout_compensations; Type: COMMENT; Schema: private; Owner: -
--

COMMENT ON TABLE private.billing_checkout_compensations IS 'Financial compensation ledger, service RPC only. No email/customer/account UUID. Survives account deletion without recreating identity; financial retention follows billing ledger policy.';


--

-- Name: billing_checkout_dispositions; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.billing_checkout_dispositions (
    environment text NOT NULL,
    order_id uuid NOT NULL,
    reason text NOT NULL,
    resolved_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT billing_checkout_dispositions_reason_check CHECK ((reason = ANY (ARRAY['account_deleted'::text, 'checkout_attempt_expired'::text])))
);


--

-- Name: billing_compensation_policy; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.billing_compensation_policy (
    environment text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    amount_basis text,
    CONSTRAINT billing_compensation_policy_amount_basis_check CHECK ((amount_basis = ANY (ARRAY['net'::text, 'gross'::text]))),
    CONSTRAINT billing_compensation_policy_environment_check CHECK ((environment = ANY (ARRAY['sandbox'::text, 'production'::text])))
);


--

-- Name: billing_deleted_observations; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.billing_deleted_observations (
    environment text NOT NULL,
    observation_hash text NOT NULL,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT billing_deleted_observations_environment_check CHECK ((environment = ANY (ARRAY['sandbox'::text, 'production'::text]))),
    CONSTRAINT billing_deleted_observations_observation_hash_check CHECK ((observation_hash ~ '^[0-9a-f]{64}$'::text))
);


--

-- Name: billing_launch_offers; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.billing_launch_offers (
    environment text NOT NULL,
    checkout_key text NOT NULL,
    product_id uuid NOT NULL,
    discount_id uuid NOT NULL,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    catalog_version text NOT NULL,
    registered_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT billing_launch_offers_catalog_version_check CHECK (((length(catalog_version) >= 1) AND (length(catalog_version) <= 200))),
    CONSTRAINT billing_launch_offers_check CHECK ((product_id <> discount_id)),
    CONSTRAINT billing_launch_offers_check1 CHECK ((ends_at > starts_at)),
    CONSTRAINT billing_launch_offers_checkout_key_check CHECK ((checkout_key = ANY (ARRAY['pro_monthly'::text, 'pro_annual'::text, 'pro_plus_monthly'::text, 'pro_plus_annual'::text]))),
    CONSTRAINT billing_launch_offers_discount_id_check CHECK ((discount_id <> '00000000-0000-0000-0000-000000000000'::uuid)),
    CONSTRAINT billing_launch_offers_ends_at_check CHECK (isfinite(ends_at)),
    CONSTRAINT billing_launch_offers_environment_check CHECK ((environment = ANY (ARRAY['sandbox'::text, 'production'::text]))),
    CONSTRAINT billing_launch_offers_product_id_check CHECK ((product_id <> '00000000-0000-0000-0000-000000000000'::uuid)),
    CONSTRAINT billing_launch_offers_starts_at_check CHECK (isfinite(starts_at))
);


--

-- Name: billing_owner_alert_inbox; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.billing_owner_alert_inbox (
    environment text NOT NULL,
    alert_type text NOT NULL,
    alert_id text NOT NULL,
    code text NOT NULL,
    email_key uuid DEFAULT gen_random_uuid() NOT NULL,
    received_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    sent_at timestamp with time zone,
    lease_token uuid,
    lease_expires_at timestamp with time zone,
    attempts integer DEFAULT 0 NOT NULL,
    CONSTRAINT billing_owner_alert_inbox_alert_id_check CHECK ((alert_id ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT billing_owner_alert_inbox_alert_type_check CHECK ((alert_type = ANY (ARRAY['checkout_refund_failed'::text, 'checkout_verification_pending'::text, 'web_erasure_failed'::text, 'web_erasure_worker_stale'::text, 'checkout_review'::text]))),
    CONSTRAINT billing_owner_alert_inbox_check CHECK (((lease_token IS NULL) = (lease_expires_at IS NULL))),
    CONSTRAINT billing_owner_alert_inbox_code_check CHECK ((code ~ '^[a-z0-9_]{1,64}$'::text)),
    CONSTRAINT billing_owner_alert_inbox_environment_check CHECK ((environment = ANY (ARRAY['sandbox'::text, 'production'::text])))
);


--

-- Name: billing_owner_notices; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.billing_owner_notices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    environment text NOT NULL,
    kind text NOT NULL,
    correlation_hash text NOT NULL,
    code text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    delivered_at timestamp with time zone,
    CONSTRAINT billing_owner_notices_code_check CHECK ((code ~ '^[a-z0-9_]{1,64}$'::text)),
    CONSTRAINT billing_owner_notices_correlation_hash_check CHECK ((correlation_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT billing_owner_notices_environment_check CHECK ((environment = ANY (ARRAY['sandbox'::text, 'production'::text]))),
    CONSTRAINT billing_owner_notices_kind_check CHECK ((kind = ANY (ARRAY['checkout_verification_pending'::text, 'web_erasure_failed'::text, 'web_erasure_worker_stale'::text, 'checkout_review'::text])))
);


--

-- Name: billing_payment_incidents; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.billing_payment_incidents (
    environment text NOT NULL,
    account_id uuid NOT NULL,
    resource_id text NOT NULL,
    reason text NOT NULL,
    severity text DEFAULT 'critical'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT billing_payment_incidents_environment_check CHECK ((environment = ANY (ARRAY['sandbox'::text, 'production'::text]))),
    CONSTRAINT billing_payment_incidents_severity_check CHECK ((severity = 'critical'::text))
);


--

-- Name: billing_reconciliation_cursor; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.billing_reconciliation_cursor (
    environment text NOT NULL,
    resource text DEFAULT 'orders'::text NOT NULL,
    page integer DEFAULT 1 NOT NULL,
    lease_token uuid,
    lease_until timestamp with time zone,
    last_progress_at timestamp with time zone,
    last_failure_at timestamp with time zone,
    CONSTRAINT billing_reconciliation_cursor_environment_check CHECK ((environment = ANY (ARRAY['sandbox'::text, 'production'::text]))),
    CONSTRAINT billing_reconciliation_cursor_page_check CHECK ((page > 0)),
    CONSTRAINT billing_reconciliation_cursor_resource_check CHECK ((resource = ANY (ARRAY['orders'::text, 'subscriptions'::text, 'refunds'::text, 'disputes'::text, 'checkouts'::text])))
);


--

-- Name: billing_reconciliation_item_failures; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.billing_reconciliation_item_failures (
    environment text NOT NULL,
    resource text NOT NULL,
    item_key text NOT NULL,
    resource_id text,
    code text DEFAULT 'reconciliation_item_failed'::text NOT NULL,
    attempts bigint DEFAULT 1 NOT NULL,
    first_at timestamp with time zone NOT NULL,
    last_at timestamp with time zone NOT NULL,
    CONSTRAINT billing_reconciliation_item_failures_code_check CHECK ((code = 'reconciliation_item_failed'::text)),
    CONSTRAINT billing_reconciliation_item_failures_environment_check CHECK ((environment = ANY (ARRAY['sandbox'::text, 'production'::text]))),
    CONSTRAINT billing_reconciliation_item_failures_item_key_check CHECK ((item_key ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT billing_reconciliation_item_failures_resource_check CHECK ((resource = ANY (ARRAY['subscriptions'::text, 'refunds'::text, 'disputes'::text]))),
    CONSTRAINT billing_reconciliation_item_failures_resource_id_check CHECK (((resource_id IS NULL) OR ((length(resource_id) >= 1) AND (length(resource_id) <= 200))))
);


--

-- Name: web_purchase_erasure_clock; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.web_purchase_erasure_clock (
    singleton boolean DEFAULT true NOT NULL,
    last_id bigint DEFAULT 0 NOT NULL,
    CONSTRAINT web_purchase_erasure_clock_singleton_check CHECK (singleton)
);


--

-- Name: web_purchase_erasure_consumer; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.web_purchase_erasure_consumer (
    singleton boolean DEFAULT true NOT NULL,
    cursor_id bigint DEFAULT 0 NOT NULL,
    last_success_at timestamp with time zone DEFAULT now() NOT NULL,
    consecutive_failures integer DEFAULT 0 NOT NULL,
    last_code text,
    environment text,
    CONSTRAINT web_purchase_erasure_consumer_environment_check CHECK ((environment = ANY (ARRAY['sandbox'::text, 'production'::text]))),
    CONSTRAINT web_purchase_erasure_consumer_singleton_check CHECK (singleton)
);


--

-- Name: web_purchase_erasure_events; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.web_purchase_erasure_events (
    id bigint NOT NULL,
    account_id uuid NOT NULL,
    deleted_at timestamp with time zone DEFAULT now() NOT NULL
);


--

-- Name: TABLE web_purchase_erasure_events; Type: COMMENT; Schema: private; Owner: -
--

COMMENT ON TABLE private.web_purchase_erasure_events IS 'Post-erasure web cleanup duty, enqueued after the identity tombstone. No direct API grants; bounded pull and proven idempotent ACK remain available after account deletion.';


--

-- Name: web_purchase_erasure_proof_key; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.web_purchase_erasure_proof_key (
    environment text NOT NULL,
    proof_key text NOT NULL,
    CONSTRAINT web_purchase_erasure_proof_key_environment_check CHECK ((environment = ANY (ARRAY['sandbox'::text, 'production'::text]))),
    CONSTRAINT web_purchase_erasure_proof_key_proof_key_check CHECK ((length(proof_key) >= 32))
);


--

-- Name: billing_access_blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_access_blocks (
    environment text NOT NULL,
    source_type text NOT NULL,
    source_id text NOT NULL,
    cause_type text NOT NULL,
    cause_id text NOT NULL,
    user_id uuid NOT NULL,
    blocked boolean NOT NULL,
    remote_modified_at timestamp with time zone NOT NULL,
    snapshot_hash text NOT NULL,
    CONSTRAINT billing_access_blocks_cause_type_check CHECK ((cause_type = ANY (ARRAY['refund'::text, 'dispute'::text, 'order_refund'::text]))),
    CONSTRAINT billing_access_blocks_environment_check CHECK ((environment = ANY (ARRAY['sandbox'::text, 'production'::text]))),
    CONSTRAINT billing_access_blocks_snapshot_hash_check CHECK ((snapshot_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT billing_access_blocks_source_type_check CHECK ((source_type = ANY (ARRAY['order'::text, 'subscription'::text])))
);


--

-- Name: billing_access_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_access_grants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider text NOT NULL,
    environment text NOT NULL,
    source_type text NOT NULL,
    source_id text NOT NULL,
    capability text NOT NULL,
    status text NOT NULL,
    valid_until timestamp with time zone,
    resource_modified_at timestamp with time zone NOT NULL,
    snapshot_hash text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT billing_access_grants_capability_check CHECK (((length(capability) >= 1) AND (length(capability) <= 128))),
    CONSTRAINT billing_access_grants_environment_check CHECK ((environment = ANY (ARRAY['sandbox'::text, 'production'::text, 'legacy'::text]))),
    CONSTRAINT billing_access_grants_metadata_check CHECK ((jsonb_typeof(metadata) = 'object'::text)),
    CONSTRAINT billing_access_grants_provider_check CHECK ((provider = ANY (ARRAY['polar'::text, 'vantare'::text, 'legacy'::text]))),
    CONSTRAINT billing_access_grants_snapshot_hash_check CHECK ((snapshot_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT billing_access_grants_source_id_check CHECK (((length(source_id) >= 1) AND (length(source_id) <= 200))),
    CONSTRAINT billing_access_grants_source_type_check CHECK ((source_type = ANY (ARRAY['order'::text, 'subscription'::text, 'subscription_recovery'::text, 'benefit_grant'::text, 'legacy'::text, 'support'::text]))),
    CONSTRAINT billing_access_grants_status_check CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text])))
);


--

-- Name: TABLE billing_access_grants; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.billing_access_grants IS 'Authoritative local projection by commercial source. user_entitlements is derived from this table.';


--

-- Name: billing_checkout_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_checkout_attempts (
    user_id uuid NOT NULL,
    attempt_id uuid NOT NULL,
    checkout_key text NOT NULL,
    environment text NOT NULL,
    catalog_version text NOT NULL,
    status text NOT NULL,
    provider_checkout_id text,
    checkout_url text,
    expires_at timestamp with time zone DEFAULT (now() + '00:30:00'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    resolution text,
    provider_request_started_at timestamp with time zone,
    dispatch_token uuid DEFAULT gen_random_uuid() NOT NULL,
    dispatch_product_id uuid,
    recovery_checkout_id uuid,
    provider_checkout_status text,
    CONSTRAINT billing_checkout_attempts_catalog_version_check CHECK ((length(btrim(catalog_version)) > 0)),
    CONSTRAINT billing_checkout_attempts_check CHECK (((status = 'open'::text) = (checkout_url IS NOT NULL))),
    CONSTRAINT billing_checkout_attempts_checkout_key_check CHECK ((checkout_key = ANY (ARRAY['founders'::text, 'launch_lifetime'::text, 'pro_monthly'::text, 'pro_annual'::text, 'pro_plus_monthly'::text, 'pro_plus_annual'::text]))),
    CONSTRAINT billing_checkout_attempts_environment_check CHECK ((environment = ANY (ARRAY['sandbox'::text, 'production'::text]))),
    CONSTRAINT billing_checkout_attempts_resolution_check CHECK ((resolution = ANY (ARRAY['unpaid_expired'::text, 'refunded'::text, 'revoked'::text]))),
    CONSTRAINT billing_checkout_attempts_status_check CHECK ((status = ANY (ARRAY['creating'::text, 'open'::text, 'uncertain'::text])))
);


--

-- Name: TABLE billing_checkout_attempts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.billing_checkout_attempts IS 'Server-only shared app/web dedupe. Expired leases do not prove Polar expiry. Preserve unresolved attempts for authorized reconciliation; never delete on another claim.';


--

-- Name: billing_checkout_bindings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_checkout_bindings (
    environment text NOT NULL,
    provider_checkout_id text NOT NULL,
    user_id uuid NOT NULL,
    attempt_id uuid NOT NULL,
    checkout_key text NOT NULL,
    catalog_version text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT billing_checkout_bindings_environment_check CHECK ((environment = ANY (ARRAY['sandbox'::text, 'production'::text]))),
    CONSTRAINT billing_checkout_bindings_provider_checkout_id_check CHECK (((length(provider_checkout_id) >= 1) AND (length(provider_checkout_id) <= 200)))
);


--

-- Name: billing_commercial_resources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_commercial_resources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider text NOT NULL,
    environment text NOT NULL,
    resource_type text NOT NULL,
    resource_id text NOT NULL,
    remote_state text NOT NULL,
    remote_modified_at timestamp with time zone NOT NULL,
    snapshot_hash text NOT NULL,
    stale_event_count integer DEFAULT 0 NOT NULL,
    conflict_count integer DEFAULT 0 NOT NULL,
    last_stale_event_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT billing_commercial_resources_conflict_count_check CHECK ((conflict_count >= 0)),
    CONSTRAINT billing_commercial_resources_environment_check CHECK ((environment = ANY (ARRAY['sandbox'::text, 'production'::text]))),
    CONSTRAINT billing_commercial_resources_metadata_check CHECK ((jsonb_typeof(metadata) = 'object'::text)),
    CONSTRAINT billing_commercial_resources_provider_check CHECK ((provider = 'polar'::text)),
    CONSTRAINT billing_commercial_resources_remote_state_check CHECK (((length(remote_state) >= 1) AND (length(remote_state) <= 80))),
    CONSTRAINT billing_commercial_resources_resource_id_check CHECK (((length(resource_id) >= 1) AND (length(resource_id) <= 200))),
    CONSTRAINT billing_commercial_resources_resource_type_check CHECK ((resource_type = ANY (ARRAY['order'::text, 'subscription'::text, 'benefit_grant'::text]))),
    CONSTRAINT billing_commercial_resources_snapshot_hash_check CHECK ((snapshot_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT billing_commercial_resources_stale_event_count_check CHECK ((stale_event_count >= 0))
);


--

-- Name: billing_customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider text NOT NULL,
    provider_customer_id text NOT NULL,
    email text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    environment text,
    CONSTRAINT billing_customers_environment_check CHECK (((environment IS NULL) OR (environment = ANY (ARRAY['sandbox'::text, 'production'::text]))))
);


--

-- Name: COLUMN billing_customers.environment; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.billing_customers.environment IS 'Polar environment. Legacy NULL rows are quarantined and never used by checkout, portal or webhook resolution.';


--

-- Name: billing_effective_access_grants; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.billing_effective_access_grants AS
 SELECT id,
    user_id,
    provider,
    environment,
    source_type,
    source_id,
    capability,
    status,
    valid_until,
    resource_modified_at,
    snapshot_hash,
    metadata,
    created_at,
    updated_at
   FROM public.billing_access_grants g
  WHERE ((NOT (EXISTS ( SELECT 1
           FROM public.account_identities i
          WHERE ((i.account_id = g.user_id) AND (i.deleted_at IS NOT NULL))))) AND (NOT (EXISTS ( SELECT 1
           FROM public.billing_access_blocks b
          WHERE ((b.user_id = g.user_id) AND (b.environment = g.environment) AND b.blocked AND (((b.source_type = g.source_type) AND (b.source_id = g.source_id)) OR ((b.source_type = 'subscription'::text) AND (g.source_type = 'subscription_recovery'::text) AND (b.source_id = (g.metadata ->> 'subscription_id'::text)))))))) AND (NOT (EXISTS ( SELECT 1
           FROM private.billing_checkout_compensations c
          WHERE ((c.environment = g.environment) AND (c.selected_at IS NOT NULL) AND (((g.source_type = 'order'::text) AND (g.source_id = (c.order_id)::text)) OR ((g.source_type = 'subscription'::text) AND (g.source_id = (c.subscription_id)::text)) OR ((g.source_type = 'subscription_recovery'::text) AND ((g.metadata ->> 'subscription_id'::text) = (c.subscription_id)::text))))))));


--

-- Name: billing_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider text DEFAULT 'polar'::text NOT NULL,
    environment text NOT NULL,
    provider_order_id text NOT NULL,
    provider_product_id text NOT NULL,
    provider_checkout_id text,
    status text NOT NULL,
    paid boolean NOT NULL,
    net_amount bigint NOT NULL,
    currency text NOT NULL,
    reported_refunded_amount bigint DEFAULT 0 NOT NULL,
    remote_modified_at timestamp with time zone NOT NULL,
    snapshot_hash text NOT NULL,
    stale_event_count integer DEFAULT 0 NOT NULL,
    conflict_count integer DEFAULT 0 NOT NULL,
    last_stale_event_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    provider_subscription_id text,
    CONSTRAINT billing_orders_check CHECK (((reported_refunded_amount >= 0) AND (reported_refunded_amount <= net_amount))),
    CONSTRAINT billing_orders_conflict_count_check CHECK ((conflict_count >= 0)),
    CONSTRAINT billing_orders_currency_check CHECK ((currency ~ '^[a-z]{3}$'::text)),
    CONSTRAINT billing_orders_environment_check CHECK ((environment = ANY (ARRAY['sandbox'::text, 'production'::text]))),
    CONSTRAINT billing_orders_net_amount_check CHECK ((net_amount > 0)),
    CONSTRAINT billing_orders_paid_check CHECK (paid),
    CONSTRAINT billing_orders_provider_check CHECK ((provider = 'polar'::text)),
    CONSTRAINT billing_orders_provider_checkout_id_check CHECK (((provider_checkout_id IS NULL) OR ((length(provider_checkout_id) >= 1) AND (length(provider_checkout_id) <= 200)))),
    CONSTRAINT billing_orders_provider_order_id_check CHECK (((length(provider_order_id) >= 1) AND (length(provider_order_id) <= 200))),
    CONSTRAINT billing_orders_provider_product_id_check CHECK (((length(provider_product_id) >= 1) AND (length(provider_product_id) <= 200))),
    CONSTRAINT billing_orders_snapshot_hash_check CHECK ((snapshot_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT billing_orders_stale_event_count_check CHECK ((stale_event_count >= 0)),
    CONSTRAINT billing_orders_status_check CHECK ((status = ANY (ARRAY['paid'::text, 'partially_refunded'::text, 'refunded'::text])))
);


--

-- Name: TABLE billing_orders; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.billing_orders IS 'Minimal server-only Polar one-time order ledger; aggregates never revoke without attributed succeeded refunds.';


--

-- Name: billing_reconciliation_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_reconciliation_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider text NOT NULL,
    environment text NOT NULL,
    trigger_kind text NOT NULL,
    snapshot_hash text NOT NULL,
    plan_hash text NOT NULL,
    observed_hash text NOT NULL,
    plan jsonb NOT NULL,
    operation_count integer NOT NULL,
    changed_count integer NOT NULL,
    status text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT billing_reconciliation_runs_changed_count_check CHECK ((changed_count >= 0)),
    CONSTRAINT billing_reconciliation_runs_environment_check CHECK ((environment = ANY (ARRAY['sandbox'::text, 'production'::text]))),
    CONSTRAINT billing_reconciliation_runs_observed_hash_check CHECK ((observed_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT billing_reconciliation_runs_operation_count_check CHECK ((operation_count >= 0)),
    CONSTRAINT billing_reconciliation_runs_plan_check CHECK (((jsonb_typeof(plan) = 'array'::text) AND (octet_length((plan)::text) <= 262144))),
    CONSTRAINT billing_reconciliation_runs_plan_hash_check CHECK ((plan_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT billing_reconciliation_runs_provider_check CHECK ((provider = 'polar'::text)),
    CONSTRAINT billing_reconciliation_runs_snapshot_hash_check CHECK ((snapshot_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT billing_reconciliation_runs_status_check CHECK ((status = ANY (ARRAY['applied'::text, 'unchanged'::text, 'quarantined'::text]))),
    CONSTRAINT billing_reconciliation_runs_trigger_kind_check CHECK ((trigger_kind = ANY (ARRAY['manual'::text, 'scheduled'::text, 'event'::text])))
);


--

-- Name: TABLE billing_reconciliation_runs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.billing_reconciliation_runs IS 'Applied reconciliation audit only. Dry-run performs zero database writes.';


--

-- Name: billing_refunds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_refunds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider text DEFAULT 'polar'::text NOT NULL,
    environment text NOT NULL,
    provider_refund_id text NOT NULL,
    provider_order_id text NOT NULL,
    provider_payment_id text,
    status text NOT NULL,
    amount bigint NOT NULL,
    currency text NOT NULL,
    remote_modified_at timestamp with time zone NOT NULL,
    snapshot_hash text NOT NULL,
    stale_event_count integer DEFAULT 0 NOT NULL,
    conflict_count integer DEFAULT 0 NOT NULL,
    last_stale_event_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT billing_refunds_amount_check CHECK ((amount > 0)),
    CONSTRAINT billing_refunds_conflict_count_check CHECK ((conflict_count >= 0)),
    CONSTRAINT billing_refunds_currency_check CHECK ((currency ~ '^[a-z]{3}$'::text)),
    CONSTRAINT billing_refunds_environment_check CHECK ((environment = ANY (ARRAY['sandbox'::text, 'production'::text]))),
    CONSTRAINT billing_refunds_provider_check CHECK ((provider = 'polar'::text)),
    CONSTRAINT billing_refunds_provider_order_id_check CHECK (((length(provider_order_id) >= 1) AND (length(provider_order_id) <= 200))),
    CONSTRAINT billing_refunds_provider_payment_id_check CHECK (((length(provider_payment_id) >= 1) AND (length(provider_payment_id) <= 200))),
    CONSTRAINT billing_refunds_provider_refund_id_check CHECK (((length(provider_refund_id) >= 1) AND (length(provider_refund_id) <= 200))),
    CONSTRAINT billing_refunds_snapshot_hash_check CHECK ((snapshot_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT billing_refunds_stale_event_count_check CHECK ((stale_event_count >= 0)),
    CONSTRAINT billing_refunds_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'succeeded'::text, 'failed'::text, 'canceled'::text])))
);


--

-- Name: TABLE billing_refunds; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.billing_refunds IS 'Minimal server-only Polar refund ledger attributed by refund, payment and order identifiers.';


--

-- Name: billing_subscription_recovery_cycles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_subscription_recovery_cycles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider text NOT NULL,
    environment text NOT NULL,
    subscription_id text NOT NULL,
    cycle_paid_through timestamp with time zone NOT NULL,
    first_failure_at timestamp with time zone NOT NULL,
    recovery_until timestamp with time zone NOT NULL,
    closed_at timestamp with time zone,
    close_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT billing_subscription_recovery_cycles_check CHECK ((recovery_until = (first_failure_at + '72:00:00'::interval))),
    CONSTRAINT billing_subscription_recovery_cycles_close_reason_check CHECK (((close_reason IS NULL) OR ((length(close_reason) >= 1) AND (length(close_reason) <= 80)))),
    CONSTRAINT billing_subscription_recovery_cycles_environment_check CHECK ((environment = ANY (ARRAY['sandbox'::text, 'production'::text]))),
    CONSTRAINT billing_subscription_recovery_cycles_provider_check CHECK ((provider = 'polar'::text)),
    CONSTRAINT billing_subscription_recovery_cycles_subscription_id_check CHECK (((length(subscription_id) >= 1) AND (length(subscription_id) <= 200)))
);


--

-- Name: TABLE billing_subscription_recovery_cycles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.billing_subscription_recovery_cycles IS 'Immutable audit of bounded Vantare recovery grants per Polar subscription paid-through cycle.';


--

-- Name: billing_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider text NOT NULL,
    provider_subscription_id text NOT NULL,
    provider_product_id text,
    provider_price_id text,
    status text NOT NULL,
    current_period_start timestamp with time zone,
    current_period_end timestamp with time zone,
    cancel_at_period_end boolean DEFAULT false,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    environment text NOT NULL,
    paid_through timestamp with time zone,
    recovery_cycle_paid_through timestamp with time zone,
    recovery_started_at timestamp with time zone,
    recovery_until timestamp with time zone,
    CONSTRAINT billing_subscriptions_environment_check CHECK ((environment = ANY (ARRAY['sandbox'::text, 'production'::text, 'legacy'::text]))),
    CONSTRAINT billing_subscriptions_recovery_fields_check CHECK ((((recovery_cycle_paid_through IS NULL) AND (recovery_started_at IS NULL) AND (recovery_until IS NULL)) OR ((recovery_cycle_paid_through IS NOT NULL) AND (recovery_started_at IS NOT NULL) AND (recovery_until IS NOT NULL) AND (recovery_until >= recovery_started_at) AND (recovery_until <= (recovery_started_at + '72:00:00'::interval)))))
);


--

-- Name: billing_webhook_effects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_webhook_effects (
    inbox_id uuid NOT NULL,
    effect_key text NOT NULL,
    status text DEFAULT 'received'::text NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    lease_token uuid,
    lease_expires_at timestamp with time zone,
    last_error_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT billing_webhook_effects_attempt_count_check CHECK ((attempt_count >= 0)),
    CONSTRAINT billing_webhook_effects_effect_key_check CHECK ((effect_key ~ '^[a-z0-9_:-]{1,96}$'::text)),
    CONSTRAINT billing_webhook_effects_status_check CHECK ((status = ANY (ARRAY['received'::text, 'processing'::text, 'completed'::text, 'failed'::text])))
);


--

-- Name: billing_webhook_inbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_webhook_inbox (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider text NOT NULL,
    provider_event_id text NOT NULL,
    event_type text NOT NULL,
    payload_hash text NOT NULL,
    payload jsonb NOT NULL,
    payload_purged_at timestamp with time zone,
    status text DEFAULT 'received'::text NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 5 NOT NULL,
    next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    lease_token uuid,
    lease_expires_at timestamp with time zone,
    last_error_code text,
    quarantine_reason text,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    processing_started_at timestamp with time zone,
    processed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    replay_count integer DEFAULT 0 NOT NULL,
    environment text NOT NULL,
    duplicate_count integer DEFAULT 0 NOT NULL,
    last_duplicate_at timestamp with time zone,
    CONSTRAINT billing_webhook_inbox_attempt_count_check CHECK ((attempt_count >= 0)),
    CONSTRAINT billing_webhook_inbox_duplicate_count_check CHECK ((duplicate_count >= 0)),
    CONSTRAINT billing_webhook_inbox_environment_check CHECK ((environment = ANY (ARRAY['sandbox'::text, 'production'::text, 'unclassified'::text]))),
    CONSTRAINT billing_webhook_inbox_max_attempts_check CHECK (((max_attempts >= 1) AND (max_attempts <= 20))),
    CONSTRAINT billing_webhook_inbox_payload_hash_check CHECK ((payload_hash ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT billing_webhook_inbox_replay_count_check CHECK ((replay_count >= 0)),
    CONSTRAINT billing_webhook_inbox_status_check CHECK ((status = ANY (ARRAY['received'::text, 'processing'::text, 'processed'::text, 'failed'::text, 'quarantined'::text])))
);


--

-- Name: billing_webhook_replay_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_webhook_replay_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    inbox_id uuid NOT NULL,
    actor_id text NOT NULL,
    reason_code text NOT NULL,
    previous_status text NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT billing_webhook_replay_audit_actor_id_check CHECK ((actor_id ~ '^[a-z0-9_-]{3,64}$'::text)),
    CONSTRAINT billing_webhook_replay_audit_reason_code_check CHECK ((reason_code ~ '^[a-z0-9_:-]{3,96}$'::text))
);


--

-- Name: license_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.license_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    event_type text NOT NULL,
    idempotency_key text,
    payload jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

-- Name: license_validations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.license_validations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    license_id uuid NOT NULL,
    user_id uuid NOT NULL,
    hwid text NOT NULL,
    ip_address inet,
    validated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_valid boolean NOT NULL,
    failure_reason text
);


--

-- Name: billing_checkout_compensation_audit billing_checkout_compensation_audit_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.billing_checkout_compensation_audit
    ADD CONSTRAINT billing_checkout_compensation_audit_pkey PRIMARY KEY (id);


--

-- Name: billing_checkout_compensations billing_checkout_compensations_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.billing_checkout_compensations
    ADD CONSTRAINT billing_checkout_compensations_pkey PRIMARY KEY (environment, order_id);


--

-- Name: billing_checkout_dispositions billing_checkout_dispositions_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.billing_checkout_dispositions
    ADD CONSTRAINT billing_checkout_dispositions_pkey PRIMARY KEY (environment, order_id);


--

-- Name: billing_compensation_policy billing_compensation_policy_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.billing_compensation_policy
    ADD CONSTRAINT billing_compensation_policy_pkey PRIMARY KEY (environment);


--

-- Name: billing_deleted_observations billing_deleted_observations_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.billing_deleted_observations
    ADD CONSTRAINT billing_deleted_observations_pkey PRIMARY KEY (environment, observation_hash);


--

-- Name: billing_launch_offers billing_launch_offers_environment_product_id_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.billing_launch_offers
    ADD CONSTRAINT billing_launch_offers_environment_product_id_key UNIQUE (environment, product_id);


--

-- Name: billing_launch_offers billing_launch_offers_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.billing_launch_offers
    ADD CONSTRAINT billing_launch_offers_pkey PRIMARY KEY (environment, checkout_key);


--

-- Name: billing_owner_alert_inbox billing_owner_alert_inbox_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.billing_owner_alert_inbox
    ADD CONSTRAINT billing_owner_alert_inbox_pkey PRIMARY KEY (environment, alert_type, alert_id);


--

-- Name: billing_owner_notices billing_owner_notices_environment_kind_correlation_hash_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.billing_owner_notices
    ADD CONSTRAINT billing_owner_notices_environment_kind_correlation_hash_key UNIQUE (environment, kind, correlation_hash);


--

-- Name: billing_owner_notices billing_owner_notices_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.billing_owner_notices
    ADD CONSTRAINT billing_owner_notices_pkey PRIMARY KEY (id);


--

-- Name: billing_payment_incidents billing_payment_incidents_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.billing_payment_incidents
    ADD CONSTRAINT billing_payment_incidents_pkey PRIMARY KEY (environment, resource_id, reason);


--

-- Name: billing_reconciliation_cursor billing_reconciliation_cursor_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.billing_reconciliation_cursor
    ADD CONSTRAINT billing_reconciliation_cursor_pkey PRIMARY KEY (environment);


--

-- Name: billing_reconciliation_item_failures billing_reconciliation_item_failures_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.billing_reconciliation_item_failures
    ADD CONSTRAINT billing_reconciliation_item_failures_pkey PRIMARY KEY (environment, resource, item_key);


--

-- Name: web_purchase_erasure_clock web_purchase_erasure_clock_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.web_purchase_erasure_clock
    ADD CONSTRAINT web_purchase_erasure_clock_pkey PRIMARY KEY (singleton);


--

-- Name: web_purchase_erasure_consumer web_purchase_erasure_consumer_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.web_purchase_erasure_consumer
    ADD CONSTRAINT web_purchase_erasure_consumer_pkey PRIMARY KEY (singleton);


--

-- Name: web_purchase_erasure_events web_purchase_erasure_events_account_id_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.web_purchase_erasure_events
    ADD CONSTRAINT web_purchase_erasure_events_account_id_key UNIQUE (account_id);


--

-- Name: web_purchase_erasure_events web_purchase_erasure_events_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.web_purchase_erasure_events
    ADD CONSTRAINT web_purchase_erasure_events_pkey PRIMARY KEY (id);


--

-- Name: web_purchase_erasure_proof_key web_purchase_erasure_proof_key_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.web_purchase_erasure_proof_key
    ADD CONSTRAINT web_purchase_erasure_proof_key_pkey PRIMARY KEY (environment);


--

-- Name: billing_access_blocks billing_access_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_access_blocks
    ADD CONSTRAINT billing_access_blocks_pkey PRIMARY KEY (environment, cause_type, cause_id);


--

-- Name: billing_access_grants billing_access_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_access_grants
    ADD CONSTRAINT billing_access_grants_pkey PRIMARY KEY (id);


--

-- Name: billing_access_grants billing_access_grants_provider_environment_source_type_sour_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_access_grants
    ADD CONSTRAINT billing_access_grants_provider_environment_source_type_sour_key UNIQUE (provider, environment, source_type, source_id, capability);


--

-- Name: billing_checkout_attempts billing_checkout_attempts_dispatch_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_checkout_attempts
    ADD CONSTRAINT billing_checkout_attempts_dispatch_token_key UNIQUE (dispatch_token);


--

-- Name: billing_checkout_attempts billing_checkout_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_checkout_attempts
    ADD CONSTRAINT billing_checkout_attempts_pkey PRIMARY KEY (user_id, attempt_id);


--

-- Name: billing_checkout_bindings billing_checkout_bindings_environment_user_id_attempt_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_checkout_bindings
    ADD CONSTRAINT billing_checkout_bindings_environment_user_id_attempt_id_key UNIQUE (environment, user_id, attempt_id);


--

-- Name: billing_checkout_bindings billing_checkout_bindings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_checkout_bindings
    ADD CONSTRAINT billing_checkout_bindings_pkey PRIMARY KEY (environment, provider_checkout_id);


--

-- Name: billing_commercial_resources billing_commercial_resources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_commercial_resources
    ADD CONSTRAINT billing_commercial_resources_pkey PRIMARY KEY (id);


--

-- Name: billing_commercial_resources billing_commercial_resources_provider_environment_resource__key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_commercial_resources
    ADD CONSTRAINT billing_commercial_resources_provider_environment_resource__key UNIQUE (provider, environment, resource_type, resource_id);


--

-- Name: billing_customers billing_customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_customers
    ADD CONSTRAINT billing_customers_pkey PRIMARY KEY (id);


--

-- Name: billing_customers billing_customers_provider_environment_customer_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_customers
    ADD CONSTRAINT billing_customers_provider_environment_customer_key UNIQUE NULLS NOT DISTINCT (provider, environment, provider_customer_id);


--

-- Name: billing_customers billing_customers_user_provider_environment_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_customers
    ADD CONSTRAINT billing_customers_user_provider_environment_key UNIQUE NULLS NOT DISTINCT (user_id, provider, environment);


--

-- Name: billing_orders billing_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_orders
    ADD CONSTRAINT billing_orders_pkey PRIMARY KEY (id);


--

-- Name: billing_orders billing_orders_provider_environment_provider_order_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_orders
    ADD CONSTRAINT billing_orders_provider_environment_provider_order_id_key UNIQUE (provider, environment, provider_order_id);


--

-- Name: billing_reconciliation_runs billing_reconciliation_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_reconciliation_runs
    ADD CONSTRAINT billing_reconciliation_runs_pkey PRIMARY KEY (id);


--

-- Name: billing_reconciliation_runs billing_reconciliation_runs_provider_environment_user_id_sn_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_reconciliation_runs
    ADD CONSTRAINT billing_reconciliation_runs_provider_environment_user_id_sn_key UNIQUE (provider, environment, user_id, snapshot_hash, plan_hash);


--

-- Name: billing_refunds billing_refunds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_refunds
    ADD CONSTRAINT billing_refunds_pkey PRIMARY KEY (id);


--

-- Name: billing_refunds billing_refunds_provider_environment_provider_refund_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_refunds
    ADD CONSTRAINT billing_refunds_provider_environment_provider_refund_id_key UNIQUE (provider, environment, provider_refund_id);


--

-- Name: billing_subscription_recovery_cycles billing_subscription_recovery_cycles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_subscription_recovery_cycles
    ADD CONSTRAINT billing_subscription_recovery_cycles_pkey PRIMARY KEY (id);


--

-- Name: billing_subscription_recovery_cycles billing_subscription_recovery_provider_environment_subscrip_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_subscription_recovery_cycles
    ADD CONSTRAINT billing_subscription_recovery_provider_environment_subscrip_key UNIQUE (provider, environment, subscription_id, cycle_paid_through);


--

-- Name: billing_subscriptions billing_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_subscriptions
    ADD CONSTRAINT billing_subscriptions_pkey PRIMARY KEY (id);


--

-- Name: billing_webhook_effects billing_webhook_effects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_webhook_effects
    ADD CONSTRAINT billing_webhook_effects_pkey PRIMARY KEY (inbox_id, effect_key);


--

-- Name: billing_webhook_inbox billing_webhook_inbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_webhook_inbox
    ADD CONSTRAINT billing_webhook_inbox_pkey PRIMARY KEY (id);


--

-- Name: billing_webhook_inbox billing_webhook_inbox_provider_environment_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_webhook_inbox
    ADD CONSTRAINT billing_webhook_inbox_provider_environment_event_id_key UNIQUE (provider, environment, provider_event_id);


--

-- Name: billing_webhook_replay_audit billing_webhook_replay_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_webhook_replay_audit
    ADD CONSTRAINT billing_webhook_replay_audit_pkey PRIMARY KEY (id);


--

-- Name: license_events license_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.license_events
    ADD CONSTRAINT license_events_pkey PRIMARY KEY (id);


--

-- Name: license_validations license_validations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.license_validations
    ADD CONSTRAINT license_validations_pkey PRIMARY KEY (id);


--

-- Name: billing_payment_incidents_account; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX billing_payment_incidents_account ON private.billing_payment_incidents USING btree (environment, account_id, created_at DESC);


--

-- Name: checkout_compensation_due; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX checkout_compensation_due ON private.billing_checkout_compensations USING btree (environment, next_attempt_at) WHERE (state = ANY (ARRAY['waiting'::text, 'refunding'::text]));


--

-- Name: billing_access_blocks_active_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX billing_access_blocks_active_source ON public.billing_access_blocks USING btree (user_id, environment, source_type, source_id) WHERE blocked;


--

-- Name: billing_access_grants_user_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX billing_access_grants_user_active_idx ON public.billing_access_grants USING btree (user_id, status, valid_until);


--

-- Name: billing_checkout_attempts_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX billing_checkout_attempts_expiry_idx ON public.billing_checkout_attempts USING btree (expires_at);


--

-- Name: billing_commercial_resources_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX billing_commercial_resources_user_idx ON public.billing_commercial_resources USING btree (user_id, provider, environment);


--

-- Name: billing_customers_provider_customer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX billing_customers_provider_customer_idx ON public.billing_customers USING btree (provider, provider_customer_id);


--

-- Name: billing_orders_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX billing_orders_user_idx ON public.billing_orders USING btree (user_id, environment, remote_modified_at DESC);


--

-- Name: billing_reconciliation_runs_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX billing_reconciliation_runs_user_idx ON public.billing_reconciliation_runs USING btree (user_id, created_at DESC);


--

-- Name: billing_refunds_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX billing_refunds_order_idx ON public.billing_refunds USING btree (environment, provider_order_id, status);


--

-- Name: billing_subscription_recovery_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX billing_subscription_recovery_user_idx ON public.billing_subscription_recovery_cycles USING btree (user_id, created_at DESC);


--

-- Name: billing_subscriptions_provider_environment_id_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX billing_subscriptions_provider_environment_id_uq ON public.billing_subscriptions USING btree (provider, environment, provider_subscription_id);


--

-- Name: billing_subscriptions_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX billing_subscriptions_user_id_idx ON public.billing_subscriptions USING btree (user_id);


--

-- Name: billing_webhook_effects_lease_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX billing_webhook_effects_lease_idx ON public.billing_webhook_effects USING btree (lease_expires_at) WHERE (status = 'processing'::text);


--

-- Name: billing_webhook_inbox_lease_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX billing_webhook_inbox_lease_idx ON public.billing_webhook_inbox USING btree (lease_expires_at) WHERE (status = 'processing'::text);


--

-- Name: billing_webhook_inbox_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX billing_webhook_inbox_pending_idx ON public.billing_webhook_inbox USING btree (status, next_attempt_at, received_at);


--

-- Name: billing_webhook_replay_audit_inbox_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX billing_webhook_replay_audit_inbox_idx ON public.billing_webhook_replay_audit USING btree (inbox_id, requested_at DESC);


--

-- Name: idx_validations_license_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_validations_license_id ON public.license_validations USING btree (license_id);


--

-- Name: idx_validations_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_validations_user_id ON public.license_validations USING btree (user_id);


--

-- Name: idx_validations_validated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_validations_validated_at ON public.license_validations USING btree (validated_at DESC);


--

-- Name: license_events_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX license_events_created_at_idx ON public.license_events USING btree (created_at DESC);


--

-- Name: license_events_idempotency_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX license_events_idempotency_uq ON public.license_events USING btree (event_type, idempotency_key) WHERE (idempotency_key IS NOT NULL);


--

-- Name: license_events_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX license_events_user_id_idx ON public.license_events USING btree (user_id);


--

-- Name: billing_payment_incidents a_account_write_barrier; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON private.billing_payment_incidents FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array[($1->>''account_id'')::uuid]', 'select false');


--

-- Name: billing_access_blocks a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.billing_access_blocks FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''user_id'')::uuid) owners(account)', 'select ($1->>''user_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''user_id'')::uuid))');


--

-- Name: billing_access_grants a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.billing_access_grants FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''user_id'')::uuid) owners(account)', 'select ($1->>''user_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''user_id'')::uuid))');


--

-- Name: billing_checkout_attempts a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.billing_checkout_attempts FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''user_id'')::uuid) owners(account)', 'select ($1->>''user_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''user_id'')::uuid))');


--

-- Name: billing_checkout_bindings a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.billing_checkout_bindings FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''user_id'')::uuid) owners(account)', 'select ($1->>''user_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''user_id'')::uuid))');


--

-- Name: billing_commercial_resources a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.billing_commercial_resources FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''user_id'')::uuid) owners(account)', 'select ($1->>''user_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''user_id'')::uuid))');


--

-- Name: billing_customers a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.billing_customers FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''user_id'')::uuid) owners(account)', 'select ($1->>''user_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''user_id'')::uuid))');


--

-- Name: billing_orders a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.billing_orders FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''user_id'')::uuid) owners(account)', 'select ($1->>''user_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''user_id'')::uuid))');


--

-- Name: billing_reconciliation_runs a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.billing_reconciliation_runs FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''user_id'')::uuid) owners(account)', 'select ($1->>''user_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''user_id'')::uuid))');


--

-- Name: billing_refunds a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.billing_refunds FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.billing_orders p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''user_id'')::uuid) a(account) where p2.provider=($1->>''provider'')::text and p2.environment=($1->>''environment'')::text and p2.provider_order_id=($1->>''provider_order_id'')::text) owners(account)', 'select ($1->>''provider'' is not null and $1->>''environment'' is not null and $1->>''provider_order_id'' is not null and not exists(select 1 from public.billing_orders p where p.provider=($1->>''provider'')::text and p.environment=($1->>''environment'')::text and p.provider_order_id=($1->>''provider_order_id'')::text))');


--

-- Name: billing_subscription_recovery_cycles a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.billing_subscription_recovery_cycles FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''user_id'')::uuid) owners(account)', 'select ($1->>''user_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''user_id'')::uuid))');


--

-- Name: billing_subscriptions a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.billing_subscriptions FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''user_id'')::uuid) owners(account)', 'select ($1->>''user_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''user_id'')::uuid))');


--

-- Name: billing_webhook_effects a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.billing_webhook_effects FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.billing_webhook_inbox p1 cross join lateral (
        select c.user_id from public.billing_customers c
        where c.provider=to_jsonb(p1)->>''provider'' and c.environment=to_jsonb(p1)->>''environment''
          and c.provider_customer_id in (to_jsonb(p1)#>>''{payload,data,customer_id}'',to_jsonb(p1)#>>''{payload,data,customer,id}'')
        union select b.user_id from public.billing_checkout_bindings b
        where b.environment=to_jsonb(p1)->>''environment'' and b.provider_checkout_id=to_jsonb(p1)#>>''{payload,data,checkout_id}''
        union select o.user_id from public.billing_orders o where o.provider=to_jsonb(p1)->>''provider''
          and o.environment=to_jsonb(p1)->>''environment'' and o.provider_order_id in
            (to_jsonb(p1)#>>''{payload,data,order_id}'',case when to_jsonb(p1)->>''event_type'' like ''order.%'' then to_jsonb(p1)#>>''{payload,data,id}'' end)
        union select s.user_id from public.billing_subscriptions s where s.provider=to_jsonb(p1)->>''provider''
          and s.environment=to_jsonb(p1)->>''environment'' and s.provider_subscription_id in
            (to_jsonb(p1)#>>''{payload,data,subscription_id}'',case when to_jsonb(p1)->>''event_type'' like ''subscription.%'' then to_jsonb(p1)#>>''{payload,data,id}'' end)
      ) a(account) where p1.id=($1->>''inbox_id'')::uuid) owners(account)', 'select ($1->>''inbox_id'' is not null and not exists(select 1 from public.billing_webhook_inbox p where p.id=($1->>''inbox_id'')::uuid))');


--

-- Name: billing_webhook_inbox a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.billing_webhook_inbox FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select b.user_id from public.billing_checkout_bindings b
        where b.environment=$1->>''environment'' and b.provider_checkout_id=$1#>>''{payload,data,checkout_id}'' union select c.user_id from public.billing_customers c
        where c.provider=$1->>''provider'' and c.environment=$1->>''environment''
          and c.provider_customer_id in ($1#>>''{payload,data,customer_id}'',$1#>>''{payload,data,customer,id}'') union select o.user_id from public.billing_orders o where o.provider=$1->>''provider''
          and o.environment=$1->>''environment'' and o.provider_order_id in
            ($1#>>''{payload,data,order_id}'',case when $1->>''event_type'' like ''order.%'' then $1#>>''{payload,data,id}'' end) union select s.user_id from public.billing_subscriptions s where s.provider=$1->>''provider''
          and s.environment=$1->>''environment'' and s.provider_subscription_id in
            ($1#>>''{payload,data,subscription_id}'',case when $1->>''event_type'' like ''subscription.%'' then $1#>>''{payload,data,id}'' end)) owners(account)', 'select false');


--

-- Name: billing_webhook_replay_audit a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.billing_webhook_replay_audit FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.billing_webhook_inbox p1 cross join lateral (
        select c.user_id from public.billing_customers c
        where c.provider=to_jsonb(p1)->>''provider'' and c.environment=to_jsonb(p1)->>''environment''
          and c.provider_customer_id in (to_jsonb(p1)#>>''{payload,data,customer_id}'',to_jsonb(p1)#>>''{payload,data,customer,id}'')
        union select b.user_id from public.billing_checkout_bindings b
        where b.environment=to_jsonb(p1)->>''environment'' and b.provider_checkout_id=to_jsonb(p1)#>>''{payload,data,checkout_id}''
        union select o.user_id from public.billing_orders o where o.provider=to_jsonb(p1)->>''provider''
          and o.environment=to_jsonb(p1)->>''environment'' and o.provider_order_id in
            (to_jsonb(p1)#>>''{payload,data,order_id}'',case when to_jsonb(p1)->>''event_type'' like ''order.%'' then to_jsonb(p1)#>>''{payload,data,id}'' end)
        union select s.user_id from public.billing_subscriptions s where s.provider=to_jsonb(p1)->>''provider''
          and s.environment=to_jsonb(p1)->>''environment'' and s.provider_subscription_id in
            (to_jsonb(p1)#>>''{payload,data,subscription_id}'',case when to_jsonb(p1)->>''event_type'' like ''subscription.%'' then to_jsonb(p1)#>>''{payload,data,id}'' end)
      ) a(account) where p1.id=($1->>''inbox_id'')::uuid) owners(account)', 'select ($1->>''inbox_id'' is not null and not exists(select 1 from public.billing_webhook_inbox p where p.id=($1->>''inbox_id'')::uuid))');


--

-- Name: license_events a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.license_events FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''user_id'')::uuid) owners(account)', 'select ($1->>''user_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''user_id'')::uuid))');


--

-- Name: license_validations a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.license_validations FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.licenses p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''user_id'')::uuid) a(account) where p2.id=($1->>''license_id'')::uuid union select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''user_id'')::uuid) owners(account)', 'select ($1->>''license_id'' is not null and not exists(select 1 from public.licenses p where p.id=($1->>''license_id'')::uuid)) or ($1->>''user_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''user_id'')::uuid))');


--

-- Name: billing_checkout_attempts guard_founders_checkout; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER guard_founders_checkout BEFORE INSERT ON public.billing_checkout_attempts FOR EACH ROW EXECUTE FUNCTION private.guard_founders_checkout();


--

-- Name: billing_checkout_attempts report_promotion_checkout_started; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER report_promotion_checkout_started AFTER INSERT OR UPDATE ON public.billing_checkout_attempts FOR EACH ROW EXECUTE FUNCTION private.report_promotion_checkout_started();


--

-- Name: billing_orders report_promotion_launch_paid; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER report_promotion_launch_paid AFTER INSERT OR UPDATE ON public.billing_orders FOR EACH ROW EXECUTE FUNCTION private.report_promotion_mark_launch();


--

-- Name: billing_checkout_attempts retain_checkout_binding; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER retain_checkout_binding AFTER INSERT OR UPDATE ON public.billing_checkout_attempts FOR EACH ROW EXECUTE FUNCTION private.retain_checkout_binding();


--

-- Name: billing_checkout_compensation_audit billing_checkout_compensation_audit_environment_order_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.billing_checkout_compensation_audit
    ADD CONSTRAINT billing_checkout_compensation_audit_environment_order_id_fkey FOREIGN KEY (environment, order_id) REFERENCES private.billing_checkout_compensations(environment, order_id);


--

-- Name: billing_access_blocks billing_access_blocks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_access_blocks
    ADD CONSTRAINT billing_access_blocks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--

-- Name: billing_access_grants billing_access_grants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_access_grants
    ADD CONSTRAINT billing_access_grants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--

-- Name: billing_checkout_attempts billing_checkout_attempts_internal_account_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_checkout_attempts
    ADD CONSTRAINT billing_checkout_attempts_internal_account_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--

-- Name: billing_checkout_bindings billing_checkout_bindings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_checkout_bindings
    ADD CONSTRAINT billing_checkout_bindings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--

-- Name: billing_commercial_resources billing_commercial_resources_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_commercial_resources
    ADD CONSTRAINT billing_commercial_resources_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--

-- Name: billing_customers billing_customers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_customers
    ADD CONSTRAINT billing_customers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--

-- Name: billing_orders billing_orders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_orders
    ADD CONSTRAINT billing_orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--

-- Name: billing_reconciliation_runs billing_reconciliation_runs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_reconciliation_runs
    ADD CONSTRAINT billing_reconciliation_runs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--

-- Name: billing_refunds billing_refunds_provider_environment_provider_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_refunds
    ADD CONSTRAINT billing_refunds_provider_environment_provider_order_id_fkey FOREIGN KEY (provider, environment, provider_order_id) REFERENCES public.billing_orders(provider, environment, provider_order_id) ON DELETE RESTRICT;


--

-- Name: billing_subscription_recovery_cycles billing_subscription_recovery_cycles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_subscription_recovery_cycles
    ADD CONSTRAINT billing_subscription_recovery_cycles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--

-- Name: billing_subscriptions billing_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_subscriptions
    ADD CONSTRAINT billing_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--

-- Name: billing_webhook_effects billing_webhook_effects_inbox_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_webhook_effects
    ADD CONSTRAINT billing_webhook_effects_inbox_id_fkey FOREIGN KEY (inbox_id) REFERENCES public.billing_webhook_inbox(id) ON DELETE CASCADE;


--

-- Name: billing_webhook_replay_audit billing_webhook_replay_audit_inbox_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_webhook_replay_audit
    ADD CONSTRAINT billing_webhook_replay_audit_inbox_id_fkey FOREIGN KEY (inbox_id) REFERENCES public.billing_webhook_inbox(id) ON DELETE CASCADE;


--

-- Name: license_events license_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.license_events
    ADD CONSTRAINT license_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--

-- Name: license_validations license_validations_license_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.license_validations
    ADD CONSTRAINT license_validations_license_id_fkey FOREIGN KEY (license_id) REFERENCES public.licenses(id) ON DELETE CASCADE;


--

-- Name: license_validations license_validations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.license_validations
    ADD CONSTRAINT license_validations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--

-- Name: billing_checkout_compensation_audit; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.billing_checkout_compensation_audit ENABLE ROW LEVEL SECURITY;

--

-- Name: billing_checkout_compensations; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.billing_checkout_compensations ENABLE ROW LEVEL SECURITY;

--

-- Name: billing_checkout_dispositions; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.billing_checkout_dispositions ENABLE ROW LEVEL SECURITY;

--

-- Name: billing_compensation_policy; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.billing_compensation_policy ENABLE ROW LEVEL SECURITY;

--

-- Name: billing_launch_offers; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.billing_launch_offers ENABLE ROW LEVEL SECURITY;

--

-- Name: billing_owner_alert_inbox; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.billing_owner_alert_inbox ENABLE ROW LEVEL SECURITY;

--

-- Name: billing_owner_notices; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.billing_owner_notices ENABLE ROW LEVEL SECURITY;

--

-- Name: billing_payment_incidents; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.billing_payment_incidents ENABLE ROW LEVEL SECURITY;

--

-- Name: billing_reconciliation_item_failures; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.billing_reconciliation_item_failures ENABLE ROW LEVEL SECURITY;

--

-- Name: web_purchase_erasure_clock; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.web_purchase_erasure_clock ENABLE ROW LEVEL SECURITY;

--

-- Name: web_purchase_erasure_consumer; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.web_purchase_erasure_consumer ENABLE ROW LEVEL SECURITY;

--

-- Name: web_purchase_erasure_events; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.web_purchase_erasure_events ENABLE ROW LEVEL SECURITY;

--

-- Name: web_purchase_erasure_proof_key; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.web_purchase_erasure_proof_key ENABLE ROW LEVEL SECURITY;

--

-- Name: billing_access_blocks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.billing_access_blocks ENABLE ROW LEVEL SECURITY;

--

-- Name: billing_access_grants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.billing_access_grants ENABLE ROW LEVEL SECURITY;

--

-- Name: billing_checkout_attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.billing_checkout_attempts ENABLE ROW LEVEL SECURITY;

--

-- Name: billing_checkout_bindings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.billing_checkout_bindings ENABLE ROW LEVEL SECURITY;

--

-- Name: billing_commercial_resources; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.billing_commercial_resources ENABLE ROW LEVEL SECURITY;

--

-- Name: billing_customers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.billing_customers ENABLE ROW LEVEL SECURITY;

--

-- Name: billing_customers billing_customers_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY billing_customers_select_own ON public.billing_customers FOR SELECT USING ((private.current_account() = user_id));


--

-- Name: billing_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.billing_orders ENABLE ROW LEVEL SECURITY;

--

-- Name: billing_reconciliation_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.billing_reconciliation_runs ENABLE ROW LEVEL SECURITY;

--

-- Name: billing_refunds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.billing_refunds ENABLE ROW LEVEL SECURITY;

--

-- Name: billing_subscription_recovery_cycles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.billing_subscription_recovery_cycles ENABLE ROW LEVEL SECURITY;

--

-- Name: billing_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY;

--

-- Name: billing_subscriptions billing_subscriptions_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY billing_subscriptions_select_own ON public.billing_subscriptions FOR SELECT USING ((private.current_account() = user_id));


--

-- Name: billing_webhook_effects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.billing_webhook_effects ENABLE ROW LEVEL SECURITY;

--

-- Name: billing_webhook_inbox; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.billing_webhook_inbox ENABLE ROW LEVEL SECURITY;

--

-- Name: billing_webhook_replay_audit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.billing_webhook_replay_audit ENABLE ROW LEVEL SECURITY;

--

-- Name: license_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.license_events ENABLE ROW LEVEL SECURITY;

--

-- Name: license_events license_events_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY license_events_select_own ON public.license_events FOR SELECT USING (((private.current_account() = user_id) AND (created_at > (now() - '30 days'::interval))));


--

-- Name: license_validations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.license_validations ENABLE ROW LEVEL SECURITY;

--

-- Name: license_validations license_validations_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY license_validations_select_own ON public.license_validations FOR SELECT USING ((private.current_account() = user_id));


--

-- Name: FUNCTION billing_creator_renewal_prepare_before_1593(p_environment text, p_user uuid, p_checkout text, p_subscription text, p_order text, p_product uuid, p_key text, p_initial_discount uuid, p_creator_savings integer); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.billing_creator_renewal_prepare_before_1593(p_environment text, p_user uuid, p_checkout text, p_subscription text, p_order text, p_product uuid, p_key text, p_initial_discount uuid, p_creator_savings integer) FROM PUBLIC;


--

-- Name: FUNCTION billing_creator_revocation_before_1593(p_stage text, p_environment text, p_user uuid, p_subscription text, p_order text, p_reason text, p_token uuid, p_success boolean); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.billing_creator_revocation_before_1593(p_stage text, p_environment text, p_user uuid, p_subscription text, p_order text, p_reason text, p_token uuid, p_success boolean) FROM PUBLIC;


--

-- Name: FUNCTION billing_deleted_event(p_provider text, p_environment text, p_type text, p_payload jsonb, p_hash text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.billing_deleted_event(p_provider text, p_environment text, p_type text, p_payload jsonb, p_hash text) FROM PUBLIC;


--

-- Name: FUNCTION billing_event_accounts(p_provider text, p_environment text, p_type text, p_payload jsonb); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.billing_event_accounts(p_provider text, p_environment text, p_type text, p_payload jsonb) FROM PUBLIC;


--

-- Name: FUNCTION billing_launch_checkout_before_1593_guard(p_account uuid, p_environment text, p_product text, p_discount text, p_key text, p_now timestamp with time zone, p_attempt uuid, p_replaces uuid); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.billing_launch_checkout_before_1593_guard(p_account uuid, p_environment text, p_product text, p_discount text, p_key text, p_now timestamp with time zone, p_attempt uuid, p_replaces uuid) FROM PUBLIC;


--

-- Name: FUNCTION billing_set_report_candidate_before_1593(p_environment text, p_user uuid, p_subscription text, p_discount uuid, p_savings integer, p_valid_until timestamp with time zone); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.billing_set_report_candidate_before_1593(p_environment text, p_user uuid, p_subscription text, p_discount uuid, p_savings integer, p_valid_until timestamp with time zone) FROM PUBLIC;


--

-- Name: FUNCTION checkout_was_fulfilled(p_environment text, p_order uuid, p_checkout uuid, p_product uuid, p_subscription uuid, p_capabilities text[]); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.checkout_was_fulfilled(p_environment text, p_order uuid, p_checkout uuid, p_product uuid, p_subscription uuid, p_capabilities text[]) FROM PUBLIC;


--

-- Name: FUNCTION billing_admit_lifetime_order(p_user_id uuid, p_environment text, p_checkout_key text, p_order_id text, p_product_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_admit_lifetime_order(p_user_id uuid, p_environment text, p_checkout_key text, p_order_id text, p_product_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_admit_lifetime_order(p_user_id uuid, p_environment text, p_checkout_key text, p_order_id text, p_product_id text) TO service_role;


--

-- Name: FUNCTION billing_apply_reconciliation_plan(p_user_id uuid, p_environment text, p_trigger_kind text, p_snapshot_hash text, p_plan_hash text, p_observed_at timestamp with time zone, p_operations jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_apply_reconciliation_plan(p_user_id uuid, p_environment text, p_trigger_kind text, p_snapshot_hash text, p_plan_hash text, p_observed_at timestamp with time zone, p_operations jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_apply_reconciliation_plan(p_user_id uuid, p_environment text, p_trigger_kind text, p_snapshot_hash text, p_plan_hash text, p_observed_at timestamp with time zone, p_operations jsonb) TO service_role;


--

-- Name: FUNCTION billing_apply_resource_snapshot(p_provider text, p_environment text, p_resource_type text, p_resource_id text, p_user_id uuid, p_modified_at timestamp with time zone, p_snapshot_hash text, p_state text, p_grants jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_apply_resource_snapshot(p_provider text, p_environment text, p_resource_type text, p_resource_id text, p_user_id uuid, p_modified_at timestamp with time zone, p_snapshot_hash text, p_state text, p_grants jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_apply_resource_snapshot(p_provider text, p_environment text, p_resource_type text, p_resource_id text, p_user_id uuid, p_modified_at timestamp with time zone, p_snapshot_hash text, p_state text, p_grants jsonb) TO service_role;


--

-- Name: FUNCTION billing_apply_subscription_lifecycle(p_user_id uuid, p_environment text, p_subscription_id text, p_product_id text, p_status text, p_period_start timestamp with time zone, p_remote_period_end timestamp with time zone, p_paid_through timestamp with time zone, p_cancel_at_period_end boolean, p_modified_at timestamp with time zone, p_snapshot_hash text, p_recovery_action text, p_failure_at timestamp with time zone, p_cycle_paid_through timestamp with time zone, p_evaluated_at timestamp with time zone, p_capabilities text[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_apply_subscription_lifecycle(p_user_id uuid, p_environment text, p_subscription_id text, p_product_id text, p_status text, p_period_start timestamp with time zone, p_remote_period_end timestamp with time zone, p_paid_through timestamp with time zone, p_cancel_at_period_end boolean, p_modified_at timestamp with time zone, p_snapshot_hash text, p_recovery_action text, p_failure_at timestamp with time zone, p_cycle_paid_through timestamp with time zone, p_evaluated_at timestamp with time zone, p_capabilities text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_apply_subscription_lifecycle(p_user_id uuid, p_environment text, p_subscription_id text, p_product_id text, p_status text, p_period_start timestamp with time zone, p_remote_period_end timestamp with time zone, p_paid_through timestamp with time zone, p_cancel_at_period_end boolean, p_modified_at timestamp with time zone, p_snapshot_hash text, p_recovery_action text, p_failure_at timestamp with time zone, p_cycle_paid_through timestamp with time zone, p_evaluated_at timestamp with time zone, p_capabilities text[]) TO service_role;


--

-- Name: FUNCTION billing_begin_checkout_request(p_user_id uuid, p_attempt_id uuid, p_product_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_begin_checkout_request(p_user_id uuid, p_attempt_id uuid, p_product_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_begin_checkout_request(p_user_id uuid, p_attempt_id uuid, p_product_id uuid) TO service_role;


--

-- Name: FUNCTION billing_checkout_incident(p_environment text, p_correlation text, p_code text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_checkout_incident(p_environment text, p_correlation text, p_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_checkout_incident(p_environment text, p_correlation text, p_code text) TO service_role;


--

-- Name: FUNCTION billing_checkout_maintenance(p_environment text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_checkout_maintenance(p_environment text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_checkout_maintenance(p_environment text) TO service_role;


--

-- Name: FUNCTION billing_checkout_owner_alerts(p_environment text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_checkout_owner_alerts(p_environment text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_checkout_owner_alerts(p_environment text) TO service_role;


--

-- Name: FUNCTION billing_claim_checkout_compensation(p_environment text, p_token uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_claim_checkout_compensation(p_environment text, p_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_claim_checkout_compensation(p_environment text, p_token uuid) TO service_role;


--

-- Name: FUNCTION billing_claim_webhook(p_inbox_id uuid, p_lease_token uuid, p_lease_seconds integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_claim_webhook(p_inbox_id uuid, p_lease_token uuid, p_lease_seconds integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_claim_webhook(p_inbox_id uuid, p_lease_token uuid, p_lease_seconds integer) TO service_role;


--

-- Name: FUNCTION billing_claim_webhook_effect(p_inbox_id uuid, p_effect_key text, p_lease_token uuid, p_lease_seconds integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_claim_webhook_effect(p_inbox_id uuid, p_effect_key text, p_lease_token uuid, p_lease_seconds integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_claim_webhook_effect(p_inbox_id uuid, p_effect_key text, p_lease_token uuid, p_lease_seconds integer) TO service_role;


--

-- Name: FUNCTION billing_complete_founders_transition(p_environment text, p_subscription_id text, p_revision timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_complete_founders_transition(p_environment text, p_subscription_id text, p_revision timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_complete_founders_transition(p_environment text, p_subscription_id text, p_revision timestamp with time zone) TO service_role;


--

-- Name: FUNCTION billing_complete_webhook(p_inbox_id uuid, p_lease_token uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_complete_webhook(p_inbox_id uuid, p_lease_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_complete_webhook(p_inbox_id uuid, p_lease_token uuid) TO service_role;


--

-- Name: FUNCTION billing_complete_webhook_effect(p_inbox_id uuid, p_effect_key text, p_lease_token uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_complete_webhook_effect(p_inbox_id uuid, p_effect_key text, p_lease_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_complete_webhook_effect(p_inbox_id uuid, p_effect_key text, p_lease_token uuid) TO service_role;


--

-- Name: FUNCTION billing_creator_renewal_authorized(p_environment text, p_subscription text, p_token uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_creator_renewal_authorized(p_environment text, p_subscription text, p_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_creator_renewal_authorized(p_environment text, p_subscription text, p_token uuid) TO service_role;


--

-- Name: FUNCTION billing_creator_renewal_finish(p_environment text, p_subscription text, p_token uuid, p_success boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_creator_renewal_finish(p_environment text, p_subscription text, p_token uuid, p_success boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_creator_renewal_finish(p_environment text, p_subscription text, p_token uuid, p_success boolean) TO service_role;


--

-- Name: FUNCTION billing_creator_renewal_prepare(p_environment text, p_user uuid, p_checkout text, p_subscription text, p_order text, p_product uuid, p_key text, p_initial_discount uuid, p_creator_savings integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_creator_renewal_prepare(p_environment text, p_user uuid, p_checkout text, p_subscription text, p_order text, p_product uuid, p_key text, p_initial_discount uuid, p_creator_savings integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_creator_renewal_prepare(p_environment text, p_user uuid, p_checkout text, p_subscription text, p_order text, p_product uuid, p_key text, p_initial_discount uuid, p_creator_savings integer) TO service_role;


--

-- Name: FUNCTION billing_creator_revocation(p_stage text, p_environment text, p_user uuid, p_subscription text, p_order text, p_reason text, p_token uuid, p_success boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_creator_revocation(p_stage text, p_environment text, p_user uuid, p_subscription text, p_order text, p_reason text, p_token uuid, p_success boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_creator_revocation(p_stage text, p_environment text, p_user uuid, p_subscription text, p_order text, p_reason text, p_token uuid, p_success boolean) TO service_role;


--

-- Name: FUNCTION billing_expire_published_checkout(p_environment text, p_user_id uuid, p_attempt_id uuid, p_checkout_id text, p_terminal boolean, p_provider_status text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_expire_published_checkout(p_environment text, p_user_id uuid, p_attempt_id uuid, p_checkout_id text, p_terminal boolean, p_provider_status text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_expire_published_checkout(p_environment text, p_user_id uuid, p_attempt_id uuid, p_checkout_id text, p_terminal boolean, p_provider_status text) TO service_role;


--

-- Name: FUNCTION billing_expire_subscription_grants(p_evaluated_at timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_expire_subscription_grants(p_evaluated_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_expire_subscription_grants(p_evaluated_at timestamp with time zone) TO service_role;


--

-- Name: FUNCTION billing_expire_unpublished_checkouts(p_environment text, p_evaluated_at timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_expire_unpublished_checkouts(p_environment text, p_evaluated_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_expire_unpublished_checkouts(p_environment text, p_evaluated_at timestamp with time zone) TO service_role;


--

-- Name: FUNCTION billing_fail_webhook(p_inbox_id uuid, p_lease_token uuid, p_error_code text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_fail_webhook(p_inbox_id uuid, p_lease_token uuid, p_error_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_fail_webhook(p_inbox_id uuid, p_lease_token uuid, p_error_code text) TO service_role;


--

-- Name: FUNCTION billing_fail_webhook_effect(p_inbox_id uuid, p_effect_key text, p_lease_token uuid, p_error_code text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_fail_webhook_effect(p_inbox_id uuid, p_effect_key text, p_lease_token uuid, p_error_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_fail_webhook_effect(p_inbox_id uuid, p_effect_key text, p_lease_token uuid, p_error_code text) TO service_role;


--

-- Name: FUNCTION billing_finish_checkout_compensation(p_environment text, p_order_id uuid, p_token uuid, p_outcome text, p_refund_id uuid, p_code text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_finish_checkout_compensation(p_environment text, p_order_id uuid, p_token uuid, p_outcome text, p_refund_id uuid, p_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_finish_checkout_compensation(p_environment text, p_order_id uuid, p_token uuid, p_outcome text, p_refund_id uuid, p_code text) TO service_role;


--

-- Name: FUNCTION billing_finish_checkout_owner_alert(p_environment text, p_order_id uuid, p_delivered boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_finish_checkout_owner_alert(p_environment text, p_order_id uuid, p_delivered boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_finish_checkout_owner_alert(p_environment text, p_order_id uuid, p_delivered boolean) TO service_role;


--

-- Name: FUNCTION billing_finish_operational_owner_alert(p_environment text, p_order_id uuid, p_kind text, p_delivered boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_finish_operational_owner_alert(p_environment text, p_order_id uuid, p_kind text, p_delivered boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_finish_operational_owner_alert(p_environment text, p_order_id uuid, p_kind text, p_delivered boolean) TO service_role;


--

-- Name: FUNCTION billing_founders_payment_allowed(p_environment text, p_paid_at timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_founders_payment_allowed(p_environment text, p_paid_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_founders_payment_allowed(p_environment text, p_paid_at timestamp with time zone) TO service_role;


--

-- Name: FUNCTION billing_founders_subscription_transitions(p_environment text, p_order_id text, p_user_id uuid, p_subscription_id text, p_revision timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_founders_subscription_transitions(p_environment text, p_order_id text, p_user_id uuid, p_subscription_id text, p_revision timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_founders_subscription_transitions(p_environment text, p_order_id text, p_user_id uuid, p_subscription_id text, p_revision timestamp with time zone) TO service_role;


--

-- Name: FUNCTION billing_launch_checkout(p_account uuid, p_environment text, p_product text, p_discount text, p_key text, p_now timestamp with time zone, p_attempt uuid, p_replaces uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_launch_checkout(p_account uuid, p_environment text, p_product text, p_discount text, p_key text, p_now timestamp with time zone, p_attempt uuid, p_replaces uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_launch_checkout(p_account uuid, p_environment text, p_product text, p_discount text, p_key text, p_now timestamp with time zone, p_attempt uuid, p_replaces uuid) TO service_role;


--

-- Name: FUNCTION billing_observability_snapshot(p_environment text, p_now timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_observability_snapshot(p_environment text, p_now timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_observability_snapshot(p_environment text, p_now timestamp with time zone) TO service_role;


--

-- Name: FUNCTION billing_observe_checkout_payment(p_environment text, p_order_id uuid, p_checkout_id uuid, p_organization_id uuid, p_product_id uuid, p_subscription_id uuid, p_net_amount bigint, p_currency text, p_capabilities text[], p_attempt_id uuid, p_dispatch_token uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_observe_checkout_payment(p_environment text, p_order_id uuid, p_checkout_id uuid, p_organization_id uuid, p_product_id uuid, p_subscription_id uuid, p_net_amount bigint, p_currency text, p_capabilities text[], p_attempt_id uuid, p_dispatch_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_observe_checkout_payment(p_environment text, p_order_id uuid, p_checkout_id uuid, p_organization_id uuid, p_product_id uuid, p_subscription_id uuid, p_net_amount bigint, p_currency text, p_capabilities text[], p_attempt_id uuid, p_dispatch_token uuid) TO service_role;


--

-- Name: FUNCTION billing_observe_checkout_session(p_environment text, p_checkout_id uuid, p_product_id uuid, p_status text, p_attempt_id uuid, p_dispatch_token uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_observe_checkout_session(p_environment text, p_checkout_id uuid, p_product_id uuid, p_status text, p_attempt_id uuid, p_dispatch_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_observe_checkout_session(p_environment text, p_checkout_id uuid, p_product_id uuid, p_status text, p_attempt_id uuid, p_dispatch_token uuid) TO service_role;


--

-- Name: FUNCTION billing_operational_owner_alerts(p_environment text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_operational_owner_alerts(p_environment text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_operational_owner_alerts(p_environment text) TO service_role;


--

-- Name: FUNCTION billing_owner_alert_claim(p_environment text, p_type text, p_id text, p_code text, p_lease uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_owner_alert_claim(p_environment text, p_type text, p_id text, p_code text, p_lease uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_owner_alert_claim(p_environment text, p_type text, p_id text, p_code text, p_lease uuid) TO service_role;


--

-- Name: FUNCTION billing_owner_alert_finish(p_environment text, p_type text, p_id text, p_lease uuid, p_sent boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_owner_alert_finish(p_environment text, p_type text, p_id text, p_lease uuid, p_sent boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_owner_alert_finish(p_environment text, p_type text, p_id text, p_lease uuid, p_sent boolean) TO service_role;


--

-- Name: FUNCTION billing_published_checkouts_to_expire(p_environment text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_published_checkouts_to_expire(p_environment text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_published_checkouts_to_expire(p_environment text) TO service_role;


--

-- Name: FUNCTION billing_purchase_policy(p_user_id uuid, p_environment text, p_checkout_key text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_purchase_policy(p_user_id uuid, p_environment text, p_checkout_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_purchase_policy(p_user_id uuid, p_environment text, p_checkout_key text) TO service_role;


--

-- Name: FUNCTION billing_purge_webhook_payloads(p_processed_before timestamp with time zone, p_quarantined_before timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_purge_webhook_payloads(p_processed_before timestamp with time zone, p_quarantined_before timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_purge_webhook_payloads(p_processed_before timestamp with time zone, p_quarantined_before timestamp with time zone) TO service_role;


--

-- Name: FUNCTION billing_quarantine_webhook(p_inbox_id uuid, p_lease_token uuid, p_reason_code text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_quarantine_webhook(p_inbox_id uuid, p_lease_token uuid, p_reason_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_quarantine_webhook(p_inbox_id uuid, p_lease_token uuid, p_reason_code text) TO service_role;


--

-- Name: FUNCTION billing_receive_webhook(p_provider text, p_provider_event_id text, p_event_type text, p_payload_hash text, p_payload jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_receive_webhook(p_provider text, p_provider_event_id text, p_event_type text, p_payload_hash text, p_payload jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_receive_webhook(p_provider text, p_provider_event_id text, p_event_type text, p_payload_hash text, p_payload jsonb) TO service_role;


--

-- Name: FUNCTION billing_receive_webhook(p_provider text, p_environment text, p_provider_event_id text, p_event_type text, p_payload_hash text, p_payload jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_receive_webhook(p_provider text, p_environment text, p_provider_event_id text, p_event_type text, p_payload_hash text, p_payload jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_receive_webhook(p_provider text, p_environment text, p_provider_event_id text, p_event_type text, p_payload_hash text, p_payload jsonb) TO service_role;


--

-- Name: FUNCTION billing_reconciliation_item_failed(p_environment text, p_resource text, p_item_key text, p_resource_id text, p_now timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_reconciliation_item_failed(p_environment text, p_resource text, p_item_key text, p_resource_id text, p_now timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_reconciliation_item_failed(p_environment text, p_resource text, p_item_key text, p_resource_id text, p_now timestamp with time zone) TO service_role;


--

-- Name: FUNCTION billing_record_dispute_snapshot(p_environment text, p_dispute_id text, p_order_id text, p_blocked boolean, p_modified_at timestamp with time zone, p_snapshot_hash text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_record_dispute_snapshot(p_environment text, p_dispute_id text, p_order_id text, p_blocked boolean, p_modified_at timestamp with time zone, p_snapshot_hash text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_record_dispute_snapshot(p_environment text, p_dispute_id text, p_order_id text, p_blocked boolean, p_modified_at timestamp with time zone, p_snapshot_hash text) TO service_role;


--

-- Name: FUNCTION billing_record_order_snapshot(p_environment text, p_order_id text, p_user_id uuid, p_product_id text, p_checkout_id text, p_status text, p_paid boolean, p_net_amount bigint, p_currency text, p_reported_refunded_amount bigint, p_modified_at timestamp with time zone, p_snapshot_hash text, p_subscription_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_record_order_snapshot(p_environment text, p_order_id text, p_user_id uuid, p_product_id text, p_checkout_id text, p_status text, p_paid boolean, p_net_amount bigint, p_currency text, p_reported_refunded_amount bigint, p_modified_at timestamp with time zone, p_snapshot_hash text, p_subscription_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_record_order_snapshot(p_environment text, p_order_id text, p_user_id uuid, p_product_id text, p_checkout_id text, p_status text, p_paid boolean, p_net_amount bigint, p_currency text, p_reported_refunded_amount bigint, p_modified_at timestamp with time zone, p_snapshot_hash text, p_subscription_id text) TO service_role;


--

-- Name: FUNCTION billing_record_refund_snapshot(p_environment text, p_refund_id text, p_order_id text, p_payment_id text, p_status text, p_amount bigint, p_currency text, p_modified_at timestamp with time zone, p_snapshot_hash text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_record_refund_snapshot(p_environment text, p_refund_id text, p_order_id text, p_payment_id text, p_status text, p_amount bigint, p_currency text, p_modified_at timestamp with time zone, p_snapshot_hash text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_record_refund_snapshot(p_environment text, p_refund_id text, p_order_id text, p_payment_id text, p_status text, p_amount bigint, p_currency text, p_modified_at timestamp with time zone, p_snapshot_hash text) TO service_role;


--

-- Name: FUNCTION billing_refresh_entitlement_read_model(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_refresh_entitlement_read_model(p_user_id uuid) FROM PUBLIC;


--

-- Name: FUNCTION billing_refresh_entitlement_read_model_at(p_user_id uuid, p_evaluated_at timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_refresh_entitlement_read_model_at(p_user_id uuid, p_evaluated_at timestamp with time zone) FROM PUBLIC;


--

-- Name: FUNCTION billing_reject_checkout_request(p_user_id uuid, p_attempt_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_reject_checkout_request(p_user_id uuid, p_attempt_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_reject_checkout_request(p_user_id uuid, p_attempt_id uuid) TO service_role;


--

-- Name: FUNCTION billing_replay_webhook(p_inbox_id uuid, p_actor_id text, p_reason_code text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_replay_webhook(p_inbox_id uuid, p_actor_id text, p_reason_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_replay_webhook(p_inbox_id uuid, p_actor_id text, p_reason_code text) TO service_role;


--

-- Name: FUNCTION billing_resolve_checkout_non_applicable(p_environment text, p_order_id uuid, p_reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_resolve_checkout_non_applicable(p_environment text, p_order_id uuid, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_resolve_checkout_non_applicable(p_environment text, p_order_id uuid, p_reason text) TO service_role;


--

-- Name: FUNCTION billing_save_creator_attribution(p_user uuid, p_environment text, p_attempt uuid, p_code text, p_discount uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_save_creator_attribution(p_user uuid, p_environment text, p_attempt uuid, p_code text, p_discount uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_save_creator_attribution(p_user uuid, p_environment text, p_attempt uuid, p_code text, p_discount uuid) TO service_role;


--

-- Name: FUNCTION billing_set_report_renewal_candidate(p_environment text, p_user uuid, p_subscription text, p_discount uuid, p_savings integer, p_valid_until timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_set_report_renewal_candidate(p_environment text, p_user uuid, p_subscription text, p_discount uuid, p_savings integer, p_valid_until timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_set_report_renewal_candidate(p_environment text, p_user uuid, p_subscription text, p_discount uuid, p_savings integer, p_valid_until timestamp with time zone) TO service_role;


--

-- Name: FUNCTION billing_sync_order_access(p_environment text, p_order_id text, p_capabilities jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_sync_order_access(p_environment text, p_order_id text, p_capabilities jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_sync_order_access(p_environment text, p_order_id text, p_capabilities jsonb) TO service_role;


--

-- Name: FUNCTION web_purchase_attempt_states(p_keys jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.web_purchase_attempt_states(p_keys jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.web_purchase_attempt_states(p_keys jsonb) TO web_purchase_erasure;


--

-- Name: FUNCTION web_purchase_erasure_ack(p_from_cursor bigint, p_to_cursor bigint, p_count integer, p_environment text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.web_purchase_erasure_ack(p_from_cursor bigint, p_to_cursor bigint, p_count integer, p_environment text) FROM PUBLIC;


--

-- Name: FUNCTION web_purchase_erasure_ack(p_from_cursor bigint, p_to_cursor bigint, p_count integer, p_environment text, p_erasure_digest text, p_remaining_rows integer, p_receipt text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.web_purchase_erasure_ack(p_from_cursor bigint, p_to_cursor bigint, p_count integer, p_environment text, p_erasure_digest text, p_remaining_rows integer, p_receipt text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.web_purchase_erasure_ack(p_from_cursor bigint, p_to_cursor bigint, p_count integer, p_environment text, p_erasure_digest text, p_remaining_rows integer, p_receipt text) TO web_purchase_erasure;


--

-- Name: FUNCTION web_purchase_erasure_failed(p_code text, p_environment text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.web_purchase_erasure_failed(p_code text, p_environment text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.web_purchase_erasure_failed(p_code text, p_environment text) TO web_purchase_erasure;


--

-- Name: FUNCTION web_purchase_erasure_pull(p_limit integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.web_purchase_erasure_pull(p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.web_purchase_erasure_pull(p_limit integer) TO web_purchase_erasure;


--

-- Name: TABLE billing_access_blocks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.billing_access_blocks TO service_role;


--

-- Name: TABLE billing_access_grants; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.billing_access_grants TO service_role;


--

-- Name: TABLE billing_checkout_attempts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.billing_checkout_attempts TO service_role;


--

-- Name: TABLE billing_checkout_bindings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.billing_checkout_bindings TO service_role;


--

-- Name: TABLE billing_commercial_resources; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.billing_commercial_resources TO service_role;


--

-- Name: TABLE billing_customers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.billing_customers TO service_role;


--

-- Name: TABLE billing_effective_access_grants; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.billing_effective_access_grants TO service_role;


--

-- Name: TABLE billing_orders; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.billing_orders TO service_role;


--

-- Name: TABLE billing_reconciliation_runs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.billing_reconciliation_runs TO service_role;


--

-- Name: TABLE billing_refunds; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.billing_refunds TO service_role;


--

-- Name: TABLE billing_subscription_recovery_cycles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.billing_subscription_recovery_cycles TO service_role;


--

-- Name: TABLE billing_subscriptions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.billing_subscriptions TO service_role;


--

-- Name: TABLE billing_webhook_effects; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.billing_webhook_effects TO service_role;


--

-- Name: TABLE billing_webhook_inbox; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.billing_webhook_inbox TO service_role;


--

-- Name: TABLE billing_webhook_replay_audit; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.billing_webhook_replay_audit TO service_role;


--

-- Name: TABLE license_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.license_events TO service_role;


--

-- Name: TABLE license_validations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.license_validations TO service_role;


--

-- Catalog: private.billing_compensation_policy (2 rows)
-- {"amount_basis": null, "enabled": false, "environment": "production"}
-- {"amount_basis": null, "enabled": false, "environment": "sandbox"}
