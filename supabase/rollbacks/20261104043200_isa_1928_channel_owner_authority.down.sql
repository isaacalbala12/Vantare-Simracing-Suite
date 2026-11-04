-- Restore the step 8 role function. Roll back before step 8 itself.
begin;
set local lock_timeout = '5s';

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

commit;
