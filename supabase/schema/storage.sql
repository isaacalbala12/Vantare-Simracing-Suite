-- Generated from disposable PostgreSQL; read-only. Do not edit.
-- Name: foldername(text); Type: FUNCTION; Schema: storage; Owner: -
--

CREATE FUNCTION storage.foldername(text) RETURNS text[]
    LANGUAGE sql IMMUTABLE
    AS $_$
   select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]
  $_$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--

-- Name: buckets; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets (
    id text NOT NULL,
    name text NOT NULL,
    owner uuid,
    owner_id text,
    public boolean DEFAULT false NOT NULL,
    file_size_limit bigint,
    allowed_mime_types text[]
);


--

-- Name: objects; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bucket_id text NOT NULL,
    name text NOT NULL,
    owner uuid,
    owner_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    version text
);


--

-- Name: s3_multipart_uploads; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.s3_multipart_uploads (
    id text NOT NULL,
    in_progress_size bigint DEFAULT 0 NOT NULL,
    upload_signature text NOT NULL,
    bucket_id text NOT NULL,
    key text NOT NULL COLLATE pg_catalog."C",
    version text NOT NULL,
    owner_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_metadata jsonb,
    metadata jsonb
);


--

-- Name: s3_multipart_uploads_parts; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.s3_multipart_uploads_parts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    upload_id text NOT NULL,
    size bigint DEFAULT 0 NOT NULL,
    part_number integer NOT NULL,
    bucket_id text NOT NULL,
    key text NOT NULL COLLATE pg_catalog."C",
    etag text NOT NULL,
    owner_id text,
    version text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

-- Name: buckets buckets_name_key; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets
    ADD CONSTRAINT buckets_name_key UNIQUE (name);


--

-- Name: buckets buckets_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets
    ADD CONSTRAINT buckets_pkey PRIMARY KEY (id);


--

-- Name: objects objects_bucket_id_name_key; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT objects_bucket_id_name_key UNIQUE (bucket_id, name);


--

-- Name: objects objects_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT objects_pkey PRIMARY KEY (id);


--

-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_pkey PRIMARY KEY (id);


--

-- Name: s3_multipart_uploads s3_multipart_uploads_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads
    ADD CONSTRAINT s3_multipart_uploads_pkey PRIMARY KEY (id);


--

-- Name: objects a0_deletion_abort_probe; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER a0_deletion_abort_probe BEFORE INSERT OR UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION private.storage_abort_probe();


--

-- Name: buckets a_account_write_barrier; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON storage.buckets FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) from private.storage_owner_accounts($1) account', 'select false');


--

-- Name: objects a_account_write_barrier; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) from (
      select private.storage_owner_accounts($1) account
      union select private.storage_owner_accounts(to_jsonb(b)) from storage.buckets b
        where b.id=$1->>''bucket_id'') owners', 'select not exists(select 1 from storage.buckets b where b.id=$1->>''bucket_id'')');


--

-- Name: s3_multipart_uploads a_account_write_barrier; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON storage.s3_multipart_uploads FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) from (
      select private.storage_owner_accounts($1) account
      union select private.storage_owner_accounts(to_jsonb(b)) from storage.buckets b
        where b.id=$1->>''bucket_id'') owners', 'select not exists(select 1 from storage.buckets b where b.id=$1->>''bucket_id'')');


--

-- Name: s3_multipart_uploads_parts a_account_write_barrier; Type: TRIGGER; Schema: storage; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON storage.s3_multipart_uploads_parts FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) from (
   select private.storage_owner_accounts($1) account
   union select private.storage_owner_accounts(to_jsonb(u)) from storage.s3_multipart_uploads u where u.id=$1->>''upload_id''
   union select private.storage_owner_accounts(to_jsonb(b)) from storage.buckets b where b.id=$1->>''bucket_id'') owners', 'select not exists(select 1 from storage.s3_multipart_uploads u where u.id=$1->>''upload_id'')
   or not exists(select 1 from storage.buckets b where b.id=$1->>''bucket_id'')');


--

-- Name: objects objects_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT objects_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--

-- Name: s3_multipart_uploads s3_multipart_uploads_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads
    ADD CONSTRAINT s3_multipart_uploads_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--

-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--

-- Name: s3_multipart_uploads_parts s3_multipart_uploads_parts_upload_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.s3_multipart_uploads_parts
    ADD CONSTRAINT s3_multipart_uploads_parts_upload_id_fkey FOREIGN KEY (upload_id) REFERENCES storage.s3_multipart_uploads(id) ON DELETE CASCADE;


--

-- Name: objects; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

--

-- Name: objects pilot_photo_delete; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY pilot_photo_delete ON storage.objects AS RESTRICTIVE FOR DELETE USING ((bucket_id <> 'pilot-photos'::text));


--

-- Name: objects pilot_photo_immutable_guard; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY pilot_photo_immutable_guard ON storage.objects AS RESTRICTIVE FOR UPDATE USING ((bucket_id <> 'pilot-photos'::text)) WITH CHECK ((bucket_id <> 'pilot-photos'::text));


--

-- Name: objects pilot_photo_insert; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY pilot_photo_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'pilot-photos'::text) AND (name ~ '^[0-9a-f-]{36}/[0-9a-f]{64}\.jpg$'::text) AND ((storage.foldername(name))[1] = (( SELECT private.current_account() AS uid))::text)));


--

-- Name: objects pilot_photo_private_guard; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY pilot_photo_private_guard ON storage.objects AS RESTRICTIVE USING (((bucket_id <> 'pilot-photos'::text) OR ((storage.foldername(name))[1] = (( SELECT private.current_account() AS uid))::text))) WITH CHECK (((bucket_id <> 'pilot-photos'::text) OR ((storage.foldername(name))[1] = (( SELECT private.current_account() AS uid))::text)));


--

-- Name: objects pilot_photo_read; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY pilot_photo_read ON storage.objects FOR SELECT TO authenticated, pilot_profile_writer USING (((bucket_id = 'pilot-photos'::text) AND (name ~ '^[0-9a-f-]{36}/[0-9a-f]{64}\.jpg$'::text) AND ((storage.foldername(name))[1] = (( SELECT private.current_account() AS uid))::text)));


--

-- Name: TABLE buckets; Type: ACL; Schema: storage; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE storage.buckets TO service_role;


--

-- Name: TABLE objects; Type: ACL; Schema: storage; Owner: -
--

GRANT INSERT ON TABLE storage.objects TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE storage.objects TO service_role;
GRANT SELECT ON TABLE storage.objects TO pilot_profile_writer;


--

-- Catalog: storage.buckets (2 rows)
-- {"allowed_mime_types": ["image/jpeg"], "file_size_limit": 24576, "id": "pilot-photos", "name": "pilot-photos", "public": false}
-- {"allowed_mime_types": ["image/png", "image/jpeg"], "file_size_limit": 10485760, "id": "testing-center-evidence", "name": "testing-center-evidence", "public": false}
