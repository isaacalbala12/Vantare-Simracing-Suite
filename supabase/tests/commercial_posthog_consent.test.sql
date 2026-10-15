begin;
select no_plan();
insert into private.clerk_issuers(issuer,authorized_parties,enabled) values
 ('https://consent-r9.clerk.invalid',array['https://app.invalid'],true);
insert into public.profiles(id) values
 ('16090000-0000-0000-0000-000000000101'),('16090000-0000-0000-0000-000000000102');
insert into public.account_identities(issuer,subject,account_id) values
 ('https://consent-r9.clerk.invalid','user_reporter','16090000-0000-0000-0000-000000000101'),
 ('https://consent-r9.clerk.invalid','user_owner','16090000-0000-0000-0000-000000000102');
insert into public.testing_center_reports(report_id,reporter_id,reporter_user_id,reporter_role,channel,state)
 values('report_'||repeat('a',64),'r9','16090000-0000-0000-0000-000000000101','tester','testers','submitted'),
 ('report_'||repeat('b',64),'r9-other','16090000-0000-0000-0000-000000000102','tester','testers','submitted');
insert into public.testing_center_report_payloads(report_id,action_text,expected_text,observed_text,app_version,os_family,os_version,module,include_diagnostic,include_logs,diagnostic_document,diagnostic_transport_digest)
 values('report_'||repeat('a',64),'Open','Expected','Observed','1.0.0','windows','Windows 11','account',true,false,'{}',repeat('a',64));
insert into public.testing_center_posthog_evidence(evidence_id,report_id,correlation_id,channel,app_version,candidate_sha,os_family,os_release,module,fault_source,fault_code,error_name,replay_consent,replay_available,replay_session_id,restricted_replay_url,replay_expires_at,linear_link_authorized,linear_link_authorized_by,linear_link_authorized_at,projection_digest,transport_digest,canonical_projection,error_expires_at)
 values('posthog_'||repeat('a',64),'report_'||repeat('a',64),'correlation_'||repeat('a',64),'testers','1.0.0',repeat('a',40),'windows','windows_11','account','backend','backend.operation.failed','Error',true,true,'session_fixture','https://eu.posthog.com/project/123/replay/session_fixture',now()+interval '7 days',true,'16090000-0000-0000-0000-000000000102',now(),repeat('a',64),repeat('b',64),'{}',now()+interval '30 days');
select throws_ok($$update public.testing_center_posthog_evidence set report_id='report_'||repeat('b',64),linear_link_authorized_by=null,linear_link_authorized=false,replay_consent=false,replay_available=false,replay_session_id=null,restricted_replay_url=null,replay_expires_at=null,linear_link_authorized_at=null$$,'28000','account_owner_is_immutable','privacy clear cannot reassign the report');
select set_config('request.jwt.claims','{"iss":"https://consent-r9.clerk.invalid","sub":"user_reporter","role":"authenticated","sid":"sess_r9","azp":"https://app.invalid"}',true);
set local role authenticated;
select lives_ok($$select public.testing_center_set_posthog_consent('report_'||repeat('a',64),true,false,'r9-revoke')$$,'reporter can revoke replay after Owner authorization');
reset role;
select ok((select not replay_consent and not replay_available and replay_session_id is null and restricted_replay_url is null and replay_expires_at is null and not linear_link_authorized and linear_link_authorized_by is null and linear_link_authorized_at is null from public.testing_center_posthog_evidence),'revocation clears all replay and authorization data');
select is((select count(*)::integer from public.testing_center_posthog_evidence),1,'diagnostic evidence preserved');
select is((select count(*)::integer from public.testing_center_posthog_consent_events),1,'consent event audited');
-- Removing authorizer metadata must still check that previous UUID's tombstone.
update public.testing_center_posthog_evidence set replay_consent=true,replay_available=true,replay_session_id='session_fixture',restricted_replay_url='https://eu.posthog.com/project/123/replay/session_fixture',replay_expires_at=now()+interval '7 days',linear_link_authorized=true,linear_link_authorized_by='16090000-0000-0000-0000-000000000102',linear_link_authorized_at=now();
select public.apply_clerk_user_event('r9-owner-delete',repeat('d',64),'https://consent-r9.clerk.invalid','user_owner','user.deleted',now(),null);
select throws_ok($$update public.testing_center_posthog_evidence set linear_link_authorized_by=null,linear_link_authorized=false,replay_consent=false,replay_available=false,replay_session_id=null,restricted_replay_url=null,replay_expires_at=null,linear_link_authorized_at=null$$,'28000','account_deleted','clear still checks the previous authorizer tombstone');
select * from finish();
rollback;
