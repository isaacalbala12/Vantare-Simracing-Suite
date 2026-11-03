begin;
select no_plan();
select ok(not has_function_privilege('anon','public.native_admin_gate()','execute'),
 'anonymous callers cannot spend the budget directly');
select ok(not has_function_privilege('authenticated','public.native_admin_gate()','execute'),
 'authenticated callers cannot spend the budget directly');
select ok(has_function_privilege('service_role','public.native_admin_gate()','execute'),
 'only backend can call gate');
select ok(not has_table_privilege('service_role','private.native_admin_gate_rate','select'),
 'backend has no direct budget reads');
select ok(not has_table_privilege('service_role','private.native_admin_gate_rate','update'),
 'backend cannot reset budget');
delete from private.native_admin_gate_rate;
set local role service_role;
-- A single SQL statement shares one statement_timestamp: no minute-boundary flake.
select is((select count(*)::integer from generate_series(1,125)
 where public.native_admin_gate()),120,'exactly first 120 calls pass in one minute');
reset role;
select is((select requests from private.native_admin_gate_rate),121,
 'rejected traffic saturates counter without overflow');
update private.native_admin_gate_rate set window_start=statement_timestamp()-interval '2 minutes';
set local role service_role;
select is(public.native_admin_gate(),true,'new minute restores capacity');
reset role;
select is((select requests from private.native_admin_gate_rate),1,'new minute starts at one');
select is((select count(*)::integer from private.native_admin_gate_rate),1,'one global row, no identity or token storage');
select * from finish();
rollback;
