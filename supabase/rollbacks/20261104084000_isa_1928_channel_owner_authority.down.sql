-- Restore the step 8 role function. Roll back before step 8 itself.
begin;
set local lock_timeout = '5s';

-- Restore each writer's exact pre-change body; CREATE OR REPLACE retains ACLs.
do $restore$
declare
  signature regprocedure;
  definition text;
  new_gate text;
  old_gate text;
  new_role text;
  old_role text;
begin
  foreach signature in array array[
    'private.testing_report_submit_for_account(uuid,uuid,text,text,text,boolean)'::regprocedure,
    'private.testing_contribution_submit_for_account(uuid,uuid,text,text,text)'::regprocedure,
    'private.testing_contribution_submit_v2_for_account(uuid,uuid,text,text,text,jsonb,jsonb)'::regprocedure
  ] loop
    definition := pg_get_functiondef(signature);
    if signature = 'private.testing_report_submit_for_account(uuid,uuid,text,text,text,boolean)'::regprocedure then
      new_gate := $new$if p_channel in ('nightly','testers') and not private.is_owner(p_account) and not exists ($new$;
      old_gate := $old$if p_channel in ('nightly','testers') and not exists ($old$;
      new_role := $new$m.role = 'primary_tester'$new$;
      old_role := $old$m.role in ('owner','primary_tester')$old$;
    elsif signature = 'private.testing_contribution_submit_for_account(uuid,uuid,text,text,text)'::regprocedure then
      new_gate := $new$if not (private.is_owner(p_account) and p_channel in ('nightly','testers')) and not exists(select 1 from public.testing_center_memberships$new$;
      old_gate := $old$if not exists(select 1 from public.testing_center_memberships$old$;
      new_role := $new$m.role = 'primary_tester'$new$;
      old_role := $old$m.role in ('owner','primary_tester')$old$;
    else
      new_gate := $new$if not found and not (private.is_owner(p_account) and p_channel in ('nightly','testers')) then$new$;
      old_gate := $old$if not found then$old$;
      new_role := $new$role = 'primary_tester'$new$;
      old_role := $old$role in ('owner','primary_tester')$old$;
    end if;
    if (length(definition)-length(replace(definition,new_gate,'')))/length(new_gate) <> 1
      or (length(definition)-length(replace(definition,new_role,'')))/length(new_role) <> 1 then
      raise exception 'channel_submit_rollback_source_drift: %', signature using errcode='55000';
    end if;
    execute replace(replace(definition,new_gate,old_gate),new_role,old_role);
  end loop;
end $restore$;

do $role_restore$
declare definition text;
begin
  definition := pg_get_functiondef('public.testing_center_current_role()'::regprocedure);
  if (length(definition)-length(replace(definition,
       $new$m.role in ('tester', 'primary_tester')$new$, '')))
       /length($new$m.role in ('tester', 'primary_tester')$new$) <> 1 then
    raise exception 'channel_role_rollback_source_drift' using errcode='55000';
  end if;
  execute replace(definition, $new$m.role in ('tester', 'primary_tester')$new$,
    $old$m.role <> 'owner'$old$);
end $role_restore$;

commit;
