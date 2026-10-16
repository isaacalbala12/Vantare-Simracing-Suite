-- #1593 P3-E: Isaac defers the report reward program until its own announcement.
begin;

-- A private operator policy is the only enrollment schedule; no launch dates.
alter table private.report_promotion_policy
 add column enrollment_enabled boolean not null default false,
 add column enrollment_starts_at timestamptz,
 add column enrollment_ends_at timestamptz,
 add constraint report_enrollment_window_valid check(
  (enrollment_starts_at is null and enrollment_ends_at is null)
  or (enrollment_starts_at is not null and enrollment_ends_at is not null
   and isfinite(enrollment_starts_at) and isfinite(enrollment_ends_at)
   and enrollment_ends_at>enrollment_starts_at)),
 add constraint report_enrollment_requires_window check(
  not enrollment_enabled or (enrollment_starts_at is not null and enrollment_ends_at is not null));

create function private.report_promotion_enrollment_open(t timestamptz) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select enrollment_enabled and t is not null and isfinite(t)
  and t>=enrollment_starts_at and t<enrollment_ends_at
  from private.report_promotion_policy where singleton),false)
$$;
alter function private.report_promotion_enrollment_open(timestamptz) owner to postgres;
revoke all on function private.report_promotion_enrollment_open(timestamptz) from public,anon,authenticated,service_role;
comment on function private.report_promotion_eligible(timestamptz) is
 'Historical name: launch first-period checkout window only. Report enrollment uses report_promotion_enrollment_open and its independent, disabled-by-default policy.';

-- Keep transfers/observations of existing rights; gate only first enrollment.
create or replace function public.report_promotion_observe(p_account uuid,p_environment text,p_subscription text,p_product text,
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
   if not coalesce(private.report_promotion_enrollment_open(p_started),false) then return; end if;
   insert into private.report_promotions(account_id,environment,subscription_id,original_subscription_id,product_id,subscribed_at,current_started_at,first_renewal,observed_at,creator_discount,remote_discount)
   values(p_account,p_environment,p_subscription,p_subscription,p_product,p_started,p_started,private.report_promotion_months(p_started,1),p_modified,
    case when exists(select 1 from private.report_promotion_creators where environment=p_environment and product_id=p_product and discount_id=p_discount) then p_discount end,p_discount);
 end if;
end $$;
alter function public.report_promotion_observe(uuid,text,text,text,timestamptz,timestamptz,text) owner to postgres;
revoke all on function public.report_promotion_observe(uuid,text,text,text,timestamptz,timestamptz,text) from public,anon,authenticated;
grant execute on function public.report_promotion_observe(uuid,text,text,text,timestamptz,timestamptz,text) to service_role;

commit;
