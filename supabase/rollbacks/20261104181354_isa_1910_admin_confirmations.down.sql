begin;
do $$begin if exists(select 1 from private.mail_campaigns where state='canceled') then raise exception 'canceled_campaigns_require_forward_fix' using errcode='55000'; end if; end $$;
alter table private.mail_campaigns drop constraint mail_campaigns_state_check;
alter table private.mail_campaigns add constraint mail_campaigns_state_check check(state in('draft','sending','completed'));
CREATE OR REPLACE FUNCTION public.mail_admin_execute(p_actor uuid, p_action text, p_params jsonb, p_environment text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare response jsonb; failures jsonb;
begin
 -- Inner function authenticates Owner and takes the existing account/queue locks first.
 response:=private.mail_admin_execute_v2(p_actor,p_action,p_params,p_environment);
 if p_action='mail_list' then
  perform public.mail_erasure_expire();
  select coalesce(jsonb_agg(to_jsonb(f)),'[]') into failures from (
   select id,attempts,last_http_status,outcome as reason,failed_at from private.mail_contact_erasures
   where state='failed' order by failed_at,id limit 20
  ) f;
  response:=response||jsonb_build_object('cleanup',jsonb_build_object(
   'pending',(select count(*) from private.mail_contact_erasures where state in('pending','processing')),
   'completed',(select count(*) from private.mail_contact_erasures where state='completed'),
   'failed',(select count(*) from private.mail_contact_erasures where state='failed'),'failures',failures));
 end if;
 return response;
end $$;

CREATE OR REPLACE FUNCTION public.native_admin_execute(p_actor uuid, p_issuer text, p_action text, p_params jsonb, p_environment text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_result jsonb; v_monthly uuid; v_annual uuid;
begin
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

revoke all on function public.mail_admin_execute(uuid,text,jsonb,text), public.native_admin_execute(uuid,text,text,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.mail_admin_execute(uuid,text,jsonb,text), public.native_admin_execute(uuid,text,text,jsonb,text) to service_role;
revoke all on table private.mail_campaigns from public,anon,authenticated,service_role;
commit;
