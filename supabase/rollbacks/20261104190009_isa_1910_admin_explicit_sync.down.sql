begin;
set local lock_timeout='5s';
do $$begin
 if exists(select 1 from private.admin_effects where action='sync_payments' or effect='polar_payment_sync') then
  raise exception 'payment_sync_evidence_requires_forward_fix' using errcode='55000'; end if;
end $$;
drop function public.native_admin_record_payment_sync(uuid,uuid,text);
drop function public.native_admin_payment_sync_budget(uuid,text,uuid);
drop table private.admin_payment_sync_budget;
alter table private.admin_effects drop constraint admin_effects_action_check;
alter table private.admin_effects add constraint admin_effects_action_check check(action in('set_blocked','delete_account','mail_cleanup','mail_sync','mail_send_batch'));
alter table private.admin_effects drop constraint admin_effects_effect_check;
alter table private.admin_effects add constraint admin_effects_effect_check check(effect in('clerk_ban','clerk_unban','clerk_delete','storage_cleanup','polar_cancel','brevo_delete','brevo_contact_upsert','brevo_contact_update','brevo_smtp_send'));
revoke all on table private.admin_effects from public,anon,authenticated,service_role;
grant select on table private.admin_effects to service_role;
commit;
