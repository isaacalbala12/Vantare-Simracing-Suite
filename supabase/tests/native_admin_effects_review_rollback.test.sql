select no_plan();
insert into private.admin_effects(effect_id,outcome,request_id,actor,action,effect,target_hash,provider_status)
 values('00000000-0000-4000-8000-000000001939','failed','00000000-0000-4000-8000-000000001939','00000000-0000-4000-8000-000000001939','set_blocked','polar_cancel',repeat('f',64),403);
\ir ../rollbacks/20261103214115_isa_1910_admin_effects_review.down.sql
select ok(to_regprocedure('public.native_admin_reconcile_effect(uuid,uuid)') is null,'rollback disables reconcile');
select ok(to_regprocedure('public.native_admin_claim_change(uuid,uuid,uuid)') is null,'rollback disables lease');
select is((select provider_status from private.admin_effects where effect_id='00000000-0000-4000-8000-000000001939'),403::smallint,'rollback retains new evidence');
select ok(to_regprocedure('public.native_admin_record_effect(uuid,jsonb)') is not null,'rollback restores old RPC');
\ir ../migrations/20261103214115_isa_1910_admin_effects_review.sql
select is((select outcome from private.admin_effects where effect_id='00000000-0000-4000-8000-000000001939'),'failed','reapply retains failed evidence');
select ok(not has_table_privilege('authenticated','private.admin_pending_effects','select'),'reapply retains ACL');
select * from finish();
