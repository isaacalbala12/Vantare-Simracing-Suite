-- LOCAL ONLY: synthetic managed roles and account/membership contracts.
-- Never execute this bootstrap in a linked/remote Supabase project.
create role anon noinherit;
create role authenticated noinherit;
create role service_role noinherit bypassrls;
create role postgres login nosuperuser bypassrls createrole;
create schema auth;
create schema extensions;
create schema private;
grant usage on schema auth, extensions, public to anon, authenticated, service_role, postgres;
revoke create on schema public from public;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
create table public.profiles(id uuid primary key);
alter table public.profiles owner to postgres;
create table public.testing_center_memberships (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role text not null check (role in ('tester', 'primary_tester', 'owner')),
  active boolean not null default true
);
alter table public.testing_center_memberships enable row level security;
alter table public.testing_center_memberships force row level security;
alter table public.testing_center_memberships owner to postgres;
revoke all on public.testing_center_memberships from public, anon, authenticated;
create function public.testing_center_current_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.testing_center_memberships where user_id = auth.uid() and active
$$;
create function public.testing_center_can_view_channel(p_channel text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case public.testing_center_current_role()
    when 'owner' then p_channel in ('testers','nightly')
    when 'primary_tester' then p_channel in ('testers','nightly')
    when 'tester' then p_channel = 'testers'
    else false end
$$;
alter function public.testing_center_current_role() owner to postgres;
alter function public.testing_center_can_view_channel(text) owner to postgres;
revoke all on function public.testing_center_current_role(), public.testing_center_can_view_channel(text)
  from public, anon, service_role;
grant execute on function public.testing_center_current_role(), public.testing_center_can_view_channel(text)
  to authenticated;
-- Reproduce Supabase's broad defaults so tests catch missing explicit REVOKEs.
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant execute on functions to anon, authenticated, service_role;
alter schema public owner to postgres;
alter schema private owner to postgres;
grant usage on schema private to postgres;
grant select on public.testing_center_memberships to postgres;
