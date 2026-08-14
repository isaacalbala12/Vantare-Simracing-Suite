do $$
declare
  v_bucket storage.buckets%rowtype;
begin
  if exists (
    select 1
    from storage.objects
    where bucket_id='testing-center-evidence'
  ) then
    raise exception 'testing_center_evidence_rollback_bucket_not_empty'
      using errcode='55000';
  end if;

  select * into v_bucket
  from storage.buckets
  where id='testing-center-evidence';
  if found and (
    v_bucket.name is distinct from 'testing-center-evidence'
    or v_bucket.public is distinct from false
    or v_bucket.file_size_limit is distinct from 10485760
    or v_bucket.allowed_mime_types is distinct from array['image/png','image/jpeg']::text[]
  ) then
    raise exception 'testing_center_evidence_rollback_bucket_incompatible'
      using errcode='55000';
  end if;
end
$$;

revoke execute on function public.testing_center_submit_report_with_evidence(
  text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text,uuid
) from authenticated;
revoke execute on function public.testing_center_finalize_screenshot(uuid,uuid)
from authenticated;
revoke execute on function public.testing_center_prepare_screenshot_batch(text,text,text,jsonb)
from authenticated;

drop function if exists public.testing_center_submit_report_with_evidence(
  text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text,uuid
);
drop function if exists public.testing_center_finalize_screenshot(uuid,uuid);
drop function if exists public.testing_center_prepare_screenshot_batch(text,text,text,jsonb);

drop policy if exists testing_center_evidence_insert_own_slot on storage.objects;
revoke execute on function public.testing_center_can_insert_evidence_object(text,text)
from authenticated;
drop function if exists public.testing_center_can_insert_evidence_object(text,text);

drop table if exists public.testing_center_evidence_outbox;
drop table if exists public.testing_center_screenshot_evidence;
drop table if exists public.testing_center_evidence_batches;

delete from public.testing_center_evidence
where kind='screenshot';

alter table public.testing_center_evidence
  drop constraint testing_center_evidence_kind_check,
  add constraint testing_center_evidence_kind_check
  check (kind in ('report_context','diagnostic','reproduction'));

delete from storage.buckets
where id='testing-center-evidence'
  and name='testing-center-evidence'
  and public=false
  and file_size_limit=10485760
  and allowed_mime_types=array['image/png','image/jpeg']::text[]
  and not exists (
    select 1
    from storage.objects
    where bucket_id='testing-center-evidence'
  );
