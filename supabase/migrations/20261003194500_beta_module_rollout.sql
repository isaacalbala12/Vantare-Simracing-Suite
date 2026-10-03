-- #1451: activation is server-owned; clients only receive signed capabilities.
begin;
create table public.module_rollout (
  module text primary key check (module in (
    'vantare.module.analysis', 'vantare.module.calendar',
    'vantare.module.engineer', 'vantare.module.strategy'
  )),
  enabled_for_all boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.module_rollout enable row level security;
revoke all on public.module_rollout from public, anon, authenticated;
grant select, insert, update, delete on public.module_rollout to service_role;
create policy module_rollout_service_role on public.module_rollout
  for all to service_role using (true) with check (true);
insert into public.module_rollout (module) values
  ('vantare.module.analysis'), ('vantare.module.calendar'),
  ('vantare.module.engineer'), ('vantare.module.strategy');
commit;
