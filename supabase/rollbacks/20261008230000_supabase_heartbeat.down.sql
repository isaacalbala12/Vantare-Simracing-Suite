-- Disable the latido workflow before applying this rollback.
begin;
drop table if exists public.supabase_heartbeat;
notify pgrst, 'reload schema';
commit;
