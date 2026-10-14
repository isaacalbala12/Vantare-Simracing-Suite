-- #1612 / VANTA-9. PREPARADA, NO APLICAR EN PRODUCCIÓN SIN OK DE ISAAC.
begin;

create table public.pilot_profiles (
  account_id uuid primary key references public.profiles(id) on delete cascade,
  profile jsonb not null default '{}'::jsonb,
  photo_hash text,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(profile) = 'object' and octet_length(profile::text) <= 49152),
  check (not (profile ? 'photo') or profile->'photo' = 'null'::jsonb),
  check (photo_hash is null or photo_hash ~ '^[0-9a-f]{64}$')
);
alter table public.pilot_profiles enable row level security;
revoke all on public.pilot_profiles from public, anon;
grant select, insert, update, delete on public.pilot_profiles to authenticated;
create policy pilot_self on public.pilot_profiles to authenticated
  using (account_id = (select auth.uid()))
  with check (account_id = (select auth.uid()));

-- INVOKER: RLS siempre se aplica; sin roles ni permisos derivados del formulario.
create function public.pilot_profile_load() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('profile', profile, 'revision', revision, 'photo_hash', photo_hash)
  from public.pilot_profiles where account_id = auth.uid();
$$;
create function public.pilot_profile_save(p_profile jsonb, p_photo_hash text, p_expected_revision bigint)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_result jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  if p_expected_revision is null or p_expected_revision < 0
    or p_profile is null or jsonb_typeof(p_profile) <> 'object'
    or octet_length(p_profile::text) > 49152
    or (p_profile ? 'photo' and p_profile->'photo' <> 'null'::jsonb)
    or (p_photo_hash is not null and p_photo_hash !~ '^[0-9a-f]{64}$')
    then raise exception 'invalid profile' using errcode='22023'; end if;
  if p_photo_hash is not null and not exists (
    select 1 from storage.objects where bucket_id='pilot-photos'
      and name=auth.uid()::text || '/' || p_photo_hash || '.jpg'
  ) then raise exception 'photo missing' using errcode='22023'; end if;
  if p_expected_revision = 0 then
    insert into public.pilot_profiles(account_id,profile,photo_hash)
      values(auth.uid(),p_profile,p_photo_hash) on conflict(account_id) do nothing
      returning jsonb_build_object('profile',profile,'revision',revision,'photo_hash',photo_hash) into v_result;
  else
    update public.pilot_profiles set profile=p_profile,photo_hash=p_photo_hash,
      revision=revision+1,updated_at=now()
      where account_id=auth.uid() and revision=p_expected_revision
      returning jsonb_build_object('profile',profile,'revision',revision,'photo_hash',photo_hash) into v_result;
  end if;
  if v_result is null then raise exception 'revision conflict' using errcode='40001'; end if;
  return v_result;
end;
$$;
revoke all on function public.pilot_profile_load() from public, anon;
revoke all on function public.pilot_profile_save(jsonb,text,bigint) from public, anon;
grant execute on function public.pilot_profile_load() to authenticated;
grant execute on function public.pilot_profile_save(jsonb,text,bigint) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('pilot-photos','pilot-photos',false,24576,array['image/jpeg']);
-- Solo objetos inmutables por hash, en el namespace UUID del puente nativo.
create policy pilot_photo_read on storage.objects for select to authenticated
  using (bucket_id='pilot-photos' and name ~ '^[0-9a-f-]{36}/[0-9a-f]{64}\.jpg$'
    and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy pilot_photo_insert on storage.objects for insert to authenticated
  with check (bucket_id='pilot-photos' and name ~ '^[0-9a-f-]{36}/[0-9a-f]{64}\.jpg$'
    and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy pilot_photo_delete on storage.objects for delete to authenticated
  using (bucket_id='pilot-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- Defensa contra policies permisivas globales ya existentes en Storage.
create policy pilot_photo_private_guard on storage.objects as restrictive for all to public
  using (bucket_id <> 'pilot-photos' or (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id <> 'pilot-photos' or (storage.foldername(name))[1] = (select auth.uid())::text);
commit;
