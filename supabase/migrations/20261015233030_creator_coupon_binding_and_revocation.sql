-- VANTA-83 R5 / F1,F3. Bind both intervals to the creator, retire discounts after refunds.
alter table private.admin_creators add column annual_discount_id uuid;
create unique index admin_creator_annual_coupon on private.admin_creators(environment,annual_discount_id) where annual_discount_id is not null;

-- Preserve all existing Owner/B03 checks; only bind the second verified Polar coupon.
alter function public.native_admin_execute(uuid,text,text,jsonb,text) rename to native_admin_execute_before_creator_coupon;
alter function public.native_admin_execute_before_creator_coupon(uuid,text,text,jsonb,text) set schema private;
revoke all on function private.native_admin_execute_before_creator_coupon(uuid,text,text,jsonb,text) from public,anon,authenticated,service_role;
create function public.native_admin_execute(p_actor uuid,p_issuer text,p_action text,p_params jsonb,p_environment text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb; v_monthly uuid; v_annual uuid;
begin
 if p_action='activate_creator' and p_params ? 'annual_discount_id' then
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_environment||':creator-coupons',0));
  v_monthly:=(p_params->>'discount_id')::uuid; v_annual:=(p_params->>'annual_discount_id')::uuid;
  if v_monthly is null or v_annual is null or v_monthly=v_annual or v_monthly='00000000-0000-0000-0000-000000000000'::uuid or v_annual='00000000-0000-0000-0000-000000000000'::uuid then raise exception 'creator_coupon_mismatch'; end if;
  if exists(select 1 from private.admin_creators where environment=p_environment and creator_id<>(p_params->>'creator_id')::uuid and (discount_id in(v_monthly::text,v_annual::text) or annual_discount_id in(v_monthly,v_annual))) then raise exception 'creator_coupon_mismatch'; end if;
  if exists(select 1 from private.admin_creators where environment=p_environment and creator_id=(p_params->>'creator_id')::uuid and annual_discount_id is not null and annual_discount_id<>v_annual) then raise exception 'creator_coupon_mismatch'; end if;
  v_result:=private.native_admin_execute_before_creator_coupon(p_actor,p_issuer,p_action,p_params,p_environment);
  update private.admin_creators set annual_discount_id=v_annual where creator_id=(p_params->>'creator_id')::uuid and environment=p_environment and discount_id=v_monthly::text;
  if not found then raise exception 'creator_coupon_mismatch'; end if;
  return v_result;
 end if;
 return private.native_admin_execute_before_creator_coupon(p_actor,p_issuer,p_action,p_params,p_environment);
end $$;
revoke all on function public.native_admin_execute(uuid,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.native_admin_execute(uuid,text,text,jsonb,text) to service_role;
alter function public.native_admin_execute(uuid,text,text,jsonb,text) owner to postgres;

create or replace function public.billing_save_creator_attribution(p_user uuid,p_environment text,p_attempt uuid,p_code text,p_discount uuid)
returns boolean language plpgsql security definer set search_path='' as $$
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


alter table private.creator_renewal_operations add column revocation_requested_at timestamptz,
 add column revocation_completed_at timestamptz,add column revocation_reason text;
create table private.creator_subscription_revocations (
 environment text not null check(environment in ('sandbox','production')),subscription_id text not null,
 account_id uuid not null,reason text not null check(reason in ('refund','subscription_revoked')),created_at timestamptz not null default now(),primary key(environment,subscription_id)
);
alter table private.creator_subscription_revocations enable row level security;
revoke all on private.creator_subscription_revocations from public,anon,authenticated,service_role;

create or replace function public.billing_creator_renewal_prepare(p_environment text,p_user uuid,p_checkout text,p_subscription text,p_order text,p_product uuid,p_key text,p_initial_discount uuid,p_creator_savings integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_attr private.creator_checkout_attributions%rowtype; v_op private.creator_renewal_operations%rowtype; v_report private.report_renewal_candidates%rowtype; v_token uuid;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,0));
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

create or replace function public.billing_creator_renewal_finish(p_environment text,p_subscription text,p_token uuid,p_success boolean)
returns boolean language plpgsql security definer set search_path='' as $$
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

create or replace function public.billing_creator_renewal_authorized(p_environment text,p_subscription text,p_token uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.creator_renewal_operations op join public.profiles p on p.id=op.account_id
 where op.environment=p_environment and op.subscription_id=p_subscription and op.lease_token=p_token and op.lease_until>now() and op.state='pending' and op.revocation_requested_at is null and not exists(select 1 from private.creator_subscription_revocations where environment=p_environment and subscription_id=p_subscription)
 and not exists(select 1 from public.account_identities where account_id=op.account_id and deleted_at is not null)
 and exists(select 1 from public.billing_orders where environment=op.environment and provider_order_id=op.first_order_id and paid and reported_refunded_amount=0 and not exists(select 1 from public.billing_orders prior_order where prior_order.environment=p_environment and prior_order.provider_subscription_id=p_subscription and (prior_order.reported_refunded_amount>0 or exists(select 1 from public.billing_refunds refund where refund.environment=p_environment and refund.provider_order_id=prior_order.provider_order_id and refund.status='succeeded' and refund.amount>0))))
 and not exists(select 1 from public.billing_effective_access_grants where environment=op.environment and user_id=op.account_id and capability='vantare.plan.founders' and status='active'))
$$;

-- One leased operation; stages share the same account/subscription and fencing token.
create function public.billing_creator_revocation(p_stage text,p_environment text,p_user uuid,p_subscription text,p_order text default null,p_reason text default null,p_token uuid default null,p_success boolean default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_op private.creator_renewal_operations%rowtype; v_token uuid;
begin
 if p_stage not in ('prepare','authorize','finish') or p_environment not in ('sandbox','production') then raise exception 'creator_revocation_invalid'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,0));
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
revoke all on function public.billing_creator_revocation(text,text,uuid,text,text,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.billing_creator_revocation(text,text,uuid,text,text,text,uuid,boolean) to service_role;
alter function public.billing_creator_revocation(text,text,uuid,text,text,text,uuid,boolean) owner to postgres;
