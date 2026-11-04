-- Execute after the step 8 down migration on disposable PostgreSQL.
begin;
select plan(8);
select ok(to_regprocedure('private.is_owner(uuid)') is null,
 'private owner helper removed');
select ok(to_regprocedure('public.is_active_owner(uuid)') is not null,
 'calendar owner helper restored');
select ok(not has_function_privilege('anon','public.is_active_owner(uuid)','execute'),
 'anonymous owner oracle stays closed');
select ok(not has_function_privilege('authenticated','public.is_active_owner(uuid)','execute'),
 'authenticated owner oracle stays closed');
select ok(has_function_privilege('service_role','public.is_active_owner(uuid)','execute'),
 'calendar service role regains its old helper');
select ok(pg_get_functiondef('public.race_schedule_draft_save(text,jsonb,timestamptz,integer)'::regprocedure)
 like '%public.is_active_owner(%','draft uses restored authority');
select ok(pg_get_functiondef('public.race_schedule_publish(uuid)'::regprocedure)
 like '%public.is_active_owner(%','publish uses restored authority');
select ok(pg_get_functiondef('public.testing_center_current_role()'::regprocedure)
 like '%testing_center_memberships%' and
 pg_get_functiondef('public.testing_center_current_role()'::regprocedure)
 not like '%private.is_owner(%','Testing Center role restored');
select * from finish();
rollback;
