-- #1709 / VANTA-96, phase 2. Deploy the compatible Edge/adapters and updated
-- Hub/services client FIRST (72e15fdd2). This file does not deploy either one.
-- No remaining server caller needs the old JWT-resolving wrappers. Only the
-- typed testing_center_report_submit_admitted adapter is granted service_role.
begin;
set local lock_timeout='5s';

revoke all on function public.testing_center_submit_report(
  text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text
), public.testing_center_submit_report_with_evidence(
  text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text,uuid
), public.testing_center_submit_report_without_transport_size(
  text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text
) from public,anon,authenticated,service_role;

-- Preparing/finalizing uploads remains a scoped authenticated operation. Its
-- ownership checks, server byte validation and Storage RLS remain in force.
notify pgrst, 'reload schema';
commit;
