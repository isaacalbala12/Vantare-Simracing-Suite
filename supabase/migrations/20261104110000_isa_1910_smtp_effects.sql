-- VANTA-132 / SMTP: atomic claim+intent, existing journal/pending/reconcile.
begin;
set local lock_timeout='5s';
do $$begin
 if not exists(select 1 from pg_roles where rolname=current_user and (rolsuper or rolbypassrls)) then
  raise exception 'mail_send_migration_requires_bypassrls' using errcode='42501';
 end if;
end$$;
alter table private.admin_effects drop constraint admin_effects_action_check;
alter table private.admin_effects add constraint admin_effects_action_check
 check(action in('set_blocked','delete_account','mail_cleanup','mail_sync','mail_send_batch'));
alter table private.admin_effects drop constraint admin_effects_effect_check;
alter table private.admin_effects add constraint admin_effects_effect_check
 check(effect in('clerk_ban','clerk_unban','clerk_delete','storage_cleanup','polar_cancel','brevo_delete','brevo_contact_upsert','brevo_contact_update','brevo_smtp_send'));
-- A delivery is dispatched at most once, even after a terminal result/reconcile.
create unique index if not exists admin_effects_smtp_delivery_started
 on private.admin_effects(target_hash) where effect='brevo_smtp_send' and outcome='started';
create or replace function public.native_admin_record_mail_send(
 p_actor uuid,p_request uuid,p_effect uuid,p_delivery uuid,p_environment text,
 p_outcome text,p_provider_status integer default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_hash text; v_start private.admin_effects; v_existing private.admin_effects;
begin
 if p_actor is null or p_request is null or p_effect is null or p_delivery is null
  or p_environment is null or p_environment not in('sandbox','production')
  or p_outcome is null or p_outcome not in('started','succeeded','failed','unknown')
  or (p_provider_status is not null and p_provider_status not between 100 and 599)
  or (p_outcome='started' and p_provider_status is not null)
  or (p_outcome='succeeded' and coalesce(p_provider_status,0) not between 200 and 299)
  or (p_outcome='failed' and p_provider_status is not null and p_provider_status not in(400,401,403,404,422))
  or (p_outcome='unknown' and coalesce(p_provider_status,0) in(400,401,403,404,422))
 then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 v_hash:=encode(sha256(convert_to('brevo_smtp_send:'||p_environment||':'||p_delivery::text,'UTF8')),'hex');
 if p_outcome='started' then
  perform private.native_admin_require_owner(p_actor);
  perform 1 from private.mail_deliveries d join private.mail_campaigns c on c.id=d.campaign_id
   where d.id=p_delivery and d.status='dispatching' and d.reserved_at is not null
    and c.environment=p_environment and c.state='sending' and c.approved_by is not null for update of d;
  if not found then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 else
  select * into v_start from private.admin_effects where effect_id=p_effect and outcome='started' for update;
  if not found or v_start.actor<>p_actor or v_start.request_id<>p_request
   or v_start.action<>'mail_send_batch' or v_start.effect<>'brevo_smtp_send' or v_start.target_hash<>v_hash
  then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 end if;
 if exists(select 1 from private.admin_effects where effect_id=p_effect and outcome='reconciled') then
  raise exception 'native_admin_invalid' using errcode='22023';
 end if;
 insert into private.admin_effects(effect_id,outcome,request_id,actor,action,effect,target_hash,provider_status)
 values(p_effect,p_outcome,p_request,p_actor,'mail_send_batch','brevo_smtp_send',v_hash,p_provider_status) on conflict do nothing;
 select * into v_existing from private.admin_effects where effect_id=p_effect and outcome=p_outcome;
 if not found or v_existing.actor<>p_actor or v_existing.request_id<>p_request
  or v_existing.action<>'mail_send_batch' or v_existing.effect<>'brevo_smtp_send' or v_existing.target_hash<>v_hash
  or v_existing.provider_status is distinct from p_provider_status
  or exists(select 1 from private.admin_effects where effect_id=p_effect and outcome='reconciled')
 then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 return true;
end$$;
create or replace function public.native_admin_claim_mail_send(
 p_actor uuid,p_request uuid,p_effect uuid,p_campaign uuid,p_revision integer,p_environment text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare claimed jsonb; delivery jsonb;
begin
 if p_request is null or p_effect is null or p_campaign is null or p_revision is null or p_revision<1 then
  raise exception 'native_admin_invalid' using errcode='22023';
 end if;
 claimed:=public.mail_admin_execute(p_actor,'mail_claim',jsonb_build_object('campaign_id',p_campaign,'revision',p_revision),p_environment);
 delivery:=claimed->'delivery';
 if delivery is null or delivery='null'::jsonb then return claimed; end if;
 if public.native_admin_record_mail_send(p_actor,p_request,p_effect,(delivery->>'id')::uuid,p_environment,'started') is distinct from true then
  raise exception 'mail_send_audit_unavailable' using errcode='55000';
 end if;
 return claimed;
end$$;
revoke all on function public.native_admin_claim_mail_send(uuid,uuid,uuid,uuid,integer,text),
 public.native_admin_record_mail_send(uuid,uuid,uuid,uuid,text,text,integer)
 from public,anon,authenticated,service_role;
grant execute on function public.native_admin_claim_mail_send(uuid,uuid,uuid,uuid,integer,text),
 public.native_admin_record_mail_send(uuid,uuid,uuid,uuid,text,text,integer) to service_role;
do $$begin
 if exists(select 1 from pg_proc p
  cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  left join pg_roles r on r.oid=a.grantee
  where p.oid in('public.native_admin_claim_mail_send(uuid,uuid,uuid,uuid,integer,text)'::regprocedure,
   'public.native_admin_record_mail_send(uuid,uuid,uuid,uuid,text,text,integer)'::regprocedure)
   and a.grantee<>p.proowner and not coalesce(r.rolsuper,false)
   and a.grantee<>(select oid from pg_roles where rolname='service_role')) then
  raise exception 'mail_send_recorder_unexpected_grantee' using errcode='55000';
 end if;
end$$;
notify pgrst,'reload schema';
commit;
