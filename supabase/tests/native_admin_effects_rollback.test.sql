select no_plan();
insert into private.admin_effects(effect_id,outcome,request_id,actor,action,effect,target_hash)
 values('00000000-0000-4000-8000-000000001915','started','00000000-0000-4000-8000-000000001915','00000000-0000-4000-8000-000000001915','delete_account','storage_cleanup',repeat('a',64));
\ir ../rollbacks/20261103212343_isa_1910_admin_effects.down.sql
select ok(to_regprocedure('public.native_admin_record_effect(uuid,jsonb)') is null,'rollback disables RPC');
select is((select count(*) from private.admin_effects where effect_id='00000000-0000-4000-8000-000000001915'),1::bigint,'rollback retains evidence');
\ir ../migrations/20261103212343_isa_1910_admin_effects.sql
select is((select count(*) from private.admin_effects where effect_id='00000000-0000-4000-8000-000000001915'),1::bigint,'reapply retains evidence');
select ok(not has_function_privilege('authenticated','public.native_admin_record_effect(uuid,jsonb)','execute'),'reapply retains ACL');
select * from finish();
