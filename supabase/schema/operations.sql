-- Generated from disposable PostgreSQL; read-only. Do not edit.
-- Name: operational_access_preview(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.operational_access_preview(p_user_id uuid) RETURNS TABLE(role text, status text, expires_at timestamp with time zone, policy_version integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select a.role, a.status, a.expires_at, a.policy_version
  from public.operational_access_assignments a
  where a.user_id = p_user_id
  order by a.status, a.role
$$;


--

-- Name: operational_access_reject_audit_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.operational_access_reject_audit_mutation() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  raise exception 'operational_access_audit_is_append_only';
end;
$$;


--

-- Name: operational_access_set(uuid, text, text, text, text, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.operational_access_set(p_user_id uuid, p_role text, p_action text, p_actor_ref text, p_reason text, p_correlation_id text, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE(outcome text, role text, status text, expires_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare
  v_existing public.operational_access_assignments%rowtype;
  v_replaced record;
  v_now timestamptz := now();
begin
  perform private.lock_accounts_before_rows(array[p_user_id]);
  if p_user_id is null
     or p_role not in ('tester', 'nightly_tester', 'owner')
     or p_action not in ('grant', 'revoke')
     or p_actor_ref !~ '^[a-z0-9][a-z0-9._:-]{2,79}$'
     or length(trim(coalesce(p_reason, ''))) not between 3 and 500
     or p_correlation_id !~ '^[a-z0-9][a-z0-9._:-]{2,127}$'
     or (p_action = 'revoke' and p_expires_at is not null)
     or (p_action = 'grant' and p_expires_at is not null and p_expires_at <= v_now) then
    raise exception 'invalid_operational_access_request';
  end if;

  perform 1 from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'operational_access_user_not_found';
  end if;

  select * into v_existing
  from public.operational_access_assignments a
  where a.user_id = p_user_id and a.role = p_role
  for update;

  if p_action = 'revoke' then
    if not found or v_existing.status = 'revoked' then
      return query select 'unchanged'::text, p_role, 'revoked'::text, null::timestamptz;
      return;
    end if;
    update public.operational_access_assignments a
    set status = 'revoked',
        revoked_at = v_now,
        revoked_by = p_actor_ref,
        revoke_reason = trim(p_reason),
        correlation_id = p_correlation_id,
        updated_at = v_now
    where a.id = v_existing.id;
    insert into public.operational_access_audit (
      target_user_id, role, action, actor_ref, reason, correlation_id,
      expires_at, policy_version, occurred_at
    ) values (
      p_user_id, p_role, 'revoke', p_actor_ref, trim(p_reason),
      p_correlation_id, v_existing.expires_at, 1, v_now
    );
    return query select 'applied'::text, p_role, 'revoked'::text, null::timestamptz;
    return;
  end if;

  if found
     and v_existing.status = 'active'
     and v_existing.expires_at is not distinct from p_expires_at then
    return query select 'unchanged'::text, p_role, 'active'::text, p_expires_at;
    return;
  end if;

  for v_replaced in
    update public.operational_access_assignments a
    set status = 'revoked',
        revoked_at = v_now,
        revoked_by = p_actor_ref,
        revoke_reason = 'Replaced by role ' || p_role,
        correlation_id = p_correlation_id,
        updated_at = v_now
    where a.user_id = p_user_id and a.status = 'active' and a.role <> p_role
    returning a.role, a.expires_at
  loop
    insert into public.operational_access_audit (
      target_user_id, role, action, actor_ref, reason, correlation_id,
      expires_at, policy_version, occurred_at
    ) values (
      p_user_id, v_replaced.role, 'revoke', p_actor_ref,
      'Replaced by role ' || p_role, p_correlation_id,
      v_replaced.expires_at, 1, v_now
    );
  end loop;

  insert into public.operational_access_assignments (
    user_id, role, status, expires_at, policy_version, granted_at, granted_by,
    grant_reason, revoked_at, revoked_by, revoke_reason, correlation_id,
    created_at, updated_at
  ) values (
    p_user_id, p_role, 'active', p_expires_at, 1, v_now, p_actor_ref,
    trim(p_reason), null, null, null, p_correlation_id, v_now, v_now
  )
  on conflict on constraint operational_access_user_role_key do update set
    status = 'active',
    expires_at = excluded.expires_at,
    policy_version = 1,
    granted_at = excluded.granted_at,
    granted_by = excluded.granted_by,
    grant_reason = excluded.grant_reason,
    revoked_at = null,
    revoked_by = null,
    revoke_reason = null,
    correlation_id = excluded.correlation_id,
    updated_at = excluded.updated_at;

  insert into public.operational_access_audit (
    target_user_id, role, action, actor_ref, reason, correlation_id,
    expires_at, policy_version, occurred_at
  ) values (
    p_user_id, p_role, 'grant', p_actor_ref, trim(p_reason),
    p_correlation_id, p_expires_at, 1, v_now
  );
  return query select 'applied'::text, p_role, 'active'::text, p_expires_at;
end;
$_$;


--

-- Name: FUNCTION operational_access_set(p_user_id uuid, p_role text, p_action text, p_actor_ref text, p_reason text, p_correlation_id text, p_expires_at timestamp with time zone); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.operational_access_set(p_user_id uuid, p_role text, p_action text, p_actor_ref text, p_reason text, p_correlation_id text, p_expires_at timestamp with time zone) IS 'Service-only idempotent grant/revoke boundary for operational roles.';


--

-- Name: operational_legacy_grant_preview(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.operational_legacy_grant_preview(p_user_id uuid) RETURNS TABLE(active_count integer, capabilities text[])
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select
    count(*)::integer,
    coalesce(array_agg(distinct g.capability order by g.capability), '{}'::text[])
  from public.billing_access_grants g
  where g.user_id = p_user_id
    and g.provider = 'legacy'
    and g.environment = 'legacy'
    and g.status = 'active'
$$;


--

-- Name: operational_legacy_grant_retire(uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.operational_legacy_grant_retire(p_user_id uuid, p_actor_ref text, p_reason text, p_correlation_id text) RETURNS TABLE(outcome text, retired_count integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare
  v_retired integer := 0;
begin
  perform private.lock_accounts_before_rows(array[p_user_id]);
  if p_user_id is null
     or p_actor_ref !~ '^[a-z0-9][a-z0-9._:-]{2,79}$'
     or length(trim(coalesce(p_reason, ''))) not between 3 and 500
     or p_correlation_id !~ '^[a-z0-9][a-z0-9._:-]{2,127}$' then
    raise exception 'invalid_operational_legacy_retirement_request';
  end if;

  perform 1 from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'operational_access_user_not_found';
  end if;

  update public.billing_access_grants g
  set status = 'revoked',
      metadata = coalesce(g.metadata, '{}'::jsonb) || jsonb_build_object(
        'authority_retired', true,
        'retirement_correlation_id', p_correlation_id
      ),
      updated_at = now()
  where g.user_id = p_user_id
    and g.provider = 'legacy'
    and g.environment = 'legacy'
    and g.status = 'active';
  get diagnostics v_retired = row_count;

  if v_retired = 0 then
    return query select 'unchanged'::text, 0;
    return;
  end if;

  insert into public.operational_legacy_grant_retirements (
    target_user_id, retired_count, actor_ref, reason, correlation_id
  ) values (
    p_user_id, v_retired, p_actor_ref, trim(p_reason), p_correlation_id
  );
  perform public.billing_refresh_entitlement_read_model(p_user_id);
  return query select 'applied'::text, v_retired;
end;
$_$;


--

-- Name: FUNCTION operational_legacy_grant_retire(p_user_id uuid, p_actor_ref text, p_reason text, p_correlation_id text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.operational_legacy_grant_retire(p_user_id uuid, p_actor_ref text, p_reason text, p_correlation_id text) IS 'Service-only, per-user retirement of classified active legacy grants.';


--

-- Name: operational_access_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operational_access_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL,
    status text NOT NULL,
    expires_at timestamp with time zone,
    policy_version integer DEFAULT 1 NOT NULL,
    granted_at timestamp with time zone NOT NULL,
    granted_by text NOT NULL,
    grant_reason text NOT NULL,
    revoked_at timestamp with time zone,
    revoked_by text,
    revoke_reason text,
    correlation_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT operational_access_assignments_check CHECK (((expires_at IS NULL) OR (expires_at > granted_at))),
    CONSTRAINT operational_access_assignments_check1 CHECK ((((status = 'active'::text) AND (revoked_at IS NULL) AND (revoked_by IS NULL) AND (revoke_reason IS NULL)) OR ((status = 'revoked'::text) AND (revoked_at IS NOT NULL) AND (revoked_by IS NOT NULL) AND (revoke_reason IS NOT NULL)))),
    CONSTRAINT operational_access_assignments_correlation_id_check CHECK ((correlation_id ~ '^[a-z0-9][a-z0-9._:-]{2,127}$'::text)),
    CONSTRAINT operational_access_assignments_grant_reason_check CHECK (((length(TRIM(BOTH FROM grant_reason)) >= 3) AND (length(TRIM(BOTH FROM grant_reason)) <= 500))),
    CONSTRAINT operational_access_assignments_granted_by_check CHECK ((granted_by ~ '^[a-z0-9][a-z0-9._:-]{2,79}$'::text)),
    CONSTRAINT operational_access_assignments_policy_version_check CHECK ((policy_version = 1)),
    CONSTRAINT operational_access_assignments_revoke_reason_check CHECK (((revoke_reason IS NULL) OR ((length(TRIM(BOTH FROM revoke_reason)) >= 3) AND (length(TRIM(BOTH FROM revoke_reason)) <= 500)))),
    CONSTRAINT operational_access_assignments_revoked_by_check CHECK (((revoked_by IS NULL) OR (revoked_by ~ '^[a-z0-9][a-z0-9._:-]{2,79}$'::text))),
    CONSTRAINT operational_access_assignments_role_check CHECK ((role = ANY (ARRAY['tester'::text, 'nightly_tester'::text, 'owner'::text]))),
    CONSTRAINT operational_access_assignments_status_check CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text])))
);


--

-- Name: TABLE operational_access_assignments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.operational_access_assignments IS 'Non-commercial, revocable Vantare roles. Never a Polar purchase authority.';


--

-- Name: operational_access_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operational_access_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    target_user_id uuid NOT NULL,
    role text NOT NULL,
    action text NOT NULL,
    actor_ref text NOT NULL,
    reason text NOT NULL,
    correlation_id text NOT NULL,
    expires_at timestamp with time zone,
    policy_version integer NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT operational_access_audit_action_check CHECK ((action = ANY (ARRAY['grant'::text, 'revoke'::text]))),
    CONSTRAINT operational_access_audit_actor_ref_check CHECK ((actor_ref ~ '^[a-z0-9][a-z0-9._:-]{2,79}$'::text)),
    CONSTRAINT operational_access_audit_correlation_id_check CHECK ((correlation_id ~ '^[a-z0-9][a-z0-9._:-]{2,127}$'::text)),
    CONSTRAINT operational_access_audit_policy_version_check CHECK ((policy_version = 1)),
    CONSTRAINT operational_access_audit_reason_check CHECK (((length(TRIM(BOTH FROM reason)) >= 3) AND (length(TRIM(BOTH FROM reason)) <= 500))),
    CONSTRAINT operational_access_audit_role_check CHECK ((role = ANY (ARRAY['tester'::text, 'nightly_tester'::text, 'owner'::text])))
);


--

-- Name: operational_legacy_grant_retirements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operational_legacy_grant_retirements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    target_user_id uuid NOT NULL,
    retired_count integer NOT NULL,
    actor_ref text NOT NULL,
    reason text NOT NULL,
    correlation_id text NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT operational_legacy_grant_retirements_actor_ref_check CHECK ((actor_ref ~ '^[a-z0-9][a-z0-9._:-]{2,79}$'::text)),
    CONSTRAINT operational_legacy_grant_retirements_correlation_id_check CHECK ((correlation_id ~ '^[a-z0-9][a-z0-9._:-]{2,127}$'::text)),
    CONSTRAINT operational_legacy_grant_retirements_reason_check CHECK (((length(TRIM(BOTH FROM reason)) >= 3) AND (length(TRIM(BOTH FROM reason)) <= 500))),
    CONSTRAINT operational_legacy_grant_retirements_retired_count_check CHECK ((retired_count > 0))
);


--

-- Name: TABLE operational_legacy_grant_retirements; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.operational_legacy_grant_retirements IS 'Append-only audit of explicit retirement of legacy billing authority.';


--

-- Name: operational_access_assignments operational_access_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operational_access_assignments
    ADD CONSTRAINT operational_access_assignments_pkey PRIMARY KEY (id);


--

-- Name: operational_access_audit operational_access_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operational_access_audit
    ADD CONSTRAINT operational_access_audit_pkey PRIMARY KEY (id);


--

-- Name: operational_access_assignments operational_access_user_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operational_access_assignments
    ADD CONSTRAINT operational_access_user_role_key UNIQUE (user_id, role);


--

-- Name: operational_legacy_grant_retirements operational_legacy_grant_retirements_correlation_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operational_legacy_grant_retirements
    ADD CONSTRAINT operational_legacy_grant_retirements_correlation_id_key UNIQUE (correlation_id);


--

-- Name: operational_legacy_grant_retirements operational_legacy_grant_retirements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operational_legacy_grant_retirements
    ADD CONSTRAINT operational_legacy_grant_retirements_pkey PRIMARY KEY (id);


--

-- Name: operational_access_active_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX operational_access_active_expiry_idx ON public.operational_access_assignments USING btree (status, expires_at);


--

-- Name: operational_access_audit_target_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX operational_access_audit_target_idx ON public.operational_access_audit USING btree (target_user_id, occurred_at DESC);


--

-- Name: operational_access_one_active_role_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX operational_access_one_active_role_idx ON public.operational_access_assignments USING btree (user_id) WHERE (status = 'active'::text);


--

-- Name: operational_access_assignments a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.operational_access_assignments FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''user_id'')::uuid) owners(account)', 'select ($1->>''user_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''user_id'')::uuid))');


--

-- Name: operational_access_audit a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.operational_access_audit FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select ($1->>''target_user_id'')::uuid) owners(account)', 'select false');


--

-- Name: operational_legacy_grant_retirements a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.operational_legacy_grant_retirements FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select ($1->>''target_user_id'')::uuid) owners(account)', 'select false');


--

-- Name: operational_access_audit operational_access_audit_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER operational_access_audit_append_only BEFORE DELETE OR UPDATE ON public.operational_access_audit FOR EACH ROW EXECUTE FUNCTION public.operational_access_reject_audit_mutation();


--

-- Name: operational_legacy_grant_retirements operational_legacy_grant_retirements_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER operational_legacy_grant_retirements_append_only BEFORE DELETE OR UPDATE ON public.operational_legacy_grant_retirements FOR EACH ROW EXECUTE FUNCTION public.operational_access_reject_audit_mutation();


--

-- Name: operational_access_assignments operational_access_assignments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operational_access_assignments
    ADD CONSTRAINT operational_access_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--

-- Name: operational_access_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.operational_access_assignments ENABLE ROW LEVEL SECURITY;

--

-- Name: operational_access_audit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.operational_access_audit ENABLE ROW LEVEL SECURITY;

--

-- Name: operational_legacy_grant_retirements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.operational_legacy_grant_retirements ENABLE ROW LEVEL SECURITY;

--

-- Name: FUNCTION operational_access_preview(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.operational_access_preview(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.operational_access_preview(p_user_id uuid) TO service_role;


--

-- Name: FUNCTION operational_access_reject_audit_mutation(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.operational_access_reject_audit_mutation() FROM PUBLIC;


--

-- Name: FUNCTION operational_access_set(p_user_id uuid, p_role text, p_action text, p_actor_ref text, p_reason text, p_correlation_id text, p_expires_at timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.operational_access_set(p_user_id uuid, p_role text, p_action text, p_actor_ref text, p_reason text, p_correlation_id text, p_expires_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.operational_access_set(p_user_id uuid, p_role text, p_action text, p_actor_ref text, p_reason text, p_correlation_id text, p_expires_at timestamp with time zone) TO service_role;


--

-- Name: FUNCTION operational_legacy_grant_preview(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.operational_legacy_grant_preview(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.operational_legacy_grant_preview(p_user_id uuid) TO service_role;


--

-- Name: FUNCTION operational_legacy_grant_retire(p_user_id uuid, p_actor_ref text, p_reason text, p_correlation_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.operational_legacy_grant_retire(p_user_id uuid, p_actor_ref text, p_reason text, p_correlation_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.operational_legacy_grant_retire(p_user_id uuid, p_actor_ref text, p_reason text, p_correlation_id text) TO service_role;


--

-- Name: TABLE operational_access_assignments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.operational_access_assignments TO service_role;


--

-- Name: TABLE operational_access_audit; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.operational_access_audit TO service_role;


--

-- Name: TABLE operational_legacy_grant_retirements; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.operational_legacy_grant_retirements TO service_role;


--
