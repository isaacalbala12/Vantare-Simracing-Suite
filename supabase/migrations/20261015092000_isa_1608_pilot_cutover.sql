-- #1608 R7: keep the common barrier complete after merging nightly #1612.
begin;
set local search_path='';
create trigger a_account_write_barrier before insert or update or delete on pilot_private.operations
for each row execute function private.guard_account_write(
 'select array[($1->>''account_id'')::uuid]',
 'select not exists(select 1 from public.profiles where id=($1->>''account_id'')::uuid)');
do $$
declare definition text;
begin
 definition:=pg_get_functiondef('private.storage_owner_accounts(jsonb)'::regprocedure);
 definition:=replace(definition,'  -- Deprecated owner', $p$
  -- Pilot paths are UUID/hash.jpg and may be written with a service owner NULL.
  if p_row->>'bucket_id'='pilot-photos' and coalesce(p_row->>'name',p_row->>'key')
    ~ '^[0-9a-f-]{36}/[0-9a-f]{64}\.jpg$' then
    return next split_part(coalesce(p_row->>'name',p_row->>'key'),'/',1)::uuid;
  end if;
  -- Deprecated owner$p$);
 execute definition;
 definition:=pg_get_functiondef('public.apply_clerk_user_event(text,text,text,text,text,timestamptz,text)'::regprocedure);
 definition:=replace(definition,'    delete from public.testing_answers',
  '    delete from pilot_private.operations where account_id=account;'||chr(10)||
  '    delete from public.pilot_profiles where account_id=account;'||chr(10)||'    delete from public.testing_answers');
 definition:=replace(definition,'where o.owner_id::text=account::text',
   'where account in (select private.storage_owner_accounts(to_jsonb(o))) or o.owner_id::text=account::text');
 definition:=replace(definition,'where u.owner_id=account::text',
   'where account in (select private.storage_owner_accounts(to_jsonb(u))) or u.owner_id=account::text');
 execute definition;
end $$;
commit;
