-- VANTA-131 step 0. This records the current managed-role RPC surface.
-- Run only against the disposable PostgreSQL bootstrap with Supabase defaults.
begin;
select plan(39);

select is(
  has_function_privilege(actor, signature, 'EXECUTE'), expected,
  actor || ' EXECUTE ' || signature
)
from (values
  ('public.race_schedule_draft_save(text,jsonb,timestamptz,integer)', true, true, true),
  ('public.race_schedule_publish(uuid)', true, true, true),
  ('public.race_schedule_current()', true, true, true),
  ('public.race_schedule_my_draft()', true, true, true),
  ('public.is_active_owner(uuid)', true, true, true),
  ('public.visual_roadmap_valid(jsonb)', false, false, false),
  ('public.visual_roadmap_publish(jsonb)', false, false, false),
  ('public.visual_roadmap_current()', true, true, false),
  ('public.visual_roadmap_current_v2()', true, true, false),
  ('public.visual_roadmap_sync(jsonb)', false, false, false),
  ('public.testing_participation_current(text)', false, true, true),
  ('public.testing_answer_save(uuid,smallint,text)', false, true, true),
  ('public.testing_contribution_submit(uuid,text,text,text)', false, true, true)
) as rpc(signature, anon_allowed, authenticated_allowed, service_allowed)
cross join lateral (values
  ('anon', anon_allowed),
  ('authenticated', authenticated_allowed),
  ('service_role', service_allowed)
) as principal(actor, expected);

select * from finish();
rollback;
