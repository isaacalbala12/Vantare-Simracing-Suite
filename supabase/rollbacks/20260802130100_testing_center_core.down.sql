-- ISA-209 / TAU-02B explicit rollback. Only objects owned by this migration
-- are removed, in reverse dependency order.

drop table if exists public.testing_center_pauses;
drop table if exists public.testing_center_idempotency;
drop table if exists public.testing_center_audit;
drop table if exists public.testing_center_promotions;
drop table if exists public.testing_center_validations;
drop table if exists public.testing_center_candidate_builds;
drop table if exists public.testing_center_codex_runs;
drop table if exists public.testing_center_technical_issues;
drop table if exists public.testing_center_evidence;
drop table if exists public.testing_center_reports;
