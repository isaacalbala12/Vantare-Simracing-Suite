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
    or (p_document->>'schemaVersion' = '1' and length(p_document::text) > 40000)
    or (p_document->>'schemaVersion' = '2' and octet_length(p_document::text) > 40000) then
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

-- The old RPC remains strict v1 for installed clients; v2 is a new read endpoint.
create function public.visual_roadmap_current_v2()
returns table(id uuid, document jsonb, published_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id,r.document,r.published_at from public.visual_roadmap r
  where r.status='published' limit 1;
$$;
create or replace function public.visual_roadmap_current()
returns table(id uuid, document jsonb, published_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, case when r.document->>'schemaVersion'='1' then r.document else
    jsonb_build_object('schemaVersion',1,'items',coalesce((
      select jsonb_agg(jsonb_build_object('id',i->'id','section',
        case when i->>'section'='later' then 'next' else i->>'section' end,
        'title',i->'title','body',i->'body') order by ordinal)
      from jsonb_array_elements(r.document->'items') with ordinality x(i,ordinal)
    ),'[]'::jsonb)) end,r.published_at
  from public.visual_roadmap r where r.status='published' limit 1;
$$;
revoke all on function public.visual_roadmap_current_v2() from public,anon,authenticated,service_role;
grant execute on function public.visual_roadmap_current_v2() to anon,authenticated;

-- No password in migrations. Reuse the cluster role but reassert attributes.
do $$ begin
  create role vantare_roadmap_publisher;
exception when duplicate_object then null;
end $$;
alter role vantare_roadmap_publisher login noinherit nosuperuser nocreatedb
  nocreaterole noreplication nobypassrls connection limit 2;
grant usage on schema public to vantare_roadmap_publisher;
-- Explicit reviewed closures, not a global revoke of PUBLIC.
revoke execute on function public.race_schedule_my_draft() from public;
grant execute on function public.race_schedule_my_draft() to authenticated;
revoke execute on function public.is_active_owner(uuid) from public;
grant execute on function public.is_active_owner(uuid) to authenticated;
-- Existing triggers do not require direct caller EXECUTE; no API uses this RPC.
revoke execute on function public.handle_new_user() from public;

-- An administrator can approve one exact destructive replacement, for <=1 hour.
-- CI cannot read, create, extend or consume these approvals except via sync.
create table public.visual_roadmap_sync_approvals (
  document jsonb not null check(public.visual_roadmap_valid(document)),
  expires_at timestamptz not null check(expires_at <= clock_timestamp()+interval '1 hour')
);
alter table public.visual_roadmap_sync_approvals enable row level security;
alter table public.visual_roadmap_sync_approvals force row level security;
revoke all on public.visual_roadmap_sync_approvals from public,anon,authenticated,service_role,vantare_roadmap_publisher;
create function public.visual_roadmap_sync(p_document jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_old jsonb; v_removed integer; v_approved integer;
begin
  if not public.visual_roadmap_valid(p_document) or p_document->>'schemaVersion' <> '2'
    or jsonb_array_length(p_document->'items')=0 then
    raise exception 'invalid_clickup_roadmap' using errcode = '22023';
  end if;
  lock table public.visual_roadmap in exclusive mode;
  select id,document into v_id,v_old from public.visual_roadmap_current_v2();
  if v_old=p_document then return v_id; end if;
  select count(*) into v_removed from jsonb_array_elements(v_old->'items') old
    where not exists(select 1 from jsonb_array_elements(p_document->'items') new
      where new->>'id'=old->>'id');
  if v_removed>0 and v_removed*2 >= jsonb_array_length(v_old->'items') then
    -- Wall clock here is evaluated after the publication lock, not at BEGIN.
    with approved as (delete from public.visual_roadmap_sync_approvals
      where document=p_document and expires_at>clock_timestamp() returning 1)
      select count(*) into v_approved from approved;
    if v_approved=0 then
      raise exception 'roadmap_mass_removal_requires_approval' using errcode='42501';
    end if;
  end if;
  return public.visual_roadmap_publish(p_document);
end $$;
revoke all on function public.visual_roadmap_sync(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.visual_roadmap_sync(jsonb) to vantare_roadmap_publisher;

-- Fail closed for unreviewed SECURITY DEFINERs, including externally-created ones.
-- race_schedule_current is deliberately public published data. digest shims are
-- pure hashes (normally INVOKER), permitted if an installation marks them DEFINER.
do $$
declare unexpected text;
begin
  select string_agg(p.oid::regprocedure::text,', ' order by p.oid::regprocedure::text)
  into unexpected from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname not in ('pg_catalog','information_schema') and p.prosecdef
    and has_function_privilege('vantare_roadmap_publisher',p.oid,'EXECUTE')
    and has_schema_privilege('vantare_roadmap_publisher',n.oid,'USAGE')
    and p.oid::regprocedure::text not in ('visual_roadmap_sync(jsonb)',
      'race_schedule_current()','digest(text,text)','digest(bytea,text)');
  if unexpected is not null then raise exception 'unreviewed_ci_definers: %',unexpected; end if;
  if has_schema_privilege('vantare_roadmap_publisher','public','CREATE')
    or exists(select 1 from pg_auth_members m join pg_roles r on r.oid=m.member
      where r.rolname='vantare_roadmap_publisher') then
    raise exception 'unsafe_ci_role_schema_or_membership';
  end if;
end $$;
commit;
