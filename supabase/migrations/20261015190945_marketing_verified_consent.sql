-- #1636 R2 / P2-3: own-account consent from server-verified primary email.
begin;
create table private.mail_consent_budget (
 account_id uuid primary key references public.profiles(id) on delete cascade,
 window_start timestamptz not null,requests integer not null
);
alter table private.mail_consent_budget enable row level security;
revoke all on private.mail_consent_budget from public,anon,authenticated,service_role;
create function public.mail_consent_execute(p_account uuid,p_email text,p_action text,p_locale text default null,p_consent boolean default null,p_source text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare used integer; contact private.mail_contacts%rowtype;
begin
 if p_account is null or private.lock_account_write(p_account) then raise sqlstate '28000' using message='account_deleted'; end if;
 if not exists(select 1 from public.profiles where id=p_account) or exists(select 1 from private.admin_account_blocks where account_id=p_account and blocked) then
  raise exception 'mail_consent_forbidden' using errcode='42501';
 end if;
 if p_email is null or length(p_email)>320 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or p_action is null or p_action not in('get','set') then raise exception 'native_admin_invalid'; end if;
 if p_action='get' and (p_locale is not null or p_consent is not null or p_source is not null) then raise exception 'native_admin_invalid'; end if;
 if p_action='set' and (p_locale is null or p_locale not in('es','en','it','pt-BR') or p_consent is null or p_source is null or p_source not in('onboarding','settings')) then raise exception 'native_admin_invalid'; end if;
 insert into private.mail_consent_budget as budget(account_id,window_start,requests) values(p_account,date_trunc('minute',clock_timestamp()),1)
 on conflict(account_id) do update set window_start=excluded.window_start,
  requests=case when budget.window_start=excluded.window_start then budget.requests+1 else 1 end returning requests into used;
 if used>60 then return jsonb_build_object('rate_limited',true); end if;
 if p_action='set' then
  perform public.mail_record_consent(p_account,p_email,p_locale,p_consent,'marketing.'||p_source||'.v1',false);
 end if;
 select * into contact from private.mail_contacts where account_id=p_account and email=lower(btrim(p_email));
 return jsonb_build_object('consent',coalesce(contact.consent,false),'locale',contact.locale,'revision',coalesce(contact.revision,0));
end $$;
revoke all on function public.mail_consent_execute(uuid,text,text,text,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.mail_consent_execute(uuid,text,text,text,boolean,text) to service_role;
commit;
