-- #1608 R4-P1-1. These tables are service writers, not descendants of objects.
begin;
set local search_path='';
create trigger a_account_write_barrier before insert or update or delete on storage.s3_multipart_uploads
for each row execute function private.guard_account_write(
 'select array_agg(distinct account order by account) from private.storage_owner_accounts($1) account', 'select false');
create trigger a_account_write_barrier before insert or update or delete on storage.s3_multipart_uploads_parts
for each row execute function private.guard_account_write(
 $query$select array_agg(distinct account order by account) from (
   select private.storage_owner_accounts($1) account
   union select private.storage_owner_accounts(to_jsonb(u)) from storage.s3_multipart_uploads u
     where u.id=$1->>'upload_id') owners$query$,
 $query$select not exists(select 1 from storage.s3_multipart_uploads u where u.id=$1->>'upload_id')$query$);
create table private.clerk_deleted_uploads (
 issuer text not null, subject text not null, bucket_id text not null, name text not null,
 upload_id text not null, primary key(issuer,subject,upload_id),
 foreign key(issuer,subject) references public.account_identities(issuer,subject) on delete restrict
);
revoke all on private.clerk_deleted_uploads from public,anon,authenticated,service_role;
create trigger a_account_write_barrier before insert or update or delete on private.clerk_deleted_uploads
for each row execute function private.guard_account_write(
 $query$select array_agg(account_id) from public.account_identities
   where issuer=$1->>'issuer' and subject=$1->>'subject'$query$, 'select false');
do $$
declare definition text; marker text:='    -- Storage bytes are removed through the Storage API, never SQL DELETE.';
begin
 definition:=pg_get_functiondef('public.apply_clerk_user_event(text,text,text,text,text,timestamptz,text)'::regprocedure);
 if position(marker in definition)=0 then raise exception 'storage_cleanup_body_changed'; end if;
 definition:=replace(definition,marker,$replacement$
    -- Abort persisted uploads through S3 API, before deleting final objects.
    insert into private.clerk_deleted_uploads(issuer,subject,bucket_id,name,upload_id)
      select p_issuer,p_subject,u.bucket_id,u.key,u.id from storage.s3_multipart_uploads u
      where u.owner_id=account::text
        or (exists(select 1 from public.account_identities a where a.account_id=account and a.subject=u.owner_id)
          and not exists(select 1 from public.account_identities a where a.account_id<>account and a.subject=u.owner_id))
        or (u.bucket_id='testing-center-evidence' and exists(
          select 1 from public.testing_center_screenshot_evidence e
          join public.testing_center_evidence_batches b using(batch_id)
          where b.reporter_user_id=account and e.object_path=u.key))
      on conflict do nothing;
$replacement$||marker);
 execute definition;
end $$;
create function public.clerk_deletion_uploads(p_issuer text,p_subject text)
returns table(bucket_id text,name text,upload_id text) language sql stable security definer set search_path='' as $$
 select u.bucket_id,u.name,u.upload_id from private.clerk_deleted_uploads u
 join public.account_identities i using(issuer,subject)
 where u.issuer=p_issuer and u.subject=p_subject and i.deleted_at is not null
 order by u.upload_id limit 1000
$$;
create function public.clerk_deletion_upload_completed(p_issuer text,p_subject text,p_upload_id text)
returns void language sql security definer set search_path='' as $$
 delete from private.clerk_deleted_uploads u where u.issuer=p_issuer and u.subject=p_subject
 and u.upload_id=p_upload_id and exists(select 1 from public.account_identities i
   where i.issuer=u.issuer and i.subject=u.subject and i.deleted_at is not null)
$$;
revoke all on function public.clerk_deletion_uploads(text,text),public.clerk_deletion_upload_completed(text,text,text)
 from public,anon,authenticated,service_role;
grant execute on function public.clerk_deletion_uploads(text,text),public.clerk_deletion_upload_completed(text,text,text) to service_role;
commit;
