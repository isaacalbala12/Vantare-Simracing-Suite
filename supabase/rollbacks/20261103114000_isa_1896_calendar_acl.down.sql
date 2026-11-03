-- Restore the effective managed-role surface without granting to PUBLIC.
begin;
set local lock_timeout = '5s';
revoke all on function public.race_schedule_draft_save(text,jsonb,timestamptz,integer)
  from public, anon, authenticated, service_role;
revoke all on function public.race_schedule_publish(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.race_schedule_my_draft()
  from public, anon, authenticated, service_role;
revoke all on function public.is_active_owner(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.race_schedule_draft_save(text,jsonb,timestamptz,integer)
  to anon, authenticated, service_role;
grant execute on function public.race_schedule_publish(uuid)
  to anon, authenticated, service_role;
grant execute on function public.race_schedule_my_draft()
  to anon, authenticated, service_role;
grant execute on function public.is_active_owner(uuid)
  to anon, authenticated, service_role;
commit;
