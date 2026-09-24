-- The owner edits a private draft in the app and explicitly publishes it.
-- A published document is readable by every client; direct table access is
-- denied so the RPCs remain the only authority boundary.
create table public.visual_roadmap (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('draft', 'published', 'superseded')),
  document jsonb not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  published_at timestamptz
);

create unique index visual_roadmap_one_published
  on public.visual_roadmap ((true)) where status = 'published';
create unique index visual_roadmap_one_draft_per_owner
  on public.visual_roadmap (created_by) where status = 'draft';
alter table public.visual_roadmap enable row level security;

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

create function public.visual_roadmap_draft_save(p_document jsonb)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
begin
  if v_actor is null or not public.is_active_owner(v_actor) then
    raise exception 'owner role required to edit roadmap';
  end if;
  if not public.visual_roadmap_valid(p_document) then
    raise exception 'invalid roadmap document';
  end if;
  delete from public.visual_roadmap where created_by = v_actor and status = 'draft';
  insert into public.visual_roadmap(status, document, created_by)
    values ('draft', p_document, v_actor) returning id into v_id;
  return v_id;
end;
$$;

create function public.visual_roadmap_publish(p_draft_id uuid)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not public.is_active_owner(v_actor) then
    raise exception 'owner role required to publish roadmap';
  end if;
  if not exists (
    select 1 from public.visual_roadmap
    where id = p_draft_id and status = 'draft' and created_by = v_actor
  ) then
    raise exception 'draft not found';
  end if;
  update public.visual_roadmap set status = 'superseded' where status = 'published';
  update public.visual_roadmap
    set status = 'published', published_at = now()
    where id = p_draft_id;
  return p_draft_id;
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

create function public.visual_roadmap_my_draft()
returns table(id uuid, document jsonb)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select r.id, r.document from public.visual_roadmap r
  where r.status = 'draft' and r.created_by = auth.uid()
    and public.is_active_owner(auth.uid()) limit 1;
$$;

revoke all on public.visual_roadmap from anon, authenticated;
revoke all on function public.visual_roadmap_valid(jsonb) from public;
revoke all on function public.visual_roadmap_draft_save(jsonb) from public;
revoke all on function public.visual_roadmap_publish(uuid) from public;
revoke all on function public.visual_roadmap_current() from public;
revoke all on function public.visual_roadmap_my_draft() from public;
grant execute on function public.visual_roadmap_draft_save(jsonb) to authenticated;
grant execute on function public.visual_roadmap_publish(uuid) to authenticated;
grant execute on function public.visual_roadmap_my_draft() to authenticated;
grant execute on function public.visual_roadmap_current() to anon, authenticated;
