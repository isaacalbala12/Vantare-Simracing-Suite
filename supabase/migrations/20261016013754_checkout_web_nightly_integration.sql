-- VANTA-42 / #1663: compose the canonical #1661/#1593 policy with the
-- app/web dispatch barrier. Do not rewrite shipped migrations or enable refunds.
begin;
do $merge$ declare definition text; begin
 definition:=pg_get_functiondef('public.claim_billing_checkout_attempt(uuid,uuid,text,text,text)'::regprocedure);
 definition:=replace(definition,
  $a$p_checkout_key not in ('launch_lifetime','pro_monthly'$a$,
  $b$p_checkout_key not in ('founders','launch_lifetime','pro_monthly'$b$);
 definition:=replace(definition,
  $a$family:=case when p_checkout_key='launch_lifetime' then 'launch' else 'subscription' end;$a$,
  $b$family:=case when p_checkout_key='founders' then 'founders' when p_checkout_key='launch_lifetime' then 'launch' else 'subscription' end;$b$);
 definition:=replace(definition,
  'perform private.lock_accounts_before_rows(array[p_user_id]);',
  $policy$perform private.lock_accounts_before_rows(array[p_user_id]);
 if not exists(select 1 from public.profiles where id=p_user_id) then
  raise sqlstate '23503' using message='account_unavailable';
 end if;
 if public.billing_purchase_policy(p_user_id,p_environment,p_checkout_key)->>'reason' is not null then
  raise exception '%',public.billing_purchase_policy(p_user_id,p_environment,p_checkout_key)->>'reason';
 end if;
 if exists(select 1 from public.billing_checkout_attempts a where a.user_id=p_user_id
  and a.environment=p_environment and a.attempt_id<>p_attempt_id and a.resolution is null
  and (p_checkout_key='founders' or a.checkout_key='founders')) then
  raise exception 'founders_checkout_pending';
 end if;$policy$);
 definition:=replace(definition,
  $a$case when family='launch' then 'vantare.edition.launch_v1' else 'vantare.plan.pro' end$a$,
  $b$case when family='founders' then 'vantare.plan.founders' when family='launch' then 'vantare.edition.launch_v1' else 'vantare.plan.pro' end$b$);
 execute definition;
end $merge$;

-- Preserve the canonical atomic creator reservation, including the guard
-- attestation needed by the app/web adapter. Attribution failure rolls back.
drop function public.claim_billing_creator_checkout_attempt(uuid,uuid,text,text,text,text,uuid);
create function public.claim_billing_creator_checkout_attempt(
 p_user_id uuid,p_attempt_id uuid,p_checkout_key text,p_environment text,
 p_catalog_version text,p_creator_code text,p_creator_discount uuid)
returns table(outcome text,checkout_url text,guard_version integer)
language plpgsql security definer set search_path='' as $$
declare v_claim record;
begin
 select * into v_claim from public.claim_billing_checkout_attempt(
  p_user_id,p_attempt_id,p_checkout_key,p_environment,p_catalog_version);
 if v_claim.outcome='claimed' and not public.billing_save_creator_attribution(
  p_user_id,p_environment,p_attempt_id,p_creator_code,p_creator_discount)
 then raise exception 'creator_attribution_conflict'; end if;
 return query select v_claim.outcome::text,v_claim.checkout_url::text,v_claim.guard_version::integer;
end $$;
revoke all on function public.claim_billing_creator_checkout_attempt(uuid,uuid,text,text,text,text,uuid) from public,anon,authenticated,web_purchase_erasure;
grant execute on function public.claim_billing_creator_checkout_attempt(uuid,uuid,text,text,text,text,uuid) to service_role;
alter function public.claim_billing_creator_checkout_attempt(uuid,uuid,text,text,text,text,uuid) owner to postgres;
-- A canonical terminal attempt can release the offer reservation immediately.
-- Keep #1593's CAS, account history and remote proof rules for all other cases.
-- #1673 may already be installed during an upgrade. Patch its private
-- reservation implementation, never the public registry validator.
do $merge$ declare definition text; before text; reservation regprocedure; begin
 reservation:=coalesce(
  to_regprocedure('private.billing_launch_checkout_before_1593_guard(uuid,text,text,text,text,timestamptz,uuid,uuid)'),
  'public.billing_launch_checkout(uuid,text,text,text,text,timestamptz,uuid,uuid)'::regprocedure);
 definition:=pg_get_functiondef(reservation);
 before:=$a$if p_now<greatest(used.reserved_at+interval '30 minutes',prior.expires_at)
    or (used.remote_pending and coalesce(used.checkout_id,prior.provider_checkout_id) is not null and p_replaces is distinct from used.attempt_id) then$a$;
 if position(before in definition)=0 then raise exception 'launch_guard_contract_changed'; end if;
 definition:=replace(definition,before,$b$if prior.resolution is null and (p_now<greatest(used.reserved_at+interval '30 minutes',prior.expires_at)
    or (used.remote_pending and coalesce(used.checkout_id,prior.provider_checkout_id) is not null and p_replaces is distinct from used.attempt_id)) then$b$);
 execute definition;
end $merge$;
-- Founders is now a canonical catalogue capability. This only lets its own
-- marked orders be observed; all R5 inbox/disposition/switch checks remain.
do $merge$ declare definition text; before text; begin
 definition:=pg_get_functiondef('private.observe_checkout_payment_unchecked(text,uuid,uuid,uuid,uuid,uuid,bigint,text,text[],uuid,uuid)'::regprocedure);
 before:=$a$'vantare.edition.launch_v1']$a$;
 if position(before in definition)=0 then raise exception 'compensation_capability_contract_changed'; end if;
 execute replace(definition,before,$b$'vantare.edition.launch_v1','vantare.plan.founders']$b$);
end $merge$;
commit;
