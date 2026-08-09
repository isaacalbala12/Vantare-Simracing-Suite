-- Rollback for CAL-02 race schedule publications.
--
-- Dropping the table takes the published and draft schedules with it. That is
-- recoverable: clients fall back to the schedule bundled in the binary, and the
-- owner can paste the text again. is_active_owner is dropped last because the
-- functions above depend on it.

drop function if exists public.race_schedule_my_draft();
drop function if exists public.race_schedule_current();
drop function if exists public.race_schedule_publish(uuid);
drop function if exists public.race_schedule_draft_save(text, jsonb, timestamptz, integer);

drop table if exists public.race_schedule_publications;

-- Only drop the owner helper if nothing else has come to depend on it since.
do $rollback$
begin
  if not exists (
    select 1
    from pg_catalog.pg_depend d
    join pg_catalog.pg_proc p on p.oid = d.refobjid
    where p.proname = 'is_active_owner'
      and d.deptype = 'n'
  ) then
    drop function if exists public.is_active_owner(uuid);
  end if;
end
$rollback$;
