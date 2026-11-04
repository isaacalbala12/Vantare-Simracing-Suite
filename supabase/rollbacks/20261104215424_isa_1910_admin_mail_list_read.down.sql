begin;
set local lock_timeout='5s';
CREATE OR REPLACE FUNCTION public.mail_admin_execute(p_actor uuid, p_action text, p_params jsonb, p_environment text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare response jsonb; failures jsonb; c private.mail_campaigns%rowtype; recipients bigint;
begin
 -- Same account/queue lock order as dispatch, consent and withdrawal.
 if p_actor is null or private.lock_account_write(p_actor) then raise exception 'native_admin_forbidden' using errcode='42501'; end if;
 perform private.native_admin_require_owner(p_actor);
 perform pg_advisory_xact_lock(1636,300);
 if p_environment is null or p_environment not in('sandbox','production') or jsonb_typeof(p_params) is distinct from 'object' then
  raise exception 'native_admin_invalid' using errcode='22023'; end if;
 if p_action='mail_approve' then
  if jsonb_typeof(p_params->'expected_recipients') is distinct from 'number'
   or (p_params->>'expected_recipients') !~ '^[0-9]+$' then raise exception 'native_admin_invalid' using errcode='22023'; end if;
  response:=private.mail_admin_execute_v2(p_actor,p_action,p_params-'expected_recipients',p_environment);
  -- Compare the actual queue created by approval, not a preceding MVCC count.
  select count(*) into recipients from private.mail_deliveries where campaign_id=(p_params->>'campaign_id')::uuid;
  if recipients is distinct from (p_params->>'expected_recipients')::bigint then
   raise exception 'mail_revision_conflict' using errcode='40001'; end if;
 elsif p_action='mail_cancel' then
  if p_params-array['campaign_id','revision']<>'{}' or jsonb_typeof(p_params->'revision') is distinct from 'number' then
   raise exception 'native_admin_invalid' using errcode='22023'; end if;
  select * into c from private.mail_campaigns where id=(p_params->>'campaign_id')::uuid and environment=p_environment for update;
  if not found then raise exception 'native_admin_not_found'; end if;
  if c.revision is distinct from (p_params->>'revision')::integer then raise exception 'mail_revision_conflict'; end if;
  if c.state not in('sending','canceled') then raise exception 'native_admin_invalid'; end if;
  if c.state='sending' then
   update private.mail_campaigns set state='canceled' where id=c.id returning * into c;
   update private.mail_deliveries set status='skipped',finished_at=now() where campaign_id=c.id and status='pending';
   insert into private.mail_audit(actor,action,target,detail) values(p_actor,'mail_cancel',c.id::text,'{}');
  end if;
  response:=jsonb_build_object('campaign',to_jsonb(c));
 else
  response:=private.mail_admin_execute_v2(p_actor,p_action,p_params,p_environment);
 end if;
 if p_action in('mail_get','mail_save') and response->'campaign'->>'state'='draft' then
  select * into c from private.mail_campaigns where id=(response->'campaign'->>'id')::uuid;
  select count(*) into recipients from private.mail_contacts t where c.target_group=any(private.mail_groups(t.email,p_environment));
  response:=response||jsonb_build_object('recipients',recipients);
 elsif p_action='mail_can_send' then
  response:=jsonb_build_object('allowed',response->'allowed'='true'::jsonb and exists(
   select 1 from private.mail_deliveries d join private.mail_campaigns campaign on campaign.id=d.campaign_id
   where d.id=(p_params->>'delivery_id')::uuid and campaign.state='sending'));
 end if;
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
revoke all on function public.mail_admin_execute(uuid,text,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.mail_admin_execute(uuid,text,jsonb,text) to service_role;
commit;
