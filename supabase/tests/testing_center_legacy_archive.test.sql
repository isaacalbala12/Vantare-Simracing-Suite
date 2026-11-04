begin;
select no_plan();
select is((select count(*)::integer from public.testing_center_reports),0,
 'legacy parent is empty after the atomic move');
select is((select count(*)::integer from private.testing_center_legacy_archive
 where source_table='public.testing_center_reports'),7,
 'all seven parent rows are archived');
select is((select count(*)::integer from private.testing_center_legacy_archive
 where source_table in ('public.testing_center_report_payloads',
  'public.testing_center_evidence','public.testing_center_technical_issues',
  'public.testing_center_codex_runs')),4,
 'direct and indirect children are archived');
select ok(not exists(select 1 from private.testing_center_legacy_archive
 where row_sha256 <> encode(public.digest(convert_to(row::text,'UTF8'),'sha256'),'hex')),
 'all archive row hashes match their complete JSON rows');
select is((select count(*)::integer from public.testing_contributions
 where legacy_source_id is not null and account_id=
 '18960000-0000-4000-8000-0000000007b2'),7,
 'all seven reports map despite the normal five-per-day quota');
select is((select title from public.testing_contributions
 where legacy_source_id='report_'||repeat('7',64)),'Open the Hub',
 'the v2 title comes from the admitted legacy payload');
select ok(not has_table_privilege('anon','private.testing_center_legacy_archive','select')
 and not has_table_privilege('authenticated','private.testing_center_legacy_archive','select')
 and not has_table_privilege('service_role','private.testing_center_legacy_archive','select')
 and not has_table_privilege('vantare_triage','private.testing_center_legacy_archive','select'),
 'archive is inaccessible to API roles');
select is((select report_metadata->>'app_version' from public.testing_report_followup f
 join public.testing_contributions c on c.id=f.contribution_id
 where c.legacy_source_id='report_'||repeat('7',64)), '1.0.0',
 'admitted diagnostic metadata reaches the v2 followup');
select is((select count(*)::integer from public.testing_center_codex_runs
 where run_id='legacy-7b2-run'),0,'indirect child is emptied');
select * from finish();
rollback;
