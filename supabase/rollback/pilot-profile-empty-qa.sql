-- #1612: retirar SOLO un paquete QA vacío, nunca datos reales ni producción.
-- Requiere SET vantare.pilot_qa_rollback='empty-disposable' en esta conexión.
begin;
do $$
begin
  if current_setting('vantare.pilot_qa_rollback',true) is distinct from 'empty-disposable'
    or inet_server_addr() is distinct from '127.0.0.1'::inet then
    raise exception 'only authorized disposable loopback QA' using errcode='42501';
  end if;
end;
$$;
-- La verificación y retirada son atómicas frente a nuevos guardados/subidas.
lock table public.pilot_profiles,storage.objects,storage.buckets in access exclusive mode;
do $$
begin
  if exists(select 1 from public.pilot_profiles)
    or exists(select 1 from storage.objects where bucket_id='pilot-photos') then
    raise exception 'preserve profiles and photos: package is not empty' using errcode='55000';
  end if;
end;
$$;
drop function public.pilot_profile_load();
drop function public.pilot_profile_save(jsonb,text,bigint);
drop function pilot_private.pilot_profile_save(jsonb,text,bigint);
drop table public.pilot_profiles;
drop function public.pilot_profile_valid(jsonb,text);
drop policy pilot_photo_read on storage.objects;
drop policy pilot_photo_insert on storage.objects;
drop policy pilot_photo_delete on storage.objects;
drop policy pilot_photo_private_guard on storage.objects;
drop policy pilot_photo_immutable_guard on storage.objects;
delete from storage.buckets where id='pilot-photos';
drop schema pilot_private;
revoke all on storage.objects from pilot_profile_writer;
revoke all on function auth.uid() from pilot_profile_writer;
revoke all on schema public,auth,storage from pilot_profile_writer;
drop role pilot_profile_writer;
commit;
