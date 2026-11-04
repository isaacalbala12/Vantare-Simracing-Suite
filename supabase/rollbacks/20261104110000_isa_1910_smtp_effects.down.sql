-- Revert Edge first; never discard evidence to force down.
begin;
set local lock_timeout='5s';
do $$begin
 if not exists(select 1 from pg_roles where rolname=current_user and (rolsuper or rolbypassrls)) then
  raise exception 'mail_send_migration_requires_bypassrls' using errcode='42501';
 end if;
end$$;
do $$begin
 if exists(select 1 from private.admin_effects where action='mail_send_batch' or effect='brevo_smtp_send') then
  raise exception 'mail_send_rollback_requires_retention' using errcode='55000';
 end if;
end$$;
drop function public.native_admin_claim_mail_send(uuid,uuid,uuid,uuid,integer,text);
drop function public.native_admin_record_mail_send(uuid,uuid,uuid,uuid,text,text,integer);
alter table private.admin_effects drop constraint admin_effects_action_check;
alter table private.admin_effects add constraint admin_effects_action_check
 check(action in('set_blocked','delete_account','mail_cleanup','mail_sync'));
alter table private.admin_effects drop constraint admin_effects_effect_check;
alter table private.admin_effects add constraint admin_effects_effect_check
 check(effect in('clerk_ban','clerk_unban','clerk_delete','storage_cleanup','polar_cancel','brevo_delete','brevo_contact_upsert','brevo_contact_update'));
notify pgrst,'reload schema';
commit;
