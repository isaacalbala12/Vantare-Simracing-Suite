-- ISA-222 / TAU-05A local rollback. This deletes triage decisions and pending
-- reservations, so production use would require a separate human decision.

revoke all on function public.testing_center_triage_report(text)
from public, anon, authenticated, service_role;
drop function public.testing_center_triage_report(text);

drop table public.testing_center_effect_outbox;
drop table public.testing_center_issue_occurrences;
drop table public.testing_center_triage_results;
