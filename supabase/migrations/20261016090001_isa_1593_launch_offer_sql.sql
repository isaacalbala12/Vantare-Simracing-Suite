begin;

-- #1593 P3-D: operator projection of #1661's validated product map and catalogue.
-- Empty by default: apply reviewed offline registration SQL before deploying checkout.
create table private.billing_launch_offers (
 environment text not null check(environment in ('sandbox','production')),
 checkout_key text not null check(checkout_key in ('pro_monthly','pro_annual','pro_plus_monthly','pro_plus_annual')),
 product_id uuid not null check(product_id<>'00000000-0000-0000-0000-000000000000'),
 discount_id uuid not null check(discount_id<>'00000000-0000-0000-0000-000000000000'),
 starts_at timestamptz not null check(isfinite(starts_at)),
 ends_at timestamptz not null check(isfinite(ends_at)),
 catalog_version text not null check(length(catalog_version) between 1 and 200),
 registered_at timestamptz not null default clock_timestamp(),
 primary key(environment,checkout_key), unique(environment,product_id),
 check(product_id<>discount_id), check(ends_at>starts_at)
);
alter table private.billing_launch_offers owner to postgres;
alter table private.billing_launch_offers enable row level security;
revoke all on private.billing_launch_offers from public,anon,authenticated,service_role;

-- Preserve the single entitlement/reservation implementation behind the SQL guard.
drop function public.report_promotion_checkout(uuid,text,text,timestamptz,uuid,uuid);
alter function public.billing_launch_checkout(uuid,text,text,text,text,timestamptz,uuid,uuid) set schema private;
alter function private.billing_launch_checkout(uuid,text,text,text,text,timestamptz,uuid,uuid) rename to billing_launch_checkout_before_1593_guard;
revoke all on function private.billing_launch_checkout_before_1593_guard(uuid,text,text,text,text,timestamptz,uuid,uuid) from public,anon,authenticated,service_role;
alter function private.billing_launch_checkout_before_1593_guard(uuid,text,text,text,text,timestamptz,uuid,uuid) owner to postgres;

create function public.billing_launch_checkout(p_account uuid,p_environment text,p_product text,p_discount text,p_key text,p_now timestamptz,p_attempt uuid,p_replaces uuid default null)
returns text language plpgsql security definer set search_path='' as $$
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
end $$;
alter function public.billing_launch_checkout(uuid,text,text,text,text,timestamptz,uuid,uuid) owner to postgres;
revoke all on function public.billing_launch_checkout(uuid,text,text,text,text,timestamptz,uuid,uuid) from public,anon,authenticated;
grant execute on function public.billing_launch_checkout(uuid,text,text,text,text,timestamptz,uuid,uuid) to service_role;

commit;
