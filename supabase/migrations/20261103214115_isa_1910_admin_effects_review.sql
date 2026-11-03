-- VANTA-132 / #1910 step 5b. No provider configuration or billing schema.
begin;
alter table private.admin_effects drop constraint admin_effects_outcome_check;
alter table private.admin_effects add constraint admin_effects_outcome_check check(outcome in ('started','succeeded','unknown','failed','reconciled'));
alter table private.admin_effects drop constraint admin_effects_effect_check;
alter table private.admin_effects add constraint admin_effects_effect_check check(effect in ('clerk_ban','clerk_unban','clerk_delete','storage_cleanup','polar_cancel'));
alter table private.admin_effects add column if not exists provider_status smallint check(provider_status between 100 and 599);
drop index private.admin_effects_terminal;
create unique index admin_effects_terminal on private.admin_effects(effect_id) where outcome in ('succeeded','unknown','failed');
create or replace function public.native_admin_record_effect(p_actor uuid,p_event jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare
 v_request uuid;
 v_effect uuid;
 v_start private.admin_effects;
 v_existing private.admin_effects;
begin
 if p_event->>'outcome'='started' then perform private.native_admin_require_owner(p_actor); end if;
 if p_event is null or jsonb_typeof(p_event)<>'object'
  or (select count(*) from jsonb_object_keys(p_event))not in (6,7)
  or not (p_event ?& array['request_id','effect_id','action','effect','target_hash','outcome'])
 then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 if exists(select 1 from jsonb_object_keys(p_event) k where k not in ('request_id','effect_id','action','effect','target_hash','outcome','provider_status')) then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 if p_event ? 'provider_status' and (p_event->>'outcome'='started' or jsonb_typeof(p_event->'provider_status')<>'number' or (p_event->>'provider_status') !~ '^[1-5][0-9]{2}$') then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 if p_event->>'request_id' is null or p_event->>'effect_id' is null
  or p_event->>'action' is null or p_event->>'effect' is null
  or p_event->>'target_hash' is null or p_event->>'outcome' is null
  or p_event->>'target_hash' !~ '^[0-9a-f]{64}$'
  or p_event->>'outcome' not in ('started','succeeded','unknown','failed')
  or not ((p_event->>'action'='set_blocked' and p_event->>'effect' in ('clerk_ban','clerk_unban','polar_cancel'))
       or (p_event->>'action'='delete_account' and p_event->>'effect' in ('clerk_delete','storage_cleanup','polar_cancel')))
 then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 begin
  v_request:=(p_event->>'request_id')::uuid;
  v_effect:=(p_event->>'effect_id')::uuid;
 exception when invalid_text_representation then
  raise exception 'native_admin_invalid' using errcode='22023';
 end;
 if p_event->>'outcome'='failed' and coalesce(p_event->>'provider_status','') not in ('401','403','422') then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 if exists(select 1 from private.admin_effects where effect_id=v_effect and outcome='reconciled') then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 if p_event->>'outcome'<>'started' then
  select * into v_start from private.admin_effects where effect_id=v_effect and outcome='started' for update;
  if not found or v_start.actor<>p_actor or v_start.request_id<>v_request
   or v_start.action<>p_event->>'action' or v_start.effect<>p_event->>'effect'
   or v_start.target_hash<>p_event->>'target_hash'
   or exists(select 1 from private.admin_effects where effect_id=v_effect and outcome='reconciled')
  then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 end if;
 insert into private.admin_effects(effect_id,outcome,request_id,actor,action,effect,target_hash,provider_status)
 values(v_effect,p_event->>'outcome',v_request,p_actor,p_event->>'action',p_event->>'effect',p_event->>'target_hash',(p_event->>'provider_status')::smallint)
 on conflict do nothing;
 select * into v_existing from private.admin_effects where effect_id=v_effect and outcome=p_event->>'outcome';
 if not found or v_existing.actor<>p_actor or v_existing.request_id<>v_request
  or v_existing.action<>p_event->>'action' or v_existing.effect<>p_event->>'effect'
  or v_existing.target_hash<>p_event->>'target_hash' or v_existing.provider_status is distinct from (p_event->>'provider_status')::smallint
 then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 return true;
end;
$$;

-- Results remain appendable after role expiry, but only against the exact
-- committed actor/request/effect/target intention. No new intent without owner.
create function public.native_admin_reconcile_effect(p_reviewer uuid,p_effect uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_start private.admin_effects;
begin
 perform private.native_admin_require_owner(p_reviewer);
 select * into v_start from private.admin_effects where effect_id=p_effect and outcome='started' for update;
 if not found or exists(select 1 from private.admin_effects where effect_id=p_effect and outcome in ('succeeded','failed'))
  or not (v_start.occurred_at < now()-interval '480 seconds' or exists(select 1 from private.admin_effects where effect_id=p_effect and outcome='unknown'))
 then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 insert into private.admin_effects(effect_id,outcome,request_id,actor,action,effect,target_hash)
 values(p_effect,'reconciled',v_start.request_id,p_reviewer,v_start.action,v_start.effect,v_start.target_hash)
 on conflict do nothing;
 return true;
end;
$$;
create view private.admin_pending_effects with(security_invoker=true) as
 select i.*,coalesce(r.outcome,'pending') as latest_outcome,r.provider_status as latest_provider_status
 from private.admin_effects i left join private.admin_effects r on r.effect_id=i.effect_id and r.outcome='unknown'
 where i.outcome='started' and not exists(select 1 from private.admin_effects c where c.effect_id=i.effect_id and c.outcome in ('succeeded','failed','reconciled'));
revoke all on private.admin_pending_effects from public,anon,authenticated,service_role;
grant select on private.admin_pending_effects to service_role;

create table if not exists private.admin_change_leases(
 account_id uuid primary key, actor uuid not null, request_id uuid not null,
 token uuid not null, expires_at timestamptz not null
);
revoke all on private.admin_change_leases from public,anon,authenticated,service_role;
alter table private.admin_change_leases enable row level security;
-- A lease is a live-account writer too: preserve the canonical UUID/tombstone
-- barrier rather than exempting the new control table from the catalog gate.
drop trigger if exists a_account_write_barrier on private.admin_change_leases;
create trigger a_account_write_barrier before insert or update or delete on private.admin_change_leases
 for each row execute function private.guard_account_write('select array[($1->>''account_id'')::uuid]','select false');
-- 480s > hosted worker wall clock maximum 400s (paid plan) + 80s margin.
-- Never renew: a second request cannot extend a stale worker's authority.
create function public.native_admin_claim_change(p_actor uuid,p_request uuid,p_account uuid)
returns uuid language plpgsql security definer set search_path='' as $$
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
 then return null; end if;

 insert into private.admin_change_leases as l(account_id,actor,request_id,token,expires_at)
 values(p_account,p_actor,p_request,gen_random_uuid(),clock_timestamp()+interval '480 seconds')
 on conflict(account_id) do update set
 actor=excluded.actor,request_id=excluded.request_id,
 token=case when l.expires_at>clock_timestamp() and l.actor=p_actor and l.request_id=p_request then l.token else excluded.token end,
 expires_at=case when l.expires_at>clock_timestamp() and l.actor=p_actor and l.request_id=p_request then l.expires_at else clock_timestamp()+interval '480 seconds' end
 where l.expires_at<=clock_timestamp() or (l.actor=p_actor and l.request_id=p_request)
 returning token into v_token;
 return v_token;
end;
$$;
create function public.native_admin_release_change(p_actor uuid,p_request uuid,p_account uuid,p_token uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 -- Release is cleanup of an existing request, not a new owner operation.
 if private.lock_account_write(p_account) then return true; end if;
 -- Preserve the request link for pending effects; cleanup of expired leases is
 -- a separate task and must not remove a row referenced by a pending effect.
 update private.admin_change_leases set expires_at='-infinity'::timestamptz where account_id=p_account and actor=p_actor and request_id=p_request and token=p_token;
 return found;
end;
$$;
create function public.native_admin_finish_change(p_actor uuid,p_issuer text,p_params jsonb,p_environment text,p_request uuid,p_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.lock_accounts_before_rows(array[p_actor,(p_params->>'account_id')::uuid]);
 perform private.native_admin_require_owner(p_actor);
 perform 1 from private.admin_change_leases where account_id=(p_params->>'account_id')::uuid
  and actor=p_actor and request_id=p_request and token=p_token and expires_at>clock_timestamp() for update;
 if not found then raise exception 'native_admin_lease_conflict' using errcode='40001'; end if;
 -- Hold the lease row lock until the state write commits. A takeover cannot
 -- race the check and this write, even if the clock advances during the call.
 return public.native_admin_execute(p_actor,p_issuer,'set_blocked',p_params,p_environment);
end;
$$;
revoke all on function public.native_admin_record_effect(uuid,jsonb),public.native_admin_reconcile_effect(uuid,uuid),public.native_admin_claim_change(uuid,uuid,uuid),public.native_admin_release_change(uuid,uuid,uuid,uuid),public.native_admin_finish_change(uuid,text,jsonb,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.native_admin_record_effect(uuid,jsonb),public.native_admin_reconcile_effect(uuid,uuid),public.native_admin_claim_change(uuid,uuid,uuid),public.native_admin_release_change(uuid,uuid,uuid,uuid),public.native_admin_finish_change(uuid,text,jsonb,text,uuid,uuid) to service_role;
commit;
