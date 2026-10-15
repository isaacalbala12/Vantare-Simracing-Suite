-- #1608 R6-P2-2: read audit describes a target; it does not mutate that account.
begin;
set local search_path='';
do $$
declare definition text; owners text; unresolved text;
begin
 select tgargs[1],tgargs[2] into owners,unresolved from (
   select string_to_array(encode(tgargs,'escape'),E'\\000') tgargs from pg_trigger
   where tgrelid='public.admin_audit_log'::regclass and tgname='a_account_write_barrier') t;
 execute format('create or replace trigger a_account_write_barrier before insert or update or delete on public.admin_audit_log
   for each row execute function private.guard_account_write(%L,%L)',
   'select case when $1->>''action'' in (''search_accounts'',''get_account'',''get_rollout'',''list_reports'',''get_report'')
     then array[($1->>''actor_account_id'')::uuid] else ('||owners||') end',unresolved);
 definition:=pg_get_functiondef('public.native_admin_execute(uuid,text,text,jsonb,text)'::regprocedure);
 if position('perform private.lock_accounts_before_rows(array[p_actor,v_account]);' in definition)=0 then
   raise exception 'admin_entry_changed'; end if;
 definition:=replace(definition,E'declare\n',E'declare\n  v_lock_account uuid;\n');
 definition:=replace(definition,'perform private.lock_accounts_before_rows(array[p_actor,v_account]);',$prefix$
  for v_lock_account in select distinct a from unnest(array[p_actor,v_account]) a where a is not null order by a loop
    if private.lock_account_write(v_lock_account) and (v_lock_account=p_actor or
      p_action not in ('search_accounts','get_account','get_rollout','list_reports','get_report')) then
      raise sqlstate '28000' using message='account_deleted';
    end if;
  end loop;
$prefix$);
 execute definition;
end $$;
commit;
