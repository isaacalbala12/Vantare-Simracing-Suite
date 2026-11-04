-- VANTA-132 / step5d: actual Brevo contact POST/PUT use the existing journal.
begin;
set local lock_timeout='5s';
do $$begin
 if not exists(select 1 from pg_roles where rolname=current_user and (rolsuper or rolbypassrls)) then
  raise exception 'mail_sync_migration_requires_bypassrls' using errcode='42501';
 end if;
end$$;
alter table private.admin_effects drop constraint admin_effects_action_check;
alter table private.admin_effects add constraint admin_effects_action_check
 check(action in('set_blocked','delete_account','mail_cleanup','mail_sync'));
alter table private.admin_effects drop constraint admin_effects_effect_check;
alter table private.admin_effects add constraint admin_effects_effect_check
 check(effect in('clerk_ban','clerk_unban','clerk_delete','storage_cleanup','polar_cancel','brevo_delete','brevo_contact_upsert','brevo_contact_update'));
create or replace function public.native_admin_record_mail_sync(
 p_actor uuid,p_request uuid,p_effect uuid,p_kind text,p_contact uuid,p_lease uuid,
 p_outcome text,p_provider_status integer default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_hash text; v_start private.admin_effects; v_existing private.admin_effects;
begin
 if p_actor is null or p_request is null or p_effect is null or p_contact is null or p_lease is null
  or p_kind is null or p_kind not in('brevo_contact_upsert','brevo_contact_update')
  or p_outcome is null or p_outcome not in('started','succeeded','failed','unknown')
  or (p_provider_status is not null and p_provider_status not between 100 and 599)
  or (p_outcome='started' and p_provider_status is not null)
  or (p_outcome='succeeded' and coalesce(p_provider_status,0) not between 200 and 299)
  or (p_outcome='failed' and coalesce(p_provider_status,0) not in(401,403,422))
  or (p_outcome='unknown' and coalesce(p_provider_status,0) in(401,403,422))
 then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 v_hash:=encode(sha256(convert_to('brevo_contact_sync:'||p_contact::text||':'||p_lease::text,'UTF8')),'hex');
 if p_outcome='started' then
  perform private.native_admin_require_owner(p_actor);
  perform 1 from private.mail_contacts where id=p_contact and sync_lease=p_lease
   and sync_lease_until>clock_timestamp() for update;
  if not found then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 else
  select * into v_start from private.admin_effects where effect_id=p_effect and outcome='started' for update;
  if not found or v_start.actor<>p_actor or v_start.request_id<>p_request
   or v_start.action<>'mail_sync' or v_start.effect<>p_kind or v_start.target_hash<>v_hash
  then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 end if;
 if exists(select 1 from private.admin_effects where effect_id=p_effect and outcome='reconciled') then
  raise exception 'native_admin_invalid' using errcode='22023';
 end if;
 insert into private.admin_effects(effect_id,outcome,request_id,actor,action,effect,target_hash,provider_status)
 values(p_effect,p_outcome,p_request,p_actor,'mail_sync',p_kind,v_hash,p_provider_status) on conflict do nothing;
 select * into v_existing from private.admin_effects where effect_id=p_effect and outcome=p_outcome;
 if not found or v_existing.actor<>p_actor or v_existing.request_id<>p_request
  or v_existing.action<>'mail_sync' or v_existing.effect<>p_kind or v_existing.target_hash<>v_hash
  or v_existing.provider_status is distinct from p_provider_status
  or exists(select 1 from private.admin_effects where effect_id=p_effect and outcome='reconciled')
 then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 return true;
end$$;
revoke all on function public.native_admin_record_mail_sync(uuid,uuid,uuid,text,uuid,uuid,text,integer)
 from public,anon,authenticated,service_role;
grant execute on function public.native_admin_record_mail_sync(uuid,uuid,uuid,text,uuid,uuid,text,integer) to service_role;
do $$begin
 if exists(select 1 from pg_proc p
  cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  left join pg_roles r on r.oid=a.grantee
  where p.oid='public.native_admin_record_mail_sync(uuid,uuid,uuid,text,uuid,uuid,text,integer)'::regprocedure
   and a.grantee<>p.proowner and not coalesce(r.rolsuper,false)
   and a.grantee<>(select oid from pg_roles where rolname='service_role')) then
  raise exception 'mail_sync_recorder_unexpected_grantee' using errcode='55000';
 end if;
end$$;
notify pgrst,'reload schema';
commit;
