-- Disposable database only; run BEFORE 20261003200000_native_account_data.sql.
insert into auth.users(id,email) values ('00000000-0000-4000-8000-000000001449','legacy-test@example.invalid');
insert into public.profiles(id) values ('00000000-0000-4000-8000-000000001449') on conflict(id) do nothing;
insert into public.testing_center_memberships(user_id,actor_id,role) values
  ('00000000-0000-4000-8000-000000001449','fixture:legacy','tester');
insert into public.testing_center_reports(report_id,reporter_id,reporter_user_id,reporter_role,channel,state) values
  ('fixture:legacy-report','fixture:legacy','00000000-0000-4000-8000-000000001449','tester','testers','submitted');
insert into public.testing_center_report_submission_keys(reporter_user_id,idempotency_key,payload_digest,report_id) values
  ('00000000-0000-4000-8000-000000001449','fixture:legacy-key',repeat('a',64),'fixture:legacy-report');
insert into public.testing_center_report_events(event_id,report_id,actor_id,actor_user_id,actor_role,operation_digest) values
  ('fixture:legacy-event','fixture:legacy-report','fixture:legacy','00000000-0000-4000-8000-000000001449','tester',repeat('a',64));
insert into public.testing_center_evidence_batches(batch_id,reporter_user_id,channel,idempotency_key,manifest_digest) values
  ('00000000-0000-4000-8000-000000001449','00000000-0000-4000-8000-000000001449','testers','fixture:legacy-batch',repeat('a',64));
