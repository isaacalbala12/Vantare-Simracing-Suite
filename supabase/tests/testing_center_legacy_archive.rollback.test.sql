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
  'public.testing_center_idempotency')
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
    select 1 from public.testing_center_idempotency r where to_jsonb(r)=a.row))
 ),'restored direct and indirect descendants exactly match the archive');
select is((select count(*)::integer from private.testing_center_legacy_archive),13,
 'rollback retains the full private archive');
select * from finish();
rollback;
