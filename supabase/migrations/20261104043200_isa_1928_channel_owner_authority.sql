-- #1928: only an operational owner can inherit owner channel access.
-- Keep the two tester membership roles as an explicit allowlist.
begin;
set local lock_timeout = '5s';

create or replace function public.testing_center_current_role()
returns text language sql stable security definer set search_path = '' as $$
  select case
    when private.is_owner(private.current_account()) then 'owner'
    else (
      select m.role from public.testing_center_memberships m
      where m.user_id = private.current_account() and m.active
        and m.role in ('tester', 'primary_tester')
    )
  end
$$;

commit;
