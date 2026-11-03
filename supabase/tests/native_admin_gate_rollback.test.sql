-- Disposable database only: exercise the actual down/up pair, not copied SQL.
select no_plan();
\ir ../rollbacks/20261103152000_isa_1910_admin_gate.down.sql
select ok(to_regprocedure('public.native_admin_gate()') is null,'rollback removes RPC');
select ok(to_regclass('private.native_admin_gate_rate') is null,'rollback removes ephemeral counter');
\ir ../migrations/20261103152000_isa_1910_admin_gate.sql
select is(public.native_admin_gate(),true,'migration reapplies after rollback');
select ok(not has_function_privilege('authenticated','public.native_admin_gate()','execute'),
 'reapply preserves closed RPC');
select * from finish();
