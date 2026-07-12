-- Backfill profiles for existing auth users after enabling licensing schema.
-- Safe/idempotent: only inserts missing profiles.
-- Runs after 20260709120000 (email, language, primary_simulator, onboarding_completed exist).

insert into public.profiles (
  id,
  display_name,
  avatar_url,
  preferred_sim,
  email,
  language,
  primary_simulator,
  onboarding_completed
)
select
  u.id,
  coalesce(
    u.raw_user_meta_data->>'full_name',
    u.raw_user_meta_data->>'name',
    split_part(u.email, '@', 1),
    'Vantare User'
  ) as display_name,
  u.raw_user_meta_data->>'avatar_url' as avatar_url,
  'lmu' as preferred_sim,
  u.email as email,
  'es' as language,
  'lmu' as primary_simulator,
  false as onboarding_completed
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;