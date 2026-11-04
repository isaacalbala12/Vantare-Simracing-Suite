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

-- Patch only the three known writers. The source checks fail closed if an
-- upstream migration changed a gate; the entire migration then rolls back.
do $patch$
declare
  signature regprocedure;
  definition text;
  old_gate text;
  new_gate text;
  old_role text;
  new_role text;
begin
  foreach signature in array array[
    'private.testing_report_submit_for_account(uuid,uuid,text,text,text,boolean)'::regprocedure,
    'private.testing_contribution_submit_for_account(uuid,uuid,text,text,text)'::regprocedure,
    'private.testing_contribution_submit_v2_for_account(uuid,uuid,text,text,text,jsonb,jsonb)'::regprocedure
  ] loop
    definition := pg_get_functiondef(signature);
    if signature = 'private.testing_report_submit_for_account(uuid,uuid,text,text,text,boolean)'::regprocedure then
      old_gate := $old$if p_channel in ('nightly','testers') and not exists ($old$;
      new_gate := $new$if p_channel in ('nightly','testers') and not private.is_owner(p_account) and not exists ($new$;
      old_role := $old$m.role in ('owner','primary_tester')$old$;
      new_role := $new$m.role = 'primary_tester'$new$;
    elsif signature = 'private.testing_contribution_submit_for_account(uuid,uuid,text,text,text)'::regprocedure then
      old_gate := $old$if not exists(select 1 from public.testing_center_memberships$old$;
      new_gate := $new$if not (private.is_owner(p_account) and p_channel in ('nightly','testers')) and not exists(select 1 from public.testing_center_memberships$new$;
      old_role := $old$m.role in ('owner','primary_tester')$old$;
      new_role := $new$m.role = 'primary_tester'$new$;
    else
      old_gate := $old$if not found then$old$;
      new_gate := $new$if not found and not (private.is_owner(p_account) and p_channel in ('nightly','testers')) then$new$;
      old_role := $old$role in ('owner','primary_tester')$old$;
      new_role := $new$role = 'primary_tester'$new$;
    end if;
    if (length(definition)-length(replace(definition,old_gate,'')))/length(old_gate) <> 1
      or (length(definition)-length(replace(definition,old_role,'')))/length(old_role) <> 1 then
      raise exception 'channel_submit_source_drift: %', signature using errcode='55000';
    end if;
    execute replace(replace(definition,old_gate,new_gate),old_role,new_role);
  end loop;
end $patch$;

commit;
