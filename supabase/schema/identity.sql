-- Generated from disposable PostgreSQL; read-only. Do not edit.
-- Name: pilot_profile_save(jsonb, text, bigint, uuid); Type: FUNCTION; Schema: pilot_private; Owner: -
--

CREATE FUNCTION pilot_private.pilot_profile_save(p_profile jsonb, p_photo_hash text, p_expected_revision bigint, p_op_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_result jsonb; v_account uuid := private.current_account();
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
      and name=private.current_account()::text || '/' || p_photo_hash || '.jpg'
  ) then raise exception 'photo missing' using errcode='22023'; end if;
  if p_expected_revision = 0 then
    insert into public.pilot_profiles(account_id,profile,photo_hash,last_op_id)
      values(v_account,p_profile,p_photo_hash,p_op_id) on conflict(account_id) do nothing
      returning jsonb_build_object('profile',profile,'revision',revision,'photo_hash',photo_hash) into v_result;
  else
    update public.pilot_profiles set profile=p_profile,photo_hash=p_photo_hash,
      revision=revision+1,updated_at=now(),last_op_id=p_op_id
      where account_id=private.current_account() and revision=p_expected_revision
      returning jsonb_build_object('profile',profile,'revision',revision,'photo_hash',photo_hash) into v_result;
  end if;
  -- PostgREST traduce PT409 a HTTP 409; 40001 se traducía a HTTP 500.
  if v_result is null then raise exception 'revision conflict' using errcode='PT409'; end if;
  insert into pilot_private.operations(account_id,op_id,result) values(v_account,p_op_id,v_result);
  return v_result;
end;
$$;


--

-- Name: clerk_bootstrap_account(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.clerk_bootstrap_account() RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare claims jsonb := auth.jwt(); account uuid;
begin
  if coalesce(claims->>'role', '') <> 'authenticated' or coalesce(claims->>'sid', '') !~ '^sess_[a-zA-Z0-9_]+$'
    or not exists (select 1 from private.clerk_issuers c
      where c.issuer = claims->>'iss' and c.enabled and claims->>'azp' = any(c.authorized_parties)) then
    raise sqlstate '28000' using message = 'invalid_clerk_session';
  end if;
  account := private.resolve_account_identity(claims->>'iss', claims->>'sub');
  return account;
end $_$;


--

-- Name: clerk_deletion_completed(text, text, text, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.clerk_deletion_completed(p_issuer text, p_subject text, p_bucket text, p_names text[]) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
 delete from private.clerk_deleted_objects o where o.issuer=p_issuer and o.subject=p_subject
   and o.bucket_id=p_bucket and o.name=any(p_names)
   and exists(select 1 from public.account_identities i where i.issuer=o.issuer and i.subject=o.subject and i.deleted_at is not null)
$$;


--

-- Name: clerk_deletion_objects(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.clerk_deletion_objects(p_issuer text, p_subject text) RETURNS TABLE(bucket_id text, name text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
 select o.bucket_id,o.name from private.clerk_deleted_objects o
 join public.account_identities i using(issuer,subject)
 where o.issuer=p_issuer and o.subject=p_subject and i.deleted_at is not null
 order by o.bucket_id,o.name limit 1000
$$;


--

-- Name: clerk_deletion_upload_completed(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.clerk_deletion_upload_completed(p_issuer text, p_subject text, p_upload_id text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
 delete from private.clerk_deleted_uploads u where u.issuer=p_issuer and u.subject=p_subject
 and u.upload_id=p_upload_id and exists(select 1 from public.account_identities i
   where i.issuer=u.issuer and i.subject=u.subject and i.deleted_at is not null)
$$;


--

-- Name: clerk_deletion_uploads(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.clerk_deletion_uploads(p_issuer text, p_subject text) RETURNS TABLE(bucket_id text, name text, upload_id text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
 select u.bucket_id,u.name,u.upload_id from private.clerk_deleted_uploads u
 join public.account_identities i using(issuer,subject)
 where u.issuer=p_issuer and u.subject=p_subject and i.deleted_at is not null
 order by u.upload_id limit 1000
$$;


--

-- Name: pilot_profile_load(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pilot_profile_load() RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  select jsonb_build_object('profile', profile, 'revision', revision, 'photo_hash', photo_hash)
  from public.pilot_profiles where account_id = private.current_account();
$$;


--

-- Name: pilot_profile_save(jsonb, text, bigint, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pilot_profile_save(p_profile jsonb, p_photo_hash text, p_expected_revision bigint, p_op_id uuid) RETURNS jsonb
    LANGUAGE sql
    SET search_path TO ''
    AS $$
  select pilot_private.pilot_profile_save(p_profile,p_photo_hash,p_expected_revision,p_op_id);
$$;


--

-- Name: pilot_profile_valid(jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pilot_profile_valid(document jsonb, photo_hash text) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $_$
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
$_$;


--

-- Name: clerk_deleted_objects; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.clerk_deleted_objects (
    issuer text NOT NULL,
    subject text NOT NULL,
    bucket_id text NOT NULL,
    name text NOT NULL
);


--

-- Name: clerk_deleted_uploads; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.clerk_deleted_uploads (
    issuer text NOT NULL,
    subject text NOT NULL,
    bucket_id text NOT NULL,
    name text NOT NULL,
    upload_id text NOT NULL
);


--

-- Name: clerk_issuers; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.clerk_issuers (
    issuer text NOT NULL,
    authorized_parties text[] NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    native_data_issuer text,
    CONSTRAINT clerk_issuers_authorized_parties_check CHECK ((cardinality(authorized_parties) > 0)),
    CONSTRAINT clerk_issuers_issuer_check CHECK ((issuer ~ '^https://[a-zA-Z0-9.-]+$'::text)),
    CONSTRAINT clerk_issuers_native_data_issuer_check CHECK (((native_data_issuer ~ '^https://[a-zA-Z0-9.:-]+/native-data/v1$'::text) OR (native_data_issuer ~ '^http://127\.0\.0\.1(:[0-9]+)?/native-data/v1$'::text)))
);


--

-- Name: clerk_user_events; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.clerk_user_events (
    event_id text NOT NULL,
    payload_hash text NOT NULL,
    event_type text NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT clerk_user_events_event_id_check CHECK (((length(event_id) >= 1) AND (length(event_id) <= 200))),
    CONSTRAINT clerk_user_events_event_type_check CHECK ((event_type = ANY (ARRAY['user.created'::text, 'user.updated'::text, 'user.deleted'::text]))),
    CONSTRAINT clerk_user_events_payload_hash_check CHECK ((payload_hash ~ '^[0-9a-f]{64}$'::text))
);


--

-- Name: account_identities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_identities (
    issuer text NOT NULL,
    subject text NOT NULL,
    account_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    user_event_at timestamp with time zone,
    CONSTRAINT account_identities_issuer_check CHECK (((length(issuer) >= 1) AND (length(issuer) <= 512))),
    CONSTRAINT account_identities_subject_check CHECK (((length(subject) >= 1) AND (length(subject) <= 255)))
);


--

-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    display_name text,
    avatar_url text,
    preferred_sim text DEFAULT 'iracing'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    email text,
    language text DEFAULT 'es'::text,
    primary_simulator text,
    onboarding_completed boolean DEFAULT false
);


--

-- Name: clerk_deleted_objects clerk_deleted_objects_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.clerk_deleted_objects
    ADD CONSTRAINT clerk_deleted_objects_pkey PRIMARY KEY (issuer, subject, bucket_id, name);


--

-- Name: clerk_deleted_uploads clerk_deleted_uploads_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.clerk_deleted_uploads
    ADD CONSTRAINT clerk_deleted_uploads_pkey PRIMARY KEY (issuer, subject, upload_id);


--

-- Name: clerk_issuers clerk_issuers_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.clerk_issuers
    ADD CONSTRAINT clerk_issuers_pkey PRIMARY KEY (issuer);


--

-- Name: clerk_user_events clerk_user_events_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.clerk_user_events
    ADD CONSTRAINT clerk_user_events_pkey PRIMARY KEY (event_id);


--

-- Name: account_identities account_identities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_identities
    ADD CONSTRAINT account_identities_pkey PRIMARY KEY (issuer, subject);


--

-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--

-- Name: account_identities_by_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_identities_by_account ON public.account_identities USING btree (account_id);


--

-- Name: account_identities_by_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_identities_by_subject ON public.account_identities USING btree (subject);


--

-- Name: idx_profiles_preferred_sim; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_preferred_sim ON public.profiles USING btree (preferred_sim);


--

-- Name: clerk_deleted_objects a_account_write_barrier; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON private.clerk_deleted_objects FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.account_identities p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''account_id'')::uuid) a(account) where p2.issuer=($1->>''issuer'')::text and p2.subject=($1->>''subject'')::text) owners(account)', 'select ($1->>''issuer'' is not null and $1->>''subject'' is not null and not exists(select 1 from public.account_identities p where p.issuer=($1->>''issuer'')::text and p.subject=($1->>''subject'')::text))');


--

-- Name: clerk_deleted_uploads a_account_write_barrier; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON private.clerk_deleted_uploads FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(account_id) from public.account_identities
   where issuer=$1->>''issuer'' and subject=$1->>''subject''', 'select false');


--

-- Name: account_identities a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.account_identities FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''account_id'')::uuid) owners(account)', 'select ($1->>''account_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''account_id'')::uuid))');


--

-- Name: profiles a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select ($1->>''id'')::uuid as account) owners(account)', 'select false');


--

-- Name: account_identities mail_forget_deleted_account; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mail_forget_deleted_account AFTER UPDATE OF deleted_at ON public.account_identities FOR EACH ROW WHEN ((new.deleted_at IS NOT NULL)) EXECUTE FUNCTION private.mail_forget_deleted_account();


--

-- Name: profiles profiles_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--

-- Name: account_identities testing_report_purge_admitted_on_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER testing_report_purge_admitted_on_delete AFTER UPDATE OF deleted_at ON public.account_identities FOR EACH ROW WHEN (((old.deleted_at IS NULL) AND (new.deleted_at IS NOT NULL))) EXECUTE FUNCTION private.testing_report_purge_admitted_on_delete();


--

-- Name: account_identities web_purchase_erasure_tombstone; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER web_purchase_erasure_tombstone AFTER INSERT OR UPDATE OF deleted_at ON public.account_identities FOR EACH ROW WHEN ((new.deleted_at IS NOT NULL)) EXECUTE FUNCTION private.record_web_purchase_erasure();


--

-- Name: clerk_deleted_objects clerk_deleted_objects_issuer_subject_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.clerk_deleted_objects
    ADD CONSTRAINT clerk_deleted_objects_issuer_subject_fkey FOREIGN KEY (issuer, subject) REFERENCES public.account_identities(issuer, subject) ON DELETE RESTRICT;


--

-- Name: clerk_deleted_uploads clerk_deleted_uploads_issuer_subject_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.clerk_deleted_uploads
    ADD CONSTRAINT clerk_deleted_uploads_issuer_subject_fkey FOREIGN KEY (issuer, subject) REFERENCES public.account_identities(issuer, subject) ON DELETE RESTRICT;


--

-- Name: account_identities account_identities_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_identities
    ADD CONSTRAINT account_identities_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--

-- Name: account_identities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.account_identities ENABLE ROW LEVEL SECURITY;

--

-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--

-- Name: profiles profiles_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select_own ON public.profiles FOR SELECT USING ((private.current_account() = id));


--

-- Name: profiles profiles_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE USING ((private.current_account() = id)) WITH CHECK ((private.current_account() = id));


--

-- Name: FUNCTION pilot_profile_save(p_profile jsonb, p_photo_hash text, p_expected_revision bigint, p_op_id uuid); Type: ACL; Schema: pilot_private; Owner: -
--

REVOKE ALL ON FUNCTION pilot_private.pilot_profile_save(p_profile jsonb, p_photo_hash text, p_expected_revision bigint, p_op_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION pilot_private.pilot_profile_save(p_profile jsonb, p_photo_hash text, p_expected_revision bigint, p_op_id uuid) TO authenticated;


--

-- Name: FUNCTION clerk_bootstrap_account(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.clerk_bootstrap_account() FROM PUBLIC;
GRANT ALL ON FUNCTION public.clerk_bootstrap_account() TO authenticated;


--

-- Name: FUNCTION clerk_deletion_completed(p_issuer text, p_subject text, p_bucket text, p_names text[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.clerk_deletion_completed(p_issuer text, p_subject text, p_bucket text, p_names text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.clerk_deletion_completed(p_issuer text, p_subject text, p_bucket text, p_names text[]) TO service_role;


--

-- Name: FUNCTION clerk_deletion_objects(p_issuer text, p_subject text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.clerk_deletion_objects(p_issuer text, p_subject text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.clerk_deletion_objects(p_issuer text, p_subject text) TO service_role;


--

-- Name: FUNCTION clerk_deletion_upload_completed(p_issuer text, p_subject text, p_upload_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.clerk_deletion_upload_completed(p_issuer text, p_subject text, p_upload_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.clerk_deletion_upload_completed(p_issuer text, p_subject text, p_upload_id text) TO service_role;


--

-- Name: FUNCTION clerk_deletion_uploads(p_issuer text, p_subject text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.clerk_deletion_uploads(p_issuer text, p_subject text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.clerk_deletion_uploads(p_issuer text, p_subject text) TO service_role;


--

-- Name: FUNCTION pilot_profile_load(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pilot_profile_load() FROM PUBLIC;
GRANT ALL ON FUNCTION public.pilot_profile_load() TO authenticated;


--

-- Name: FUNCTION pilot_profile_save(p_profile jsonb, p_photo_hash text, p_expected_revision bigint, p_op_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pilot_profile_save(p_profile jsonb, p_photo_hash text, p_expected_revision bigint, p_op_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.pilot_profile_save(p_profile jsonb, p_photo_hash text, p_expected_revision bigint, p_op_id uuid) TO authenticated;


--

-- Name: FUNCTION pilot_profile_valid(document jsonb, photo_hash text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pilot_profile_valid(document jsonb, photo_hash text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.pilot_profile_valid(document jsonb, photo_hash text) TO authenticated;
GRANT ALL ON FUNCTION public.pilot_profile_valid(document jsonb, photo_hash text) TO pilot_profile_writer;


--

-- Name: TABLE clerk_issuers; Type: ACL; Schema: private; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE private.clerk_issuers TO service_role;


--

-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO service_role;
GRANT SELECT ON TABLE public.profiles TO authenticated;


--
