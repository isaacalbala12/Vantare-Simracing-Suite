-- VANTA-83 R4. Attribution is server-owned and independent from invoice discount.
create table private.creator_checkout_attributions (
 environment text not null check(environment in ('sandbox','production')),
 account_id uuid not null, attempt_id uuid not null, creator_id uuid not null,
 code text not null, discount_id uuid not null, created_at timestamptz not null default now(),
 primary key(environment,account_id,attempt_id)
);
create table private.creator_renewal_operations (
 environment text not null check(environment in ('sandbox','production')),
 subscription_id text not null check(length(subscription_id) between 1 and 200),
 account_id uuid not null, creator_id uuid not null, first_order_id text not null,
 product_id uuid not null, checkout_key text not null,
 creator_discount_id uuid not null, initial_discount_id uuid,
 selected_discount_id uuid, not_applied text,
 state text not null default 'pending' check(state in ('pending','completed')),
 lease_token uuid, lease_until timestamptz, completed_at timestamptz,
 primary key(environment,subscription_id)
);
-- Integration boundary for VANTA-39: only its verified server eligibility may publish.
create table private.report_renewal_candidates (
 environment text not null check(environment in ('sandbox','production')),
 subscription_id text not null, account_id uuid not null,
 discount_id uuid not null, savings_cents integer not null check(savings_cents>0),
 valid_until timestamptz not null,
 primary key(environment,subscription_id)
);
alter table private.creator_checkout_attributions enable row level security;
alter table private.creator_renewal_operations enable row level security;
alter table private.report_renewal_candidates enable row level security;
revoke all on private.creator_checkout_attributions,private.creator_renewal_operations,private.report_renewal_candidates from public,anon,authenticated,service_role;

create function public.billing_save_creator_attribution(p_user uuid,p_environment text,p_attempt uuid,p_code text,p_discount uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_creator uuid;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,0));
 if not exists(select 1 from public.profiles where id=p_user) or exists(select 1 from public.account_identities where account_id=p_user and deleted_at is not null) then raise exception 'account_deleted'; end if;
 if not exists(select 1 from public.billing_checkout_attempts where user_id=p_user and attempt_id=p_attempt and environment=p_environment and status='creating' and checkout_key in ('pro_monthly','pro_annual','pro_plus_monthly','pro_plus_annual')) then raise exception 'creator_attempt_invalid'; end if;
 select creator_id into strict v_creator from private.admin_creators where environment=p_environment and code=p_code and status='active';
 insert into private.creator_checkout_attributions values(p_environment,p_user,p_attempt,v_creator,p_code,p_discount,now()) on conflict do nothing;
 return exists(select 1 from private.creator_checkout_attributions where environment=p_environment and account_id=p_user and attempt_id=p_attempt and creator_id=v_creator and discount_id=p_discount and code=p_code);
end $$;

create function public.billing_set_report_renewal_candidate(p_environment text,p_user uuid,p_subscription text,p_discount uuid,p_savings integer,p_valid_until timestamptz)
returns void language plpgsql security definer set search_path='' as $$
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

create function public.billing_creator_renewal_prepare(p_environment text,p_user uuid,p_checkout text,p_subscription text,p_order text,p_product uuid,p_key text,p_initial_discount uuid,p_creator_savings integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_attr private.creator_checkout_attributions%rowtype; v_op private.creator_renewal_operations%rowtype; v_report private.report_renewal_candidates%rowtype; v_token uuid;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,0));
 if not exists(select 1 from public.profiles where id=p_user) or exists(select 1 from public.account_identities where account_id=p_user and deleted_at is not null) then return null; end if;
 select * into v_op from private.creator_renewal_operations where environment=p_environment and subscription_id=p_subscription for update;
 if not found then
  select a.* into v_attr from private.creator_checkout_attributions a join public.billing_checkout_bindings b on b.environment=a.environment and b.user_id=a.account_id and b.attempt_id=a.attempt_id
  where b.environment=p_environment and b.provider_checkout_id=p_checkout and b.user_id=p_user and b.checkout_key=p_key;
  if not found then return null; end if;
  if not exists(select 1 from public.billing_orders where environment=p_environment and provider_order_id=p_order and user_id=p_user and provider_subscription_id=p_subscription and provider_product_id=p_product::text and paid and reported_refunded_amount=0) then raise exception 'creator_first_invoice_unpaid'; end if;
  insert into private.creator_renewal_operations(environment,subscription_id,account_id,creator_id,first_order_id,product_id,checkout_key,creator_discount_id,initial_discount_id)
  values(p_environment,p_subscription,p_user,v_attr.creator_id,p_order,p_product,p_key,v_attr.discount_id,p_initial_discount);
  select * into v_op from private.creator_renewal_operations where environment=p_environment and subscription_id=p_subscription for update;
 end if;
 if v_op.account_id<>p_user or v_op.product_id<>p_product or v_op.checkout_key<>p_key then raise exception 'creator_subscription_conflict'; end if;
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

create function public.billing_creator_renewal_finish(p_environment text,p_subscription text,p_token uuid,p_success boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_op private.creator_renewal_operations%rowtype;
begin
 select * into v_op from private.creator_renewal_operations where environment=p_environment and subscription_id=p_subscription for update;
 if not found or v_op.lease_token is distinct from p_token or (p_success and v_op.lease_until<=now()) then return false; end if;
 if not exists(select 1 from public.profiles where id=v_op.account_id) or exists(select 1 from public.account_identities where account_id=v_op.account_id and deleted_at is not null) then return false; end if;
 update private.creator_renewal_operations set state=case when p_success then 'completed' else 'pending' end,completed_at=case when p_success then now() else null end,lease_until=null,lease_token=null where environment=p_environment and subscription_id=p_subscription;
 if not p_success then
  insert into private.billing_payment_incidents(environment,account_id,resource_id,reason) values(p_environment,v_op.account_id,p_subscription,'creator_renewal_discount_failed') on conflict do nothing;
 end if;
 return true;
end $$;

create or replace function private.native_admin_creator_lines(p_environment text) returns table(item jsonb)
language sql stable security definer set search_path='' as $$
 with receipts as(select p.*,greatest(p.refunded_cents,coalesce((select sum(r.amount_cents) from private.admin_payment_refunds r where r.environment=p.environment and r.payment_id=p.payment_id and r.status='succeeded'),0)) refund_total,
 (p.refund_pending or exists(select 1 from private.admin_payment_issues i where i.environment=p.environment and i.payment_id=p.payment_id) or exists(select 1 from private.admin_payment_refunds r where r.environment=p.environment and r.payment_id=p.payment_id and r.status='pending')) pending from private.admin_payments p),
 firsts as(select distinct on(account_id) account_id,paid_at,discount_id from private.admin_payments where environment=p_environment order by account_id,paid_at,payment_id),
 lines as(select p.*,c.creator_id,case when (p.paid_at at time zone 'UTC')>=(f.paid_at at time zone 'UTC')+interval '12 months' then 13 else
  1+(select coalesce(max(n),0) from generate_series(0,11)n where(p.paid_at at time zone 'UTC')>=(f.paid_at at time zone 'UTC')+make_interval(months=>n)) end period_index
  from receipts p join firsts f using(account_id) left join private.admin_creators c on c.environment=p_environment and c.creator_id=coalesce(p.settled_creator_id,coalesce((select a.creator_id from private.creator_renewal_operations a where a.environment=p_environment and a.account_id=p.account_id and a.first_order_id=(select payment_id from private.admin_payments where environment=p_environment and account_id=p.account_id order by paid_at,payment_id limit 1) order by a.first_order_id limit 1),(select c2.creator_id from private.admin_creators c2 where c2.environment=p_environment and c2.discount_id=f.discount_id and c2.status='active'))) where p.environment=p_environment),
 rated as(select *,private.native_admin_commission_rate(period_index) rate_bp from lines)
 select jsonb_build_object('creator_id',creator_id,'account_id',account_id,'payment_id',payment_id,'paid_at',paid_at,'product',product,
  'period_index',period_index,'amount_cents',amount_cents,'currency',currency,'status',case when pending then 'refund_pending' when refund_total>=amount_cents then 'refunded' when refund_total>0 then 'partially_refunded' else 'paid' end,
  'refunded_cents',refund_total,'refunded',refund_total>0,'rate_bp',rate_bp,
  'refunded_at',(select max(r.modified_at) from private.admin_payment_refunds r where r.environment=p_environment and r.payment_id=rated.payment_id and r.status='succeeded'),
  'refund_reason',(select r.reason from private.admin_payment_refunds r where r.environment=p_environment and r.payment_id=rated.payment_id and r.status in('succeeded','pending') and r.reason is not null order by r.modified_at desc,r.refund_id limit 1),
  'history_complete',exists(select 1 from private.admin_payment_history h where h.environment=p_environment and h.account_id=rated.account_id),
  'commission_cents',greatest(coalesce(settled_commission_cents,0),case when pending or not exists(select 1 from private.admin_payment_history h where h.environment=p_environment and h.account_id=rated.account_id) then 0 else floor((greatest(0,amount_cents-refund_total)::numeric*rate_bp+5000)/10000)::bigint end)) from rated
$$;


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
  'creator_renewal_operations',coalesce((select jsonb_agg(jsonb_build_object('subscription_id',subscription_id,'state',state,'selected_discount_id',selected_discount_id,'not_applied',not_applied,'completed_at',completed_at)) from private.creator_renewal_operations where environment=p_environment and account_id=p_account),'[]'::jsonb),
  'renews_at',(select current_period_end from sub),
  'billing_incidents',coalesce((select jsonb_agg(jsonb_build_object('resource_id',i.resource_id,'reason',i.reason,'severity',i.severity) order by i.created_at desc) from private.billing_payment_incidents i where i.account_id=p_account and i.environment=p_environment),'[]'::jsonb),
  'founders_transitions',coalesce((select jsonb_agg(jsonb_build_object('subscription_id',t.subscription_id,'policy',t.policy,'state',t.state,'paid_period_end',t.paid_period_end) order by t.created_at desc) from private.founders_subscription_transitions t where t.account_id=p_account and t.environment=p_environment),'[]'::jsonb),
  'modules',coalesce((select jsonb_agg(module order by module) from access where rollout or individual or plan or data->'roles'<>'[]'::jsonb),'[]'::jsonb),
  'module_access',(select jsonb_agg(to_jsonb(access) order by module) from access),
  'reports_count',(select count(*) from public.testing_center_reports where reporter_user_id=p_account)+(select count(*) from public.testing_contributions where account_id=p_account),
  'polar_customer_url',null) from base
$$;
revoke all on function public.billing_save_creator_attribution(uuid,text,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.billing_save_creator_attribution(uuid,text,uuid,text,uuid) to service_role;
alter function public.billing_save_creator_attribution(uuid,text,uuid,text,uuid) owner to postgres;
revoke all on function public.billing_set_report_renewal_candidate(text,uuid,text,uuid,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.billing_set_report_renewal_candidate(text,uuid,text,uuid,integer,timestamptz) to service_role;
alter function public.billing_set_report_renewal_candidate(text,uuid,text,uuid,integer,timestamptz) owner to postgres;
revoke all on function public.billing_creator_renewal_prepare(text,uuid,text,text,text,uuid,text,uuid,integer) from public,anon,authenticated;
grant execute on function public.billing_creator_renewal_prepare(text,uuid,text,text,text,uuid,text,uuid,integer) to service_role;
alter function public.billing_creator_renewal_prepare(text,uuid,text,text,text,uuid,text,uuid,integer) owner to postgres;
revoke all on function public.billing_creator_renewal_finish(text,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.billing_creator_renewal_finish(text,text,uuid,boolean) to service_role;
alter function public.billing_creator_renewal_finish(text,text,uuid,boolean) owner to postgres;

create function public.billing_creator_renewal_authorized(p_environment text,p_subscription text,p_token uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.creator_renewal_operations op join public.profiles p on p.id=op.account_id
 where op.environment=p_environment and op.subscription_id=p_subscription and op.lease_token=p_token and op.lease_until>now() and op.state='pending'
 and not exists(select 1 from public.account_identities where account_id=op.account_id and deleted_at is not null)
 and exists(select 1 from public.billing_orders where environment=op.environment and provider_order_id=op.first_order_id and paid and reported_refunded_amount=0)
 and not exists(select 1 from public.billing_effective_access_grants where environment=op.environment and user_id=op.account_id and capability='vantare.plan.founders' and status='active'))
$$;
revoke all on function public.billing_creator_renewal_authorized(text,text,uuid) from public,anon,authenticated;
grant execute on function public.billing_creator_renewal_authorized(text,text,uuid) to service_role;
alter function public.billing_creator_renewal_authorized(text,text,uuid) owner to postgres;

create or replace function private.native_admin_account(p_account uuid,p_issuer text,p_environment text) returns jsonb
language sql stable security definer set search_path='' as $$
 select private.native_admin_account_summary(p_account,p_issuer,p_environment)||jsonb_build_object(
  'creator_code',(select jsonb_build_object('code',c.code,'creator_id',c.creator_id,'creator_name',c.name) from (select p.discount_id from private.admin_payments p where p.account_id=p_account and p.environment=p_environment order by p.paid_at,p.payment_id limit 1) first_payment join private.admin_creators c on c.creator_id=coalesce((select a.creator_id from private.creator_renewal_operations a where a.environment=p_environment and a.account_id=p_account and a.first_order_id=(select payment_id from private.admin_payments where environment=p_environment and account_id=p_account order by paid_at,payment_id limit 1) limit 1),(select c2.creator_id from private.admin_creators c2 where c2.environment=p_environment and c2.discount_id=first_payment.discount_id)) and c.environment=p_environment),
  'payments',coalesce((select jsonb_agg(item order by item->>'paid_at' desc) from private.native_admin_creator_lines(p_environment) where item->>'account_id'=p_account::text),'[]'::jsonb)||coalesce((select jsonb_agg(jsonb_build_object('payment_id',o.provider_order_id,'paid_at',o.created_at,'date_source','recorded_at','amount_basis','net','product',case when exists(select 1 from public.billing_access_grants g where g.user_id=o.user_id and g.environment=o.environment and g.source_type='order' and g.source_id=o.provider_order_id and g.capability='vantare.plan.founders') then 'Founders' else 'Launch Edition' end,'period_index',1,'amount_cents',o.net_amount,'currency',o.currency,'refunded_cents',o.reported_refunded_amount,'status',o.status) order by o.created_at desc) from public.billing_orders o where o.user_id=p_account and o.environment=p_environment and not exists(select 1 from private.admin_payments p where p.environment=p_environment and p.payment_id=o.provider_order_id)),'[]'::jsonb),
  'subscriptions',coalesce((select jsonb_agg(s.provider_subscription_id) from public.billing_subscriptions s where s.user_id=p_account and s.environment=p_environment and s.provider='polar' and(s.status in('active','trialing','past_due') or s.cancel_at_period_end)),'[]'::jsonb))
$$;

-- Claim and attribution commit together; invalid/inactive creator never strands a creating attempt.
create function public.claim_billing_creator_checkout_attempt(p_user_id uuid,p_attempt_id uuid,p_checkout_key text,p_environment text,p_catalog_version text,p_creator_code text,p_creator_discount uuid)
returns table(outcome text,checkout_url text) language plpgsql security definer set search_path='' as $$
declare v_claim record;
begin
 select * into v_claim from public.claim_billing_checkout_attempt(p_user_id,p_attempt_id,p_checkout_key,p_environment,p_catalog_version);
 if v_claim.outcome='claimed' and not public.billing_save_creator_attribution(p_user_id,p_environment,p_attempt_id,p_creator_code,p_creator_discount) then raise exception 'creator_attribution_conflict'; end if;
 return query select v_claim.outcome::text,v_claim.checkout_url::text;
end $$;
revoke all on function public.claim_billing_creator_checkout_attempt(uuid,uuid,text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.claim_billing_creator_checkout_attempt(uuid,uuid,text,text,text,text,uuid) to service_role;
alter function public.claim_billing_creator_checkout_attempt(uuid,uuid,text,text,text,text,uuid) owner to postgres;
