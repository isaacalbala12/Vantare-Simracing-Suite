-- Contrato mínimo de pruebas, solo base desechable del runner.
create role anon;
create role authenticated;
create schema auth;
create schema storage;
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;
grant usage on schema auth,storage to anon,authenticated;
create table public.profiles(id uuid primary key);
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id bigint generated always as identity primary key,bucket_id text,name text,metadata jsonb);
alter table storage.objects enable row level security;
grant select,insert,update,delete on storage.objects to anon,authenticated;
grant usage on sequence storage.objects_id_seq to anon,authenticated;
create function storage.foldername(name text) returns text[] language sql immutable as $$
 select (string_to_array(name,'/'))[:array_length(string_to_array(name,'/'),1)-1];
$$;
-- Una instalación puede tener policies globales: el bucket piloto debe seguir privado.
create policy broad_existing on storage.objects for all to public using(true) with check(true);
insert into public.profiles values('16120000-0000-0000-0000-000000000001'),('16120000-0000-0000-0000-000000000002');
