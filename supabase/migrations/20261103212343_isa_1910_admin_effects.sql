-- VANTA-132 / #1910 step 5a. Separate RPC commits preserve external-write
-- intentions even when the subsequent state transaction or result ACK fails.
begin;
create table if not exists private.admin_effects (
  effect_id uuid not null,
  outcome text not null check (outcome in ('started','succeeded','unknown')),
  request_id uuid not null,
  actor uuid not null,
  action text not null check (action in ('set_blocked','delete_account')),
  effect text not null check (effect in ('clerk_ban','clerk_unban','clerk_delete','storage_cleanup')),
  target_hash text not null check (target_hash ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz not null default clock_timestamp(),
  primary key (effect_id,outcome)
);
create unique index if not exists admin_effects_terminal on private.admin_effects(effect_id) where outcome <> 'started';
create index if not exists admin_effects_request on private.admin_effects(request_id,occurred_at);
alter table private.admin_effects enable row level security;
revoke all on private.admin_effects from public,anon,authenticated,service_role;
grant select on private.admin_effects to service_role;
-- Retained across rollback: never discard committed evidence to roll back code.
drop trigger if exists admin_effects_append_only on private.admin_effects;
create trigger admin_effects_append_only before update or delete on private.admin_effects
 for each row execute function public.operational_access_reject_audit_mutation();

create function public.native_admin_record_effect(p_actor uuid,p_event jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare
 v_request uuid;
 v_effect uuid;
 v_start private.admin_effects;
 v_existing private.admin_effects;
begin
 perform private.native_admin_require_owner(p_actor);
 if p_event is null or jsonb_typeof(p_event)<>'object'
  or (select count(*) from jsonb_object_keys(p_event))<>6
  or not (p_event ?& array['request_id','effect_id','action','effect','target_hash','outcome'])
 then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 if p_event->>'request_id' is null or p_event->>'effect_id' is null
  or p_event->>'action' is null or p_event->>'effect' is null
  or p_event->>'target_hash' is null or p_event->>'outcome' is null
  or p_event->>'target_hash' !~ '^[0-9a-f]{64}$'
  or p_event->>'outcome' not in ('started','succeeded','unknown')
  or not ((p_event->>'action'='set_blocked' and p_event->>'effect' in ('clerk_ban','clerk_unban'))
       or (p_event->>'action'='delete_account' and p_event->>'effect' in ('clerk_delete','storage_cleanup')))
 then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 begin
  v_request:=(p_event->>'request_id')::uuid;
  v_effect:=(p_event->>'effect_id')::uuid;
 exception when invalid_text_representation then
  raise exception 'native_admin_invalid' using errcode='22023';
 end;
 if p_event->>'outcome'<>'started' then
  select * into v_start from private.admin_effects where effect_id=v_effect and outcome='started' for update;
  if not found or v_start.actor<>p_actor or v_start.request_id<>v_request
   or v_start.action<>p_event->>'action' or v_start.effect<>p_event->>'effect'
   or v_start.target_hash<>p_event->>'target_hash'
  then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 end if;
 insert into private.admin_effects(effect_id,outcome,request_id,actor,action,effect,target_hash)
 values(v_effect,p_event->>'outcome',v_request,p_actor,p_event->>'action',p_event->>'effect',p_event->>'target_hash')
 on conflict do nothing;
 select * into v_existing from private.admin_effects where effect_id=v_effect and outcome=p_event->>'outcome';
 if not found or v_existing.actor<>p_actor or v_existing.request_id<>v_request
  or v_existing.action<>p_event->>'action' or v_existing.effect<>p_event->>'effect'
  or v_existing.target_hash<>p_event->>'target_hash'
 then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 return true;
end;
$$;
revoke all on function public.native_admin_record_effect(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.native_admin_record_effect(uuid,jsonb) to service_role;
commit;
