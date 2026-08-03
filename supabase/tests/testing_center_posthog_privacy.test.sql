begin;

select plan(33);

select has_table('public','testing_center_posthog_consent_events',
  'append-only PostHog consent events exist');
select has_table('public','testing_center_posthog_evidence',
  'private PostHog evidence exists');
select ok((select bool_and(relrowsecurity and relforcerowsecurity)
  from pg_class where oid=any(array[
    'public.testing_center_posthog_consent_events'::regclass,
    'public.testing_center_posthog_evidence'::regclass
  ])), 'PostHog tables force RLS');
select ok(
  not has_table_privilege('authenticated',
    'public.testing_center_posthog_consent_events','select')
  and not has_table_privilege('authenticated',
    'public.testing_center_posthog_evidence','select'),
  'testers cannot enumerate consent or replay evidence');
select ok(
  has_function_privilege('authenticated',
    'public.testing_center_set_posthog_consent(text,boolean,boolean,text)','execute')
  and not has_function_privilege('authenticated',
    'public.testing_center_record_posthog_evidence(jsonb,text,text,text,text)','execute'),
  'tester can only call the consent boundary');
select hasnt_column('public','testing_center_posthog_evidence','raw_message',
  'evidence stores no raw error message');
select hasnt_column('public','testing_center_posthog_evidence','raw_stack',
  'evidence stores no raw stack');
select hasnt_column('public','testing_center_posthog_evidence','logs',
  'evidence stores no logs');

insert into auth.users(id,email) values
  ('00000000-0000-4000-8000-000000000501','reporter@example.invalid'),
  ('00000000-0000-4000-8000-000000000502','other@example.invalid'),
  ('00000000-0000-4000-8000-000000000503','owner@example.invalid');

set local role service_role;
insert into public.testing_center_memberships(user_id,actor_id,role,active) values
  ('00000000-0000-4000-8000-000000000501','11111111-1111-4111-8111-111111111111','tester',true),
  ('00000000-0000-4000-8000-000000000502','22222222-2222-4222-8222-222222222222','tester',true),
  ('00000000-0000-4000-8000-000000000503','33333333-3333-4333-8333-333333333333','owner',true);
insert into public.testing_center_reports(
  report_id,reporter_id,reporter_user_id,reporter_role,channel,state
) values
  ('report_' || repeat('a',64),'isa253-reporter',
    '00000000-0000-4000-8000-000000000501','tester','nightly','submitted'),
  ('report_' || repeat('b',64),'isa253-reporter',
    '00000000-0000-4000-8000-000000000501','tester','nightly','submitted');
insert into public.testing_center_report_payloads(
  report_id,action_text,expected_text,observed_text,app_version,os_family,
  os_version,module,include_diagnostic,include_logs,diagnostic_document,
  diagnostic_transport_digest
) values
  ('report_' || repeat('a',64),'Open diagnostics','Form remains available',
    'Synthetic failure shown','1.0.0-nightly.253','windows','Windows 11 23H2',
    'testing_center',true,false,'{"synthetic":true}'::jsonb,repeat('a',64)),
  ('report_' || repeat('b',64),'Open diagnostics','Form remains available',
    'Synthetic failure shown','1.0.0-nightly.253','windows','Windows 11 23H2',
    'testing_center',false,false,null,null);
insert into public.testing_center_build_identities(
  build_identity_id,channel,app_version,candidate_sha,active,registered_by_id
) values ('build_' || repeat('a',64),'nightly','1.0.0-nightly.253',
  repeat('a',40),true,'isa253-test');
reset role;

create function pg_temp.posthog_projection(
  p_correlation_char text,p_replay boolean,p_fault_code text default
    'testing_center.submit.failed'
) returns jsonb language plpgsql as $$
declare v_projection jsonb; v_source text; v_digest text;
begin
  v_projection:=jsonb_build_object(
    'contractVersion','testing-center.posthog-evidence.v1',
    'operation','prepare_posthog_evidence',
    'reportId','report_' || repeat('a',64),
    'correlationId','correlation_' || repeat(p_correlation_char,64),
    'channel','nightly','appVersion','1.0.0-nightly.253',
    'candidateSha',repeat('a',40),'osFamily','windows','osRelease','windows_11',
    'module','testing_center','faultSource','frontend','faultCode',p_fault_code,
    'errorName','Error','diagnosticsConsent',true,
    'replayConsent',p_replay,'replayAvailable',p_replay,
    'replaySessionId',case when p_replay then 'session_isa253_abcd' else null end,
    'restrictedReplayUrl',case when p_replay then
      'https://eu.posthog.com/project/123/replay/session_isa253_abcd' else null end,
    'errorRetentionDays',30,'replayRetentionDays',7,
    'noPersonProfile',true,'noRawMessage',true,'noRawStack',true,'noLogs',true,
    'noCodexAuthority',true,'noPromotionAuthority',true,'projectionDigest','');
  v_source:=(v_projection-'projectionDigest')::text;
  v_digest:=encode(public.digest(convert_to(v_source,'UTF8'),'sha256'),'hex');
  return jsonb_set(v_projection,'{projectionDigest}',to_jsonb(v_digest));
end $$;

create function pg_temp.record_posthog(
  p_correlation_char text,p_replay boolean,p_fault_code text default
    'testing_center.submit.failed'
) returns table(evidence_id text,replay_available boolean,idempotent boolean)
language plpgsql as $$
declare v_projection jsonb; v_source text;
begin
  v_projection:=pg_temp.posthog_projection(
    p_correlation_char,p_replay,p_fault_code);
  v_source:=(v_projection-'projectionDigest')::text;
  return query select * from public.testing_center_record_posthog_evidence(
    v_projection,v_projection::text,v_source,v_projection->>'projectionDigest',
    encode(public.digest(convert_to(v_projection::text,'UTF8'),'sha256'),'hex'));
end $$;

select throws_ok($$
  select * from public.testing_center_set_posthog_consent(
    'report_' || repeat('a',64),true,false,'isa253-no-auth')
$$,'42501',null,'consent requires authentication');

set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000502';
set local role authenticated;
select throws_ok($$
  select * from public.testing_center_set_posthog_consent(
    'report_' || repeat('a',64),true,false,'isa253-other')
$$,'42501',null,'only the report owner can consent');
reset role;

set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000501';
set local role authenticated;
select throws_ok($$
  select * from public.testing_center_set_posthog_consent(
    'report_' || repeat('a',64),false,true,'isa253-invalid-replay')
$$,'22023',null,'replay cannot be enabled without diagnostic consent');
select throws_ok($$
  select * from public.testing_center_set_posthog_consent(
    'report_' || repeat('b',64),true,false,'isa253-not-previewed')
$$,'55000',null,'diagnostics must have been previewed in the report');
select is((select result_revision || ':' || result_idempotent
  from public.testing_center_set_posthog_consent(
    'report_' || repeat('a',64),true,false,'isa253-consent-1')),
  '1:false','reporter grants diagnostics separately from replay');
select is((select result_revision || ':' || result_idempotent
  from public.testing_center_set_posthog_consent(
    'report_' || repeat('a',64),true,false,'isa253-consent-1')),
  '1:true','identical consent retry is idempotent');
reset role;

select throws_ok($$
  select * from pg_temp.record_posthog('1',true)
$$,'42501',null,'replay evidence requires current replay consent');
select is((select replay_available || ':' || idempotent
  from pg_temp.record_posthog('1',false)),'false:false',
  'allowlisted error metadata records without replay');
select is((select idempotent from pg_temp.record_posthog('1',false)),true,
  'identical evidence retry is idempotent');
select throws_ok($$
  select * from pg_temp.record_posthog('1',false,'frontend.operation.failed')
$$,'23505',null,'same correlation cannot be mutated');
select throws_ok($$
  with p as (select pg_temp.posthog_projection('2',false) value)
  select result.* from p cross join lateral
    public.testing_center_record_posthog_evidence(
      p.value,p.value::text,(p.value-'projectionDigest')::text,
      p.value->>'projectionDigest',repeat('0',64)) result
$$,'22023',null,'transport digest tampering fails closed');

set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000501';
set local role authenticated;
select is((select result_revision from public.testing_center_set_posthog_consent(
  'report_' || repeat('a',64),false,false,'isa253-revoke-all')),2,
  'reporter can revoke diagnostic consent');
reset role;
select is((select count(*)::integer from public.testing_center_posthog_evidence),0,
  'diagnostic revocation removes local evidence');

set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000501';
set local role authenticated;
select is((select result_revision from public.testing_center_set_posthog_consent(
  'report_' || repeat('a',64),true,true,'isa253-replay-on')),3,
  'replay requires a fresh explicit consent revision');
reset role;
select is((select replay_available from pg_temp.record_posthog('3',true)),true,
  'valid replay evidence remains private and available');
select throws_ok($$
  select * from public.testing_center_authorize_posthog_linear_link(
    (select evidence_id from public.testing_center_posthog_evidence
      where correlation_id='correlation_' || repeat('3',64)),
    '00000000-0000-4000-8000-000000000502')
$$,'42501',null,'non-owner cannot authorize a Linear replay link');
select is((select result_authorized || ':' || result_idempotent
  from public.testing_center_authorize_posthog_linear_link(
    (select evidence_id from public.testing_center_posthog_evidence
      where correlation_id='correlation_' || repeat('3',64)),
    '00000000-0000-4000-8000-000000000503')),
  'true:false','owner explicitly authorizes the restricted Linear link');
select is((select linear_link_authorized_by::text
  from public.testing_center_posthog_evidence
  where correlation_id='correlation_' || repeat('3',64)),
  '00000000-0000-4000-8000-000000000503',
  'Linear authorization preserves the exact owner identity');

set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000501';
set local role authenticated;
select is((select result_revision from public.testing_center_set_posthog_consent(
  'report_' || repeat('a',64),true,false,'isa253-replay-off')),4,
  'reporter can revoke replay while preserving diagnostics');
reset role;
select ok((select not replay_available and restricted_replay_url is null
  and not linear_link_authorized and linear_link_authorized_by is null
  and linear_link_authorized_at is null
  from public.testing_center_posthog_evidence),
  'replay revocation clears URL and owner authorization');

set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000501';
set local role authenticated;
select * from public.testing_center_set_posthog_consent(
  'report_' || repeat('a',64),true,true,'isa253-replay-on-2');
reset role;
select * from pg_temp.record_posthog('4',true);
update public.testing_center_posthog_evidence
set created_at=now()-interval '8 days',
  error_expires_at=now()+interval '22 days',
  replay_expires_at=now()-interval '1 day'
where correlation_id='correlation_' || repeat('4',64);
select is((select result_replays_cleared || ':' || result_evidence_deleted
  from public.testing_center_expire_posthog_evidence(now())),
  '1:0','seven-day expiry removes only replay material');
update public.testing_center_posthog_evidence
set created_at=now()-interval '31 days',
  error_expires_at=now()-interval '1 day'
where correlation_id='correlation_' || repeat('4',64);
select is((select result_evidence_deleted
  from public.testing_center_expire_posthog_evidence(now())),1,
  'thirty-day expiry removes remaining error metadata');
update public.testing_center_posthog_evidence
set created_at=now()-interval '31 days',
  error_expires_at=now()-interval '1 day'
where correlation_id='correlation_' || repeat('3',64);
update public.testing_center_posthog_consent_events
set created_at=now()-interval '31 days',
  consent_expires_at=now()-interval '1 day'
where report_id='report_' || repeat('a',64);
select is((select result_evidence_deleted || ':' || result_consents_deleted
  from public.testing_center_expire_posthog_evidence(now())),
  '1:5','expired consent history is removed only after report evidence');
select throws_ok($$
  select * from public.testing_center_expire_posthog_evidence(now()+interval '1 day')
$$,'22023',null,'expiry worker rejects an untrusted future clock');
select is((select count(*)::integer from public.testing_center_codex_runs),0,
  'PostHog boundary creates no Codex run');
select is((select count(*)::integer from public.testing_center_promotions),0,
  'PostHog boundary creates no promotion');

select * from finish();
rollback;
