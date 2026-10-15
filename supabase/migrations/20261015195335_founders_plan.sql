-- VANTA-83 / #1661. One sale window for every client; no Polar side effects.
create table private.founders_sale_config (
  singleton boolean primary key default true check(singleton),
  opens_at timestamptz not null,
  closes_at timestamptz not null check(closes_at > opens_at)
);
insert into private.founders_sale_config values
  (true, '2026-10-26 19:00 Europe/Madrid', '2026-11-26 19:00 Europe/Madrid');
alter table private.founders_sale_config enable row level security;
revoke all on private.founders_sale_config from public, anon, authenticated, service_role;

create function public.founders_sale_window() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('opens_at',opens_at,'closes_at',closes_at,
   'available',now()>=opens_at and now()<closes_at,'amount_cents',5000,'currency','eur')
 from private.founders_sale_config where singleton
$$;
revoke all on function public.founders_sale_window() from public;
grant execute on function public.founders_sale_window() to anon,authenticated,service_role;

create function public.billing_founders_payment_allowed(p_paid_at timestamptz) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select p_paid_at>=opens_at and p_paid_at<closes_at
 from private.founders_sale_config where singleton),false)
$$;
revoke all on function public.billing_founders_payment_allowed(timestamptz) from public,anon,authenticated;
grant execute on function public.billing_founders_payment_allowed(timestamptz) to service_role;

create function public.billing_purchase_policy(p_user_id uuid,p_environment text,p_checkout_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_reason text; v_config private.founders_sale_config%rowtype;
begin
 if p_environment not in ('sandbox','production') or p_checkout_key not in
 ('founders','launch_lifetime','pro_monthly','pro_annual','pro_plus_monthly','pro_plus_annual')
 then raise exception 'invalid_purchase_policy'; end if;
 select * into strict v_config from private.founders_sale_config where singleton;
 if not exists(select 1 from public.profiles where id=p_user_id) or
   exists(select 1 from public.account_identities where account_id=p_user_id and deleted_at is not null) then
   v_reason:='account_unavailable';
 elsif exists(select 1 from private.admin_account_blocks where account_id=p_user_id and blocked) then
   v_reason:='account_unavailable';
 elsif exists(select 1 from public.billing_effective_access_grants where user_id=p_user_id
   and environment=p_environment and capability='vantare.plan.founders'
   and status='active' and valid_until is null) then
   v_reason:='founders_already_owned';
 elsif p_checkout_key='founders' then
   if now()<v_config.opens_at or now()>=v_config.closes_at then
     v_reason:='founders_sale_closed';
   elsif exists(select 1 from public.billing_subscriptions where user_id=p_user_id
     and environment=p_environment and (status in ('active','trialing','past_due','unpaid')
       or current_period_end>now())) then
     -- Includes scheduled cancellation until the paid period ends. Never cancel automatically.
     v_reason:='founders_subscription_active';
   end if;
 end if;
 return jsonb_build_object('reason',v_reason,'closes_at',v_config.closes_at);
end $$;
revoke all on function public.billing_purchase_policy(uuid,text,text) from public,anon,authenticated;
grant execute on function public.billing_purchase_policy(uuid,text,text) to service_role;

alter table public.billing_checkout_attempts drop constraint billing_checkout_attempts_checkout_key_check;
alter table public.billing_checkout_attempts add constraint billing_checkout_attempts_checkout_key_check
 check(checkout_key in ('founders','launch_lifetime','pro_monthly','pro_annual','pro_plus_monthly','pro_plus_annual'));

-- The claim itself rechecks policy and serializes simultaneous Founders attempts per account.
create function private.guard_founders_checkout() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_reason text;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text||':billing',0));
 v_reason:=public.billing_purchase_policy(new.user_id,new.environment,new.checkout_key)->>'reason';
 if v_reason is not null then raise exception '%',v_reason; end if;
 if exists(select 1 from public.billing_checkout_attempts
   where user_id=new.user_id and environment=new.environment
   and (new.checkout_key='founders' or checkout_key='founders')
   and attempt_id<>new.attempt_id and expires_at>now()) then
   raise exception 'founders_checkout_pending';
 end if;
 if new.checkout_key='founders' then
   new.expires_at:=least(new.expires_at,(select closes_at from private.founders_sale_config where singleton));
 end if;
 return new;
end $$;
revoke all on function private.guard_founders_checkout() from public,anon,authenticated,service_role;
create trigger guard_founders_checkout before insert on public.billing_checkout_attempts
 for each row execute function private.guard_founders_checkout();

-- Preserve the existing Owner-only composition, projecting a distinct plan and all modules.
create or replace function private.native_admin_account_summary(p_account uuid,p_issuer text,p_environment text) returns jsonb
language sql stable security definer set search_path='' as $$
 with base as(select private.native_admin_account_v1(p_account,p_issuer,p_environment) data),
 grants as(select * from public.billing_effective_access_grants where user_id=p_account and environment=p_environment and status='active' and(valid_until is null or valid_until>now())),
 sub as(select * from public.billing_subscriptions where user_id=p_account and environment=p_environment and provider='polar' and(status in('active','trialing','past_due') or cancel_at_period_end) order by updated_at desc limit 1),
 access as(select r.module,r.enabled_for_all rollout, (select data->'roles'<>'[]'::jsonb from base) role,
  exists(select 1 from grants where capability=r.module and provider='vantare' and source_type='support') individual,
  exists(select 1 from grants where capability in(r.module,'vantare.plan.pro','vantare.plan.founders')) plan from public.module_rollout r)
 select data||jsonb_build_object(
  'owner',exists(select 1 from public.operational_access_assignments a where a.user_id=p_account and a.role='owner' and a.status='active'),
  'blocked',coalesce((select b.blocked from private.admin_account_blocks b where b.account_id=p_account),false),'blocked_reason',(select b.reason from private.admin_account_blocks b where b.account_id=p_account),
  'plan',case when exists(select 1 from grants where capability='vantare.plan.founders') then 'founders' when exists(select 1 from grants where capability='vantare.plan.pro') then case when exists(select 1 from grants where capability='vantare.channel.nightly') then 'pro_plus' else 'pro' end else 'free' end,
  'billing',case when exists(select 1 from grants where capability='vantare.plan.founders') then 'one_time' else (select case when current_period_end-current_period_start>interval '200 days' then 'yearly' else 'monthly' end from sub) end,
  'renews_at',(select current_period_end from sub),
  'modules',coalesce((select jsonb_agg(module order by module) from access where rollout or individual or plan or data->'roles'<>'[]'::jsonb),'[]'::jsonb),
  'module_access',(select jsonb_agg(to_jsonb(access) order by module) from access),
  'reports_count',(select count(*) from public.testing_center_reports where reporter_user_id=p_account)+(select count(*) from public.testing_contributions where account_id=p_account),
  'polar_customer_url',null) from base
$$;
revoke all on function private.native_admin_account_summary(uuid,text,text) from public,anon,authenticated,service_role;

create or replace function private.native_admin_account(p_account uuid,p_issuer text,p_environment text) returns jsonb
language sql stable security definer set search_path='' as $$
 select private.native_admin_account_summary(p_account,p_issuer,p_environment)||jsonb_build_object(
  'creator_code',(select jsonb_build_object('code',c.code,'creator_id',c.creator_id,'creator_name',c.name) from (select p.discount_id from private.admin_payments p where p.account_id=p_account and p.environment=p_environment order by p.paid_at,p.payment_id limit 1) first_payment join private.admin_creators c on c.discount_id=first_payment.discount_id and c.environment=p_environment),
  'payments',coalesce((select jsonb_agg(item order by item->>'paid_at' desc) from private.native_admin_creator_lines(p_environment) where item->>'account_id'=p_account::text),'[]'::jsonb)||coalesce((select jsonb_agg(jsonb_build_object('payment_id',o.provider_order_id,'paid_at',o.created_at,'date_source','recorded_at','amount_basis','net','product',case when exists(select 1 from public.billing_access_grants g where g.user_id=o.user_id and g.environment=o.environment and g.source_type='order' and g.source_id=o.provider_order_id and g.capability='vantare.plan.founders') then 'Founders' else 'Launch Edition' end,'period_index',1,'amount_cents',o.net_amount,'currency',o.currency,'refunded_cents',o.reported_refunded_amount,'status',o.status) order by o.created_at desc) from public.billing_orders o where o.user_id=p_account and o.environment=p_environment and not exists(select 1 from private.admin_payments p where p.environment=p_environment and p.payment_id=o.provider_order_id)),'[]'::jsonb),
  'subscriptions',coalesce((select jsonb_agg(s.provider_subscription_id) from public.billing_subscriptions s where s.user_id=p_account and s.environment=p_environment and s.provider='polar' and(s.status in('active','trialing','past_due') or s.cancel_at_period_end)),'[]'::jsonb))
$$;
revoke all on function private.native_admin_account(uuid,text,text) from public,anon,authenticated,service_role;

-- The compatibility bundle uses the same refund/deletion-aware projection.
do $$
declare definition text;
begin
 definition:=pg_get_functiondef('public.billing_refresh_entitlement_read_model_at(uuid,timestamptz)'::regprocedure);
 definition:=replace(definition,'''vantare.plan.pro'', ''vantare.edition.launch_v1''',
   '''vantare.plan.pro'', ''vantare.edition.launch_v1'', ''vantare.plan.founders''');
 execute definition;
end $$;
