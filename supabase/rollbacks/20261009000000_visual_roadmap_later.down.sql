-- First supersede publications containing later, or restore the previous document.
create or replace function public.visual_roadmap_valid(p_document jsonb)
returns boolean
language plpgsql immutable
set search_path = public, pg_temp
as $$
declare
  item jsonb;
  locale text;
begin
  if jsonb_typeof(p_document) is distinct from 'object'
    or p_document->>'schemaVersion' is distinct from '1'
    or jsonb_typeof(p_document->'items') is distinct from 'array'
    or length(p_document::text) > 40000 then
    return false;
  end if;
  if jsonb_array_length(p_document->'items') > 40 then
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
      or item->>'section' not in ('now', 'next', 'done')
      or jsonb_typeof(item->'title') is distinct from 'object'
      or jsonb_typeof(item->'body') is distinct from 'object' then
      return false;
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
