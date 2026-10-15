-- #1608 R7: unmodified managed Storage can authorize abort without writing.
begin;
set local search_path='';
create function private.storage_abort_probe() returns trigger
language plpgsql security definer set search_path='' as $$
declare pending private.clerk_deleted_uploads;
begin
  if current_setting('storage.operation',true) is distinct from 'storage.s3.upload.abort_multipart'
    or current_setting('request.method',true) is distinct from 'DELETE' then return new; end if;
  -- Storage supplies the request path. Match the upload id independently of
  -- the requested bucket/key (the upstream abort does not check their pairing).
  select u.* into pending from private.clerk_deleted_uploads u
    join public.account_identities i using(issuer,subject)
    where i.deleted_at is not null and split_part(
      substring(current_setting('request.path',true) from '[?&]uploadId=([^&]*)'), '#', 1)
      in (u.upload_id,replace(replace(replace(replace(u.upload_id,
        '%','%25'),'+','%2B'),'/','%2F'),'=','%3D')) limit 1;
  if not found then return new; end if;
  if auth.jwt()->>'role' is distinct from 'service_role'
    or new.bucket_id<>pending.bucket_id or new.name<>pending.name
    or tg_op<>'INSERT' or new.version is distinct from '1' then
    raise sqlstate '28000' using message='storage_deletion_abort_probe_invalid';
  end if;
  -- RETURN NULL suppresses the row, including ON CONFLICT UPDATE. No INSERT
  -- or UPDATE is exempted from the tombstone barrier. Forged SQL GUCs can at
  -- most request this no-op; they cannot persist any data. canUpload ignores
  -- the empty RETURNING result and Storage still aborts bytes through its API.
  return null;
end $$;
revoke all on function private.storage_abort_probe() from public,anon,authenticated,service_role;
create trigger a0_deletion_abort_probe before insert or update on storage.objects
for each row execute function private.storage_abort_probe();
commit;
