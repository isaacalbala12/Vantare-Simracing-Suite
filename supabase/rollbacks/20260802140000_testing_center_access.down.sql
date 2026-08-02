-- ISA-210 / TAU-02C explicit rollback. Restores the TAU-02B server-only state.

drop policy if exists testing_center_candidates_select_channel
  on public.testing_center_candidate_builds;
drop policy if exists testing_center_issues_select_own
  on public.testing_center_technical_issues;
drop policy if exists testing_center_evidence_select_own
  on public.testing_center_evidence;
drop policy if exists testing_center_reports_select_own
  on public.testing_center_reports;
drop policy if exists testing_center_memberships_select_self
  on public.testing_center_memberships;

revoke select on table public.testing_center_memberships,
  public.testing_center_reports,
  public.testing_center_evidence,
  public.testing_center_technical_issues,
  public.testing_center_candidate_builds
from authenticated;

drop function if exists public.testing_center_validate_candidate(
  text, text, text, text, text, text
);
drop function if exists public.testing_center_can_view_channel(text);
drop function if exists public.testing_center_current_role();
drop table if exists public.testing_center_memberships;
