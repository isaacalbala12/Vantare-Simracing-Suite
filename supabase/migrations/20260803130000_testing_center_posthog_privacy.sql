-- ISA-253 / TAU-07H1: local PostHog privacy boundary. This migration stores
-- no raw message, stack, log, profile or person identity and performs no
-- PostHog, Linear, Codex, Discord, Git or promotion side effect.

begin;

create table public.testing_center_posthog_consent_events (
  consent_event_id text primary key
    check (consent_event_id ~ '^posthog_consent_[0-9a-f]{64}$'),
  report_id text not null
    references public.testing_center_reports(report_id) on delete restrict,
  revision integer not null check (revision between 1 and 1000),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  diagnostics_consent boolean not null,
  replay_consent boolean not null,
  idempotency_key text not null unique check (
    idempotency_key <> '' and octet_length(idempotency_key) <= 256
  ),
  operation_digest text not null
    check (operation_digest ~ '^[0-9a-f]{64}$'),
  consent_expires_at timestamptz not null default (now()+interval '30 days'),
  created_at timestamptz not null default now(),
  constraint testing_center_posthog_consent_replay_check
    check (not replay_consent or diagnostics_consent),
  constraint testing_center_posthog_consent_retention_check
    check (consent_expires_at=created_at+interval '30 days'),
  unique(report_id,revision)
);
create index testing_center_posthog_consent_latest_idx
  on public.testing_center_posthog_consent_events(report_id,revision desc);
create index testing_center_posthog_consent_expiry_idx
  on public.testing_center_posthog_consent_events(consent_expires_at);

create table public.testing_center_posthog_evidence (
  evidence_id text primary key check (evidence_id ~ '^posthog_[0-9a-f]{64}$'),
  report_id text not null
    references public.testing_center_reports(report_id) on delete restrict,
  correlation_id text not null unique
    check (correlation_id ~ '^correlation_[0-9a-f]{64}$'),
  channel text not null check (channel in ('nightly','testers')),
  app_version text not null check (
    app_version ~ '^[A-Za-z0-9][A-Za-z0-9._+-]{0,31}$'
  ),
  candidate_sha text not null check (candidate_sha ~ '^[0-9a-f]{40}$'),
  os_family text not null check (os_family='windows'),
  os_release text not null check (os_release in ('windows_10','windows_11')),
  module text not null check (module in (
    'hub','launcher','settings','overlay_studio','overlay_runtime','telemetry',
    'telemetry_analysis','engineer','strategy','calendar','billing','account',
    'updater','testing_center'
  )),
  fault_source text not null check (fault_source in ('frontend','backend')),
  fault_code text not null check (fault_code in (
    'frontend.unhandled.exception','frontend.operation.failed',
    'backend.operation.failed','testing_center.submit.failed'
  )),
  error_name text not null check (error_name in (
    'Error','AggregateError','RangeError','ReferenceError','SyntaxError',
    'TypeError','URIError','BackendFailure'
  )),
  replay_consent boolean not null,
  replay_available boolean not null,
  replay_session_id text,
  restricted_replay_url text,
  linear_link_authorized boolean not null default false,
  linear_link_authorized_by uuid references auth.users(id) on delete restrict,
  linear_link_authorized_at timestamptz,
  projection_digest text not null unique
    check (projection_digest ~ '^[0-9a-f]{64}$'),
  transport_digest text not null unique
    check (transport_digest ~ '^[0-9a-f]{64}$'),
  canonical_projection jsonb not null,
  error_expires_at timestamptz not null,
  replay_expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint testing_center_posthog_replay_shape check (
    (not replay_consent and not replay_available and replay_session_id is null
      and restricted_replay_url is null and replay_expires_at is null
      and not linear_link_authorized and linear_link_authorized_by is null
      and linear_link_authorized_at is null)
    or (replay_consent and replay_available and replay_session_id is not null
      and restricted_replay_url is not null and replay_expires_at is not null)
  ),
  constraint testing_center_posthog_linear_authorization_shape check (
    linear_link_authorized = (linear_link_authorized_by is not null
      and linear_link_authorized_at is not null)
  ),
  constraint testing_center_posthog_retention_check check (
    error_expires_at = created_at + interval '30 days'
    and (replay_expires_at is null
      or replay_expires_at = created_at + interval '7 days')
  )
);
create index testing_center_posthog_expiry_idx
  on public.testing_center_posthog_evidence(error_expires_at,replay_expires_at);

alter table public.testing_center_posthog_consent_events enable row level security;
alter table public.testing_center_posthog_consent_events force row level security;
alter table public.testing_center_posthog_evidence enable row level security;
alter table public.testing_center_posthog_evidence force row level security;

revoke all on table public.testing_center_posthog_consent_events,
  public.testing_center_posthog_evidence
from public,anon,authenticated,service_role;
grant select on table public.testing_center_posthog_consent_events,
  public.testing_center_posthog_evidence to service_role;

create function public.testing_center_set_posthog_consent(
  p_report_id text,
  p_diagnostics_consent boolean,
  p_replay_consent boolean,
  p_idempotency_key text
)
returns table(
  result_consent_event_id text,
  result_revision integer,
  result_diagnostics_consent boolean,
  result_replay_consent boolean,
  result_idempotent boolean
)
language plpgsql security definer set search_path='' as $$
declare
  v_user_id uuid := auth.uid();
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
end $$;

create function public.testing_center_record_posthog_evidence(
  p_projection jsonb,
  p_canonical_projection text,
  p_projection_digest_source text,
  p_projection_digest text,
  p_transport_digest text
)
returns table(
  result_evidence_id text,
  result_replay_available boolean,
  result_idempotent boolean
)
language plpgsql security definer set search_path='' as $$
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
end $$;

create function public.testing_center_authorize_posthog_linear_link(
  p_evidence_id text,
  p_owner_user_id uuid
)
returns table(result_authorized boolean,result_idempotent boolean)
language plpgsql security definer set search_path='' as $$
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
end $$;

create function public.testing_center_expire_posthog_evidence(p_now timestamptz)
returns table(
  result_replays_cleared integer,
  result_evidence_deleted integer,
  result_consents_deleted integer
)
language plpgsql security definer set search_path='' as $$
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
end $$;

revoke all on function public.testing_center_set_posthog_consent(
  text,boolean,boolean,text) from public,anon,service_role;
grant execute on function public.testing_center_set_posthog_consent(
  text,boolean,boolean,text) to authenticated;

do $$ declare v_signature text; begin
  foreach v_signature in array array[
    'testing_center_record_posthog_evidence(jsonb,text,text,text,text)',
    'testing_center_authorize_posthog_linear_link(text,uuid)',
    'testing_center_expire_posthog_evidence(timestamptz)'
  ] loop
    execute 'revoke all on function public.' || v_signature
      || ' from public,anon,authenticated';
    execute 'grant execute on function public.' || v_signature || ' to service_role';
  end loop;
end $$;

comment on table public.testing_center_posthog_consent_events is
  'TAU-07H1 append-only reporter consent; no PostHog identity or payload.';
comment on table public.testing_center_posthog_evidence is
  'TAU-07H1 private allowlisted metadata and restricted replay link.';

commit;
