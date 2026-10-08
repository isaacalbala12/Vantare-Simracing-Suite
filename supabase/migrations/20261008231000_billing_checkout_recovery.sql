begin;
-- Keep unknown results durable. Never erase uncertainty and create a second checkout.
create or replace function public.claim_billing_checkout_attempt(
  p_user_id uuid,p_attempt_id uuid,p_checkout_key text,p_environment text,p_catalog_version text
) returns table(outcome text,checkout_url text)
language plpgsql security definer set search_path='' as $$
declare existing public.billing_checkout_attempts;
begin
  insert into public.billing_checkout_attempts(user_id,attempt_id,checkout_key,environment,catalog_version,status)
    values(p_user_id,p_attempt_id,p_checkout_key,p_environment,p_catalog_version,'creating')
    on conflict(user_id,attempt_id) do nothing;
  if found then return query select 'claimed'::text,null::text; return; end if;
  select * into existing from public.billing_checkout_attempts
    where user_id=p_user_id and attempt_id=p_attempt_id for update;
  if existing.checkout_key<>p_checkout_key or existing.environment<>p_environment or existing.catalog_version<>p_catalog_version then
    return query select 'conflict'::text,null::text;
  elsif existing.status='uncertain' or (existing.status='creating' and existing.updated_at<now()-interval '1 minute') then
    return query select 'uncertain'::text,null::text;
  elsif existing.expires_at<=now() then return query select 'expired'::text,null::text;
  elsif existing.status='open' then return query select 'reused'::text,existing.checkout_url;
  else return query select 'busy'::text,null::text; end if;
end $$;

create function public.recover_billing_checkout_attempt(
  p_user_id uuid,p_attempt_id uuid,p_environment text,p_checkout_key text,p_catalog_version text,
  p_checkout_id text,p_checkout_url text,p_created_at timestamptz,p_expires_at timestamptz
) returns boolean language plpgsql security definer set search_path='' as $$
declare a public.billing_checkout_attempts;
begin
  select * into a from public.billing_checkout_attempts where user_id=p_user_id and attempt_id=p_attempt_id for update;
  if not found or a.environment<>p_environment or a.checkout_key<>p_checkout_key
    or a.catalog_version<>p_catalog_version or p_created_at<a.created_at-interval '5 seconds'
    or p_created_at>a.created_at+interval '1 minute' or p_expires_at is null
    or p_created_at is null or p_checkout_id is null or length(p_checkout_id) not between 1 and 200
    or p_checkout_url is null or p_checkout_url !~ case when p_environment='sandbox'
      then '^https://sandbox\.polar\.sh/' else '^https://polar\.sh/' end then return false; end if;
  if a.provider_checkout_id is not null and a.provider_checkout_id<>p_checkout_id then raise exception 'checkout_binding_conflict'; end if;
  update public.billing_checkout_attempts set status='open',provider_checkout_id=p_checkout_id,
    checkout_url=p_checkout_url,expires_at=least(expires_at,p_expires_at),updated_at=now()
    where user_id=p_user_id and attempt_id=p_attempt_id;
  -- The existing trigger retains the binding even after URL expiry (paid order recovery).
  return true;
end $$;
revoke all on function public.recover_billing_checkout_attempt(uuid,uuid,text,text,text,text,text,timestamptz,timestamptz)
  from public,anon,authenticated;
grant execute on function public.recover_billing_checkout_attempt(uuid,uuid,text,text,text,text,text,timestamptz,timestamptz) to service_role;
alter table private.billing_reconciliation_cursor drop constraint billing_reconciliation_cursor_resource_check;
alter table private.billing_reconciliation_cursor add constraint billing_reconciliation_cursor_resource_check
  check(resource in ('checkouts','orders','subscriptions','refunds','disputes'));
alter table private.billing_reconciliation_cursor alter column resource set default 'checkouts';
create or replace function public.complete_billing_reconciliation(p_environment text,p_lease_token uuid,p_next_resource text,p_next_page integer)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if p_next_resource not in ('checkouts','orders','subscriptions','refunds','disputes') or p_next_resource is null
    or p_next_page is null or p_next_page<1 then raise exception 'invalid_reconciliation_cursor'; end if;
  update private.billing_reconciliation_cursor set resource=p_next_resource,page=p_next_page,
    last_progress_at=clock_timestamp(),lease_until=clock_timestamp()+interval '2 minutes'
    where environment=p_environment and lease_token=p_lease_token and lease_until>clock_timestamp();
  return found;
end $$;
commit;
