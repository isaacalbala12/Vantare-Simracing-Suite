-- ISA-1508: actual database read without access to account or billing data.
begin;
create table if not exists public.supabase_heartbeat (
  id boolean primary key default true check (id)
);
insert into public.supabase_heartbeat (id) values (true) on conflict (id) do nothing;
alter table public.supabase_heartbeat enable row level security;
revoke all on public.supabase_heartbeat from public, anon, authenticated, service_role;
grant select on public.supabase_heartbeat to anon;
drop policy if exists supabase_heartbeat_read on public.supabase_heartbeat;
create policy supabase_heartbeat_read on public.supabase_heartbeat
  for select to anon using (true);
notify pgrst, 'reload schema';
commit;
