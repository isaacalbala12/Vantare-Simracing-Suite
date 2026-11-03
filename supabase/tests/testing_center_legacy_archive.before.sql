-- Characterization fixture: a populated legacy report with direct and indirect children.
begin;
insert into auth.users(id,email) values
 ('18960000-0000-4000-8000-0000000007b2','legacy-7b2@example.invalid')
on conflict (id) do nothing;
insert into public.profiles(id) values
 ('18960000-0000-4000-8000-0000000007b2') on conflict (id) do nothing;
insert into public.testing_center_reports
 (report_id,reporter_id,reporter_user_id,reporter_role,channel,state)
values ('report_'||repeat('7',64),'legacy-7b2',
 '18960000-0000-4000-8000-0000000007b2','tester','nightly','submitted');
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
values ('legacy-7b2-run','legacy-7b2-issue',1,'queued','orchestrator');
select case when (select count(*) from public.testing_center_reports
 where report_id='report_'||repeat('7',64))=1
 and (select count(*) from public.testing_center_codex_runs
 where run_id='legacy-7b2-run')=1 then true
 else 1/0=0 end as legacy_fixture_present;
commit;
