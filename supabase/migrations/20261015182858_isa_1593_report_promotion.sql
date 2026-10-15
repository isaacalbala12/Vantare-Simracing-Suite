-- #1593 / VANTA-39. Preparation only: empty catalogue, no activation or network.
begin;
-- Isaac's configurable policy. Snapshot only when a new tier is earned.
create table private.report_promotion_policy (
 singleton boolean primary key default true check(singleton),
 reward_valid_months integer not null check(reward_valid_months between 1 and 120)
);
insert into private.report_promotion_policy(singleton,reward_valid_months) values(true,6);
alter table private.report_promotion_policy enable row level security;
revoke all on private.report_promotion_policy from public,anon,authenticated,service_role;
create table private.report_promotion_catalog (
 environment text not null check(environment in ('sandbox','production')),
 product_id text not null,
 plan text not null check(plan in ('pro','pro_plus')),
 normal_cents integer not null,
 launch_cents integer not null,
 launch_discount text not null,
 reward3_discount text not null,
 reward6_discount text not null,
 primary key(environment,product_id),
 check((plan='pro' and normal_cents=599 and launch_cents=399)
    or (plan='pro_plus' and normal_cents=999 and launch_cents=699)),
 check(launch_discount<>reward3_discount and launch_discount<>reward6_discount and reward3_discount<>reward6_discount)
);
-- Explicit allowlist: creator codes from other campaigns/products are never imported.
create table private.report_promotion_creators (
 environment text not null, product_id text not null, discount_id text not null,
 basis_points integer not null check(basis_points between 1 and 10000),
 duration_in_months integer not null check(duration_in_months=2),
 validated_at timestamptz not null,
 primary key(environment,product_id,discount_id),
 foreign key(environment,product_id) references private.report_promotion_catalog
);
create table private.report_promotions (
 account_id uuid not null references public.profiles(id),
 environment text not null,
 subscription_id text not null,
 original_subscription_id text not null,
 product_id text not null,
 subscribed_at timestamptz not null,
 current_started_at timestamptz not null,
 remote_period_end timestamptz,
 first_renewal timestamptz not null,
 observed_at timestamptz not null,
 creator_discount text,
 remote_discount text,
 tier integer not null default 0 check(tier in (0,3,6)),
 reward_granted_at timestamptz,
 reward_expires_at timestamptz,
 repaired_order_id text,
 reward_from timestamptz,
 reward_until timestamptz,
 forfeited boolean not null default false,
 forfeited_at timestamptz,
 first_refunded boolean not null default false,
 applied_discount text,
 applied_at timestamptz,
 primary key(account_id,environment),
 unique(environment,subscription_id),
 foreign key(environment,product_id) references private.report_promotion_catalog
);
create table private.report_promotion_changes (
 id uuid primary key default gen_random_uuid(),
 account_id uuid not null,
 environment text not null,
 discount_id text,
 subscription_id text not null,
 product_id text not null,
 kind text not null default 'apply' check(kind in ('apply','cleanup')),
 tier integer not null check(tier in (0,3,6)),
 actor text not null default 'system:1593' check(actor='system:1593'),
 created_at timestamptz not null default clock_timestamp(),
 applied_at timestamptz,
 superseded_at timestamptz,
 repair_order_id text,
 phase text not null default 'pending' check(phase in ('pending','cleared')),
 lease_token uuid,
 lease_until timestamptz,
 foreign key(account_id,environment) references private.report_promotions
);
create table private.report_promotion_transfers (
 id bigint generated always as identity primary key,
 account_id uuid not null, environment text not null,
 subscription_id text not null, product_id text not null,
 next_subscription_id text not null, next_product_id text not null,
 observed_at timestamptz not null, cleanup_after timestamptz not null,
 cleared_at timestamptz,
 cleanup_reason text check(cleanup_reason in ('removed','mirror_inactive','remote_inactive')),
 foreign key(account_id,environment) references private.report_promotions,
 unique(account_id,environment,subscription_id,product_id,observed_at)
);
alter table private.report_promotion_transfers enable row level security;
revoke all on private.report_promotion_transfers from public,anon,authenticated,service_role;
create table private.report_promotion_invoices (
 environment text not null, order_id text not null,
 account_id uuid not null references public.profiles(id), subscription_id text not null,
 product_id text not null, discount_id text, discount_amount integer not null check(discount_amount>=0),
 is_initial boolean not null default false,
 source text not null default 'webhook' check(source in ('webhook','reconciliation')),
 reconciled_at timestamptz,
 billed_at timestamptz not null, period_start timestamptz not null, period_end timestamptz not null,
 primary key(environment,order_id), check(period_end>period_start)
);
create index report_promotion_invoice_account on private.report_promotion_invoices(account_id,environment,period_start);
alter table private.report_promotion_invoices enable row level security;
revoke all on private.report_promotion_invoices from public,anon,authenticated,service_role;
create table private.report_promotion_invoice_gaps (
 environment text not null, order_id text not null, account_id uuid not null references public.profiles(id),
 first_at timestamptz not null, last_at timestamptz not null, resolved_at timestamptz,
 primary key(environment,order_id)
);
create index report_promotion_open_invoice_gaps on private.report_promotion_invoice_gaps(account_id,environment) where resolved_at is null;
alter table private.report_promotion_invoice_gaps enable row level security;
revoke all on private.report_promotion_invoice_gaps from public,anon,authenticated,service_role;
create function public.report_promotion_invoice(p_environment text,p_order text,p_discount text,p_amount integer,
 p_billed timestamptz,p_start timestamptz,p_end timestamptz,p_initial boolean default false,p_source text default 'webhook') returns void
language plpgsql security definer set search_path='' as $$
declare o public.billing_orders;
begin
 if p_source not in ('webhook','reconciliation') then raise sqlstate '22023' using message='invalid_invoice_source'; end if;
 select * into o from public.billing_orders where provider='polar' and environment=p_environment and provider_order_id=p_order;
 if not found or o.provider_subscription_id is null or not o.paid or o.currency<>'eur' then return; end if;
 if private.lock_account_write(o.user_id) then return; end if;
 if not exists(select 1 from private.report_promotion_catalog where environment=p_environment and product_id=o.provider_product_id) then return; end if;
 if p_amount is null or p_amount<0 or p_billed is null or p_start is null or p_end is null
  or not isfinite(p_billed) or not isfinite(p_start) or not isfinite(p_end) or p_end<=p_start then return; end if;
 insert into private.report_promotion_invoices(environment,order_id,account_id,subscription_id,product_id,discount_id,discount_amount,billed_at,period_start,period_end,is_initial,source,reconciled_at)
 values(p_environment,p_order,o.user_id,o.provider_subscription_id,o.provider_product_id,p_discount,p_amount,p_billed,p_start,p_end,p_initial,p_source,case when p_source='reconciliation' then clock_timestamp() end)
 -- A refund never replenishes a spent month; repeated sources only add trace.
 on conflict(environment,order_id) do update set reconciled_at=coalesce(excluded.reconciled_at,private.report_promotion_invoices.reconciled_at);
 update private.report_promotion_invoice_gaps set resolved_at=clock_timestamp() where environment=p_environment and order_id=p_order and resolved_at is null;
 update private.report_promotion_failures set resolved_at=clock_timestamp() where account_id=o.user_id and environment=p_environment and resolved_at is null
  and code='promotion_invoice_details_missing' and not exists(select 1 from private.report_promotion_invoice_gaps g where g.account_id=o.user_id and g.environment=p_environment and g.resolved_at is null);
end $$;
revoke all on function public.report_promotion_invoice(text,text,text,integer,timestamptz,timestamptz,timestamptz,boolean,text) from public,anon,authenticated;
grant execute on function public.report_promotion_invoice(text,text,text,integer,timestamptz,timestamptz,timestamptz,boolean,text) to service_role;
create table private.report_promotion_failures (
 account_id uuid not null references public.profiles(id), environment text not null check(environment in ('sandbox','production')),
 code text not null check(code in ('polar_discount_unmanaged','polar_discount_catalog_mismatch','polar_discount_subscription_changed',
 'polar_discount_not_applied','polar_discount_invalid_response','polar_discount_http_failed','promotion_account_failed','promotion_not_authorized','promotion_repair_lease_lost','promotion_invoice_details_missing','promotion_initial_invoice_missing')),
 attempts integer not null default 1, first_at timestamptz not null, last_at timestamptz not null, resolved_at timestamptz,
 primary key(account_id,environment)
);
alter table private.report_promotion_failures enable row level security;
revoke all on private.report_promotion_failures from public,anon,authenticated,service_role;
create function public.report_promotion_failed(p_account uuid,p_environment text,p_code text,p_now timestamptz default clock_timestamp()) returns void
language plpgsql security definer set search_path='' as $$
begin
 if private.lock_account_write(p_account) then return; end if;
 insert into private.report_promotion_failures(account_id,environment,code,first_at,last_at) values(p_account,p_environment,p_code,p_now,p_now)
 on conflict(account_id,environment) do update set code=excluded.code,last_at=excluded.last_at,attempts=private.report_promotion_failures.attempts+1,resolved_at=null;
end $$;
revoke all on function public.report_promotion_failed(uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.report_promotion_failed(uuid,text,text,timestamptz) to service_role;
-- Record an incomplete paid cycle without copying the remote payload.
create function public.report_promotion_invoice_missing(p_environment text,p_order text,p_now timestamptz default clock_timestamp()) returns void
language plpgsql security definer set search_path='' as $$
declare o public.billing_orders;
begin
 select * into o from public.billing_orders where provider='polar' and environment=p_environment and provider_order_id=p_order;
 if not found or not o.paid or o.provider_subscription_id is null or private.lock_account_write(o.user_id) then return; end if;
 if not exists(select 1 from private.report_promotion_catalog c where c.environment=p_environment and c.product_id=o.provider_product_id)
 or exists(select 1 from private.report_promotion_invoices i where i.environment=p_environment and i.order_id=p_order) then return; end if;
 insert into private.report_promotion_invoice_gaps(environment,order_id,account_id,first_at,last_at) values(p_environment,p_order,o.user_id,p_now,p_now)
 on conflict(environment,order_id) do update set last_at=excluded.last_at,resolved_at=null;
 perform public.report_promotion_failed(o.user_id,p_environment,'promotion_invoice_details_missing',p_now);
end $$;
revoke all on function public.report_promotion_invoice_missing(text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.report_promotion_invoice_missing(text,text,timestamptz) to service_role;
create table private.report_promotion_launch_uses (
 account_id uuid not null references public.profiles(id), environment text not null check(environment in ('sandbox','production')),
 product_id text not null, attempt_id uuid, checkout_id text, remote_pending boolean not null default false, subscription_id text, order_id text,
 reserved_at timestamptz not null, consumed_at timestamptz,
 primary key(account_id,environment)
);
alter table private.report_promotion_launch_uses enable row level security;
revoke all on private.report_promotion_launch_uses from public,anon,authenticated,service_role;
-- Retain remote recovery facts beyond the generic attempt table's 24-hour GC.
create function private.report_promotion_checkout_started() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if private.lock_account_write(new.user_id) then return new; end if;
 update private.report_promotion_launch_uses set remote_pending=true,checkout_id=coalesce(new.provider_checkout_id,checkout_id)
 where account_id=new.user_id and environment=new.environment and attempt_id=new.attempt_id and consumed_at is null;
 return new;
end $$;
create trigger report_promotion_checkout_started after insert or update on public.billing_checkout_attempts for each row execute function private.report_promotion_checkout_started();
revoke all on function private.report_promotion_checkout_started() from public,anon,authenticated,service_role;
-- Billing facts are consumed even when the feature flag is off: SQL has no flag.
create function private.report_promotion_mark_launch() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.provider<>'polar' or not new.paid or new.provider_subscription_id is null
 or not exists(select 1 from private.report_promotion_catalog where environment=new.environment and product_id=new.provider_product_id) then return new; end if;
 if private.lock_account_write(new.user_id) then return new; end if;
 insert into private.report_promotion_launch_uses(account_id,environment,product_id,subscription_id,order_id,reserved_at,consumed_at)
 values(new.user_id,new.environment,new.provider_product_id,new.provider_subscription_id,new.provider_order_id,new.created_at,new.created_at)
 on conflict(account_id,environment) do update set consumed_at=coalesce(private.report_promotion_launch_uses.consumed_at,excluded.consumed_at),
  subscription_id=coalesce(private.report_promotion_launch_uses.subscription_id,excluded.subscription_id),order_id=coalesce(private.report_promotion_launch_uses.order_id,excluded.order_id);
 return new;
end $$;
create trigger report_promotion_launch_paid after insert or update on public.billing_orders for each row execute function private.report_promotion_mark_launch();
revoke all on function private.report_promotion_mark_launch() from public,anon,authenticated,service_role;
create unique index report_promotion_one_pending on private.report_promotion_changes(account_id,environment) where applied_at is null and superseded_at is null;
create index report_promotion_changes_account on private.report_promotion_changes(account_id,environment,created_at);
alter table private.report_promotion_catalog enable row level security;
alter table private.report_promotion_creators enable row level security;
alter table private.report_promotions enable row level security;
alter table private.report_promotion_changes enable row level security;
revoke all on private.report_promotion_catalog,private.report_promotion_creators,private.report_promotions,private.report_promotion_changes from public,anon,authenticated,service_role;

-- Calendar arithmetic is explicitly Madrid, regardless of connection timezone.
create function private.report_promotion_months(t timestamptz,n integer) returns timestamptz
language sql immutable set search_path='' as $$select ((t at time zone 'Europe/Madrid')+make_interval(months=>n)) at time zone 'Europe/Madrid'$$;
create function private.report_promotion_eligible(t timestamptz) returns boolean
language sql immutable set search_path='' as $$select t >= timestamp '2026-10-26 19:00' at time zone 'Europe/Madrid'
 and t < timestamp '2026-11-02 19:00' at time zone 'Europe/Madrid'$$;

-- First invoice uses the one-month launch discount on the NORMAL monthly product.
-- Existing permanent launch products and annual subscriptions are not rewritten.
-- The entitlement belongs to the account. A replacement attempt may reuse it
-- only after the prior lease expires and its remote checkout cannot be paid.
create function public.report_promotion_checkout(p_account uuid,p_environment text,p_product text,p_now timestamptz default clock_timestamp(),p_attempt uuid default null,p_replaces uuid default null)
returns text language plpgsql security definer set search_path='' as $$
declare discount text; used private.report_promotion_launch_uses; prior public.billing_checkout_attempts;
begin
 if private.lock_account_write(p_account) then raise sqlstate '28000' using message='account_deleted'; end if;
 if not private.report_promotion_eligible(p_now) then return null; end if;
 select launch_discount into discount from private.report_promotion_catalog where environment=p_environment and product_id=p_product;
 if not found then return null; end if;
 select * into used from private.report_promotion_launch_uses where account_id=p_account and environment=p_environment for update;
 if used.consumed_at is not null then return null; end if;
 if exists(select 1 from private.report_promotions where account_id=p_account and environment=p_environment)
 or exists(select 1 from public.billing_subscriptions b join private.report_promotion_catalog c on c.environment=b.environment and c.product_id=b.provider_product_id where b.user_id=p_account and b.environment=p_environment and b.provider='polar')
 or exists(select 1 from public.billing_orders b join private.report_promotion_catalog c on c.environment=b.environment and c.product_id=b.provider_product_id where b.user_id=p_account and b.environment=p_environment and b.provider='polar' and b.paid) then
  insert into private.report_promotion_launch_uses(account_id,environment,product_id,reserved_at,consumed_at) values(p_account,p_environment,p_product,p_now,p_now)
   on conflict(account_id,environment) do update set consumed_at=coalesce(private.report_promotion_launch_uses.consumed_at,excluded.consumed_at);
  return null;
 end if;
 if used.account_id is not null then
   if used.attempt_id=p_attempt and used.product_id=p_product then return discount; end if;
   select * into prior from public.billing_checkout_attempts where user_id=p_account and attempt_id=used.attempt_id and environment=p_environment;
   if p_now<greatest(used.reserved_at+interval '30 minutes',prior.expires_at)
    or (used.remote_pending and (p_replaces is distinct from used.attempt_id or coalesce(used.checkout_id,prior.provider_checkout_id) is null)) then
     raise sqlstate '55000' using message='promotion_checkout_pending';
   end if;
   -- CAS under the B03 account lock: another replacement invalidates old proof.
   if p_replaces is not null and p_replaces is distinct from used.attempt_id then
     raise sqlstate '55000' using message='promotion_checkout_pending';
   end if;
   if p_attempt is null then raise sqlstate '55000' using message='promotion_checkout_pending'; end if;
   update private.report_promotion_launch_uses set attempt_id=p_attempt,product_id=p_product,reserved_at=p_now,checkout_id=null,remote_pending=false where account_id=p_account and environment=p_environment;
 elsif p_attempt is not null then
   insert into private.report_promotion_launch_uses(account_id,environment,product_id,attempt_id,reserved_at) values(p_account,p_environment,p_product,p_attempt,p_now);
 end if;
 return discount;
end $$;
-- Server-only recovery metadata; no checkout URL or customer PII is returned.
create function public.report_promotion_checkout_pending(p_account uuid,p_environment text,p_now timestamptz default clock_timestamp()) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if private.lock_account_write(p_account) then raise sqlstate '28000' using message='account_deleted'; end if;
 select jsonb_build_object('attempt_id',u.attempt_id,'checkout_id',coalesce(u.checkout_id,a.provider_checkout_id),'product_id',u.product_id) into result
 from private.report_promotion_launch_uses u left join public.billing_checkout_attempts a on a.user_id=u.account_id and a.attempt_id=u.attempt_id and a.environment=u.environment
 where u.account_id=p_account and u.environment=p_environment and u.consumed_at is null and private.report_promotion_eligible(p_now)
 and p_now>=greatest(u.reserved_at+interval '30 minutes',a.expires_at);
 return result;
end $$;
revoke all on function public.report_promotion_checkout(uuid,text,text,timestamptz,uuid,uuid),public.report_promotion_checkout_pending(uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.report_promotion_checkout(uuid,text,text,timestamptz,uuid,uuid),public.report_promotion_checkout_pending(uuid,text,timestamptz) to service_role;

-- Called only after the verified billing webhook/lifecycle persisted this owner.
create function public.report_promotion_observe(p_account uuid,p_environment text,p_subscription text,p_product text,
 p_started timestamptz,p_modified timestamptz,p_discount text) returns void
language plpgsql security definer set search_path='' as $$
declare s public.billing_subscriptions; c private.report_promotion_catalog; existing private.report_promotions; until_time timestamptz;
begin
 if private.lock_account_write(p_account) then raise sqlstate '28000' using message='account_deleted'; end if;
 select * into c from private.report_promotion_catalog where environment=p_environment and product_id=p_product;
 if not found then return; end if;
 select * into s from public.billing_subscriptions where user_id=p_account and provider='polar'
   and environment=p_environment and provider_subscription_id=p_subscription;
 if not found or s.provider_product_id is distinct from p_product or s.status not in ('active','uncanceled') then return; end if;
 if p_modified is null or not isfinite(p_modified) or p_started is null or not isfinite(p_started) then return; end if;
 select * into existing from private.report_promotions where account_id=p_account and environment=p_environment for update;
 if found then
   -- Ignore old deliveries and an older subscription waking up after replacement.
   if p_subscription=existing.subscription_id and p_modified<=existing.observed_at then return; end if;
   if p_subscription<>existing.subscription_id and (p_started,p_subscription)<=(existing.current_started_at,existing.subscription_id)
    and exists(select 1 from public.billing_subscriptions b where b.user_id=p_account and b.environment=p_environment and b.provider='polar' and b.provider_subscription_id=existing.subscription_id and b.status in ('active','uncanceled')) then return; end if;
   if existing.subscription_id<>p_subscription or existing.product_id<>p_product then
     select greatest(p_modified,coalesce(max(lease_until),p_modified)) into until_time from private.report_promotion_changes
      where account_id=p_account and environment=p_environment and applied_at is null and superseded_at is null;
     update private.report_promotion_transfers set cleared_at=p_modified where account_id=p_account and environment=p_environment and subscription_id=p_subscription and cleared_at is null;
     insert into private.report_promotion_transfers(account_id,environment,subscription_id,product_id,next_subscription_id,next_product_id,observed_at,cleanup_after,cleared_at)
     values(p_account,p_environment,existing.subscription_id,existing.product_id,p_subscription,p_product,p_modified,until_time,
       case when existing.subscription_id=p_subscription then p_modified end);
     update private.report_promotion_changes set superseded_at=p_modified where account_id=p_account and environment=p_environment and applied_at is null and superseded_at is null;
     update private.report_promotions set subscription_id=p_subscription,product_id=p_product,current_started_at=p_started,
      remote_discount=p_discount,observed_at=p_modified,remote_period_end=null,applied_at=null,applied_discount=null,
      creator_discount=case when exists(select 1 from private.report_promotion_creators where environment=p_environment and product_id=p_product and discount_id=existing.creator_discount) then existing.creator_discount end
      where account_id=p_account and environment=p_environment;
   else
     update private.report_promotions set remote_discount=p_discount,observed_at=p_modified
      where account_id=p_account and environment=p_environment;
   end if;
 else
   if not coalesce(private.report_promotion_eligible(p_started),false) then return; end if;
   insert into private.report_promotions(account_id,environment,subscription_id,original_subscription_id,product_id,subscribed_at,current_started_at,first_renewal,observed_at,creator_discount,remote_discount)
   values(p_account,p_environment,p_subscription,p_subscription,p_product,p_started,p_started,private.report_promotion_months(p_started,1),p_modified,
    case when exists(select 1 from private.report_promotion_creators where environment=p_environment and product_id=p_product and discount_id=p_discount) then p_discount end,p_discount);
 end if;
end $$;

create function private.report_promotion_progress(p_account uuid,p_environment text,p_now timestamptz)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('accepted',
  (select count(*) from public.testing_contributions c join public.testing_contribution_reviews r on r.contribution_id=c.id
   where c.account_id=p.account_id and r.decision='accepted' and c.state in ('accepted','fixed')
   and c.created_at>=p.subscribed_at and c.created_at < p.subscribed_at+interval '1080 hours'
   and r.decided_at<=p_now),
 'spam',(select count(*) from public.testing_contributions c join public.testing_contribution_reviews r on r.contribution_id=c.id
   where c.account_id=p.account_id and r.decision='spam' and c.created_at>=p.subscribed_at and r.decided_at<=p_now),
 'last_error',(select f.code from private.report_promotion_failures f where f.account_id=p.account_id and f.environment=p.environment and f.resolved_at is null),'tier',p.tier,'first_refunded',p.first_refunded,'forfeited',p.forfeited,'active_discount',p.remote_discount,'applied_at',p.applied_at,
 'reward_until',p.reward_until,'reward_expires_at',p.reward_expires_at,'reward_expired',p.reward_expires_at<=p_now,'window_end',p.subscribed_at+interval '1080 hours')
 from private.report_promotions p where account_id=p_account and environment=p_environment
 and not exists(select 1 from public.account_identities i where i.account_id=p.account_id and i.deleted_at is not null)
$$;

-- A stable pending operation survives HTTP timeouts. Repeated webhooks never add months.
create function public.report_promotion_prepare(p_account uuid,p_environment text,p_now timestamptz default clock_timestamp())
returns jsonb language plpgsql security definer set search_path='' as $$
declare p private.report_promotions; s public.billing_subscriptions; c private.report_promotion_catalog;
 earned integer; desired text; next_bill timestamptz; op private.report_promotion_changes; prior private.report_promotion_transfers; target_sub text; target_product text; action_kind text:='apply'; spent integer; repair text; creator private.report_promotion_creators; first_order public.billing_orders; spam_at timestamptz; accepted_before_spam integer; grant_at timestamptz; valid_months integer;
begin
 if private.lock_account_write(p_account) then return null; end if;
 select * into p from private.report_promotions where account_id=p_account and environment=p_environment for update;
 if not found then return null; end if;
 select * into s from public.billing_subscriptions where user_id=p_account and provider='polar'
  and environment=p_environment and provider_subscription_id=p.subscription_id;
 if not found or s.status not in ('active','uncanceled') or s.provider_product_id is distinct from p.product_id then return null; end if;
 -- An active subscription event may precede its first invoice. Never replace
 -- the launch discount until a paid invoice for this exact subscription exists.
 select o.* into first_order from public.billing_orders o join private.report_promotion_invoices i on i.environment=o.environment and i.order_id=o.provider_order_id and i.is_initial
 where o.user_id=p_account and o.provider='polar' and o.environment=p_environment and o.provider_subscription_id=p.original_subscription_id and o.paid and o.currency='eur' order by i.billed_at,o.id limit 1;
 if not found then
   perform public.report_promotion_failed(p_account,p_environment,'promotion_initial_invoice_missing',p_now);
   return null;
 end if;
 update private.report_promotion_failures set resolved_at=p_now where account_id=p_account and environment=p_environment and code='promotion_initial_invoice_missing' and resolved_at is null;
 p.first_refunded:=p.first_refunded or first_order.status<>'paid' or first_order.reported_refunded_amount>0
  or exists(select 1 from public.billing_refunds r where r.environment=p_environment and r.provider_order_id=first_order.provider_order_id and r.status='succeeded' and r.amount>0);
 select * into c from private.report_promotion_catalog where environment=p_environment and product_id=p.product_id;
 if exists(select 1 from private.report_promotion_invoice_gaps g where g.account_id=p_account and g.environment=p_environment and g.resolved_at is null) and not p.first_refunded then
   perform public.report_promotion_failed(p_account,p_environment,'promotion_invoice_details_missing',p_now);
   return null; -- Do not rearm while a known paid cycle has incomplete accounting.
 end if;
 -- Benefits are consumed by settled recurring invoice periods, never by the mirror clock.
 select r.decided_at into spam_at from public.testing_contribution_reviews r join public.testing_contributions t on t.id=r.contribution_id
 where t.account_id=p_account and t.created_at>=p.subscribed_at and r.decision='spam' and r.decided_at<=p_now order by r.decided_at,t.id offset 1 limit 1;
 p.forfeited_at:=coalesce(p.forfeited_at,spam_at);
 p.forfeited:=p.forfeited or p.forfeited_at is not null;
 select count(*)::integer into accepted_before_spam from public.testing_contributions t join public.testing_contribution_reviews r on r.contribution_id=t.id
 where t.account_id=p_account and t.state in ('accepted','fixed') and r.decision='accepted' and t.created_at>=p.subscribed_at and t.created_at<p.subscribed_at+interval '1080 hours'
 and r.decided_at<=p_now and (p.forfeited_at is null or r.decided_at<p.forfeited_at);
 earned:=case when accepted_before_spam>=5 then 6 when accepted_before_spam>=2 then 3 else 0 end;
 if earned>p.tier and not p.first_refunded then
   select r.decided_at into grant_at from public.testing_contributions t join public.testing_contribution_reviews r on r.contribution_id=t.id
   where t.account_id=p_account and t.state in ('accepted','fixed') and r.decision='accepted' and t.created_at>=p.subscribed_at and t.created_at<p.subscribed_at+interval '1080 hours'
   and r.decided_at<=p_now and (p.forfeited_at is null or r.decided_at<p.forfeited_at) order by r.decided_at,t.id offset (case earned when 6 then 4 else 1 end) limit 1;
   p.tier:=earned; p.reward_granted_at:=coalesce(p.reward_granted_at,grant_at);
   select reward_valid_months into strict valid_months from private.report_promotion_policy where singleton;
   p.reward_expires_at:=private.report_promotion_months(grant_at,valid_months);
 end if;
 select count(distinct (i.subscription_id,i.period_start))::integer,min(i.period_start),max(i.period_end)
 into spent,p.reward_from,p.reward_until
 from private.report_promotion_invoices i join private.report_promotion_catalog x on x.environment=i.environment and x.product_id=i.product_id
 where i.account_id=p_account and i.environment=p_environment and i.billed_at>=p.reward_granted_at and i.billed_at<=p_now
 and (not i.is_initial or i.subscription_id<>p.original_subscription_id) and i.discount_amount>0 and i.discount_id in (x.launch_discount,x.reward3_discount,x.reward6_discount);
 desired:=null;
 if p.tier>0 and spent<p.tier and not p.first_refunded then
   desired:=case when p.tier-spent>=6 then c.reward6_discount when p.tier-spent>=3 then c.reward3_discount else c.launch_discount end;
 end if;
 -- A paid, undiscounted renewal after the last confirmed application proves a
 -- provider-side expiry/missed cycle. Repair exactly once for that invoice.
 select i.order_id into repair from private.report_promotion_invoices i
 where i.account_id=p_account and i.environment=p_environment and i.subscription_id=p.subscription_id
 and (not i.is_initial or i.subscription_id<>p.original_subscription_id) and i.billed_at>p.applied_at and i.billed_at<=p_now
 and (i.discount_amount=0 or (p.applied_discount=c.launch_discount and i.discount_id=p.applied_discount and i.discount_amount>0))
 and i.order_id is distinct from p.repaired_order_id order by i.billed_at desc,i.order_id desc limit 1;
 if desired is null then repair:=null; end if;
 next_bill:=coalesce(p.remote_period_end,s.current_period_end,p_now); -- creator comparison only; never reward budget
 -- Compare actual cents, never stack. Ties keep the report reward. Creator is
 -- available for the first two calendar months only; reports never affect invoice 1.
 select * into creator from private.report_promotion_creators where environment=p_environment and product_id=p.product_id and discount_id=p.creator_discount;
 if found and p_now<private.report_promotion_months(p.subscribed_at,creator.duration_in_months)
  and next_bill<private.report_promotion_months(p.subscribed_at,creator.duration_in_months)
  and (desired is null or round(c.normal_cents*creator.basis_points/10000.0)>c.normal_cents-c.launch_cents) then desired:=p.creator_discount; repair:=null; end if;
 update private.report_promotions set tier=p.tier,reward_granted_at=p.reward_granted_at,reward_expires_at=p.reward_expires_at,reward_from=p.reward_from,reward_until=p.reward_until,forfeited=p.forfeited,forfeited_at=p.forfeited_at,first_refunded=p.first_refunded
  where account_id=p_account and environment=p_environment;
 -- Expiry stops new allocations and repairs; an already-confirmed finite
 -- coupon finishes naturally. Refund policy still revokes it independently.
 if p.reward_expires_at<=p_now and not p.first_refunded then
   update private.report_promotion_changes set superseded_at=p_now where account_id=p_account and environment=p_environment
    and applied_at is null and superseded_at is null and (lease_until is null or lease_until<=p_now);
   return null;
 end if;
 target_sub:=p.subscription_id; target_product:=p.product_id;
 -- A non-billable predecessor needs no provider mutation. Keep its audit.
 update private.report_promotion_transfers t set cleared_at=p_now,cleanup_reason='mirror_inactive'
 where t.account_id=p_account and t.environment=p_environment and t.cleared_at is null and t.cleanup_after<=p_now
 and exists(select 1 from public.billing_subscriptions b where b.user_id=p_account and b.provider='polar' and b.environment=p_environment and b.provider_subscription_id=t.subscription_id and b.status in ('canceled','paused'));
 select * into prior from private.report_promotion_transfers where account_id=p_account and environment=p_environment and cleared_at is null order by id limit 1;
 if found then
   if prior.cleanup_after>p_now then return null; end if;
   target_sub:=prior.subscription_id; target_product:=prior.product_id; action_kind:='cleanup'; desired:=null; repair:=null;
   select * into c from private.report_promotion_catalog where environment=p_environment and product_id=target_product;
 end if;
 select * into op from private.report_promotion_changes where account_id=p_account and environment=p_environment and applied_at is null and superseded_at is null;
 if found and (op.discount_id is distinct from desired or op.subscription_id<>target_sub or op.product_id<>target_product or op.repair_order_id is distinct from repair) then
   if op.lease_until>p_now then return null; end if;
   update private.report_promotion_changes set superseded_at=p_now where id=op.id;
   op.id:=null;
 end if;
 if op.id is null then
   if repair is null and action_kind='apply' and p.applied_at is not null and p.applied_discount is not distinct from desired and (p.remote_discount is not distinct from desired or (desired is null and not exists(select 1 from private.report_promotion_catalog x where x.environment=p_environment and p.remote_discount in (x.launch_discount,x.reward3_discount,x.reward6_discount)))) then return null; end if;
   insert into private.report_promotion_changes(account_id,environment,discount_id,tier,subscription_id,product_id,kind,repair_order_id) values(p_account,p_environment,desired,p.tier,target_sub,target_product,action_kind,repair) returning * into op;
 end if;
 return jsonb_build_object('id',op.id,'subscription_id',op.subscription_id,'product_id',op.product_id,'kind',op.kind,'repair',op.repair_order_id is not null,'phase',op.phase,'remaining',greatest(0,p.tier-spent),
  'discount_id',op.discount_id,'tier',op.tier,'normal_cents',c.normal_cents,'managed_discount_ids',(select jsonb_agg(d) from (select unnest(array[x.launch_discount,x.reward3_discount,x.reward6_discount]) d from private.report_promotion_catalog x where x.environment=p_environment union select p.creator_discount where op.kind='apply' and op.discount_id is not null) discounts));
end $$;

-- Revalidate immediately before HTTP, and again at ACK, using the same B03 UUID lock.
-- Live provider period used only to arbitrate creator expiry, never to spend reward months.
create function public.report_promotion_period(p_account uuid,p_environment text,p_subscription text,p_end timestamptz) returns void
language plpgsql security definer set search_path='' as $$
begin
 if private.lock_account_write(p_account) or p_end is null or not isfinite(p_end) then return; end if;
 update private.report_promotions set remote_period_end=p_end where account_id=p_account and environment=p_environment and subscription_id=p_subscription;
end $$;
revoke all on function public.report_promotion_period(uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.report_promotion_period(uuid,text,text,timestamptz) to service_role;
create function public.report_promotion_claim(p_id uuid,p_token uuid,p_now timestamptz default clock_timestamp()) returns boolean
language plpgsql security definer set search_path='' as $$
declare op private.report_promotion_changes; prepared jsonb;
begin
 select * into op from private.report_promotion_changes where id=p_id;
 if not found or private.lock_account_write(op.account_id) then return false; end if;
 prepared:=public.report_promotion_prepare(op.account_id,op.environment,p_now);
 if prepared is null or prepared->>'id'<>p_id::text then return false; end if;
 update private.report_promotion_changes set lease_token=p_token,lease_until=p_now+interval '60 seconds'
  where id=p_id and applied_at is null and superseded_at is null and (lease_until is null or lease_until<=p_now or lease_token=p_token);
 return found;
end $$;
create function public.report_promotion_cleared(p_id uuid,p_token uuid,p_now timestamptz default clock_timestamp()) returns boolean
language plpgsql security definer set search_path='' as $$
declare account uuid;
begin
 select account_id into account from private.report_promotion_changes where id=p_id;
 if account is null or private.lock_account_write(account) then return false; end if;
 update private.report_promotion_changes set phase='cleared' where id=p_id and applied_at is null and superseded_at is null and lease_token=p_token and lease_until>p_now and repair_order_id is not null;
 return found;
end $$;
revoke all on function public.report_promotion_cleared(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.report_promotion_cleared(uuid,uuid,timestamptz) to service_role;
create function public.report_promotion_ack(p_id uuid,p_token uuid,p_now timestamptz default clock_timestamp(),p_observed_discount text default null,p_cleanup_reason text default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare op private.report_promotion_changes;
begin
 select * into op from private.report_promotion_changes where id=p_id;
 if not found or private.lock_account_write(op.account_id) then return false; end if;
 update private.report_promotion_changes set applied_at=p_now where id=p_id and applied_at is null and superseded_at is null and lease_token=p_token and lease_until>p_now;
 if not found then return false; end if;
 update private.report_promotion_failures set resolved_at=p_now where account_id=op.account_id and environment=op.environment and resolved_at is null;
 if op.kind='cleanup' then
   update private.report_promotion_transfers set cleared_at=p_now,cleanup_reason=case when p_cleanup_reason='remote_inactive' then p_cleanup_reason else 'removed' end where account_id=op.account_id and environment=op.environment and subscription_id=op.subscription_id and product_id=op.product_id and cleared_at is null;
 else
   update private.report_promotions set applied_discount=op.discount_id,remote_discount=coalesce(p_observed_discount,op.discount_id),applied_at=p_now,repaired_order_id=coalesce(op.repair_order_id,repaired_order_id) where account_id=op.account_id and environment=op.environment and subscription_id=op.subscription_id and product_id=op.product_id;
 end if;
 return true;
end $$;
create function public.report_promotion_accounts(p_environment text,p_after uuid default null) returns setof uuid
language sql stable security definer set search_path='' as $$
 select p.account_id from private.report_promotions p where environment=p_environment and (p_after is null or p.account_id>p_after)
 and not exists(select 1 from public.account_identities i where i.account_id=p.account_id and i.deleted_at is not null)
 order by p.account_id limit 50
$$;

-- Extend the existing owner-only account payload, preserving B03/deleted filters.
alter function private.native_admin_account(uuid,text,text) rename to native_admin_account_before_1593;
create function private.native_admin_account(p_account uuid,p_issuer text,p_environment text) returns jsonb
language sql stable security definer set search_path='' as $$
 select private.native_admin_account_before_1593(p_account,p_issuer,p_environment)
  ||jsonb_build_object('report_promotion',private.report_promotion_progress(p_account,p_environment,statement_timestamp()))
$$;
revoke all on function private.native_admin_account_before_1593(uuid,text,text),private.native_admin_account(uuid,text,text),
 private.report_promotion_months(timestamptz,integer),private.report_promotion_eligible(timestamptz),private.report_promotion_progress(uuid,text,timestamptz)
 from public,anon,authenticated,service_role;
revoke all on function public.report_promotion_observe(uuid,text,text,text,timestamptz,timestamptz,text),
 public.report_promotion_prepare(uuid,text,timestamptz),public.report_promotion_claim(uuid,uuid,timestamptz),
 public.report_promotion_ack(uuid,uuid,timestamptz,text,text),public.report_promotion_accounts(text,uuid) from public,anon,authenticated;
grant execute on function public.report_promotion_observe(uuid,text,text,text,timestamptz,timestamptz,text),
 public.report_promotion_prepare(uuid,text,timestamptz),public.report_promotion_claim(uuid,uuid,timestamptz),
 public.report_promotion_ack(uuid,uuid,timestamptz,text,text),public.report_promotion_accounts(text,uuid) to service_role;

alter function public.report_promotion_invoice_missing(text,text,timestamptz) owner to postgres;
alter function public.report_promotion_period(uuid,text,text,timestamptz) owner to postgres;
alter function private.report_promotion_checkout_started() owner to postgres;
alter function public.report_promotion_checkout_pending(uuid,text,timestamptz) owner to postgres;
alter function private.report_promotion_mark_launch() owner to postgres;
-- Explicit runtime principal: NOSUPERUSER BYPASSRLS, matching the hosted postgres role.
alter function private.report_promotion_months(timestamptz,integer) owner to postgres;
alter function private.report_promotion_eligible(timestamptz) owner to postgres;
alter function public.report_promotion_checkout(uuid,text,text,timestamptz,uuid,uuid) owner to postgres;
alter function public.report_promotion_observe(uuid,text,text,text,timestamptz,timestamptz,text) owner to postgres;
alter function private.report_promotion_progress(uuid,text,timestamptz) owner to postgres;
alter function public.report_promotion_prepare(uuid,text,timestamptz) owner to postgres;
alter function public.report_promotion_claim(uuid,uuid,timestamptz) owner to postgres;
alter function public.report_promotion_ack(uuid,uuid,timestamptz,text,text) owner to postgres;
alter function public.report_promotion_accounts(text,uuid) owner to postgres;
alter function public.report_promotion_invoice(text,text,text,integer,timestamptz,timestamptz,timestamptz,boolean,text) owner to postgres;
alter function public.report_promotion_failed(uuid,text,text,timestamptz) owner to postgres;
alter function public.report_promotion_cleared(uuid,uuid,timestamptz) owner to postgres;
alter function private.native_admin_account(uuid,text,text) owner to postgres;
alter function private.native_admin_account_before_1593(uuid,text,text) owner to postgres;
commit;
