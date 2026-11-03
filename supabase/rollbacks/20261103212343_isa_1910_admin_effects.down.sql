-- Roll back the Edge first. Keep the append-only journal and its ACLs/evidence.
begin;
drop function public.native_admin_record_effect(uuid,jsonb);
commit;
