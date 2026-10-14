begin;
select plan(8);
select is((select active from public.testing_center_memberships where actor_id = 'fixture:legacy'),true,'legacy membership preserved');
select is((select state from public.testing_center_reports where report_id = 'fixture:legacy-report'),'submitted','legacy report preserved');
select is((select count(*)::integer from public.testing_center_report_submission_keys where idempotency_key = 'fixture:legacy-key'),1,'legacy submission key preserved');
select is((select count(*)::integer from public.testing_center_report_events where event_id = 'fixture:legacy-event'),1,'legacy event preserved');
select is((select count(*)::integer from public.testing_center_evidence_batches where idempotency_key = 'fixture:legacy-batch'),1,'legacy screenshot batch preserved');
select is((select count(*)::integer from pg_constraint where contype = 'f' and confrelid = 'public.profiles'::regclass
  and conrelid in ('public.testing_center_memberships'::regclass,'public.testing_center_reports'::regclass,
    'public.testing_center_report_submission_keys'::regclass,'public.testing_center_report_events'::regclass,
    'public.testing_center_evidence_batches'::regclass)),5,'five validated internal-account FKs');
select ok(exists(select 1 from pg_constraint where conrelid = 'public.testing_center_validations'::regclass
  and confrelid = 'auth.users'::regclass),'unrelated validation lifecycle untouched');
select throws_ok($$insert into public.testing_center_memberships(user_id,actor_id,role)
  values('00000000-0000-4000-8000-000000000000','fixture:missing','tester')$$,
  '23503',null,'missing internal account remains rejected by FK');
select * from finish();
rollback;
