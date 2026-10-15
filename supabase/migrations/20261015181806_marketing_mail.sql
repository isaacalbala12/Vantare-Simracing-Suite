-- #1636: private marketing ledger. Nothing is enabled or sent by this migration.
begin;
create table private.mail_contacts (
 email text primary key check(email=lower(btrim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' and length(email)<=320),
 account_id uuid references public.profiles(id) on delete cascade,
 erasure_account uuid references public.profiles(id) on delete cascade,
 locale text not null check(locale in('es','en','it','pt-BR')),
 consent boolean not null default false,
 consent_at timestamptz not null default now(),
 evidence text not null check(length(evidence) between 1 and 200),
 waitlist boolean not null default false,
 revision bigint not null default 1,
 synced_revision bigint not null default 0
);
create unique index mail_contact_account on private.mail_contacts(account_id) where account_id is not null;
create table private.mail_campaigns (
 id uuid primary key default gen_random_uuid(),
 revision integer not null default 1,
 name text not null default 'Nueva campaña' check(length(name) between 1 and 120),
 template text not null default 'news' check(template in('news','offer','launch')),
 target_group text not null default 'free' check(target_group in('free','pro','pro_plus','launch','testers','creators','waitlist')),
 content jsonb not null default '{"es":{"subject":"","body":""},"en":{"subject":"","body":""},"it":{"subject":"","body":""},"pt-BR":{"subject":"","body":""}}',
 environment text not null check(environment in('sandbox','production')),
 state text not null default 'draft' check(state in('draft','sending','completed')),
 approved_by uuid references public.profiles(id), approved_at timestamptz,
 created_at timestamptz not null default now()
);
create table private.mail_deliveries (
 id uuid primary key default gen_random_uuid(), campaign_id uuid not null references private.mail_campaigns(id),
 email text not null references private.mail_contacts(email) on delete cascade,
 locale text not null, status text not null default 'pending' check(status in('pending','dispatching','accepted','uncertain','skipped')),
 reserved_at timestamptz, finished_at timestamptz, provider_id text,
 unique(campaign_id,email)
);
-- Quota survives account erasure; contains no address or account identifier.
create table private.mail_quota_reservations(id uuid primary key,reserved_at timestamptz not null);
create index mail_delivery_quota on private.mail_quota_reservations(reserved_at);
alter table private.mail_quota_reservations enable row level security;
revoke all on private.mail_quota_reservations from public,anon,authenticated,service_role;
create table private.mail_audit (
 id uuid primary key default gen_random_uuid(), actor uuid, action text not null,
 target text not null, detail jsonb not null, occurred_at timestamptz not null default now()
);
create trigger mail_audit_append_only before update or delete on private.mail_audit
 for each row execute function public.operational_access_reject_audit_mutation();
alter table private.mail_contacts enable row level security;
alter table private.mail_campaigns enable row level security;
alter table private.mail_deliveries enable row level security;
alter table private.mail_audit enable row level security;
revoke all on private.mail_contacts,private.mail_campaigns,private.mail_deliveries,private.mail_audit from public,anon,authenticated,service_role;

-- Only the trusted consent collector may call this, with a verified address and evidence.
-- Owner campaign actions deliberately cannot grant consent or choose group memberships.
create function public.mail_record_consent(p_account uuid,p_email text,p_locale text,p_consent boolean,p_evidence text,p_waitlist boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare old_email text;
begin
 if p_account is not null and private.lock_account_write(p_account) then raise sqlstate '28000' using message='account_deleted'; end if;
 perform pg_advisory_xact_lock(1636,300);
 if p_consent is null or p_waitlist is null or (p_account is null and not p_waitlist)
   or p_evidence is null or length(p_evidence) not between 1 and 200 then raise exception 'native_admin_invalid'; end if;
 if p_account is not null then
  perform private.lock_account_write(p_account);
  select email into old_email from private.mail_contacts where account_id=p_account;
  if old_email is not null and old_email<>lower(btrim(p_email)) then
   -- Keep the previous address suppressed, including any queued deliveries.
   update private.mail_contacts set account_id=null,consent=false,revision=revision+1,consent_at=now(),evidence='address_changed' where email=old_email;
  end if;
 end if;
 insert into private.mail_contacts(email,account_id,erasure_account,locale,consent,evidence,waitlist)
 values(lower(btrim(p_email)),p_account,p_account,p_locale,p_consent,p_evidence,p_waitlist)
 on conflict(email) do update set account_id=excluded.account_id,erasure_account=excluded.erasure_account,locale=excluded.locale,consent=excluded.consent,
 evidence=excluded.evidence,waitlist=excluded.waitlist,consent_at=now(),revision=private.mail_contacts.revision+1
 where private.mail_contacts.account_id is null or private.mail_contacts.account_id is not distinct from excluded.account_id;
 if not found then raise exception 'native_admin_invalid'; end if;
 insert into private.mail_audit(actor,action,target,detail) values(p_account,'consent','contact',jsonb_build_object('consent',p_consent,'evidence',p_evidence));
end $$;

create function public.mail_unsubscribe(p_email text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(1636,300);
 update private.mail_contacts set consent=false,consent_at=now(),evidence='unsubscribe',revision=revision+1
 where email=lower(btrim(p_email)) and consent;
 insert into private.mail_audit(action,target,detail) values('unsubscribe','contact','{}');
 update private.mail_deliveries set status='skipped',finished_at=now()
 where email=lower(btrim(p_email)) and status='pending';

end $$;

create function private.mail_groups(p_email text,p_environment text) returns text[]
language sql stable security definer set search_path='' as $$
 with contact as(select * from private.mail_contacts where email=p_email),
 grants as(select g.* from public.billing_effective_access_grants g join contact c on c.account_id=g.user_id
 where g.environment=p_environment and g.status='active' and (g.valid_until is null or g.valid_until>now()))
 select array_remove(array[
 case when c.account_id is not null then case when exists(select 1 from grants where capability='vantare.plan.pro') then
 case when exists(select 1 from grants where capability='vantare.channel.nightly') then 'pro_plus' else 'pro' end else case when not exists(select 1 from grants where capability='vantare.edition.launch_v1') then 'free' end end end,
 case when exists(select 1 from grants where capability='vantare.edition.launch_v1') then 'launch' end,
 case when exists(select 1 from public.operational_access_assignments a where a.user_id=c.account_id and a.role='tester' and a.status='active' and a.policy_version=1 and(a.expires_at is null or a.expires_at>now())) then 'testers' end,
 case when exists(select 1 from private.admin_creators a where lower(a.email)=c.email and a.environment=p_environment and a.status='active') then 'creators' end,
 case when c.waitlist then 'waitlist' end],null)
 from contact c where c.consent and (c.account_id is null or (not exists(select 1 from private.admin_account_blocks b where b.account_id=c.account_id and b.blocked)
 and exists(select 1 from public.profiles p where p.id=c.account_id)
 and not exists(select 1 from public.account_identities t where t.account_id=c.account_id and t.deleted_at is not null)))
$$;

create function public.mail_admin_execute(p_actor uuid,p_action text,p_params jsonb,p_environment text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.mail_campaigns%rowtype; d private.mail_deliveries%rowtype; contact_row private.mail_contacts%rowtype;
 result jsonb; item jsonb; lang text; used integer; fields text[]; groups jsonb;
begin
 if p_actor is null or private.lock_account_write(p_actor) then raise exception 'native_admin_forbidden' using errcode='42501'; end if;
 perform private.native_admin_require_owner(p_actor);
 -- One lock order for dispatch, consent and withdrawal; bounded transactions only.
 perform pg_advisory_xact_lock(1636,300);
 if p_environment is null or p_environment not in('sandbox','production') or jsonb_typeof(p_params) is distinct from 'object' then raise exception 'native_admin_invalid'; end if;
 fields:=case p_action when 'mail_list' then array[]::text[] when 'mail_new' then array[]::text[]
 when 'mail_get' then array['campaign_id'] when 'mail_save' then array['campaign_id','revision','name','template','target_group','content']
 when 'mail_approve' then array['campaign_id','revision','confirm'] when 'mail_claim' then array['campaign_id','revision']
 when 'mail_finish' then array['delivery_id','status','provider_id'] when 'mail_sync_page' then array['cursor']
 when 'mail_can_send' then array['delivery_id'] when 'mail_sync_ack' then array['email','revision'] else null end;
 if fields is null or (p_params-fields)<>'{}'::jsonb then raise exception 'native_admin_invalid'; end if;
 if p_action in('mail_get','mail_save','mail_approve','mail_claim') then
  select * into c from private.mail_campaigns where id=(p_params->>'campaign_id')::uuid and environment=p_environment for update;
  if not found then raise exception 'native_admin_not_found'; end if;
  if p_action<>'mail_get' and c.revision is distinct from (p_params->>'revision')::integer then raise exception 'mail_revision_conflict'; end if;
 end if;
 if p_action='mail_list' then
  select coalesce(jsonb_object_agg(g,n),'{}') into groups from(
   select g,count(*) n from private.mail_contacts t cross join lateral unnest(private.mail_groups(t.email,p_environment)) g group by g) counts;
  result:=jsonb_build_object('campaigns',coalesce((select jsonb_agg(to_jsonb(x)) from(
   select id,revision,name,template,target_group,state,created_at from private.mail_campaigns where environment=p_environment order by created_at desc limit 100)x),'[]'),
   'counts',groups,'quota_remaining',greatest(0,300-(select count(*) from private.mail_quota_reservations where reserved_at>clock_timestamp()-interval '24 hours')));
 elsif p_action='mail_new' then
  insert into private.mail_campaigns(environment) values(p_environment) returning * into c;
  result:=jsonb_build_object('campaign',to_jsonb(c));
 elsif p_action='mail_get' then
  result:=jsonb_build_object('campaign',to_jsonb(c),'history',coalesce((select jsonb_agg(to_jsonb(x)) from(
   select id,status,locale,reserved_at,finished_at,provider_id from private.mail_deliveries where campaign_id=c.id order by id limit 100)x),'[]'),
   'quota_remaining',greatest(0,300-(select count(*) from private.mail_quota_reservations where reserved_at>clock_timestamp()-interval '24 hours')),'totals',coalesce((select jsonb_object_agg(status,n) from(select status,count(*) n from private.mail_deliveries where campaign_id=c.id group by status)x),'{}'));
 elsif p_action='mail_save' then
  if c.state<>'draft' or p_params->>'name' is null or p_params->>'template' is null or p_params->>'target_group' is null or jsonb_typeof(p_params->'content') is distinct from 'object' or
    not((p_params->'content') ?& array['es','en','it','pt-BR']) or ((p_params->'content')-array['es','en','it','pt-BR'])<>'{}' then raise exception 'native_admin_invalid'; end if;
  foreach lang in array array['es','en','it','pt-BR'] loop
   item:=p_params->'content'->lang;
   if jsonb_typeof(item) is distinct from 'object' or item-array['subject','body']<>'{}' or jsonb_typeof(item->'subject') is distinct from 'string'
    or jsonb_typeof(item->'body') is distinct from 'string' or length(item->>'subject')>200 or length(item->>'body')>12000
    or (item->>'subject') ~ E'[\r\n]' then raise exception 'native_admin_invalid'; end if;
  end loop;
  update private.mail_campaigns set name=p_params->>'name',template=p_params->>'template',target_group=p_params->>'target_group',content=p_params->'content',
   revision=revision+1,approved_at=null,approved_by=null where id=c.id returning * into c;
  result:=jsonb_build_object('campaign',to_jsonb(c));
 elsif p_action='mail_approve' then
  if p_params->'confirm' is distinct from 'true'::jsonb then raise exception 'native_admin_invalid'; end if;
  if c.state='draft' then
   foreach lang in array array['es','en','it','pt-BR'] loop
    if coalesce(length(btrim(c.content->lang->>'subject')),0)=0 or coalesce(length(btrim(c.content->lang->>'body')),0)=0 or position('{{contenido}}' in c.content->lang->>'body')>0 then raise exception 'native_admin_invalid'; end if;
   end loop;
   update private.mail_campaigns set state='sending',approved_by=p_actor,approved_at=now() where id=c.id returning * into c;
   insert into private.mail_deliveries(campaign_id,email,locale) select c.id,t.email,t.locale from private.mail_contacts t
    where c.target_group=any(private.mail_groups(t.email,p_environment)) on conflict do nothing;
  end if;
  result:=jsonb_build_object('campaign',to_jsonb(c));
 elsif p_action='mail_claim' then
  -- Serialize quota across every campaign and Owner. Reserve BEFORE any provider call.
  perform pg_advisory_xact_lock(1636,300);
  if c.state<>'sending' or c.approved_by is null then result:=jsonb_build_object('delivery',null);
  else
   select count(*) into used from private.mail_quota_reservations where reserved_at>clock_timestamp()-interval '24 hours';
   if used>=300 then result:=jsonb_build_object('delivery',null,'quota_remaining',0);
   else
    -- Recheck consent/group at the dispatch boundary, including withdrawals between batches.
    update private.mail_deliveries x set status='skipped',finished_at=now() where x.campaign_id=c.id and x.status='pending'
     and not coalesce(c.target_group=any(private.mail_groups(x.email,p_environment)),false);
    select * into d from private.mail_deliveries where campaign_id=c.id and status='pending' order by id limit 1 for update;
    if not found then
     update private.mail_campaigns set state='completed' where id=c.id;
     result:=jsonb_build_object('delivery',null);
    else
     select * into contact_row from private.mail_contacts where email=d.email for update;
     update private.mail_deliveries set status='dispatching',reserved_at=clock_timestamp() where id=d.id returning * into d;
     insert into private.mail_quota_reservations(id,reserved_at) values(d.id,d.reserved_at);
     result:=jsonb_build_object('delivery',to_jsonb(d),'content',c.content->d.locale);
    end if;
   end if;
  end if;
 elsif p_action='mail_finish' then
  if p_params->>'status' is null or p_params->>'status' not in('accepted','uncertain','skipped') or length(p_params->>'provider_id')>200 then raise exception 'native_admin_invalid'; end if;
  update private.mail_deliveries set status=p_params->>'status',provider_id=p_params->>'provider_id',finished_at=now()
   where id=(p_params->>'delivery_id')::uuid and status='dispatching' and campaign_id in(select id from private.mail_campaigns where environment=p_environment);
  result:='{}';
 elsif p_action='mail_can_send' then
  result:=jsonb_build_object('allowed',exists(select 1 from private.mail_deliveries md join private.mail_campaigns mc on mc.id=md.campaign_id
   where md.id=(p_params->>'delivery_id')::uuid and mc.environment=p_environment and md.status='dispatching'
   and coalesce(mc.target_group=any(private.mail_groups(md.email,p_environment)),false)));
 elsif p_action='mail_sync_page' then
  result:=jsonb_build_object('contacts',coalesce((select jsonb_agg(to_jsonb(x)) from(
   select email,revision,consent,private.mail_groups(email,p_environment) groups from private.mail_contacts
   where email>coalesce(p_params->>'cursor','') order by email limit 5)x),'[]'));
 elsif p_action='mail_sync_ack' then
  update private.mail_contacts set synced_revision=revision where email=p_params->>'email' and revision=(p_params->>'revision')::bigint;
  result:='{}';
 end if;
 -- No addresses/content/tokens in the append-only audit.
 insert into private.mail_audit(actor,action,target,detail) values(p_actor,p_action,coalesce(c.id::text,'mail'),jsonb_build_object('revision',c.revision));
 return result;
end $$;
revoke all on function private.mail_groups(text,text) from public,anon,authenticated,service_role;
revoke all on function public.mail_record_consent(uuid,text,text,boolean,text,boolean),public.mail_unsubscribe(text),public.mail_admin_execute(uuid,text,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.mail_record_consent(uuid,text,text,boolean,text,boolean),public.mail_unsubscribe(text),public.mail_admin_execute(uuid,text,jsonb,text) to service_role;
-- Local PII participates in the existing durable erasure barrier.
create function private.mail_forget_deleted_account() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.deleted_at is not null then
  perform pg_advisory_xact_lock(1636,300);
  delete from private.mail_contacts where account_id=new.account_id or erasure_account=new.account_id;
 end if;
 return new;
end $$;
revoke all on function private.mail_forget_deleted_account() from public,anon,authenticated,service_role;
create trigger mail_forget_deleted_account after update of deleted_at on public.account_identities
 for each row when(new.deleted_at is not null) execute function private.mail_forget_deleted_account();
commit;
