-- Historical pre-7b corpus: the runner executes this before final legacy retirement.
begin;
select plan(10);
select is((select count(*)::integer from public.testing_center_reports),0,
 'all historical parents drained');
select is((select count(*)::integer from private.testing_center_legacy_archive
 where source_table='public.testing_center_reports'),7,
 'all live historical states and invalid accounts archived');
select ok(not exists(select 1 from private.testing_center_legacy_archive
 where "row"->>'reporter_user_id'='18960000-0000-4000-8000-0000000007b5'),
 'predeleted account never enters the archive');
select is((select count(*)::integer from public.testing_contributions
 where legacy_source_id is not null),1,
 'only validated historical report maps');
select is((select state from public.testing_contributions
 where legacy_source_id='report_'||repeat('b',64)),'accepted',
 'validated maps to accepted terminal state');
select ok(not exists(select 1 from public.testing_contributions
 where legacy_source_id is not null and state='received'),
 'historical reports never reenter triage');
select ok(not exists(select 1 from public.testing_contributions
 where legacy_source_id in ('report_'||repeat('a',64),
  'report_'||repeat('c',64),'legacy_invalid_7b2',
  'report_'||repeat('d',64),'report_'||repeat('e',64),
  'report_'||repeat('f',64),'report_'||repeat('9',64))),
 'draft, closed, duplicate, incomplete, invalid and ineligible owners stay only in archive');
select ok(exists(select 1 from public.account_identities
 where account_id='18960000-0000-4000-8000-0000000007b5'
 and deleted_at is not null), 'deleted account fixture is a real tombstone');
select ok(not exists(select 1 from public.profiles
 where id='18960000-0000-4000-8000-0000000007b4'),
 'orphan fixture has no profile');
select is((select count(*)::integer from private.testing_center_legacy_archive
 where source_table='public.testing_center_reports'
 and source_id<>'report_'||repeat('b',64)),6,
 'six non-mappable live reports retain complete source rows');
select * from finish();
rollback;
