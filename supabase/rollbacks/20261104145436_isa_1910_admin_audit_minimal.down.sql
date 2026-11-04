begin;
set local lock_timeout='5s';
select pg_advisory_xact_lock(1910,10);
lock table public.account_identities in share row exclusive mode nowait;
lock table private.admin_audit_policy,public.admin_audit_log,private.mail_audit,private.admin_effects in access exclusive mode nowait;
do $$ begin
 if exists(select 1 from public.admin_audit_log where actor_account_id is null)
 or exists(select 1 from private.admin_effects where target_hash='erased' or erase_on_close) then
  raise exception 'admin_audit_rollback_requires_backup' using errcode='55000';
 end if;
end $$;
alter table public.admin_audit_log alter column actor_account_id set not null;
drop trigger redact_closed_admin_effect on private.admin_effects;
drop trigger b_bind_admin_effect_account on private.admin_effects;
drop function private.redact_closed_admin_effect();
drop function public.native_admin_record_effect(uuid,jsonb,uuid);
grant execute on function public.native_admin_record_effect(uuid,jsonb) to service_role;
drop function private.bind_admin_effect_account();
drop index private.admin_effects_smtp_delivery_started;
create unique index admin_effects_smtp_delivery_started
 on private.admin_effects(target_hash) where effect='brevo_smtp_send' and outcome='started';
alter table private.admin_effects drop constraint admin_effects_target_hash_check;
alter table private.admin_effects add constraint admin_effects_target_hash_check check(target_hash ~ '^[0-9a-f]{64}$');
-- Exact predecessor bodies, including whitespace; existing ACL/owners remain.
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
  or (p_outcome='failed' and p_provider_status is not null and p_provider_status not in(400,401,403,404,422))
  or (p_outcome='unknown' and coalesce(p_provider_status,0) in(400,401,403,404,422))
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
alter table private.admin_effects drop column target_account;
alter table private.admin_effects drop column erase_on_close;
drop trigger admin_audit_account_erasure on public.account_identities;
drop trigger b_minimize_admin_audit on public.admin_audit_log;
drop trigger b_minimize_mail_audit on private.mail_audit;
drop function public.native_admin_prune_audit(uuid);
drop trigger mail_audit_append_only on private.mail_audit;
CREATE TRIGGER mail_audit_append_only BEFORE DELETE OR UPDATE ON private.mail_audit FOR EACH ROW EXECUTE FUNCTION operational_access_reject_audit_mutation();
drop trigger a_account_write_barrier on public.admin_audit_log;
CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.admin_audit_log FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select case when $1->>''action'' in (''search_accounts'',''get_account'',''get_rollout'',''list_reports'',''get_report'')
     then array[($1->>''actor_account_id'')::uuid] else (select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''actor_account_id'')::uuid union
        select p.id from public.profiles p where p.id=case when $1->>''target'' ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'' then ($1->>''target'')::uuid end
        union select r.account_id from public.testing_contributions r where r.id=case when $1->>''target'' ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'' then ($1->>''target'')::uuid end
        union select (v#>>''{}'')::uuid from jsonb_path_query($1,''$.**.account_id'') v
        where v#>>''{}'' ~ ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'') owners(account)) end', 'select ($1->>''actor_account_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''actor_account_id'')::uuid))');
drop trigger admin_audit_append_only on public.admin_audit_log;
CREATE TRIGGER admin_audit_append_only BEFORE DELETE OR UPDATE ON public.admin_audit_log FOR EACH ROW EXECUTE FUNCTION operational_access_reject_audit_mutation();
drop trigger admin_effects_append_only on private.admin_effects;
CREATE TRIGGER admin_effects_append_only BEFORE DELETE OR UPDATE ON private.admin_effects FOR EACH ROW EXECUTE FUNCTION operational_access_reject_audit_mutation();
drop index if exists public.admin_audit_target_lookup;
drop index if exists private.mail_audit_target_lookup;
drop function private.redact_deleted_account_audit();
drop function private.minimize_admin_audit();
drop function private.admin_audit_target(text);
drop function private.admin_audit_fields(jsonb,text);
drop function private.admin_audit_maintenance();
drop table private.admin_audit_maintenance_tx;
drop table private.admin_audit_policy;
notify pgrst,'reload schema';
commit;
