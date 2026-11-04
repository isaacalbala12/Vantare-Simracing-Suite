-- VANTA-132 / 10b. Role guard fixes new object owners to postgres. No purge during deployment.
begin;
set local lock_timeout='5s';
do $role$
begin
 if current_user<>'postgres' or not exists(select 1 from pg_roles where rolname=current_user and(rolsuper or rolbypassrls)) then
  raise exception 'admin_audit_requires_privileged_postgres' using errcode='42501';
 end if;
end $role$;
-- Fail before editing if readers/writers prevent an atomic lock of all affected tables.
lock table public.account_identities in share row exclusive mode nowait;
lock table public.admin_audit_log,private.mail_audit,private.admin_effects in access exclusive mode nowait;
alter table public.admin_audit_log alter column actor_account_id drop not null;
create table private.admin_audit_policy (
 singleton boolean primary key default true check(singleton),
 closed_retention_days integer not null check(closed_retention_days between 1 and 36500)
);
-- Provisional decision. Isaac may change THIS parameter to 90; no other TTL.
insert into private.admin_audit_policy values(true,365);
alter table private.admin_audit_policy enable row level security;
revoke all on table private.admin_audit_policy from public,anon,authenticated,service_role;

-- A caller-controlled GUC cannot open the append-only barriers. The capability
-- is private, transaction-scoped, and removed before returning to a caller.
create table private.admin_audit_maintenance_tx (
 transaction_id xid8 primary key default pg_current_xact_id(),
 maintenance boolean not null default true, target_account uuid
);
alter table private.admin_audit_maintenance_tx enable row level security;
revoke all on table private.admin_audit_maintenance_tx from public,anon,authenticated,service_role;
create or replace function private.admin_audit_maintenance() returns boolean
language sql stable security definer set search_path='' as $$
 select current_user='postgres' and exists(select 1 from private.admin_audit_maintenance_tx
 where transaction_id=pg_current_xact_id() and maintenance)
$$;
alter table private.admin_effects add column target_account uuid;
alter table private.admin_effects add column erase_on_close boolean not null default false;
alter table private.admin_effects drop constraint admin_effects_target_hash_check;
alter table private.admin_effects add constraint admin_effects_target_hash_check
 check(target_hash='erased' or target_hash ~ '^[0-9a-f]{64}$');
drop index private.admin_effects_smtp_delivery_started;
create unique index admin_effects_smtp_delivery_started on private.admin_effects(target_hash)
 where effect='brevo_smtp_send' and outcome='started' and target_hash<>'erased';
-- Same status contract for sync and SMTP; DELETE distinguishes 404 success.
create or replace function private.mail_effect_valid(outcome text,status integer,erasure boolean)
returns boolean language sql immutable set search_path='' as $$
 select coalesce(outcome in('started','succeeded','failed','unknown') and (status is null or status between 100 and 599)
 and case outcome when 'started' then status is null
 when 'succeeded' then case when erasure then status in(204,404) else status between 200 and 299 end
 when 'failed' then case when erasure then status in(401,403,422) else status is null or status in(400,401,403,404,422) end
 else status is null or case when erasure then status not in(204,404,401,403,422) else status not in(400,401,403,404,422) end end,false)
$$;
-- Shared durable append for the three actual Brevo recorders below. Provider
-- outcome validation and source capability/owner checks stay at each entrypoint.
create or replace function private.append_mail_effect(event jsonb,account uuid) returns boolean
language plpgsql set search_path='' as $$
declare e private.admin_effects:=jsonb_populate_record(null::private.admin_effects,event);
 initial private.admin_effects; stored private.admin_effects;
begin
 if e.outcome<>'started' then
  select * into initial from private.admin_effects where effect_id=e.effect_id and outcome='started' for update;
  if not found or (initial.actor,initial.request_id,initial.action,initial.effect,initial.target_hash)
   is distinct from (e.actor,e.request_id,e.action,e.effect,e.target_hash)
  then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 end if;
 if exists(select 1 from private.admin_effects where effect_id=e.effect_id and outcome='reconciled') then
  raise exception 'native_admin_invalid' using errcode='22023'; end if;
 insert into private.admin_effects(effect_id,outcome,request_id,actor,action,effect,target_hash,provider_status,target_account)
 values(e.effect_id,e.outcome,e.request_id,e.actor,e.action,e.effect,e.target_hash,e.provider_status,account) on conflict do nothing;
 select * into stored from private.admin_effects where effect_id=e.effect_id and outcome=e.outcome;
 if not found or (stored.actor,stored.request_id,stored.action,stored.effect,stored.target_hash,stored.provider_status)
  is distinct from (e.actor,e.request_id,e.action,e.effect,e.target_hash,e.provider_status)
  or exists(select 1 from private.admin_effects where effect_id=e.effect_id and outcome='reconciled')
 then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 return true;
end $$;
-- Complete provider RPC bodies: bind the source by primary key, not hash scans.
create or replace function public.native_admin_record_mail_sync(
 p_actor uuid,p_request uuid,p_effect uuid,p_kind text,p_contact uuid,p_lease uuid,
 p_outcome text,p_provider_status integer default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_hash text;
begin
 if p_actor is null or p_request is null or p_effect is null or p_contact is null or p_lease is null
  or p_kind is null or p_kind not in('brevo_contact_upsert','brevo_contact_update')
  or not private.mail_effect_valid(p_outcome,p_provider_status,false)
 then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 v_hash:=encode(sha256(convert_to('brevo_contact_sync:'||p_contact::text||':'||p_lease::text,'UTF8')),'hex');
 if p_outcome='started' then
  perform private.native_admin_require_owner(p_actor);
  perform 1 from private.mail_contacts where id=p_contact and sync_lease=p_lease
   and sync_lease_until>clock_timestamp() for update;
  if not found then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 end if;
 return private.append_mail_effect(jsonb_build_object(
  'effect_id',p_effect,'outcome',p_outcome,'request_id',p_request,'actor',p_actor,
  'action','mail_sync','effect',p_kind,'target_hash',v_hash,'provider_status',p_provider_status),
  (select coalesce(account_id,erasure_account) from private.mail_contacts where id=p_contact));
end$$;

create or replace function public.native_admin_record_mail_send(
 p_actor uuid,p_request uuid,p_effect uuid,p_delivery uuid,p_environment text,
 p_outcome text,p_provider_status integer default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_hash text;
begin
 if p_actor is null or p_request is null or p_effect is null or p_delivery is null
  or p_environment is null or p_environment not in('sandbox','production')
  or not private.mail_effect_valid(p_outcome,p_provider_status,false)
 then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 v_hash:=encode(sha256(convert_to('brevo_smtp_send:'||p_environment||':'||p_delivery::text,'UTF8')),'hex');
 if p_outcome='started' then
  perform private.native_admin_require_owner(p_actor);
  perform 1 from private.mail_deliveries d join private.mail_campaigns c on c.id=d.campaign_id
   where d.id=p_delivery and d.status='dispatching' and d.reserved_at is not null
    and c.environment=p_environment and c.state='sending' and c.approved_by is not null for update of d;
  if not found then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 end if;
 return private.append_mail_effect(jsonb_build_object(
  'effect_id',p_effect,'outcome',p_outcome,'request_id',p_request,'actor',p_actor,
  'action','mail_send_batch','effect','brevo_smtp_send','target_hash',v_hash,'provider_status',p_provider_status),
  (select coalesce(c.account_id,c.erasure_account) from private.mail_deliveries d join private.mail_contacts c on c.email=d.email where d.id=p_delivery));
end$$;

create or replace function public.native_admin_record_mail_erasure(
 p_job uuid,p_lease uuid,p_request uuid,p_effect uuid,p_outcome text,
 p_provider_status integer default null,p_actor uuid default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare
 -- Reserved technical actor, not a fabricated owner. Migration guards collision.
 v_actor uuid:=coalesce(p_actor,'00000000-0000-0000-0000-000000000000'::uuid);
 v_hash text;
begin
 if p_job is null or p_lease is null or p_request is null or p_effect is null
  or not private.mail_effect_valid(p_outcome,p_provider_status,true)
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
 end if;
 return private.append_mail_effect(jsonb_build_object(
  'effect_id',p_effect,'outcome',p_outcome,'request_id',p_request,'actor',v_actor,
  'action','mail_cleanup','effect','brevo_delete','target_hash',v_hash,'provider_status',p_provider_status),
  (select account_id from private.mail_contact_erasures where id=p_job));
end$$;
create or replace function private.bind_admin_effect_account() returns trigger
language plpgsql security definer set search_path='' as $$
declare initial private.admin_effects;
begin
 if new.outcome='started' then
  if new.target_account is null then
   select target_account into new.target_account from private.admin_audit_maintenance_tx
    where transaction_id=pg_current_xact_id() and not maintenance;
  end if;
  if new.target_account is not null then
   -- Trigger fallback never waits for a UUID after the RPC has locked rows.
   new.erase_on_close:=private.lock_account_row_write(new.target_account);
   if new.erase_on_close then new.target_account:=null; end if;
  end if;
 else
  select * into initial from private.admin_effects where effect_id=new.effect_id and outcome='started';
  new.target_account:=initial.target_account; new.erase_on_close:=initial.erase_on_close;
 end if;
 return new;
end $$;
create trigger b_bind_admin_effect_account before insert on private.admin_effects
 for each row execute function private.bind_admin_effect_account();
-- Keep the deployed validator complete and unchanged. The actual Edge now calls
-- this account-bound entrypoint; the old service entrypoint fails closed on rollout.
create or replace function public.native_admin_record_effect(p_actor uuid,p_event jsonb,p_account uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare account uuid; result boolean;
begin
 if not exists(select 1 from public.profiles where id=p_account) then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 for account in select distinct a from unnest(array[p_actor,p_account]) a where a is not null order by a loop
  perform private.lock_account_write(account);
 end loop;
 if exists(select 1 from private.admin_effects where effect_id=(p_event->>'effect_id')::uuid
  and outcome='started' and target_account is not null and target_account<>p_account) then
  raise exception 'native_admin_invalid' using errcode='22023'; end if;
 insert into private.admin_audit_maintenance_tx(maintenance,target_account) values(false,p_account);
 result:=public.native_admin_record_effect(p_actor,p_event);
 delete from private.admin_audit_maintenance_tx where transaction_id=pg_current_xact_id();
 return result;
exception when invalid_text_representation then
 raise exception 'native_admin_invalid' using errcode='22023';
end $$;
revoke execute on function public.native_admin_record_effect(uuid,jsonb) from service_role;
revoke all on function public.native_admin_record_effect(uuid,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.native_admin_record_effect(uuid,jsonb,uuid) to service_role;
-- Deferred until after the recorder has checked the exact original intent hash.
create or replace function private.redact_closed_admin_effect() returns trigger
language plpgsql security definer set search_path='' as $$
declare previous boolean;
begin
 perform 1 from private.admin_effects where effect_id=new.effect_id and outcome='started' for update;
 if not exists(select 1 from private.admin_effects where effect_id=new.effect_id and erase_on_close) then return null; end if;
 select maintenance into previous from private.admin_audit_maintenance_tx where transaction_id=pg_current_xact_id();
 insert into private.admin_audit_maintenance_tx(maintenance) values(true)
 on conflict(transaction_id) do update set maintenance=true;
 update private.admin_effects set target_hash='erased',target_account=null where effect_id=new.effect_id;
 if previous is null then delete from private.admin_audit_maintenance_tx where transaction_id=pg_current_xact_id();
 else update private.admin_audit_maintenance_tx set maintenance=previous where transaction_id=pg_current_xact_id(); end if;
 return null;
end $$;
create constraint trigger redact_closed_admin_effect after insert on private.admin_effects
 deferrable initially deferred for each row when(new.outcome in('succeeded','failed','reconciled'))
 execute function private.redact_closed_admin_effect();
create or replace function private.admin_audit_fields(value jsonb,action text) returns jsonb
language sql immutable set search_path='' as $$
 select case when value is null or value='null'::jsonb then null
 when action='audit_prune' then (select coalesce(jsonb_object_agg(k,v),'{}'::jsonb)
 from jsonb_each(case when jsonb_typeof(value)='object' then value else '{}'::jsonb end) t(k,v)
 where k in('retention_days','admin','mail','effects') and jsonb_typeof(v)='number')
 when action='set_tester' and jsonb_typeof(value->'enabled')='boolean' then jsonb_build_object('enabled',value->'enabled')
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
create or replace function private.admin_audit_target(target text) returns text
language sql stable set search_path='' as $$
 select case when target='erased' then target
 when target ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
  case when exists(select 1 from public.account_identities i where i.account_id=target::uuid and i.deleted_at is not null)
  then 'erased' else 'sha256:'||encode(sha256(convert_to((target::uuid)::text,'UTF8')),'hex') end
 when target ~ '^sha256:[0-9a-f]{64}$' then case when exists(select 1 from public.account_identities i
  where i.deleted_at is not null and target='sha256:'||encode(sha256(convert_to(i.account_id::text,'UTF8')),'hex'))
  then 'erased' else target end
 when target in ('search_accounts','get_rollout','list_reports','list_creators','mail','contact','audit') then target
 else 'sha256:'||encode(sha256(convert_to(target,'UTF8')),'hex') end
$$;
create or replace function private.admin_audit_minimize(entry anyelement,actor_key text,value_keys text[])
returns anyelement language sql stable set search_path='' as $$
 select jsonb_populate_record(entry,to_jsonb(entry)||jsonb_build_object(
  'target',private.admin_audit_target(to_jsonb(entry)->>'target'),actor_key,
  case when exists(select 1 from public.account_identities i
   where i.account_id=(to_jsonb(entry)->>actor_key)::uuid and i.deleted_at is not null)
  then null else to_jsonb(entry)->actor_key end)||
  (select jsonb_object_agg(k,private.admin_audit_fields(to_jsonb(entry)->k,to_jsonb(entry)->>'action'))
   from unnest(value_keys) k))
$$;
create or replace function private.minimize_admin_audit() returns trigger
language plpgsql security definer set search_path='' as $$
declare account uuid; target uuid;
begin
 if new.target ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then target:=new.target::uuid; end if;
 -- Nonwaiting UUID fallback serializes insert with erasure after any row locks.
 for account in select distinct a from unnest(array[(to_jsonb(new)->>tg_argv[0])::uuid,target]) a
  where a is not null order by a loop perform private.lock_account_row_write(account); end loop;
 new:=private.admin_audit_minimize(new,tg_argv[0],string_to_array(tg_argv[1],','));
 return new;
end $$;
create or replace function private.redact_deleted_account_audit() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(1910,10);
 insert into private.admin_audit_maintenance_tx default values;
 update public.admin_audit_log set target='erased'
 where target in (new.account_id::text,'sha256:'||encode(sha256(convert_to(new.account_id::text,'UTF8')),'hex'));
 -- Preserve only a nonidentifying marker on pending groups, never the UUID.
 -- Wait for in-flight closures; the following UPDATE then gets a fresh snapshot.
 perform 1 from private.admin_effects where target_account=new.account_id for update;
 update private.admin_effects e set target_account=null,erase_on_close=true,
 target_hash=case when exists(select 1 from private.admin_effects r where r.effect_id=e.effect_id
 and r.outcome in('succeeded','failed','reconciled')) then 'erased' else e.target_hash end
 where e.target_account=new.account_id;
 update public.admin_audit_log set actor_account_id=null where actor_account_id=new.account_id;
 update private.mail_audit set actor=null where actor=new.account_id;
 update private.mail_audit set target='erased'
 where target in (new.account_id::text,'sha256:'||encode(sha256(convert_to(new.account_id::text,'UTF8')),'hex'));
 delete from private.admin_audit_maintenance_tx where transaction_id=pg_current_xact_id();
 return new;
end $$;
create trigger b_minimize_admin_audit before insert on public.admin_audit_log
 for each row execute function private.minimize_admin_audit('actor_account_id','before_value,after_value');
create trigger b_minimize_mail_audit before insert on private.mail_audit
 for each row execute function private.minimize_admin_audit('actor','detail');
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
insert into private.admin_audit_maintenance_tx default values;
update private.admin_effects e set target_account=i.account_id from public.account_identities i
 where e.effect in('clerk_ban','clerk_unban','clerk_delete','storage_cleanup')
 and e.target_hash=encode(sha256(convert_to(i.subject,'UTF8')),'hex');
update private.admin_effects e set target_account=p.account_id from private.admin_payments p
 where e.effect='polar_cancel' and e.target_hash=encode(sha256(convert_to(p.subscription_id,'UTF8')),'hex');
with accounts as (
 select coalesce(account_id,erasure_account) account,encode(sha256(convert_to('brevo_contact_sync:'||id::text||':'||sync_lease::text,'UTF8')),'hex') hash
 from private.mail_contacts where sync_lease is not null
 union all select account_id,encode(sha256(convert_to('brevo_delete:'||id::text||':'||lease::text,'UTF8')),'hex')
 from private.mail_contact_erasures where lease is not null
 union all select coalesce(c.account_id,c.erasure_account),encode(sha256(convert_to('brevo_smtp_send:'||m.environment||':'||d.id::text,'UTF8')),'hex')
 from private.mail_deliveries d join private.mail_contacts c on c.email=d.email join private.mail_campaigns m on m.id=d.campaign_id
) update private.admin_effects e set target_account=a.account from accounts a where e.effect like 'brevo_%' and e.target_hash=a.hash;
-- Unmapped or deleted account: erase closed hashes; pending hashes await closure.
update private.admin_effects e set erase_on_close=true,target_account=null,
 target_hash=case when exists(select 1 from private.admin_effects r where r.effect_id=e.effect_id
 and r.outcome in('succeeded','failed','reconciled')) then 'erased' else e.target_hash end
 where e.target_account is null or exists(select 1 from public.account_identities i
  where i.deleted_at is not null and i.account_id=e.target_account);
update public.admin_audit_log a set (actor_account_id,target,before_value,after_value)=
 (select m.actor_account_id,m.target,m.before_value,m.after_value from
  private.admin_audit_minimize(a,'actor_account_id',array['before_value','after_value']) m);
update private.mail_audit a set (actor,target,detail)=
 (select m.actor,m.target,m.detail from private.admin_audit_minimize(a,'actor',array['detail']) m);
delete from private.admin_audit_maintenance_tx where transaction_id=pg_current_xact_id();

create or replace function public.native_admin_prune_audit(p_actor uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cutoff timestamptz; ttl integer;
 admin_count integer; mail_count integer; effect_count integer;
begin
 perform private.native_admin_require_owner(p_actor);
 select closed_retention_days into strict ttl from private.admin_audit_policy where singleton for share;
 cutoff:=clock_timestamp()-make_interval(days=>ttl);
 perform pg_advisory_xact_lock(1910,10);
 insert into private.admin_audit_maintenance_tx default values;
 -- SQL/mail entries describe committed transactions; external uncertainty is in effects.
 delete from public.admin_audit_log where occurred_at<cutoff;
 get diagnostics admin_count=row_count;
 delete from private.mail_audit where occurred_at<cutoff and action<>'audit_prune';
 get diagnostics mail_count=row_count;
 with closed as materialized (
  select i.effect_id from private.admin_effects i where i.outcome='started'
   and exists(select 1 from private.admin_effects r where r.effect_id=i.effect_id and r.outcome in ('succeeded','failed','reconciled'))
   and not exists(select 1 from private.admin_effects r where r.effect_id=i.effect_id and r.occurred_at>=cutoff)
  for update of i skip locked
 ) delete from private.admin_effects e using closed c where e.effect_id=c.effect_id;
 get diagnostics effect_count=row_count;
 delete from private.admin_audit_maintenance_tx where transaction_id=pg_current_xact_id();
 insert into private.mail_audit(actor,action,target,detail) values(p_actor,'audit_prune','audit',
  jsonb_build_object('retention_days',ttl,'admin',admin_count,'mail',mail_count,'effects',effect_count));
 return jsonb_build_object('admin',admin_count,'mail',mail_count,'effects',effect_count);
end $$;
revoke all on function public.native_admin_prune_audit(uuid) from public,anon,authenticated,service_role;
grant execute on function public.native_admin_prune_audit(uuid) to service_role;
revoke all on function private.admin_audit_maintenance(),private.admin_audit_fields(jsonb,text),
 private.admin_audit_target(text),private.admin_audit_minimize(anyelement,text,text[]),private.minimize_admin_audit(),private.redact_deleted_account_audit()
 from public,anon,authenticated,service_role;
revoke all on function private.mail_effect_valid(text,integer,boolean),private.append_mail_effect(jsonb,uuid),private.bind_admin_effect_account(),
 private.redact_closed_admin_effect() from public,anon,authenticated,service_role;
revoke all on table public.admin_audit_log,private.admin_effects from public,anon,authenticated,service_role;
grant select on table public.admin_audit_log,private.admin_effects to service_role;
revoke all on function public.native_admin_record_mail_sync(uuid,uuid,uuid,text,uuid,uuid,text,integer),
 public.native_admin_record_mail_send(uuid,uuid,uuid,uuid,text,text,integer),
 public.native_admin_record_mail_erasure(uuid,uuid,uuid,uuid,text,integer,uuid) from public,anon,authenticated,service_role;
grant execute on function public.native_admin_record_mail_sync(uuid,uuid,uuid,text,uuid,uuid,text,integer),
 public.native_admin_record_mail_send(uuid,uuid,uuid,uuid,text,text,integer),
 public.native_admin_record_mail_erasure(uuid,uuid,uuid,uuid,text,integer,uuid) to service_role;
notify pgrst,'reload schema';
commit;
