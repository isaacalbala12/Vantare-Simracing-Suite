-- VANTA-42 / ISA-1620. Shared app/web checkout; preserve #1622 tombstones.
-- Prepared migration only. Does not configure providers, activate sales or grant access.
-- Same five arguments as the app. Both adapters require guard_version=1.
begin;
drop function public.claim_billing_checkout_attempt(uuid,uuid,text,text,text);
create function public.claim_billing_checkout_attempt(
 p_user_id uuid,p_attempt_id uuid,p_checkout_key text,p_environment text,p_catalog_version text
)
returns table(outcome text,checkout_url text,guard_version integer)
language plpgsql security definer set search_path='' as $$
declare
 existing public.billing_checkout_attempts%rowtype;
 family text;
begin
 if p_user_id is null or p_attempt_id is null or p_environment not in ('sandbox','production')
    or p_checkout_key not in ('launch_lifetime','pro_monthly','pro_annual','pro_plus_monthly','pro_plus_annual')
    or p_environment is null or p_checkout_key is null
    or nullif(trim(p_catalog_version),'') is null then
   raise sqlstate '23514' using message='invalid_checkout_claim';
 end if;
 family:=case when p_checkout_key='launch_lifetime' then 'launch' else 'subscription' end;
 -- #1622 authority and lock order: UUID BEFORE any attempt/profile row.
 -- This existing account lock also serializes app/web claims; no parallel lock.
 perform private.lock_accounts_before_rows(array[p_user_id]);
 if exists(select 1 from public.billing_effective_access_grants g
   where g.user_id=p_user_id and g.environment=p_environment and g.status='active'
     and (g.valid_until is null or g.valid_until>now())
     and g.capability=case when family='launch' then 'vantare.edition.launch_v1' else 'vantare.plan.pro' end) then
   return query select 'conflict'::text,null::text,1; return;
 end if;
 select * into existing from public.billing_checkout_attempts a
   where a.user_id=p_user_id and a.attempt_id=p_attempt_id;
 if found then
   if existing.checkout_key<>p_checkout_key or existing.environment<>p_environment
      or existing.catalog_version<>p_catalog_version then
     return query select 'conflict'::text,null::text,1;
   elsif existing.expires_at<=now() then
     return query select 'expired'::text,null::text,1;
   elsif existing.status='open' then
     if existing.provider_checkout_id is null or not exists(
       select 1 from public.billing_checkout_bindings b
       where b.environment=existing.environment and b.provider_checkout_id=existing.provider_checkout_id
         and b.user_id=existing.user_id and b.attempt_id=existing.attempt_id
         and b.checkout_key=existing.checkout_key and b.catalog_version=existing.catalog_version) then
       return query select 'uncertain'::text,null::text,1;
     else
       return query select 'reused'::text,existing.checkout_url,1;
     end if;
   elsif existing.status='uncertain' then
     return query select 'uncertain'::text,null::text,1;
   else
     return query select 'busy'::text,null::text,1;
   end if;
   return;
 end if;
 if exists(select 1 from public.billing_checkout_attempts a
   where a.user_id=p_user_id and a.environment=p_environment
     and (case when a.checkout_key='launch_lifetime' then 'launch' else 'subscription' end)=family) then
   -- An expired/uncertain row is not proof of an unpaid/expired Polar session.
   -- Support reconciles it; never erase evidence on an unrelated user's claim.
   return query select 'busy'::text,null::text,1; return;
 end if;
 insert into public.billing_checkout_attempts(user_id,attempt_id,checkout_key,environment,catalog_version,status)
   values(p_user_id,p_attempt_id,p_checkout_key,p_environment,p_catalog_version,'creating');
 return query select 'claimed'::text,null::text,1;
end $$;
revoke all on function public.claim_billing_checkout_attempt(uuid,uuid,text,text,text)
 from public,anon,authenticated;
grant execute on function public.claim_billing_checkout_attempt(uuid,uuid,text,text,text) to service_role;
comment on function public.claim_billing_checkout_attempt(uuid,uuid,text,text,text) is
 'Guard v1: #1622 UUID barrier, atomic app/web account/environment/family deduplication and active-access check. No unsafe TTL deletion; stale attempts require reconciliation.';

-- A checkout without provider ID cannot activate retain_checkout_binding.
-- Preserve the same UUID-before-rows barrier on completion, including no-ops.
create or replace function public.complete_billing_checkout_attempt(
 p_user_id uuid,p_attempt_id uuid,p_provider_checkout_id text,p_checkout_url text
)
returns boolean language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
 perform private.lock_accounts_before_rows(array[p_user_id]);
 if nullif(trim(p_provider_checkout_id),'') is null or length(p_provider_checkout_id)>200
    or nullif(trim(p_checkout_url),'') is null then return false; end if;
 update public.billing_checkout_attempts
 set status='open',provider_checkout_id=p_provider_checkout_id,checkout_url=p_checkout_url,updated_at=now()
 where user_id=p_user_id and attempt_id=p_attempt_id and status='creating' and expires_at>now();
 get diagnostics affected=row_count;
 return affected=1;
end $$;
revoke all on function public.complete_billing_checkout_attempt(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.complete_billing_checkout_attempt(uuid,uuid,text,text) to service_role;
comment on table public.billing_checkout_attempts is
 'Server-only shared app/web dedupe. Expired leases do not prove Polar expiry. Preserve unresolved attempts for authorized reconciliation; never delete on another claim.';
commit;
