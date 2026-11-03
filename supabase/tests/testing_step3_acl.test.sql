-- VANTA-131 step 3: explicit calendar RPC privileges after containment.
begin;
select plan(15);
select is(has_function_privilege(actor, signature, 'EXECUTE'), expected,
  actor || ' EXECUTE ' || signature)
from (values
  ('public.race_schedule_draft_save(text,jsonb,timestamptz,integer)', false, false, false),
  ('public.race_schedule_publish(uuid)', false, false, false),
  ('public.race_schedule_my_draft()', false, false, false),
  ('public.is_active_owner(uuid)', false, false, false),
  ('public.race_schedule_current()', true, true, true)
) as rpc(signature, anon_allowed, authenticated_allowed, service_allowed)
cross join lateral (values
  ('anon', anon_allowed),
  ('authenticated', authenticated_allowed),
  ('service_role', service_allowed)
) as principal(actor, expected);
select * from finish();
rollback;
