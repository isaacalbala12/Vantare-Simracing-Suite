-- Restore the exact effective managed-role surface characterized by VANTA-131 step 0.
begin;
set local lock_timeout = '5s';
grant execute on function public.race_schedule_draft_save(text,jsonb,timestamptz,integer)
  to public, authenticated;
grant execute on function public.race_schedule_publish(uuid)
  to public, authenticated;
grant execute on function public.race_schedule_my_draft()
  to public, authenticated;
grant execute on function public.is_active_owner(uuid)
  to public, authenticated;
commit;
