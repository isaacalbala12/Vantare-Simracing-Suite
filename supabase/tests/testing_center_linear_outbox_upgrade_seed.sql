-- Upgrade fixture for ISA-239. It represents the inert GitHub destination in
-- pending, failed and completed states plus two claim-rejection probes.

insert into auth.users(id, email) values
  ('00000000-0000-4000-8000-000000000739', 'isa239-owner@example.invalid');

set role service_role;

insert into public.testing_center_pauses(
  pause_id, scope, technical_issue_id, is_paused, reason_code,
  requested_by_id, requested_by_user_id, requested_by_role
) values (
  'isa239-cutover-pause', 'global', null, true, 'linear_cutover',
  'isa239-owner', '00000000-0000-4000-8000-000000000739', 'owner'
);

insert into public.testing_center_reports(
  report_id, reporter_id, reporter_user_id, reporter_role, channel, state,
  created_at, updated_at
)
select
  'legacy_report_' || suffix, 'isa239-tester',
  '00000000-0000-4000-8000-000000000739', 'primary_tester',
  'nightly', 'validated', '2026-08-03T08:00:00Z', '2026-08-03T08:00:00Z'
from (values ('pending'), ('failed'), ('completed'), ('active'), ('expired')) seed(suffix);

insert into public.testing_center_report_payloads(
  report_id, action_text, expected_text, observed_text, context_text,
  app_version, os_family, os_version, module,
  include_diagnostic, include_logs, diagnostic_document,
  diagnostic_transport_digest
)
select
  'legacy_report_' || suffix,
  'Open legacy ' || suffix,
  'Legacy flow remains stable',
  'Legacy flow reports ' || suffix,
  null,
  '0.7.39-' || suffix,
  'windows', 'Windows 11', 'testing_center',
  false, false, null, null
from (values ('pending'), ('failed'), ('completed'), ('active'), ('expired')) seed(suffix);

insert into public.testing_center_report_events(
  event_id, report_id, actor_id, actor_user_id, actor_role, operation_digest
)
select
  'legacy_event_' || suffix,
  'legacy_report_' || suffix,
  'isa239-tester', '00000000-0000-4000-8000-000000000739',
  'primary_tester', pg_catalog.encode(public.digest(
    pg_catalog.convert_to('legacy-event-' || suffix, 'UTF8'), 'sha256'), 'hex')
from (values ('pending'), ('failed'), ('completed'), ('active'), ('expired')) seed(suffix);

insert into public.testing_center_technical_issues(
  technical_issue_id, report_id, state, flow_state, origin,
  created_at, updated_at
)
select
  'issue_legacy_' || suffix,
  'legacy_report_' || suffix,
  'open', 'reported', 'orchestrator',
  '2026-08-03T08:00:00Z', '2026-08-03T08:00:00Z'
from (values ('pending'), ('failed'), ('completed'), ('active'), ('expired')) seed(suffix);

insert into public.testing_center_issue_occurrences(
  report_id, technical_issue_id, is_primary, technical_fingerprint,
  functional_fingerprint, compatibility_digest, created_at
)
select
  'legacy_report_' || suffix,
  'issue_legacy_' || suffix,
  true, null,
  pg_catalog.encode(public.digest(
    pg_catalog.convert_to('legacy-functional-' || suffix, 'UTF8'), 'sha256'), 'hex'),
  pg_catalog.encode(public.digest(
    pg_catalog.convert_to('legacy-compatible-' || suffix, 'UTF8'), 'sha256'), 'hex'),
  '2026-08-03T08:00:00Z'
from (values ('pending'), ('failed'), ('completed'), ('active'), ('expired')) seed(suffix);

insert into public.testing_center_effect_outbox(
  effect_id, effect_key, effect_type, technical_issue_id, primary_report_id,
  state, attempt_count, next_attempt_at, last_error_code,
  external_issue_number, external_issue_node_id, created_at, updated_at
) values
  ('effect_' || repeat('1', 64), 'github_issue_create:issue_legacy_pending',
   'github_issue_create', 'issue_legacy_pending', 'legacy_report_pending',
   'pending', 0, null, null, null, null,
   '2026-08-03T08:00:00Z', '2026-08-03T08:01:00Z'),
  ('effect_' || repeat('2', 64), 'github_issue_create:issue_legacy_failed',
   'github_issue_create', 'issue_legacy_failed', 'legacy_report_failed',
   'failed', 3, '2026-08-04T09:00:00Z', 'github_timeout', null, null,
   '2026-08-03T08:00:00Z', '2026-08-03T08:02:00Z'),
  ('effect_' || repeat('3', 64), 'github_issue_create:issue_legacy_completed',
   'github_issue_create', 'issue_legacy_completed', 'legacy_report_completed',
   'completed', 1, null, null, 739, 'legacy-node-739',
   '2026-08-03T08:00:00Z', '2026-08-03T08:03:00Z'),
  ('effect_' || repeat('4', 64), 'github_issue_create:issue_legacy_active',
   'github_issue_create', 'issue_legacy_active', 'legacy_report_active',
   'pending', 0, null, null, null, null,
   '2026-08-03T08:00:00Z', '2026-08-03T08:04:00Z'),
  ('effect_' || repeat('5', 64), 'github_issue_create:issue_legacy_expired',
   'github_issue_create', 'issue_legacy_expired', 'legacy_report_expired',
   'pending', 0, null, null, null, null,
   '2026-08-03T08:00:00Z', '2026-08-03T08:05:00Z');

reset role;

create table public.isa239_legacy_expected as
select * from public.testing_center_effect_outbox;
