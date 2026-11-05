-- Generated from disposable PostgreSQL; read-only. Do not edit.
-- Name: mail_admin_execute_v1(uuid, text, jsonb, text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.mail_admin_execute_v1(p_actor uuid, p_action text, p_params jsonb, p_environment text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--

-- Name: mail_admin_execute_v2(uuid, text, jsonb, text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.mail_admin_execute_v2(p_actor uuid, p_action text, p_params jsonb, p_environment text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
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
end $_$;


--

-- Name: mail_effect_valid(text, integer, boolean); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.mail_effect_valid(outcome text, status integer, erasure boolean) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
 select coalesce(outcome in('started','succeeded','failed','unknown') and (status is null or status between 100 and 599)
 and case outcome when 'started' then status is null
 when 'succeeded' then case when erasure then status in(204,404) else status between 200 and 299 end
 when 'failed' then case when erasure then status in(401,403,422) else status is null or status in(400,401,403,404,422) end
 else status is null or case when erasure then status not in(204,404,401,403,422) else status not in(400,401,403,404,422) end end,false)
$$;


--

-- Name: mail_forget_deleted_account(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.mail_forget_deleted_account() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
 if new.deleted_at is not null then
  perform pg_advisory_xact_lock(1636,300);
  delete from private.mail_contacts where account_id=new.account_id or erasure_account=new.account_id;
 end if;
 return new;
end $$;


--

-- Name: mail_groups(text, text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.mail_groups(p_email text, p_environment text) RETURNS text[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--

-- Name: mail_queue_contact_erasure(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.mail_queue_contact_erasure() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
 perform pg_advisory_xact_lock(1636,300);
 -- Drain a PUT started at the lease boundary (4s HTTP plus 6s safety margin).
 insert into private.mail_contact_erasures(email,account_id,next_attempt_at,email_fingerprint)
 values(old.email,coalesce(old.erasure_account,old.account_id),greatest(clock_timestamp(),old.sync_lease_until+interval '10 seconds'),
  encode(sha256(convert_to(old.email,'UTF8')),'hex'))
 on conflict(email) where email is not null do nothing;
 insert into private.mail_audit(action,target,detail) values('erasure_queued','contact','{}');
 return old;
end $$;


--

-- Name: mail_record_consent_v1(uuid, text, text, boolean, text, boolean); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.mail_record_consent_v1(p_account uuid, p_email text, p_locale text, p_consent boolean, p_evidence text, p_waitlist boolean DEFAULT false) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--

-- Name: mail_sync_projection(text, text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.mail_sync_projection(p_email text, p_environment text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
 select jsonb_build_object('revision',revision,'locale',locale,'consent',consent,'groups',private.mail_groups(email,p_environment))
 from private.mail_contacts where email=p_email
$$;


--

-- Name: mail_admin_execute(uuid, text, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mail_admin_execute(p_actor uuid, p_action text, p_params jsonb, p_environment text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare response jsonb; failures jsonb; c private.mail_campaigns%rowtype; recipients bigint;
begin
 -- Same account/queue lock order as dispatch, consent and withdrawal.
 if p_actor is null or private.lock_account_write(p_actor) then raise exception 'native_admin_forbidden' using errcode='42501'; end if;
 perform private.native_admin_require_owner(p_actor);
 perform pg_advisory_xact_lock(1636,300);
 if p_environment is null or p_environment not in('sandbox','production') or jsonb_typeof(p_params) is distinct from 'object' then
  raise exception 'native_admin_invalid' using errcode='22023'; end if;
 if p_action='mail_approve' then
  if jsonb_typeof(p_params->'expected_recipients') is distinct from 'number'
   or (p_params->>'expected_recipients') !~ '^[0-9]+$' then raise exception 'native_admin_invalid' using errcode='22023'; end if;
  response:=private.mail_admin_execute_v2(p_actor,p_action,p_params-'expected_recipients',p_environment);
  -- Compare the actual queue created by approval, not a preceding MVCC count.
  select count(*) into recipients from private.mail_deliveries where campaign_id=(p_params->>'campaign_id')::uuid;
  if recipients is distinct from (p_params->>'expected_recipients')::bigint then
   raise exception 'mail_revision_conflict' using errcode='40001'; end if;
 elsif p_action='mail_cancel' then
  if p_params-array['campaign_id','revision']<>'{}' or jsonb_typeof(p_params->'revision') is distinct from 'number' then
   raise exception 'native_admin_invalid' using errcode='22023'; end if;
  select * into c from private.mail_campaigns where id=(p_params->>'campaign_id')::uuid and environment=p_environment for update;
  if not found then raise exception 'native_admin_not_found'; end if;
  if c.revision is distinct from (p_params->>'revision')::integer then raise exception 'mail_revision_conflict'; end if;
  if c.state not in('sending','canceled') then raise exception 'native_admin_invalid'; end if;
  if c.state='sending' then
   update private.mail_campaigns set state='canceled' where id=c.id returning * into c;
   update private.mail_deliveries set status='skipped',finished_at=now() where campaign_id=c.id and status='pending';
   insert into private.mail_audit(actor,action,target,detail) values(p_actor,'mail_cancel',c.id::text,'{}');
  end if;
  response:=jsonb_build_object('campaign',to_jsonb(c));
 else
  response:=private.mail_admin_execute_v2(p_actor,p_action,p_params,p_environment);
 end if;
 if p_action in('mail_get','mail_save') and response->'campaign'->>'state'='draft' then
  select * into c from private.mail_campaigns where id=(response->'campaign'->>'id')::uuid;
  select count(*) into recipients from private.mail_contacts t where c.target_group=any(private.mail_groups(t.email,p_environment));
  response:=response||jsonb_build_object('recipients',recipients);
 elsif p_action='mail_can_send' then
  response:=jsonb_build_object('allowed',response->'allowed'='true'::jsonb and exists(
   select 1 from private.mail_deliveries d join private.mail_campaigns campaign on campaign.id=d.campaign_id
   where d.id=(p_params->>'delivery_id')::uuid and campaign.state='sending'));
 end if;
 if p_action='mail_list' then
  select coalesce(jsonb_agg(to_jsonb(f)),'[]') into failures from (
   select id,attempts,last_http_status,outcome as reason,failed_at from private.mail_contact_erasures
   where state='failed' order by failed_at,id limit 20
  ) f;
  response:=response||jsonb_build_object('cleanup',jsonb_build_object(
   'pending',(select count(*) from private.mail_contact_erasures where state in('pending','processing')),
   'completed',(select count(*) from private.mail_contact_erasures where state='completed'),
   'failed',(select count(*) from private.mail_contact_erasures where state='failed'),'failures',failures));
 end if;
 return response;
end $_$;


--

-- Name: mail_consent_execute(uuid, text, text, text, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mail_consent_execute(p_account uuid, p_email text, p_action text, p_locale text DEFAULT NULL::text, p_consent boolean DEFAULT NULL::boolean, p_source text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
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
end $_$;


--

-- Name: mail_erasure_claim(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mail_erasure_claim() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare job private.mail_contact_erasures%rowtype;
begin
 perform public.mail_erasure_expire();
 select * into job from private.mail_contact_erasures where
  (state='pending' and next_attempt_at<=clock_timestamp()) or
  (state='processing' and lease_until<=clock_timestamp())
 order by next_attempt_at,id limit 1 for update;
 if not found then return jsonb_build_object('job',null); end if;
 update private.mail_contact_erasures set state='processing',lease=gen_random_uuid(),
  lease_until=clock_timestamp()+interval '60 seconds',attempts=attempts+1
  where id=job.id returning * into job;
 return jsonb_build_object('job',jsonb_build_object('id',job.id,'email',job.email,'lease',job.lease));
end $$;


--

-- Name: mail_erasure_expire(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mail_erasure_expire() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare expired integer;
begin
 perform pg_advisory_xact_lock(1636,300);
 with expired_jobs as (
  update private.mail_contact_erasures set state='failed',email=null,lease=null,lease_until=null,
   failed_at=clock_timestamp(),outcome=case when created_at<=clock_timestamp()-interval '24 hours' then 'retention_limit' else 'attempt_limit' end
  where state in('pending','processing') and (created_at<=clock_timestamp()-interval '24 hours'
   or (attempts>=8 and (state='pending' or lease_until<=clock_timestamp())))
  returning id,outcome,attempts,last_http_status
 ), audited as (
  insert into private.mail_audit(action,target,detail)
  select 'erasure_failed',id::text,jsonb_build_object('reason',outcome,'attempt',attempts,'http_status',last_http_status) from expired_jobs returning 1
 ) select count(*)::integer into expired from audited;
 return expired;
end $$;


--

-- Name: mail_erasure_finish(uuid, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mail_erasure_finish(p_id uuid, p_lease uuid, p_http_status integer) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare job private.mail_contact_erasures%rowtype; success boolean; failed boolean; reason text;
begin
 perform pg_advisory_xact_lock(1636,300);
 if p_http_status is null or p_http_status not between 0 and 599 then raise exception 'native_admin_invalid'; end if;
 select * into job from private.mail_contact_erasures where id=p_id and lease=p_lease and state='processing' for update;
 if not found then return false; end if;
 success:=p_http_status in(204,404);
 failed:=not success and (job.attempts>=8 or job.created_at<=clock_timestamp()-interval '24 hours');
 reason:=case when success then case p_http_status when 204 then 'deleted' else 'already_absent' end
  when failed then case when job.created_at<=clock_timestamp()-interval '24 hours' then 'retention_limit' else 'attempt_limit' end else 'retry' end;
 update private.mail_contact_erasures set state=case when success then 'completed' when failed then 'failed' else 'pending' end,
  email=case when success or failed then null else email end,email_fingerprint=case when success then null else email_fingerprint end,lease=null,lease_until=null,last_http_status=p_http_status,
  outcome=reason,completed_at=case when success then clock_timestamp() end,failed_at=case when failed then clock_timestamp() end,
  next_attempt_at=clock_timestamp()+make_interval(secs=>least(3600,5*power(2,least(job.attempts-1,10)))::integer)
 where id=job.id;
 insert into private.mail_audit(action,target,detail) values(case when failed then 'erasure_failed' else 'erasure_result' end,job.id::text,
  jsonb_build_object('completed',success,'failed',failed,'reason',reason,'http_status',p_http_status,'attempt',job.attempts));
 return true;
end $$;


--

-- Name: mail_forget_waitlist(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mail_forget_waitlist(p_email text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
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
end $_$;


--

-- Name: mail_record_consent(uuid, text, text, boolean, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mail_record_consent(p_account uuid, p_email text, p_locale text, p_consent boolean, p_evidence text, p_waitlist boolean DEFAULT false) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
 if p_account is not null and private.lock_account_write(p_account) then raise sqlstate '28000' using message='account_deleted'; end if;
 perform pg_advisory_xact_lock(1636,300);
 if exists(select 1 from private.mail_contact_erasures where
  (email=lower(btrim(p_email)) and state in('pending','processing')) or
  (state='failed' and email_fingerprint=encode(sha256(convert_to(lower(btrim(p_email)),'UTF8')),'hex'))) then
  if p_consent then raise exception 'mail_erasure_pending' using errcode='40001'; end if;
  return;
 end if;
 perform private.mail_record_consent_v1(p_account,p_email,p_locale,p_consent,p_evidence,p_waitlist);
end $$;


--

-- Name: mail_unsubscribe(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mail_unsubscribe(p_email text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
 perform pg_advisory_xact_lock(1636,300);
 update private.mail_contacts set consent=false,consent_at=now(),evidence='unsubscribe',revision=revision+1
 where email=lower(btrim(p_email)) and consent;
 insert into private.mail_audit(action,target,detail) values('unsubscribe','contact','{}');
 update private.mail_deliveries set status='skipped',finished_at=now()
 where email=lower(btrim(p_email)) and status='pending';

end $$;


--

-- Name: mail_unsubscribe_budget(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mail_unsubscribe_budget(p_token_hash text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
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
end $_$;


--

-- Name: mail_audit; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.mail_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor uuid,
    action text NOT NULL,
    target text NOT NULL,
    detail jsonb NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL
);


--

-- Name: mail_campaigns; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.mail_campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    name text DEFAULT 'Nueva campaña'::text NOT NULL,
    template text DEFAULT 'news'::text NOT NULL,
    target_group text DEFAULT 'free'::text NOT NULL,
    content jsonb DEFAULT '{"en": {"body": "", "subject": ""}, "es": {"body": "", "subject": ""}, "it": {"body": "", "subject": ""}, "pt-BR": {"body": "", "subject": ""}}'::jsonb NOT NULL,
    environment text NOT NULL,
    state text DEFAULT 'draft'::text NOT NULL,
    approved_by uuid,
    approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mail_campaigns_environment_check CHECK ((environment = ANY (ARRAY['sandbox'::text, 'production'::text]))),
    CONSTRAINT mail_campaigns_name_check CHECK (((length(name) >= 1) AND (length(name) <= 120))),
    CONSTRAINT mail_campaigns_state_check CHECK ((state = ANY (ARRAY['draft'::text, 'sending'::text, 'completed'::text, 'canceled'::text]))),
    CONSTRAINT mail_campaigns_target_group_check CHECK ((target_group = ANY (ARRAY['free'::text, 'pro'::text, 'pro_plus'::text, 'launch'::text, 'testers'::text, 'creators'::text, 'waitlist'::text]))),
    CONSTRAINT mail_campaigns_template_check CHECK ((template = ANY (ARRAY['news'::text, 'offer'::text, 'launch'::text])))
);


--

-- Name: COLUMN mail_campaigns.approved_by; Type: COMMENT; Schema: private; Owner: -
--

COMMENT ON COLUMN private.mail_campaigns.approved_by IS 'Historical approval provenance. Does not own contacts or deliveries; another live Owner may continue the campaign after this account is erased.';


--

-- Name: mail_consent_budget; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.mail_consent_budget (
    account_id uuid NOT NULL,
    window_start timestamp with time zone NOT NULL,
    requests integer NOT NULL
);


--

-- Name: mail_contact_erasures; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.mail_contact_erasures (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text,
    account_id uuid,
    state text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    next_attempt_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    lease uuid,
    lease_until timestamp with time zone,
    last_http_status integer,
    outcome text,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    completed_at timestamp with time zone,
    email_fingerprint text,
    failed_at timestamp with time zone,
    CONSTRAINT mail_contact_erasures_attempts_check CHECK ((attempts >= 0)),
    CONSTRAINT mail_contact_erasures_email_check CHECK (((email = lower(btrim(email))) AND (length(email) <= 320))),
    CONSTRAINT mail_contact_erasures_email_fingerprint_check CHECK ((email_fingerprint ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT mail_contact_erasures_last_http_status_check CHECK (((last_http_status >= 0) AND (last_http_status <= 599))),
    CONSTRAINT mail_erasure_failed_receipt CHECK (((state <> 'failed'::text) OR (email_fingerprint IS NOT NULL))),
    CONSTRAINT mail_erasure_outcome CHECK ((outcome = ANY (ARRAY['deleted'::text, 'already_absent'::text, 'retry'::text, 'attempt_limit'::text, 'retention_limit'::text, 'manual_deleted'::text, 'manual_absent'::text]))),
    CONSTRAINT mail_erasure_pii CHECK (((state = ANY (ARRAY['completed'::text, 'failed'::text])) = (email IS NULL))),
    CONSTRAINT mail_erasure_state CHECK ((state = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text])))
);


--

-- Name: TABLE mail_contact_erasures; Type: COMMENT; Schema: private; Owner: -
--

COMMENT ON TABLE private.mail_contact_erasures IS 'Post-erasure cleanup duty. Account FK is retained provenance, not live ownership. No direct API grants; queue/claim/finish/expire remain callable after tombstone.';


--

-- Name: mail_contacts; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.mail_contacts (
    email text NOT NULL,
    account_id uuid,
    erasure_account uuid,
    locale text NOT NULL,
    consent boolean DEFAULT false NOT NULL,
    consent_at timestamp with time zone DEFAULT now() NOT NULL,
    evidence text NOT NULL,
    waitlist boolean DEFAULT false NOT NULL,
    revision bigint DEFAULT 1 NOT NULL,
    synced_revision bigint DEFAULT 0 NOT NULL,
    sync_lease uuid,
    sync_lease_until timestamp with time zone,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sync_state jsonb DEFAULT '{}'::jsonb NOT NULL,
    sync_lease_projection jsonb,
    sync_lease_environment text,
    CONSTRAINT mail_contacts_email_check CHECK (((email = lower(btrim(email))) AND (email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'::text) AND (length(email) <= 320))),
    CONSTRAINT mail_contacts_evidence_check CHECK (((length(evidence) >= 1) AND (length(evidence) <= 200))),
    CONSTRAINT mail_contacts_locale_check CHECK ((locale = ANY (ARRAY['es'::text, 'en'::text, 'it'::text, 'pt-BR'::text]))),
    CONSTRAINT mail_contacts_sync_lease_environment_check CHECK ((sync_lease_environment = ANY (ARRAY['sandbox'::text, 'production'::text])))
);


--

-- Name: mail_deliveries; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.mail_deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id uuid NOT NULL,
    email text NOT NULL,
    locale text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    reserved_at timestamp with time zone,
    finished_at timestamp with time zone,
    provider_id text,
    CONSTRAINT mail_deliveries_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'dispatching'::text, 'accepted'::text, 'uncertain'::text, 'skipped'::text]))),
    CONSTRAINT mail_delivery_locale CHECK ((locale = ANY (ARRAY['es'::text, 'en'::text, 'it'::text, 'pt-BR'::text])))
);


--

-- Name: mail_quota_reservations; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.mail_quota_reservations (
    id uuid NOT NULL,
    reserved_at timestamp with time zone NOT NULL
);


--

-- Name: mail_unsubscribe_rate; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.mail_unsubscribe_rate (
    bucket text NOT NULL,
    window_start timestamp with time zone NOT NULL,
    requests integer NOT NULL,
    CONSTRAINT mail_unsubscribe_rate_bucket_check CHECK (((bucket = 'global'::text) OR (bucket ~ '^token:[a-f0-9]{64}$'::text))),
    CONSTRAINT mail_unsubscribe_rate_requests_check CHECK ((requests > 0))
);


--

-- Name: mail_audit mail_audit_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.mail_audit
    ADD CONSTRAINT mail_audit_pkey PRIMARY KEY (id);


--

-- Name: mail_campaigns mail_campaigns_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.mail_campaigns
    ADD CONSTRAINT mail_campaigns_pkey PRIMARY KEY (id);


--

-- Name: mail_consent_budget mail_consent_budget_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.mail_consent_budget
    ADD CONSTRAINT mail_consent_budget_pkey PRIMARY KEY (account_id);


--

-- Name: mail_contact_erasures mail_contact_erasures_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.mail_contact_erasures
    ADD CONSTRAINT mail_contact_erasures_pkey PRIMARY KEY (id);


--

-- Name: mail_contacts mail_contacts_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.mail_contacts
    ADD CONSTRAINT mail_contacts_pkey PRIMARY KEY (email);


--

-- Name: mail_deliveries mail_deliveries_campaign_id_email_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.mail_deliveries
    ADD CONSTRAINT mail_deliveries_campaign_id_email_key UNIQUE (campaign_id, email);


--

-- Name: mail_deliveries mail_deliveries_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.mail_deliveries
    ADD CONSTRAINT mail_deliveries_pkey PRIMARY KEY (id);


--

-- Name: mail_quota_reservations mail_quota_reservations_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.mail_quota_reservations
    ADD CONSTRAINT mail_quota_reservations_pkey PRIMARY KEY (id);


--

-- Name: mail_unsubscribe_rate mail_unsubscribe_rate_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.mail_unsubscribe_rate
    ADD CONSTRAINT mail_unsubscribe_rate_pkey PRIMARY KEY (bucket);


--

-- Name: mail_audit_target_lookup; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX mail_audit_target_lookup ON private.mail_audit USING btree (target);


--

-- Name: mail_contact_account; Type: INDEX; Schema: private; Owner: -
--

CREATE UNIQUE INDEX mail_contact_account ON private.mail_contacts USING btree (account_id) WHERE (account_id IS NOT NULL);


--

-- Name: mail_contact_id; Type: INDEX; Schema: private; Owner: -
--

CREATE UNIQUE INDEX mail_contact_id ON private.mail_contacts USING btree (id);


--

-- Name: mail_delivery_pending; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX mail_delivery_pending ON private.mail_deliveries USING btree (campaign_id, id) WHERE (status = 'pending'::text);


--

-- Name: mail_delivery_quota; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX mail_delivery_quota ON private.mail_quota_reservations USING btree (reserved_at);


--

-- Name: mail_erasure_active_email; Type: INDEX; Schema: private; Owner: -
--

CREATE UNIQUE INDEX mail_erasure_active_email ON private.mail_contact_erasures USING btree (email) WHERE (email IS NOT NULL);


--

-- Name: mail_erasure_due; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX mail_erasure_due ON private.mail_contact_erasures USING btree (next_attempt_at) WHERE (state <> 'completed'::text);


--

-- Name: mail_erasure_failed_fingerprint; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX mail_erasure_failed_fingerprint ON private.mail_contact_erasures USING btree (email_fingerprint) WHERE (state = 'failed'::text);


--

-- Name: mail_consent_budget a_account_write_barrier; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON private.mail_consent_budget FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''account_id'')::uuid) owners(account)', 'select ($1->>''account_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''account_id'')::uuid))');


--

-- Name: mail_contacts a_account_write_barrier; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON private.mail_contacts FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''account_id'')::uuid union select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''erasure_account'')::uuid) owners(account)', 'select ($1->>''account_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''account_id'')::uuid)) or ($1->>''erasure_account'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''erasure_account'')::uuid))');


--

-- Name: mail_deliveries a_account_write_barrier; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON private.mail_deliveries FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from private.mail_contacts p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''account_id'')::uuid) a(account) where p2.email=($1->>''email'')::text union select a.account from private.mail_contacts p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''erasure_account'')::uuid) a(account) where p2.email=($1->>''email'')::text) owners(account)', 'select ($1->>''email'' is not null and not exists(select 1 from private.mail_contacts p where p.email=($1->>''email'')::text))');


--

-- Name: mail_audit b_minimize_mail_audit; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER b_minimize_mail_audit BEFORE INSERT ON private.mail_audit FOR EACH ROW EXECUTE FUNCTION private.minimize_admin_audit('actor', 'detail');


--

-- Name: mail_audit mail_audit_append_only; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER mail_audit_append_only BEFORE DELETE OR UPDATE ON private.mail_audit FOR EACH ROW WHEN ((NOT private.admin_audit_maintenance())) EXECUTE FUNCTION public.operational_access_reject_audit_mutation();


--

-- Name: mail_contacts mail_queue_contact_erasure; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER mail_queue_contact_erasure BEFORE DELETE ON private.mail_contacts FOR EACH ROW EXECUTE FUNCTION private.mail_queue_contact_erasure();


--

-- Name: mail_campaigns mail_campaigns_approved_by_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.mail_campaigns
    ADD CONSTRAINT mail_campaigns_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id);


--

-- Name: mail_consent_budget mail_consent_budget_account_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.mail_consent_budget
    ADD CONSTRAINT mail_consent_budget_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--

-- Name: mail_contact_erasures mail_contact_erasures_account_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.mail_contact_erasures
    ADD CONSTRAINT mail_contact_erasures_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--

-- Name: mail_contacts mail_contacts_account_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.mail_contacts
    ADD CONSTRAINT mail_contacts_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--

-- Name: mail_contacts mail_contacts_erasure_account_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.mail_contacts
    ADD CONSTRAINT mail_contacts_erasure_account_fkey FOREIGN KEY (erasure_account) REFERENCES public.profiles(id) ON DELETE CASCADE;


--

-- Name: mail_deliveries mail_deliveries_campaign_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.mail_deliveries
    ADD CONSTRAINT mail_deliveries_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES private.mail_campaigns(id);


--

-- Name: mail_deliveries mail_deliveries_email_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.mail_deliveries
    ADD CONSTRAINT mail_deliveries_email_fkey FOREIGN KEY (email) REFERENCES private.mail_contacts(email) ON DELETE CASCADE;


--

-- Name: mail_audit; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.mail_audit ENABLE ROW LEVEL SECURITY;

--

-- Name: mail_campaigns; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.mail_campaigns ENABLE ROW LEVEL SECURITY;

--

-- Name: mail_consent_budget; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.mail_consent_budget ENABLE ROW LEVEL SECURITY;

--

-- Name: mail_contact_erasures; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.mail_contact_erasures ENABLE ROW LEVEL SECURITY;

--

-- Name: mail_contacts; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.mail_contacts ENABLE ROW LEVEL SECURITY;

--

-- Name: mail_deliveries; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.mail_deliveries ENABLE ROW LEVEL SECURITY;

--

-- Name: mail_quota_reservations; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.mail_quota_reservations ENABLE ROW LEVEL SECURITY;

--

-- Name: mail_unsubscribe_rate; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.mail_unsubscribe_rate ENABLE ROW LEVEL SECURITY;

--

-- Name: FUNCTION mail_admin_execute_v1(p_actor uuid, p_action text, p_params jsonb, p_environment text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.mail_admin_execute_v1(p_actor uuid, p_action text, p_params jsonb, p_environment text) FROM PUBLIC;


--

-- Name: FUNCTION mail_admin_execute_v2(p_actor uuid, p_action text, p_params jsonb, p_environment text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.mail_admin_execute_v2(p_actor uuid, p_action text, p_params jsonb, p_environment text) FROM PUBLIC;


--

-- Name: FUNCTION mail_effect_valid(outcome text, status integer, erasure boolean); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.mail_effect_valid(outcome text, status integer, erasure boolean) FROM PUBLIC;


--

-- Name: FUNCTION mail_forget_deleted_account(); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.mail_forget_deleted_account() FROM PUBLIC;


--

-- Name: FUNCTION mail_groups(p_email text, p_environment text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.mail_groups(p_email text, p_environment text) FROM PUBLIC;


--

-- Name: FUNCTION mail_queue_contact_erasure(); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.mail_queue_contact_erasure() FROM PUBLIC;


--

-- Name: FUNCTION mail_record_consent_v1(p_account uuid, p_email text, p_locale text, p_consent boolean, p_evidence text, p_waitlist boolean); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.mail_record_consent_v1(p_account uuid, p_email text, p_locale text, p_consent boolean, p_evidence text, p_waitlist boolean) FROM PUBLIC;


--

-- Name: FUNCTION mail_sync_projection(p_email text, p_environment text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.mail_sync_projection(p_email text, p_environment text) FROM PUBLIC;


--

-- Name: FUNCTION mail_admin_execute(p_actor uuid, p_action text, p_params jsonb, p_environment text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mail_admin_execute(p_actor uuid, p_action text, p_params jsonb, p_environment text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mail_admin_execute(p_actor uuid, p_action text, p_params jsonb, p_environment text) TO service_role;


--

-- Name: FUNCTION mail_consent_execute(p_account uuid, p_email text, p_action text, p_locale text, p_consent boolean, p_source text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mail_consent_execute(p_account uuid, p_email text, p_action text, p_locale text, p_consent boolean, p_source text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mail_consent_execute(p_account uuid, p_email text, p_action text, p_locale text, p_consent boolean, p_source text) TO service_role;


--

-- Name: FUNCTION mail_erasure_claim(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mail_erasure_claim() FROM PUBLIC;
GRANT ALL ON FUNCTION public.mail_erasure_claim() TO service_role;


--

-- Name: FUNCTION mail_erasure_expire(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mail_erasure_expire() FROM PUBLIC;
GRANT ALL ON FUNCTION public.mail_erasure_expire() TO service_role;


--

-- Name: FUNCTION mail_erasure_finish(p_id uuid, p_lease uuid, p_http_status integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mail_erasure_finish(p_id uuid, p_lease uuid, p_http_status integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mail_erasure_finish(p_id uuid, p_lease uuid, p_http_status integer) TO service_role;


--

-- Name: FUNCTION mail_forget_waitlist(p_email text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mail_forget_waitlist(p_email text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mail_forget_waitlist(p_email text) TO service_role;


--

-- Name: FUNCTION mail_record_consent(p_account uuid, p_email text, p_locale text, p_consent boolean, p_evidence text, p_waitlist boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mail_record_consent(p_account uuid, p_email text, p_locale text, p_consent boolean, p_evidence text, p_waitlist boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mail_record_consent(p_account uuid, p_email text, p_locale text, p_consent boolean, p_evidence text, p_waitlist boolean) TO service_role;


--

-- Name: FUNCTION mail_unsubscribe(p_email text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mail_unsubscribe(p_email text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mail_unsubscribe(p_email text) TO service_role;


--

-- Name: FUNCTION mail_unsubscribe_budget(p_token_hash text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mail_unsubscribe_budget(p_token_hash text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mail_unsubscribe_budget(p_token_hash text) TO service_role;


--
