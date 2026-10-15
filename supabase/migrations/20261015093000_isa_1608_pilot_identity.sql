-- #1608 R8 / #1612: the non-bypass Pilot writer evaluates account RLS too.
begin;
set local search_path='';
-- Only identity lookup, never registry/table access or the authenticated role.
grant usage on schema private to pilot_profile_writer;
grant execute on function private.current_account() to pilot_profile_writer;
alter policy pilot_operation_self on pilot_private.operations
 using (account_id = (select private.current_account()))
 with check (account_id = (select private.current_account()));
do $$
declare definition text;
begin
 definition:=pg_get_functiondef('pilot_private.pilot_profile_save(jsonb,text,bigint,uuid)'::regprocedure);
 if position('auth.uid()' in definition)=0 then raise exception 'pilot_identity_entry_changed'; end if;
 execute replace(definition,'auth.uid()','private.current_account()');
end $$;
commit;
