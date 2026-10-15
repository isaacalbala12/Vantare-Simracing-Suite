-- #1608 R5-P2-1: outer admin entry owns actor + all targets before any row.
begin;
set local search_path='';
do $$
declare definition text; marker text:='  perform private.native_admin_require_owner(p_actor);';
begin
 definition:=pg_get_functiondef('public.native_admin_execute(uuid,text,text,jsonb,text)'::regprocedure);
 if position(marker in definition)=0 then raise exception 'admin_entry_changed'; end if;
 definition:=replace(definition,marker,$prefix$
  -- Collect the complete set before require_owner locks the actor assignment.
  -- Report ownership is immutable; reread it under the UUID lock before rows.
  if p_action in ('get_account','set_tester','set_module') then
    v_account := (p_params->>'account_id')::uuid;
  elsif p_action in ('get_report','set_report_status') then
    select reporter_user_id into v_account from public.testing_center_reports
      where report_id=p_params->>'report_id';
  end if;
  perform private.lock_accounts_before_rows(array[p_actor,v_account]);
  if p_action in ('get_report','set_report_status') and v_account is distinct from
    (select reporter_user_id from public.testing_center_reports where report_id=p_params->>'report_id') then
    raise sqlstate '40001' using message='admin_report_owner_changed';
  end if;
$prefix$||marker);
 execute definition;
 -- Covers native_admin_begin and any direct use of this private helper.
 definition:=pg_get_functiondef('private.native_admin_require_owner(uuid)'::regprocedure);
 definition:=regexp_replace(definition,'\mbegin\M',
   'begin'||chr(10)||'  perform private.lock_accounts_before_rows(array[p_actor]);','i');
 execute definition;
end $$;
commit;
