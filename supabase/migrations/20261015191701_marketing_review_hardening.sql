-- #1636 R2 / P3: opaque dirty sync, scanner-safe rate limits, bounded dispatch.
begin;
alter table private.mail_deliveries add constraint mail_delivery_locale check(locale in('es','en','it','pt-BR'));
create index mail_delivery_pending on private.mail_deliveries(campaign_id,id) where status='pending';
alter table private.mail_contacts add column id uuid not null default gen_random_uuid();
create unique index mail_contact_id on private.mail_contacts(id);
alter table private.mail_contacts add column sync_state jsonb not null default '{}';
alter table private.mail_contacts add column sync_lease_projection jsonb;
alter table private.mail_contacts add column sync_lease_environment text check(sync_lease_environment in('sandbox','production'));
create function private.mail_sync_projection(p_email text,p_environment text) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('revision',revision,'locale',locale,'consent',consent,'groups',private.mail_groups(email,p_environment))
 from private.mail_contacts where email=p_email
$$;
revoke all on function private.mail_sync_projection(text,text) from public,anon,authenticated,service_role;

create or replace function public.mail_admin_execute(p_actor uuid,p_action text,p_params jsonb,p_environment text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare contact private.mail_contacts%rowtype; response jsonb; projection jsonb;
 campaign private.mail_campaigns%rowtype; delivery private.mail_deliveries%rowtype; used integer;
begin
 if p_actor is null or private.lock_account_write(p_actor) then raise exception 'native_admin_forbidden' using errcode='42501'; end if;
 perform private.native_admin_require_owner(p_actor);
 perform pg_advisory_xact_lock(1636,300);
 if p_environment is null or p_environment not in('sandbox','production') or jsonb_typeof(p_params) is distinct from 'object' then raise exception 'native_admin_invalid'; end if;
 if p_action='mail_forget_waitlist' then
  if p_params-array['email','confirm']<>'{}' or p_params->'confirm' is distinct from 'true'::jsonb then raise exception 'native_admin_invalid'; end if;
  perform public.mail_forget_waitlist(p_params->>'email');
  insert into private.mail_audit(actor,action,target,detail) values(p_actor,p_action,'contact','{}');
  return jsonb_build_object('erasure_queued',true);
 elsif p_action='mail_sync_page' then
  if p_params-array['cursor']<>'{}' or (p_params->>'cursor' is not null and p_params->>'cursor' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$') then raise exception 'native_admin_invalid'; end if;
  -- The opaque cursor is a continuation marker, never an email/keyset boundary.
  -- Dirty projections behind that marker remain eligible, including role expiry.
  select jsonb_build_object('contacts',coalesce(jsonb_agg(to_jsonb(page)),'[]')) into response from(
   select id,email,revision from private.mail_contacts
   where (sync_state->p_environment) is distinct from private.mail_sync_projection(email,p_environment)
    and (sync_lease_until is null or sync_lease_until<clock_timestamp()) order by id limit 5) page;
 elsif p_action='mail_sync_pending' then
  if p_params<>'{}' then raise exception 'native_admin_invalid'; end if;
  response:=jsonb_build_object('pending',exists(select 1 from private.mail_contacts
   where (sync_state->p_environment) is distinct from private.mail_sync_projection(email,p_environment)));
 elsif p_action='mail_sync_lease' then
  if p_params-array['email','revision']<>'{}' then raise exception 'native_admin_invalid'; end if;
  select * into contact from private.mail_contacts where email=p_params->>'email' and revision=(p_params->>'revision')::bigint
   and (sync_lease_until is null or sync_lease_until<clock_timestamp()) for update;
  if not found then
   insert into private.mail_audit(actor,action,target,detail)values(p_actor,p_action,'mail','{}');
   return jsonb_build_object('allowed',false);
  end if;
  projection:=private.mail_sync_projection(contact.email,p_environment);
  update private.mail_contacts set sync_lease=gen_random_uuid(),sync_lease_until=clock_timestamp()+interval '60 seconds',
   sync_lease_environment=p_environment,sync_lease_projection=projection
   where email=contact.email returning * into contact;
  response:=jsonb_build_object('allowed',true,'lease',contact.sync_lease,'consent',contact.consent,'groups',projection->'groups');
 elsif p_action='mail_sync_ack' then
  if p_params-array['email','revision','lease']<>'{}' then raise exception 'native_admin_invalid'; end if;
  select * into contact from private.mail_contacts where email=p_params->>'email' and sync_lease=(p_params->>'lease')::uuid
   and sync_lease_environment=p_environment for update;
  if found then
   projection:=private.mail_sync_projection(contact.email,p_environment);
   update private.mail_contacts set sync_state=case when revision=(p_params->>'revision')::bigint and sync_lease_projection=projection
     then jsonb_set(sync_state,array[p_environment],sync_lease_projection,true) else sync_state end,
    synced_revision=case when revision=(p_params->>'revision')::bigint and sync_lease_projection=projection then revision else synced_revision end,
    sync_lease=null,sync_lease_until=null,sync_lease_projection=null,sync_lease_environment=null where email=contact.email;
  end if;
  response:='{}';
 elsif p_action='mail_claim' then
  if p_params-array['campaign_id','revision']<>'{}' then raise exception 'native_admin_invalid'; end if;
  select * into campaign from private.mail_campaigns where id=(p_params->>'campaign_id')::uuid and environment=p_environment for update;
  if not found then raise exception 'native_admin_not_found'; end if;
  if campaign.revision is distinct from (p_params->>'revision')::integer then raise exception 'mail_revision_conflict'; end if;
  insert into private.mail_audit(actor,action,target,detail)values(p_actor,p_action,campaign.id::text,jsonb_build_object('revision',campaign.revision));
  if campaign.state<>'sending' or campaign.approved_by is null then return jsonb_build_object('delivery',null); end if;
  select count(*) into used from private.mail_quota_reservations where reserved_at>clock_timestamp()-interval '24 hours';
  if used>=300 then return jsonb_build_object('delivery',null,'quota_remaining',0); end if;
  -- At most 20 candidate rows reevaluated per reservation, never the whole queue.
  for delivery in select * from private.mail_deliveries where campaign_id=campaign.id and status='pending' order by id limit 20 for update loop
   if not coalesce(campaign.target_group=any(private.mail_groups(delivery.email,p_environment)),false) then
    update private.mail_deliveries set status='skipped',finished_at=now() where id=delivery.id;
   else
    update private.mail_deliveries set status='dispatching',reserved_at=clock_timestamp() where id=delivery.id returning * into delivery;
    insert into private.mail_quota_reservations(id,reserved_at)values(delivery.id,delivery.reserved_at);
    return jsonb_build_object('delivery',to_jsonb(delivery),'content',campaign.content->delivery.locale);
   end if;
  end loop;
  if exists(select 1 from private.mail_deliveries where campaign_id=campaign.id and status='pending') then
   response:=jsonb_build_object('delivery',null,'more_pending',true);
  else
   update private.mail_campaigns set state='completed' where id=campaign.id;
   response:=jsonb_build_object('delivery',null);
  end if;
 else
  response:=private.mail_admin_execute_v1(p_actor,p_action,p_params,p_environment);
  if p_action='mail_list' then response:=response||jsonb_build_object('cleanup',jsonb_build_object(
   'pending',(select count(*) from private.mail_contact_erasures where state<>'completed'),
   'completed',(select count(*) from private.mail_contact_erasures where state='completed'))); end if;
  return response;
 end if;
 insert into private.mail_audit(actor,action,target,detail)values(p_actor,p_action,'mail','{}');
 return response;
end $$;

create table private.mail_unsubscribe_rate (
 bucket text primary key check(bucket='global' or bucket ~ '^token:[a-f0-9]{64}$'),
 window_start timestamptz not null,requests integer not null check(requests>0)
);
alter table private.mail_unsubscribe_rate enable row level security;
revoke all on private.mail_unsubscribe_rate from public,anon,authenticated,service_role;
create function public.mail_unsubscribe_budget(p_token_hash text default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare used integer; key text; max_requests integer;
begin
 if p_token_hash is not null and p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'native_admin_invalid'; end if;
 key:=case when p_token_hash is null then 'global' else 'token:'||p_token_hash end;
 max_requests:=case when p_token_hash is null then 600 else 20 end;
 insert into private.mail_unsubscribe_rate as budget(bucket,window_start,requests)values(key,date_trunc('minute',now()),1)
 on conflict(bucket) do update set window_start=excluded.window_start,
  requests=case when budget.window_start=excluded.window_start then least(budget.requests+1,1000000) else 1 end returning requests into used;
 delete from private.mail_unsubscribe_rate where bucket in(select bucket from private.mail_unsubscribe_rate
  where window_start<now()-interval '24 hours' order by window_start limit 100);
 return used<=max_requests;
end $$;
revoke all on function public.mail_unsubscribe_budget(text) from public,anon,authenticated,service_role;
grant execute on function public.mail_unsubscribe_budget(text) to service_role;
commit;
