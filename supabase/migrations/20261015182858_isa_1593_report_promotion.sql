-- #1593 / VANTA-39. Preparation only: empty catalogue, no activation or network.
begin;
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
 first_renewal timestamptz not null,
 observed_at timestamptz not null,
 creator_discount text,
 remote_discount text,
 tier integer not null default 0 check(tier in (0,3,6)),
 reward_granted_at timestamptz,
 repaired_order_id text,
 reward_from timestamptz,
 reward_until timestamptz,
 forfeited boolean not null default false,
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
 foreign key(account_id,environment) references private.report_promotions,
 unique(account_id,environment,subscription_id,product_id,observed_at)
);
alter table private.report_promotion_transfers enable row level security;
revoke all on private.report_promotion_transfers from public,anon,authenticated,service_role;
create table private.report_promotion_invoices (
 environment text not null, order_id text not null,
 account_id uuid not null references public.profiles(id), subscription_id text not null,
 product_id text not null, discount_id text, discount_amount integer not null check(discount_amount>=0),
 billed_at timestamptz not null, period_start timestamptz not null, period_end timestamptz not null,
 primary key(environment,order_id), check(period_end>period_start)
);
create index report_promotion_invoice_account on private.report_promotion_invoices(account_id,environment,period_start);
alter table private.report_promotion_invoices enable row level security;
revoke all on private.report_promotion_invoices from public,anon,authenticated,service_role;
create function public.report_promotion_invoice(p_environment text,p_order text,p_discount text,p_amount integer,
 p_billed timestamptz,p_start timestamptz,p_end timestamptz) returns void
language plpgsql security definer set search_path='' as $$
declare o public.billing_orders;
begin
 select * into o from public.billing_orders where provider='polar' and environment=p_environment and provider_order_id=p_order;
 if not found or o.provider_subscription_id is null or not o.paid or o.currency<>'eur' then return; end if;
 if private.lock_account_write(o.user_id) then return; end if;
 if not exists(select 1 from private.report_promotion_catalog where environment=p_environment and product_id=o.provider_product_id) then return; end if;
 if p_amount is null or p_amount<0 or p_billed is null or p_start is null or p_end is null
  or not isfinite(p_billed) or not isfinite(p_start) or not isfinite(p_end) or p_end<=p_start then return; end if;
 insert into private.report_promotion_invoices(environment,order_id,account_id,subscription_id,product_id,discount_id,discount_amount,billed_at,period_start,period_end)
 values(p_environment,p_order,o.user_id,o.provider_subscription_id,o.provider_product_id,p_discount,p_amount,p_billed,p_start,p_end)
 on conflict(environment,order_id) do nothing; -- a later refund never replenishes a spent month
end $$;
revoke all on function public.report_promotion_invoice(text,text,text,integer,timestamptz,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.report_promotion_invoice(text,text,text,integer,timestamptz,timestamptz,timestamptz) to service_role;
create table private.report_promotion_failures (
 account_id uuid not null references public.profiles(id), environment text not null check(environment in ('sandbox','production')),
 code text not null check(code in ('polar_discount_unmanaged','polar_discount_catalog_mismatch','polar_discount_subscription_changed',
 'polar_discount_not_applied','polar_discount_invalid_response','polar_discount_http_failed','promotion_account_failed','promotion_not_authorized','promotion_repair_lease_lost')),
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
create function public.report_promotion_checkout(p_account uuid,p_environment text,p_product text,p_now timestamptz default clock_timestamp())
returns text language plpgsql security definer set search_path='' as $$
declare discount text;
begin
 if private.lock_account_write(p_account) then raise sqlstate '28000' using message='account_deleted'; end if;
 if not private.report_promotion_eligible(p_now) or exists(select 1 from private.report_promotions where account_id=p_account and environment=p_environment) then return null; end if;
 select launch_discount into discount from private.report_promotion_catalog where environment=p_environment and product_id=p_product;
 return discount;
end $$;
revoke all on function public.report_promotion_checkout(uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.report_promotion_checkout(uuid,text,text,timestamptz) to service_role;

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
   if p_modified<=existing.observed_at or (p_subscription<>existing.subscription_id and p_started<existing.current_started_at) then return; end if;
   if existing.subscription_id<>p_subscription or existing.product_id<>p_product then
     select greatest(p_modified,coalesce(max(lease_until),p_modified)) into until_time from private.report_promotion_changes
      where account_id=p_account and environment=p_environment and applied_at is null and superseded_at is null;
     insert into private.report_promotion_transfers(account_id,environment,subscription_id,product_id,next_subscription_id,next_product_id,observed_at,cleanup_after,cleared_at)
     values(p_account,p_environment,existing.subscription_id,existing.product_id,p_subscription,p_product,p_modified,until_time,
       case when existing.subscription_id=p_subscription then p_modified end);
     update private.report_promotion_changes set superseded_at=p_modified where account_id=p_account and environment=p_environment and applied_at is null and superseded_at is null;
     update private.report_promotions set subscription_id=p_subscription,product_id=p_product,current_started_at=p_started,
      remote_discount=p_discount,observed_at=p_modified,applied_at=null,applied_discount=null,
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
 'last_error',(select f.code from private.report_promotion_failures f where f.account_id=p.account_id and f.environment=p.environment and f.resolved_at is null),'tier',p.tier,'forfeited',p.forfeited,'active_discount',case when p.applied_at is null then p.remote_discount else p.applied_discount end,'applied_at',p.applied_at,
 'reward_until',p.reward_until,'window_end',p.subscribed_at+interval '1080 hours')
 from private.report_promotions p where account_id=p_account and environment=p_environment
 and not exists(select 1 from public.account_identities i where i.account_id=p.account_id and i.deleted_at is not null)
$$;

-- A stable pending operation survives HTTP timeouts. Repeated webhooks never add months.
create function public.report_promotion_prepare(p_account uuid,p_environment text,p_now timestamptz default clock_timestamp())
returns jsonb language plpgsql security definer set search_path='' as $$
declare p private.report_promotions; s public.billing_subscriptions; c private.report_promotion_catalog;
 stats jsonb; earned integer; desired text; next_bill timestamptz; op private.report_promotion_changes; prior private.report_promotion_transfers; target_sub text; target_product text; action_kind text:='apply'; spent integer; repair text;
begin
 if private.lock_account_write(p_account) then return null; end if;
 select * into p from private.report_promotions where account_id=p_account and environment=p_environment for update;
 if not found then return null; end if;
 select * into s from public.billing_subscriptions where user_id=p_account and provider='polar'
  and environment=p_environment and provider_subscription_id=p.subscription_id;
 if not found or s.status not in ('active','uncanceled') or s.provider_product_id is distinct from p.product_id then return null; end if;
 -- An active subscription event may precede its first invoice. Never replace
 -- the launch discount until a paid invoice for this exact subscription exists.
 if not exists(select 1 from public.billing_orders o where o.user_id=p_account and o.provider='polar'
  and o.environment=p_environment and o.provider_subscription_id=p.original_subscription_id and o.paid and o.status='paid' and o.currency='eur') then return null; end if;
 select * into c from private.report_promotion_catalog where environment=p_environment and product_id=p.product_id;
 stats:=private.report_promotion_progress(p_account,p_environment,p_now);
 earned:=case when (stats->>'accepted')::integer>=5 then 6 when (stats->>'accepted')::integer>=2 then 3 else 0 end;
 -- Benefits are consumed by settled recurring invoice periods, never by the mirror clock.
 p.forfeited:=p.forfeited or (stats->>'spam')::integer>=2;
 if earned>p.tier and not p.forfeited then
   p.tier:=earned; p.reward_granted_at:=p_now;
 end if;
 select count(distinct i.period_start)::integer,min(i.period_start),max(i.period_end)
 into spent,p.reward_from,p.reward_until
 from private.report_promotion_invoices i join private.report_promotion_catalog x on x.environment=i.environment and x.product_id=i.product_id
 where i.account_id=p_account and i.environment=p_environment and i.billed_at>=p.reward_granted_at and i.billed_at<=p_now
 and i.discount_amount>0 and i.discount_id=case p.tier when 6 then x.reward6_discount when 3 then x.reward3_discount end;
 desired:=null;
 if p.tier>0 and spent<p.tier then
   desired:=case p.tier when 6 then c.reward6_discount else c.reward3_discount end;
 end if;
 -- A paid, undiscounted renewal after the last confirmed application proves a
 -- provider-side expiry/missed cycle. Repair exactly once for that invoice.
 select i.order_id into repair from private.report_promotion_invoices i
 where i.account_id=p_account and i.environment=p_environment and i.subscription_id=p.subscription_id
 and i.billed_at>p.applied_at and i.billed_at<=p_now and i.discount_amount=0
 and i.order_id is distinct from p.repaired_order_id order by i.billed_at desc,i.order_id desc limit 1;
 if desired is null then repair:=null; end if;
 next_bill:=coalesce(s.current_period_end,p_now); -- creator comparison only; never reward budget
 -- Compare actual cents, never stack. Ties keep the report reward. Creator is
 -- available for the first two calendar months only; reports never affect invoice 1.
 if p.creator_discount is not null and next_bill<private.report_promotion_months(p.subscribed_at,2)
  and (desired is null or round(c.normal_cents*0.20)>c.normal_cents-c.launch_cents) then desired:=p.creator_discount; end if;
 update private.report_promotions set tier=p.tier,reward_granted_at=p.reward_granted_at,reward_from=p.reward_from,reward_until=p.reward_until,forfeited=p.forfeited
  where account_id=p_account and environment=p_environment;
 target_sub:=p.subscription_id; target_product:=p.product_id;
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
   if repair is null and action_kind='apply' and p.applied_at is not null and p.applied_discount is not distinct from desired and p.remote_discount is not distinct from desired then return null; end if;
   insert into private.report_promotion_changes(account_id,environment,discount_id,tier,subscription_id,product_id,kind,repair_order_id) values(p_account,p_environment,desired,p.tier,target_sub,target_product,action_kind,repair) returning * into op;
 end if;
 return jsonb_build_object('id',op.id,'subscription_id',op.subscription_id,'product_id',op.product_id,'kind',op.kind,'repair',op.repair_order_id is not null,'phase',op.phase,'remaining',greatest(0,p.tier-spent),
  'discount_id',op.discount_id,'tier',op.tier,'normal_cents',c.normal_cents,'managed_discount_ids',(select jsonb_agg(d) from (select unnest(array[x.launch_discount,x.reward3_discount,x.reward6_discount]) d from private.report_promotion_catalog x where x.environment=p_environment union select p.creator_discount where op.kind='apply') discounts));
end $$;

-- Revalidate immediately before HTTP, and again at ACK, using the same B03 UUID lock.
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
create function public.report_promotion_ack(p_id uuid,p_token uuid,p_now timestamptz default clock_timestamp()) returns boolean
language plpgsql security definer set search_path='' as $$
declare op private.report_promotion_changes;
begin
 select * into op from private.report_promotion_changes where id=p_id;
 if not found or private.lock_account_write(op.account_id) then return false; end if;
 update private.report_promotion_changes set applied_at=p_now where id=p_id and applied_at is null and superseded_at is null and lease_token=p_token and lease_until>p_now;
 if not found then return false; end if;
 update private.report_promotion_failures set resolved_at=p_now where account_id=op.account_id and environment=op.environment and resolved_at is null;
 if op.kind='cleanup' then
   update private.report_promotion_transfers set cleared_at=p_now where account_id=op.account_id and environment=op.environment and subscription_id=op.subscription_id and product_id=op.product_id and cleared_at is null;
 else
   update private.report_promotions set applied_discount=op.discount_id,remote_discount=op.discount_id,applied_at=p_now,repaired_order_id=coalesce(op.repair_order_id,repaired_order_id) where account_id=op.account_id and environment=op.environment and subscription_id=op.subscription_id and product_id=op.product_id;
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
 public.report_promotion_ack(uuid,uuid,timestamptz),public.report_promotion_accounts(text,uuid) from public,anon,authenticated;
grant execute on function public.report_promotion_observe(uuid,text,text,text,timestamptz,timestamptz,text),
 public.report_promotion_prepare(uuid,text,timestamptz),public.report_promotion_claim(uuid,uuid,timestamptz),
 public.report_promotion_ack(uuid,uuid,timestamptz),public.report_promotion_accounts(text,uuid) to service_role;
commit;
