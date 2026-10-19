-- #1612 / VANTA-9. PREPARADA, NO APLICAR EN PRODUCCIÓN SIN OK DE ISAAC.
begin;
-- No se admite que este esquema esté en los esquemas expuestos por Data API.
create schema pilot_private;
revoke all on schema pilot_private from public,anon;
grant usage on schema pilot_private to authenticated;
-- NOBYPASSRLS is the default; no privileged attribute clause on managed PG.
-- Roles survive schema rebuilds. Reuse a safe principal without touching
-- its password or privileged attributes; only repair permitted local drift.
do $pilot_profile_writer_role$
declare r pg_catalog.pg_roles%rowtype;
begin
  select * into r from pg_catalog.pg_roles where rolname='pilot_profile_writer';
  if not found then
    create role pilot_profile_writer nologin noinherit;
    select * into strict r from pg_catalog.pg_roles where rolname='pilot_profile_writer';
  end if;
  if r.rolsuper or r.rolbypassrls or r.rolreplication or r.rolcreatedb or r.rolcreaterole then
    raise exception 'unsafe_pilot_profile_writer_attributes' using errcode='42501',
      hint='Review the existing role with its administrator; migrations never demote privileged roles.';
  end if;
  begin
    if r.rolcanlogin then alter role pilot_profile_writer nologin; end if;
    if r.rolinherit then alter role pilot_profile_writer noinherit; end if;
  exception when insufficient_privilege then
    raise exception 'pilot_profile_writer_attributes_require_admin' using errcode='42501',
      hint='The role administrator must repair the permitted attributes before retrying.';
  end;
end $pilot_profile_writer_role$;
grant usage on schema public,auth,storage,pilot_private to pilot_profile_writer;
grant execute on function auth.uid() to pilot_profile_writer;


-- Contrato semántico de PilotProfile: campos futuros conservados.
create function public.pilot_profile_valid(document jsonb, photo_hash text) returns boolean
language plpgsql immutable security invoker set search_path = '' as $$
declare
  field text; value text; limit_chars integer; item jsonb; seen text[] := array[]::text[];
  code integer; normalized jsonb; node record;
  whitespace text := chr(9)||chr(10)||chr(11)||chr(12)||chr(13)||chr(32)||chr(133)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288);
begin
  if document is null or jsonb_typeof(document) <> 'object'
    or (document ? 'photo' and document->'photo' <> 'null'::jsonb)
    or (photo_hash is not null and photo_hash !~ '^[0-9a-f]{64}$') then return false; end if;
  foreach field in array array['public_name','description','favorite_car','favorite_team'] loop
    if document ? field then
      if jsonb_typeof(document->field) <> 'string' then return false; end if;
      value := document->>field;
      limit_chars := case field when 'public_name' then 64 when 'description' then 280 else 120 end;
      if char_length(value) > limit_chars then return false; end if;
      for i in 1..char_length(value) loop
        code := ascii(substr(value,i,1));
        if (code < 32 or code between 127 and 159) and not (field='description' and code=10) then return false; end if;
      end loop;
    end if;
  end loop;
  if document ? 'country' and document->'country' <> 'null'::jsonb then
    if jsonb_typeof(document->'country') <> 'string'
      or not (document->>'country' = any(string_to_array('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW',' '))) then return false; end if;
  end if;
  if document ? 'simulators' then
    if jsonb_typeof(document->'simulators') <> 'array' then return false; end if;
    if jsonb_array_length(document->'simulators') > 16 then return false; end if;
    for item in select * from jsonb_array_elements(document->'simulators') loop
      if jsonb_typeof(item) <> 'string' then return false; end if;
      value := item #>> '{}';
      if btrim(value,whitespace) = '' or char_length(value) > 64 or value = any(seen) then return false; end if;
      for i in 1..char_length(value) loop
        code := ascii(substr(value,i,1));
        if code < 32 or code between 127 and 159 then return false; end if;
      end loop;
      seen := array_append(seen,value);
    end loop;
  end if;
  normalized := '{"public_name":"","description":"","country":null,"simulators":[],"favorite_car":"","favorite_team":"","photo":null}'::jsonb || document;
  -- Reserva el máximo JPEG/base64 antes de aceptar un documento con foto.
  -- jsonb::text incluye espacios; este límite es conservador frente a serde_json.
  if octet_length(normalized::text) + (case when photo_hash is null then 0 else 32780 end) > 49152 then return false; end if;
  -- Los campos futuros también deben ser legibles por serde_json (profundidad y f64).
  for node in
    with recursive nodes(value,depth) as (
      select document,1
      union all
      select child.value,nodes.depth+1 from nodes cross join lateral (
        select e.value from jsonb_each(case when jsonb_typeof(nodes.value)='object' then nodes.value else '{}'::jsonb end) e
        union all
        select a.value from jsonb_array_elements(case when jsonb_typeof(nodes.value)='array' then nodes.value else '[]'::jsonb end) a
      ) child where nodes.depth <= 120
    ) select * from nodes
  loop
    if node.depth > 120 then return false; end if;
    if jsonb_typeof(node.value)='number' then perform (node.value::text)::double precision; end if;
  end loop;
  return true;
exception when numeric_value_out_of_range then return false;
end;
$$;
revoke all on function public.pilot_profile_valid(jsonb,text) from public,anon;
grant execute on function public.pilot_profile_valid(jsonb,text) to authenticated,pilot_profile_writer;

create table public.pilot_profiles (
  account_id uuid primary key references public.profiles(id) on delete cascade,
  profile jsonb not null default '{}'::jsonb,
  photo_hash text,
  revision bigint not null default 1 check (revision > 0),
  last_op_id uuid,
  updated_at timestamptz not null default now(),
  check (public.pilot_profile_valid(profile,photo_hash)),
  check (not (profile ? 'photo') or profile->'photo' = 'null'::jsonb),
  check (photo_hash is null or photo_hash ~ '^[0-9a-f]{64}$')
);
alter table public.pilot_profiles enable row level security;
revoke all on public.pilot_profiles from public, anon;
revoke all on public.pilot_profiles from authenticated;
grant select on public.pilot_profiles to authenticated;
grant select,insert,update on public.pilot_profiles to pilot_profile_writer;
grant select on storage.objects to pilot_profile_writer;
create policy pilot_self on public.pilot_profiles to authenticated,pilot_profile_writer
  using (account_id = (select auth.uid()))
  with check (account_id = (select auth.uid()));

-- Recibos inmutables: otro dispositivo puede cambiar el último op_id antes
-- de que el emisor recupere una confirmación perdida. No se exponen por API.
create table pilot_private.operations (
  account_id uuid not null references public.profiles(id) on delete cascade,
  op_id uuid not null,
  result jsonb not null,
  primary key (account_id,op_id)
);
alter table pilot_private.operations enable row level security;
revoke all on pilot_private.operations from public,anon,authenticated;
grant select,insert on pilot_private.operations to pilot_profile_writer;
create policy pilot_operation_self on pilot_private.operations to pilot_profile_writer
  using (account_id = (select auth.uid()))
  with check (account_id = (select auth.uid()));

-- RPC pública INVOKER; el escritor privado solo permite CAS y sigue sujeto a RLS.
create function public.pilot_profile_load() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('profile', profile, 'revision', revision, 'photo_hash', photo_hash)
  from public.pilot_profiles where account_id = auth.uid();
$$;
create function pilot_private.pilot_profile_save(p_profile jsonb, p_photo_hash text, p_expected_revision bigint, p_op_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb; v_account uuid := auth.uid();
begin
  if v_account is null then raise exception 'authentication required' using errcode='42501'; end if;
  if p_op_id is null then raise exception 'operation required' using errcode='22023'; end if;
  -- Serializa incluso la primera inserción. El duplicado espera a que el
  -- intento original confirme o revierta; SELECT fuera de aquí no decide CAS.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pilot-profile:'||v_account::text,0));
  select result into v_result from pilot_private.operations
    where account_id=v_account and op_id=p_op_id;
  if found then return v_result; end if;
  if p_expected_revision is null or p_expected_revision < 0
    or not public.pilot_profile_valid(p_profile,p_photo_hash)
    then raise exception 'invalid profile' using errcode='22023'; end if;
  if p_photo_hash is not null and not exists (
    select 1 from storage.objects where bucket_id='pilot-photos'
      and name=auth.uid()::text || '/' || p_photo_hash || '.jpg'
  ) then raise exception 'photo missing' using errcode='22023'; end if;
  if p_expected_revision = 0 then
    insert into public.pilot_profiles(account_id,profile,photo_hash,last_op_id)
      values(v_account,p_profile,p_photo_hash,p_op_id) on conflict(account_id) do nothing
      returning jsonb_build_object('profile',profile,'revision',revision,'photo_hash',photo_hash) into v_result;
  else
    update public.pilot_profiles set profile=p_profile,photo_hash=p_photo_hash,
      revision=revision+1,updated_at=now(),last_op_id=p_op_id
      where account_id=auth.uid() and revision=p_expected_revision
      returning jsonb_build_object('profile',profile,'revision',revision,'photo_hash',photo_hash) into v_result;
  end if;
  -- PostgREST traduce PT409 a HTTP 409; 40001 se traducía a HTTP 500.
  if v_result is null then raise exception 'revision conflict' using errcode='PT409'; end if;
  insert into pilot_private.operations(account_id,op_id,result) values(v_account,p_op_id,v_result);
  return v_result;
end;
$$;
grant create on schema pilot_private to pilot_profile_writer;
-- El administrador que prepara el paquete debe poder transferir ownership
-- también sin SUPERUSER. Nunca se concede este rol a authenticated/anon.
grant pilot_profile_writer to current_user;
alter function pilot_private.pilot_profile_save(jsonb,text,bigint,uuid) owner to pilot_profile_writer;
revoke create on schema pilot_private from pilot_profile_writer;
revoke all on function pilot_private.pilot_profile_save(jsonb,text,bigint,uuid) from public,anon;
grant execute on function pilot_private.pilot_profile_save(jsonb,text,bigint,uuid) to authenticated;
create function public.pilot_profile_save(p_profile jsonb,p_photo_hash text,p_expected_revision bigint,p_op_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select pilot_private.pilot_profile_save(p_profile,p_photo_hash,p_expected_revision,p_op_id);
$$;
revoke all on function public.pilot_profile_load() from public, anon;
revoke all on function public.pilot_profile_save(jsonb,text,bigint,uuid) from public, anon;
grant execute on function public.pilot_profile_load() to authenticated;
grant execute on function public.pilot_profile_save(jsonb,text,bigint,uuid) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('pilot-photos','pilot-photos',false,24576,array['image/jpeg']);
-- Solo objetos inmutables por hash, en el namespace UUID del puente nativo.
create policy pilot_photo_read on storage.objects for select to authenticated,pilot_profile_writer
  using (bucket_id='pilot-photos' and name ~ '^[0-9a-f-]{36}/[0-9a-f]{64}\.jpg$'
    and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy pilot_photo_insert on storage.objects for insert to authenticated
  with check (bucket_id='pilot-photos' and name ~ '^[0-9a-f-]{36}/[0-9a-f]{64}\.jpg$'
    and (storage.foldername(name))[1] = (select auth.uid())::text);
-- La limpieza futura necesita autoridad separada: DELETE + INSERT también
-- reemplazaría una foto cuyo nombre promete contenido inmutable.
create policy pilot_photo_delete on storage.objects as restrictive for delete to public
  using (bucket_id <> 'pilot-photos');
-- Defensa contra policies permisivas globales ya existentes en Storage.
create policy pilot_photo_private_guard on storage.objects as restrictive for all to public
  using (bucket_id <> 'pilot-photos' or (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id <> 'pilot-photos' or (storage.foldername(name))[1] = (select auth.uid())::text);
-- Ni reemplazar bytes/metadata ni mover un objeto al/del bucket inmutable,
-- incluso si existe una policy permisiva global de UPDATE.
create policy pilot_photo_immutable_guard on storage.objects as restrictive for update to public
  using (bucket_id <> 'pilot-photos')
  with check (bucket_id <> 'pilot-photos');
commit;
