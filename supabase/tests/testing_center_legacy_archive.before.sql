-- Characterization fixture: a populated legacy report with direct and indirect children.
begin;
insert into public.profiles(id) values
 ('18960000-0000-4000-8000-0000000007b2') on conflict (id) do nothing;
insert into private.clerk_issuers(issuer,authorized_parties,enabled)
values('https://vanta131-archive.clerk.invalid',array['https://app.invalid'],true);
insert into public.account_identities(issuer,subject,account_id)
values('https://vanta131-archive.clerk.invalid',
 'user_legacyarchive7b2','18960000-0000-4000-8000-0000000007b2');
insert into public.testing_center_reports
 (report_id,reporter_id,reporter_user_id,reporter_role,channel,state)
values ('report_'||repeat('7',64),'legacy-7b2',
 '18960000-0000-4000-8000-0000000007b2','tester','nightly','submitted');
-- More than the normal daily v2 quota: migration must preserve pilot history.
insert into public.testing_center_reports
 (report_id,reporter_id,reporter_user_id,reporter_role,channel,state)
select 'report_'||lpad(n::text,64,'0'),'legacy-7b2',
 '18960000-0000-4000-8000-0000000007b2','tester','nightly','submitted'
from generate_series(1,6) n;
insert into public.testing_center_report_payloads
 (report_id,action_text,expected_text,observed_text,app_version,os_family,
  os_version,module,include_diagnostic,include_logs)
values ('report_'||repeat('7',64),'Open the Hub','It opens','It closes',
 '1.0.0','windows','Windows 11','hub',false,false);
insert into public.testing_center_evidence(evidence_id,report_id,kind,digest)
values ('legacy-7b2-evidence','report_'||repeat('7',64),'reproduction',repeat('7',64));
insert into public.testing_center_technical_issues
 (technical_issue_id,report_id,state,flow_state,origin)
values ('legacy-7b2-issue','report_'||repeat('7',64),'open','reported','testing_center');
insert into public.testing_center_codex_runs
 (run_id,technical_issue_id,attempt,state,origin)
values ('legacy-7b2-run','legacy-7b2-issue',1,'completed','orchestrator');
insert into public.testing_center_audit
 (audit_id,aggregate_id,from_state,to_state,origin,actor_id,operation_digest)
values ('legacy-7b2-audit','legacy-7b2-issue','reported','queued',
 'orchestrator','legacy-7b2-actor',repeat('7',64));
insert into public.testing_center_idempotency
 (idempotency_key,payload_digest,aggregate_id,from_state,to_state,origin)
values ('legacy-7b2-key',repeat('7',64),'legacy-7b2-issue',
 'reported','queued','orchestrator');
insert into public.testing_center_report_submission_keys
 (reporter_user_id,idempotency_key,payload_digest,report_id)
values ('18960000-0000-4000-8000-0000000007b2','legacy-7b2-submit',
 repeat('7',64),'report_'||repeat('7',64));
insert into public.testing_center_report_events
 (event_id,report_id,actor_id,actor_user_id,actor_role,operation_digest)
values ('legacy-7b2-event','report_'||repeat('7',64),'legacy-7b2',
 '18960000-0000-4000-8000-0000000007b2','tester',repeat('7',64));
insert into public.testing_center_triage_results
 (report_id,triage_state,incomplete_reason)
values ('report_'||lpad('1',64,'0'),'incomplete','missing_server_context');
insert into public.testing_center_issue_occurrences
 (report_id,technical_issue_id,is_primary,functional_fingerprint,
  compatibility_digest)
values ('report_'||repeat('7',64),'legacy-7b2-issue',true,
 repeat('7',64),repeat('7',64));
do $$ begin
  if (select count(*) from public.testing_center_reports
    where reporter_user_id='18960000-0000-4000-8000-0000000007b2')<>7
    or (select count(*) from public.testing_center_codex_runs
      where run_id='legacy-7b2-run')<>1 then
    raise exception 'legacy_fixture_missing' using errcode='55000';
  end if;
end $$;
commit;
