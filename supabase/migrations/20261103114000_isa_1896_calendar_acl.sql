-- VANTA-131 step 3: keep the published calendar public, close uncalled owner RPCs.
begin;
set local lock_timeout = '5s';
revoke all on function public.race_schedule_draft_save(text,jsonb,timestamptz,integer)
  from public, anon, authenticated;
revoke all on function public.race_schedule_publish(uuid)
  from public, anon, authenticated;
revoke all on function public.race_schedule_my_draft()
  from public, anon, authenticated;
revoke all on function public.is_active_owner(uuid)
  from public, anon, authenticated;
grant execute on function public.race_schedule_draft_save(text,jsonb,timestamptz,integer)
  to service_role;
grant execute on function public.race_schedule_publish(uuid) to service_role;
grant execute on function public.race_schedule_my_draft() to service_role;
grant execute on function public.is_active_owner(uuid) to service_role;
grant execute on function public.race_schedule_current() to anon;
commit;
