-- Roll back Edge first; keep journal rows, expanded statuses and leases.
begin;
drop view private.admin_pending_effects;
drop function public.native_admin_reconcile_effect(uuid,uuid);
drop function public.native_admin_claim_change(uuid,uuid,uuid);
drop function public.native_admin_release_change(uuid,uuid,uuid,uuid);
drop function public.native_admin_finish_change(uuid,text,jsonb,text,uuid,uuid);
drop function public.native_admin_record_effect(uuid,jsonb);
commit;
-- Reinstall the previous RPC/ACLs without removing any evidence.
\ir ../migrations/20261103212343_isa_1910_admin_effects.sql
