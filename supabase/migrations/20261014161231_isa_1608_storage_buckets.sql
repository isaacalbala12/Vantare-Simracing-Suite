-- #1608 R5-P3-1: real Storage buckets can also carry account ownership.
begin;
set local search_path='';
create trigger a_account_write_barrier before insert or update or delete on storage.buckets
for each row execute function private.guard_account_write(
 'select array_agg(distinct account order by account) from private.storage_owner_accounts($1) account',
 'select false');
-- Bucket ownership is also a root for its objects/uploads/parts, even when
-- their own owner is NULL. Missing/invisible bucket parents fail closed.
do $$
declare relation text;
begin
 foreach relation in array array['storage.objects','storage.s3_multipart_uploads'] loop
  execute format('create or replace trigger a_account_write_barrier before insert or update or delete on %s
    for each row execute function private.guard_account_write(%L,%L)', relation,
    $query$select array_agg(distinct account order by account) from (
      select private.storage_owner_accounts($1) account
      union select private.storage_owner_accounts(to_jsonb(b)) from storage.buckets b
        where b.id=$1->>'bucket_id') owners$query$,
    $query$select not exists(select 1 from storage.buckets b where b.id=$1->>'bucket_id')$query$);
 end loop;
end $$;
create or replace trigger a_account_write_barrier before insert or update or delete on storage.s3_multipart_uploads_parts
for each row execute function private.guard_account_write(
 $query$select array_agg(distinct account order by account) from (
   select private.storage_owner_accounts($1) account
   union select private.storage_owner_accounts(to_jsonb(u)) from storage.s3_multipart_uploads u where u.id=$1->>'upload_id'
   union select private.storage_owner_accounts(to_jsonb(b)) from storage.buckets b where b.id=$1->>'bucket_id') owners$query$,
 $query$select not exists(select 1 from storage.s3_multipart_uploads u where u.id=$1->>'upload_id')
   or not exists(select 1 from storage.buckets b where b.id=$1->>'bucket_id')$query$);
-- Cleanup must include the same inherited ownership as the write barrier.
do $$
declare definition text; marker text;
begin
 definition:=pg_get_functiondef('public.apply_clerk_user_event(text,text,text,text,text,timestamptz,text)'::regprocedure);
 marker:='where o.owner_id::text=account::text';
 if position(marker in definition)=0 then raise exception 'object_cleanup_changed'; end if;
 definition:=replace(definition,marker,marker||$q$
        or account in (select private.storage_owner_accounts(to_jsonb(b)) from storage.buckets b where b.id=o.bucket_id)$q$);
 marker:='where u.owner_id=account::text';
 if position(marker in definition)=0 then raise exception 'upload_cleanup_changed'; end if;
 definition:=replace(definition,marker,marker||$q$
        or account in (select private.storage_owner_accounts(to_jsonb(b)) from storage.buckets b where b.id=u.bucket_id)$q$);
 execute definition;
end $$;
commit;
