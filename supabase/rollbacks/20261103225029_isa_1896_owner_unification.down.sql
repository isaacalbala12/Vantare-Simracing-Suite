-- Revert step 8 before any admin migration depending on private.is_owner.
begin;
set local lock_timeout = '5s';

create function public.is_active_owner(p_user_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.operational_access_assignments a
    where a.user_id = p_user_id and a.role = 'owner'
      and a.status = 'active'
      and (a.expires_at is null or a.expires_at > now())
  )
$$;
revoke all on function public.is_active_owner(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.is_active_owner(uuid) to service_role;

do $$
declare signature regprocedure; definition text;
begin
  foreach signature in array array[
    'public.race_schedule_draft_save(text,jsonb,timestamptz,integer)'::regprocedure,
    'public.race_schedule_publish(uuid)'::regprocedure,
    'public.race_schedule_my_draft()'::regprocedure
  ] loop
    definition := pg_get_functiondef(signature);
    if position('private.is_owner(' in definition) = 0 then
      raise exception 'race_schedule_owner_rollback_source_drift' using errcode = '55000';
    end if;
    execute replace(definition, 'private.is_owner(', 'public.is_active_owner(');
  end loop;
end $$;

create or replace function public.testing_center_current_role()
returns text language sql stable security definer set search_path = '' as $$
  select m.role from public.testing_center_memberships m
  where m.user_id = private.current_account() and m.active
$$;

-- A changed assignment is a new admin decision and is never overwritten.
do $$
declare owner_row record;
begin
  for owner_row in
    select a.user_id from public.operational_access_assignments a
    where a.role = 'owner' and a.status = 'active'
      and a.granted_by = 'migration:vanta131'
      and a.correlation_id = 'vanta131-owner-' || replace(a.user_id::text, '-', '')
    order by a.user_id
  loop
    perform public.operational_access_set(
      owner_row.user_id, 'owner', 'revoke', 'rollback:vanta131',
      'Revert legacy Testing Center owner migration',
      'vanta131-rollback-' || replace(owner_row.user_id::text, '-', ''), null
    );
  end loop;
end $$;

drop function private.is_owner(uuid);
commit;
