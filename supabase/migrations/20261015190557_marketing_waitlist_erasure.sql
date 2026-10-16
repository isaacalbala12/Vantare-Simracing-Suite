-- #1636 R2 / P2-2: erase only contacts with no current or historic account ownership.
begin;
create function public.mail_forget_waitlist(p_email text) returns void
language plpgsql security definer set search_path='' as $$
declare contact private.mail_contacts%rowtype;
begin
 perform pg_advisory_xact_lock(1636,300);
 if p_email is null or length(p_email)>320 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'native_admin_invalid'; end if;
 select * into contact from private.mail_contacts where email=lower(btrim(p_email)) for update;
 if found then
  if contact.account_id is not null or contact.erasure_account is not null or not contact.waitlist then
   raise exception 'mail_contact_has_account' using errcode='22023';
  end if;
  -- DELETE triggers the durable provider erasure queue before local PII disappears.
  delete from private.mail_contacts where email=contact.email;
 end if;
 insert into private.mail_audit(action,target,detail) values('waitlist_erasure','contact','{}');
end $$;
revoke all on function public.mail_forget_waitlist(text) from public,anon,authenticated,service_role;
grant execute on function public.mail_forget_waitlist(text) to service_role;

do $$
declare definition text; marker text:=$m$ if p_action='mail_sync_lease' then$m$;
begin
 definition:=pg_get_functiondef('public.mail_admin_execute(uuid,text,jsonb,text)'::regprocedure);
 if position(marker in definition)=0 then raise exception 'mail_admin_entry_changed'; end if;
 definition:=replace(definition,marker,$prefix$
 if p_action='mail_forget_waitlist' then
  if p_params-array['email','confirm']<>'{}' or p_params->'confirm' is distinct from 'true'::jsonb then raise exception 'native_admin_invalid'; end if;
  perform public.mail_forget_waitlist(p_params->>'email');
  insert into private.mail_audit(actor,action,target,detail) values(p_actor,p_action,'contact','{}');
  return jsonb_build_object('erasure_queued',true);
 elsif p_action='mail_sync_lease' then$prefix$);
 execute definition;
end $$;
commit;
