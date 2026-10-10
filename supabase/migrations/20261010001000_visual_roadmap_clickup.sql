-- #1535: existing Supabase storage, v1/v2 readers, dedicated CI writer. NOT applied.
begin;
create or replace function public.visual_roadmap_valid(p_document jsonb)
returns boolean
language plpgsql immutable
set search_path = ''
as $$
declare
  item jsonb;
  locale text;
begin
  if jsonb_typeof(p_document) is distinct from 'object'
    or coalesce(p_document->>'schemaVersion','') not in ('1','2')
    or jsonb_typeof(p_document->'items') is distinct from 'array'
    or octet_length(p_document::text) > 40000 then
    return false;
  end if;
  if jsonb_array_length(p_document->'items') > 40 then
    return false;
  end if;
  -- v2 is also the native deny_unknown_fields contract. Reject metadata that
  -- could otherwise persist publicly while the strict readers reject it.
  if p_document->>'schemaVersion' = '2' and (
    p_document->'schemaVersion' <> '2'::jsonb
    or exists(select 1 from jsonb_object_keys(p_document) k
      where k not in ('schemaVersion', 'items'))) then
    return false;
  end if;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_document->'items'))
    <> jsonb_array_length(p_document->'items') then
    return false;
  end if;
  for item in select value from jsonb_array_elements(p_document->'items') loop
    if jsonb_typeof(item) is distinct from 'object'
      or coalesce(item->>'id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or item->>'section' is null
      or item->>'section' not in ('now', 'next', 'later', 'done')
      or jsonb_typeof(item->'title') is distinct from 'object'
      or jsonb_typeof(item->'body') is distinct from 'object' then
      return false;
    end if;
    if p_document->>'schemaVersion' = '2' then
      if exists(select 1 from jsonb_object_keys(item) k
          where k not in ('id','section','title','body','area','version','dueDate'))
        or exists(select 1 from jsonb_object_keys(item->'title') k
          where k not in ('es','en','pt','it'))
        or exists(select 1 from jsonb_object_keys(item->'body') k
          where k not in ('es','en','pt','it'))
        or jsonb_typeof(item->'area') is distinct from 'string'
        or length(trim(item->>'area')) not between 1 and 60
        or (item->>'version' is not null and
          (length(item->>'version') > 60 or item->>'version' !~ '^v?[0-9]+\.[0-9]+\.[0-9]+(-[a-z0-9.-]+)?$'))
        or (item->>'dueDate' is not null and item->>'dueDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then
        return false;
      end if;
      if item->>'dueDate' is not null then
        begin
          perform (item->>'dueDate')::date;
        exception when datetime_field_overflow or invalid_datetime_format then return false;
        end;
      end if;
    end if;
    foreach locale in array array['es', 'en', 'pt', 'it'] loop
      if jsonb_typeof(item->'title'->locale) is distinct from 'string'
        or length(item->'title'->>locale) > 120
        or (locale = 'es' and length(trim(item->'title'->>locale)) = 0)
        or jsonb_typeof(item->'body'->locale) is distinct from 'string'
        or length(item->'body'->>locale) > 600 then
        return false;
      end if;
    end loop;
  end loop;
  return true;
end;
$$;

-- No password in migrations. Isaac sets it using a protected administrative
-- prompt only after review. No grants to anon/authenticated/service_role.
create role vantare_roadmap_publisher login noinherit nosuperuser nocreatedb
  nocreaterole noreplication nobypassrls connection limit 2;
grant usage on schema public to vantare_roadmap_publisher;
create function public.visual_roadmap_sync(p_document jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.visual_roadmap_valid(p_document) or p_document->>'schemaVersion' <> '2' then
    raise exception 'invalid_clickup_roadmap' using errcode = '22023';
  end if;
  lock table public.visual_roadmap in exclusive mode;
  select id into v_id from public.visual_roadmap_current() where document = p_document;
  if v_id is null then v_id := public.visual_roadmap_publish(p_document); end if;
  return v_id;
end $$;
revoke all on function public.visual_roadmap_sync(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.visual_roadmap_sync(jsonb) to vantare_roadmap_publisher;
-- Existing read/publish/validator grants remain unchanged.
commit;
