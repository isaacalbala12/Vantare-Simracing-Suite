-- Existing journal, pending view and owner reconciliation. No data reset.
begin;
set local lock_timeout='5s';
do $$begin
 if not exists(select 1 from pg_roles where rolname=current_user and (rolsuper or rolbypassrls)) then
  raise exception 'brevo_journal_migration_requires_bypassrls' using errcode='42501';
 end if;
 if exists(select 1 from public.profiles where id='00000000-0000-0000-0000-000000000000') then
  raise exception 'brevo_worker_actor_collision' using errcode='55000';
 end if;
end$$;
alter table private.admin_effects drop constraint admin_effects_action_check;
alter table private.admin_effects add constraint admin_effects_action_check
 check(action in ('set_blocked','delete_account','mail_cleanup'));
alter table private.admin_effects drop constraint admin_effects_effect_check;
alter table private.admin_effects add constraint admin_effects_effect_check
 check(effect in ('clerk_ban','clerk_unban','clerk_delete','storage_cleanup','polar_cancel','brevo_delete'));

create or replace function public.native_admin_record_mail_erasure(
 p_job uuid,p_lease uuid,p_request uuid,p_effect uuid,p_outcome text,
 p_provider_status integer default null,p_actor uuid default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare
 -- Reserved technical actor, not a fabricated owner. Migration guards collision.
 v_actor uuid:=coalesce(p_actor,'00000000-0000-0000-0000-000000000000'::uuid);
 v_hash text;
 v_start private.admin_effects;
 v_existing private.admin_effects;
begin
 if p_job is null or p_lease is null or p_request is null or p_effect is null
  or p_outcome is null or p_outcome not in('started','succeeded','failed','unknown')
  or (p_provider_status is not null and p_provider_status not between 100 and 599)
  or (p_outcome='started' and p_provider_status is not null)
  or (p_outcome='succeeded' and coalesce(p_provider_status,0) not in(204,404))
  or (p_outcome='failed' and coalesce(p_provider_status,0) not in(401,403,422))
  or (p_outcome='unknown' and coalesce(p_provider_status,0) in(204,404,401,403,422))
  or p_actor='00000000-0000-0000-0000-000000000000'::uuid
 then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 v_hash:=encode(sha256(convert_to('brevo_delete:'||p_job::text||':'||p_lease::text,'UTF8')),'hex');
 if p_outcome='started' then
  if p_actor is not null then perform private.native_admin_require_owner(p_actor); end if;
  -- Service-only queue capability. No new intent on an old/replaced lease.
  perform 1 from private.mail_contact_erasures
   where id=p_job and lease=p_lease and state='processing'
    and lease_until>clock_timestamp() for update;
  if not found then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 else
  -- Result may close after owner/lease expiry, only for the exact durable intent.
  select * into v_start from private.admin_effects
   where effect_id=p_effect and outcome='started' for update;
  if not found or v_start.actor<>v_actor or v_start.request_id<>p_request
   or v_start.action<>'mail_cleanup' or v_start.effect<>'brevo_delete'
   or v_start.target_hash<>v_hash
  then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 end if;
 if exists(select 1 from private.admin_effects where effect_id=p_effect and outcome='reconciled') then
  raise exception 'native_admin_invalid' using errcode='22023';
 end if;
 insert into private.admin_effects(effect_id,outcome,request_id,actor,action,effect,target_hash,provider_status)
 values(p_effect,p_outcome,p_request,v_actor,'mail_cleanup','brevo_delete',v_hash,p_provider_status)
 on conflict do nothing;
 select * into v_existing from private.admin_effects where effect_id=p_effect and outcome=p_outcome;
 if not found or v_existing.actor<>v_actor or v_existing.request_id<>p_request
  or v_existing.action<>'mail_cleanup' or v_existing.effect<>'brevo_delete'
  or v_existing.target_hash<>v_hash or v_existing.provider_status is distinct from p_provider_status
  or exists(select 1 from private.admin_effects where effect_id=p_effect and outcome='reconciled')
 then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 return true;
end$$;
revoke all on function public.native_admin_record_mail_erasure(uuid,uuid,uuid,uuid,text,integer,uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.native_admin_record_mail_erasure(uuid,uuid,uuid,uuid,text,integer,uuid)
 to service_role;
do $$begin
 if exists(select 1 from pg_proc p
  cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
  left join pg_roles grantee on grantee.oid=acl.grantee
  where p.oid='public.native_admin_record_mail_erasure(uuid,uuid,uuid,uuid,text,integer,uuid)'::regprocedure
   and acl.grantee<>p.proowner and not coalesce(grantee.rolsuper,false)
   and acl.grantee<>(select oid from pg_roles where rolname='service_role')) then
  raise exception 'brevo_recorder_unexpected_grantee' using errcode='55000';
 end if;
end$$;
comment on function public.native_admin_record_mail_erasure(uuid,uuid,uuid,uuid,text,integer,uuid)
 is 'Existing admin journal; service queue lease proof. Null actor denotes maintenance (reserved nil UUID); owner actor rechecked for started.';
notify pgrst,'reload schema';
commit;
