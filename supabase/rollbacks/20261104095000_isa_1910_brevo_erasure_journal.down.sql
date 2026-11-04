-- Revert callers first. Never delete append-only evidence to undo a schema change.
begin;
set local lock_timeout='5s';
do $$begin
 if not exists(select 1 from pg_roles where rolname=current_user and (rolsuper or rolbypassrls)) then
  raise exception 'brevo_journal_migration_requires_bypassrls' using errcode='42501';
 end if;
 if exists(select 1 from private.admin_effects where effect='brevo_delete' or action='mail_cleanup') then
  raise exception 'brevo_journal_rollback_requires_retention' using errcode='55000';
 end if;
end$$;
drop function public.native_admin_claim_mail_erasure(uuid,uuid,uuid);
drop function public.native_admin_record_mail_erasure(uuid,uuid,uuid,uuid,text,integer,uuid);
alter table private.admin_effects drop constraint admin_effects_action_check;
alter table private.admin_effects add constraint admin_effects_action_check
 check(action in ('set_blocked','delete_account'));
alter table private.admin_effects drop constraint admin_effects_effect_check;
alter table private.admin_effects add constraint admin_effects_effect_check
 check(effect in ('clerk_ban','clerk_unban','clerk_delete','storage_cleanup','polar_cancel'));
notify pgrst,'reload schema';
commit;
