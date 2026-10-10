-- Disposable LOCAL subset, not a replay of the full project/remote ACLs.
create role anon noinherit; create role authenticated noinherit; create role service_role noinherit bypassrls;
create schema auth;
create table auth.users(id uuid primary key,raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema public,auth to anon,authenticated,service_role;
revoke create on schema public from public;
create table public.profiles(id uuid primary key,display_name text default '');
create table public.account_identities(issuer text,subject text,account_id uuid references public.profiles(id),primary key(issuer,subject));
create table public.licenses(user_id uuid,tier text,is_active boolean);
create table public.operational_access_assignments(user_id uuid,role text,status text,expires_at timestamptz);
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', '')
  );

  INSERT INTO public.licenses (user_id, tier, is_active)
  VALUES (NEW.id, 'free', TRUE);

  RETURN NEW;
END;
$$;

-- ISA-210 / TAU-02C: server-derived roles, read-only RLS and one safe
-- candidate-validation RPC for testing-center.v1.

create table public.testing_center_memberships (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  actor_id text not null unique
    constraint testing_center_memberships_actor_check check (
      actor_id <> ''
      and actor_id !~ '^[[:space:]]|[[:space:]]$'
      and octet_length(actor_id) <= 256
    ),
  role text not null
    constraint testing_center_memberships_role_check check (
      role in ('tester', 'primary_tester', 'owner')
    ),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.testing_center_memberships enable row level security;
alter table public.testing_center_memberships force row level security;

revoke all on table public.testing_center_memberships from public, anon, authenticated;
grant select, insert, update, delete on table public.testing_center_memberships to service_role;

create or replace function public.testing_center_current_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select membership.role
  from public.testing_center_memberships as membership
  where membership.user_id = auth.uid()
    and membership.active
$$;

create or replace function public.testing_center_can_view_channel(p_channel text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case public.testing_center_current_role()
    when 'owner' then p_channel in ('nightly', 'testers')
    when 'primary_tester' then p_channel in ('nightly', 'testers')
    when 'tester' then p_channel = 'testers'
    else false
  end
$$;

revoke all on function public.testing_center_current_role() from public, anon;
revoke all on function public.testing_center_can_view_channel(text) from public, anon;
grant execute on function public.testing_center_current_role() to authenticated;
grant execute on function public.testing_center_can_view_channel(text) to authenticated;

