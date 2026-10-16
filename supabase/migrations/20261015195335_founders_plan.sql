-- VANTA-83 / #1661. Public beta opening and one server-owned sales switch.
create table private.founders_sale_config (
  singleton boolean not null default true check(singleton),
  environment text primary key check(environment in ('sandbox','production')),
  opens_at timestamptz not null,
  sales_enabled boolean not null default true,
  subscription_transition text not null default 'end_period'
    check(subscription_transition = 'end_period')
);
insert into private.founders_sale_config values
  (true, 'production', '2026-10-26 19:00 Europe/Madrid', true, 'end_period'),
  (true, 'sandbox', '2026-10-26 19:00 Europe/Madrid', true, 'end_period');
alter table private.founders_sale_config enable row level security;
revoke all on private.founders_sale_config from public, anon, authenticated, service_role;

create function public.founders_sale_window(p_environment text default 'production') returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('opens_at',opens_at,'sales_enabled',sales_enabled,
   'available',sales_enabled and now()>=opens_at,'amount_cents',5000,'currency','eur')
 from private.founders_sale_config where environment=p_environment
$$;
revoke all on function public.founders_sale_window(text) from public;
grant execute on function public.founders_sale_window(text) to anon,authenticated,service_role;

create function public.billing_founders_payment_allowed(p_environment text,p_paid_at timestamptz) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select sales_enabled and p_paid_at>=opens_at
 from private.founders_sale_config where environment=p_environment),false)
$$;
revoke all on function public.billing_founders_payment_allowed(text,timestamptz) from public,anon,authenticated;
grant execute on function public.billing_founders_payment_allowed(text,timestamptz) to service_role;

create table private.lifetime_order_admissions (
 environment text not null check(environment in ('sandbox','production')),
 order_id text not null, account_id uuid not null, checkout_key text not null check(checkout_key='founders'),
 product_id text not null, created_at timestamptz not null default now(),
 primary key(environment,order_id),unique(environment,account_id)
);
alter table private.lifetime_order_admissions enable row level security;
revoke all on private.lifetime_order_admissions from public,anon,authenticated,service_role;
create table private.billing_payment_incidents (
 environment text not null check(environment in ('sandbox','production')),
 account_id uuid not null, resource_id text not null, reason text not null,
 severity text not null default 'critical' check(severity='critical'),
 created_at timestamptz not null default now(),
 primary key(environment,resource_id,reason)
);
create index billing_payment_incidents_account on private.billing_payment_incidents(environment,account_id,created_at desc);
alter table private.billing_payment_incidents enable row level security;
revoke all on private.billing_payment_incidents from public,anon,authenticated,service_role;

create function public.billing_admit_lifetime_order(p_user_id uuid,p_environment text,p_checkout_key text,p_order_id text,p_product_id text)
returns text language plpgsql security definer set search_path='' as $$
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
revoke all on function public.billing_admit_lifetime_order(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.billing_admit_lifetime_order(uuid,text,text,text,text) to service_role;

create function public.billing_purchase_policy(p_user_id uuid,p_environment text,p_checkout_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
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
 return new;
end $$;
revoke all on function private.guard_founders_checkout() from public,anon,authenticated,service_role;
create trigger guard_founders_checkout before insert on public.billing_checkout_attempts
 for each row execute function private.guard_founders_checkout();

-- Durable, idempotent transition receipt. No entitlement depends on Polar responding.
create table private.founders_subscription_transitions (
 environment text not null check(environment in ('sandbox','production')),
 subscription_id text not null,
 account_id uuid not null,
 founders_order_id text not null,
 policy text not null check(policy = 'end_period'),
 state text not null check(state in ('pending','completed')),
 paid_period_end timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 last_reactivation_at timestamptz,
 primary key(environment,subscription_id)
);
alter table private.founders_subscription_transitions enable row level security;
revoke all on private.founders_subscription_transitions from public,anon,authenticated,service_role;

create function public.billing_founders_subscription_transitions(p_environment text,p_order_id text,p_user_id uuid default null,p_subscription_id text default null,p_revision timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
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
revoke all on function public.billing_founders_subscription_transitions(text,text,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.billing_founders_subscription_transitions(text,text,uuid,text,timestamptz) to service_role;

create function public.billing_complete_founders_transition(p_environment text,p_subscription_id text,p_revision timestamptz default null)
returns void language sql security definer set search_path='' as $$
 update private.founders_subscription_transitions set state='completed',updated_at=now()
 where environment=p_environment and subscription_id=p_subscription_id and state='pending'
 and last_reactivation_at is not distinct from p_revision
$$;
revoke all on function public.billing_complete_founders_transition(text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.billing_complete_founders_transition(text,text,timestamptz) to service_role;

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
  'billing_incidents',coalesce((select jsonb_agg(jsonb_build_object('resource_id',i.resource_id,'reason',i.reason,'severity',i.severity) order by i.created_at desc) from private.billing_payment_incidents i where i.account_id=p_account and i.environment=p_environment),'[]'::jsonb),
  'founders_transitions',coalesce((select jsonb_agg(jsonb_build_object('subscription_id',t.subscription_id,'policy',t.policy,'state',t.state,'paid_period_end',t.paid_period_end) order by t.created_at desc) from private.founders_subscription_transitions t where t.account_id=p_account and t.environment=p_environment),'[]'::jsonb),
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
