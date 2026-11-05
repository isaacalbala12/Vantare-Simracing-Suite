begin;
set local lock_timeout='5s';
CREATE OR REPLACE FUNCTION public.native_admin_execute(p_actor uuid, p_issuer text, p_action text, p_params jsonb, p_environment text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_result jsonb; v_monthly uuid; v_annual uuid; account uuid; current_enabled boolean;
begin
 if p_action='list_pending_effects' then
  perform private.lock_accounts_before_rows(array[p_actor]);
  perform private.native_admin_require_owner(p_actor);
  if p_issuer is null or p_issuer!~'^https://' or p_environment is null or p_environment not in('production','sandbox')
   or jsonb_typeof(p_params) is distinct from 'object' or p_params-array['cursor']<>'{}'
   or (p_params ? 'cursor' and (jsonb_typeof(p_params->'cursor') is distinct from 'string'
    or (p_params->>'cursor')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) then
   raise exception 'native_admin_invalid' using errcode='22023'; end if;
  with page as (
   select effect_id,request_id,action,effect,occurred_at,latest_outcome,latest_provider_status
   from private.admin_pending_effects where not(p_params ? 'cursor') or effect_id>(p_params->>'cursor')::uuid
   order by effect_id limit 51
  ), numbered as (select *,row_number() over(order by effect_id) n from page)
  select jsonb_build_object('effects',coalesce(jsonb_agg(jsonb_build_object(
   'effect_id',effect_id,'request_id',request_id,'action',action,'effect',effect,
   'occurred_at',occurred_at,'outcome',latest_outcome,'http_status',latest_provider_status) order by effect_id)
   filter(where n<=50),'[]'::jsonb),'next_cursor',
   (select effect_id from numbered where n=50 and exists(select 1 from numbered where n=51)))
  into v_result from numbered;
  return v_result;
 end if;
 if p_action in('set_module','set_rollout') then
  if jsonb_typeof(p_params->'expected_enabled') is distinct from 'boolean' then raise exception 'native_admin_invalid' using errcode='22023'; end if;
  account:=case when p_action='set_module' then (p_params->>'account_id')::uuid else null end;
  perform private.lock_accounts_before_rows(array[p_actor,account]);
  perform private.native_admin_require_owner(p_actor);
  if account is not null then
   perform 1 from public.profiles where id=account for update;
   if not found then raise exception 'native_admin_not_found' using errcode='P0002'; end if;
  end if;
  select enabled_for_all into current_enabled from public.module_rollout where module=p_params->>'module' for update;
  if not found then raise exception 'native_admin_invalid' using errcode='22023'; end if;
  if p_action='set_module' then
   select exists(select 1 from public.billing_effective_access_grants
    where user_id=account and environment=p_environment and status='active'
     and (valid_until is null or valid_until>now()) and capability=p_params->>'module'
     and provider='vantare' and source_type='support') into current_enabled;
  end if;
  if current_enabled is distinct from (p_params->>'expected_enabled')::boolean then
   raise exception 'account_conflict' using errcode='40001'; end if;
  return private.native_admin_execute_before_creator_coupon(p_actor,p_issuer,p_action,p_params-'expected_enabled',p_environment);
 end if;
 if p_action='activate_creator' and p_params ? 'annual_discount_id' then
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_environment||':creator-coupons',0));
  v_monthly:=(p_params->>'discount_id')::uuid; v_annual:=(p_params->>'annual_discount_id')::uuid;
  if v_monthly is null or v_annual is null or v_monthly=v_annual or v_monthly='00000000-0000-0000-0000-000000000000'::uuid or v_annual='00000000-0000-0000-0000-000000000000'::uuid then raise exception 'creator_coupon_mismatch'; end if;
  if exists(select 1 from private.admin_creators where environment=p_environment and creator_id<>(p_params->>'creator_id')::uuid and (discount_id in(v_monthly::text,v_annual::text) or annual_discount_id in(v_monthly,v_annual))) then raise exception 'creator_coupon_mismatch'; end if;
  if exists(select 1 from private.admin_creators where environment=p_environment and creator_id=(p_params->>'creator_id')::uuid and annual_discount_id is not null and annual_discount_id<>v_annual) then raise exception 'creator_coupon_mismatch'; end if;
  v_result:=private.native_admin_execute_before_creator_coupon(p_actor,p_issuer,p_action,p_params,p_environment);
  update private.admin_creators set annual_discount_id=v_annual where creator_id=(p_params->>'creator_id')::uuid and environment=p_environment and discount_id=v_monthly::text;
  if not found then raise exception 'creator_coupon_mismatch'; end if;
  return v_result;
 end if;
 return private.native_admin_execute_before_creator_coupon(p_actor,p_issuer,p_action,p_params,p_environment);
end $$;
CREATE OR REPLACE FUNCTION public.native_admin_claim_change(p_actor uuid, p_request uuid, p_account uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_token uuid;
begin
 perform private.lock_accounts_before_rows(array[p_actor,p_account]);
 perform private.native_admin_require_owner(p_actor);
 if p_request is null or p_account is null then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 -- Keep the previous request reference on release. Never overwrite it while
 -- any of its effects is unresolved, including Polar effects with another hash.
 -- The identity fallback also covers Clerk intents from pre-lease step 5a.
 if exists(select 1 from private.admin_pending_effects e where
   e.request_id=(select request_id from private.admin_change_leases where account_id=p_account)
   or e.target_hash in (select encode(sha256(convert_to(i.subject,'UTF8')),'hex')
                       from public.account_identities i where i.account_id=p_account))
 then
  if exists(select 1 from private.admin_change_leases where account_id=p_account and expires_at>clock_timestamp()) then
   raise exception 'native_admin_change_in_progress' using errcode='40001'; end if;
  raise exception 'native_admin_effects_pending' using errcode='40001'; end if;

 insert into private.admin_change_leases as l(account_id,actor,request_id,token,expires_at)
 values(p_account,p_actor,p_request,gen_random_uuid(),clock_timestamp()+interval '480 seconds')
 on conflict(account_id) do update set
 actor=excluded.actor,request_id=excluded.request_id,
 token=case when l.expires_at>clock_timestamp() and l.actor=p_actor and l.request_id=p_request then l.token else excluded.token end,
 expires_at=case when l.expires_at>clock_timestamp() and l.actor=p_actor and l.request_id=p_request then l.expires_at else clock_timestamp()+interval '480 seconds' end
 where l.expires_at<=clock_timestamp() or (l.actor=p_actor and l.request_id=p_request)
 returning token into v_token;
 if v_token is null then raise exception 'native_admin_change_in_progress' using errcode='40001'; end if;
 return v_token;
end;
$$;
revoke all on function public.native_admin_execute(uuid,text,text,jsonb,text),public.native_admin_claim_change(uuid,uuid,uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.native_admin_execute(uuid,text,text,jsonb,text),public.native_admin_claim_change(uuid,uuid,uuid) to service_role;
commit;
