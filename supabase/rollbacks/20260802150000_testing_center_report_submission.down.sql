-- Roll back ISA-218 / TAU-04A without weakening the TAU-02 access layer.

revoke execute on function public.testing_center_submit_report(
  text, text, text, text, text, text, text, text, text, text,
  boolean, boolean, text, text, text
) from authenticated;
revoke all on function public.testing_center_submit_report(
  text, text, text, text, text, text, text, text, text, text,
  boolean, boolean, text, text, text
) from public, anon;

drop function public.testing_center_submit_report(
  text, text, text, text, text, text, text, text, text, text,
  boolean, boolean, text, text, text
);

drop policy testing_center_report_payloads_select_own
  on public.testing_center_report_payloads;

revoke select on table public.testing_center_report_payloads from authenticated;
revoke all on table public.testing_center_report_payloads,
  public.testing_center_report_submission_keys,
  public.testing_center_report_events
from public, anon, authenticated, service_role;

drop table public.testing_center_report_events;
drop table public.testing_center_report_submission_keys;
drop table public.testing_center_report_payloads;
