-- VANTA-131 / 7b final rollback. Only the empty legacy schema is restored.
begin;
set local lock_timeout='5s';
set local check_function_bodies=false;
do $rollback_guard$
begin
  if exists(select 1 from public.testing_center_technical_issues
    where contribution_id is null) then
    raise exception 'legacy_retirement_rollback_orphaned_v2_issue: retain technical issues until an explicit owner disposition'
      using errcode='55000';
  end if;
end $rollback_guard$;
lock table public.testing_center_technical_issues,
  public.testing_center_effect_outbox,
  public.testing_center_linear_projection_snapshots,
  public.testing_center_agent_audit,
  public.testing_center_agent_callbacks,
  public.testing_center_agent_effect_outbox,
  public.testing_center_agent_jobs,
  public.testing_center_agent_phase_callbacks,
  public.testing_center_agent_reservations,
  public.testing_center_audit,
  public.testing_center_candidate_builds,
  public.testing_center_codex_dossier_snapshots,
  public.testing_center_codex_execution_control,
  public.testing_center_codex_runs,
  public.testing_center_effect_supersessions,
  public.testing_center_idempotency,
  public.testing_center_issue_destinations,
  public.testing_center_linear_issue_bindings,
  public.testing_center_linear_reconciliations,
  public.testing_center_linear_webhook_deliveries,
  public.testing_center_owner_dispositions,
  public.testing_center_pauses,
  public.testing_center_promotions,
  public.testing_center_validation_snapshots,
  public.testing_center_validations in access exclusive mode;
create table private.testing_center_legacy_archive (
  source_table text not null,
  source_id text not null,
  "row" jsonb not null,
  row_sha256 text not null check (row_sha256 ~ '^[0-9a-f]{64}$'),
  archived_at timestamptz not null default clock_timestamp(),
  primary key (source_table,source_id)
);
alter table private.testing_center_legacy_archive enable row level security;
revoke all on table private.testing_center_legacy_archive
  from public,anon,authenticated,service_role;

CREATE TABLE public.testing_center_evidence (
    contract_version text DEFAULT 'testing-center.v1'::text NOT NULL,
    evidence_id text NOT NULL,
    report_id text NOT NULL,
    kind text NOT NULL,
    digest text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT testing_center_evidence_digest_check CHECK ((digest ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT testing_center_evidence_id_check CHECK (((evidence_id <> ''::text) AND (evidence_id !~ '^[[:space:]]|[[:space:]]$'::text) AND (octet_length(evidence_id) <= 256))),
    CONSTRAINT testing_center_evidence_kind_check CHECK ((kind = ANY (ARRAY['report_context'::text, 'diagnostic'::text, 'reproduction'::text, 'screenshot'::text]))),
    CONSTRAINT testing_center_evidence_version_check CHECK ((contract_version = 'testing-center.v1'::text))
);

ALTER TABLE ONLY public.testing_center_evidence FORCE ROW LEVEL SECURITY;


--
-- Name: testing_center_evidence_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_center_evidence_batches (
    contract_version text DEFAULT 'testing-center.screenshot-evidence.v1'::text NOT NULL,
    batch_id uuid NOT NULL,
    reporter_user_id uuid NOT NULL,
    channel text NOT NULL,
    idempotency_key text NOT NULL,
    manifest_digest text NOT NULL,
    state text DEFAULT 'prepared'::text NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '24:00:00'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT testing_center_evidence_batches_channel_check CHECK ((channel = ANY (ARRAY['nightly'::text, 'testers'::text]))),
    CONSTRAINT testing_center_evidence_batches_contract_check CHECK ((contract_version = 'testing-center.screenshot-evidence.v1'::text)),
    CONSTRAINT testing_center_evidence_batches_digest_check CHECK ((manifest_digest ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT testing_center_evidence_batches_expiry_check CHECK ((expires_at = (created_at + '24:00:00'::interval))),
    CONSTRAINT testing_center_evidence_batches_key_check CHECK (((idempotency_key <> ''::text) AND (idempotency_key !~ '^[[:space:]]|[[:space:]]$'::text) AND (octet_length(idempotency_key) <= 256))),
    CONSTRAINT testing_center_evidence_batches_state_check CHECK ((state = ANY (ARRAY['prepared'::text, 'uploading'::text, 'validating'::text, 'ready'::text, 'attached'::text, 'expired'::text])))
);

ALTER TABLE ONLY public.testing_center_evidence_batches FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE testing_center_evidence_batches; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.testing_center_evidence_batches IS 'ISA-350 private screenshot batch manifest; no bytes, names, URLs or reporter PII responses.';


--
-- Name: testing_center_evidence_outbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_center_evidence_outbox (
    job_id uuid NOT NULL,
    evidence_id uuid NOT NULL,
    kind text NOT NULL,
    state text DEFAULT 'queued'::text NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    available_at timestamp with time zone DEFAULT now() NOT NULL,
    lease_owner text,
    lease_expires_at timestamp with time zone,
    fencing_token bigint DEFAULT 0 NOT NULL,
    last_error_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT testing_center_evidence_outbox_attempt_check CHECK (((attempt_count >= 0) AND (attempt_count <= 100))),
    CONSTRAINT testing_center_evidence_outbox_fencing_check CHECK ((fencing_token >= 0)),
    CONSTRAINT testing_center_evidence_outbox_kind_check CHECK ((kind = ANY (ARRAY['validate'::text, 'delete'::text]))),
    CONSTRAINT testing_center_evidence_outbox_lease_check CHECK ((((state = 'claimed'::text) AND (lease_owner IS NOT NULL) AND (lease_expires_at IS NOT NULL) AND (fencing_token > 0)) OR ((state <> 'claimed'::text) AND (lease_owner IS NULL) AND (lease_expires_at IS NULL)))),
    CONSTRAINT testing_center_evidence_outbox_state_check CHECK ((state = ANY (ARRAY['queued'::text, 'claimed'::text, 'completed'::text, 'failed'::text])))
);

ALTER TABLE ONLY public.testing_center_evidence_outbox FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE testing_center_evidence_outbox; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.testing_center_evidence_outbox IS 'ISA-350 durable validate/delete work for ISA-351 lease and fencing claims.';


--
-- Name: testing_center_issue_occurrences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_center_issue_occurrences (
    report_id text NOT NULL,
    technical_issue_id text NOT NULL,
    is_primary boolean NOT NULL,
    technical_fingerprint text,
    functional_fingerprint text NOT NULL,
    compatibility_digest text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT testing_center_issue_occurrences_compatibility_check CHECK ((compatibility_digest ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT testing_center_issue_occurrences_functional_check CHECK ((functional_fingerprint ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT testing_center_issue_occurrences_technical_check CHECK (((technical_fingerprint IS NULL) OR (technical_fingerprint ~ '^[0-9a-f]{64}$'::text)))
);

ALTER TABLE ONLY public.testing_center_issue_occurrences FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE testing_center_issue_occurrences; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.testing_center_issue_occurrences IS 'TAU-05A report occurrences linked only by exact-compatible fingerprints.';


--
-- Name: testing_center_posthog_consent_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_center_posthog_consent_events (
    consent_event_id text NOT NULL,
    report_id text NOT NULL,
    revision integer NOT NULL,
    actor_user_id uuid NOT NULL,
    diagnostics_consent boolean NOT NULL,
    replay_consent boolean NOT NULL,
    idempotency_key text NOT NULL,
    operation_digest text NOT NULL,
    consent_expires_at timestamp with time zone DEFAULT (now() + '30 days'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT testing_center_posthog_consent_events_consent_event_id_check CHECK ((consent_event_id ~ '^posthog_consent_[0-9a-f]{64}$'::text)),
    CONSTRAINT testing_center_posthog_consent_events_idempotency_key_check CHECK (((idempotency_key <> ''::text) AND (octet_length(idempotency_key) <= 256))),
    CONSTRAINT testing_center_posthog_consent_events_operation_digest_check CHECK ((operation_digest ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT testing_center_posthog_consent_events_revision_check CHECK (((revision >= 1) AND (revision <= 1000))),
    CONSTRAINT testing_center_posthog_consent_replay_check CHECK (((NOT replay_consent) OR diagnostics_consent)),
    CONSTRAINT testing_center_posthog_consent_retention_check CHECK ((consent_expires_at = (created_at + '30 days'::interval)))
);

ALTER TABLE ONLY public.testing_center_posthog_consent_events FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE testing_center_posthog_consent_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.testing_center_posthog_consent_events IS 'TAU-07H1 append-only reporter consent; no PostHog identity or payload.';


--
-- Name: testing_center_posthog_evidence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_center_posthog_evidence (
    evidence_id text NOT NULL,
    report_id text NOT NULL,
    correlation_id text NOT NULL,
    channel text NOT NULL,
    app_version text NOT NULL,
    candidate_sha text NOT NULL,
    os_family text NOT NULL,
    os_release text NOT NULL,
    module text NOT NULL,
    fault_source text NOT NULL,
    fault_code text NOT NULL,
    error_name text NOT NULL,
    replay_consent boolean NOT NULL,
    replay_available boolean NOT NULL,
    replay_session_id text,
    restricted_replay_url text,
    linear_link_authorized boolean DEFAULT false NOT NULL,
    linear_link_authorized_by uuid,
    linear_link_authorized_at timestamp with time zone,
    projection_digest text NOT NULL,
    transport_digest text NOT NULL,
    canonical_projection jsonb NOT NULL,
    error_expires_at timestamp with time zone NOT NULL,
    replay_expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT testing_center_posthog_evidence_app_version_check CHECK ((app_version ~ '^[A-Za-z0-9][A-Za-z0-9._+-]{0,31}$'::text)),
    CONSTRAINT testing_center_posthog_evidence_candidate_sha_check CHECK ((candidate_sha ~ '^[0-9a-f]{40}$'::text)),
    CONSTRAINT testing_center_posthog_evidence_channel_check CHECK ((channel = ANY (ARRAY['nightly'::text, 'testers'::text]))),
    CONSTRAINT testing_center_posthog_evidence_correlation_id_check CHECK ((correlation_id ~ '^correlation_[0-9a-f]{64}$'::text)),
    CONSTRAINT testing_center_posthog_evidence_error_name_check CHECK ((error_name = ANY (ARRAY['Error'::text, 'AggregateError'::text, 'RangeError'::text, 'ReferenceError'::text, 'SyntaxError'::text, 'TypeError'::text, 'URIError'::text, 'BackendFailure'::text]))),
    CONSTRAINT testing_center_posthog_evidence_evidence_id_check CHECK ((evidence_id ~ '^posthog_[0-9a-f]{64}$'::text)),
    CONSTRAINT testing_center_posthog_evidence_fault_code_check CHECK ((fault_code = ANY (ARRAY['frontend.unhandled.exception'::text, 'frontend.operation.failed'::text, 'backend.operation.failed'::text, 'testing_center.submit.failed'::text]))),
    CONSTRAINT testing_center_posthog_evidence_fault_source_check CHECK ((fault_source = ANY (ARRAY['frontend'::text, 'backend'::text]))),
    CONSTRAINT testing_center_posthog_evidence_module_check CHECK ((module = ANY (ARRAY['hub'::text, 'launcher'::text, 'settings'::text, 'overlay_studio'::text, 'overlay_runtime'::text, 'telemetry'::text, 'telemetry_analysis'::text, 'engineer'::text, 'strategy'::text, 'calendar'::text, 'billing'::text, 'account'::text, 'updater'::text, 'testing_center'::text]))),
    CONSTRAINT testing_center_posthog_evidence_os_family_check CHECK ((os_family = 'windows'::text)),
    CONSTRAINT testing_center_posthog_evidence_os_release_check CHECK ((os_release = ANY (ARRAY['windows_10'::text, 'windows_11'::text]))),
    CONSTRAINT testing_center_posthog_evidence_projection_digest_check CHECK ((projection_digest ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT testing_center_posthog_evidence_transport_digest_check CHECK ((transport_digest ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT testing_center_posthog_linear_authorization_shape CHECK ((linear_link_authorized = ((linear_link_authorized_by IS NOT NULL) AND (linear_link_authorized_at IS NOT NULL)))),
    CONSTRAINT testing_center_posthog_replay_shape CHECK ((((NOT replay_consent) AND (NOT replay_available) AND (replay_session_id IS NULL) AND (restricted_replay_url IS NULL) AND (replay_expires_at IS NULL) AND (NOT linear_link_authorized) AND (linear_link_authorized_by IS NULL) AND (linear_link_authorized_at IS NULL)) OR (replay_consent AND replay_available AND (replay_session_id IS NOT NULL) AND (restricted_replay_url IS NOT NULL) AND (replay_expires_at IS NOT NULL)))),
    CONSTRAINT testing_center_posthog_retention_check CHECK (((error_expires_at = (created_at + '30 days'::interval)) AND ((replay_expires_at IS NULL) OR (replay_expires_at = (created_at + '7 days'::interval)))))
);

ALTER TABLE ONLY public.testing_center_posthog_evidence FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE testing_center_posthog_evidence; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.testing_center_posthog_evidence IS 'TAU-07H1 private allowlisted metadata and restricted replay link.';


--
-- Name: testing_center_report_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_center_report_events (
    event_id text NOT NULL,
    report_id text NOT NULL,
    event_type text DEFAULT 'submitted'::text NOT NULL,
    actor_id text NOT NULL,
    actor_user_id uuid NOT NULL,
    actor_role text NOT NULL,
    operation_digest text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT testing_center_report_events_digest_check CHECK ((operation_digest ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT testing_center_report_events_id_check CHECK (((event_id <> ''::text) AND (event_id !~ '^[[:space:]]|[[:space:]]$'::text) AND (octet_length(event_id) <= 256))),
    CONSTRAINT testing_center_report_events_role_check CHECK ((actor_role = ANY (ARRAY['tester'::text, 'primary_tester'::text, 'owner'::text]))),
    CONSTRAINT testing_center_report_events_type_check CHECK ((event_type = 'submitted'::text))
);

ALTER TABLE ONLY public.testing_center_report_events FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE testing_center_report_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.testing_center_report_events IS 'TAU-04A immutable server-side submission audit.';


--
-- Name: testing_center_report_payloads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_center_report_payloads (
    report_id text NOT NULL,
    action_text text NOT NULL,
    expected_text text NOT NULL,
    observed_text text NOT NULL,
    context_text text,
    app_version text NOT NULL,
    os_family text NOT NULL,
    os_version text NOT NULL,
    module text NOT NULL,
    include_diagnostic boolean NOT NULL,
    include_logs boolean NOT NULL,
    diagnostic_document jsonb,
    diagnostic_transport_digest text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    diagnostic_transport_size integer,
    CONSTRAINT testing_center_report_payload_action_check CHECK (((action_text = btrim(action_text)) AND ((octet_length(action_text) >= 3) AND (octet_length(action_text) <= 2048)))),
    CONSTRAINT testing_center_report_payload_context_check CHECK (((context_text IS NULL) OR ((context_text = btrim(context_text)) AND ((octet_length(context_text) >= 1) AND (octet_length(context_text) <= 4096))))),
    CONSTRAINT testing_center_report_payload_diagnostic_digest_check CHECK (((diagnostic_transport_digest IS NULL) OR (diagnostic_transport_digest ~ '^[0-9a-f]{64}$'::text))),
    CONSTRAINT testing_center_report_payload_diagnostic_shape_check CHECK ((((NOT include_diagnostic) AND (NOT include_logs) AND (diagnostic_document IS NULL) AND (diagnostic_transport_digest IS NULL)) OR (include_diagnostic AND (diagnostic_document IS NOT NULL) AND (diagnostic_transport_digest IS NOT NULL)))),
    CONSTRAINT testing_center_report_payload_expected_check CHECK (((expected_text = btrim(expected_text)) AND ((octet_length(expected_text) >= 3) AND (octet_length(expected_text) <= 2048)))),
    CONSTRAINT testing_center_report_payload_logs_require_diagnostic_check CHECK (((NOT include_logs) OR include_diagnostic)),
    CONSTRAINT testing_center_report_payload_module_check CHECK ((module = ANY (ARRAY['hub'::text, 'launcher'::text, 'settings'::text, 'overlay_studio'::text, 'overlay_runtime'::text, 'telemetry'::text, 'telemetry_analysis'::text, 'engineer'::text, 'strategy'::text, 'calendar'::text, 'billing'::text, 'account'::text, 'updater'::text, 'testing_center'::text, 'unknown'::text]))),
    CONSTRAINT testing_center_report_payload_observed_check CHECK (((observed_text = btrim(observed_text)) AND ((octet_length(observed_text) >= 3) AND (octet_length(observed_text) <= 2048)))),
    CONSTRAINT testing_center_report_payload_os_check CHECK ((os_family = 'windows'::text)),
    CONSTRAINT testing_center_report_payload_os_version_check CHECK ((os_version ~ '^[A-Za-z0-9][A-Za-z0-9 ._+-]{0,63}$'::text)),
    CONSTRAINT testing_center_report_payload_transport_size_check CHECK (((diagnostic_transport_size IS NULL) OR ((diagnostic_transport_size >= 1) AND (diagnostic_transport_size <= 65536)))),
    CONSTRAINT testing_center_report_payload_version_check CHECK ((app_version ~ '^[A-Za-z0-9][A-Za-z0-9._+-]{0,31}$'::text))
);

ALTER TABLE ONLY public.testing_center_report_payloads FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE testing_center_report_payloads; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.testing_center_report_payloads IS 'TAU-04A private, normalized report content visible only to reporter or owner.';


--
-- Name: testing_center_report_submission_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_center_report_submission_keys (
    reporter_user_id uuid NOT NULL,
    idempotency_key text NOT NULL,
    payload_digest text NOT NULL,
    report_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT testing_center_report_submission_digest_check CHECK ((payload_digest ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT testing_center_report_submission_key_check CHECK (((idempotency_key <> ''::text) AND (idempotency_key !~ '^[[:space:]]|[[:space:]]$'::text) AND (octet_length(idempotency_key) <= 256)))
);

ALTER TABLE ONLY public.testing_center_report_submission_keys FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE testing_center_report_submission_keys; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.testing_center_report_submission_keys IS 'TAU-04A private exactly-once keys; never exposed to authenticated clients.';


--
-- Name: testing_center_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_center_reports (
    contract_version text DEFAULT 'testing-center.v1'::text NOT NULL,
    report_id text NOT NULL,
    reporter_id text NOT NULL,
    reporter_user_id uuid NOT NULL,
    reporter_role text NOT NULL,
    channel text NOT NULL,
    state text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    fixed_in_version text,
    reject_reason text,
    CONSTRAINT testing_center_reports_channel_check CHECK ((channel = ANY (ARRAY['nightly'::text, 'testers'::text]))),
    CONSTRAINT testing_center_reports_fixed_in_version_check CHECK (((fixed_in_version ~ '^[0-9]+\.[0-9]+\.[0-9]+(\.[0-9]+)?(-[a-z0-9.-]+)?$'::text) AND (length(fixed_in_version) <= 60))),
    CONSTRAINT testing_center_reports_id_check CHECK (((report_id <> ''::text) AND (report_id !~ '^[[:space:]]|[[:space:]]$'::text) AND (octet_length(report_id) <= 256))),
    CONSTRAINT testing_center_reports_reject_reason_check CHECK ((length(reject_reason) <= 500)),
    CONSTRAINT testing_center_reports_reporter_check CHECK (((reporter_id <> ''::text) AND (reporter_id !~ '^[[:space:]]|[[:space:]]$'::text) AND (octet_length(reporter_id) <= 256))),
    CONSTRAINT testing_center_reports_role_check CHECK ((reporter_role = ANY (ARRAY['tester'::text, 'primary_tester'::text, 'owner'::text]))),
    CONSTRAINT testing_center_reports_state_check CHECK ((state = ANY (ARRAY['draft'::text, 'submitted'::text, 'validated'::text, 'duplicate_linked'::text, 'incomplete'::text, 'closed'::text, 'in_review'::text, 'rejected'::text, 'fixed'::text, 'spam'::text]))),
    CONSTRAINT testing_center_reports_version_check CHECK ((contract_version = 'testing-center.v1'::text))
);

ALTER TABLE ONLY public.testing_center_reports FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE testing_center_reports; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.testing_center_reports IS 'TAU-02B server-only report snapshots for testing-center.v1.';


--
-- Name: testing_center_screenshot_evidence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_center_screenshot_evidence (
    contract_version text DEFAULT 'testing-center.screenshot-evidence.v1'::text NOT NULL,
    evidence_id uuid NOT NULL,
    batch_id uuid NOT NULL,
    report_id text,
    "position" smallint NOT NULL,
    object_path text NOT NULL,
    media_type text NOT NULL,
    byte_size integer NOT NULL,
    sha256 text NOT NULL,
    width integer NOT NULL,
    height integer NOT NULL,
    state text DEFAULT 'prepared'::text NOT NULL,
    failure_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    validated_at timestamp with time zone,
    CONSTRAINT testing_center_screenshot_evidence_contract_check CHECK ((contract_version = 'testing-center.screenshot-evidence.v1'::text)),
    CONSTRAINT testing_center_screenshot_evidence_failure_check CHECK ((((state <> 'rejected'::text) AND (failure_code IS NULL)) OR ((state = 'rejected'::text) AND (failure_code = ANY (ARRAY['invalid_size'::text, 'invalid_media_type'::text, 'digest_mismatch'::text, 'invalid_signature'::text, 'invalid_dimensions'::text, 'object_missing'::text, 'validation_failed'::text]))))),
    CONSTRAINT testing_center_screenshot_evidence_height_check CHECK (((height >= 1) AND (height <= 16384))),
    CONSTRAINT testing_center_screenshot_evidence_mime_check CHECK ((media_type = ANY (ARRAY['image/png'::text, 'image/jpeg'::text]))),
    CONSTRAINT testing_center_screenshot_evidence_path_check CHECK ((object_path ~ '^v1/[0-9a-f]{32}/[0-9a-f-]{36}/[0-9a-f-]{36}$'::text)),
    CONSTRAINT testing_center_screenshot_evidence_pixels_check CHECK ((((width)::bigint * (height)::bigint) <= 40000000)),
    CONSTRAINT testing_center_screenshot_evidence_position_check CHECK ((("position" >= 1) AND ("position" <= 10))),
    CONSTRAINT testing_center_screenshot_evidence_sha_check CHECK ((sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT testing_center_screenshot_evidence_size_check CHECK (((byte_size >= 1) AND (byte_size <= 10485760))),
    CONSTRAINT testing_center_screenshot_evidence_state_check CHECK ((state = ANY (ARRAY['prepared'::text, 'uploading'::text, 'uploaded'::text, 'validating'::text, 'ready'::text, 'rejected'::text, 'removed'::text, 'expired'::text]))),
    CONSTRAINT testing_center_screenshot_evidence_validated_check CHECK ((((state = ANY (ARRAY['ready'::text, 'rejected'::text])) AND (validated_at IS NOT NULL)) OR ((state <> ALL (ARRAY['ready'::text, 'rejected'::text])) AND (validated_at IS NULL)))),
    CONSTRAINT testing_center_screenshot_evidence_width_check CHECK (((width >= 1) AND (width <= 16384)))
);

ALTER TABLE ONLY public.testing_center_screenshot_evidence FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE testing_center_screenshot_evidence; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.testing_center_screenshot_evidence IS 'ISA-350 server-owned screenshot slots and immutable declared metadata.';


--
-- Name: testing_center_triage_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_center_triage_results (
    report_id text NOT NULL,
    triage_state text NOT NULL,
    technical_issue_id text,
    technical_fingerprint text,
    functional_fingerprint text,
    compatibility_digest text,
    incomplete_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT testing_center_triage_results_compatibility_check CHECK (((compatibility_digest IS NULL) OR (compatibility_digest ~ '^[0-9a-f]{64}$'::text))),
    CONSTRAINT testing_center_triage_results_functional_check CHECK (((functional_fingerprint IS NULL) OR (functional_fingerprint ~ '^[0-9a-f]{64}$'::text))),
    CONSTRAINT testing_center_triage_results_reason_check CHECK (((incomplete_reason IS NULL) OR (incomplete_reason = 'missing_server_context'::text))),
    CONSTRAINT testing_center_triage_results_shape_check CHECK ((((triage_state = 'incomplete'::text) AND (technical_issue_id IS NULL) AND (technical_fingerprint IS NULL) AND (functional_fingerprint IS NULL) AND (compatibility_digest IS NULL) AND (incomplete_reason IS NOT NULL)) OR ((triage_state = ANY (ARRAY['issue_reserved'::text, 'duplicate_linked'::text])) AND (technical_issue_id IS NOT NULL) AND (functional_fingerprint IS NOT NULL) AND (compatibility_digest IS NOT NULL) AND (incomplete_reason IS NULL)))),
    CONSTRAINT testing_center_triage_results_state_check CHECK ((triage_state = ANY (ARRAY['incomplete'::text, 'issue_reserved'::text, 'duplicate_linked'::text]))),
    CONSTRAINT testing_center_triage_results_technical_check CHECK (((technical_fingerprint IS NULL) OR (technical_fingerprint ~ '^[0-9a-f]{64}$'::text)))
);

ALTER TABLE ONLY public.testing_center_triage_results FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE testing_center_triage_results; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.testing_center_triage_results IS 'TAU-05A immutable report triage decision and exact fingerprints.';


--
-- Name: testing_center_evidence_batches testing_center_evidence_batch_reporter_user_id_idempotency__key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_evidence_batches
    ADD CONSTRAINT testing_center_evidence_batch_reporter_user_id_idempotency__key UNIQUE (reporter_user_id, idempotency_key);


--
-- Name: testing_center_evidence_batches testing_center_evidence_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_evidence_batches
    ADD CONSTRAINT testing_center_evidence_batches_pkey PRIMARY KEY (batch_id);


--
-- Name: testing_center_evidence_outbox testing_center_evidence_outbox_evidence_kind_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_evidence_outbox
    ADD CONSTRAINT testing_center_evidence_outbox_evidence_kind_key UNIQUE (evidence_id, kind);


--
-- Name: testing_center_evidence_outbox testing_center_evidence_outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_evidence_outbox
    ADD CONSTRAINT testing_center_evidence_outbox_pkey PRIMARY KEY (job_id);


--
-- Name: testing_center_evidence testing_center_evidence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_evidence
    ADD CONSTRAINT testing_center_evidence_pkey PRIMARY KEY (evidence_id);


--
-- Name: testing_center_evidence testing_center_evidence_report_id_kind_digest_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_evidence
    ADD CONSTRAINT testing_center_evidence_report_id_kind_digest_key UNIQUE (report_id, kind, digest);


--
-- Name: testing_center_issue_occurrences testing_center_issue_occurrences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_issue_occurrences
    ADD CONSTRAINT testing_center_issue_occurrences_pkey PRIMARY KEY (report_id);


--
-- Name: testing_center_posthog_consent_events testing_center_posthog_consent_events_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_posthog_consent_events
    ADD CONSTRAINT testing_center_posthog_consent_events_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: testing_center_posthog_consent_events testing_center_posthog_consent_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_posthog_consent_events
    ADD CONSTRAINT testing_center_posthog_consent_events_pkey PRIMARY KEY (consent_event_id);


--
-- Name: testing_center_posthog_consent_events testing_center_posthog_consent_events_report_id_revision_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_posthog_consent_events
    ADD CONSTRAINT testing_center_posthog_consent_events_report_id_revision_key UNIQUE (report_id, revision);


--
-- Name: testing_center_posthog_evidence testing_center_posthog_evidence_correlation_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_posthog_evidence
    ADD CONSTRAINT testing_center_posthog_evidence_correlation_id_key UNIQUE (correlation_id);


--
-- Name: testing_center_posthog_evidence testing_center_posthog_evidence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_posthog_evidence
    ADD CONSTRAINT testing_center_posthog_evidence_pkey PRIMARY KEY (evidence_id);


--
-- Name: testing_center_posthog_evidence testing_center_posthog_evidence_projection_digest_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_posthog_evidence
    ADD CONSTRAINT testing_center_posthog_evidence_projection_digest_key UNIQUE (projection_digest);


--
-- Name: testing_center_posthog_evidence testing_center_posthog_evidence_transport_digest_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_posthog_evidence
    ADD CONSTRAINT testing_center_posthog_evidence_transport_digest_key UNIQUE (transport_digest);


--
-- Name: testing_center_report_events testing_center_report_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_report_events
    ADD CONSTRAINT testing_center_report_events_pkey PRIMARY KEY (event_id);


--
-- Name: testing_center_report_events testing_center_report_events_report_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_report_events
    ADD CONSTRAINT testing_center_report_events_report_id_key UNIQUE (report_id);


--
-- Name: testing_center_report_payloads testing_center_report_payloads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_report_payloads
    ADD CONSTRAINT testing_center_report_payloads_pkey PRIMARY KEY (report_id);


--
-- Name: testing_center_report_submission_keys testing_center_report_submission_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_report_submission_keys
    ADD CONSTRAINT testing_center_report_submission_keys_pkey PRIMARY KEY (reporter_user_id, idempotency_key);


--
-- Name: testing_center_report_submission_keys testing_center_report_submission_keys_report_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_report_submission_keys
    ADD CONSTRAINT testing_center_report_submission_keys_report_id_key UNIQUE (report_id);


--
-- Name: testing_center_reports testing_center_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_reports
    ADD CONSTRAINT testing_center_reports_pkey PRIMARY KEY (report_id);


--
-- Name: testing_center_screenshot_evidence testing_center_screenshot_evidence_batch_id_position_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_screenshot_evidence
    ADD CONSTRAINT testing_center_screenshot_evidence_batch_id_position_key UNIQUE (batch_id, "position");


--
-- Name: testing_center_screenshot_evidence testing_center_screenshot_evidence_object_path_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_screenshot_evidence
    ADD CONSTRAINT testing_center_screenshot_evidence_object_path_key UNIQUE (object_path);


--
-- Name: testing_center_screenshot_evidence testing_center_screenshot_evidence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_screenshot_evidence
    ADD CONSTRAINT testing_center_screenshot_evidence_pkey PRIMARY KEY (evidence_id);


--
-- Name: testing_center_triage_results testing_center_triage_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_triage_results
    ADD CONSTRAINT testing_center_triage_results_pkey PRIMARY KEY (report_id);


--
-- Name: testing_center_evidence_batches_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX testing_center_evidence_batches_expiry_idx ON public.testing_center_evidence_batches USING btree (state, expires_at);


--
-- Name: testing_center_evidence_outbox_claim_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX testing_center_evidence_outbox_claim_idx ON public.testing_center_evidence_outbox USING btree (state, available_at, lease_expires_at);


--
-- Name: testing_center_evidence_report_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX testing_center_evidence_report_idx ON public.testing_center_evidence USING btree (report_id, created_at);


--
-- Name: testing_center_issue_occurrences_functional_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX testing_center_issue_occurrences_functional_idx ON public.testing_center_issue_occurrences USING btree (functional_fingerprint, compatibility_digest, created_at);


--
-- Name: testing_center_issue_occurrences_one_primary_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX testing_center_issue_occurrences_one_primary_idx ON public.testing_center_issue_occurrences USING btree (technical_issue_id) WHERE is_primary;


--
-- Name: testing_center_issue_occurrences_technical_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX testing_center_issue_occurrences_technical_idx ON public.testing_center_issue_occurrences USING btree (technical_fingerprint, created_at) WHERE (technical_fingerprint IS NOT NULL);


--
-- Name: testing_center_posthog_consent_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX testing_center_posthog_consent_expiry_idx ON public.testing_center_posthog_consent_events USING btree (consent_expires_at);


--
-- Name: testing_center_posthog_consent_latest_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX testing_center_posthog_consent_latest_idx ON public.testing_center_posthog_consent_events USING btree (report_id, revision DESC);


--
-- Name: testing_center_posthog_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX testing_center_posthog_expiry_idx ON public.testing_center_posthog_evidence USING btree (error_expires_at, replay_expires_at);


--
-- Name: testing_center_report_events_actor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX testing_center_report_events_actor_idx ON public.testing_center_report_events USING btree (actor_user_id, created_at DESC);


--
-- Name: testing_center_report_payloads_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX testing_center_report_payloads_created_idx ON public.testing_center_report_payloads USING btree (created_at DESC);


--
-- Name: testing_center_reports_reporter_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX testing_center_reports_reporter_idx ON public.testing_center_reports USING btree (reporter_user_id, created_at DESC);


--
-- Name: testing_center_screenshot_evidence_batch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX testing_center_screenshot_evidence_batch_idx ON public.testing_center_screenshot_evidence USING btree (batch_id, state, "position");


--
-- Name: testing_center_screenshot_evidence_report_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX testing_center_screenshot_evidence_report_idx ON public.testing_center_screenshot_evidence USING btree (report_id) WHERE (report_id IS NOT NULL);


--
-- Name: testing_center_evidence a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_evidence FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=($1->>''report_id'')::text) owners(account)', 'select ($1->>''report_id'' is not null and not exists(select 1 from public.testing_center_reports p where p.report_id=($1->>''report_id'')::text))');


--
-- Name: testing_center_evidence_batches a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_evidence_batches FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''reporter_user_id'')::uuid) owners(account)', 'select ($1->>''reporter_user_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''reporter_user_id'')::uuid))');


--
-- Name: testing_center_evidence_outbox a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_evidence_outbox FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.testing_center_screenshot_evidence p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.evidence_id=($1->>''evidence_id'')::uuid union select a.account from public.testing_center_screenshot_evidence p3 cross join lateral (select a.account from public.testing_center_evidence_batches p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.batch_id=(to_jsonb(p3)->>''batch_id'')::uuid) a(account) where p3.evidence_id=($1->>''evidence_id'')::uuid) owners(account)', 'select ($1->>''evidence_id'' is not null and not exists(select 1 from public.testing_center_screenshot_evidence p where p.evidence_id=($1->>''evidence_id'')::uuid))');


--
-- Name: testing_center_issue_occurrences a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_issue_occurrences FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=($1->>''technical_issue_id'')::text union select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=($1->>''report_id'')::text) owners(account)', 'select ($1->>''report_id'' is not null and not exists(select 1 from public.testing_center_reports p where p.report_id=($1->>''report_id'')::text)) or ($1->>''technical_issue_id'' is not null and not exists(select 1 from public.testing_center_technical_issues p where p.technical_issue_id=($1->>''technical_issue_id'')::text))');


--
-- Name: testing_center_posthog_consent_events a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_posthog_consent_events FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''actor_user_id'')::uuid union select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=($1->>''report_id'')::text) owners(account)', 'select ($1->>''report_id'' is not null and not exists(select 1 from public.testing_center_reports p where p.report_id=($1->>''report_id'')::text)) or ($1->>''actor_user_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''actor_user_id'')::uuid))');


--
-- Name: testing_center_posthog_evidence a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_posthog_evidence FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''linear_link_authorized_by'')::uuid union select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=($1->>''report_id'')::text) owners(account)', 'select ($1->>''report_id'' is not null and not exists(select 1 from public.testing_center_reports p where p.report_id=($1->>''report_id'')::text)) or ($1->>''linear_link_authorized_by'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''linear_link_authorized_by'')::uuid))');


--
-- Name: testing_center_report_events a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_report_events FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=($1->>''report_id'')::text union select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''actor_user_id'')::uuid) owners(account)', 'select ($1->>''report_id'' is not null and not exists(select 1 from public.testing_center_reports p where p.report_id=($1->>''report_id'')::text)) or ($1->>''actor_user_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''actor_user_id'')::uuid))');


--
-- Name: testing_center_report_payloads a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_report_payloads FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=($1->>''report_id'')::text) owners(account)', 'select ($1->>''report_id'' is not null and not exists(select 1 from public.testing_center_reports p where p.report_id=($1->>''report_id'')::text))');


--
-- Name: testing_center_report_submission_keys a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_report_submission_keys FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=($1->>''report_id'')::text union select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''reporter_user_id'')::uuid) owners(account)', 'select ($1->>''report_id'' is not null and not exists(select 1 from public.testing_center_reports p where p.report_id=($1->>''report_id'')::text)) or ($1->>''reporter_user_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''reporter_user_id'')::uuid))');


--
-- Name: testing_center_reports a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_reports FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''reporter_user_id'')::uuid) owners(account)', 'select ($1->>''reporter_user_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''reporter_user_id'')::uuid))');


--
-- Name: testing_center_screenshot_evidence a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_screenshot_evidence FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.testing_center_evidence_batches p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.batch_id=($1->>''batch_id'')::uuid union select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=($1->>''report_id'')::text) owners(account)', 'select ($1->>''batch_id'' is not null and not exists(select 1 from public.testing_center_evidence_batches p where p.batch_id=($1->>''batch_id'')::uuid)) or ($1->>''report_id'' is not null and not exists(select 1 from public.testing_center_reports p where p.report_id=($1->>''report_id'')::text))');


--
-- Name: testing_center_triage_results a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_triage_results FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=($1->>''technical_issue_id'')::text union select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=($1->>''report_id'')::text) owners(account)', 'select ($1->>''report_id'' is not null and not exists(select 1 from public.testing_center_reports p where p.report_id=($1->>''report_id'')::text)) or ($1->>''technical_issue_id'' is not null and not exists(select 1 from public.testing_center_technical_issues p where p.technical_issue_id=($1->>''technical_issue_id'')::text))');


--
-- Name: testing_center_evidence_batches testing_center_evidence_batches_reporter_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_evidence_batches
    ADD CONSTRAINT testing_center_evidence_batches_reporter_user_id_fkey FOREIGN KEY (reporter_user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: testing_center_evidence_outbox testing_center_evidence_outbox_evidence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_evidence_outbox
    ADD CONSTRAINT testing_center_evidence_outbox_evidence_id_fkey FOREIGN KEY (evidence_id) REFERENCES public.testing_center_screenshot_evidence(evidence_id) ON DELETE RESTRICT;


--
-- Name: testing_center_evidence testing_center_evidence_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_evidence
    ADD CONSTRAINT testing_center_evidence_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.testing_center_reports(report_id) ON DELETE RESTRICT;


--
-- Name: testing_center_issue_occurrences testing_center_issue_occurrences_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_issue_occurrences
    ADD CONSTRAINT testing_center_issue_occurrences_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.testing_center_reports(report_id) ON DELETE RESTRICT;


--
-- Name: testing_center_issue_occurrences testing_center_issue_occurrences_technical_issue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_issue_occurrences
    ADD CONSTRAINT testing_center_issue_occurrences_technical_issue_id_fkey FOREIGN KEY (technical_issue_id) REFERENCES public.testing_center_technical_issues(technical_issue_id) ON DELETE RESTRICT;


--
-- Name: testing_center_posthog_consent_events testing_center_posthog_consent_events_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_posthog_consent_events
    ADD CONSTRAINT testing_center_posthog_consent_events_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: testing_center_posthog_consent_events testing_center_posthog_consent_events_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_posthog_consent_events
    ADD CONSTRAINT testing_center_posthog_consent_events_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.testing_center_reports(report_id) ON DELETE RESTRICT;


--
-- Name: testing_center_posthog_evidence testing_center_posthog_evidence_linear_link_authorized_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_posthog_evidence
    ADD CONSTRAINT testing_center_posthog_evidence_linear_link_authorized_by_fkey FOREIGN KEY (linear_link_authorized_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: testing_center_posthog_evidence testing_center_posthog_evidence_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_posthog_evidence
    ADD CONSTRAINT testing_center_posthog_evidence_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.testing_center_reports(report_id) ON DELETE RESTRICT;


--
-- Name: testing_center_report_events testing_center_report_events_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_report_events
    ADD CONSTRAINT testing_center_report_events_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: testing_center_report_events testing_center_report_events_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_report_events
    ADD CONSTRAINT testing_center_report_events_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.testing_center_reports(report_id) ON DELETE RESTRICT;


--
-- Name: testing_center_report_payloads testing_center_report_payloads_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_report_payloads
    ADD CONSTRAINT testing_center_report_payloads_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.testing_center_reports(report_id) ON DELETE RESTRICT;


--
-- Name: testing_center_report_submission_keys testing_center_report_submission_keys_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_report_submission_keys
    ADD CONSTRAINT testing_center_report_submission_keys_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.testing_center_reports(report_id) ON DELETE RESTRICT;


--
-- Name: testing_center_report_submission_keys testing_center_report_submission_keys_reporter_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_report_submission_keys
    ADD CONSTRAINT testing_center_report_submission_keys_reporter_user_id_fkey FOREIGN KEY (reporter_user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: testing_center_reports testing_center_reports_reporter_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_reports
    ADD CONSTRAINT testing_center_reports_reporter_user_id_fkey FOREIGN KEY (reporter_user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: testing_center_screenshot_evidence testing_center_screenshot_evidence_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_screenshot_evidence
    ADD CONSTRAINT testing_center_screenshot_evidence_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.testing_center_evidence_batches(batch_id) ON DELETE RESTRICT;


--
-- Name: testing_center_screenshot_evidence testing_center_screenshot_evidence_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_screenshot_evidence
    ADD CONSTRAINT testing_center_screenshot_evidence_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.testing_center_reports(report_id) ON DELETE RESTRICT;


--
-- Name: testing_center_triage_results testing_center_triage_results_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_triage_results
    ADD CONSTRAINT testing_center_triage_results_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.testing_center_reports(report_id) ON DELETE RESTRICT;


--
-- Name: testing_center_triage_results testing_center_triage_results_technical_issue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_triage_results
    ADD CONSTRAINT testing_center_triage_results_technical_issue_id_fkey FOREIGN KEY (technical_issue_id) REFERENCES public.testing_center_technical_issues(technical_issue_id) ON DELETE RESTRICT;


--
-- Name: testing_center_evidence; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_center_evidence ENABLE ROW LEVEL SECURITY;

--
-- Name: testing_center_evidence_batches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_center_evidence_batches ENABLE ROW LEVEL SECURITY;

--
-- Name: testing_center_evidence_outbox; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_center_evidence_outbox ENABLE ROW LEVEL SECURITY;

--
-- Name: testing_center_evidence testing_center_evidence_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY testing_center_evidence_select_own ON public.testing_center_evidence FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.testing_center_reports report
  WHERE ((report.report_id = testing_center_evidence.report_id) AND ((report.reporter_user_id = private.current_account()) OR (public.testing_center_current_role() = 'owner'::text))))));


--
-- Name: testing_center_issue_occurrences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_center_issue_occurrences ENABLE ROW LEVEL SECURITY;

--
-- Name: testing_center_posthog_consent_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_center_posthog_consent_events ENABLE ROW LEVEL SECURITY;

--
-- Name: testing_center_posthog_evidence; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_center_posthog_evidence ENABLE ROW LEVEL SECURITY;

--
-- Name: testing_center_report_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_center_report_events ENABLE ROW LEVEL SECURITY;

--
-- Name: testing_center_report_payloads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_center_report_payloads ENABLE ROW LEVEL SECURITY;

--
-- Name: testing_center_report_payloads testing_center_report_payloads_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY testing_center_report_payloads_select_own ON public.testing_center_report_payloads FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.testing_center_reports report
  WHERE ((report.report_id = testing_center_report_payloads.report_id) AND ((report.reporter_user_id = private.current_account()) OR (public.testing_center_current_role() = 'owner'::text))))));


--
-- Name: testing_center_report_submission_keys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_center_report_submission_keys ENABLE ROW LEVEL SECURITY;

--
-- Name: testing_center_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_center_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: testing_center_reports testing_center_reports_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY testing_center_reports_select_own ON public.testing_center_reports FOR SELECT TO authenticated USING (((reporter_user_id = private.current_account()) OR (public.testing_center_current_role() = 'owner'::text)));


--
-- Name: testing_center_screenshot_evidence; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_center_screenshot_evidence ENABLE ROW LEVEL SECURITY;

--
-- Name: testing_center_triage_results; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_center_triage_results ENABLE ROW LEVEL SECURITY;

--
-- Name: TABLE testing_center_evidence; Type: ACL; Schema: public; Owner: -
--

revoke all on table public.testing_center_evidence_outbox, public.testing_center_screenshot_evidence, public.testing_center_evidence_batches, public.testing_center_report_submission_keys, public.testing_center_report_events, public.testing_center_report_payloads, public.testing_center_posthog_consent_events, public.testing_center_posthog_evidence, public.testing_center_issue_occurrences, public.testing_center_triage_results, public.testing_center_evidence, public.testing_center_reports from public,anon,authenticated,service_role;
GRANT SELECT ON TABLE public.testing_center_evidence TO service_role;
GRANT SELECT ON TABLE public.testing_center_evidence TO authenticated;


--
-- Name: TABLE testing_center_evidence_batches; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.testing_center_evidence_batches TO service_role;


--
-- Name: TABLE testing_center_evidence_outbox; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.testing_center_evidence_outbox TO service_role;


--
-- Name: TABLE testing_center_issue_occurrences; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.testing_center_issue_occurrences TO service_role;


--
-- Name: TABLE testing_center_posthog_consent_events; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.testing_center_posthog_consent_events TO service_role;


--
-- Name: TABLE testing_center_posthog_evidence; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.testing_center_posthog_evidence TO service_role;


--
-- Name: TABLE testing_center_report_events; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.testing_center_report_events TO service_role;


--
-- Name: TABLE testing_center_report_payloads; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.testing_center_report_payloads TO service_role;
GRANT SELECT ON TABLE public.testing_center_report_payloads TO authenticated;


--
-- Name: TABLE testing_center_report_submission_keys; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.testing_center_report_submission_keys TO service_role;


--
-- Name: TABLE testing_center_reports; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.testing_center_reports TO service_role;
GRANT SELECT ON TABLE public.testing_center_reports TO authenticated;


--
-- Name: TABLE testing_center_screenshot_evidence; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.testing_center_screenshot_evidence TO service_role;


--
-- Name: TABLE testing_center_triage_results; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.testing_center_triage_results TO service_role;



alter table public.testing_center_technical_issues
  add constraint testing_center_technical_issues_report_id_fkey
  foreign key(report_id) references public.testing_center_reports(report_id) on delete restrict;
alter table public.testing_center_effect_outbox
  add constraint testing_center_effect_outbox_primary_report_id_fkey
  foreign key(primary_report_id) references public.testing_center_reports(report_id) on delete restrict;
alter table public.testing_center_linear_projection_snapshots
  add constraint testing_center_linear_projection_snapsho_primary_report_id_fkey
  foreign key(primary_report_id) references public.testing_center_reports(report_id) on delete restrict;
drop trigger a_account_write_barrier on public.testing_center_technical_issues;
drop policy testing_center_issues_select_own on public.testing_center_technical_issues;
create policy testing_center_issues_select_own on public.testing_center_technical_issues
  for select to authenticated using (exists (
    select 1 from public.testing_center_reports report
    where report.report_id=testing_center_technical_issues.report_id
      and (report.reporter_user_id=private.current_account()
        or public.testing_center_current_role()='owner')));
create trigger a_account_write_barrier before insert or update or delete
  on public.testing_center_technical_issues for each row
  execute function private.guard_account_write(
    'select array_remove(array[
      (select reporter_user_id from public.testing_center_reports where report_id=$1->>''report_id''),
      (select account_id from public.testing_contributions where id=($1->>''contribution_id'')::uuid)],null)',
    'select ($1->>''report_id'' is not null and not exists
      (select 1 from public.testing_center_reports where report_id=$1->>''report_id''))
      or ($1->>''contribution_id'' is not null and not exists
      (select 1 from public.testing_contributions where id=($1->>''contribution_id'')::uuid))');
CREATE OR REPLACE FUNCTION public.apply_clerk_user_event(p_event_id text, p_payload_hash text, p_issuer text, p_subject text, p_event_type text, p_event_at timestamp with time zone, p_verified_email text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare identity public.account_identities; account uuid; old_hash text;
begin
  if p_event_type not in ('user.created', 'user.updated', 'user.deleted')
    or p_event_at is null or not exists (select 1 from private.clerk_issuers c
      where c.issuer = p_issuer and c.enabled)
    or p_subject is null or p_subject !~ '^user_[a-zA-Z0-9_]{1,128}$' then
    raise exception 'invalid_clerk_user_event';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_issuer || chr(31) || p_subject, 0));
  insert into private.clerk_user_events(event_id, payload_hash, event_type)
    values(p_event_id, p_payload_hash, p_event_type) on conflict do nothing;
  if not found then
    select payload_hash into old_hash from private.clerk_user_events where event_id = p_event_id;
    if old_hash <> p_payload_hash then raise exception 'clerk_event_conflict'; end if;
    return 'unchanged';
  end if;
  select * into identity from public.account_identities i
    where i.issuer = p_issuer and i.subject = p_subject;
  -- Deleted is permanent, including delete-before-create and late JWT/webhooks.
  if identity.deleted_at is not null then return 'ignored'; end if;
  account := identity.account_id;
  if account is null then account := private.resolve_account_identity(p_issuer, p_subject); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(account::text, 1608));
  -- Another subject of this UUID may have deleted it while this event waited.
  -- Re-read under the account lock; never use the pre-wait PII/version state.
  select * into identity from public.account_identities i
    where i.issuer = p_issuer and i.subject = p_subject for update;
  if exists (select 1 from public.account_identities i
    where i.account_id = account and i.deleted_at is not null) then return 'ignored'; end if;
  if p_event_type = 'user.deleted' then
    update public.profiles set email = null, display_name = null, avatar_url = null,
      primary_simulator = null, onboarding_completed = false where id = account;
    delete from public.devices where user_id = account;
    delete from public.rate_limits where user_id = account;
    delete from public.license_validations where user_id = account;
    update public.licenses set is_active = false, hwid = null, deactivated_at = now(),
      deactivation_reason = 'clerk_user_deleted' where user_id = account;
    update public.billing_customers set email = null, metadata = '{}'::jsonb where user_id = account;
    update public.billing_access_grants set status = 'revoked' where user_id = account;
    update public.user_entitlements set status = 'revoked' where user_id = account;
    update public.operational_access_assignments set status = 'revoked', revoked_at = now(),
      revoked_by = 'clerk:webhook', revoke_reason = 'clerk_user_deleted'
      where user_id = account and status = 'active';

    -- Abort persisted uploads through S3 API, before deleting final objects.
    insert into private.clerk_deleted_uploads(issuer,subject,bucket_id,name,upload_id)
      select p_issuer,p_subject,u.bucket_id,u.key,u.id from storage.s3_multipart_uploads u
      where account in (select private.storage_owner_accounts(to_jsonb(u))) or u.owner_id=account::text
        or account in (select private.storage_owner_accounts(to_jsonb(b)) from storage.buckets b where b.id=u.bucket_id)
        or (exists(select 1 from public.account_identities a where a.account_id=account and a.subject=u.owner_id)
          and not exists(select 1 from public.account_identities a where a.account_id<>account and a.subject=u.owner_id))
        or (u.bucket_id='testing-center-evidence' and exists(
          select 1 from public.testing_center_screenshot_evidence e
          join public.testing_center_evidence_batches b using(batch_id)
          where b.reporter_user_id=account and e.object_path=u.key))
      on conflict do nothing;
    -- Storage bytes are removed through the Storage API, never SQL DELETE.
    insert into private.clerk_deleted_objects(issuer,subject,bucket_id,name)
      select p_issuer,p_subject,o.bucket_id,o.name from storage.objects o
      where account in (select private.storage_owner_accounts(to_jsonb(o))) or o.owner_id::text=account::text
        or account in (select private.storage_owner_accounts(to_jsonb(b)) from storage.buckets b where b.id=o.bucket_id)
        or o.owner=account
        or (exists(select 1 from public.account_identities a where a.account_id=account and a.subject=o.owner_id)
          and not exists(select 1 from public.account_identities a where a.account_id<>account and a.subject=o.owner_id))
        or (o.bucket_id='testing-center-evidence' and exists(
          select 1 from public.testing_center_screenshot_evidence e
          join public.testing_center_evidence_batches b using(batch_id)
          where b.reporter_user_id=account and e.object_path=o.name))
      on conflict do nothing;
    delete from pilot_private.operations where account_id=account;
    delete from public.pilot_profiles where account_id=account;
    delete from public.testing_answers where account_id=account;
    delete from public.testing_contributions where account_id=account;
    -- VANTA131 legacy archive erasure begin
    with recursive doomed(source_table,source_id) as (
      select archived.source_table,archived.source_id
      from private.testing_center_legacy_archive archived
      where archived.source_table='public.'||'testing_center_'||'reports'
        and archived."row"->>'reporter_user_id'=account::text
      union
      select child.source_table,child.source_id
      from private.testing_center_legacy_archive child
      join doomed path on true
      join private.testing_center_legacy_archive parent
        on parent.source_table=path.source_table and parent.source_id=path.source_id
      where (
        exists(select 1 from pg_catalog.pg_constraint fk
          join pg_catalog.pg_class cc on cc.oid=fk.conrelid
          join pg_catalog.pg_namespace cn on cn.oid=cc.relnamespace
          join pg_catalog.pg_class pc on pc.oid=fk.confrelid
          join pg_catalog.pg_namespace pn on pn.oid=pc.relnamespace
          where fk.contype='f'
            and child.source_table=pg_catalog.format('%I.%I',cn.nspname,cc.relname)
            and parent.source_table=pg_catalog.format('%I.%I',pn.nspname,pc.relname)
            and not exists(select 1 from unnest(fk.conkey,fk.confkey)
              as key_pair(child_attnum,parent_attnum)
              join pg_catalog.pg_attribute ca on ca.attrelid=fk.conrelid
                and ca.attnum=key_pair.child_attnum
              join pg_catalog.pg_attribute pa on pa.attrelid=fk.confrelid
                and pa.attnum=key_pair.parent_attnum
              where child."row"->ca.attname is null
                or child."row"->ca.attname is distinct from parent."row"->pa.attname))
        or (parent.source_table='public.testing_center_technical_issues'
          and child.source_table in ('public.testing_center_audit',
            'public.testing_center_idempotency')
          and child."row"->>'aggregate_id'=parent.source_id)
      )
        and (child."row"->>'report_id' is null or exists(
          select 1 from private.testing_center_legacy_archive owned
          where owned.source_table='public.'||'testing_center_'||'reports'
            and owned.source_id=child."row"->>'report_id'
            and owned."row"->>'reporter_user_id'=account::text))
    )
    delete from private.testing_center_legacy_archive archived
    using doomed
    where archived.source_table=doomed.source_table
      and archived.source_id=doomed.source_id;
    -- VANTA131 legacy archive erasure end


























    update public.testing_center_memberships set active=false where user_id=account;
    update public.account_identities set deleted_at = p_event_at, user_event_at = greatest(user_event_at,p_event_at)
      where account_id = account;
    -- Preserve private financial/support IDs and audit hashes. No automatic purge.
  elsif identity.user_event_at is null or p_event_at > identity.user_event_at then
    update public.profiles set email = p_verified_email where id = account;
    update public.account_identities set user_event_at = p_event_at
      where issuer = p_issuer and subject = p_subject;
  else
    return 'ignored';
  end if;
  return 'applied';
end $function$;

CREATE OR REPLACE FUNCTION private.storage_owner_accounts(p_row jsonb)
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare owner_text text:=nullif(p_row->>'owner_id',''); owners uuid[]; v_issuer text;
begin
  if owner_text is not null then
    if owner_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return next owner_text::uuid;
    else
      -- Clerk service writes may lack JWT claims. In that case only one durable
      -- UUID across issuers is acceptable; a bare, ambiguous sub is never linked.
      if auth.jwt()->>'sub'=owner_text and auth.jwt()->>'role'='authenticated' then
        v_issuer:=auth.jwt()->>'iss';
      end if;
      select array_agg(distinct i.account_id) into owners from public.account_identities i
        where i.subject=owner_text ;
      if coalesce(cardinality(owners),0)<>1 then
        raise sqlstate '23503' using message='storage_owner_unresolved';
      end if;
      if v_issuer is not null and not exists(select 1 from public.account_identities i
        where i.subject=owner_text and i.issuer=v_issuer and i.account_id=owners[1]) then
        raise sqlstate '23503' using message='storage_owner_unresolved';
      end if;
      return next owners[1];
    end if;
  end if;

  -- Pilot paths are UUID/hash.jpg and may be written with a service owner NULL.
  if p_row->>'bucket_id'='pilot-photos' and coalesce(p_row->>'name',p_row->>'key')
    ~ '^[0-9a-f-]{36}/[0-9a-f]{64}\.jpg$' then
    return next split_part(coalesce(p_row->>'name',p_row->>'key'),'/',1)::uuid;
  end if;
  -- Deprecated owner may still be present in historical Storage rows.
  if nullif(p_row->>'owner','') is not null then return next (p_row->>'owner')::uuid; end if;
  return query select b.reporter_user_id from public.testing_center_screenshot_evidence e
    join public.testing_center_evidence_batches b using(batch_id)
    where p_row->>'bucket_id'='testing-center-evidence'
      and e.object_path=coalesce(p_row->>'name',p_row->>'key');
end $function$;
revoke all on function public.apply_clerk_user_event(text,text,text,text,text,timestamptz,text)
  from public,anon,authenticated,service_role;
grant execute on function public.apply_clerk_user_event(text,text,text,text,text,timestamptz,text)
  to service_role;
revoke all on function private.storage_owner_accounts(jsonb)
  from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.testing_center_submit_report_without_transport_size(p_contract_version text, p_channel text, p_action_text text, p_expected_text text, p_observed_text text, p_context_text text, p_app_version text, p_os_family text, p_os_version text, p_module text, p_include_diagnostic boolean, p_include_logs boolean, p_diagnostic_payload text, p_diagnostic_digest text, p_idempotency_key text)
 RETURNS TABLE(report_id text, report_state text, idempotent boolean, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := private.current_account();
  v_actor_id text;
  v_role text;
  v_context_text text;
  v_diagnostic jsonb;
  v_diagnostic_time timestamptz;
  v_operation_digest text;
  v_report_id text;
  v_event_id text;
  v_evidence_id text;
  v_created_at timestamptz;
  v_existing public.testing_center_report_submission_keys%rowtype;
begin
  if v_user_id is null then
    raise exception 'testing_center_auth_required' using errcode = '42501';
  end if;

  select membership.actor_id, membership.role
  into v_actor_id, v_role
  from public.testing_center_memberships as membership
  where membership.user_id = v_user_id
    and membership.active;

  if not found then
    raise exception 'testing_center_membership_required' using errcode = '42501';
  end if;

  if p_contract_version is distinct from 'testing-center.v1' then
    raise exception 'testing_center_contract_version_invalid' using errcode = '22023';
  end if;
  if p_channel = 'nightly' then
    if v_role not in ('primary_tester', 'owner') then
      raise exception 'testing_center_nightly_role_required' using errcode = '42501';
    end if;
  elsif p_channel = 'testers' then
    if v_role not in ('tester', 'primary_tester', 'owner') then
      raise exception 'testing_center_testers_role_required' using errcode = '42501';
    end if;
  else
    raise exception 'testing_center_channel_invalid' using errcode = '22023';
  end if;

  if p_action_text is null
    or p_action_text <> pg_catalog.btrim(p_action_text)
    or pg_catalog.octet_length(p_action_text) not between 3 and 2048 then
    raise exception 'testing_center_action_invalid' using errcode = '22023';
  end if;
  if p_expected_text is null
    or p_expected_text <> pg_catalog.btrim(p_expected_text)
    or pg_catalog.octet_length(p_expected_text) not between 3 and 2048 then
    raise exception 'testing_center_expected_invalid' using errcode = '22023';
  end if;
  if p_observed_text is null
    or p_observed_text <> pg_catalog.btrim(p_observed_text)
    or pg_catalog.octet_length(p_observed_text) not between 3 and 2048 then
    raise exception 'testing_center_observed_invalid' using errcode = '22023';
  end if;

  v_context_text := nullif(pg_catalog.btrim(p_context_text), '');
  if v_context_text is not null
    and pg_catalog.octet_length(v_context_text) > 4096 then
    raise exception 'testing_center_context_invalid' using errcode = '22023';
  end if;
  if p_app_version is null
    or p_app_version !~ '^[A-Za-z0-9][A-Za-z0-9._+-]{0,31}$' then
    raise exception 'testing_center_app_version_invalid' using errcode = '22023';
  end if;
  if p_os_family is distinct from 'windows' then
    raise exception 'testing_center_os_invalid' using errcode = '22023';
  end if;
  if p_os_version is null
    or p_os_version !~ '^[A-Za-z0-9][A-Za-z0-9 ._+-]{0,63}$' then
    raise exception 'testing_center_os_version_invalid' using errcode = '22023';
  end if;
  if p_module is null or p_module not in (
    'hub', 'launcher', 'settings', 'overlay_studio', 'overlay_runtime',
    'telemetry', 'telemetry_analysis', 'engineer', 'strategy', 'calendar',
    'billing', 'account', 'updater', 'testing_center', 'unknown'
  ) then
    raise exception 'testing_center_module_invalid' using errcode = '22023';
  end if;
  if p_idempotency_key is null
    or p_idempotency_key = ''
    or p_idempotency_key ~ '^[[:space:]]|[[:space:]]$'
    or pg_catalog.octet_length(p_idempotency_key) > 256 then
    raise exception 'testing_center_idempotency_key_invalid' using errcode = '22023';
  end if;
  if p_include_diagnostic is null or p_include_logs is null then
    raise exception 'testing_center_consent_invalid' using errcode = '22023';
  end if;
  if p_include_logs and not p_include_diagnostic then
    raise exception 'testing_center_logs_require_diagnostic' using errcode = '22023';
  end if;

  if not p_include_diagnostic then
    if p_diagnostic_payload is not null or p_diagnostic_digest is not null then
      raise exception 'testing_center_diagnostic_without_consent' using errcode = '22023';
    end if;
  else
    if p_diagnostic_payload is null
      or pg_catalog.octet_length(p_diagnostic_payload) > 65536
      or p_diagnostic_digest is null
      or p_diagnostic_digest !~ '^[0-9a-f]{64}$'
      or p_diagnostic_digest <> pg_catalog.encode(
        public.digest(pg_catalog.convert_to(p_diagnostic_payload, 'UTF8'), 'sha256'),
        'hex'
      ) then
      raise exception 'testing_center_diagnostic_integrity_invalid' using errcode = '22023';
    end if;

    begin
      v_diagnostic := p_diagnostic_payload::jsonb;
    exception when others then
      raise exception 'testing_center_diagnostic_json_invalid' using errcode = '22023';
    end;

    if pg_catalog.jsonb_typeof(v_diagnostic) <> 'object'
      or (select count(*) from pg_catalog.jsonb_object_keys(v_diagnostic)) <> 7
      or exists (
        select 1 from pg_catalog.jsonb_object_keys(v_diagnostic) as key
        where key not in (
          'contractVersion', 'generatedAtUtc', 'application', 'module',
          'errorCode', 'logs', 'sanitization'
        )
      )
      or pg_catalog.jsonb_typeof(v_diagnostic->'contractVersion') <> 'string'
      or v_diagnostic->>'contractVersion' <> 'testing-center.diagnostic.v1'
      or pg_catalog.jsonb_typeof(v_diagnostic->'generatedAtUtc') <> 'string'
      or pg_catalog.jsonb_typeof(v_diagnostic->'module') <> 'string'
      or v_diagnostic->>'module' <> p_module
      or pg_catalog.jsonb_typeof(v_diagnostic->'errorCode') <> 'string'
      or pg_catalog.jsonb_typeof(v_diagnostic->'application') <> 'object'
      or (select count(*) from pg_catalog.jsonb_object_keys(v_diagnostic->'application')) <> 4
      or exists (
        select 1 from pg_catalog.jsonb_object_keys(v_diagnostic->'application') as key
        where key not in ('version', 'channel', 'os', 'arch')
      )
      or pg_catalog.jsonb_typeof(v_diagnostic->'application'->'version') <> 'string'
      or pg_catalog.jsonb_typeof(v_diagnostic->'application'->'channel') <> 'string'
      or pg_catalog.jsonb_typeof(v_diagnostic->'application'->'os') <> 'string'
      or pg_catalog.jsonb_typeof(v_diagnostic->'application'->'arch') <> 'string'
      or v_diagnostic->'application'->>'version' <> p_app_version
      or v_diagnostic->'application'->>'channel' <> p_channel
      or v_diagnostic->'application'->>'os' <> p_os_family
      or v_diagnostic->'application'->>'arch' not in ('amd64', 'arm64')
      or (v_diagnostic->>'errorCode') !~ '^[a-z0-9][a-z0-9._+-]{0,63}$'
      or pg_catalog.jsonb_typeof(v_diagnostic->'logs') <> 'array'
      or pg_catalog.jsonb_array_length(v_diagnostic->'logs') > 100
      or pg_catalog.jsonb_typeof(v_diagnostic->'sanitization') <> 'object'
      or (select count(*) from pg_catalog.jsonb_object_keys(v_diagnostic->'sanitization')) <> 5
      or exists (
        select 1 from pg_catalog.jsonb_object_keys(v_diagnostic->'sanitization') as key
        where key not in (
          'inputLogs', 'includedLogs', 'omittedLogs', 'redactedValues',
          'truncatedMessages'
        )
      )
      or exists (
        select 1
        from (values
          (v_diagnostic->'sanitization'->'inputLogs'),
          (v_diagnostic->'sanitization'->'includedLogs'),
          (v_diagnostic->'sanitization'->'omittedLogs'),
          (v_diagnostic->'sanitization'->'redactedValues'),
          (v_diagnostic->'sanitization'->'truncatedMessages')
        ) as counters(value)
        where pg_catalog.jsonb_typeof(value) <> 'number'
          or value #>> '{}' !~ '^[0-9]{1,10}$'
      ) then
      raise exception 'testing_center_diagnostic_shape_invalid' using errcode = '22023';
    end if;

    if (v_diagnostic->'sanitization'->>'inputLogs')::bigint > 1000
      or (v_diagnostic->'sanitization'->>'includedLogs')::bigint > 100
      or (v_diagnostic->'sanitization'->>'omittedLogs')::bigint > 1000
      or (v_diagnostic->'sanitization'->>'redactedValues')::bigint > 100000
      or (v_diagnostic->'sanitization'->>'truncatedMessages')::bigint > 100000
      or (v_diagnostic->'sanitization'->>'includedLogs')::bigint
        <> pg_catalog.jsonb_array_length(v_diagnostic->'logs')
      or (v_diagnostic->'sanitization'->>'inputLogs')::bigint
        <> (v_diagnostic->'sanitization'->>'includedLogs')::bigint
          + (v_diagnostic->'sanitization'->>'omittedLogs')::bigint then
      raise exception 'testing_center_diagnostic_counters_invalid' using errcode = '22023';
    end if;

    begin
      v_diagnostic_time := (v_diagnostic->>'generatedAtUtc')::timestamptz;
    exception when others then
      raise exception 'testing_center_diagnostic_time_invalid' using errcode = '22023';
    end;
    if v_diagnostic_time < pg_catalog.now() - interval '7 days'
      or v_diagnostic_time > pg_catalog.now() + interval '5 minutes' then
      raise exception 'testing_center_diagnostic_time_invalid' using errcode = '22023';
    end if;

    if (not p_include_logs and pg_catalog.jsonb_array_length(v_diagnostic->'logs') <> 0)
      or exists (
        select 1
        from pg_catalog.jsonb_array_elements(v_diagnostic->'logs') as item
        where pg_catalog.jsonb_typeof(item) <> 'object'
          or (select count(*) from pg_catalog.jsonb_object_keys(item)) <> 5
          or exists (
            select 1 from pg_catalog.jsonb_object_keys(item) as key
            where key not in ('offsetMillis', 'source', 'level', 'code', 'message')
          )
          or pg_catalog.jsonb_typeof(item->'offsetMillis') <> 'number'
          or pg_catalog.jsonb_typeof(item->'source') <> 'string'
          or pg_catalog.jsonb_typeof(item->'level') <> 'string'
          or pg_catalog.jsonb_typeof(item->'code') <> 'string'
          or pg_catalog.jsonb_typeof(item->'message') <> 'string'
          or item->>'source' not in ('frontend', 'backend', 'wails', 'runtime')
          or item->>'level' not in ('info', 'warn', 'error')
          or (item->>'code') !~ '^[a-z0-9][a-z0-9._+-]{0,63}$'
          or pg_catalog.octet_length(item->>'message') > 512
          or (item->>'offsetMillis') !~ '^[0-9]{1,8}$'
          or (item->>'offsetMillis')::numeric not between 0 and 86400000
      ) then
      raise exception 'testing_center_diagnostic_logs_invalid' using errcode = '22023';
    end if;
  end if;

  v_operation_digest := pg_catalog.encode(
    public.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'actionText', p_action_text,
          'actorId', v_actor_id,
          'actorRole', v_role,
          'actorUserId', v_user_id,
          'appVersion', p_app_version,
          'channel', p_channel,
          'contextText', v_context_text,
          'contractVersion', p_contract_version,
          'diagnosticDigest', p_diagnostic_digest,
          'expectedText', p_expected_text,
          'idempotencyKey', p_idempotency_key,
          'includeDiagnostic', p_include_diagnostic,
          'includeLogs', p_include_logs,
          'module', p_module,
          'observedText', p_observed_text,
          'osFamily', p_os_family,
          'osVersion', p_os_version
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
  v_report_id := 'report_' || v_operation_digest;
  v_event_id := 'report_event_' || v_operation_digest;
  v_evidence_id := 'evidence_' || pg_catalog.encode(
    public.digest(
      pg_catalog.convert_to('diagnostic' || pg_catalog.chr(31) || v_operation_digest, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || pg_catalog.chr(31) || p_idempotency_key, 0)
  );

  select submission.*
  into v_existing
  from public.testing_center_report_submission_keys as submission
  where submission.reporter_user_id = v_user_id
    and submission.idempotency_key = p_idempotency_key;

  if found then
    if v_existing.payload_digest <> v_operation_digest
      or v_existing.report_id <> v_report_id then
      raise exception 'testing_center_idempotency_conflict' using errcode = '23505';
    end if;
    select report.created_at
    into v_created_at
    from public.testing_center_reports as report
    join public.testing_center_report_payloads as payload
      on payload.report_id = report.report_id
    join public.testing_center_report_events as event
      on event.report_id = report.report_id
    where report.report_id = v_existing.report_id
      and report.reporter_user_id = v_user_id
      and report.reporter_id = v_actor_id
      and report.reporter_role = v_role
      and report.channel = p_channel
      and report.state = 'submitted'
      and event.operation_digest = v_operation_digest;
    if not found then
      raise exception 'testing_center_idempotency_result_missing' using errcode = '23505';
    end if;
    return query select v_report_id, 'submitted'::text, true, v_created_at;
    return;
  end if;

  v_created_at := pg_catalog.now();

  insert into public.testing_center_reports (
    contract_version, report_id, reporter_id, reporter_user_id, reporter_role,
    channel, state, created_at, updated_at
  ) values (
    'testing-center.v1', v_report_id, v_actor_id, v_user_id, v_role,
    p_channel, 'submitted', v_created_at, v_created_at
  );

  insert into public.testing_center_report_payloads (
    report_id, action_text, expected_text, observed_text, context_text,
    app_version, os_family, os_version, module,
    include_diagnostic, include_logs, diagnostic_document,
    diagnostic_transport_digest, created_at
  ) values (
    v_report_id, p_action_text, p_expected_text, p_observed_text, v_context_text,
    p_app_version, p_os_family, p_os_version, p_module,
    p_include_diagnostic, p_include_logs, v_diagnostic,
    p_diagnostic_digest, v_created_at
  );

  if p_include_diagnostic then
    insert into public.testing_center_evidence (
      contract_version, evidence_id, report_id, kind, digest, created_at
    ) values (
      'testing-center.v1', v_evidence_id, v_report_id, 'diagnostic',
      p_diagnostic_digest, v_created_at
    );
  end if;

  insert into public.testing_center_report_submission_keys (
    reporter_user_id, idempotency_key, payload_digest, report_id, created_at
  ) values (
    v_user_id, p_idempotency_key, v_operation_digest, v_report_id, v_created_at
  );

  insert into public.testing_center_report_events (
    event_id, report_id, actor_id, actor_user_id, actor_role,
    operation_digest, created_at
  ) values (
    v_event_id, v_report_id, v_actor_id, v_user_id, v_role,
    v_operation_digest, v_created_at
  );

  return query select v_report_id, 'submitted'::text, false, v_created_at;
end
$function$;
revoke all on function public.testing_center_submit_report_without_transport_size(text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text) from public,anon,authenticated,service_role;
comment on function public.testing_center_submit_report_without_transport_size(text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text) is 'TAU-04A authenticated and idempotent report submission boundary.';
CREATE OR REPLACE FUNCTION public.testing_center_triage_report(p_report_id text)
 RETURNS TABLE(result_report_id text, result_triage_state text, result_technical_issue_id text, result_technical_fingerprint text, result_functional_fingerprint text, result_effect_id text, result_idempotent boolean, result_occurrence_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_report public.testing_center_reports%rowtype;
  v_payload public.testing_center_report_payloads%rowtype;
  v_existing public.testing_center_triage_results%rowtype;
  v_issue_id text;
  v_technical_fingerprint text;
  v_functional_fingerprint text;
  v_compatibility_digest text;
  v_effect_id text;
  v_version_family text;
  v_action_normalized text;
  v_expected_normalized text;
  v_observed_normalized text;
  v_technical_signature jsonb;
  v_created_at timestamptz := pg_catalog.now();
  v_occurrence_count bigint;
begin
  if p_report_id is null
    or p_report_id = ''
    or p_report_id ~ '^[[:space:]]|[[:space:]]$'
    or pg_catalog.octet_length(p_report_id) > 256 then
    raise exception 'testing_center_report_id_invalid' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('testing-center-triage-report:' || p_report_id, 0)
  );

  select report.* into v_report
  from public.testing_center_reports as report
  where report.report_id = p_report_id
  for update;

  if not found then
    raise exception 'testing_center_report_not_found' using errcode = 'P0002';
  end if;

  select triage.* into v_existing
  from public.testing_center_triage_results as triage
  where triage.report_id = p_report_id;

  if found then
    select count(*) into v_occurrence_count
    from public.testing_center_issue_occurrences as occurrence
    where occurrence.technical_issue_id = v_existing.technical_issue_id;

    select destination.active_effect_id into v_effect_id
    from public.testing_center_issue_destinations as destination
    where destination.technical_issue_id = v_existing.technical_issue_id;

    return query select
      p_report_id,
      v_existing.triage_state,
      v_existing.technical_issue_id,
      v_existing.technical_fingerprint,
      v_existing.functional_fingerprint,
      v_effect_id,
      true,
      coalesce(v_occurrence_count, 0);
    return;
  end if;

  if v_report.state <> 'submitted' then
    raise exception 'testing_center_report_not_submitted' using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.testing_center_pauses as pause
    where pause.scope = 'global' and pause.is_paused
  ) then
    raise exception 'testing_center_paused' using errcode = '55000';
  end if;

  select payload.* into v_payload
  from public.testing_center_report_payloads as payload
  where payload.report_id = p_report_id;

  if not found or not exists (
    select 1
    from public.testing_center_report_events as event
    where event.report_id = p_report_id and event.event_type = 'submitted'
  ) then
    update public.testing_center_reports
    set state = 'incomplete', updated_at = v_created_at
    where report_id = p_report_id;

    insert into public.testing_center_triage_results (
      report_id, triage_state, incomplete_reason, created_at
    ) values (
      p_report_id, 'incomplete', 'missing_server_context', v_created_at
    );

    return query select
      p_report_id, 'incomplete'::text, null::text, null::text, null::text,
      null::text, false, 0::bigint;
    return;
  end if;

  v_action_normalized := pg_catalog.lower(
    pg_catalog.regexp_replace(pg_catalog.btrim(v_payload.action_text), '[[:space:]]+', ' ', 'g')
  );
  v_expected_normalized := pg_catalog.lower(
    pg_catalog.regexp_replace(pg_catalog.btrim(v_payload.expected_text), '[[:space:]]+', ' ', 'g')
  );
  v_observed_normalized := pg_catalog.lower(
    pg_catalog.regexp_replace(pg_catalog.btrim(v_payload.observed_text), '[[:space:]]+', ' ', 'g')
  );
  v_version_family := coalesce(
    pg_catalog.substring(v_payload.app_version, '([0-9]+[.][0-9]+)'),
    pg_catalog.lower(v_payload.app_version)
  );

  v_functional_fingerprint := pg_catalog.encode(
    public.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'action', v_action_normalized,
          'module', v_payload.module,
          'versionFamily', v_version_family
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
  v_compatibility_digest := pg_catalog.encode(
    public.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'expected', v_expected_normalized,
          'observed', v_observed_normalized
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  if v_payload.include_diagnostic
    and nullif(v_payload.diagnostic_document->>'errorCode', '') is not null
    and v_payload.diagnostic_document->>'errorCode' not in (
      'tester.report', 'unknown', 'none'
    ) then
    select pg_catalog.jsonb_build_object(
      'channel', v_report.channel,
      'errorCode', v_payload.diagnostic_document->>'errorCode',
      'logCodes', coalesce(
        (
          select pg_catalog.jsonb_agg(code_key order by code_key)
          from (
            select distinct (item->>'source') || ':' || (item->>'code') as code_key
            from pg_catalog.jsonb_array_elements(v_payload.diagnostic_document->'logs') as item
            where item->>'level' in ('warn', 'error')
          ) as stable_codes
        ),
        '[]'::jsonb
      ),
      'module', v_payload.module
    ) into v_technical_signature;

    v_technical_fingerprint := pg_catalog.encode(
      public.digest(
        pg_catalog.convert_to(v_technical_signature::text, 'UTF8'),
        'sha256'
      ),
      'hex'
    );
  end if;

  -- The functional lock is always taken. It serializes diagnostic and
  -- non-diagnostic reports that may still be exact-compatible.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'testing-center-functional:' || v_functional_fingerprint || ':' || v_compatibility_digest,
      0
    )
  );
  if v_technical_fingerprint is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'testing-center-technical:' || v_technical_fingerprint,
        0
      )
    );
  end if;

  select issue.technical_issue_id into v_issue_id
  from public.testing_center_technical_issues as issue
  join public.testing_center_issue_occurrences as compatible_occurrence
    on compatible_occurrence.technical_issue_id = issue.technical_issue_id
  where issue.state = 'open'
    and (
      (
        v_technical_fingerprint is not null
        and compatible_occurrence.technical_fingerprint = v_technical_fingerprint
      )
      or (
        compatible_occurrence.functional_fingerprint = v_functional_fingerprint
        and compatible_occurrence.compatibility_digest = v_compatibility_digest
      )
    )
  order by
    case
      when v_technical_fingerprint is not null
        and compatible_occurrence.technical_fingerprint = v_technical_fingerprint
      then 0 else 1
    end,
    compatible_occurrence.created_at,
    issue.technical_issue_id
  limit 1
  for update of issue;

  if v_issue_id is not null and exists (
    select 1
    from public.testing_center_pauses as pause
    where pause.scope = 'flow'
      and pause.technical_issue_id = v_issue_id
      and pause.is_paused
  ) then
    raise exception 'testing_center_paused' using errcode = '55000';
  end if;

  if v_issue_id is null then
    v_issue_id := 'issue_' || pg_catalog.encode(
      public.digest(
        pg_catalog.convert_to('testing-center-issue:' || p_report_id, 'UTF8'),
        'sha256'
      ),
      'hex'
    );
    v_effect_id := 'effect_' || pg_catalog.encode(
      public.digest(
        pg_catalog.convert_to('linear-issue-create:' || v_issue_id, 'UTF8'),
        'sha256'
      ),
      'hex'
    );

    insert into public.testing_center_technical_issues (
      contract_version, technical_issue_id, report_id, state, flow_state,
      origin, retry_count, created_at, updated_at
    ) values (
      'testing-center.v1', v_issue_id, p_report_id, 'open', 'reported',
      'orchestrator', 0, v_created_at, v_created_at
    );

    insert into public.testing_center_issue_occurrences (
      report_id, technical_issue_id, is_primary, technical_fingerprint,
      functional_fingerprint, compatibility_digest, created_at
    ) values (
      p_report_id, v_issue_id, true, v_technical_fingerprint,
      v_functional_fingerprint, v_compatibility_digest, v_created_at
    );

    insert into public.testing_center_effect_outbox (
      effect_id, effect_key, effect_type, technical_issue_id,
      primary_report_id, state, attempt_count, created_at, updated_at
    ) values (
      v_effect_id, 'linear_issue_create:' || v_issue_id,
      'linear_issue_create', v_issue_id, p_report_id,
      'pending', 0, v_created_at, v_created_at
    );

    insert into public.testing_center_issue_destinations (
      technical_issue_id, destination, active_effect_id,
      decision_state, decision_reason, selected_at
    ) values (
      v_issue_id, 'linear', v_effect_id, 'selected', null, v_created_at
    );

    insert into public.testing_center_triage_results (
      report_id, triage_state, technical_issue_id, technical_fingerprint,
      functional_fingerprint, compatibility_digest, created_at
    ) values (
      p_report_id, 'issue_reserved', v_issue_id, v_technical_fingerprint,
      v_functional_fingerprint, v_compatibility_digest, v_created_at
    );

    update public.testing_center_reports
    set state = 'validated', updated_at = v_created_at
    where report_id = p_report_id;

    return query select
      p_report_id, 'issue_reserved'::text, v_issue_id,
      v_technical_fingerprint, v_functional_fingerprint, v_effect_id,
      false, 1::bigint;
    return;
  end if;

  insert into public.testing_center_issue_occurrences (
    report_id, technical_issue_id, is_primary, technical_fingerprint,
    functional_fingerprint, compatibility_digest, created_at
  ) values (
    p_report_id, v_issue_id, false, v_technical_fingerprint,
    v_functional_fingerprint, v_compatibility_digest, v_created_at
  );

  insert into public.testing_center_triage_results (
    report_id, triage_state, technical_issue_id, technical_fingerprint,
    functional_fingerprint, compatibility_digest, created_at
  ) values (
    p_report_id, 'duplicate_linked', v_issue_id, v_technical_fingerprint,
    v_functional_fingerprint, v_compatibility_digest, v_created_at
  );

  update public.testing_center_reports
  set state = 'duplicate_linked', updated_at = v_created_at
  where report_id = p_report_id;

  select count(*) into v_occurrence_count
  from public.testing_center_issue_occurrences as occurrence
  where occurrence.technical_issue_id = v_issue_id;

  select destination.active_effect_id into v_effect_id
  from public.testing_center_issue_destinations as destination
  where destination.technical_issue_id = v_issue_id;

  return query select
    p_report_id, 'duplicate_linked'::text, v_issue_id,
    v_technical_fingerprint, v_functional_fingerprint, v_effect_id,
    false, v_occurrence_count;
end;
$function$;
revoke all on function public.testing_center_triage_report(text) from public,anon,authenticated,service_role;
comment on function public.testing_center_triage_report(text) is 'TAU-07E explicit Linear reservation with deterministic exact-compatible triage.';
CREATE OR REPLACE FUNCTION public.testing_center_submit_report(p_contract_version text, p_channel text, p_action_text text, p_expected_text text, p_observed_text text, p_context_text text, p_app_version text, p_os_family text, p_os_version text, p_module text, p_include_diagnostic boolean, p_include_logs boolean, p_diagnostic_payload text, p_diagnostic_digest text, p_idempotency_key text)
 RETURNS TABLE(report_id text, report_state text, idempotent boolean, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_result record;
  v_transport_size integer;
begin
  select * into strict v_result
  from public.testing_center_submit_report_without_transport_size(
    p_contract_version, p_channel, p_action_text, p_expected_text,
    p_observed_text, p_context_text, p_app_version, p_os_family,
    p_os_version, p_module, p_include_diagnostic, p_include_logs,
    p_diagnostic_payload, p_diagnostic_digest, p_idempotency_key
  );

  if p_include_diagnostic then
    v_transport_size := pg_catalog.octet_length(p_diagnostic_payload);
    update public.testing_center_report_payloads as payload
    set diagnostic_transport_size = v_transport_size
    where payload.report_id = v_result.report_id
      and payload.diagnostic_transport_size is null;

    if exists (
      select 1
      from public.testing_center_report_payloads as payload
      where payload.report_id = v_result.report_id
        and payload.diagnostic_transport_size is distinct from v_transport_size
    ) then
      raise exception 'testing_center_diagnostic_size_conflict'
        using errcode = '23505';
    end if;
  end if;

  return query select v_result.report_id, v_result.report_state,
    v_result.idempotent, v_result.created_at;
end
$function$;
revoke all on function public.testing_center_submit_report(text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.testing_center_set_posthog_consent(p_report_id text, p_diagnostics_consent boolean, p_replay_consent boolean, p_idempotency_key text)
 RETURNS TABLE(result_consent_event_id text, result_revision integer, result_diagnostics_consent boolean, result_replay_consent boolean, result_idempotent boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := private.current_account();
  v_report public.testing_center_reports%rowtype;
  v_payload public.testing_center_report_payloads%rowtype;
  v_existing public.testing_center_posthog_consent_events%rowtype;
  v_latest public.testing_center_posthog_consent_events%rowtype;
  v_digest text;
  v_revision integer;
  v_event_id text;
begin
  if v_user_id is null then
    raise exception 'testing_center_posthog_auth_required' using errcode='42501';
  end if;
  if p_report_id !~ '^report_[0-9a-f]{64}$'
    or p_diagnostics_consent is null or p_replay_consent is null
    or p_replay_consent and not p_diagnostics_consent
    or p_idempotency_key is null or p_idempotency_key=''
    or pg_catalog.octet_length(p_idempotency_key)>256 then
    raise exception 'testing_center_posthog_consent_invalid' using errcode='22023';
  end if;
  select * into v_report from public.testing_center_reports
  where report_id=p_report_id for update;
  if not found or v_report.reporter_user_id<>v_user_id
    or v_report.channel not in ('nightly','testers') then
    raise exception 'testing_center_posthog_consent_forbidden' using errcode='42501';
  end if;
  select * into strict v_payload from public.testing_center_report_payloads
  where report_id=p_report_id;
  if p_diagnostics_consent and not v_payload.include_diagnostic then
    raise exception 'testing_center_posthog_diagnostic_not_previewed' using errcode='55000';
  end if;
  v_digest:=pg_catalog.encode(public.digest(pg_catalog.convert_to(
    p_report_id || pg_catalog.chr(31) || v_user_id::text || pg_catalog.chr(31)
    || p_diagnostics_consent::text || pg_catalog.chr(31)
    || p_replay_consent::text,'UTF8'),'sha256'),'hex');
  select * into v_existing from public.testing_center_posthog_consent_events
  where idempotency_key=p_idempotency_key;
  if found then
    if v_existing.report_id<>p_report_id
      or v_existing.operation_digest<>v_digest then
      raise exception 'testing_center_posthog_consent_conflict' using errcode='23505';
    end if;
    return query select v_existing.consent_event_id,v_existing.revision,
      v_existing.diagnostics_consent,v_existing.replay_consent,true;
    return;
  end if;
  select * into v_latest from public.testing_center_posthog_consent_events
  where report_id=p_report_id order by revision desc limit 1;
  if found and v_latest.diagnostics_consent=p_diagnostics_consent
    and v_latest.replay_consent=p_replay_consent then
    return query select v_latest.consent_event_id,v_latest.revision,
      v_latest.diagnostics_consent,v_latest.replay_consent,true;
    return;
  end if;
  v_revision:=coalesce(v_latest.revision,0)+1;
  v_event_id:='posthog_consent_' || pg_catalog.encode(public.digest(
    pg_catalog.convert_to(v_digest || pg_catalog.chr(31) || v_revision::text,
      'UTF8'),'sha256'),'hex');
  insert into public.testing_center_posthog_consent_events(
    consent_event_id,report_id,revision,actor_user_id,diagnostics_consent,
    replay_consent,idempotency_key,operation_digest
  ) values (
    v_event_id,p_report_id,v_revision,v_user_id,p_diagnostics_consent,
    p_replay_consent,p_idempotency_key,v_digest
  );
  if not p_diagnostics_consent then
    delete from public.testing_center_posthog_evidence where report_id=p_report_id;
  elsif not p_replay_consent then
    update public.testing_center_posthog_evidence
    set replay_consent=false,replay_available=false,replay_session_id=null,
      restricted_replay_url=null,replay_expires_at=null,
      linear_link_authorized=false,linear_link_authorized_by=null,
      linear_link_authorized_at=null
    where report_id=p_report_id;
  end if;
  return query select v_event_id,v_revision,p_diagnostics_consent,
    p_replay_consent,false;
end $function$;
revoke all on function public.testing_center_set_posthog_consent(text,boolean,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.testing_center_set_posthog_consent(text,boolean,boolean,text) to authenticated;
CREATE OR REPLACE FUNCTION public.testing_center_record_posthog_evidence(p_projection jsonb, p_canonical_projection text, p_projection_digest_source text, p_projection_digest text, p_transport_digest text)
 RETURNS TABLE(result_evidence_id text, result_replay_available boolean, result_idempotent boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_keys text[];
  v_report public.testing_center_reports%rowtype;
  v_payload public.testing_center_report_payloads%rowtype;
  v_consent public.testing_center_posthog_consent_events%rowtype;
  v_existing public.testing_center_posthog_evidence%rowtype;
  v_sha text;
  v_build_count integer;
  v_evidence_id text;
  v_replay boolean;
begin
  if pg_catalog.jsonb_typeof(p_projection)<>'object'
    or pg_catalog.octet_length(p_canonical_projection) not between 2 and 32768
    or pg_catalog.octet_length(p_projection_digest_source) not between 2 and 32768
    or p_projection_digest !~ '^[0-9a-f]{64}$'
    or p_transport_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'testing_center_posthog_projection_invalid' using errcode='22023';
  end if;
  begin
    if p_canonical_projection::jsonb is distinct from p_projection
      or p_projection_digest_source::jsonb is distinct from
        p_projection-'projectionDigest' then
      raise exception 'testing_center_posthog_projection_invalid' using errcode='22023';
    end if;
  exception when invalid_text_representation then
    raise exception 'testing_center_posthog_projection_invalid' using errcode='22023';
  end;
  if pg_catalog.encode(public.digest(pg_catalog.convert_to(
      p_canonical_projection,'UTF8'),'sha256'),'hex')<>p_transport_digest
    or pg_catalog.encode(public.digest(pg_catalog.convert_to(
      p_projection_digest_source,'UTF8'),'sha256'),'hex')<>p_projection_digest
    or p_projection->>'projectionDigest'<>p_projection_digest then
    raise exception 'testing_center_posthog_projection_digest_invalid' using errcode='22023';
  end if;
  select pg_catalog.array_agg(key order by key) into v_keys
  from pg_catalog.jsonb_object_keys(p_projection) keys(key);
  if v_keys is distinct from array[
      'appVersion','candidateSha','channel','contractVersion','correlationId',
      'diagnosticsConsent','errorName','errorRetentionDays','faultCode',
      'faultSource','module','noCodexAuthority','noLogs','noPersonProfile',
      'noPromotionAuthority','noRawMessage','noRawStack','operation','osFamily',
      'osRelease','projectionDigest','replayAvailable','replayConsent',
      'replayRetentionDays','replaySessionId','reportId','restrictedReplayUrl'
    ]::text[]
    or p_projection->>'contractVersion'<>'testing-center.posthog-evidence.v1'
    or p_projection->>'operation'<>'prepare_posthog_evidence'
    or p_projection->>'reportId' !~ '^report_[0-9a-f]{64}$'
    or p_projection->>'correlationId' !~ '^correlation_[0-9a-f]{64}$'
    or p_projection->>'channel' not in ('nightly','testers')
    or p_projection->>'appVersion' !~ '^[A-Za-z0-9][A-Za-z0-9._+-]{0,31}$'
    or p_projection->>'candidateSha' !~ '^[0-9a-f]{40}$'
    or p_projection->>'osFamily'<>'windows'
    or p_projection->>'osRelease' not in ('windows_10','windows_11')
    or p_projection->>'module' not in (
      'hub','launcher','settings','overlay_studio','overlay_runtime','telemetry',
      'telemetry_analysis','engineer','strategy','calendar','billing','account',
      'updater','testing_center')
    or p_projection->>'faultSource' not in ('frontend','backend')
    or p_projection->>'faultCode' not in (
      'frontend.unhandled.exception','frontend.operation.failed',
      'backend.operation.failed','testing_center.submit.failed')
    or p_projection->>'errorName' not in (
      'Error','AggregateError','RangeError','ReferenceError','SyntaxError',
      'TypeError','URIError','BackendFailure')
    or (p_projection->>'diagnosticsConsent')::boolean is not true
    or (p_projection->>'errorRetentionDays')::integer<>30
    or (p_projection->>'replayRetentionDays')::integer<>7
    or (p_projection->>'noPersonProfile')::boolean is not true
    or (p_projection->>'noRawMessage')::boolean is not true
    or (p_projection->>'noRawStack')::boolean is not true
    or (p_projection->>'noLogs')::boolean is not true
    or (p_projection->>'noCodexAuthority')::boolean is not true
    or (p_projection->>'noPromotionAuthority')::boolean is not true
    or (p_projection::text ~* 'https?://' and
      coalesce(p_projection->>'restrictedReplayUrl','') !~
        '^https://(eu|us)\.posthog\.com/project/[0-9]+/replay/[A-Za-z0-9_-]{16,64}$')
    then
    raise exception 'testing_center_posthog_projection_shape_invalid' using errcode='22023';
  end if;
  v_replay:=(p_projection->>'replayConsent')::boolean;
  if (p_projection->>'replayAvailable')::boolean is distinct from v_replay
    or (not v_replay and (p_projection->'replaySessionId'<>'null'::jsonb
      or p_projection->'restrictedReplayUrl'<>'null'::jsonb))
    or (v_replay and (p_projection->>'replaySessionId') !~ '^[A-Za-z0-9_-]{16,64}$')
    or (v_replay and (p_projection->>'restrictedReplayUrl') !~
      '^https://(eu|us)\.posthog\.com/project/[0-9]+/replay/[A-Za-z0-9_-]{16,64}$')
    or (v_replay and (p_projection->>'restrictedReplayUrl') not like
      ('%/' || (p_projection->>'replaySessionId'))) then
    raise exception 'testing_center_posthog_replay_invalid' using errcode='22023';
  end if;

  select * into v_report from public.testing_center_reports
  where report_id=p_projection->>'reportId' for update;
  if not found or v_report.channel<>p_projection->>'channel' then
    raise exception 'testing_center_posthog_report_invalid' using errcode='55000';
  end if;
  select * into strict v_payload from public.testing_center_report_payloads
  where report_id=v_report.report_id;
  select count(*),min(candidate_sha) into v_build_count,v_sha
  from public.testing_center_build_identities
  where channel=v_report.channel and app_version=v_payload.app_version and active;
  if v_build_count<>1 or v_sha<>p_projection->>'candidateSha'
    or v_payload.app_version<>p_projection->>'appVersion'
    or v_payload.os_family<>p_projection->>'osFamily'
    or v_payload.module<>p_projection->>'module'
    or (case when v_payload.os_version like 'Windows 10%' then 'windows_10'
      when v_payload.os_version like 'Windows 11%' then 'windows_11'
      else null end) is distinct from p_projection->>'osRelease' then
    raise exception 'testing_center_posthog_context_invalid' using errcode='55000';
  end if;
  select * into v_consent from public.testing_center_posthog_consent_events
  where report_id=v_report.report_id order by revision desc limit 1;
  if not found or not v_consent.diagnostics_consent
    or v_consent.replay_consent<>v_replay then
    raise exception 'testing_center_posthog_consent_required' using errcode='42501';
  end if;
  select * into v_existing from public.testing_center_posthog_evidence
  where correlation_id=p_projection->>'correlationId';
  if found then
    if v_existing.projection_digest<>p_projection_digest
      or v_existing.transport_digest<>p_transport_digest then
      raise exception 'testing_center_posthog_evidence_conflict' using errcode='23505';
    end if;
    return query select v_existing.evidence_id,v_existing.replay_available,true;
    return;
  end if;
  v_evidence_id:='posthog_' || p_projection_digest;
  insert into public.testing_center_posthog_evidence(
    evidence_id,report_id,correlation_id,channel,app_version,candidate_sha,
    os_family,os_release,module,fault_source,fault_code,error_name,
    replay_consent,replay_available,replay_session_id,restricted_replay_url,
    projection_digest,transport_digest,canonical_projection,error_expires_at,
    replay_expires_at
  ) values (
    v_evidence_id,v_report.report_id,p_projection->>'correlationId',v_report.channel,
    v_payload.app_version,v_sha,v_payload.os_family,p_projection->>'osRelease',
    v_payload.module,p_projection->>'faultSource',p_projection->>'faultCode',
    p_projection->>'errorName',v_replay,v_replay,
    case when v_replay then p_projection->>'replaySessionId' else null end,
    case when v_replay then p_projection->>'restrictedReplayUrl' else null end,
    p_projection_digest,p_transport_digest,p_projection,now()+interval '30 days',
    case when v_replay then now()+interval '7 days' else null end
  );
  return query select v_evidence_id,v_replay,false;
end $function$;
revoke all on function public.testing_center_record_posthog_evidence(jsonb,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.testing_center_record_posthog_evidence(jsonb,text,text,text,text) to service_role;
CREATE OR REPLACE FUNCTION public.testing_center_can_insert_evidence_object(p_bucket_id text, p_object_path text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p_bucket_id = 'testing-center-evidence' and exists (
    select 1
    from public.testing_center_screenshot_evidence as evidence
    join public.testing_center_evidence_batches as batch using(batch_id)
    where batch.reporter_user_id = private.current_account()
      and public.testing_center_can_view_channel(batch.channel)
      and batch.expires_at > pg_catalog.now()
      and batch.state in ('prepared','uploading','validating')
      and evidence.object_path = p_object_path
      and evidence.state = 'prepared'
  )
$function$;
revoke all on function public.testing_center_can_insert_evidence_object(text,text) from public,anon,authenticated,service_role;
grant execute on function public.testing_center_can_insert_evidence_object(text,text) to authenticated;
CREATE OR REPLACE FUNCTION public.testing_center_prepare_screenshot_batch(p_contract_version text, p_channel text, p_idempotency_key text, p_manifest jsonb)
 RETURNS TABLE(batch_id uuid, expires_at timestamp with time zone, state text, slots jsonb, idempotent boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := private.current_account();
  v_role text;
  v_manifest_digest text;
  v_batch_hex text;
  v_batch_id uuid;
  v_user_hash text;
  v_existing public.testing_center_evidence_batches%rowtype;
  v_created_at timestamptz := pg_catalog.now();
  v_item record;
  v_evidence_hex text;
  v_evidence_id uuid;
begin
  if v_user_id is null then
    raise exception 'testing_center_auth_required' using errcode='42501';
  end if;
  select membership.role into v_role
  from public.testing_center_memberships as membership
  where membership.user_id=v_user_id and membership.active;
  if not found then
    raise exception 'testing_center_membership_required' using errcode='42501';
  end if;
  if p_contract_version is distinct from 'testing-center.screenshot-evidence.v1' then
    raise exception 'testing_center_evidence_contract_invalid' using errcode='22023';
  end if;
  if p_channel='nightly' then
    if v_role not in ('primary_tester','owner') then
      raise exception 'testing_center_nightly_role_required' using errcode='42501';
    end if;
  elsif p_channel='testers' then
    if v_role not in ('tester','primary_tester','owner') then
      raise exception 'testing_center_testers_role_required' using errcode='42501';
    end if;
  else
    raise exception 'testing_center_channel_invalid' using errcode='22023';
  end if;
  if p_idempotency_key is null or p_idempotency_key=''
    or p_idempotency_key ~ '^[[:space:]]|[[:space:]]$'
    or pg_catalog.octet_length(p_idempotency_key)>256 then
    raise exception 'testing_center_idempotency_key_invalid' using errcode='22023';
  end if;
  if pg_catalog.jsonb_typeof(p_manifest) is distinct from 'array'
    or pg_catalog.jsonb_array_length(p_manifest) not between 1 and 10 then
    raise exception 'testing_center_evidence_manifest_invalid' using errcode='22023';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_manifest) with ordinality as manifest(item,ordinality)
    where pg_catalog.jsonb_typeof(item) <> 'object'
      or (select count(*) from pg_catalog.jsonb_object_keys(item)) <> 6
      or exists (
        select 1 from pg_catalog.jsonb_object_keys(item) as key
        where key not in ('position','mediaType','byteSize','sha256','width','height')
      )
      or pg_catalog.jsonb_typeof(item->'position') <> 'number'
      or item->>'position' !~ '^[1-9][0-9]*$'
      or (item->>'position')::numeric <> ordinality
      or pg_catalog.jsonb_typeof(item->'mediaType') <> 'string'
      or item->>'mediaType' not in ('image/png','image/jpeg')
      or pg_catalog.jsonb_typeof(item->'byteSize') <> 'number'
      or item->>'byteSize' !~ '^[1-9][0-9]*$'
      or (item->>'byteSize')::numeric not between 1 and 10485760
      or pg_catalog.jsonb_typeof(item->'sha256') <> 'string'
      or item->>'sha256' !~ '^[0-9a-f]{64}$'
      or pg_catalog.jsonb_typeof(item->'width') <> 'number'
      or item->>'width' !~ '^[1-9][0-9]*$'
      or (item->>'width')::numeric not between 1 and 16384
      or pg_catalog.jsonb_typeof(item->'height') <> 'number'
      or item->>'height' !~ '^[1-9][0-9]*$'
      or (item->>'height')::numeric not between 1 and 16384
      or (item->>'width')::numeric * (item->>'height')::numeric > 40000000
  ) or (
    select sum((item->>'byteSize')::numeric)
    from pg_catalog.jsonb_array_elements(p_manifest) as manifest(item)
  ) > 104857600 then
    raise exception 'testing_center_evidence_manifest_invalid' using errcode='22023';
  end if;

  v_manifest_digest := pg_catalog.encode(public.digest(
    pg_catalog.convert_to(p_manifest::text,'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || pg_catalog.chr(31) || p_idempotency_key,0));
  select * into v_existing
  from public.testing_center_evidence_batches as batch
  where batch.reporter_user_id=v_user_id and batch.idempotency_key=p_idempotency_key;
  if found then
    if v_existing.contract_version <> p_contract_version
      or v_existing.channel <> p_channel
      or v_existing.manifest_digest <> v_manifest_digest then
      raise exception 'testing_center_evidence_idempotency_conflict' using errcode='23505';
    end if;
    return query
    select v_existing.batch_id,v_existing.expires_at,v_existing.state,
      coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'position',evidence.position,'evidenceId',evidence.evidence_id,
        'objectPath',evidence.object_path,'mediaType',evidence.media_type,
        'byteSize',evidence.byte_size,'sha256',evidence.sha256,
        'width',evidence.width,'height',evidence.height,'state',evidence.state
      ) order by evidence.position),'[]'::jsonb),true
    from public.testing_center_screenshot_evidence as evidence
    where evidence.batch_id=v_existing.batch_id;
    return;
  end if;

  v_batch_hex := pg_catalog.encode(public.digest(pg_catalog.convert_to(
    'batch'||pg_catalog.chr(31)||v_user_id::text||pg_catalog.chr(31)||
    p_idempotency_key||pg_catalog.chr(31)||v_manifest_digest,'UTF8'),'sha256'),'hex');
  v_batch_id := (pg_catalog.substr(v_batch_hex,1,8)||'-'||pg_catalog.substr(v_batch_hex,9,4)||'-'||
    pg_catalog.substr(v_batch_hex,13,4)||'-'||pg_catalog.substr(v_batch_hex,17,4)||'-'||
    pg_catalog.substr(v_batch_hex,21,12))::uuid;
  v_user_hash := pg_catalog.substr(pg_catalog.encode(public.digest(
    pg_catalog.convert_to('reporter'||pg_catalog.chr(31)||v_user_id::text,'UTF8'),'sha256'),'hex'),1,32);
  insert into public.testing_center_evidence_batches(
    contract_version,batch_id,reporter_user_id,channel,idempotency_key,
    manifest_digest,state,expires_at,created_at,updated_at
  ) values (
    p_contract_version,v_batch_id,v_user_id,p_channel,p_idempotency_key,
    v_manifest_digest,'prepared',v_created_at+interval '24 hours',v_created_at,v_created_at
  );
  for v_item in
    select item,ordinality
    from pg_catalog.jsonb_array_elements(p_manifest) with ordinality as manifest(item,ordinality)
    order by ordinality
  loop
    v_evidence_hex := pg_catalog.encode(public.digest(pg_catalog.convert_to(
      'evidence'||pg_catalog.chr(31)||v_batch_id::text||pg_catalog.chr(31)||v_item.ordinality::text,
      'UTF8'),'sha256'),'hex');
    v_evidence_id := (pg_catalog.substr(v_evidence_hex,1,8)||'-'||pg_catalog.substr(v_evidence_hex,9,4)||'-'||
      pg_catalog.substr(v_evidence_hex,13,4)||'-'||pg_catalog.substr(v_evidence_hex,17,4)||'-'||
      pg_catalog.substr(v_evidence_hex,21,12))::uuid;
    insert into public.testing_center_screenshot_evidence(
      contract_version,evidence_id,batch_id,position,object_path,media_type,
      byte_size,sha256,width,height,state,created_at,updated_at
    ) values (
      p_contract_version,v_evidence_id,v_batch_id,v_item.ordinality,
      'v1/'||v_user_hash||'/'||v_batch_id::text||'/'||v_evidence_id::text,
      v_item.item->>'mediaType',(v_item.item->>'byteSize')::integer,
      v_item.item->>'sha256',(v_item.item->>'width')::integer,
      (v_item.item->>'height')::integer,'prepared',v_created_at,v_created_at
    );
  end loop;
  return query
  select batch.batch_id,batch.expires_at,batch.state,
    pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'position',evidence.position,'evidenceId',evidence.evidence_id,
      'objectPath',evidence.object_path,'mediaType',evidence.media_type,
      'byteSize',evidence.byte_size,'sha256',evidence.sha256,
      'width',evidence.width,'height',evidence.height,'state',evidence.state
    ) order by evidence.position),false
  from public.testing_center_evidence_batches as batch
  join public.testing_center_screenshot_evidence as evidence using(batch_id)
  where batch.batch_id=v_batch_id
  group by batch.batch_id,batch.expires_at,batch.state;
end
$function$;
revoke all on function public.testing_center_prepare_screenshot_batch(text,text,text,jsonb) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.testing_center_finalize_screenshot(p_batch_id uuid, p_evidence_id uuid)
 RETURNS TABLE(evidence_id uuid, state text, idempotent boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := private.current_account();
  v_evidence public.testing_center_screenshot_evidence%rowtype;
  v_batch public.testing_center_evidence_batches%rowtype;
  v_job_hex text;
  v_job_id uuid;
begin
  if v_user_id is null then
    raise exception 'testing_center_auth_required' using errcode='42501';
  end if;
  select * into v_batch
  from public.testing_center_evidence_batches as batch
  where batch.batch_id=p_batch_id
  for update;
  if not found or v_batch.reporter_user_id <> v_user_id then
    raise exception 'testing_center_evidence_owner_required' using errcode='42501';
  end if;
  if not public.testing_center_can_view_channel(v_batch.channel) then
    raise exception 'testing_center_evidence_channel_role_required' using errcode='42501';
  end if;
  select evidence.* into v_evidence
  from public.testing_center_screenshot_evidence as evidence
  where evidence.evidence_id=p_evidence_id and evidence.batch_id=p_batch_id
  for update;
  if not found then
    raise exception 'testing_center_evidence_not_found' using errcode='42501';
  end if;
  if v_evidence.state in ('uploaded','validating') and exists(
    select 1 from public.testing_center_evidence_outbox as job
    where job.evidence_id=p_evidence_id and job.kind='validate'
  ) then
    return query select v_evidence.evidence_id,v_evidence.state,true;
    return;
  end if;
  if v_evidence.state <> 'prepared'
    or v_batch.state not in ('prepared','uploading')
    or v_batch.expires_at <= pg_catalog.now() then
    raise exception 'testing_center_evidence_state_invalid' using errcode='55000';
  end if;
  if not exists(
    select 1 from storage.objects as object
    where object.bucket_id='testing-center-evidence'
      and object.name=v_evidence.object_path
      and object.owner_id::text=v_user_id::text
  ) then
    raise exception 'testing_center_evidence_object_missing' using errcode='55000';
  end if;
  v_job_hex := pg_catalog.encode(public.digest(pg_catalog.convert_to(
    'validate'||pg_catalog.chr(31)||p_evidence_id::text,'UTF8'),'sha256'),'hex');
  v_job_id := (pg_catalog.substr(v_job_hex,1,8)||'-'||pg_catalog.substr(v_job_hex,9,4)||'-'||
    pg_catalog.substr(v_job_hex,13,4)||'-'||pg_catalog.substr(v_job_hex,17,4)||'-'||
    pg_catalog.substr(v_job_hex,21,12))::uuid;
  insert into public.testing_center_evidence_outbox(job_id,evidence_id,kind)
  values(v_job_id,p_evidence_id,'validate')
  on conflict on constraint testing_center_evidence_outbox_evidence_kind_key do nothing;
  update public.testing_center_screenshot_evidence
  set state='uploaded',updated_at=pg_catalog.now()
  where testing_center_screenshot_evidence.evidence_id=p_evidence_id;

  if exists (
    select 1
    from public.testing_center_screenshot_evidence as evidence
    where evidence.batch_id=p_batch_id and evidence.state='prepared'
  ) then
    update public.testing_center_evidence_batches as batch
    set state='uploading',updated_at=pg_catalog.now()
    where batch.batch_id=p_batch_id
      and batch.state in ('prepared','uploading');
    return query select p_evidence_id,'uploaded'::text,false;
    return;
  end if;

  update public.testing_center_screenshot_evidence as evidence
  set state='validating',updated_at=pg_catalog.now()
  where evidence.batch_id=p_batch_id and evidence.state='uploaded';
  update public.testing_center_evidence_batches as batch
  set state='validating',updated_at=pg_catalog.now()
  where batch.batch_id=p_batch_id
    and batch.state in ('prepared','uploading');
  return query select p_evidence_id,'validating'::text,false;
end
$function$;
revoke all on function public.testing_center_finalize_screenshot(uuid,uuid) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.testing_center_submit_report_with_evidence(p_contract_version text, p_channel text, p_action_text text, p_expected_text text, p_observed_text text, p_context_text text, p_app_version text, p_os_family text, p_os_version text, p_module text, p_include_diagnostic boolean, p_include_logs boolean, p_diagnostic_payload text, p_diagnostic_digest text, p_idempotency_key text, p_batch_id uuid)
 RETURNS TABLE(report_id text, report_state text, idempotent boolean, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := private.current_account();
  v_batch public.testing_center_evidence_batches%rowtype;
  v_internal_key text;
  v_digests text;
  v_result record;
  v_slot_count integer;
begin
  if v_user_id is null then
    raise exception 'testing_center_auth_required' using errcode='42501';
  end if;
  select * into v_batch from public.testing_center_evidence_batches as batch
  where batch.batch_id=p_batch_id for update;
  if not found or v_batch.reporter_user_id <> v_user_id then
    raise exception 'testing_center_evidence_owner_required' using errcode='42501';
  end if;
  if v_batch.channel <> p_channel then
    raise exception 'testing_center_evidence_channel_conflict' using errcode='23505';
  end if;
  if v_batch.idempotency_key <> p_idempotency_key then
    raise exception 'testing_center_evidence_idempotency_conflict' using errcode='23505';
  end if;
  select count(*),pg_catalog.string_agg(evidence.sha256,',' order by evidence.position)
  into v_slot_count,v_digests
  from public.testing_center_screenshot_evidence as evidence
  where evidence.batch_id=p_batch_id;
  if v_slot_count not between 1 and 10 or exists(
    select 1 from public.testing_center_screenshot_evidence as evidence
    where evidence.batch_id=p_batch_id and evidence.state <> 'ready'
  ) or v_batch.state not in ('ready','attached') then
    raise exception 'testing_center_evidence_not_ready' using errcode='55000';
  end if;
  v_internal_key := 'evidence:'||pg_catalog.encode(public.digest(pg_catalog.convert_to(
    p_idempotency_key||pg_catalog.chr(31)||v_digests,'UTF8'),'sha256'),'hex');
  select * into strict v_result from public.testing_center_submit_report(
    p_contract_version,p_channel,p_action_text,p_expected_text,p_observed_text,
    p_context_text,p_app_version,p_os_family,p_os_version,p_module,
    p_include_diagnostic,p_include_logs,p_diagnostic_payload,p_diagnostic_digest,
    v_internal_key
  );
  if v_batch.state='attached' then
    if exists(
      select 1 from public.testing_center_screenshot_evidence as evidence
      where evidence.batch_id=p_batch_id and evidence.report_id is distinct from v_result.report_id
    ) then
      raise exception 'testing_center_evidence_attachment_conflict' using errcode='23505';
    end if;
    return query select v_result.report_id,v_result.report_state,true,v_result.created_at;
    return;
  end if;
  insert into public.testing_center_evidence(contract_version,evidence_id,report_id,kind,digest)
  select 'testing-center.v1',
    'screenshot_'||pg_catalog.encode(public.digest(pg_catalog.convert_to(
      v_result.report_id||pg_catalog.chr(31)||evidence.sha256,'UTF8'),'sha256'),'hex'),
    v_result.report_id,'screenshot',evidence.sha256
  from public.testing_center_screenshot_evidence as evidence
  where evidence.batch_id=p_batch_id
  group by evidence.sha256
  on conflict on constraint testing_center_evidence_report_id_kind_digest_key
  do nothing;
  update public.testing_center_screenshot_evidence
  set report_id=v_result.report_id,updated_at=pg_catalog.now()
  where batch_id=p_batch_id;
  update public.testing_center_evidence_batches
  set state='attached',updated_at=pg_catalog.now()
  where batch_id=p_batch_id;
  return query select v_result.report_id,v_result.report_state,v_result.idempotent,v_result.created_at;
end
$function$;
revoke all on function public.testing_center_submit_report_with_evidence(text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text,uuid) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.testing_center_report_submit_admitted(p_account uuid, p_contract_version text, p_channel text, p_action_text text, p_expected_text text, p_observed_text text, p_context_text text, p_app_version text, p_os_family text, p_os_version text, p_module text, p_include_diagnostic boolean, p_include_logs boolean, p_diagnostic_payload text, p_diagnostic_digest text, p_idempotency_key text, p_batch_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(report_id text, report_state text, idempotent boolean, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- F7=C: tester prose/diagnostics stay local, including service callers.
  if p_action_text is distinct from 'Informe estructurado'
    or p_expected_text is distinct from 'Revisión humana pendiente'
    or p_observed_text is distinct from 'Revisión humana pendiente'
    or p_context_text is distinct from ''
    or p_include_diagnostic is distinct from false
    or p_include_logs is distinct from false
    or p_diagnostic_payload is not null or p_diagnostic_digest is not null then
    raise sqlstate '22023' using message='testing_report_privacy_required';
  end if;
  if p_batch_id is null then
    return query select * from private.testing_center_report_for_account(p_account,p_contract_version,p_channel,p_action_text,p_expected_text,p_observed_text,p_context_text,p_app_version,p_os_family,p_os_version,p_module,p_include_diagnostic,p_include_logs,p_diagnostic_payload,p_diagnostic_digest,p_idempotency_key);
  else
    return query select * from private.testing_center_report_evidence_for_account(p_account,p_contract_version,p_channel,p_action_text,p_expected_text,p_observed_text,p_context_text,p_app_version,p_os_family,p_os_version,p_module,p_include_diagnostic,p_include_logs,p_diagnostic_payload,p_diagnostic_digest,p_idempotency_key,p_batch_id);
  end if;
end $function$;
revoke all on function public.testing_center_report_submit_admitted(uuid,text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text,uuid) from public,anon,authenticated,service_role;

create policy testing_center_evidence_insert_own_slot on storage.objects
  for insert to authenticated
  with check (public.testing_center_can_insert_evidence_object(bucket_id,name));
-- Restore every retained account barrier from the pre-closure catalog.
alter table public.testing_center_technical_issues
  drop constraint testing_center_technical_issue_no_legacy_report_id,
  drop constraint testing_center_issue_has_v2_lineage;
alter table public.testing_center_technical_issues
  add constraint testing_center_issue_one_report
  check ((report_id is null) <> (contribution_id is null));
drop trigger if exists a_account_write_barrier on public.testing_center_agent_audit;
CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_agent_audit FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.testing_center_agent_jobs p4 cross join lateral (select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=(to_jsonb(p4)->>''technical_issue_id'')::text) a(account) where p4.job_key=($1->>''job_key'')::text) owners(account)', 'select ($1->>''job_key'' is not null and not exists(select 1 from public.testing_center_agent_jobs p where p.job_key=($1->>''job_key'')::text))');
drop trigger if exists a_account_write_barrier on public.testing_center_agent_callbacks;
CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_agent_callbacks FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.testing_center_agent_jobs p4 cross join lateral (select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=(to_jsonb(p4)->>''technical_issue_id'')::text) a(account) where p4.job_key=($1->>''job_key'')::text) owners(account)', 'select ($1->>''job_key'' is not null and not exists(select 1 from public.testing_center_agent_jobs p where p.job_key=($1->>''job_key'')::text))');
drop trigger if exists a_account_write_barrier on public.testing_center_agent_effect_outbox;
CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_agent_effect_outbox FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.testing_center_agent_jobs p4 cross join lateral (select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=(to_jsonb(p4)->>''technical_issue_id'')::text) a(account) where p4.job_key=($1->>''job_key'')::text) owners(account)', 'select ($1->>''job_key'' is not null and not exists(select 1 from public.testing_center_agent_jobs p where p.job_key=($1->>''job_key'')::text))');
drop trigger if exists a_account_write_barrier on public.testing_center_agent_jobs;
CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_agent_jobs FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=($1->>''technical_issue_id'')::text) owners(account)', 'select ($1->>''technical_issue_id'' is not null and not exists(select 1 from public.testing_center_technical_issues p where p.technical_issue_id=($1->>''technical_issue_id'')::text))');
drop trigger if exists a_account_write_barrier on public.testing_center_agent_phase_callbacks;
CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_agent_phase_callbacks FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.testing_center_agent_jobs p4 cross join lateral (select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=(to_jsonb(p4)->>''technical_issue_id'')::text) a(account) where p4.job_key=($1->>''job_key'')::text) owners(account)', 'select ($1->>''job_key'' is not null and not exists(select 1 from public.testing_center_agent_jobs p where p.job_key=($1->>''job_key'')::text))');
drop trigger if exists a_account_write_barrier on public.testing_center_agent_reservations;
CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_agent_reservations FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.testing_center_agent_jobs p4 cross join lateral (select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=(to_jsonb(p4)->>''technical_issue_id'')::text) a(account) where p4.job_key=($1->>''job_key'')::text) owners(account)', 'select ($1->>''job_key'' is not null and not exists(select 1 from public.testing_center_agent_jobs p where p.job_key=($1->>''job_key'')::text))');
drop trigger if exists a_account_write_barrier on public.testing_center_audit;
CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_audit FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''actor_user_id'')::uuid union
        select r.reporter_user_id from public.testing_center_reports r
        left join public.testing_center_technical_issues i on i.report_id=r.report_id
        where $1->>''aggregate_id'' in (r.report_id,i.technical_issue_id)) owners(account)', 'select ($1->>''actor_user_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''actor_user_id'')::uuid))');
drop trigger if exists a_account_write_barrier on public.testing_center_candidate_builds;
CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_candidate_builds FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=($1->>''technical_issue_id'')::text) owners(account)', 'select ($1->>''technical_issue_id'' is not null and not exists(select 1 from public.testing_center_technical_issues p where p.technical_issue_id=($1->>''technical_issue_id'')::text))');
drop trigger if exists a_account_write_barrier on public.testing_center_codex_dossier_snapshots;
CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_codex_dossier_snapshots FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.testing_center_validation_snapshots p3 cross join lateral (select a.account from public.testing_center_validations p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''actor_user_id'')::uuid) a(account) where p2.validation_id=(to_jsonb(p3)->>''validation_id'')::text) a(account) where p3.validation_id=($1->>''rejection_validation_id'')::text union select a.account from public.testing_center_candidate_builds p4 cross join lateral (select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=(to_jsonb(p4)->>''technical_issue_id'')::text) a(account) where p4.candidate_id=($1->>''candidate_id'')::text and p4.channel=($1->>''channel'')::text and p4.exact_sha=($1->>''candidate_sha'')::text union select a.account from public.testing_center_validation_snapshots p4 cross join lateral (select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=(to_jsonb(p4)->>''technical_issue_id'')::text) a(account) where p4.validation_id=($1->>''rejection_validation_id'')::text union select a.account from public.testing_center_validation_snapshots p6 cross join lateral (select a.account from public.testing_center_validations p5 cross join lateral (select a.account from public.testing_center_candidate_builds p4 cross join lateral (select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=(to_jsonb(p4)->>''technical_issue_id'')::text) a(account) where p4.candidate_id=(to_jsonb(p5)->>''candidate_id'')::text and p4.channel=(to_jsonb(p5)->>''channel'')::text and p4.exact_sha=(to_jsonb(p5)->>''exact_sha'')::text and p4.author_id=(to_jsonb(p5)->>''candidate_author_id'')::text) a(account) where p5.validation_id=(to_jsonb(p6)->>''validation_id'')::text) a(account) where p6.validation_id=($1->>''rejection_validation_id'')::text union select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=($1->>''technical_issue_id'')::text union select a.account from public.testing_center_validation_snapshots p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''actor_user_id'')::uuid) a(account) where p2.validation_id=($1->>''rejection_validation_id'')::text union select a.account from public.testing_center_validation_snapshots p5 cross join lateral (select a.account from public.testing_center_candidate_builds p4 cross join lateral (select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=(to_jsonb(p4)->>''technical_issue_id'')::text) a(account) where p4.candidate_id=(to_jsonb(p5)->>''candidate_id'')::text and p4.channel=(to_jsonb(p5)->>''channel'')::text and p4.exact_sha=(to_jsonb(p5)->>''candidate_sha'')::text) a(account) where p5.validation_id=($1->>''rejection_validation_id'')::text) owners(account)', 'select ($1->>''rejection_validation_id'' is not null and not exists(select 1 from public.testing_center_validation_snapshots p where p.validation_id=($1->>''rejection_validation_id'')::text)) or ($1->>''technical_issue_id'' is not null and not exists(select 1 from public.testing_center_technical_issues p where p.technical_issue_id=($1->>''technical_issue_id'')::text)) or ($1->>''candidate_id'' is not null and $1->>''channel'' is not null and $1->>''candidate_sha'' is not null and not exists(select 1 from public.testing_center_candidate_builds p where p.candidate_id=($1->>''candidate_id'')::text and p.channel=($1->>''channel'')::text and p.exact_sha=($1->>''candidate_sha'')::text))');
drop trigger if exists a_account_write_barrier on public.testing_center_codex_execution_control;
CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_codex_execution_control FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=($1->>''technical_issue_id'')::text union select a.account from public.testing_center_codex_runs p4 cross join lateral (select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=(to_jsonb(p4)->>''technical_issue_id'')::text) a(account) where p4.run_id=($1->>''run_id'')::text) owners(account)', 'select ($1->>''technical_issue_id'' is not null and not exists(select 1 from public.testing_center_technical_issues p where p.technical_issue_id=($1->>''technical_issue_id'')::text)) or ($1->>''run_id'' is not null and not exists(select 1 from public.testing_center_codex_runs p where p.run_id=($1->>''run_id'')::text))');
drop trigger if exists a_account_write_barrier on public.testing_center_codex_runs;
CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_codex_runs FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=($1->>''technical_issue_id'')::text) owners(account)', 'select ($1->>''technical_issue_id'' is not null and not exists(select 1 from public.testing_center_technical_issues p where p.technical_issue_id=($1->>''technical_issue_id'')::text))');
drop trigger if exists a_account_write_barrier on public.testing_center_effect_outbox;
CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_effect_outbox FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=($1->>''technical_issue_id'')::text union select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=($1->>''primary_report_id'')::text) owners(account)', 'select ($1->>''technical_issue_id'' is not null and not exists(select 1 from public.testing_center_technical_issues p where p.technical_issue_id=($1->>''technical_issue_id'')::text)) or ($1->>''primary_report_id'' is not null and not exists(select 1 from public.testing_center_reports p where p.report_id=($1->>''primary_report_id'')::text))');
drop trigger if exists a_account_write_barrier on public.testing_center_effect_supersessions;
CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_effect_supersessions FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.testing_center_effect_outbox p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''primary_report_id'')::text) a(account) where p3.effect_id=($1->>''legacy_effect_id'')::text union select a.account from public.testing_center_effect_outbox p4 cross join lateral (select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=(to_jsonb(p4)->>''technical_issue_id'')::text) a(account) where p4.effect_id=($1->>''legacy_effect_id'')::text union select a.account from public.testing_center_effect_outbox p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''primary_report_id'')::text) a(account) where p3.effect_id=($1->>''superseded_by_effect_id'')::text union select a.account from public.testing_center_effect_outbox p4 cross join lateral (select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=(to_jsonb(p4)->>''technical_issue_id'')::text) a(account) where p4.effect_id=($1->>''superseded_by_effect_id'')::text) owners(account)', 'select ($1->>''legacy_effect_id'' is not null and not exists(select 1 from public.testing_center_effect_outbox p where p.effect_id=($1->>''legacy_effect_id'')::text)) or ($1->>''superseded_by_effect_id'' is not null and not exists(select 1 from public.testing_center_effect_outbox p where p.effect_id=($1->>''superseded_by_effect_id'')::text))');
drop trigger if exists a_account_write_barrier on public.testing_center_idempotency;
CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_idempotency FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (
        select r.reporter_user_id from public.testing_center_reports r
        left join public.testing_center_technical_issues i on i.report_id=r.report_id
        where $1->>''aggregate_id'' in (r.report_id,i.technical_issue_id)) owners(account)', 'select false');
drop trigger if exists a_account_write_barrier on public.testing_center_issue_destinations;
CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_issue_destinations FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.testing_center_effect_outbox p4 cross join lateral (select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=(to_jsonb(p4)->>''technical_issue_id'')::text) a(account) where p4.effect_id=($1->>''active_effect_id'')::text union select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=($1->>''technical_issue_id'')::text union select a.account from public.testing_center_effect_outbox p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''primary_report_id'')::text) a(account) where p3.effect_id=($1->>''active_effect_id'')::text) owners(account)', 'select ($1->>''technical_issue_id'' is not null and not exists(select 1 from public.testing_center_technical_issues p where p.technical_issue_id=($1->>''technical_issue_id'')::text)) or ($1->>''active_effect_id'' is not null and not exists(select 1 from public.testing_center_effect_outbox p where p.effect_id=($1->>''active_effect_id'')::text))');
drop trigger if exists a_account_write_barrier on public.testing_center_linear_issue_bindings;
CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_linear_issue_bindings FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.testing_center_effect_outbox p4 cross join lateral (select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=(to_jsonb(p4)->>''technical_issue_id'')::text) a(account) where p4.effect_id=($1->>''effect_id'')::text union select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=($1->>''technical_issue_id'')::text union select a.account from public.testing_center_effect_outbox p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''primary_report_id'')::text) a(account) where p3.effect_id=($1->>''effect_id'')::text) owners(account)', 'select ($1->>''technical_issue_id'' is not null and not exists(select 1 from public.testing_center_technical_issues p where p.technical_issue_id=($1->>''technical_issue_id'')::text)) or ($1->>''effect_id'' is not null and not exists(select 1 from public.testing_center_effect_outbox p where p.effect_id=($1->>''effect_id'')::text))');
drop trigger if exists a_account_write_barrier on public.testing_center_linear_projection_snapshots;
CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_linear_projection_snapshots FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.testing_center_effect_outbox p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''primary_report_id'')::text) a(account) where p3.effect_id=($1->>''effect_id'')::text union select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=($1->>''primary_report_id'')::text union select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=($1->>''technical_issue_id'')::text union select a.account from public.testing_center_effect_outbox p4 cross join lateral (select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=(to_jsonb(p4)->>''technical_issue_id'')::text) a(account) where p4.effect_id=($1->>''effect_id'')::text) owners(account)', 'select ($1->>''effect_id'' is not null and not exists(select 1 from public.testing_center_effect_outbox p where p.effect_id=($1->>''effect_id'')::text)) or ($1->>''technical_issue_id'' is not null and not exists(select 1 from public.testing_center_technical_issues p where p.technical_issue_id=($1->>''technical_issue_id'')::text)) or ($1->>''primary_report_id'' is not null and not exists(select 1 from public.testing_center_reports p where p.report_id=($1->>''primary_report_id'')::text))');
drop trigger if exists a_account_write_barrier on public.testing_center_linear_reconciliations;
CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_linear_reconciliations FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.testing_center_linear_issue_bindings p5 cross join lateral (select a.account from public.testing_center_effect_outbox p4 cross join lateral (select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=(to_jsonb(p4)->>''technical_issue_id'')::text) a(account) where p4.effect_id=(to_jsonb(p5)->>''effect_id'')::text) a(account) where p5.external_issue_id=($1->>''external_issue_id'')::uuid union select a.account from public.testing_center_effect_outbox p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''primary_report_id'')::text) a(account) where p3.effect_id=($1->>''effect_id'')::text union select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=($1->>''technical_issue_id'')::text union select a.account from public.testing_center_linear_issue_bindings p4 cross join lateral (select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=(to_jsonb(p4)->>''technical_issue_id'')::text) a(account) where p4.external_issue_id=($1->>''external_issue_id'')::uuid union select a.account from public.testing_center_effect_outbox p4 cross join lateral (select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=(to_jsonb(p4)->>''technical_issue_id'')::text) a(account) where p4.effect_id=($1->>''effect_id'')::text union select a.account from public.testing_center_linear_issue_bindings p4 cross join lateral (select a.account from public.testing_center_effect_outbox p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''primary_report_id'')::text) a(account) where p3.effect_id=(to_jsonb(p4)->>''effect_id'')::text) a(account) where p4.external_issue_id=($1->>''external_issue_id'')::uuid) owners(account)', 'select ($1->>''technical_issue_id'' is not null and not exists(select 1 from public.testing_center_technical_issues p where p.technical_issue_id=($1->>''technical_issue_id'')::text)) or ($1->>''effect_id'' is not null and not exists(select 1 from public.testing_center_effect_outbox p where p.effect_id=($1->>''effect_id'')::text)) or ($1->>''external_issue_id'' is not null and not exists(select 1 from public.testing_center_linear_issue_bindings p where p.external_issue_id=($1->>''external_issue_id'')::uuid))');
drop trigger if exists a_account_write_barrier on public.testing_center_linear_webhook_deliveries;
CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_linear_webhook_deliveries FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.testing_center_linear_issue_bindings p4 cross join lateral (select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=(to_jsonb(p4)->>''technical_issue_id'')::text) a(account) where p4.external_issue_id=($1->>''external_issue_id'')::uuid union select a.account from public.testing_center_linear_issue_bindings p5 cross join lateral (select a.account from public.testing_center_effect_outbox p4 cross join lateral (select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=(to_jsonb(p4)->>''technical_issue_id'')::text) a(account) where p4.effect_id=(to_jsonb(p5)->>''effect_id'')::text) a(account) where p5.external_issue_id=($1->>''external_issue_id'')::uuid union select a.account from public.testing_center_linear_issue_bindings p4 cross join lateral (select a.account from public.testing_center_effect_outbox p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''primary_report_id'')::text) a(account) where p3.effect_id=(to_jsonb(p4)->>''effect_id'')::text) a(account) where p4.external_issue_id=($1->>''external_issue_id'')::uuid) owners(account)', 'select ($1->>''external_issue_id'' is not null and not exists(select 1 from public.testing_center_linear_issue_bindings p where p.external_issue_id=($1->>''external_issue_id'')::uuid))');
drop trigger if exists a_account_write_barrier on public.testing_center_owner_dispositions;
CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_owner_dispositions FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.testing_center_codex_dossier_snapshots p5 cross join lateral (select a.account from public.testing_center_candidate_builds p4 cross join lateral (select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=(to_jsonb(p4)->>''technical_issue_id'')::text) a(account) where p4.candidate_id=(to_jsonb(p5)->>''candidate_id'')::text and p4.channel=(to_jsonb(p5)->>''channel'')::text and p4.exact_sha=(to_jsonb(p5)->>''candidate_sha'')::text) a(account) where p5.dossier_digest=($1->>''dossier_digest'')::text union select a.account from public.testing_center_validation_snapshots p5 cross join lateral (select a.account from public.testing_center_candidate_builds p4 cross join lateral (select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=(to_jsonb(p4)->>''technical_issue_id'')::text) a(account) where p4.candidate_id=(to_jsonb(p5)->>''candidate_id'')::text and p4.channel=(to_jsonb(p5)->>''channel'')::text and p4.exact_sha=(to_jsonb(p5)->>''candidate_sha'')::text) a(account) where p5.validation_id=($1->>''rejection_validation_id'')::text union select a.account from public.testing_center_validation_snapshots p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''actor_user_id'')::uuid) a(account) where p2.validation_id=($1->>''rejection_validation_id'')::text union select a.account from public.testing_center_codex_dossier_snapshots p5 cross join lateral (select a.account from public.testing_center_validation_snapshots p4 cross join lateral (select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=(to_jsonb(p4)->>''technical_issue_id'')::text) a(account) where p4.validation_id=(to_jsonb(p5)->>''rejection_validation_id'')::text) a(account) where p5.dossier_digest=($1->>''dossier_digest'')::text union select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=($1->>''technical_issue_id'')::text union select a.account from public.testing_center_validation_snapshots p6 cross join lateral (select a.account from public.testing_center_validations p5 cross join lateral (select a.account from public.testing_center_candidate_builds p4 cross join lateral (select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=(to_jsonb(p4)->>''technical_issue_id'')::text) a(account) where p4.candidate_id=(to_jsonb(p5)->>''candidate_id'')::text and p4.channel=(to_jsonb(p5)->>''channel'')::text and p4.exact_sha=(to_jsonb(p5)->>''exact_sha'')::text and p4.author_id=(to_jsonb(p5)->>''candidate_author_id'')::text) a(account) where p5.validation_id=(to_jsonb(p6)->>''validation_id'')::text) a(account) where p6.validation_id=($1->>''rejection_validation_id'')::text union select a.account from public.testing_center_codex_dossier_snapshots p4 cross join lateral (select a.account from public.testing_center_validation_snapshots p3 cross join lateral (select a.account from public.testing_center_validations p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''actor_user_id'')::uuid) a(account) where p2.validation_id=(to_jsonb(p3)->>''validation_id'')::text) a(account) where p3.validation_id=(to_jsonb(p4)->>''rejection_validation_id'')::text) a(account) where p4.dossier_digest=($1->>''dossier_digest'')::text union select a.account from public.testing_center_validation_snapshots p3 cross join lateral (select a.account from public.testing_center_validations p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''actor_user_id'')::uuid) a(account) where p2.validation_id=(to_jsonb(p3)->>''validation_id'')::text) a(account) where p3.validation_id=($1->>''rejection_validation_id'')::text union select a.account from public.testing_center_codex_dossier_snapshots p3 cross join lateral (select a.account from public.testing_center_validation_snapshots p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''actor_user_id'')::uuid) a(account) where p2.validation_id=(to_jsonb(p3)->>''rejection_validation_id'')::text) a(account) where p3.dossier_digest=($1->>''dossier_digest'')::text union select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''actor_user_id'')::uuid union select a.account from public.testing_center_codex_dossier_snapshots p6 cross join lateral (select a.account from public.testing_center_validation_snapshots p5 cross join lateral (select a.account from public.testing_center_candidate_builds p4 cross join lateral (select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=(to_jsonb(p4)->>''technical_issue_id'')::text) a(account) where p4.candidate_id=(to_jsonb(p5)->>''candidate_id'')::text and p4.channel=(to_jsonb(p5)->>''channel'')::text and p4.exact_sha=(to_jsonb(p5)->>''candidate_sha'')::text) a(account) where p5.validation_id=(to_jsonb(p6)->>''rejection_validation_id'')::text) a(account) where p6.dossier_digest=($1->>''dossier_digest'')::text union select a.account from public.testing_center_validation_snapshots p4 cross join lateral (select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=(to_jsonb(p4)->>''technical_issue_id'')::text) a(account) where p4.validation_id=($1->>''rejection_validation_id'')::text union select a.account from public.testing_center_codex_dossier_snapshots p4 cross join lateral (select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=(to_jsonb(p4)->>''technical_issue_id'')::text) a(account) where p4.dossier_digest=($1->>''dossier_digest'')::text union select a.account from public.testing_center_codex_dossier_snapshots p7 cross join lateral (select a.account from public.testing_center_validation_snapshots p6 cross join lateral (select a.account from public.testing_center_validations p5 cross join lateral (select a.account from public.testing_center_candidate_builds p4 cross join lateral (select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=(to_jsonb(p4)->>''technical_issue_id'')::text) a(account) where p4.candidate_id=(to_jsonb(p5)->>''candidate_id'')::text and p4.channel=(to_jsonb(p5)->>''channel'')::text and p4.exact_sha=(to_jsonb(p5)->>''exact_sha'')::text and p4.author_id=(to_jsonb(p5)->>''candidate_author_id'')::text) a(account) where p5.validation_id=(to_jsonb(p6)->>''validation_id'')::text) a(account) where p6.validation_id=(to_jsonb(p7)->>''rejection_validation_id'')::text) a(account) where p7.dossier_digest=($1->>''dossier_digest'')::text) owners(account)', 'select ($1->>''rejection_validation_id'' is not null and not exists(select 1 from public.testing_center_validation_snapshots p where p.validation_id=($1->>''rejection_validation_id'')::text)) or ($1->>''technical_issue_id'' is not null and not exists(select 1 from public.testing_center_technical_issues p where p.technical_issue_id=($1->>''technical_issue_id'')::text)) or ($1->>''dossier_digest'' is not null and not exists(select 1 from public.testing_center_codex_dossier_snapshots p where p.dossier_digest=($1->>''dossier_digest'')::text)) or ($1->>''actor_user_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''actor_user_id'')::uuid))');
drop trigger if exists a_account_write_barrier on public.testing_center_pauses;
CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_pauses FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''requested_by_user_id'')::uuid union select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=($1->>''technical_issue_id'')::text) owners(account)', 'select ($1->>''technical_issue_id'' is not null and not exists(select 1 from public.testing_center_technical_issues p where p.technical_issue_id=($1->>''technical_issue_id'')::text)) or ($1->>''requested_by_user_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''requested_by_user_id'')::uuid))');
drop trigger if exists a_account_write_barrier on public.testing_center_promotions;
CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_promotions FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''authorized_by_user_id'')::uuid union select a.account from public.testing_center_candidate_builds p4 cross join lateral (select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=(to_jsonb(p4)->>''technical_issue_id'')::text) a(account) where p4.candidate_id=($1->>''candidate_id'')::text and p4.channel=($1->>''from_channel'')::text and p4.exact_sha=($1->>''exact_sha'')::text union select a.account from public.testing_center_validations p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''actor_user_id'')::uuid) a(account) where p2.validation_id=($1->>''validation_id'')::text and p2.candidate_id=($1->>''candidate_id'')::text and p2.channel=($1->>''from_channel'')::text and p2.exact_sha=($1->>''validated_sha'')::text and p2.decision=($1->>''validation_decision'')::text union select a.account from public.testing_center_validations p5 cross join lateral (select a.account from public.testing_center_candidate_builds p4 cross join lateral (select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=(to_jsonb(p4)->>''technical_issue_id'')::text) a(account) where p4.candidate_id=(to_jsonb(p5)->>''candidate_id'')::text and p4.channel=(to_jsonb(p5)->>''channel'')::text and p4.exact_sha=(to_jsonb(p5)->>''exact_sha'')::text and p4.author_id=(to_jsonb(p5)->>''candidate_author_id'')::text) a(account) where p5.validation_id=($1->>''validation_id'')::text and p5.candidate_id=($1->>''candidate_id'')::text and p5.channel=($1->>''from_channel'')::text and p5.exact_sha=($1->>''validated_sha'')::text and p5.decision=($1->>''validation_decision'')::text) owners(account)', 'select ($1->>''candidate_id'' is not null and $1->>''from_channel'' is not null and $1->>''exact_sha'' is not null and not exists(select 1 from public.testing_center_candidate_builds p where p.candidate_id=($1->>''candidate_id'')::text and p.channel=($1->>''from_channel'')::text and p.exact_sha=($1->>''exact_sha'')::text)) or ($1->>''validation_id'' is not null and $1->>''candidate_id'' is not null and $1->>''from_channel'' is not null and $1->>''validated_sha'' is not null and $1->>''validation_decision'' is not null and not exists(select 1 from public.testing_center_validations p where p.validation_id=($1->>''validation_id'')::text and p.candidate_id=($1->>''candidate_id'')::text and p.channel=($1->>''from_channel'')::text and p.exact_sha=($1->>''validated_sha'')::text and p.decision=($1->>''validation_decision'')::text)) or ($1->>''authorized_by_user_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''authorized_by_user_id'')::uuid))');
drop trigger if exists a_account_write_barrier on public.testing_center_validation_snapshots;
CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_validation_snapshots FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''actor_user_id'')::uuid union select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=($1->>''technical_issue_id'')::text union select a.account from public.testing_center_validations p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''actor_user_id'')::uuid) a(account) where p2.validation_id=($1->>''validation_id'')::text union select a.account from public.testing_center_validations p5 cross join lateral (select a.account from public.testing_center_candidate_builds p4 cross join lateral (select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=(to_jsonb(p4)->>''technical_issue_id'')::text) a(account) where p4.candidate_id=(to_jsonb(p5)->>''candidate_id'')::text and p4.channel=(to_jsonb(p5)->>''channel'')::text and p4.exact_sha=(to_jsonb(p5)->>''exact_sha'')::text and p4.author_id=(to_jsonb(p5)->>''candidate_author_id'')::text) a(account) where p5.validation_id=($1->>''validation_id'')::text union select a.account from public.testing_center_candidate_builds p4 cross join lateral (select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=(to_jsonb(p4)->>''technical_issue_id'')::text) a(account) where p4.candidate_id=($1->>''candidate_id'')::text and p4.channel=($1->>''channel'')::text and p4.exact_sha=($1->>''candidate_sha'')::text) owners(account)', 'select ($1->>''validation_id'' is not null and not exists(select 1 from public.testing_center_validations p where p.validation_id=($1->>''validation_id'')::text)) or ($1->>''technical_issue_id'' is not null and not exists(select 1 from public.testing_center_technical_issues p where p.technical_issue_id=($1->>''technical_issue_id'')::text)) or ($1->>''candidate_id'' is not null and $1->>''channel'' is not null and $1->>''candidate_sha'' is not null and not exists(select 1 from public.testing_center_candidate_builds p where p.candidate_id=($1->>''candidate_id'')::text and p.channel=($1->>''channel'')::text and p.exact_sha=($1->>''candidate_sha'')::text)) or ($1->>''actor_user_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''actor_user_id'')::uuid))');
drop trigger if exists a_account_write_barrier on public.testing_center_validations;
CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_validations FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''actor_user_id'')::uuid union select a.account from public.testing_center_candidate_builds p4 cross join lateral (select a.account from public.testing_center_technical_issues p3 cross join lateral (select a.account from public.testing_center_reports p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''reporter_user_id'')::uuid) a(account) where p2.report_id=(to_jsonb(p3)->>''report_id'')::text) a(account) where p3.technical_issue_id=(to_jsonb(p4)->>''technical_issue_id'')::text) a(account) where p4.candidate_id=($1->>''candidate_id'')::text and p4.channel=($1->>''channel'')::text and p4.exact_sha=($1->>''exact_sha'')::text and p4.author_id=($1->>''candidate_author_id'')::text) owners(account)', 'select ($1->>''candidate_id'' is not null and $1->>''channel'' is not null and $1->>''exact_sha'' is not null and $1->>''candidate_author_id'' is not null and not exists(select 1 from public.testing_center_candidate_builds p where p.candidate_id=($1->>''candidate_id'')::text and p.channel=($1->>''channel'')::text and p.exact_sha=($1->>''exact_sha'')::text and p.author_id=($1->>''candidate_author_id'')::text)) or ($1->>''actor_user_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''actor_user_id'')::uuid))');
create or replace function private.testing_center_v2_owner(p_reference text) returns uuid
language sql stable security definer set search_path='' as $$
  select c.account_id from public.testing_center_technical_issues i
  join public.testing_contributions c on c.id=i.contribution_id
  left join public.testing_center_agent_jobs j on j.technical_issue_id=i.technical_issue_id
  where p_reference in (i.technical_issue_id,j.job_key,c.id::text)
  limit 1
$$;
revoke all on function private.testing_center_v2_owner(text)
  from public,anon,authenticated,service_role;
alter table public.testing_center_technical_issues drop column owner_account_id;
-- Restore the removed inert RPC bodies and their exact effective ACL.
CREATE OR REPLACE FUNCTION private.testing_center_report_evidence_for_account(p_account uuid, p_contract_version text, p_channel text, p_action_text text, p_expected_text text, p_observed_text text, p_context_text text, p_app_version text, p_os_family text, p_os_version text, p_module text, p_include_diagnostic boolean, p_include_logs boolean, p_diagnostic_payload text, p_diagnostic_digest text, p_idempotency_key text, p_batch_id uuid)
 RETURNS TABLE(report_id text, report_state text, idempotent boolean, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := p_account;
  v_batch public.testing_center_evidence_batches%rowtype;
  v_internal_key text;
  v_digests text;
  v_result record;
  v_slot_count integer;
begin
  if v_user_id is null then
    raise exception 'testing_center_auth_required' using errcode='42501';
  end if;
  -- UUID deletion barrier before membership/batch/row locks.
  if private.lock_account_write(p_account) then
    raise sqlstate '28000' using message='account_deleted';
  end if;

  select * into v_batch from public.testing_center_evidence_batches as batch
  where batch.batch_id=p_batch_id for update;
  if not found or v_batch.reporter_user_id <> v_user_id then
    raise exception 'testing_center_evidence_owner_required' using errcode='42501';
  end if;
  if v_batch.channel <> p_channel then
    raise exception 'testing_center_evidence_channel_conflict' using errcode='23505';
  end if;
  if v_batch.idempotency_key <> p_idempotency_key then
    raise exception 'testing_center_evidence_idempotency_conflict' using errcode='23505';
  end if;
  select count(*),pg_catalog.string_agg(evidence.sha256,',' order by evidence.position)
  into v_slot_count,v_digests
  from public.testing_center_screenshot_evidence as evidence
  where evidence.batch_id=p_batch_id;
  if v_slot_count not between 1 and 10 or exists(
    select 1 from public.testing_center_screenshot_evidence as evidence
    where evidence.batch_id=p_batch_id and evidence.state <> 'ready'
  ) or v_batch.state not in ('ready','attached') then
    raise exception 'testing_center_evidence_not_ready' using errcode='55000';
  end if;
  v_internal_key := 'evidence:'||pg_catalog.encode(public.digest(pg_catalog.convert_to(
    p_idempotency_key||pg_catalog.chr(31)||v_digests,'UTF8'),'sha256'),'hex');
  select * into strict v_result from private.testing_center_report_for_account(
    p_account,p_contract_version,p_channel,p_action_text,p_expected_text,p_observed_text,
    p_context_text,p_app_version,p_os_family,p_os_version,p_module,
    p_include_diagnostic,p_include_logs,p_diagnostic_payload,p_diagnostic_digest,
    v_internal_key
  );
  if v_batch.state='attached' then
    if exists(
      select 1 from public.testing_center_screenshot_evidence as evidence
      where evidence.batch_id=p_batch_id and evidence.report_id is distinct from v_result.report_id
    ) then
      raise exception 'testing_center_evidence_attachment_conflict' using errcode='23505';
    end if;
    return query select v_result.report_id,v_result.report_state,true,v_result.created_at;
    return;
  end if;
  insert into public.testing_center_evidence(contract_version,evidence_id,report_id,kind,digest)
  select 'testing-center.v1',
    'screenshot_'||pg_catalog.encode(public.digest(pg_catalog.convert_to(
      v_result.report_id||pg_catalog.chr(31)||evidence.sha256,'UTF8'),'sha256'),'hex'),
    v_result.report_id,'screenshot',evidence.sha256
  from public.testing_center_screenshot_evidence as evidence
  where evidence.batch_id=p_batch_id
  group by evidence.sha256
  on conflict on constraint testing_center_evidence_report_id_kind_digest_key
  do nothing;
  update public.testing_center_screenshot_evidence
  set report_id=v_result.report_id,updated_at=pg_catalog.now()
  where batch_id=p_batch_id;
  update public.testing_center_evidence_batches
  set state='attached',updated_at=pg_catalog.now()
  where batch_id=p_batch_id;
  return query select v_result.report_id,v_result.report_state,v_result.idempotent,v_result.created_at;
end
$function$
;
revoke all on function private.testing_center_report_evidence_for_account(uuid,text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text,uuid) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.testing_center_report_for_account(p_account uuid, p_contract_version text, p_channel text, p_action_text text, p_expected_text text, p_observed_text text, p_context_text text, p_app_version text, p_os_family text, p_os_version text, p_module text, p_include_diagnostic boolean, p_include_logs boolean, p_diagnostic_payload text, p_diagnostic_digest text, p_idempotency_key text)
 RETURNS TABLE(report_id text, report_state text, idempotent boolean, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_result record;
  v_transport_size integer;
begin
  select * into strict v_result
  from private.testing_center_report_payload_for_account(
    p_account, p_contract_version, p_channel, p_action_text, p_expected_text,
    p_observed_text, p_context_text, p_app_version, p_os_family,
    p_os_version, p_module, p_include_diagnostic, p_include_logs,
    p_diagnostic_payload, p_diagnostic_digest, p_idempotency_key
  );

  if p_include_diagnostic then
    v_transport_size := pg_catalog.octet_length(p_diagnostic_payload);
    update public.testing_center_report_payloads as payload
    set diagnostic_transport_size = v_transport_size
    where payload.report_id = v_result.report_id
      and payload.diagnostic_transport_size is null;

    if exists (
      select 1
      from public.testing_center_report_payloads as payload
      where payload.report_id = v_result.report_id
        and payload.diagnostic_transport_size is distinct from v_transport_size
    ) then
      raise exception 'testing_center_diagnostic_size_conflict'
        using errcode = '23505';
    end if;
  end if;

  return query select v_result.report_id, v_result.report_state,
    v_result.idempotent, v_result.created_at;
end
$function$
;
revoke all on function private.testing_center_report_for_account(uuid,text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.testing_center_report_payload_for_account(p_account uuid, p_contract_version text, p_channel text, p_action_text text, p_expected_text text, p_observed_text text, p_context_text text, p_app_version text, p_os_family text, p_os_version text, p_module text, p_include_diagnostic boolean, p_include_logs boolean, p_diagnostic_payload text, p_diagnostic_digest text, p_idempotency_key text)
 RETURNS TABLE(report_id text, report_state text, idempotent boolean, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := p_account;
  v_actor_id text;
  v_role text;
  v_context_text text;
  v_diagnostic jsonb;
  v_diagnostic_time timestamptz;
  v_operation_digest text;
  v_report_id text;
  v_event_id text;
  v_evidence_id text;
  v_created_at timestamptz;
  v_existing public.testing_center_report_submission_keys%rowtype;
begin
  if v_user_id is null then
    raise exception 'testing_center_auth_required' using errcode = '42501';
  end if;
  -- UUID deletion barrier before membership/batch/row locks.
  if private.lock_account_write(p_account) then
    raise sqlstate '28000' using message='account_deleted';
  end if;


  select membership.actor_id, membership.role
  into v_actor_id, v_role
  from public.testing_center_memberships as membership
  where membership.user_id = v_user_id
    and membership.active;

  if not found then
    raise exception 'testing_center_membership_required' using errcode = '42501';
  end if;

  if p_contract_version is distinct from 'testing-center.v1' then
    raise exception 'testing_center_contract_version_invalid' using errcode = '22023';
  end if;
  if p_channel = 'nightly' then
    if v_role not in ('primary_tester', 'owner') then
      raise exception 'testing_center_nightly_role_required' using errcode = '42501';
    end if;
  elsif p_channel = 'testers' then
    if v_role not in ('tester', 'primary_tester', 'owner') then
      raise exception 'testing_center_testers_role_required' using errcode = '42501';
    end if;
  else
    raise exception 'testing_center_channel_invalid' using errcode = '22023';
  end if;

  if p_action_text is null
    or p_action_text <> pg_catalog.btrim(p_action_text)
    or pg_catalog.octet_length(p_action_text) not between 3 and 2048 then
    raise exception 'testing_center_action_invalid' using errcode = '22023';
  end if;
  if p_expected_text is null
    or p_expected_text <> pg_catalog.btrim(p_expected_text)
    or pg_catalog.octet_length(p_expected_text) not between 3 and 2048 then
    raise exception 'testing_center_expected_invalid' using errcode = '22023';
  end if;
  if p_observed_text is null
    or p_observed_text <> pg_catalog.btrim(p_observed_text)
    or pg_catalog.octet_length(p_observed_text) not between 3 and 2048 then
    raise exception 'testing_center_observed_invalid' using errcode = '22023';
  end if;

  v_context_text := nullif(pg_catalog.btrim(p_context_text), '');
  if v_context_text is not null
    and pg_catalog.octet_length(v_context_text) > 4096 then
    raise exception 'testing_center_context_invalid' using errcode = '22023';
  end if;
  if p_app_version is null
    or p_app_version !~ '^[A-Za-z0-9][A-Za-z0-9._+-]{0,31}$' then
    raise exception 'testing_center_app_version_invalid' using errcode = '22023';
  end if;
  if p_os_family is distinct from 'windows' then
    raise exception 'testing_center_os_invalid' using errcode = '22023';
  end if;
  if p_os_version is null
    or p_os_version !~ '^[A-Za-z0-9][A-Za-z0-9 ._+-]{0,63}$' then
    raise exception 'testing_center_os_version_invalid' using errcode = '22023';
  end if;
  if p_module is null or p_module not in (
    'hub', 'launcher', 'settings', 'overlay_studio', 'overlay_runtime',
    'telemetry', 'telemetry_analysis', 'engineer', 'strategy', 'calendar',
    'billing', 'account', 'updater', 'testing_center', 'unknown'
  ) then
    raise exception 'testing_center_module_invalid' using errcode = '22023';
  end if;
  if p_idempotency_key is null
    or p_idempotency_key = ''
    or p_idempotency_key ~ '^[[:space:]]|[[:space:]]$'
    or pg_catalog.octet_length(p_idempotency_key) > 256 then
    raise exception 'testing_center_idempotency_key_invalid' using errcode = '22023';
  end if;
  if p_include_diagnostic is null or p_include_logs is null then
    raise exception 'testing_center_consent_invalid' using errcode = '22023';
  end if;
  if p_include_logs and not p_include_diagnostic then
    raise exception 'testing_center_logs_require_diagnostic' using errcode = '22023';
  end if;

  if not p_include_diagnostic then
    if p_diagnostic_payload is not null or p_diagnostic_digest is not null then
      raise exception 'testing_center_diagnostic_without_consent' using errcode = '22023';
    end if;
  else
    if p_diagnostic_payload is null
      or pg_catalog.octet_length(p_diagnostic_payload) > 65536
      or p_diagnostic_digest is null
      or p_diagnostic_digest !~ '^[0-9a-f]{64}$'
      or p_diagnostic_digest <> pg_catalog.encode(
        public.digest(pg_catalog.convert_to(p_diagnostic_payload, 'UTF8'), 'sha256'),
        'hex'
      ) then
      raise exception 'testing_center_diagnostic_integrity_invalid' using errcode = '22023';
    end if;

    begin
      v_diagnostic := p_diagnostic_payload::jsonb;
    exception when others then
      raise exception 'testing_center_diagnostic_json_invalid' using errcode = '22023';
    end;

    if pg_catalog.jsonb_typeof(v_diagnostic) <> 'object'
      or (select count(*) from pg_catalog.jsonb_object_keys(v_diagnostic)) <> 7
      or exists (
        select 1 from pg_catalog.jsonb_object_keys(v_diagnostic) as key
        where key not in (
          'contractVersion', 'generatedAtUtc', 'application', 'module',
          'errorCode', 'logs', 'sanitization'
        )
      )
      or pg_catalog.jsonb_typeof(v_diagnostic->'contractVersion') <> 'string'
      or v_diagnostic->>'contractVersion' <> 'testing-center.diagnostic.v1'
      or pg_catalog.jsonb_typeof(v_diagnostic->'generatedAtUtc') <> 'string'
      or pg_catalog.jsonb_typeof(v_diagnostic->'module') <> 'string'
      or v_diagnostic->>'module' <> p_module
      or pg_catalog.jsonb_typeof(v_diagnostic->'errorCode') <> 'string'
      or pg_catalog.jsonb_typeof(v_diagnostic->'application') <> 'object'
      or (select count(*) from pg_catalog.jsonb_object_keys(v_diagnostic->'application')) <> 4
      or exists (
        select 1 from pg_catalog.jsonb_object_keys(v_diagnostic->'application') as key
        where key not in ('version', 'channel', 'os', 'arch')
      )
      or pg_catalog.jsonb_typeof(v_diagnostic->'application'->'version') <> 'string'
      or pg_catalog.jsonb_typeof(v_diagnostic->'application'->'channel') <> 'string'
      or pg_catalog.jsonb_typeof(v_diagnostic->'application'->'os') <> 'string'
      or pg_catalog.jsonb_typeof(v_diagnostic->'application'->'arch') <> 'string'
      or v_diagnostic->'application'->>'version' <> p_app_version
      or v_diagnostic->'application'->>'channel' <> p_channel
      or v_diagnostic->'application'->>'os' <> p_os_family
      or v_diagnostic->'application'->>'arch' not in ('amd64', 'arm64')
      or (v_diagnostic->>'errorCode') !~ '^[a-z0-9][a-z0-9._+-]{0,63}$'
      or pg_catalog.jsonb_typeof(v_diagnostic->'logs') <> 'array'
      or pg_catalog.jsonb_array_length(v_diagnostic->'logs') > 100
      or pg_catalog.jsonb_typeof(v_diagnostic->'sanitization') <> 'object'
      or (select count(*) from pg_catalog.jsonb_object_keys(v_diagnostic->'sanitization')) <> 5
      or exists (
        select 1 from pg_catalog.jsonb_object_keys(v_diagnostic->'sanitization') as key
        where key not in (
          'inputLogs', 'includedLogs', 'omittedLogs', 'redactedValues',
          'truncatedMessages'
        )
      )
      or exists (
        select 1
        from (values
          (v_diagnostic->'sanitization'->'inputLogs'),
          (v_diagnostic->'sanitization'->'includedLogs'),
          (v_diagnostic->'sanitization'->'omittedLogs'),
          (v_diagnostic->'sanitization'->'redactedValues'),
          (v_diagnostic->'sanitization'->'truncatedMessages')
        ) as counters(value)
        where pg_catalog.jsonb_typeof(value) <> 'number'
          or value #>> '{}' !~ '^[0-9]{1,10}$'
      ) then
      raise exception 'testing_center_diagnostic_shape_invalid' using errcode = '22023';
    end if;

    if (v_diagnostic->'sanitization'->>'inputLogs')::bigint > 1000
      or (v_diagnostic->'sanitization'->>'includedLogs')::bigint > 100
      or (v_diagnostic->'sanitization'->>'omittedLogs')::bigint > 1000
      or (v_diagnostic->'sanitization'->>'redactedValues')::bigint > 100000
      or (v_diagnostic->'sanitization'->>'truncatedMessages')::bigint > 100000
      or (v_diagnostic->'sanitization'->>'includedLogs')::bigint
        <> pg_catalog.jsonb_array_length(v_diagnostic->'logs')
      or (v_diagnostic->'sanitization'->>'inputLogs')::bigint
        <> (v_diagnostic->'sanitization'->>'includedLogs')::bigint
          + (v_diagnostic->'sanitization'->>'omittedLogs')::bigint then
      raise exception 'testing_center_diagnostic_counters_invalid' using errcode = '22023';
    end if;

    begin
      v_diagnostic_time := (v_diagnostic->>'generatedAtUtc')::timestamptz;
    exception when others then
      raise exception 'testing_center_diagnostic_time_invalid' using errcode = '22023';
    end;
    if v_diagnostic_time < pg_catalog.now() - interval '7 days'
      or v_diagnostic_time > pg_catalog.now() + interval '5 minutes' then
      raise exception 'testing_center_diagnostic_time_invalid' using errcode = '22023';
    end if;

    if (not p_include_logs and pg_catalog.jsonb_array_length(v_diagnostic->'logs') <> 0)
      or exists (
        select 1
        from pg_catalog.jsonb_array_elements(v_diagnostic->'logs') as item
        where pg_catalog.jsonb_typeof(item) <> 'object'
          or (select count(*) from pg_catalog.jsonb_object_keys(item)) <> 5
          or exists (
            select 1 from pg_catalog.jsonb_object_keys(item) as key
            where key not in ('offsetMillis', 'source', 'level', 'code', 'message')
          )
          or pg_catalog.jsonb_typeof(item->'offsetMillis') <> 'number'
          or pg_catalog.jsonb_typeof(item->'source') <> 'string'
          or pg_catalog.jsonb_typeof(item->'level') <> 'string'
          or pg_catalog.jsonb_typeof(item->'code') <> 'string'
          or pg_catalog.jsonb_typeof(item->'message') <> 'string'
          or item->>'source' not in ('frontend', 'backend', 'wails', 'runtime')
          or item->>'level' not in ('info', 'warn', 'error')
          or (item->>'code') !~ '^[a-z0-9][a-z0-9._+-]{0,63}$'
          or pg_catalog.octet_length(item->>'message') > 512
          or (item->>'offsetMillis') !~ '^[0-9]{1,8}$'
          or (item->>'offsetMillis')::numeric not between 0 and 86400000
      ) then
      raise exception 'testing_center_diagnostic_logs_invalid' using errcode = '22023';
    end if;
  end if;

  v_operation_digest := pg_catalog.encode(
    public.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'actionText', p_action_text,
          'actorId', v_actor_id,
          'actorRole', v_role,
          'actorUserId', v_user_id,
          'appVersion', p_app_version,
          'channel', p_channel,
          'contextText', v_context_text,
          'contractVersion', p_contract_version,
          'diagnosticDigest', p_diagnostic_digest,
          'expectedText', p_expected_text,
          'idempotencyKey', p_idempotency_key,
          'includeDiagnostic', p_include_diagnostic,
          'includeLogs', p_include_logs,
          'module', p_module,
          'observedText', p_observed_text,
          'osFamily', p_os_family,
          'osVersion', p_os_version
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
  v_report_id := 'report_' || v_operation_digest;
  v_event_id := 'report_event_' || v_operation_digest;
  v_evidence_id := 'evidence_' || pg_catalog.encode(
    public.digest(
      pg_catalog.convert_to('diagnostic' || pg_catalog.chr(31) || v_operation_digest, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || pg_catalog.chr(31) || p_idempotency_key, 0)
  );

  select submission.*
  into v_existing
  from public.testing_center_report_submission_keys as submission
  where submission.reporter_user_id = v_user_id
    and submission.idempotency_key = p_idempotency_key;

  if found then
    if v_existing.payload_digest <> v_operation_digest
      or v_existing.report_id <> v_report_id then
      raise exception 'testing_center_idempotency_conflict' using errcode = '23505';
    end if;
    select report.created_at
    into v_created_at
    from public.testing_center_reports as report
    join public.testing_center_report_payloads as payload
      on payload.report_id = report.report_id
    join public.testing_center_report_events as event
      on event.report_id = report.report_id
    where report.report_id = v_existing.report_id
      and report.reporter_user_id = v_user_id
      and report.reporter_id = v_actor_id
      and report.reporter_role = v_role
      and report.channel = p_channel
      and report.state = 'submitted'
      and event.operation_digest = v_operation_digest;
    if not found then
      raise exception 'testing_center_idempotency_result_missing' using errcode = '23505';
    end if;
    return query select v_report_id, 'submitted'::text, true, v_created_at;
    return;
  end if;

  v_created_at := pg_catalog.now();

  insert into public.testing_center_reports (
    contract_version, report_id, reporter_id, reporter_user_id, reporter_role,
    channel, state, created_at, updated_at
  ) values (
    'testing-center.v1', v_report_id, v_actor_id, v_user_id, v_role,
    p_channel, 'submitted', v_created_at, v_created_at
  );

  insert into public.testing_center_report_payloads (
    report_id, action_text, expected_text, observed_text, context_text,
    app_version, os_family, os_version, module,
    include_diagnostic, include_logs, diagnostic_document,
    diagnostic_transport_digest, created_at
  ) values (
    v_report_id, p_action_text, p_expected_text, p_observed_text, v_context_text,
    p_app_version, p_os_family, p_os_version, p_module,
    p_include_diagnostic, p_include_logs, v_diagnostic,
    p_diagnostic_digest, v_created_at
  );

  if p_include_diagnostic then
    insert into public.testing_center_evidence (
      contract_version, evidence_id, report_id, kind, digest, created_at
    ) values (
      'testing-center.v1', v_evidence_id, v_report_id, 'diagnostic',
      p_diagnostic_digest, v_created_at
    );
  end if;

  insert into public.testing_center_report_submission_keys (
    reporter_user_id, idempotency_key, payload_digest, report_id, created_at
  ) values (
    v_user_id, p_idempotency_key, v_operation_digest, v_report_id, v_created_at
  );

  insert into public.testing_center_report_events (
    event_id, report_id, actor_id, actor_user_id, actor_role,
    operation_digest, created_at
  ) values (
    v_event_id, v_report_id, v_actor_id, v_user_id, v_role,
    v_operation_digest, v_created_at
  );

  return query select v_report_id, 'submitted'::text, false, v_created_at;
end
$function$
;
revoke all on function private.testing_center_report_payload_for_account(uuid,text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text) from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.testing_center_authorize_posthog_linear_link(p_evidence_id text, p_owner_user_id uuid)
 RETURNS TABLE(result_authorized boolean, result_idempotent boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_evidence public.testing_center_posthog_evidence%rowtype;
  v_owner public.testing_center_memberships%rowtype;
  v_consent public.testing_center_posthog_consent_events%rowtype;
begin
  select * into v_owner from public.testing_center_memberships
  where user_id=p_owner_user_id and active and role='owner';
  if not found then
    raise exception 'testing_center_posthog_owner_required' using errcode='42501';
  end if;
  select * into v_evidence from public.testing_center_posthog_evidence
  where evidence_id=p_evidence_id for update;
  if not found or not v_evidence.replay_available
    or v_evidence.replay_expires_at<=now() then
    raise exception 'testing_center_posthog_replay_unavailable' using errcode='55000';
  end if;
  select * into v_consent from public.testing_center_posthog_consent_events
  where report_id=v_evidence.report_id order by revision desc limit 1;
  if not found or not v_consent.diagnostics_consent or not v_consent.replay_consent then
    raise exception 'testing_center_posthog_consent_required' using errcode='42501';
  end if;
  if v_evidence.linear_link_authorized then
    return query select true,true;
    return;
  end if;
  update public.testing_center_posthog_evidence
  set linear_link_authorized=true,linear_link_authorized_by=p_owner_user_id,
    linear_link_authorized_at=now()
  where evidence_id=p_evidence_id;
  return query select true,false;
end $function$
;
revoke all on function public.testing_center_authorize_posthog_linear_link(text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.testing_center_authorize_posthog_linear_link(text,uuid) to service_role;
CREATE OR REPLACE FUNCTION public.testing_center_expire_posthog_evidence(p_now timestamp with time zone)
 RETURNS TABLE(result_replays_cleared integer, result_evidence_deleted integer, result_consents_deleted integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_replays integer; v_deleted integer; v_consents integer;
begin
  if p_now is null or p_now>now()+interval '5 minutes' then
    raise exception 'testing_center_posthog_expiry_time_invalid' using errcode='22023';
  end if;
  update public.testing_center_posthog_evidence
  set replay_consent=false,replay_available=false,replay_session_id=null,
    restricted_replay_url=null,replay_expires_at=null,
    linear_link_authorized=false,linear_link_authorized_by=null,
    linear_link_authorized_at=null
  where replay_expires_at is not null and replay_expires_at<=p_now;
  get diagnostics v_replays=row_count;
  delete from public.testing_center_posthog_evidence where error_expires_at<=p_now;
  get diagnostics v_deleted=row_count;
  delete from public.testing_center_posthog_consent_events consent
  where consent.consent_expires_at<=p_now and not exists(
    select 1 from public.testing_center_posthog_evidence evidence
    where evidence.report_id=consent.report_id
  );
  get diagnostics v_consents=row_count;
  return query select v_replays,v_deleted,v_consents;
end $function$
;
revoke all on function public.testing_center_expire_posthog_evidence(timestamp with time zone) from public,anon,authenticated,service_role;
grant execute on function public.testing_center_expire_posthog_evidence(timestamp with time zone) to service_role;
CREATE OR REPLACE FUNCTION public.testing_center_load_codex_evidence(p_technical_issue_id text)
 RETURNS TABLE(contract_version text, technical_issue_id text, report_id text, source_diagnostic_digest text, evidence_text text, evidence_digest text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_issue public.testing_center_technical_issues%rowtype;
  v_report public.testing_center_reports%rowtype;
  v_payload public.testing_center_report_payloads%rowtype;
  v_diagnostic_evidence public.testing_center_evidence%rowtype;
  v_projection jsonb;
  v_logs jsonb;
begin
  if p_technical_issue_id is null
    or p_technical_issue_id !~ '^issue_[0-9a-f]{64}$' then
    raise exception 'testing_center_codex_evidence_issue_invalid' using errcode = '22023';
  end if;

  select issue.* into v_issue
  from public.testing_center_technical_issues as issue
  where issue.technical_issue_id = p_technical_issue_id
  for update;
  if not found or v_issue.state <> 'open' or v_issue.flow_state <> 'queued' then
    raise exception 'testing_center_codex_evidence_not_ready' using errcode = '55000';
  end if;

  select report.* into strict v_report
  from public.testing_center_reports as report
  where report.report_id = v_issue.report_id;
  select payload.* into strict v_payload
  from public.testing_center_report_payloads as payload
  where payload.report_id = v_issue.report_id;
  select evidence.* into strict v_diagnostic_evidence
  from public.testing_center_evidence as evidence
  where evidence.report_id = v_issue.report_id and evidence.kind = 'diagnostic';

  if not v_payload.include_diagnostic
    or v_payload.diagnostic_document is null
    or v_payload.diagnostic_transport_digest is null
    or v_payload.diagnostic_transport_size is null
    or v_payload.diagnostic_transport_digest <> v_diagnostic_evidence.digest
    or v_payload.diagnostic_transport_size not between 1 and 65536
    or v_report.channel not in ('nightly', 'testers')
    or v_payload.os_family <> 'windows'
    or pg_catalog.jsonb_typeof(v_payload.diagnostic_document) <> 'object'
    or (select count(*) from pg_catalog.jsonb_object_keys(v_payload.diagnostic_document)) <> 7
    or exists (
      select 1 from pg_catalog.jsonb_object_keys(v_payload.diagnostic_document) as key
      where key not in ('contractVersion', 'generatedAtUtc', 'application', 'module', 'errorCode', 'logs', 'sanitization')
    )
    or v_payload.diagnostic_document->>'contractVersion' <> 'testing-center.diagnostic.v1'
    or v_payload.diagnostic_document->>'module' <> v_payload.module
    or pg_catalog.jsonb_typeof(v_payload.diagnostic_document->'application') <> 'object'
    or (select count(*) from pg_catalog.jsonb_object_keys(v_payload.diagnostic_document->'application')) <> 4
    or exists (
      select 1 from pg_catalog.jsonb_object_keys(v_payload.diagnostic_document->'application') as key
      where key not in ('version', 'channel', 'os', 'arch')
    )
    or v_payload.diagnostic_document->'application'->>'channel' <> v_report.channel
    or v_payload.diagnostic_document->'application'->>'os' <> v_payload.os_family
    or v_payload.diagnostic_document->'application'->>'arch' not in ('amd64', 'arm64')
    or v_payload.module not in (
      'hub', 'launcher', 'settings', 'overlay_studio', 'overlay_runtime',
      'telemetry', 'telemetry_analysis', 'engineer', 'strategy', 'calendar',
      'billing', 'account', 'updater', 'testing_center', 'unknown'
    )
    or pg_catalog.jsonb_typeof(v_payload.diagnostic_document->'errorCode') <> 'string'
    or (v_payload.diagnostic_document->>'errorCode') !~ '^[a-z0-9][a-z0-9._+-]{0,63}$'
    or pg_catalog.jsonb_typeof(v_payload.diagnostic_document->'logs') <> 'array'
    or pg_catalog.jsonb_array_length(v_payload.diagnostic_document->'logs') > 100
    or (not v_payload.include_logs and pg_catalog.jsonb_array_length(v_payload.diagnostic_document->'logs') <> 0)
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(v_payload.diagnostic_document->'logs') as item
      where pg_catalog.jsonb_typeof(item) <> 'object'
        or (select count(*) from pg_catalog.jsonb_object_keys(item)) <> 5
        or exists (
          select 1 from pg_catalog.jsonb_object_keys(item) as key
          where key not in ('offsetMillis', 'source', 'level', 'code', 'message')
        )
        or pg_catalog.jsonb_typeof(item->'offsetMillis') <> 'number'
        or (item->>'offsetMillis') !~ '^[0-9]{1,8}$'
        or (item->>'offsetMillis')::numeric not between 0 and 86400000
        or item->>'source' not in ('frontend', 'backend', 'wails', 'runtime')
        or item->>'level' not in ('info', 'warn', 'error')
        or pg_catalog.jsonb_typeof(item->'code') <> 'string'
        or (item->>'code') !~ '^[a-z0-9][a-z0-9._+-]{0,63}$'
        or pg_catalog.jsonb_typeof(item->'message') <> 'string'
        or pg_catalog.octet_length(item->>'message') > 512
    ) then
    raise exception 'testing_center_codex_evidence_invalid' using errcode = '22023';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'offsetMillis', (item->>'offsetMillis')::bigint,
        'source', item->>'source',
        'level', item->>'level'
      ) order by ordinal
    ),
    '[]'::jsonb
  ) into v_logs
  from pg_catalog.jsonb_array_elements(v_payload.diagnostic_document->'logs')
    with ordinality as log(item, ordinal)
  where v_payload.include_logs;

  v_projection := pg_catalog.jsonb_build_object(
    'contractVersion', 'testing-center.codex-evidence.v1',
    'application', pg_catalog.jsonb_build_object(
      'channel', v_report.channel,
      'os', v_payload.os_family,
      'arch', v_payload.diagnostic_document->'application'->>'arch'
    ),
    'module', v_payload.module,
    'errorCodePresent', v_payload.diagnostic_document->>'errorCode' <> 'unknown',
    'logs', v_logs,
    'source', pg_catalog.jsonb_build_object(
      'diagnosticDigest', v_payload.diagnostic_transport_digest,
      'diagnosticByteSize', v_payload.diagnostic_transport_size,
      'logsIncludedByConsent', v_payload.include_logs
    )
  );

  contract_version := 'testing-center.codex-evidence.v1';
  technical_issue_id := v_issue.technical_issue_id;
  report_id := v_issue.report_id;
  source_diagnostic_digest := v_payload.diagnostic_transport_digest;
  evidence_text := v_projection::text;
  evidence_digest := pg_catalog.encode(
    public.digest(pg_catalog.convert_to(evidence_text, 'UTF8'), 'sha256'), 'hex'
  );
  return next;
end
$function$
;
revoke all on function public.testing_center_load_codex_evidence(text) from public,anon,authenticated,service_role;
grant execute on function public.testing_center_load_codex_evidence(text) to service_role;
comment on function public.testing_center_load_codex_evidence(text) is 'TAU-06F service-only canonical evidence projection; never returns report free text or log messages.';
CREATE OR REPLACE FUNCTION public.testing_center_prepare_linear_projection(p_effect_id text)
 RETURNS TABLE(preparation_status text, prepared_source_snapshot jsonb, prepared_source_digest text, prepared_occurrence_count bigint, prepared_marker text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_effect public.testing_center_effect_outbox%rowtype;
  v_existing public.testing_center_linear_projection_snapshots%rowtype;
  v_payload public.testing_center_report_payloads%rowtype;
  v_report public.testing_center_reports%rowtype;
  v_build_count integer;
  v_sha text;
  v_count bigint;
  v_source jsonb;
  v_digest text;
  v_marker text;
  v_reason text;
begin
  lock table public.testing_center_pauses in share mode;
  select * into v_effect from public.testing_center_effect_outbox
  where effect_id = p_effect_id for update;
  if not found or v_effect.effect_type <> 'linear_issue_create' then
    raise exception 'testing_center_linear_effect_not_found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.testing_center_issue_destinations
    where technical_issue_id = v_effect.technical_issue_id
      and destination = 'linear' and active_effect_id = v_effect.effect_id
  ) then
    raise exception 'testing_center_linear_effect_not_selected' using errcode = '55000';
  end if;
  select * into v_existing from public.testing_center_linear_projection_snapshots
  where effect_id = p_effect_id;
  if found then
    return query select 'prepared'::text, v_existing.source_snapshot,
      v_existing.source_digest, v_existing.occurrence_count, v_existing.marker;
    return;
  end if;
  if v_effect.state = 'needs_owner' then
    return query select 'needs_owner'::text, null::jsonb, null::text,
      null::bigint, null::text;
    return;
  end if;
  if v_effect.state not in ('pending', 'failed') then
    raise exception 'testing_center_linear_effect_not_preparable' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.testing_center_pauses pause
    where pause.is_paused and (pause.scope = 'global'
      or (pause.scope = 'flow' and pause.technical_issue_id = v_effect.technical_issue_id))
  ) then
    return query select 'paused'::text, null::jsonb, null::text,
      null::bigint, null::text;
    return;
  end if;
  select * into strict v_report from public.testing_center_reports
  where report_id = v_effect.primary_report_id;
  select * into strict v_payload from public.testing_center_report_payloads
  where report_id = v_effect.primary_report_id;
  select count(*), min(candidate_sha) into v_build_count, v_sha
  from public.testing_center_build_identities
  where channel = v_report.channel and app_version = v_payload.app_version and active;
  if v_build_count <> 1 then
    v_reason := case when v_build_count = 0
      then 'linear_build_identity_missing' else 'linear_build_identity_ambiguous' end;
    update public.testing_center_effect_outbox
    set state = 'needs_owner', lease_token = null, lease_expires_at = null,
      lease_owner = null, next_attempt_at = null, last_error_code = v_reason,
      updated_at = now()
    where effect_id = p_effect_id;
    update public.testing_center_issue_destinations
    set decision_state = 'needs_owner', decision_reason = v_reason, updated_at = now()
    where technical_issue_id = v_effect.technical_issue_id;
    return query select 'needs_owner'::text, null::jsonb, null::text,
      null::bigint, null::text;
    return;
  end if;
  select count(*) into v_count from public.testing_center_issue_occurrences
  where technical_issue_id = v_effect.technical_issue_id;
  if v_count < 1 then
    raise exception 'testing_center_linear_occurrence_missing' using errcode = '55000';
  end if;
  v_marker := '<!-- vantare-testing-center:linear:v1 effect=' || v_effect.effect_id
    || ' issue=' || v_effect.technical_issue_id || ' -->';
  v_source := pg_catalog.jsonb_build_object(
    'contractVersion', 'testing-center.linear-issue.v1',
    'effectId', v_effect.effect_id,
    'technicalIssueId', v_effect.technical_issue_id,
    'occurrenceCount', v_count,
    'replayAvailable', false,
    'report', pg_catalog.jsonb_build_object(
      'reportId', v_report.report_id,
      'channel', v_report.channel,
      'appVersion', v_payload.app_version,
      'osFamily', v_payload.os_family,
      'osVersion', v_payload.os_version,
      'module', v_payload.module,
      'actionText', v_payload.action_text,
      'expectedText', v_payload.expected_text,
      'observedText', v_payload.observed_text,
      'contextText', v_payload.context_text,
      'errorCode', case when v_payload.include_diagnostic
        and nullif(v_payload.diagnostic_document->>'errorCode','') is not null
        and v_payload.diagnostic_document->>'errorCode' not in ('tester.report','unknown','none')
        then v_payload.diagnostic_document->>'errorCode' else null end,
      'candidateSha', v_sha
    )
  );
  v_digest := pg_catalog.encode(public.digest(
    pg_catalog.convert_to(v_source::text, 'UTF8'), 'sha256'), 'hex');
  insert into public.testing_center_linear_projection_snapshots(
    effect_id, technical_issue_id, primary_report_id, source_snapshot,
    source_digest, marker, occurrence_count
  ) values (
    p_effect_id, v_effect.technical_issue_id, v_effect.primary_report_id,
    v_source, v_digest, v_marker, v_count
  );
  return query select 'prepared'::text, v_source, v_digest, v_count, v_marker;
end $function$
;
revoke all on function public.testing_center_prepare_linear_projection(text) from public,anon,authenticated,service_role;
grant execute on function public.testing_center_prepare_linear_projection(text) to service_role;
CREATE OR REPLACE FUNCTION public.testing_center_queue_codex_dry_run(p_technical_issue_id text, p_request_digest text, p_evidence_digest text, p_analysis_base_sha text, p_nightly_head_sha text, p_ancestry_proof_digest text)
 RETURNS TABLE(queue_status text, run_id text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_existing public.testing_center_codex_execution_control%rowtype;
  v_loaded record;
  v_run_id text;
begin
  if p_technical_issue_id !~ '^issue_[0-9a-f]{64}$'
    or p_request_digest !~ '^[0-9a-f]{64}$'
    or p_evidence_digest !~ '^[0-9a-f]{64}$'
    or p_analysis_base_sha !~ '^[0-9a-f]{40}$'
    or p_nightly_head_sha !~ '^[0-9a-f]{40}$'
    or p_ancestry_proof_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'testing_center_codex_queue_invalid' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('testing-center-codex-issue:' || p_technical_issue_id, 0)
  );
  select * into v_loaded from public.testing_center_load_codex_evidence(p_technical_issue_id);
  if v_loaded.evidence_digest <> p_evidence_digest then
    raise exception 'testing_center_codex_evidence_digest_mismatch' using errcode = '22023';
  end if;

  select control.* into v_existing
  from public.testing_center_codex_execution_control as control
  where control.technical_issue_id = p_technical_issue_id;
  if found then
    if v_existing.request_digest <> p_request_digest
      or v_existing.evidence_digest <> p_evidence_digest
      or v_existing.analysis_base_sha <> p_analysis_base_sha
      or v_existing.nightly_head_sha <> p_nightly_head_sha
      or v_existing.ancestry_proof_digest <> p_ancestry_proof_digest then
      raise exception 'testing_center_codex_queue_conflict' using errcode = '23505';
    end if;
    return query select 'existing'::text, v_existing.run_id;
    return;
  end if;

  v_run_id := 'codex_run_' || pg_catalog.encode(
    public.digest(
      pg_catalog.convert_to(p_technical_issue_id || ':' || p_request_digest, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  insert into public.testing_center_codex_runs(
    run_id, technical_issue_id, attempt, state, origin
  ) values (v_run_id, p_technical_issue_id, 1, 'queued', 'orchestrator');
  insert into public.testing_center_codex_execution_control(
    technical_issue_id, run_id, request_digest, evidence_digest,
    analysis_base_sha, nightly_head_sha, ancestry_proof_digest
  ) values (
    p_technical_issue_id, v_run_id, p_request_digest, p_evidence_digest,
    p_analysis_base_sha, p_nightly_head_sha, p_ancestry_proof_digest
  );
  return query select 'queued'::text, v_run_id;
end
$function$
;
revoke all on function public.testing_center_queue_codex_dry_run(text,text,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.testing_center_queue_codex_dry_run(text,text,text,text,text,text) to service_role;
commit;
