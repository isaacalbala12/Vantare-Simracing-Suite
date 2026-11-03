-- Execute only after the calendar ACL down migration on a disposable database.
begin;
select plan(16);
select is(has_function_privilege(actor, signature, 'EXECUTE'), true,
  actor || ' can execute restored ' || signature)
from (values
  ('public.race_schedule_draft_save(text,jsonb,timestamptz,integer)'),
  ('public.race_schedule_publish(uuid)'),
  ('public.race_schedule_my_draft()'),
  ('public.is_active_owner(uuid)')
) as rpc(signature)
cross join (values ('anon'),('authenticated'),('service_role')) as principal(actor);
select ok(not exists (
  select 1 from pg_catalog.pg_proc p
  cross join lateral pg_catalog.aclexplode(p.proacl) acl
  where p.oid=signature::regprocedure and acl.grantee=0
    and acl.privilege_type='EXECUTE'
), 'PUBLIC is absent from restored ' || signature)
from (values
  ('public.race_schedule_draft_save(text,jsonb,timestamptz,integer)'),
  ('public.race_schedule_publish(uuid)'),
  ('public.race_schedule_my_draft()'),
  ('public.is_active_owner(uuid)')
) as rpc(signature);
select * from finish();
rollback;
