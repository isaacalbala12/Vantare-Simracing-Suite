-- Roll back the Edge to its previous SHA first. Only ephemeral budget is lost.
begin;
drop function public.native_admin_preflight(text,text);
drop function public.native_admin_gate();
drop table private.native_admin_gate_rate;
commit;
