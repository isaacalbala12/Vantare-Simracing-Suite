begin;
select no_plan();
select is((select count(*)::integer from public.testing_center_reports
 where reporter_user_id='18960000-0000-4000-8000-0000000007b2'),7,
 'rollback restores all legacy parents');
select is((select count(*)::integer from public.testing_center_codex_runs
 where run_id='legacy-7b2-run'),1,
 'rollback restores indirect descendants');
select is((select count(*)::integer from public.testing_center_audit
 where audit_id='legacy-7b2-audit'),1,
 'rollback restores the logical audit child');
select is((select count(*)::integer from public.testing_center_idempotency
 where aggregate_id='legacy-7b2-issue'),1,
 'rollback restores the logical idempotency child');
select is((select count(*)::integer from public.testing_center_report_submission_keys
 where report_id='report_'||repeat('7',64)),1,
 'rollback restores the submission key');
select is((select count(*)::integer from public.testing_center_report_events
 where event_id='legacy-7b2-event'),1,
 'rollback restores the submission event');
select is((select count(*)::integer from public.testing_center_triage_results
 where report_id='report_'||lpad('1',64,'0')),1,
 'rollback restores the triage result');
select is((select count(*)::integer from public.testing_center_issue_occurrences
 where report_id='report_'||repeat('7',64)),1,
 'rollback restores the issue occurrence');
select is((select count(*)::integer from public.testing_center_effect_supersessions
 where legacy_effect_id='effect_'||repeat('8',64)),1,
 'rollback restores the supersession');
select is((select count(*)::integer from public.testing_center_agent_jobs
 where technical_issue_id='legacy-7b2-issue'),1,
 'rollback restores the completed agent job');
select is((select count(*)::integer from public.testing_center_agent_callbacks
 where delivery_id='legacy-7b2-agent-callback'),1,
 'rollback restores the completed job child');
select is((select count(*)::integer from public.testing_center_linear_webhook_deliveries
 where delivery_id='18960000-0000-4000-8000-000000000713'),1,
 'rollback restores the completed Linear delivery');
select is((select count(*)::integer from public.testing_contributions
 where account_id='18960000-0000-4000-8000-0000000007b2'),0,
 'rollback removes only mapped v2 rows');
select ok(not exists (
 select 1 from private.testing_center_legacy_archive a
 where a.source_table='public.testing_center_reports'
   and not exists(select 1 from public.testing_center_reports r
     where r.report_id=a.source_id and to_jsonb(r)=a.row
       and a.row_sha256=encode(public.digest(convert_to(to_jsonb(r)::text,'UTF8'),'sha256'),'hex'))
 ),'restored parent rows exactly match archived JSON and hashes');
select ok(not exists (
 select 1 from private.testing_center_legacy_archive a
 where a.source_table in ('public.testing_center_report_payloads',
  'public.testing_center_evidence','public.testing_center_technical_issues',
  'public.testing_center_codex_runs','public.testing_center_audit',
  'public.testing_center_idempotency',
  'public.testing_center_report_submission_keys',
  'public.testing_center_report_events',
  'public.testing_center_triage_results',
  'public.testing_center_issue_occurrences')
 and not (
  a.source_table='public.testing_center_report_payloads' and exists(
    select 1 from public.testing_center_report_payloads r where to_jsonb(r)=a.row)
  or a.source_table='public.testing_center_evidence' and exists(
    select 1 from public.testing_center_evidence r where to_jsonb(r)=a.row)
  or a.source_table='public.testing_center_technical_issues' and exists(
    select 1 from public.testing_center_technical_issues r where to_jsonb(r)=a.row)
  or a.source_table='public.testing_center_codex_runs' and exists(
    select 1 from public.testing_center_codex_runs r where to_jsonb(r)=a.row)
  or a.source_table='public.testing_center_audit' and exists(
    select 1 from public.testing_center_audit r where to_jsonb(r)=a.row)
  or a.source_table='public.testing_center_idempotency' and exists(
    select 1 from public.testing_center_idempotency r where to_jsonb(r)=a.row)
  or a.source_table='public.testing_center_report_submission_keys' and exists(
    select 1 from public.testing_center_report_submission_keys r where to_jsonb(r)=a.row)
  or a.source_table='public.testing_center_report_events' and exists(
    select 1 from public.testing_center_report_events r where to_jsonb(r)=a.row)
  or a.source_table='public.testing_center_triage_results' and exists(
    select 1 from public.testing_center_triage_results r where to_jsonb(r)=a.row)
  or a.source_table='public.testing_center_issue_occurrences' and exists(
    select 1 from public.testing_center_issue_occurrences r where to_jsonb(r)=a.row))
 ),'restored direct and indirect descendants exactly match the archive');
select is((select count(*)::integer from private.testing_center_legacy_archive),26,
 'rollback retains the full private archive');
select * from finish();
rollback;
