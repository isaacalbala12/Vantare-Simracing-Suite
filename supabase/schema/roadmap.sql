-- Generated from disposable PostgreSQL; read-only. Do not edit.
-- Name: visual_roadmap_current(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.visual_roadmap_current() RETURNS TABLE(id uuid, document jsonb, published_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select r.id, case when r.document->>'schemaVersion'='1' then r.document else
    jsonb_build_object('schemaVersion',1,'items',coalesce((
      select jsonb_agg(jsonb_build_object('id',i->'id','section',
        case when i->>'section'='later' then 'next' else i->>'section' end,
        'title',i->'title','body',i->'body') order by ordinal)
      from jsonb_array_elements(r.document->'items') with ordinality x(i,ordinal)
    ),'[]'::jsonb)) end,r.published_at
  from public.visual_roadmap r where r.status='published' limit 1;
$$;


--

-- Name: visual_roadmap_current_v2(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.visual_roadmap_current_v2() RETURNS TABLE(id uuid, document jsonb, published_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select r.id,r.document,r.published_at from public.visual_roadmap r
  where r.status='published' limit 1;
$$;


--

-- Name: visual_roadmap_publish(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.visual_roadmap_publish(p_document jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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


--

-- Name: visual_roadmap_sync(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.visual_roadmap_sync(p_document jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--

-- Name: visual_roadmap_valid(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.visual_roadmap_valid(p_document jsonb) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $_$
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
    or p_document->>'schemaVersion' <> '2'
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
        or length(btrim(item->>'area', E' \t\n\r\f\v')) not between 1 and 60
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
        or (locale = 'es' and length(btrim(item->'title'->>locale, E' \t\n\r\f\v')) = 0)
        or jsonb_typeof(item->'body'->locale) is distinct from 'string'
        or length(item->'body'->>locale) > 600 then
        return false;
      end if;
    end loop;
  end loop;
  return true;
end;
$_$;


--

-- Name: visual_roadmap; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visual_roadmap (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    status text NOT NULL,
    document jsonb NOT NULL,
    published_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT visual_roadmap_document_check CHECK (public.visual_roadmap_valid(document)),
    CONSTRAINT visual_roadmap_status_check CHECK ((status = ANY (ARRAY['published'::text, 'superseded'::text])))
);


--

-- Name: visual_roadmap_sync_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visual_roadmap_sync_approvals (
    document jsonb NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT visual_roadmap_sync_approvals_document_check CHECK (public.visual_roadmap_valid(document)),
    CONSTRAINT visual_roadmap_sync_approvals_expires_at_check CHECK ((expires_at <= (clock_timestamp() + '01:00:00'::interval)))
);

ALTER TABLE ONLY public.visual_roadmap_sync_approvals FORCE ROW LEVEL SECURITY;


--

-- Name: visual_roadmap visual_roadmap_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visual_roadmap
    ADD CONSTRAINT visual_roadmap_pkey PRIMARY KEY (id);


--

-- Name: visual_roadmap_one_published; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX visual_roadmap_one_published ON public.visual_roadmap USING btree ((true)) WHERE (status = 'published'::text);


--

-- Name: visual_roadmap; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.visual_roadmap ENABLE ROW LEVEL SECURITY;

--

-- Name: visual_roadmap_sync_approvals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.visual_roadmap_sync_approvals ENABLE ROW LEVEL SECURITY;

--

-- Name: FUNCTION visual_roadmap_current(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.visual_roadmap_current() FROM PUBLIC;
GRANT ALL ON FUNCTION public.visual_roadmap_current() TO anon;
GRANT ALL ON FUNCTION public.visual_roadmap_current() TO authenticated;


--

-- Name: FUNCTION visual_roadmap_current_v2(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.visual_roadmap_current_v2() FROM PUBLIC;
GRANT ALL ON FUNCTION public.visual_roadmap_current_v2() TO anon;
GRANT ALL ON FUNCTION public.visual_roadmap_current_v2() TO authenticated;


--

-- Name: FUNCTION visual_roadmap_publish(p_document jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.visual_roadmap_publish(p_document jsonb) FROM PUBLIC;


--

-- Name: FUNCTION visual_roadmap_sync(p_document jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.visual_roadmap_sync(p_document jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.visual_roadmap_sync(p_document jsonb) TO vantare_roadmap_publisher;


--

-- Name: FUNCTION visual_roadmap_valid(p_document jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.visual_roadmap_valid(p_document jsonb) FROM PUBLIC;


--
