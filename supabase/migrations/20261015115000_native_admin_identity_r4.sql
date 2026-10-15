-- #1627 + #1622: keep the new Clerk/tombstone resolver AND admin blocking.
begin;
do $$
declare definition text; marker text:='return account;';
begin
 definition:=pg_get_functiondef('private.resolve_account_identity(text,text)'::regprocedure);
 if position(marker in definition)=0 or position('private.lock_account_write(account)' in definition)=0 then
  raise exception 'admin_identity_entry_changed'; end if;
 definition:=replace(definition,marker,$guard$
  if exists(select 1 from private.admin_account_blocks where account_id=account and blocked) then
   raise exception 'native_account_blocked' using errcode='42501'; end if;
  return account;
$guard$);
 execute definition;
end $$;
commit;
