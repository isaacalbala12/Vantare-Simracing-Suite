-- VANTA-131 / step 8. Operational assignments are the sole owner authority.
-- The public review RPC in admin SQL is coordinated separately with VANTA-132.
begin;

create function private.is_owner(p_account uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_account is not null and exists (
    select 1 from public.operational_access_assignments a
    where a.user_id = p_account and a.role = 'owner'
      and a.status = 'active' and a.policy_version = 1
      and (a.expires_at is null or a.expires_at > now())
  )
$$;
revoke all on function private.is_owner(uuid) from public, anon, authenticated, service_role;

-- Preserve an explicit operational assignment, including a revocation or
-- expiry. Only legacy owners without any operational decision are backfilled.
do $$
declare owner_row record;
begin
  for owner_row in
    select m.user_id from public.testing_center_memberships m
    where m.active and m.role = 'owner'
      and not exists (
        select 1 from public.operational_access_assignments a
        where a.user_id = m.user_id
          and not (
            a.role = 'owner' and a.status = 'revoked'
            and a.granted_by = 'migration:vanta131'
            and a.revoked_by = 'rollback:vanta131'
            and a.correlation_id = 'vanta131-rollback-' || replace(a.user_id::text, '-', '')
          )
      )
    order by m.user_id
  loop
    perform public.operational_access_set(
      owner_row.user_id, 'owner', 'grant', 'migration:vanta131',
      'Legacy Testing Center owner migration',
      'vanta131-owner-' || replace(owner_row.user_id::text, '-', ''), null
    );
  end loop;
end $$;

create or replace function public.testing_center_current_role()
returns text language sql stable security definer set search_path = '' as $$
  select case
    when private.is_owner(private.current_account()) then 'owner'
    else (
      select m.role from public.testing_center_memberships m
      where m.user_id = private.current_account() and m.active
        and m.role <> 'owner'
    )
  end
$$;

-- Keep calendar bodies unchanged apart from the owner authority. Abort on
-- unexpected source drift rather than accidentally retaining the old check.
do $$
declare signature regprocedure; definition text;
begin
  foreach signature in array array[
    'public.race_schedule_draft_save(text,jsonb,timestamptz,integer)'::regprocedure,
    'public.race_schedule_publish(uuid)'::regprocedure,
    'public.race_schedule_my_draft()'::regprocedure
  ] loop
    definition := pg_get_functiondef(signature);
    if position('public.is_active_owner(' in definition) = 0 then
      raise exception 'race_schedule_owner_source_drift' using errcode = '55000';
    end if;
    execute replace(definition, 'public.is_active_owner(', 'private.is_owner(');
  end loop;
end $$;

drop function public.is_active_owner(uuid);
commit;
