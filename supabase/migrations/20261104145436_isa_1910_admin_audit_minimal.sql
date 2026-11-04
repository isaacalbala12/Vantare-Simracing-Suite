-- VANTA-132 / 10b. No purge during deployment. SQL and ACL are complete (ADR 0106).
begin;
set local lock_timeout='5s';
do $role$
begin
 if current_user<>'postgres' or not exists(select 1 from pg_roles where rolname=current_user and(rolsuper or rolbypassrls)) then
  raise exception 'admin_audit_requires_privileged_postgres' using errcode='42501';
 end if;
end $role$;
-- Fail before editing if readers/writers prevent an atomic lock of all affected tables.
lock table public.account_identities,public.admin_audit_log,private.mail_audit,private.admin_effects in access exclusive mode nowait;
create table private.admin_audit_policy (
 singleton boolean primary key default true check(singleton),
 closed_retention_days integer not null check(closed_retention_days between 1 and 36500)
);
-- Provisional decision. Isaac may change THIS parameter to 90; no other TTL.
insert into private.admin_audit_policy values(true,365);
alter table private.admin_audit_policy owner to postgres;
alter table private.admin_audit_policy enable row level security;
revoke all on private.admin_audit_policy from public,anon,authenticated,service_role;

-- Only privileged maintenance inside this transaction can bypass immutability.
-- The GUC alone grants no authority, no table privileges and no later-tx bypass.
create function private.admin_audit_maintenance() returns boolean
language sql stable set search_path='' as $$
 select coalesce(current_user='postgres' and current_setting('vantare.audit_maintenance',true)=pg_current_xact_id()::text,false)
$$;
create function private.admin_audit_fields(value jsonb,action text) returns jsonb
language sql immutable set search_path='' as $$
 select case when value is null then null
 when action='set_tester' then jsonb_build_object('enabled',coalesce(
   (coalesce(value#>'{account,roles}',value->'roles','[]'::jsonb) ? 'tester'),false))
 when action='set_module' then jsonb_build_object('modules',coalesce((
   select jsonb_agg(module) from jsonb_array_elements(case
    when jsonb_typeof(coalesce(value#>'{account,modules}',value->'modules'))='array'
    then coalesce(value#>'{account,modules}',value->'modules') else '[]'::jsonb end) module
   where module#>>'{}' in ('vantare.module.strategy','vantare.module.engineer',
     'vantare.module.analysis','vantare.module.calendar')), '[]'::jsonb))
 else jsonb_strip_nulls(jsonb_build_object(
   'blocked',case when jsonb_typeof(value->'blocked')='boolean' then value->'blocked' end,
   'enabled_for_all',case when jsonb_typeof(value->'enabled_for_all')='boolean' then value->'enabled_for_all' end,
   'consent',case when jsonb_typeof(value->'consent')='boolean' then value->'consent' end,
   'revision',case when jsonb_typeof(value->'revision')='number' then value->'revision' end,
   'status',case when value->>'status' in ('active','pending','draft','sending','sent','canceled',
     'submitted','validated','duplicate_linked','incomplete','closed','in_review','rejected','fixed','spam') then value->'status' end)) end
$$;
create function private.admin_audit_target(target text) returns text
language sql stable set search_path='' as $$
 select case when target='erased' then target
 when target ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
  case when exists(select 1 from public.account_identities i where i.account_id=target::uuid and i.deleted_at is not null)
  then 'erased' else 'sha256:'||encode(sha256(convert_to((target::uuid)::text,'UTF8')),'hex') end
 when target ~ '^sha256:[0-9a-f]{64}$' then target
 when target in ('search_accounts','get_rollout','list_reports','list_creators','mail','contact') then target
 else 'sha256:'||encode(sha256(convert_to(target,'UTF8')),'hex') end
$$;
create function private.minimize_admin_audit() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='mail_audit' then
  new.detail:=private.admin_audit_fields(new.detail,new.action);
 else
  new.before_value:=private.admin_audit_fields(new.before_value,new.action);
  new.after_value:=private.admin_audit_fields(new.after_value,new.action);
 end if;
 new.target:=private.admin_audit_target(new.target);
 return new;
end $$;
create function private.redact_deleted_account_audit() returns trigger
language plpgsql security definer set search_path='' as $$
declare previous text:=current_setting('vantare.audit_maintenance',true);
begin
 perform pg_advisory_xact_lock(1910,10);
 perform set_config('vantare.audit_maintenance',pg_current_xact_id()::text,true);
 update public.admin_audit_log set target='erased'
 where target in (new.account_id::text,'sha256:'||encode(sha256(convert_to(new.account_id::text,'UTF8')),'hex'));
 update private.mail_audit set target='erased'
 where target in (new.account_id::text,'sha256:'||encode(sha256(convert_to(new.account_id::text,'UTF8')),'hex'));
 perform set_config('vantare.audit_maintenance',coalesce(previous,''),true);
 return new;
end $$;
create trigger b_minimize_admin_audit before insert on public.admin_audit_log
 for each row execute function private.minimize_admin_audit();
create trigger b_minimize_mail_audit before insert on private.mail_audit
 for each row execute function private.minimize_admin_audit();
create trigger admin_audit_account_erasure after update of deleted_at on public.account_identities
 for each row when(new.deleted_at is not null and old.deleted_at is null)
 execute function private.redact_deleted_account_audit();
create index admin_audit_target_lookup on public.admin_audit_log(target);
create index mail_audit_target_lookup on private.mail_audit(target);
drop trigger mail_audit_append_only on private.mail_audit;
CREATE TRIGGER mail_audit_append_only BEFORE DELETE OR UPDATE ON private.mail_audit FOR EACH ROW WHEN (not private.admin_audit_maintenance()) EXECUTE FUNCTION operational_access_reject_audit_mutation();
drop trigger a_account_write_barrier on public.admin_audit_log;
CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.admin_audit_log FOR EACH ROW WHEN (not private.admin_audit_maintenance()) EXECUTE FUNCTION private.guard_account_write('select case when $1->>''action'' in (''search_accounts'',''get_account'',''get_rollout'',''list_reports'',''get_report'')
     then array[($1->>''actor_account_id'')::uuid] else (select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''actor_account_id'')::uuid union
        select p.id from public.profiles p where p.id=case when $1->>''target'' ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'' then ($1->>''target'')::uuid end
        union select r.account_id from public.testing_contributions r where r.id=case when $1->>''target'' ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'' then ($1->>''target'')::uuid end
        union select (v#>>''{}'')::uuid from jsonb_path_query($1,''$.**.account_id'') v
        where v#>>''{}'' ~ ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'') owners(account)) end', 'select ($1->>''actor_account_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''actor_account_id'')::uuid))');
drop trigger admin_audit_append_only on public.admin_audit_log;
CREATE TRIGGER admin_audit_append_only BEFORE DELETE OR UPDATE ON public.admin_audit_log FOR EACH ROW WHEN (not private.admin_audit_maintenance()) EXECUTE FUNCTION operational_access_reject_audit_mutation();
drop trigger admin_effects_append_only on private.admin_effects;
CREATE TRIGGER admin_effects_append_only BEFORE DELETE OR UPDATE ON private.admin_effects FOR EACH ROW WHEN (not private.admin_audit_maintenance()) EXECUTE FUNCTION operational_access_reject_audit_mutation();

-- Existing data is not assumed empty. Minimize it under the same trusted guard.
select set_config('vantare.audit_maintenance',pg_current_xact_id()::text,true);
update public.admin_audit_log set before_value=private.admin_audit_fields(before_value,action),
 after_value=private.admin_audit_fields(after_value,action),target=private.admin_audit_target(target);
update private.mail_audit set detail=private.admin_audit_fields(detail,action),target=private.admin_audit_target(target);
-- Also scrub a pseudonym left by an earlier up/down before account deletion.
update public.admin_audit_log a set target='erased' from public.account_identities i
 where i.deleted_at is not null and a.target='sha256:'||encode(sha256(convert_to(i.account_id::text,'UTF8')),'hex');
update private.mail_audit a set target='erased' from public.account_identities i
 where i.deleted_at is not null and a.target='sha256:'||encode(sha256(convert_to(i.account_id::text,'UTF8')),'hex');
select set_config('vantare.audit_maintenance','',true);

-- One read model over existing journals: no second copy of audit evidence.
create view private.admin_audit with(security_invoker=true) as
 select id,actor_account_id as actor,'admin'::text as domain,action,target,
 jsonb_build_object('before',before_value,'after',after_value) as diff,
 'succeeded'::text as outcome,occurred_at,false as pending from public.admin_audit_log
 union all select id,actor,'mail',action,target,detail,'succeeded',occurred_at,false from private.mail_audit
 union all select i.effect_id,i.actor,'effect',i.action,i.target_hash,
 jsonb_build_object('effect',i.effect,'request_id',i.request_id,'provider_status',r.provider_status),
 coalesce(r.outcome,'pending'),coalesce(r.occurred_at,i.occurred_at),
 coalesce(r.outcome,'pending') in ('pending','unknown')
 from private.admin_effects i left join lateral (
  select e.outcome,e.provider_status,e.occurred_at from private.admin_effects e
  where e.effect_id=i.effect_id and e.outcome<>'started'
  order by (e.outcome='reconciled') desc,e.occurred_at desc limit 1
 ) r on true where i.outcome='started';
alter view private.admin_audit owner to postgres;
revoke all on private.admin_audit from public,anon,authenticated,service_role;

create function public.native_admin_prune_audit(p_actor uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cutoff timestamptz; previous text:=current_setting('vantare.audit_maintenance',true);
 v_effect uuid; admin_count integer; mail_count integer; effect_count integer:=0; deleted integer;
begin
 perform private.native_admin_require_owner(p_actor);
 select clock_timestamp()-make_interval(days=>closed_retention_days) into strict cutoff
 from private.admin_audit_policy where singleton for share;
 perform pg_advisory_xact_lock(1910,10);
 perform set_config('vantare.audit_maintenance',pg_current_xact_id()::text,true);
 -- SQL/mail entries describe committed transactions; external uncertainty is in effects.
 delete from public.admin_audit_log a using private.admin_audit v
 where v.domain='admin' and v.id=a.id and not v.pending and v.occurred_at<cutoff;
 get diagnostics admin_count=row_count;
 delete from private.mail_audit a using private.admin_audit v
 where v.domain='mail' and v.id=a.id and not v.pending and v.occurred_at<cutoff;
 get diagnostics mail_count=row_count;
 for v_effect in select i.effect_id from private.admin_effects i
  join private.admin_audit v on v.domain='effect' and v.id=i.effect_id
  where not v.pending and v.occurred_at<cutoff and i.outcome='started'
   and exists(select 1 from private.admin_effects r where r.effect_id=i.effect_id and r.outcome in ('succeeded','failed','reconciled'))
   and not exists(select 1 from private.admin_effects r where r.effect_id=i.effect_id and r.occurred_at>=cutoff)
  for update of i skip locked
 loop
  delete from private.admin_effects where effect_id=v_effect;
  get diagnostics deleted=row_count; effect_count:=effect_count+deleted;
 end loop;
 perform set_config('vantare.audit_maintenance',coalesce(previous,''),true);
 return jsonb_build_object('admin',admin_count,'mail',mail_count,'effects',effect_count);
end $$;
revoke all on function public.native_admin_prune_audit(uuid) from public,anon,authenticated,service_role;
grant execute on function public.native_admin_prune_audit(uuid) to service_role;
alter function public.native_admin_prune_audit(uuid) owner to postgres;
revoke all on function private.admin_audit_maintenance(),private.admin_audit_fields(jsonb,text),
 private.admin_audit_target(text),private.minimize_admin_audit(),private.redact_deleted_account_audit()
 from public,anon,authenticated,service_role;
alter function private.admin_audit_maintenance() owner to postgres;
alter function private.admin_audit_fields(jsonb,text) owner to postgres;
alter function private.admin_audit_target(text) owner to postgres;
alter function private.minimize_admin_audit() owner to postgres;
alter function private.redact_deleted_account_audit() owner to postgres;
commit;
