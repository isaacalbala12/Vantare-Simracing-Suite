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
insert into public.testing_center_effect_outbox
 (effect_id,effect_key,effect_type,technical_issue_id,primary_report_id,state)
values
 ('effect_'||repeat('8',64),'github_issue_create:legacy7b2',
  'github_issue_create','legacy-7b2-issue','report_'||repeat('7',64),'superseded'),
 ('effect_'||repeat('9',64),'linear_issue_create:legacy7b2',
  'linear_issue_create','legacy-7b2-issue','report_'||repeat('7',64),'completed');
insert into public.testing_center_issue_destinations
 (technical_issue_id,destination,active_effect_id)
values ('legacy-7b2-issue','linear','effect_'||repeat('9',64));
insert into public.testing_center_linear_issue_bindings
 (external_issue_id,organization_id,technical_issue_id,effect_id,bound_by_id)
values ('18960000-0000-4000-8000-000000000711',
 '18960000-0000-4000-8000-000000000712','legacy-7b2-issue',
 'effect_'||repeat('9',64),'legacy-7b2-actor');
insert into public.testing_center_linear_webhook_deliveries
 (delivery_id,webhook_id,organization_id,external_issue_id,event_name,
  event_action,webhook_timestamp_ms,event_created_at,payload_digest,outcome)
values ('18960000-0000-4000-8000-000000000713',
 '18960000-0000-4000-8000-000000000714',
 '18960000-0000-4000-8000-000000000712',
 '18960000-0000-4000-8000-000000000711','Issue','update',1,now(),
 repeat('7',64),'applied');
insert into public.testing_center_effect_supersessions
 (legacy_effect_id,superseded_by_effect_id,prior_state,prior_attempt_count,
  prior_updated_at)
values ('effect_'||repeat('8',64),'effect_'||repeat('9',64),'pending',0,now());
insert into public.testing_center_agent_jobs
 (job_key,technical_issue_id,execution_generation,policy_version,
  report_digest,dossier_digest,nightly_base_sha,state)
values (public.testing_center_agent_job_key('legacy-7b2-issue',repeat('7',64),
  repeat('a',40),'testing-center.autofix-policy.v2'),
  'legacy-7b2-issue',1,'testing-center.autofix-policy.v2',repeat('7',64),
  repeat('7',64),repeat('a',40),'completed');
insert into public.testing_center_agent_effect_outbox
 (effect_id,job_key,effect_kind,effect_target,effect_generation,
  payload_digest,state,dispatch_reserved)
values ('legacy-7b2-agent-effect',
  public.testing_center_agent_job_key('legacy-7b2-issue',repeat('7',64),
    repeat('a',40),'testing-center.autofix-policy.v2'),
  'github_dispatch','triage',1,repeat('7',64),'completed',true);
insert into public.testing_center_agent_callbacks
 (delivery_id,job_key,head_sha,callback_kind,outcome,payload_digest,disposition)
values ('legacy-7b2-agent-callback',
  public.testing_center_agent_job_key('legacy-7b2-issue',repeat('7',64),
    repeat('a',40),'testing-center.autofix-policy.v2'),
  repeat('a',40),'fix','accepted',repeat('7',64),'applied');
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
