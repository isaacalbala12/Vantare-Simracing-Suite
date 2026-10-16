-- #1627 R4: initiate #1622 erasure, then retry external ACKs without retaining email.
begin;
create table private.admin_account_deletions (
 account_id uuid primary key references public.profiles(id) on delete restrict,
 issuer text not null, subject text not null, confirmation_hash text not null check(confirmation_hash ~ '^[0-9a-f]{64}$'),
 deleted_at timestamptz not null default clock_timestamp(),
 foreign key(issuer,subject) references public.account_identities(issuer,subject) on delete restrict
);
revoke all on private.admin_account_deletions from public,anon,authenticated,service_role;

-- p_subject NULL is a read-only retry lookup. Only Edge supplies a subject,
-- after comparing the current primary Clerk email. No raw email is persisted.
create function private.native_admin_account_deletion(p_actor uuid,p_account uuid,p_issuer text,p_hash text,p_subject text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job private.admin_account_deletions%rowtype; a uuid; deleted boolean:=false;
begin
 if p_account is null or p_issuer is null or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then
  raise exception 'native_admin_invalid' using errcode='22023'; end if;
 -- #1622 webhooks acquire subject then UUID. Match that order before calling
 -- apply_clerk_user_event; never wait for a subject while holding its UUID.
 if p_subject is not null then
  perform pg_advisory_xact_lock(hashtextextended(p_issuer||chr(31)||p_subject,0));
 end if;
 -- Acquire the complete ordered UUID set before any role/profile/identity row.
 for a in select distinct x from unnest(array[p_actor,p_account]) x where x is not null order by x loop
  if private.lock_account_write(a) then
   if a=p_actor then raise sqlstate '28000' using message='account_deleted'; end if;
   deleted:=true;
  end if;
 end loop;
 perform private.native_admin_require_owner(p_actor);
 if p_account=p_actor or exists(select 1 from public.operational_access_assignments where user_id=p_account and role='owner' and status='active') then
  raise exception 'native_admin_owner_conflict' using errcode='55000'; end if;
 select * into job from private.admin_account_deletions where account_id=p_account for update;
 if found then
  if job.issuer<>p_issuer or job.confirmation_hash<>p_hash then
   raise exception 'native_admin_confirmation_mismatch' using errcode='22023'; end if;
 elsif deleted then
  raise exception 'native_admin_owner_conflict' using errcode='55000';
 elsif p_subject is null then return jsonb_build_object('deletion',null);
 else
  if not exists(select 1 from public.account_identities where issuer=p_issuer and subject=p_subject and account_id=p_account and deleted_at is null) then
   raise exception 'native_admin_not_found' using errcode='P0002'; end if;
  insert into private.admin_account_deletions(account_id,issuer,subject,confirmation_hash)
   values(p_account,p_issuer,p_subject,p_hash) returning * into job;
  -- Audit the request before erasure, in the SAME transaction. No PII/Clerk ID.
  insert into public.admin_audit_log(actor_account_id,action,target,after_value)
   values(p_actor,'delete_account',p_account::text,'{"deletion_started":true}');
  perform public.apply_clerk_user_event('native-admin-delete:'||p_account::text,
   encode(sha256(convert_to('native-admin-delete:'||p_account::text,'UTF8')),'hex'),
   p_issuer,p_subject,'user.deleted',job.deleted_at,null);
 end if;
 return jsonb_build_object('deletion',jsonb_build_object('account_id',job.account_id,'clerk_subject',job.subject,'deleted_at',job.deleted_at));
end $$;
revoke all on function private.native_admin_account_deletion(uuid,uuid,text,text,text) from public,anon,authenticated,service_role;

-- Internal actions are intentionally absent from the Edge client whitelist.
do $$
declare definition text; marker text:=' -- Preserve #1622 UUID-before-rows when replacing the older admin entry.';
begin
 definition:=pg_get_functiondef('public.native_admin_execute(uuid,text,text,jsonb,text)'::regprocedure);
 if position(marker in definition)=0 then raise exception 'admin_entry_changed'; end if;
 definition:=replace(definition,marker,$prefix$
 if p_action in ('get_account_deletion','prepare_account_deletion') then
  if p_environment is distinct from 'sandbox' then raise exception 'native_admin_invalid' using errcode='22023'; end if;
  return private.native_admin_account_deletion(p_actor,(p_params->>'account_id')::uuid,p_issuer,p_params->>'confirmation_hash',
   case when p_action='prepare_account_deletion' then p_params->>'clerk_subject' end);
 end if;
$prefix$||marker);
 execute definition;
end $$;
commit;
