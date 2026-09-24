-- Codex publishes the roadmap through the privileged SQL connection when
-- Isaac requests a change. App clients can only read the current version.
create function public.visual_roadmap_valid(p_document jsonb)
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

create table public.visual_roadmap (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('published', 'superseded')),
  document jsonb not null check (public.visual_roadmap_valid(document)),
  published_at timestamptz not null default now()
);
create unique index visual_roadmap_one_published
  on public.visual_roadmap ((true)) where status = 'published';
alter table public.visual_roadmap enable row level security;

create function public.visual_roadmap_publish(p_document jsonb)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if not public.visual_roadmap_valid(p_document) then
    raise exception 'invalid roadmap document';
  end if;
  lock table public.visual_roadmap in exclusive mode;
  update public.visual_roadmap set status = 'superseded' where status = 'published';
  insert into public.visual_roadmap(status, document)
    values ('published', p_document) returning id into v_id;
  return v_id;
end;
$$;

create function public.visual_roadmap_current()
returns table(id uuid, document jsonb, published_at timestamptz)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select r.id, r.document, r.published_at
  from public.visual_roadmap r where r.status = 'published' limit 1;
$$;

revoke all on public.visual_roadmap from anon, authenticated;
revoke all on function public.visual_roadmap_valid(jsonb) from public;
revoke all on function public.visual_roadmap_publish(jsonb) from public;
revoke all on function public.visual_roadmap_current() from public;
grant execute on function public.visual_roadmap_current() to anon, authenticated;
