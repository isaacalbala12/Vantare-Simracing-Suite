begin;
set local lock_timeout='5s';
create table private.admin_payment_sync_budget (
 environment text primary key check(environment='sandbox'),window_start timestamptz not null
);
alter table private.admin_payment_sync_budget enable row level security;
alter table private.admin_payment_sync_budget force row level security;
revoke all on table private.admin_payment_sync_budget from public,anon,authenticated,service_role;
alter table private.admin_effects drop constraint admin_effects_action_check;
alter table private.admin_effects add constraint admin_effects_action_check check(action in('set_blocked','delete_account','mail_cleanup','mail_sync','mail_send_batch','sync_payments'));
alter table private.admin_effects drop constraint admin_effects_effect_check;
alter table private.admin_effects add constraint admin_effects_effect_check check(effect in('clerk_ban','clerk_unban','clerk_delete','storage_cleanup','polar_cancel','brevo_delete','brevo_contact_upsert','brevo_contact_update','brevo_smtp_send','polar_payment_sync'));
revoke all on table private.admin_effects from public,anon,authenticated,service_role;
grant select on table private.admin_effects to service_role;

create or replace function public.native_admin_payment_sync_budget(p_actor uuid,p_environment text,p_request uuid default gen_random_uuid())
returns boolean language plpgsql security definer set search_path='' as $$
declare claimed text; stamp timestamptz;
begin
 if p_actor is null or private.lock_account_write(p_actor) then raise exception 'native_admin_forbidden' using errcode='42501'; end if;
 perform private.native_admin_require_owner(p_actor);
 if p_environment is distinct from 'sandbox' then raise exception 'native_admin_forbidden' using errcode='42501'; end if;
 if p_request is null then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 stamp:=clock_timestamp();
 insert into private.admin_payment_sync_budget as budget(environment,window_start) values(p_environment,stamp)
 on conflict(environment) do update set window_start=excluded.window_start
 where budget.window_start<=excluded.window_start-interval '1 minute'
 returning environment into claimed;
 if claimed is null then return false; end if;
 -- Quota and journal intention commit atomically; no quota consumed without audit.
 if not private.append_mail_effect(jsonb_build_object('request_id',p_request,'effect_id',p_request,'actor',p_actor,
  'action','sync_payments','effect','polar_payment_sync','target_hash',
  encode(sha256(convert_to('sync_payments:sandbox','UTF8')),'hex'),'outcome','started'),null) then
  raise exception 'history_unavailable' using errcode='55000'; end if;
 return true;
end $$;
revoke all on function public.native_admin_payment_sync_budget(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.native_admin_payment_sync_budget(uuid,text,uuid) to service_role;

create or replace function public.native_admin_record_payment_sync(p_actor uuid,p_request uuid,p_outcome text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_actor is null or p_request is null or p_outcome is null or p_outcome not in('succeeded','unknown') then
  raise exception 'native_admin_invalid' using errcode='22023'; end if;
 -- Service supplies actor/request. The shared journal validates the committed
 -- intention; closure does not require an owner that may have expired meanwhile.
 return private.append_mail_effect(jsonb_build_object('request_id',p_request,'effect_id',p_request,'actor',p_actor,
  'action','sync_payments','effect','polar_payment_sync','target_hash',
  encode(sha256(convert_to('sync_payments:sandbox','UTF8')),'hex'),'outcome',p_outcome),null);
end $$;
revoke all on function public.native_admin_record_payment_sync(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.native_admin_record_payment_sync(uuid,uuid,text) to service_role;
commit;
