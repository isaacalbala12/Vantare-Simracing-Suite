-- Generated from disposable PostgreSQL; read-only. Do not edit.
--
-- PostgreSQL database dump
--



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--

-- Name: auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA auth;


--

-- Name: extensions; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA extensions;


--

-- Name: pilot_private; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA pilot_private;


--

-- Name: private; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA private;


--

-- Name: storage; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA storage;


--

-- Name: dblink; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;


--

-- Name: EXTENSION dblink; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION dblink IS 'connect to other PostgreSQL databases from within a database';


--

-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


--

-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--

-- Name: pgtap; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA public;


--

-- Name: EXTENSION pgtap; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgtap IS 'Unit testing for PostgreSQL';


--

-- Name: jwt(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.jwt() RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), '')::jsonb,
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    case
      when nullif(current_setting('request.jwt.claim.sub', true), '') is not null
      then jsonb_build_object(
        'iss', coalesce(
          nullif(current_setting('request.jwt.claim.iss', true), ''),
          'https://local.supabase.test/auth/v1'
        ),
        'sub', current_setting('request.jwt.claim.sub', true),
        'role', 'authenticated'
      )
      else '{}'::jsonb
    end
  )
$$;


--

-- Name: uid(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
 select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),auth.jwt()->>'sub')::uuid
$$;


--

-- Name: claim_account_device(uuid, text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.claim_account_device(v_user_id uuid, device_fingerprint text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_fp text := nullif(trim(device_fingerprint), '');
  v_bound_fp text;
begin
  if v_fp is null then raise exception 'device_fingerprint_required'; end if;

  insert into public.devices (user_id, fingerprint_hash, first_seen_at, last_seen_at)
  values (v_user_id, v_fp, now(), now())
  on conflict (user_id) do nothing;

  select device_row.fingerprint_hash into v_bound_fp
  from public.devices device_row
  where device_row.user_id = v_user_id
  for update;

  if v_bound_fp is null then
    update public.devices set fingerprint_hash = v_fp, last_seen_at = now()
    where user_id = v_user_id;
  elsif v_bound_fp = v_fp then
    update public.devices set last_seen_at = now() where user_id = v_user_id;
  end if;

  return v_user_id;
end;
$$;


--

-- Name: claim_checkout_compensation_unchecked(text, uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.claim_checkout_compensation_unchecked(p_environment text, p_token uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare c private.billing_checkout_compensations; candidate uuid; account uuid; deleted boolean:=false; activated boolean;
begin
 if p_environment not in ('sandbox','production') or p_token is null then raise exception 'invalid_compensation_claim'; end if;
 select order_id into candidate from private.billing_checkout_compensations
 where environment=p_environment and state in ('waiting','refunding') and next_attempt_at<=now()
  and (lease_until is null or lease_until<=now()) order by next_attempt_at,order_id limit 1;
 if candidate is null then return null; end if;
 select coalesce(b.user_id,a.user_id) into account from private.billing_checkout_compensations j
 left join public.billing_checkout_bindings b on j.environment=b.environment and j.checkout_id::text=b.provider_checkout_id
 left join public.billing_checkout_attempts a on a.environment=j.environment and a.attempt_id=j.attempt_id and a.dispatch_token=j.dispatch_token
 where j.environment=p_environment and j.order_id=candidate;
 -- Same #1622 UUID-before-rows order, but financial compensation must survive deletion.
 if account is not null then deleted:=private.lock_account_write(account); end if;
 select * into c from private.billing_checkout_compensations where environment=p_environment and order_id=candidate for update;
 if c.state not in ('waiting','refunding') or c.next_attempt_at>now() or c.lease_until>now() then return null; end if;
 -- Retained complete source grants prove historical fulfillment too: an expired
 -- subscription or a deleted former buyer is not an unactivated purchase.
 if c.selected_at is null then
   activated:=private.checkout_was_fulfilled(c.environment,c.order_id,c.checkout_id,c.product_id,c.subscription_id,c.capabilities);
   if activated then
     update private.billing_checkout_compensations set state='activated' where environment=c.environment and order_id=c.order_id;
     insert into private.billing_checkout_compensation_audit(environment,order_id,state,code)
       values(c.environment,c.order_id,'activated','license_projected');
     return null;
   end if;
   update private.billing_checkout_compensations set selected_at=now(),state='refunding'
     where environment=c.environment and order_id=c.order_id;
   -- Refresh an existing live account only; never recreate anything for #1622.
   if account is not null and not deleted then
     perform public.billing_refresh_entitlement_read_model_at(account,now());
   end if;
 end if;
 update private.billing_checkout_compensations set lease_token=p_token,lease_until=now()+interval '2 minutes',
   attempt_count=attempt_count+1 where environment=c.environment and order_id=c.order_id returning * into c;
 insert into private.billing_checkout_compensation_audit(environment,order_id,state,code)
   values(c.environment,c.order_id,'refunding','attempt_started');
 return to_jsonb(c);
end $$;


--

-- Name: close_terminal_checkout_attempts(uuid, text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.close_terminal_checkout_attempts(p_user_id uuid, p_environment text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare changed integer;
begin
 if p_user_id is null or p_environment is null or p_environment not in ('sandbox','production') then
  raise exception 'invalid_terminal_checkout_scope';
 end if;
 -- Same account-before-rows lock as claims, snapshots and account erasure.
 -- This helper is private: no customer-supplied snapshot or terminal flag.
 if private.lock_account_write(p_user_id) then return 0; end if;
 with terminal as (
  select a.attempt_id,
   case when greatest(o.reported_refunded_amount,coalesce((
    select sum(f.amount) from public.billing_refunds f
    where f.provider=o.provider and f.environment=o.environment
     and f.provider_order_id=o.provider_order_id and f.currency=o.currency
     and f.status='succeeded'
   ),0))=o.net_amount then 'refunded' else 'revoked' end as resolution
  from public.billing_checkout_attempts a
  join public.billing_checkout_bindings b
   on b.user_id=a.user_id and b.environment=a.environment and b.attempt_id=a.attempt_id
    and b.checkout_key=a.checkout_key and b.catalog_version=a.catalog_version
    and b.provider_checkout_id=coalesce(a.provider_checkout_id,a.recovery_checkout_id::text)
  join public.billing_orders o
   on o.user_id=b.user_id and o.environment=b.environment and o.provider='polar'
    and o.provider_checkout_id=b.provider_checkout_id and o.paid and o.net_amount>0
    and (a.dispatch_product_id is null or o.provider_product_id=a.dispatch_product_id::text)
  left join public.billing_subscriptions sub
   on sub.user_id=o.user_id and sub.provider=o.provider and sub.environment=o.environment
    and sub.provider_subscription_id=o.provider_subscription_id
    and sub.provider_product_id=o.provider_product_id
  where a.user_id=p_user_id and a.environment=p_environment and a.resolution is null
   and (
    greatest(o.reported_refunded_amount,coalesce((
     select sum(f.amount) from public.billing_refunds f
     where f.provider=o.provider and f.environment=o.environment
      and f.provider_order_id=o.provider_order_id and f.currency=o.currency
      and f.status='succeeded'
    ),0))=o.net_amount
    or (
     (sub.status='revoked' or (sub.status='canceled'
       and (not sub.cancel_at_period_end or sub.paid_through<=now())))
     and not exists (
      select 1 from public.billing_effective_access_grants g
      where g.user_id=o.user_id and g.environment=o.environment and g.status='active'
       and (g.valid_until is null or g.valid_until>now())
       and ((g.source_type='subscription' and g.source_id=o.provider_subscription_id)
        or (g.source_type='subscription_recovery'
         and g.metadata->>'subscription_id'=o.provider_subscription_id))
     )
    )
   )
 )
 update public.billing_checkout_attempts a
 set resolution=t.resolution,status='uncertain',checkout_url=null,updated_at=now()
 from terminal t where a.user_id=p_user_id and a.environment=p_environment
  and a.attempt_id=t.attempt_id and a.resolution is null;
 get diagnostics changed=row_count;
 return changed;
end $$;


--

-- Name: FUNCTION close_terminal_checkout_attempts(p_user_id uuid, p_environment text); Type: COMMENT; Schema: private; Owner: -
--

COMMENT ON FUNCTION private.close_terminal_checkout_attempts(p_user_id uuid, p_environment text) IS 'Terminal paid checkout proof from scoped bindings plus full succeeded refund or ended subscription. Keeps history; never releases an unbound/new/pending checkout.';


--

-- Name: current_account(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.current_account() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $_$
 select i.account_id from public.account_identities i
 join private.clerk_issuers c on c.issuer=i.issuer
 where c.enabled and i.deleted_at is null and auth.jwt()->>'role'='authenticated'
 and (
   (i.issuer=auth.jwt()->>'iss' and i.subject=auth.jwt()->>'sub'
     and auth.jwt()->>'sid' ~ '^sess_[a-zA-Z0-9_]+$'
     and auth.jwt()->>'azp'=any(c.authorized_parties))
   or
   (auth.jwt()->>'vantare_identity_provider'='clerk'
     and auth.jwt()->>'iss'=c.native_data_issuer
     and i.issuer=auth.jwt()->>'clerk_issuer' and i.subject=auth.jwt()->>'clerk_subject'
     and i.account_id::text=auth.jwt()->>'sub'
     and auth.jwt()->>'aud'='vantare-native-data'
     and case when auth.jwt()->>'iat' ~ '^[0-9]{1,12}$' and auth.jwt()->>'exp' ~ '^[0-9]{1,12}$'
       then (auth.jwt()->>'exp')::bigint-(auth.jwt()->>'iat')::bigint between 1 and 300
         and (auth.jwt()->>'iat')::bigint <= extract(epoch from now())
         and (auth.jwt()->>'exp')::bigint > extract(epoch from now())
       else false end)
 )
$_$;


--

-- Name: enqueue_web_purchase_erasure(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.enqueue_web_purchase_erasure(p_account uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare event_id bigint;
begin
 if exists(select 1 from private.web_purchase_erasure_events where account_id=p_account) then return; end if;
 -- Transactional counter serializes commit order. A sequence alone could let
 -- cursor N+1 commit before N and permanently skip a tombstone.
 update private.web_purchase_erasure_clock set last_id=last_id+1 where singleton returning last_id into event_id;
 insert into private.web_purchase_erasure_events(id,account_id) values(event_id,p_account);
end $$;


--

-- Name: guard_account_write(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.guard_account_write() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare account uuid; accounts uuid[]; previous uuid[]; current_owners uuid[]; unresolved boolean; deleted boolean:=false; privacy_clear boolean:=false;
begin
  if tg_op<>'DELETE' then
    execute tg_argv[1] into unresolved using to_jsonb(new);
    if unresolved then raise sqlstate '23503' using message='account_owner_unresolved'; end if;
  end if;
  execute tg_argv[0] into accounts using to_jsonb(new);
  if tg_op in ('UPDATE','DELETE') then
    execute tg_argv[0] into previous using to_jsonb(old);
  end if;
  if tg_op='UPDATE' and tg_table_schema='public'
    and tg_table_name='testing_center_posthog_evidence' then
    privacy_clear:=to_jsonb(new)->>'linear_link_authorized_by' is null
      and to_jsonb(new)->>'linear_link_authorized'='false'
      and to_jsonb(new)->>'replay_consent'='false'
      and to_jsonb(new)->>'replay_available'='false'
      and to_jsonb(new)->>'replay_session_id' is null
      and to_jsonb(new)->>'restricted_replay_url' is null
      and to_jsonb(new)->>'replay_expires_at' is null
      and to_jsonb(new)->>'linear_link_authorized_at' is null
      and (to_jsonb(new)-array['linear_link_authorized_by','linear_link_authorized',
        'replay_consent','replay_available','replay_session_id','restricted_replay_url',
        'replay_expires_at','linear_link_authorized_at'])
        = (to_jsonb(old)-array['linear_link_authorized_by','linear_link_authorized',
        'replay_consent','replay_available','replay_session_id','restricted_replay_url',
        'replay_expires_at','linear_link_authorized_at']);
  end if;
  if tg_op='UPDATE' and not coalesce(previous,'{}'::uuid[]) <@ coalesce(accounts,'{}'::uuid[])
    and not privacy_clear and not (tg_table_schema='private' and tg_table_name='mail_contacts') then
    raise sqlstate '28000' using message='account_owner_is_immutable';
  end if;
  if tg_table_name='account_identities' and tg_op='UPDATE' then
    if new.issuer<>old.issuer or new.subject<>old.subject then
      raise sqlstate '28000' using message='account_identity_is_durable';
    end if;
  end if;
  for account in select distinct x from unnest(accounts || coalesce(previous,'{}'::uuid[])) x
    where x is not null order by x
  loop
    -- Do not short circuit: acquire every owner lock in UUID order.
    if private.lock_account_row_write(account) and (not privacy_clear or account=any(accounts)) then deleted:=true; end if;
  end loop;
  execute tg_argv[0] into current_owners using to_jsonb(new);
  if current_owners is distinct from accounts then
    raise sqlstate '40001' using message='account_owner_changed';
  end if;
  if tg_op='DELETE' then
    if tg_table_name in ('profiles','account_identities') then
      raise sqlstate '28000' using message='account_identity_is_durable';
    end if;
    return old; -- Removal/Storage ACK remains possible after a tombstone.
  end if;
  if deleted then
    -- Keep the existing financial projection contract: history survives revoked.
    if tg_table_name in ('billing_access_grants','user_entitlements','operational_access_assignments') then
      new.status:='revoked';
      if tg_table_name='operational_access_assignments' then
        new.revoked_at:=coalesce(new.revoked_at,now());
        new.revoked_by:='clerk:webhook'; new.revoke_reason:='clerk_user_deleted';
      else
        new.metadata:='{}'::jsonb;
      end if;
      return new;
    end if;
    -- Deletion marks aliases one row at a time, under the same account lock.
    if tg_table_name='account_identities' and tg_op='UPDATE' then
      if new.deleted_at is not null and old.deleted_at is null
        and (to_jsonb(new)-'deleted_at'-'user_event_at')=(to_jsonb(old)-'deleted_at'-'user_event_at') then
        return new;
      end if;
    end if;
    raise sqlstate '28000' using message='account_deleted';
  end if;
  return new;
end $$;


--

-- Name: guard_founders_checkout(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.guard_founders_checkout() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_reason text;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text||':billing',0));
 v_reason:=public.billing_purchase_policy(new.user_id,new.environment,new.checkout_key)->>'reason';
 if v_reason is not null then raise exception '%',v_reason; end if;
 if exists(select 1 from public.billing_checkout_attempts
   where user_id=new.user_id and environment=new.environment
   and (new.checkout_key='founders' or checkout_key='founders')
   and attempt_id<>new.attempt_id and expires_at>now()) then
   raise exception 'founders_checkout_pending';
 end if;
 return new;
end $$;


--

-- Name: install_report_creator_owner(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.install_report_creator_owner() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare definition text;
begin
 select pg_get_functiondef('private.native_admin_account(uuid,text,text)'::regprocedure) into definition;
 if position('report_promotion_progress' in definition)>0 then return; end if;
 execute replace(definition,'FUNCTION private.native_admin_account(','FUNCTION private.native_admin_account_before_1661_reports(');
 execute $ddl$
 create or replace function private.native_admin_account(p_account uuid,p_issuer text,p_environment text) returns jsonb
 language sql stable security definer set search_path='' as $body$
 select private.native_admin_account_before_1661_reports(p_account,p_issuer,p_environment)
 ||jsonb_build_object('report_promotion',private.report_promotion_progress(p_account,p_environment,statement_timestamp()))
 $body$ $ddl$;
 revoke all on function private.native_admin_account_before_1661_reports(uuid,text,text),private.native_admin_account(uuid,text,text) from public,anon,authenticated,service_role;
 alter function private.native_admin_account_before_1661_reports(uuid,text,text) owner to postgres;
 alter function private.native_admin_account(uuid,text,text) owner to postgres;
end $_$;


--

-- Name: is_owner(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.is_owner(p_account uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select p_account is not null and exists (
    select 1 from public.operational_access_assignments a
    where a.user_id = p_account and a.role = 'owner'
      and a.status = 'active' and a.policy_version = 1
      and (a.expires_at is null or a.expires_at > now())
  )
$$;


--

-- Name: lock_account_row_write(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.lock_account_row_write(p_account uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
 if current_setting('transaction_isolation')<>'read committed' then
   raise sqlstate '25001' using message='account_write_read_committed_required';
 end if;
 if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(p_account::text,1608)) then
   raise sqlstate '40001' using message='account_write_retry_before_rows';
 end if;
 return exists(select 1 from public.account_identities where account_id=p_account and deleted_at is not null);
end $$;


--

-- Name: lock_account_write(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.lock_account_write(p_account uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if p_account is null then return false; end if;
  -- A snapshot predating the lock cannot prove absence of a committed tombstone.
  if current_setting('transaction_isolation') <> 'read committed' then
    raise sqlstate '25001' using message='account_write_read_committed_required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_account::text,1608));
  return exists(select 1 from public.account_identities
    where account_id=p_account and deleted_at is not null);
end $$;


--

-- Name: lock_accounts_before_rows(uuid[]); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.lock_accounts_before_rows(p_accounts uuid[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare account uuid;
begin
 for account in select distinct a from unnest(p_accounts) a where a is not null order by a loop
   if private.lock_account_write(account) then raise sqlstate '28000' using message='account_deleted'; end if;
 end loop;
end $$;


--

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

-- Name: observe_checkout_payment_unchecked(text, uuid, uuid, uuid, uuid, uuid, bigint, text, text[], uuid, uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.observe_checkout_payment_unchecked(p_environment text, p_order_id uuid, p_checkout_id uuid, p_organization_id uuid, p_product_id uuid, p_subscription_id uuid, p_net_amount bigint, p_currency text, p_capabilities text[], p_attempt_id uuid DEFAULT NULL::uuid, p_dispatch_token uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
 if p_capabilities is null or cardinality(p_capabilities)=0
    or not p_capabilities <@ array['vantare.plan.pro','vantare.channel.testers','vantare.channel.nightly','vantare.edition.launch_v1','vantare.plan.founders']::text[] then
   raise exception 'invalid_compensation_capabilities';
 end if;
 insert into private.billing_checkout_compensations(environment,order_id,checkout_id,organization_id,
   product_id,subscription_id,net_amount,currency,capabilities,state,attempt_id,dispatch_token)
 values(p_environment,p_order_id,p_checkout_id,p_organization_id,p_product_id,p_subscription_id,p_net_amount,p_currency,p_capabilities,
  case when private.checkout_was_fulfilled(p_environment,p_order_id,p_checkout_id,p_product_id,p_subscription_id,p_capabilities)
    then 'activated' else 'waiting' end,
  (select a.attempt_id from public.billing_checkout_attempts a where a.attempt_id=p_attempt_id and a.dispatch_token=p_dispatch_token
    and a.environment=p_environment and a.dispatch_product_id=p_product_id and a.provider_request_started_at is not null),
  (select a.dispatch_token from public.billing_checkout_attempts a where a.attempt_id=p_attempt_id and a.dispatch_token=p_dispatch_token
    and a.environment=p_environment and a.dispatch_product_id=p_product_id and a.provider_request_started_at is not null))
 on conflict do nothing;
 if not exists(select 1 from private.billing_checkout_compensations c where c.environment=p_environment
   and c.order_id=p_order_id and c.checkout_id=p_checkout_id and c.organization_id=p_organization_id
   and c.product_id=p_product_id and c.subscription_id is not distinct from p_subscription_id
   and c.net_amount=p_net_amount and c.currency=p_currency and c.capabilities=p_capabilities) then
   raise exception 'compensation_order_conflict';
 end if;
end $$;


--

-- Name: record_web_purchase_erasure(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.record_web_purchase_erasure() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
 if new.deleted_at is not null then perform private.enqueue_web_purchase_erasure(new.account_id); end if;
 return new;
end $$;


--

-- Name: FUNCTION report_promotion_eligible(t timestamp with time zone); Type: COMMENT; Schema: private; Owner: -
--

COMMENT ON FUNCTION private.report_promotion_eligible(t timestamp with time zone) IS 'Historical name: launch first-period checkout window only. Report enrollment uses report_promotion_enrollment_open and its independent, disabled-by-default policy.';


--

-- Name: require_web_erasure_credential(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.require_web_erasure_credential() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare claims jsonb:=auth.jwt();
begin
 if claims->>'iss' is distinct from 'supabase' or claims->>'role' is distinct from 'web_purchase_erasure'
  or claims->>'aud' is distinct from 'authenticated' or claims->>'purpose' is distinct from 'web_purchase_erasure'
 then raise sqlstate '28000' using message='web_erasure_credential_required'; end if;
 return true;
end $$;


--

-- Name: resolve_account_identity(text, text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.resolve_account_identity(issuer text, subject text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare account uuid; deleted timestamptz;
begin
  if not exists (select 1 from private.clerk_issuers i where i.issuer = $1 and i.enabled)
    or $2 is null or $2 !~ '^user_[a-zA-Z0-9_]{1,128}$' then
    raise sqlstate '28000' using message = 'invalid_clerk_identity';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1 || chr(31) || $2, 0));
  select i.account_id, i.deleted_at into account, deleted
    from public.account_identities i where i.issuer = $1 and i.subject = $2;
  if deleted is not null then raise sqlstate '28000' using message = 'account_deleted'; end if;
  if account is null then
    account := gen_random_uuid();
    insert into public.profiles(id) values(account);
    insert into public.account_identities(issuer, subject, account_id) values($1, $2, account);
  end if;
  if private.lock_account_write(account) then raise sqlstate '28000' using message='account_deleted'; end if; 
  if exists(select 1 from private.admin_account_blocks where account_id=account and blocked) then
   raise exception 'native_account_blocked' using errcode='42501'; end if;
  return account;

end $_$;


--

-- Name: resolve_current_account(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.resolve_current_account() RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare account uuid:=private.current_account();
begin
  if account is null then raise sqlstate '28000' using message='not_authenticated'; end if;
  if private.lock_account_write(account) then raise sqlstate '28000' using message='account_deleted'; end if;
  return account;
end $$;


--

-- Name: retain_checkout_binding(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.retain_checkout_binding() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if new.status='open' and new.provider_checkout_id is not null then
    insert into public.billing_checkout_bindings(environment,provider_checkout_id,user_id,attempt_id,checkout_key,catalog_version)
      values(new.environment,new.provider_checkout_id,new.user_id,new.attempt_id,new.checkout_key,new.catalog_version)
      on conflict(environment,provider_checkout_id) do nothing;
    if not exists(select 1 from public.billing_checkout_bindings b
      where b.environment=new.environment and b.provider_checkout_id=new.provider_checkout_id
        and b.user_id=new.user_id and b.attempt_id=new.attempt_id
        and b.checkout_key=new.checkout_key and b.catalog_version=new.catalog_version) then
      raise exception 'checkout_binding_conflict';
    end if;
  end if;
  return new;
end $$;


--

-- Name: storage_abort_probe(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.storage_abort_probe() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare pending private.clerk_deleted_uploads;
begin
  if current_setting('storage.operation',true) is distinct from 'storage.s3.upload.abort_multipart'
    or current_setting('request.method',true) is distinct from 'DELETE' then return new; end if;
  -- Storage supplies the request path. Match the upload id independently of
  -- the requested bucket/key (the upstream abort does not check their pairing).
  select u.* into pending from private.clerk_deleted_uploads u
    join public.account_identities i using(issuer,subject)
    where i.deleted_at is not null and split_part(
      substring(current_setting('request.path',true) from '[?&]uploadId=([^&]*)'), '#', 1)
      in (u.upload_id,replace(replace(replace(replace(u.upload_id,
        '%','%25'),'+','%2B'),'/','%2F'),'=','%3D')) limit 1;
  if not found then return new; end if;
  if auth.jwt()->>'role' is distinct from 'service_role'
    or new.bucket_id<>pending.bucket_id or new.name<>pending.name
    or tg_op<>'INSERT' or new.version is distinct from '1' then
    raise sqlstate '28000' using message='storage_deletion_abort_probe_invalid';
  end if;
  -- RETURN NULL suppresses the row, including ON CONFLICT UPDATE. No INSERT
  -- or UPDATE is exempted from the tombstone barrier. Forged SQL GUCs can at
  -- most request this no-op; they cannot persist any data. canUpload ignores
  -- the empty RETURNING result and Storage still aborts bytes through its API.
  return null;
end $$;


--

-- Name: storage_owner_accounts(jsonb); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.storage_owner_accounts(p_row jsonb) RETURNS SETOF uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare owner_text text:=nullif(p_row->>'owner_id',''); owners uuid[]; v_issuer text;
begin
  if owner_text is not null then
    if owner_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return next owner_text::uuid;
    else
      -- Clerk service writes may lack JWT claims. In that case only one durable
      -- UUID across issuers is acceptable; a bare, ambiguous sub is never linked.
      if auth.jwt()->>'sub'=owner_text and auth.jwt()->>'role'='authenticated' then
        v_issuer:=auth.jwt()->>'iss';
      end if;
      select array_agg(distinct i.account_id) into owners from public.account_identities i
        where i.subject=owner_text ;
      if coalesce(cardinality(owners),0)<>1 then
        raise sqlstate '23503' using message='storage_owner_unresolved';
      end if;
      if v_issuer is not null and not exists(select 1 from public.account_identities i
        where i.subject=owner_text and i.issuer=v_issuer and i.account_id=owners[1]) then
        raise sqlstate '23503' using message='storage_owner_unresolved';
      end if;
      return next owners[1];
    end if;
  end if;

  -- Pilot paths are UUID/hash.jpg and may be written with a service owner NULL.
  if p_row->>'bucket_id'='pilot-photos' and coalesce(p_row->>'name',p_row->>'key')
    ~ '^[0-9a-f-]{36}/[0-9a-f]{64}\.jpg$' then
    return next split_part(coalesce(p_row->>'name',p_row->>'key'),'/',1)::uuid;
  end if;
  -- Deprecated owner may still be present in historical Storage rows.
  if nullif(p_row->>'owner','') is not null then return next (p_row->>'owner')::uuid; end if;
end $_$;


--

-- Name: apply_clerk_user_event(text, text, text, text, text, timestamp with time zone, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_clerk_user_event(p_event_id text, p_payload_hash text, p_issuer text, p_subject text, p_event_type text, p_event_at timestamp with time zone, p_verified_email text DEFAULT NULL::text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare identity public.account_identities; account uuid; old_hash text;
begin
  if p_event_type not in ('user.created', 'user.updated', 'user.deleted')
    or p_event_at is null or not exists (select 1 from private.clerk_issuers c
      where c.issuer = p_issuer and c.enabled)
    or p_subject is null or p_subject !~ '^user_[a-zA-Z0-9_]{1,128}$' then
    raise exception 'invalid_clerk_user_event';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_issuer || chr(31) || p_subject, 0));
  insert into private.clerk_user_events(event_id, payload_hash, event_type)
    values(p_event_id, p_payload_hash, p_event_type) on conflict do nothing;
  if not found then
    select payload_hash into old_hash from private.clerk_user_events where event_id = p_event_id;
    if old_hash <> p_payload_hash then raise exception 'clerk_event_conflict'; end if;
    return 'unchanged';
  end if;
  select * into identity from public.account_identities i
    where i.issuer = p_issuer and i.subject = p_subject;
  -- Deleted is permanent, including delete-before-create and late JWT/webhooks.
  if identity.deleted_at is not null then return 'ignored'; end if;
  account := identity.account_id;
  if account is null then account := private.resolve_account_identity(p_issuer, p_subject); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(account::text, 1608));
  -- Another subject of this UUID may have deleted it while this event waited.
  -- Re-read under the account lock; never use the pre-wait PII/version state.
  select * into identity from public.account_identities i
    where i.issuer = p_issuer and i.subject = p_subject for update;
  if exists (select 1 from public.account_identities i
    where i.account_id = account and i.deleted_at is not null) then return 'ignored'; end if;
  if p_event_type = 'user.deleted' then
    update public.profiles set email = null, display_name = null, avatar_url = null,
      primary_simulator = null, onboarding_completed = false where id = account;
    delete from public.devices where user_id = account;
    delete from public.rate_limits where user_id = account;
    delete from public.license_validations where user_id = account;
    update public.licenses set is_active = false, hwid = null, deactivated_at = now(),
      deactivation_reason = 'clerk_user_deleted' where user_id = account;
    update public.billing_customers set email = null, metadata = '{}'::jsonb where user_id = account;
    update public.billing_access_grants set status = 'revoked' where user_id = account;
    update public.user_entitlements set status = 'revoked' where user_id = account;
    update public.operational_access_assignments set status = 'revoked', revoked_at = now(),
      revoked_by = 'clerk:webhook', revoke_reason = 'clerk_user_deleted'
      where user_id = account and status = 'active';

    -- Abort persisted uploads through S3 API, before deleting final objects.
    insert into private.clerk_deleted_uploads(issuer,subject,bucket_id,name,upload_id)
      select p_issuer,p_subject,u.bucket_id,u.key,u.id from storage.s3_multipart_uploads u
      where account in (select private.storage_owner_accounts(to_jsonb(u))) or u.owner_id=account::text
        or account in (select private.storage_owner_accounts(to_jsonb(b)) from storage.buckets b where b.id=u.bucket_id)
        or (exists(select 1 from public.account_identities a where a.account_id=account and a.subject=u.owner_id)
          and not exists(select 1 from public.account_identities a where a.account_id<>account and a.subject=u.owner_id))
      on conflict do nothing;
    -- Storage bytes are removed through the Storage API, never SQL DELETE.
    insert into private.clerk_deleted_objects(issuer,subject,bucket_id,name)
      select p_issuer,p_subject,o.bucket_id,o.name from storage.objects o
      where account in (select private.storage_owner_accounts(to_jsonb(o))) or o.owner_id::text=account::text
        or account in (select private.storage_owner_accounts(to_jsonb(b)) from storage.buckets b where b.id=o.bucket_id)
        or o.owner=account
        or (exists(select 1 from public.account_identities a where a.account_id=account and a.subject=o.owner_id)
          and not exists(select 1 from public.account_identities a where a.account_id<>account and a.subject=o.owner_id))
      on conflict do nothing;
    delete from pilot_private.operations where account_id=account;
    delete from public.pilot_profiles where account_id=account;
    delete from public.testing_answers where account_id=account;
    -- Keep technical issues and their actor barrier after report erasure.
    update public.testing_center_technical_issues i
      set owner_account_id=account,contribution_id=null
      where i.contribution_id in (select id from public.testing_contributions
        where account_id=account);
    delete from public.testing_contributions where account_id=account;

    update public.testing_center_memberships set active=false where user_id=account;
    update public.account_identities set deleted_at = p_event_at, user_event_at = greatest(user_event_at,p_event_at)
      where account_id = account;
    -- Preserve private financial/support IDs and audit hashes. No automatic purge.
  elsif identity.user_event_at is null or p_event_at > identity.user_event_at then
    update public.profiles set email = p_verified_email where id = account;
    update public.account_identities set user_event_at = p_event_at
      where issuer = p_issuer and subject = p_subject;
  else
    return 'ignored';
  end if;
  return 'applied';
end $_$;


--

-- Name: FUNCTION billing_expire_subscription_grants(p_evaluated_at timestamp with time zone); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.billing_expire_subscription_grants(p_evaluated_at timestamp with time zone) IS 'Revokes subscription and recovery grants at the exact boundary now >= valid_until.';


--

-- Name: FUNCTION billing_observability_snapshot(p_environment text, p_now timestamp with time zone); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.billing_observability_snapshot(p_environment text, p_now timestamp with time zone) IS 'Aggregate-only BIL-10 operational snapshot. Contains no customer or provider resource identifiers.';


--

-- Name: claim_active_device(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_active_device(device_fingerprint text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
begin
  if device_fingerprint is null or device_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_identity';
  end if;
  return private.claim_account_device(private.resolve_current_account(), device_fingerprint);
end;
$_$;


--

-- Name: claim_billing_checkout_attempt(uuid, uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_billing_checkout_attempt(p_user_id uuid, p_attempt_id uuid, p_checkout_key text, p_environment text, p_catalog_version text) RETURNS TABLE(outcome text, checkout_url text, guard_version integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
 existing public.billing_checkout_attempts%rowtype;
 family text;
begin
 if p_user_id is null or p_attempt_id is null or p_environment not in ('sandbox','production')
    or p_checkout_key not in ('founders','launch_lifetime','pro_monthly','pro_annual','pro_plus_monthly','pro_plus_annual')
    or p_environment is null or p_checkout_key is null
    or nullif(trim(p_catalog_version),'') is null then
   raise sqlstate '23514' using message='invalid_checkout_claim';
 end if;
 family:=case when p_checkout_key='founders' then 'founders' when p_checkout_key='launch_lifetime' then 'launch' else 'subscription' end;
 -- #1622 authority and lock order: UUID BEFORE any attempt/profile row.
 -- This existing account lock also serializes app/web claims; no parallel lock.
 perform private.lock_accounts_before_rows(array[p_user_id]);
  perform private.close_terminal_checkout_attempts(p_user_id,p_environment);
 if not exists(select 1 from public.profiles where id=p_user_id) then
  raise sqlstate '23503' using message='account_unavailable';
 end if;
 if public.billing_purchase_policy(p_user_id,p_environment,p_checkout_key)->>'reason' is not null then
  raise exception '%',public.billing_purchase_policy(p_user_id,p_environment,p_checkout_key)->>'reason';
 end if;
 if exists(select 1 from public.billing_checkout_attempts a where a.user_id=p_user_id
  and a.environment=p_environment and a.attempt_id<>p_attempt_id and a.resolution is null
  and (p_checkout_key='founders' or a.checkout_key='founders')) then
  raise exception 'founders_checkout_pending';
 end if;
 if exists(select 1 from public.billing_effective_access_grants g
   where g.user_id=p_user_id and g.environment=p_environment and g.status='active'
     and (g.valid_until is null or g.valid_until>now())
     and g.capability=case when family='founders' then 'vantare.plan.founders' when family='launch' then 'vantare.edition.launch_v1' else 'vantare.plan.pro' end) then
   return query select 'conflict'::text,null::text,2; return;
 end if;
 select * into existing from public.billing_checkout_attempts a
   where a.user_id=p_user_id and a.attempt_id=p_attempt_id;
 if found then
   if existing.checkout_key<>p_checkout_key or existing.environment<>p_environment
      or existing.catalog_version<>p_catalog_version then
     return query select 'conflict'::text,null::text,2;
   elsif existing.resolution is not null or existing.expires_at<=now() then
     return query select 'expired'::text,null::text,2;
   elsif existing.status='open' then
     if existing.provider_checkout_id is null or not exists(
       select 1 from public.billing_checkout_bindings b
       where b.environment=existing.environment and b.provider_checkout_id=existing.provider_checkout_id
         and b.user_id=existing.user_id and b.attempt_id=existing.attempt_id
         and b.checkout_key=existing.checkout_key and b.catalog_version=existing.catalog_version) then
       return query select 'uncertain'::text,null::text,2;
     else
       return query select 'reused'::text,existing.checkout_url,2;
     end if;
   elsif existing.status='uncertain' then
     return query select 'uncertain'::text,null::text,2;
   else
     return query select 'busy'::text,null::text,2;
   end if;
   return;
 end if;
 if exists(select 1 from public.billing_checkout_attempts a
   where a.user_id=p_user_id and a.environment=p_environment and a.resolution is null
     and (case when a.checkout_key='launch_lifetime' then 'launch' else 'subscription' end)=family) then
   -- An expired/uncertain row is not proof of an unpaid/expired Polar session.
   -- Support reconciles it; never erase evidence on an unrelated user's claim.
   return query select 'busy'::text,null::text,2; return;
 end if;
 insert into public.billing_checkout_attempts(user_id,attempt_id,checkout_key,environment,catalog_version,status)
   values(p_user_id,p_attempt_id,p_checkout_key,p_environment,p_catalog_version,'creating');
 return query select 'claimed'::text,null::text,2;
end $$;


--

-- Name: FUNCTION claim_billing_checkout_attempt(p_user_id uuid, p_attempt_id uuid, p_checkout_key text, p_environment text, p_catalog_version text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.claim_billing_checkout_attempt(p_user_id uuid, p_attempt_id uuid, p_checkout_key text, p_environment text, p_catalog_version text) IS 'Guard v1: #1622 UUID barrier, atomic app/web account/environment/family deduplication and active-access check. No unsafe TTL deletion; stale attempts require reconciliation.';


--

-- Name: claim_billing_creator_checkout_attempt(uuid, uuid, text, text, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_billing_creator_checkout_attempt(p_user_id uuid, p_attempt_id uuid, p_checkout_key text, p_environment text, p_catalog_version text, p_creator_code text, p_creator_discount uuid) RETURNS TABLE(outcome text, checkout_url text, guard_version integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_claim record;
begin
 select * into v_claim from public.claim_billing_checkout_attempt(
  p_user_id,p_attempt_id,p_checkout_key,p_environment,p_catalog_version);
 if v_claim.outcome='claimed' and not public.billing_save_creator_attribution(
  p_user_id,p_environment,p_attempt_id,p_creator_code,p_creator_discount)
 then raise exception 'creator_attribution_conflict'; end if;
 return query select v_claim.outcome::text,v_claim.checkout_url::text,v_claim.guard_version::integer;
end $$;


--

-- Name: claim_billing_reconciliation(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_billing_reconciliation(p_environment text, p_lease_token uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare c private.billing_reconciliation_cursor;
begin
  if p_environment not in ('sandbox','production') or p_environment is null or p_lease_token is null then
    raise exception 'invalid_reconciliation_claim'; end if;
  insert into private.billing_reconciliation_cursor(environment) values(p_environment) on conflict do nothing;
  select * into c from private.billing_reconciliation_cursor where environment=p_environment for update;
  if c.lease_until>clock_timestamp() then return null; end if;
  update private.billing_reconciliation_cursor set lease_token=p_lease_token,lease_until=clock_timestamp()+interval '2 minutes'
    where environment=p_environment;
  return jsonb_build_object('resource',c.resource,'page',c.page);
end $$;


--

-- Name: complete_billing_checkout_attempt(uuid, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.complete_billing_checkout_attempt(p_user_id uuid, p_attempt_id uuid, p_provider_checkout_id text, p_checkout_url text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare affected integer;
begin
 perform private.lock_accounts_before_rows(array[p_user_id]);
 if nullif(trim(p_provider_checkout_id),'') is null or length(p_provider_checkout_id)>200
    or nullif(trim(p_checkout_url),'') is null then return false; end if;
 update public.billing_checkout_attempts
 set status='open',provider_checkout_id=p_provider_checkout_id,checkout_url=p_checkout_url,updated_at=now()
 where user_id=p_user_id and attempt_id=p_attempt_id and status='creating' and expires_at>now() and provider_request_started_at is not null and resolution is null;
 get diagnostics affected=row_count;
 return affected=1;
end $$;


--

-- Name: complete_billing_reconciliation(text, uuid, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.complete_billing_reconciliation(p_environment text, p_lease_token uuid, p_next_resource text, p_next_page integer) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if p_next_resource not in ('orders','subscriptions','refunds','disputes','checkouts') or p_next_resource is null
    or p_next_page is null or p_next_page<1 then raise exception 'invalid_reconciliation_cursor'; end if;
  update private.billing_reconciliation_cursor set resource=p_next_resource,page=p_next_page,
    last_progress_at=clock_timestamp(),lease_until=clock_timestamp()+interval '2 minutes'
    where environment=p_environment and lease_token=p_lease_token and lease_until>clock_timestamp();
  return found;
end $$;


--

-- Name: digest(bytea, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.digest(data bytea, algorithm text) RETURNS bytea
    LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
    SET search_path TO 'pg_catalog', 'extensions'
    AS $$ select extensions.digest(data, algorithm) $$;


--

-- Name: digest(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.digest(data text, algorithm text) RETURNS bytea
    LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
    SET search_path TO 'pg_catalog', 'extensions'
    AS $$ select extensions.digest(data, algorithm) $$;


--

-- Name: founders_sale_window(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.founders_sale_window(p_environment text DEFAULT 'production'::text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
 select jsonb_build_object('opens_at',opens_at,'sales_enabled',sales_enabled,
   'available',sales_enabled and now()>=opens_at,'amount_cents',5000,'currency','eur')
 from private.founders_sale_config where environment=p_environment
$$;


--

-- Name: gen_random_uuid(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gen_random_uuid() RETURNS uuid
    LANGUAGE sql PARALLEL SAFE
    SET search_path TO 'pg_catalog'
    AS $$ select pg_catalog.gen_random_uuid() $$;


--

-- Name: FUNCTION gen_random_uuid(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.gen_random_uuid() IS 'Vantare hosted compatibility wrapper for explicit public.gen_random_uuid calls.';


--

-- Name: get_account_entitlements(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_account_entitlements(device_fingerprint text) RETURNS TABLE(user_id uuid, email text, entitlements text[], active_device text, expires_at timestamp with time zone, device_ok boolean, provider_customer_id text, billing_provider text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  return query
  select result_row.user_id, result_row.email, result_row.entitlements,
    result_row.active_device, result_row.expires_at,
    result_row.active_device = nullif(trim(device_fingerprint), ''),
    result_row.provider_customer_id, result_row.billing_provider
  from public.read_account_entitlements() result_row;
end;
$$;


--

-- Name: FUNCTION get_account_entitlements(device_fingerprint text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_account_entitlements(device_fingerprint text) IS 'Deprecated read-only compatibility wrapper. Use claim_active_device then read_account_entitlements.';


--

-- Name: handle_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--

-- Name: install_report_creator_bridge(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.install_report_creator_bridge() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare original text;
begin
 perform private.install_report_creator_owner();
 if to_regprocedure('public.billing_creator_renewal_prepare(text,uuid,text,text,text,uuid,text,uuid,integer)') is null then return false; end if;
 if to_regprocedure('private.billing_creator_renewal_prepare_before_1593(text,uuid,text,text,text,uuid,text,uuid,integer)') is not null then return true; end if;
 alter function public.billing_creator_renewal_prepare(text,uuid,text,text,text,uuid,text,uuid,integer) set schema private;
 alter function private.billing_creator_renewal_prepare(text,uuid,text,text,text,uuid,text,uuid,integer) rename to billing_creator_renewal_prepare_before_1593;
 revoke all on function private.billing_creator_renewal_prepare_before_1593(text,uuid,text,text,text,uuid,text,uuid,integer) from public,anon,authenticated,service_role;
 -- The bridge already owns B03 (seed 1608). Keep the original selector's logic,
 -- but replace its legacy seed-0 lock to avoid reversing checkout's lock order.
 original:=pg_get_functiondef('private.billing_creator_renewal_prepare_before_1593(text,uuid,text,text,text,uuid,text,uuid,integer)'::regprocedure);
 if position('perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,0));' in original)=0 then raise exception 'creator_renewal_lock_contract_changed'; end if;
 execute replace(original,'perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,0));','if private.lock_account_write(p_user) then return null; end if;');

 alter function public.billing_set_report_renewal_candidate(text,uuid,text,uuid,integer,timestamptz) set schema private;
 alter function private.billing_set_report_renewal_candidate(text,uuid,text,uuid,integer,timestamptz) rename to billing_set_report_candidate_before_1593;
 revoke all on function private.billing_set_report_candidate_before_1593(text,uuid,text,uuid,integer,timestamptz) from public,anon,authenticated,service_role;
 execute $setter$
 create function public.billing_set_report_renewal_candidate(p_environment text,p_user uuid,p_subscription text,p_discount uuid,p_savings integer,p_valid_until timestamptz)
 returns void language plpgsql security definer set search_path='' as $body$
 begin
  if private.lock_account_write(p_user) then raise exception 'account_deleted'; end if;
  perform private.billing_set_report_candidate_before_1593(p_environment,p_user,p_subscription,p_discount,p_savings,p_valid_until);
 end $body$ $setter$;
 alter function public.billing_set_report_renewal_candidate(text,uuid,text,uuid,integer,timestamptz) owner to postgres;
 revoke all on function public.billing_set_report_renewal_candidate(text,uuid,text,uuid,integer,timestamptz) from public,anon,authenticated;
 grant execute on function public.billing_set_report_renewal_candidate(text,uuid,text,uuid,integer,timestamptz) to service_role;
 execute $ddl$
 create function public.billing_creator_renewal_prepare(p_environment text,p_user uuid,p_checkout text,p_subscription text,p_order text,p_product uuid,p_key text,p_initial_discount uuid,p_creator_savings integer)
 returns jsonb language plpgsql security definer set search_path='' as $body$
 declare staged jsonb;
 begin
  -- Publishing, preparing and report-only claims use the same B03 lock.
  -- The installed selector no longer acquires the legacy seed-0 lock.
  -- No unlocked candidate
  -- publisher may clear a token while its PATCH is in flight.
  if private.lock_account_write(p_user) then return null; end if;
  -- A late/reconciled attribution cannot race an already leased report-only PATCH.
  if exists(select 1 from private.report_promotion_changes r where r.environment=p_environment and r.subscription_id=p_subscription and r.account_id=p_user and r.renewal_token is null and r.lease_until>clock_timestamp() and r.applied_at is null and r.superseded_at is null) then
   return jsonb_build_object('busy',true);
  end if;
  -- A report-campaign account has exactly one external writer: #1593 refreshes
  -- its actual settled budget before using the shared #1661 selector. Webhook
  -- retries must not reattach a stale/exhausted report candidate on their own.
  -- Stage immutable attribution/initial payment if needed, then hand off without
  -- an external operation or a failure/quarantine of the webhook.
  if exists(select 1 from private.report_promotions r where r.account_id=p_user and r.environment=p_environment) then
   if not exists(select 1 from private.creator_renewal_operations c where c.environment=p_environment and c.subscription_id=p_subscription) then
    staged:=private.billing_creator_renewal_prepare_before_1593(p_environment,p_user,p_checkout,p_subscription,p_order,p_product,p_key,p_initial_discount,p_creator_savings);
    if staged is not null and staged->>'busy' is distinct from 'true' then
     update private.creator_renewal_operations set lease_token=null,lease_until=null,state='pending'
      where environment=p_environment and subscription_id=p_subscription and lease_token=(staged->>'token')::uuid;
    end if;
   end if;
   return null;
  end if;
  return private.report_creator_bound(p_environment,p_subscription,
   private.billing_creator_renewal_prepare_before_1593(p_environment,p_user,p_checkout,p_subscription,p_order,p_product,p_key,p_initial_discount,case when private.report_creator_end(p_environment,p_subscription,clock_timestamp())<=clock_timestamp() then 0 else p_creator_savings end),clock_timestamp());
 end $body$
 $ddl$;
 alter function public.billing_creator_renewal_prepare(text,uuid,text,text,text,uuid,text,uuid,integer) owner to postgres;
 revoke all on function public.billing_creator_renewal_prepare(text,uuid,text,text,text,uuid,text,uuid,integer) from public,anon,authenticated;
 grant execute on function public.billing_creator_renewal_prepare(text,uuid,text,text,text,uuid,text,uuid,integer) to service_role;
 -- Preserve #1661 revocation and extend it only with verified creator remainders.
 if to_regprocedure('public.billing_creator_revocation(text,text,uuid,text,text,text,uuid,boolean)') is not null then
  alter function public.billing_creator_revocation(text,text,uuid,text,text,text,uuid,boolean) set schema private;
  alter function private.billing_creator_revocation(text,text,uuid,text,text,text,uuid,boolean) rename to billing_creator_revocation_before_1593;
  revoke all on function private.billing_creator_revocation_before_1593(text,text,uuid,text,text,text,uuid,boolean) from public,anon,authenticated,service_role;
  original:=pg_get_functiondef('private.billing_creator_revocation_before_1593(text,text,uuid,text,text,text,uuid,boolean)'::regprocedure);
  if position('perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,0));' in original)=0 then raise exception 'creator_revocation_lock_contract_changed'; end if;
  execute replace(original,'perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,0));','if private.lock_account_write(p_user) then return null; end if;');
  execute $revoke$
  create function public.billing_creator_revocation(p_stage text,p_environment text,p_user uuid,p_subscription text,p_order text default null,p_reason text default null,p_token uuid default null,p_success boolean default null)
  returns jsonb language plpgsql security definer set search_path='' as $body$
  declare result jsonb; managed jsonb;
  begin
   if private.lock_account_write(p_user) then return null; end if;
   result:=private.billing_creator_revocation_before_1593(p_stage,p_environment,p_user,p_subscription,p_order,p_reason,p_token,p_success);
   if result->>'token' is not null then
    select coalesce(jsonb_agg(r.discount_id::text),'[]') into managed from private.report_creator_remainders r
     where r.environment=p_environment and r.product_id=(result->>'product_id')::uuid and r.creator_discount_id=(result->>'creator_discount_id')::uuid;
    result:=result||jsonb_build_object('managed_creator_ids',managed);
   end if;
   return result;
  end $body$ $revoke$;
  alter function public.billing_creator_revocation(text,text,uuid,text,text,text,uuid,boolean) owner to postgres;
  revoke all on function public.billing_creator_revocation(text,text,uuid,text,text,text,uuid,boolean) from public,anon,authenticated;
  grant execute on function public.billing_creator_revocation(text,text,uuid,text,text,text,uuid,boolean) to service_role;
 end if;
 return true;
end $_$;


--

-- Name: mail_admin_execute(uuid, text, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mail_admin_execute(p_actor uuid, p_action text, p_params jsonb, p_environment text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare response jsonb; failures jsonb;
begin
 -- Inner function authenticates Owner and takes the existing account/queue locks first.
 response:=private.mail_admin_execute_v2(p_actor,p_action,p_params,p_environment);
 if p_action='mail_list' then
  perform public.mail_erasure_expire();
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
end $$;


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

-- Name: mark_billing_checkout_attempt_uncertain(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_billing_checkout_attempt_uncertain(p_user_id uuid, p_attempt_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare affected integer;
begin
  perform private.lock_accounts_before_rows(array[p_user_id]);
  update public.billing_checkout_attempts
  set status = 'uncertain', updated_at = now()
  where user_id = p_user_id
    and attempt_id = p_attempt_id
    and status = 'creating'
    and expires_at > now();
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;


--

-- Name: FUNCTION native_admin_record_mail_erasure(p_job uuid, p_lease uuid, p_request uuid, p_effect uuid, p_outcome text, p_provider_status integer, p_actor uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.native_admin_record_mail_erasure(p_job uuid, p_lease uuid, p_request uuid, p_effect uuid, p_outcome text, p_provider_status integer, p_actor uuid) IS 'Existing admin journal; service queue lease proof. Null actor denotes maintenance (reserved nil UUID); owner actor rechecked for started.';


--

-- Name: native_claim_license_device(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.native_claim_license_device(issuer text, subject text, device_fingerprint text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
begin
  if issuer is null or issuer !~ '^https://' or issuer ~ '/auth/v1/?$'
    or subject is null or subject !~ '^user_[A-Za-z0-9_]{27}$'
    or device_fingerprint is null or device_fingerprint !~ '^[0-9a-f]{64}$'
  then
    raise exception 'invalid_identity';
  end if;
  return private.claim_account_device(
    private.resolve_account_identity(issuer, subject), device_fingerprint
  );
end;
$_$;


--

-- Name: FUNCTION native_claim_license_device(issuer text, subject text, device_fingerprint text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.native_claim_license_device(issuer text, subject text, device_fingerprint text) IS 'Server-only: issuer and user subject must already be validated with Clerk OAuth verification. No email linking.';


--

-- Name: native_resolve_account(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.native_resolve_account(issuer text, subject text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
begin
  if issuer is null or issuer !~ '^https://' or issuer ~ '/auth/v1/?$'
    or subject is null or subject !~ '^user_[A-Za-z0-9_]{27}$' then
    raise exception 'invalid_identity';
  end if;
  return private.resolve_account_identity(issuer, subject);
end;
$_$;


--

-- Name: operational_access_preview(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.operational_access_preview(p_user_id uuid) RETURNS TABLE(role text, status text, expires_at timestamp with time zone, policy_version integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select a.role, a.status, a.expires_at, a.policy_version
  from public.operational_access_assignments a
  where a.user_id = p_user_id
  order by a.status, a.role
$$;


--

-- Name: operational_access_reject_audit_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.operational_access_reject_audit_mutation() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  raise exception 'operational_access_audit_is_append_only';
end;
$$;


--

-- Name: operational_access_set(uuid, text, text, text, text, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.operational_access_set(p_user_id uuid, p_role text, p_action text, p_actor_ref text, p_reason text, p_correlation_id text, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE(outcome text, role text, status text, expires_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare
  v_existing public.operational_access_assignments%rowtype;
  v_replaced record;
  v_now timestamptz := now();
begin
  perform private.lock_accounts_before_rows(array[p_user_id]);
  if p_user_id is null
     or p_role not in ('tester', 'nightly_tester', 'owner')
     or p_action not in ('grant', 'revoke')
     or p_actor_ref !~ '^[a-z0-9][a-z0-9._:-]{2,79}$'
     or length(trim(coalesce(p_reason, ''))) not between 3 and 500
     or p_correlation_id !~ '^[a-z0-9][a-z0-9._:-]{2,127}$'
     or (p_action = 'revoke' and p_expires_at is not null)
     or (p_action = 'grant' and p_expires_at is not null and p_expires_at <= v_now) then
    raise exception 'invalid_operational_access_request';
  end if;

  perform 1 from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'operational_access_user_not_found';
  end if;

  select * into v_existing
  from public.operational_access_assignments a
  where a.user_id = p_user_id and a.role = p_role
  for update;

  if p_action = 'revoke' then
    if not found or v_existing.status = 'revoked' then
      return query select 'unchanged'::text, p_role, 'revoked'::text, null::timestamptz;
      return;
    end if;
    update public.operational_access_assignments a
    set status = 'revoked',
        revoked_at = v_now,
        revoked_by = p_actor_ref,
        revoke_reason = trim(p_reason),
        correlation_id = p_correlation_id,
        updated_at = v_now
    where a.id = v_existing.id;
    insert into public.operational_access_audit (
      target_user_id, role, action, actor_ref, reason, correlation_id,
      expires_at, policy_version, occurred_at
    ) values (
      p_user_id, p_role, 'revoke', p_actor_ref, trim(p_reason),
      p_correlation_id, v_existing.expires_at, 1, v_now
    );
    return query select 'applied'::text, p_role, 'revoked'::text, null::timestamptz;
    return;
  end if;

  if found
     and v_existing.status = 'active'
     and v_existing.expires_at is not distinct from p_expires_at then
    return query select 'unchanged'::text, p_role, 'active'::text, p_expires_at;
    return;
  end if;

  for v_replaced in
    update public.operational_access_assignments a
    set status = 'revoked',
        revoked_at = v_now,
        revoked_by = p_actor_ref,
        revoke_reason = 'Replaced by role ' || p_role,
        correlation_id = p_correlation_id,
        updated_at = v_now
    where a.user_id = p_user_id and a.status = 'active' and a.role <> p_role
    returning a.role, a.expires_at
  loop
    insert into public.operational_access_audit (
      target_user_id, role, action, actor_ref, reason, correlation_id,
      expires_at, policy_version, occurred_at
    ) values (
      p_user_id, v_replaced.role, 'revoke', p_actor_ref,
      'Replaced by role ' || p_role, p_correlation_id,
      v_replaced.expires_at, 1, v_now
    );
  end loop;

  insert into public.operational_access_assignments (
    user_id, role, status, expires_at, policy_version, granted_at, granted_by,
    grant_reason, revoked_at, revoked_by, revoke_reason, correlation_id,
    created_at, updated_at
  ) values (
    p_user_id, p_role, 'active', p_expires_at, 1, v_now, p_actor_ref,
    trim(p_reason), null, null, null, p_correlation_id, v_now, v_now
  )
  on conflict on constraint operational_access_user_role_key do update set
    status = 'active',
    expires_at = excluded.expires_at,
    policy_version = 1,
    granted_at = excluded.granted_at,
    granted_by = excluded.granted_by,
    grant_reason = excluded.grant_reason,
    revoked_at = null,
    revoked_by = null,
    revoke_reason = null,
    correlation_id = excluded.correlation_id,
    updated_at = excluded.updated_at;

  insert into public.operational_access_audit (
    target_user_id, role, action, actor_ref, reason, correlation_id,
    expires_at, policy_version, occurred_at
  ) values (
    p_user_id, p_role, 'grant', p_actor_ref, trim(p_reason),
    p_correlation_id, p_expires_at, 1, v_now
  );
  return query select 'applied'::text, p_role, 'active'::text, p_expires_at;
end;
$_$;


--

-- Name: FUNCTION operational_access_set(p_user_id uuid, p_role text, p_action text, p_actor_ref text, p_reason text, p_correlation_id text, p_expires_at timestamp with time zone); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.operational_access_set(p_user_id uuid, p_role text, p_action text, p_actor_ref text, p_reason text, p_correlation_id text, p_expires_at timestamp with time zone) IS 'Service-only idempotent grant/revoke boundary for operational roles.';


--

-- Name: operational_legacy_grant_preview(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.operational_legacy_grant_preview(p_user_id uuid) RETURNS TABLE(active_count integer, capabilities text[])
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select
    count(*)::integer,
    coalesce(array_agg(distinct g.capability order by g.capability), '{}'::text[])
  from public.billing_access_grants g
  where g.user_id = p_user_id
    and g.provider = 'legacy'
    and g.environment = 'legacy'
    and g.status = 'active'
$$;


--

-- Name: operational_legacy_grant_retire(uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.operational_legacy_grant_retire(p_user_id uuid, p_actor_ref text, p_reason text, p_correlation_id text) RETURNS TABLE(outcome text, retired_count integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare
  v_retired integer := 0;
begin
  perform private.lock_accounts_before_rows(array[p_user_id]);
  if p_user_id is null
     or p_actor_ref !~ '^[a-z0-9][a-z0-9._:-]{2,79}$'
     or length(trim(coalesce(p_reason, ''))) not between 3 and 500
     or p_correlation_id !~ '^[a-z0-9][a-z0-9._:-]{2,127}$' then
    raise exception 'invalid_operational_legacy_retirement_request';
  end if;

  perform 1 from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'operational_access_user_not_found';
  end if;

  update public.billing_access_grants g
  set status = 'revoked',
      metadata = coalesce(g.metadata, '{}'::jsonb) || jsonb_build_object(
        'authority_retired', true,
        'retirement_correlation_id', p_correlation_id
      ),
      updated_at = now()
  where g.user_id = p_user_id
    and g.provider = 'legacy'
    and g.environment = 'legacy'
    and g.status = 'active';
  get diagnostics v_retired = row_count;

  if v_retired = 0 then
    return query select 'unchanged'::text, 0;
    return;
  end if;

  insert into public.operational_legacy_grant_retirements (
    target_user_id, retired_count, actor_ref, reason, correlation_id
  ) values (
    p_user_id, v_retired, p_actor_ref, trim(p_reason), p_correlation_id
  );
  perform public.billing_refresh_entitlement_read_model(p_user_id);
  return query select 'applied'::text, v_retired;
end;
$_$;


--

-- Name: FUNCTION operational_legacy_grant_retire(p_user_id uuid, p_actor_ref text, p_reason text, p_correlation_id text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.operational_legacy_grant_retire(p_user_id uuid, p_actor_ref text, p_reason text, p_correlation_id text) IS 'Service-only, per-user retirement of classified active legacy grants.';


--

-- Name: race_schedule_current(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.race_schedule_current() RETURNS TABLE(id uuid, schedule jsonb, valid_from timestamp with time zone, series_count integer, published_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select p.id, p.schedule, p.valid_from, p.series_count, p.published_at
  from public.race_schedule_publications p
  where p.status = 'published'
  limit 1
$$;


--

-- Name: race_schedule_draft_save(text, jsonb, timestamp with time zone, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.race_schedule_draft_save(p_source_text text, p_schedule jsonb, p_valid_from timestamp with time zone, p_series_count integer) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_actor uuid := private.current_account();
  v_id uuid;
begin
  if v_actor is null then
    raise exception 'authentication required';
  end if;
  if not private.is_owner(v_actor) then
    raise exception 'owner role required to import a race schedule';
  end if;
  if p_series_count is null or p_series_count <= 0 then
    raise exception 'a schedule must contain at least one series';
  end if;

  delete from public.race_schedule_publications
  where created_by = v_actor and status = 'draft';

  insert into public.race_schedule_publications (
    status, schedule, source_text, valid_from, series_count, created_by
  )
  values ('draft', p_schedule, p_source_text, p_valid_from, p_series_count, v_actor)
  returning id into v_id;

  return v_id;
end;
$$;


--

-- Name: race_schedule_my_draft(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.race_schedule_my_draft() RETURNS TABLE(id uuid, schedule jsonb, source_text text, valid_from timestamp with time zone, series_count integer, created_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select p.id, p.schedule, p.source_text, p.valid_from, p.series_count, p.created_at
  from public.race_schedule_publications p
  where p.status = 'draft'
    and p.created_by = private.current_account()
    and private.is_owner(private.current_account())
  limit 1
$$;


--

-- Name: race_schedule_publish(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.race_schedule_publish(p_draft_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_actor uuid := private.current_account();
begin
  if v_actor is null then
    raise exception 'authentication required';
  end if;
  if not private.is_owner(v_actor) then
    raise exception 'owner role required to publish a race schedule';
  end if;

  if not exists (
    select 1 from public.race_schedule_publications
    where id = p_draft_id and status = 'draft' and created_by = v_actor
  ) then
    raise exception 'no draft schedule with that id belongs to the caller';
  end if;

  update public.race_schedule_publications
  set status = 'superseded', superseded_at = now()
  where status = 'published';

  update public.race_schedule_publications
  set status = 'published', published_at = now(), published_by = v_actor
  where id = p_draft_id;

  return p_draft_id;
end;
$$;


--

-- Name: read_account_entitlements(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.read_account_entitlements() RETURNS TABLE(user_id uuid, email text, entitlements text[], active_device text, expires_at timestamp with time zone, device_bound boolean, provider_customer_id text, billing_provider text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select p.id, p.email,
    coalesce(array_agg(e.product_key order by e.product_key)
      filter(where e.product_key is not null), '{}'::text[]),
    d.fingerprint_hash, min(e.expires_at), d.fingerprint_hash is not null,
    bc.provider_customer_id, bc.provider
  from public.profiles p left join public.devices d on d.user_id = p.id
  left join public.user_entitlements e on e.user_id = p.id
    and e.status in ('active', 'grace', 'past_due') and (e.expires_at is null or e.expires_at > now())
  left join lateral (select c.provider_customer_id, c.provider from public.billing_customers c
    where c.user_id = p.id order by c.updated_at desc limit 1) bc on true
  where p.id = private.current_account()
  group by p.id, p.email, d.fingerprint_hash, bc.provider_customer_id, bc.provider
$$;


--

-- Name: release_billing_reconciliation(text, uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.release_billing_reconciliation(p_environment text, p_lease_token uuid, p_failed boolean DEFAULT false) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  update private.billing_reconciliation_cursor set lease_token=null,lease_until=null,
    last_failure_at=case when p_failed then clock_timestamp() else last_failure_at end
    where environment=p_environment and lease_token=p_lease_token;
  return found;
end $$;


--

-- Name: reset_active_device(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reset_active_device(device_fingerprint text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_user_id uuid;
  v_fp text := device_fingerprint;
  v_last_reset timestamptz;
begin
  if v_fp is null or v_fp !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_identity';
  end if;
  v_user_id := private.resolve_current_account();

  select device_row.last_reset_at into v_last_reset
  from public.devices device_row
  where device_row.user_id = v_user_id
  for update;

  if v_last_reset is not null and v_last_reset > now() - interval '24 hours' then
    raise exception 'rate_limit: solo 1 reset cada 24h';
  end if;

  insert into public.devices (
    user_id, fingerprint_hash, first_seen_at, last_seen_at, last_reset_at
  )
  values (v_user_id, v_fp, now(), now(), now())
  on conflict (user_id) do update
  set fingerprint_hash = excluded.fingerprint_hash,
      last_seen_at = excluded.last_seen_at,
      last_reset_at = excluded.last_reset_at;
end;
$_$;


--

-- Name: FUNCTION testing_center_assert_linear_dispatch(p_effect_id text, p_worker_id text, p_fencing_token bigint, p_source_digest text, p_projection jsonb, p_canonical_projection text, p_projection_digest text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.testing_center_assert_linear_dispatch(p_effect_id text, p_worker_id text, p_fencing_token bigint, p_source_digest text, p_projection jsonb, p_canonical_projection text, p_projection_digest text) IS 'TAU-07I final pause, lease and projection gate immediately before Linear.';


--

-- Name: FUNCTION testing_center_complete_linear_pilot(p_effect_id text, p_worker_id text, p_fencing_token bigint, p_projection_digest text, p_external_issue_id uuid, p_organization_id uuid, p_external_identifier text, p_external_url text, p_bound_by_id text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.testing_center_complete_linear_pilot(p_effect_id text, p_worker_id text, p_fencing_token bigint, p_projection_digest text, p_external_issue_id uuid, p_organization_id uuid, p_external_identifier text, p_external_url text, p_bound_by_id text) IS 'TAU-07I atomic durable binding after one externally confirmed Linear create.';


--

-- Name: FUNCTION testing_center_reconcile_linear_webhook(p_delivery_id uuid, p_webhook_id uuid, p_organization_id uuid, p_external_issue_id uuid, p_event_name text, p_event_action text, p_webhook_timestamp_ms bigint, p_event_created_at timestamp with time zone, p_linear_state_id uuid, p_payload_digest text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.testing_center_reconcile_linear_webhook(p_delivery_id uuid, p_webhook_id uuid, p_organization_id uuid, p_external_issue_id uuid, p_event_name text, p_event_action text, p_webhook_timestamp_ms bigint, p_event_created_at timestamp with time zone, p_linear_state_id uuid, p_payload_digest text) IS 'TAU-07F fail-closed replay/order reconciliation with no execution authority.';


--

-- Name: FUNCTION testing_center_validate_candidate(p_contract_version text, p_candidate_id text, p_exact_sha text, p_decision text, p_rejection_reason text, p_idempotency_key text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.testing_center_validate_candidate(p_contract_version text, p_candidate_id text, p_exact_sha text, p_decision text, p_rejection_reason text, p_idempotency_key text) IS 'TAU-02C authenticated, fail-closed and idempotent candidate validation.';


--

-- Name: users; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.users (
    id uuid NOT NULL,
    email text,
    raw_user_meta_data jsonb DEFAULT '{}'::jsonb NOT NULL
);


--

-- Name: operations; Type: TABLE; Schema: pilot_private; Owner: -
--

CREATE TABLE pilot_private.operations (
    account_id uuid NOT NULL,
    op_id uuid NOT NULL,
    result jsonb NOT NULL
);


--

-- Name: TABLE billing_checkout_compensations; Type: COMMENT; Schema: private; Owner: -
--

COMMENT ON TABLE private.billing_checkout_compensations IS 'Financial compensation ledger, service RPC only. No email/customer/account UUID. Survives account deletion without recreating identity; financial retention follows billing ledger policy.';


--

-- Name: creator_checkout_attributions; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.creator_checkout_attributions (
    environment text NOT NULL,
    account_id uuid NOT NULL,
    attempt_id uuid NOT NULL,
    creator_id uuid NOT NULL,
    code text NOT NULL,
    discount_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT creator_checkout_attributions_environment_check CHECK ((environment = ANY (ARRAY['sandbox'::text, 'production'::text])))
);


--

-- Name: creator_renewal_operations; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.creator_renewal_operations (
    environment text NOT NULL,
    subscription_id text NOT NULL,
    account_id uuid NOT NULL,
    creator_id uuid NOT NULL,
    first_order_id text NOT NULL,
    product_id uuid NOT NULL,
    checkout_key text NOT NULL,
    creator_discount_id uuid NOT NULL,
    initial_discount_id uuid,
    selected_discount_id uuid,
    not_applied text,
    state text DEFAULT 'pending'::text NOT NULL,
    lease_token uuid,
    lease_until timestamp with time zone,
    completed_at timestamp with time zone,
    revocation_requested_at timestamp with time zone,
    revocation_completed_at timestamp with time zone,
    revocation_reason text,
    CONSTRAINT creator_renewal_operations_environment_check CHECK ((environment = ANY (ARRAY['sandbox'::text, 'production'::text]))),
    CONSTRAINT creator_renewal_operations_state_check CHECK ((state = ANY (ARRAY['pending'::text, 'completed'::text]))),
    CONSTRAINT creator_renewal_operations_subscription_id_check CHECK (((length(subscription_id) >= 1) AND (length(subscription_id) <= 200)))
);


--

-- Name: creator_subscription_revocations; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.creator_subscription_revocations (
    environment text NOT NULL,
    subscription_id text NOT NULL,
    account_id uuid NOT NULL,
    reason text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT creator_subscription_revocations_environment_check CHECK ((environment = ANY (ARRAY['sandbox'::text, 'production'::text]))),
    CONSTRAINT creator_subscription_revocations_reason_check CHECK ((reason = ANY (ARRAY['refund'::text, 'subscription_revoked'::text])))
);


--

-- Name: founders_sale_config; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.founders_sale_config (
    singleton boolean DEFAULT true NOT NULL,
    environment text NOT NULL,
    opens_at timestamp with time zone NOT NULL,
    sales_enabled boolean DEFAULT true NOT NULL,
    subscription_transition text DEFAULT 'end_period'::text NOT NULL,
    CONSTRAINT founders_sale_config_environment_check CHECK ((environment = ANY (ARRAY['sandbox'::text, 'production'::text]))),
    CONSTRAINT founders_sale_config_singleton_check CHECK (singleton),
    CONSTRAINT founders_sale_config_subscription_transition_check CHECK ((subscription_transition = 'end_period'::text))
);


--

-- Name: founders_subscription_transitions; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.founders_subscription_transitions (
    environment text NOT NULL,
    subscription_id text NOT NULL,
    account_id uuid NOT NULL,
    founders_order_id text NOT NULL,
    policy text NOT NULL,
    state text NOT NULL,
    paid_period_end timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_reactivation_at timestamp with time zone,
    CONSTRAINT founders_subscription_transitions_environment_check CHECK ((environment = ANY (ARRAY['sandbox'::text, 'production'::text]))),
    CONSTRAINT founders_subscription_transitions_policy_check CHECK ((policy = 'end_period'::text)),
    CONSTRAINT founders_subscription_transitions_state_check CHECK ((state = ANY (ARRAY['pending'::text, 'completed'::text])))
);


--

-- Name: TABLE founders_subscription_transitions; Type: COMMENT; Schema: private; Owner: -
--

COMMENT ON TABLE private.founders_subscription_transitions IS 'Retained cancellation duty. New transitions require a live account; closed revision-fenced completion may acknowledge an in-flight cancellation after erasure without restoring account data or rights.';


--

-- Name: lifetime_order_admissions; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.lifetime_order_admissions (
    environment text NOT NULL,
    order_id text NOT NULL,
    account_id uuid NOT NULL,
    checkout_key text NOT NULL,
    product_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lifetime_order_admissions_checkout_key_check CHECK ((checkout_key = 'founders'::text)),
    CONSTRAINT lifetime_order_admissions_environment_check CHECK ((environment = ANY (ARRAY['sandbox'::text, 'production'::text])))
);


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
    CONSTRAINT mail_campaigns_state_check CHECK ((state = ANY (ARRAY['draft'::text, 'sending'::text, 'completed'::text]))),
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

-- Name: TABLE web_purchase_erasure_events; Type: COMMENT; Schema: private; Owner: -
--

COMMENT ON TABLE private.web_purchase_erasure_events IS 'Post-erasure web cleanup duty, enqueued after the identity tombstone. No direct API grants; bounded pull and proven idempotent ACK remain available after account deletion.';


--

-- Name: TABLE billing_access_grants; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.billing_access_grants IS 'Authoritative local projection by commercial source. user_entitlements is derived from this table.';


--

-- Name: TABLE billing_checkout_attempts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.billing_checkout_attempts IS 'Server-only shared app/web dedupe. Expired leases do not prove Polar expiry. Preserve unresolved attempts for authorized reconciliation; never delete on another claim.';


--

-- Name: COLUMN billing_customers.environment; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.billing_customers.environment IS 'Polar environment. Legacy NULL rows are quarantined and never used by checkout, portal or webhook resolution.';


--

-- Name: TABLE billing_orders; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.billing_orders IS 'Minimal server-only Polar one-time order ledger; aggregates never revoke without attributed succeeded refunds.';


--

-- Name: TABLE billing_reconciliation_runs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.billing_reconciliation_runs IS 'Applied reconciliation audit only. Dry-run performs zero database writes.';


--

-- Name: TABLE billing_refunds; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.billing_refunds IS 'Minimal server-only Polar refund ledger attributed by refund, payment and order identifiers.';


--

-- Name: TABLE billing_subscription_recovery_cycles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.billing_subscription_recovery_cycles IS 'Immutable audit of bounded Vantare recovery grants per Polar subscription paid-through cycle.';


--

-- Name: devices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.devices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    fingerprint_hash text,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_reset_at timestamp with time zone
);


--

-- Name: hwid_changes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hwid_changes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    license_id uuid NOT NULL,
    old_hwid text,
    new_hwid text NOT NULL,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    auto_approved boolean DEFAULT false NOT NULL
);


--

-- Name: licenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.licenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    tier text DEFAULT 'free'::text NOT NULL,
    hwid text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    deactivated_at timestamp with time zone,
    deactivation_reason text,
    last_validated_at timestamp with time zone,
    validation_count integer DEFAULT 0 NOT NULL,
    CONSTRAINT licenses_tier_check CHECK ((tier = ANY (ARRAY['free'::text, 'pro'::text, 'ultimate'::text])))
);


--

-- Name: module_rollout; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.module_rollout (
    module text NOT NULL,
    enabled_for_all boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT module_rollout_module_check CHECK ((module = ANY (ARRAY['vantare.module.analysis'::text, 'vantare.module.calendar'::text, 'vantare.module.engineer'::text, 'vantare.module.strategy'::text])))
);


--

-- Name: operational_access_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operational_access_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL,
    status text NOT NULL,
    expires_at timestamp with time zone,
    policy_version integer DEFAULT 1 NOT NULL,
    granted_at timestamp with time zone NOT NULL,
    granted_by text NOT NULL,
    grant_reason text NOT NULL,
    revoked_at timestamp with time zone,
    revoked_by text,
    revoke_reason text,
    correlation_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT operational_access_assignments_check CHECK (((expires_at IS NULL) OR (expires_at > granted_at))),
    CONSTRAINT operational_access_assignments_check1 CHECK ((((status = 'active'::text) AND (revoked_at IS NULL) AND (revoked_by IS NULL) AND (revoke_reason IS NULL)) OR ((status = 'revoked'::text) AND (revoked_at IS NOT NULL) AND (revoked_by IS NOT NULL) AND (revoke_reason IS NOT NULL)))),
    CONSTRAINT operational_access_assignments_correlation_id_check CHECK ((correlation_id ~ '^[a-z0-9][a-z0-9._:-]{2,127}$'::text)),
    CONSTRAINT operational_access_assignments_grant_reason_check CHECK (((length(TRIM(BOTH FROM grant_reason)) >= 3) AND (length(TRIM(BOTH FROM grant_reason)) <= 500))),
    CONSTRAINT operational_access_assignments_granted_by_check CHECK ((granted_by ~ '^[a-z0-9][a-z0-9._:-]{2,79}$'::text)),
    CONSTRAINT operational_access_assignments_policy_version_check CHECK ((policy_version = 1)),
    CONSTRAINT operational_access_assignments_revoke_reason_check CHECK (((revoke_reason IS NULL) OR ((length(TRIM(BOTH FROM revoke_reason)) >= 3) AND (length(TRIM(BOTH FROM revoke_reason)) <= 500)))),
    CONSTRAINT operational_access_assignments_revoked_by_check CHECK (((revoked_by IS NULL) OR (revoked_by ~ '^[a-z0-9][a-z0-9._:-]{2,79}$'::text))),
    CONSTRAINT operational_access_assignments_role_check CHECK ((role = ANY (ARRAY['tester'::text, 'nightly_tester'::text, 'owner'::text]))),
    CONSTRAINT operational_access_assignments_status_check CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text])))
);


--

-- Name: TABLE operational_access_assignments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.operational_access_assignments IS 'Non-commercial, revocable Vantare roles. Never a Polar purchase authority.';


--

-- Name: operational_access_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operational_access_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    target_user_id uuid NOT NULL,
    role text NOT NULL,
    action text NOT NULL,
    actor_ref text NOT NULL,
    reason text NOT NULL,
    correlation_id text NOT NULL,
    expires_at timestamp with time zone,
    policy_version integer NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT operational_access_audit_action_check CHECK ((action = ANY (ARRAY['grant'::text, 'revoke'::text]))),
    CONSTRAINT operational_access_audit_actor_ref_check CHECK ((actor_ref ~ '^[a-z0-9][a-z0-9._:-]{2,79}$'::text)),
    CONSTRAINT operational_access_audit_correlation_id_check CHECK ((correlation_id ~ '^[a-z0-9][a-z0-9._:-]{2,127}$'::text)),
    CONSTRAINT operational_access_audit_policy_version_check CHECK ((policy_version = 1)),
    CONSTRAINT operational_access_audit_reason_check CHECK (((length(TRIM(BOTH FROM reason)) >= 3) AND (length(TRIM(BOTH FROM reason)) <= 500))),
    CONSTRAINT operational_access_audit_role_check CHECK ((role = ANY (ARRAY['tester'::text, 'nightly_tester'::text, 'owner'::text])))
);


--

-- Name: operational_legacy_grant_retirements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operational_legacy_grant_retirements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    target_user_id uuid NOT NULL,
    retired_count integer NOT NULL,
    actor_ref text NOT NULL,
    reason text NOT NULL,
    correlation_id text NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT operational_legacy_grant_retirements_actor_ref_check CHECK ((actor_ref ~ '^[a-z0-9][a-z0-9._:-]{2,79}$'::text)),
    CONSTRAINT operational_legacy_grant_retirements_correlation_id_check CHECK ((correlation_id ~ '^[a-z0-9][a-z0-9._:-]{2,127}$'::text)),
    CONSTRAINT operational_legacy_grant_retirements_reason_check CHECK (((length(TRIM(BOTH FROM reason)) >= 3) AND (length(TRIM(BOTH FROM reason)) <= 500))),
    CONSTRAINT operational_legacy_grant_retirements_retired_count_check CHECK ((retired_count > 0))
);


--

-- Name: TABLE operational_legacy_grant_retirements; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.operational_legacy_grant_retirements IS 'Append-only audit of explicit retirement of legacy billing authority.';


--

-- Name: pilot_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pilot_profiles (
    account_id uuid NOT NULL,
    profile jsonb DEFAULT '{}'::jsonb NOT NULL,
    photo_hash text,
    revision bigint DEFAULT 1 NOT NULL,
    last_op_id uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pilot_profiles_check CHECK (public.pilot_profile_valid(profile, photo_hash)),
    CONSTRAINT pilot_profiles_photo_hash_check CHECK (((photo_hash IS NULL) OR (photo_hash ~ '^[0-9a-f]{64}$'::text))),
    CONSTRAINT pilot_profiles_profile_check CHECK (((NOT (profile ? 'photo'::text)) OR ((profile -> 'photo'::text) = 'null'::jsonb))),
    CONSTRAINT pilot_profiles_revision_check CHECK ((revision > 0))
);


--

-- Name: race_schedule_publications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.race_schedule_publications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    status text NOT NULL,
    schedule jsonb NOT NULL,
    source_text text NOT NULL,
    valid_from timestamp with time zone NOT NULL,
    series_count integer NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    published_at timestamp with time zone,
    published_by uuid,
    superseded_at timestamp with time zone,
    CONSTRAINT race_schedule_publications_check CHECK ((((status = 'draft'::text) AND (published_at IS NULL) AND (published_by IS NULL)) OR ((status = ANY (ARRAY['published'::text, 'superseded'::text])) AND (published_at IS NOT NULL) AND (published_by IS NOT NULL)))),
    CONSTRAINT race_schedule_publications_check1 CHECK (((status <> 'superseded'::text) OR (superseded_at IS NOT NULL))),
    CONSTRAINT race_schedule_publications_series_count_check CHECK ((series_count > 0)),
    CONSTRAINT race_schedule_publications_source_text_check CHECK ((length(TRIM(BOTH FROM source_text)) > 0)),
    CONSTRAINT race_schedule_publications_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'superseded'::text])))
);


--

-- Name: rate_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rate_limits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    license_id uuid,
    ip_address inet,
    endpoint text NOT NULL,
    request_count integer DEFAULT 1 NOT NULL,
    window_start timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

-- Name: subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    plan text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    payment_provider text DEFAULT 'stripe'::text,
    payment_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT subscriptions_plan_check CHECK ((plan = ANY (ARRAY['free'::text, 'pro'::text, 'ultimate'::text]))),
    CONSTRAINT subscriptions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'cancelled'::text, 'expired'::text, 'past_due'::text])))
);


--

-- Name: supabase_heartbeat; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supabase_heartbeat (
    id boolean DEFAULT true NOT NULL,
    CONSTRAINT supabase_heartbeat_id_check CHECK (id)
);


--

-- Name: TABLE testing_center_agent_effect_outbox; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.testing_center_agent_effect_outbox IS 'HAF-05 per-phase external effects with lease, fencing and no retry after reservation ambiguity.';


--

-- Name: TABLE testing_center_agent_jobs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.testing_center_agent_jobs IS 'HAF-05 one immutable generation-one autofix job per Testing Center technical issue.';


--

-- Name: TABLE testing_center_agent_phase_callbacks; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.testing_center_agent_phase_callbacks IS 'HAF-09 one replay-safe, fenced ledger row per non-triage agent phase callback.';


--

-- Name: TABLE testing_center_audit; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.testing_center_audit IS 'TAU-02B append-oriented audit snapshots; transition authorization remains outside SQL.';


--

-- Name: TABLE testing_center_build_identities; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.testing_center_build_identities IS 'TAU-07E server-only channel and app-version to exact candidate SHA registry.';


--

-- Name: TABLE testing_center_codex_dossier_snapshots; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.testing_center_codex_dossier_snapshots IS 'TAU-07G deterministic sanitized dossier; storage grants no Codex authority.';


--

-- Name: TABLE testing_center_codex_execution_control; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.testing_center_codex_execution_control IS 'TAU-06F one automatic Codex dry-run dispatch per issue with durable fencing.';


--

-- Name: TABLE testing_center_effect_outbox; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.testing_center_effect_outbox IS 'TAU-05A durable exactly-once reservation; no external GitHub call is made by this migration.';


--

-- Name: TABLE testing_center_effect_supersessions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.testing_center_effect_supersessions IS 'TAU-07E exact reversible snapshot of superseded inert GitHub effects.';


--

-- Name: TABLE testing_center_github_deliveries; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.testing_center_github_deliveries IS 'TAU-05C signed GitHub delivery replay ledger; payloads and signatures are not stored.';


--

-- Name: TABLE testing_center_issue_destinations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.testing_center_issue_destinations IS 'TAU-07E durable single destination per technical issue, including terminal effects.';


--

-- Name: TABLE testing_center_linear_projection_snapshots; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.testing_center_linear_projection_snapshots IS 'TAU-07E durable canonical source and sanitized Linear dry-run projection.';


--

-- Name: TABLE testing_center_linear_reconciliations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.testing_center_linear_reconciliations IS 'TAU-07F observational state only; never authorizes Codex, Git or promotion.';


--

-- Name: TABLE testing_center_linear_webhook_deliveries; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.testing_center_linear_webhook_deliveries IS 'TAU-07F durable allowlisted Linear delivery metadata; no raw body or signature.';


--

-- Name: TABLE testing_center_memberships; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.testing_center_memberships IS 'TAU-02C server-owned Testing Center roles; clients cannot self-assign.';


--

-- Name: TABLE testing_center_owner_dispositions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.testing_center_owner_dispositions IS 'TAU-07G explicit owner decision; same_branch is impossible by constraint.';


--

-- Name: TABLE testing_center_validation_snapshots; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.testing_center_validation_snapshots IS 'TAU-07G exact candidate feedback projection; tester identity remains private.';


--

-- Name: user_entitlements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_entitlements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    product_key text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL,
    expires_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_entitlements_active_derived_check CHECK (((status <> ALL (ARRAY['active'::text, 'grace'::text, 'past_due'::text])) OR ((product_key = 'bundle'::text) AND (source = 'billing_projection'::text))))
);


--

-- Name: users users_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--

-- Name: operations operations_pkey; Type: CONSTRAINT; Schema: pilot_private; Owner: -
--

ALTER TABLE ONLY pilot_private.operations
    ADD CONSTRAINT operations_pkey PRIMARY KEY (account_id, op_id);


--

-- Name: creator_checkout_attributions creator_checkout_attributions_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.creator_checkout_attributions
    ADD CONSTRAINT creator_checkout_attributions_pkey PRIMARY KEY (environment, account_id, attempt_id);


--

-- Name: creator_renewal_operations creator_renewal_operations_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.creator_renewal_operations
    ADD CONSTRAINT creator_renewal_operations_pkey PRIMARY KEY (environment, subscription_id);


--

-- Name: creator_subscription_revocations creator_subscription_revocations_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.creator_subscription_revocations
    ADD CONSTRAINT creator_subscription_revocations_pkey PRIMARY KEY (environment, subscription_id);


--

-- Name: founders_sale_config founders_sale_config_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.founders_sale_config
    ADD CONSTRAINT founders_sale_config_pkey PRIMARY KEY (environment);


--

-- Name: founders_subscription_transitions founders_subscription_transitions_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.founders_subscription_transitions
    ADD CONSTRAINT founders_subscription_transitions_pkey PRIMARY KEY (environment, subscription_id);


--

-- Name: lifetime_order_admissions lifetime_order_admissions_environment_account_id_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.lifetime_order_admissions
    ADD CONSTRAINT lifetime_order_admissions_environment_account_id_key UNIQUE (environment, account_id);


--

-- Name: lifetime_order_admissions lifetime_order_admissions_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.lifetime_order_admissions
    ADD CONSTRAINT lifetime_order_admissions_pkey PRIMARY KEY (environment, order_id);


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

-- Name: devices devices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.devices
    ADD CONSTRAINT devices_pkey PRIMARY KEY (id);


--

-- Name: devices devices_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.devices
    ADD CONSTRAINT devices_user_id_key UNIQUE (user_id);


--

-- Name: hwid_changes hwid_changes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hwid_changes
    ADD CONSTRAINT hwid_changes_pkey PRIMARY KEY (id);


--

-- Name: licenses licenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.licenses
    ADD CONSTRAINT licenses_pkey PRIMARY KEY (id);


--

-- Name: module_rollout module_rollout_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.module_rollout
    ADD CONSTRAINT module_rollout_pkey PRIMARY KEY (module);


--

-- Name: operational_access_assignments operational_access_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operational_access_assignments
    ADD CONSTRAINT operational_access_assignments_pkey PRIMARY KEY (id);


--

-- Name: operational_access_audit operational_access_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operational_access_audit
    ADD CONSTRAINT operational_access_audit_pkey PRIMARY KEY (id);


--

-- Name: operational_access_assignments operational_access_user_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operational_access_assignments
    ADD CONSTRAINT operational_access_user_role_key UNIQUE (user_id, role);


--

-- Name: operational_legacy_grant_retirements operational_legacy_grant_retirements_correlation_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operational_legacy_grant_retirements
    ADD CONSTRAINT operational_legacy_grant_retirements_correlation_id_key UNIQUE (correlation_id);


--

-- Name: operational_legacy_grant_retirements operational_legacy_grant_retirements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operational_legacy_grant_retirements
    ADD CONSTRAINT operational_legacy_grant_retirements_pkey PRIMARY KEY (id);


--

-- Name: pilot_profiles pilot_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pilot_profiles
    ADD CONSTRAINT pilot_profiles_pkey PRIMARY KEY (account_id);


--

-- Name: race_schedule_publications race_schedule_publications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.race_schedule_publications
    ADD CONSTRAINT race_schedule_publications_pkey PRIMARY KEY (id);


--

-- Name: rate_limits rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limits
    ADD CONSTRAINT rate_limits_pkey PRIMARY KEY (id);


--

-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--

-- Name: supabase_heartbeat supabase_heartbeat_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supabase_heartbeat
    ADD CONSTRAINT supabase_heartbeat_pkey PRIMARY KEY (id);


--

-- Name: user_entitlements user_entitlements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_entitlements
    ADD CONSTRAINT user_entitlements_pkey PRIMARY KEY (id);


--

-- Name: user_entitlements user_entitlements_user_id_product_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_entitlements
    ADD CONSTRAINT user_entitlements_user_id_product_key_key UNIQUE (user_id, product_key);


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

-- Name: devices_fingerprint_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX devices_fingerprint_hash_idx ON public.devices USING btree (fingerprint_hash);


--

-- Name: idx_hwid_changes_license; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hwid_changes_license ON public.hwid_changes USING btree (license_id);


--

-- Name: idx_licenses_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_licenses_active ON public.licenses USING btree (is_active) WHERE (is_active = true);


--

-- Name: idx_licenses_hwid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_licenses_hwid ON public.licenses USING btree (hwid);


--

-- Name: idx_licenses_one_active_per_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_licenses_one_active_per_user ON public.licenses USING btree (user_id) WHERE (is_active = true);


--

-- Name: idx_licenses_tier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_licenses_tier ON public.licenses USING btree (tier);


--

-- Name: idx_licenses_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_licenses_user_id ON public.licenses USING btree (user_id);


--

-- Name: idx_rate_limits_license_endpoint; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rate_limits_license_endpoint ON public.rate_limits USING btree (license_id, endpoint, window_start);


--

-- Name: idx_rate_limits_user_ip; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rate_limits_user_ip ON public.rate_limits USING btree (user_id, ip_address, endpoint);


--

-- Name: idx_rate_limits_window; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rate_limits_window ON public.rate_limits USING btree (window_start);


--

-- Name: idx_subscriptions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_status ON public.subscriptions USING btree (status);


--

-- Name: idx_subscriptions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_user_id ON public.subscriptions USING btree (user_id);


--

-- Name: operational_access_active_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX operational_access_active_expiry_idx ON public.operational_access_assignments USING btree (status, expires_at);


--

-- Name: operational_access_audit_target_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX operational_access_audit_target_idx ON public.operational_access_audit USING btree (target_user_id, occurred_at DESC);


--

-- Name: operational_access_one_active_role_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX operational_access_one_active_role_idx ON public.operational_access_assignments USING btree (user_id) WHERE (status = 'active'::text);


--

-- Name: race_schedule_one_draft_per_author_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX race_schedule_one_draft_per_author_idx ON public.race_schedule_publications USING btree (created_by) WHERE (status = 'draft'::text);


--

-- Name: race_schedule_one_published_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX race_schedule_one_published_idx ON public.race_schedule_publications USING btree ((true)) WHERE (status = 'published'::text);


--

-- Name: race_schedule_valid_from_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX race_schedule_valid_from_idx ON public.race_schedule_publications USING btree (valid_from DESC);


--

-- Name: user_entitlements_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_entitlements_user_id_idx ON public.user_entitlements USING btree (user_id);


--

-- Name: user_entitlements_user_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_entitlements_user_product_idx ON public.user_entitlements USING btree (user_id, product_key);


--

-- Name: operations a_account_write_barrier; Type: TRIGGER; Schema: pilot_private; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON pilot_private.operations FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array[($1->>''account_id'')::uuid]', 'select not exists(select 1 from public.profiles where id=($1->>''account_id'')::uuid)');


--

-- Name: creator_checkout_attributions a_account_write_barrier; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON private.creator_checkout_attributions FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array[($1->>''account_id'')::uuid]', 'select false');


--

-- Name: creator_renewal_operations a_account_write_barrier; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON private.creator_renewal_operations FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array[($1->>''account_id'')::uuid]', 'select false');


--

-- Name: creator_subscription_revocations a_account_write_barrier; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON private.creator_subscription_revocations FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array[($1->>''account_id'')::uuid]', 'select false');


--

-- Name: lifetime_order_admissions a_account_write_barrier; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON private.lifetime_order_admissions FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array[($1->>''account_id'')::uuid]', 'select false');


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

-- Name: mail_audit mail_audit_append_only; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER mail_audit_append_only BEFORE DELETE OR UPDATE ON private.mail_audit FOR EACH ROW EXECUTE FUNCTION public.operational_access_reject_audit_mutation();


--

-- Name: mail_contacts mail_queue_contact_erasure; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER mail_queue_contact_erasure BEFORE DELETE ON private.mail_contacts FOR EACH ROW EXECUTE FUNCTION private.mail_queue_contact_erasure();


--

-- Name: devices a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.devices FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''user_id'')::uuid) owners(account)', 'select ($1->>''user_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''user_id'')::uuid))');


--

-- Name: hwid_changes a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.hwid_changes FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.licenses p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''user_id'')::uuid) a(account) where p2.id=($1->>''license_id'')::uuid) owners(account)', 'select ($1->>''license_id'' is not null and not exists(select 1 from public.licenses p where p.id=($1->>''license_id'')::uuid))');


--

-- Name: licenses a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.licenses FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''user_id'')::uuid) owners(account)', 'select ($1->>''user_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''user_id'')::uuid))');


--

-- Name: operational_access_assignments a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.operational_access_assignments FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''user_id'')::uuid) owners(account)', 'select ($1->>''user_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''user_id'')::uuid))');


--

-- Name: operational_access_audit a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.operational_access_audit FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select ($1->>''target_user_id'')::uuid) owners(account)', 'select false');


--

-- Name: operational_legacy_grant_retirements a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.operational_legacy_grant_retirements FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select ($1->>''target_user_id'')::uuid) owners(account)', 'select false');


--

-- Name: pilot_profiles a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.pilot_profiles FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''account_id'')::uuid) owners(account)', 'select ($1->>''account_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''account_id'')::uuid))');


--

-- Name: race_schedule_publications a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.race_schedule_publications FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''published_by'')::uuid union select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''created_by'')::uuid) owners(account)', 'select ($1->>''created_by'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''created_by'')::uuid)) or ($1->>''published_by'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''published_by'')::uuid))');


--

-- Name: rate_limits a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.rate_limits FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''user_id'')::uuid union select a.account from public.licenses p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''user_id'')::uuid) a(account) where p2.id=($1->>''license_id'')::uuid) owners(account)', 'select ($1->>''license_id'' is not null and not exists(select 1 from public.licenses p where p.id=($1->>''license_id'')::uuid)) or ($1->>''user_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''user_id'')::uuid))');


--

-- Name: subscriptions a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''user_id'')::uuid) owners(account)', 'select ($1->>''user_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''user_id'')::uuid))');


--

-- Name: user_entitlements a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.user_entitlements FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''user_id'')::uuid) owners(account)', 'select ($1->>''user_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''user_id'')::uuid))');


--

-- Name: operational_access_audit operational_access_audit_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER operational_access_audit_append_only BEFORE DELETE OR UPDATE ON public.operational_access_audit FOR EACH ROW EXECUTE FUNCTION public.operational_access_reject_audit_mutation();


--

-- Name: operational_legacy_grant_retirements operational_legacy_grant_retirements_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER operational_legacy_grant_retirements_append_only BEFORE DELETE OR UPDATE ON public.operational_legacy_grant_retirements FOR EACH ROW EXECUTE FUNCTION public.operational_access_reject_audit_mutation();


--

-- Name: subscriptions subscriptions_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER subscriptions_set_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--

-- Name: operations operations_account_id_fkey; Type: FK CONSTRAINT; Schema: pilot_private; Owner: -
--

ALTER TABLE ONLY pilot_private.operations
    ADD CONSTRAINT operations_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


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

-- Name: devices devices_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.devices
    ADD CONSTRAINT devices_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--

-- Name: hwid_changes hwid_changes_license_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hwid_changes
    ADD CONSTRAINT hwid_changes_license_id_fkey FOREIGN KEY (license_id) REFERENCES public.licenses(id) ON DELETE CASCADE;


--

-- Name: licenses licenses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.licenses
    ADD CONSTRAINT licenses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--

-- Name: operational_access_assignments operational_access_assignments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operational_access_assignments
    ADD CONSTRAINT operational_access_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--

-- Name: pilot_profiles pilot_profiles_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pilot_profiles
    ADD CONSTRAINT pilot_profiles_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--

-- Name: race_schedule_publications race_schedule_publications_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.race_schedule_publications
    ADD CONSTRAINT race_schedule_publications_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE CASCADE;


--

-- Name: race_schedule_publications race_schedule_publications_published_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.race_schedule_publications
    ADD CONSTRAINT race_schedule_publications_published_by_fkey FOREIGN KEY (published_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--

-- Name: rate_limits rate_limits_license_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limits
    ADD CONSTRAINT rate_limits_license_id_fkey FOREIGN KEY (license_id) REFERENCES public.licenses(id) ON DELETE CASCADE;


--

-- Name: rate_limits rate_limits_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limits
    ADD CONSTRAINT rate_limits_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--

-- Name: subscriptions subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--

-- Name: user_entitlements user_entitlements_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_entitlements
    ADD CONSTRAINT user_entitlements_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--

-- Name: operations; Type: ROW SECURITY; Schema: pilot_private; Owner: -
--

ALTER TABLE pilot_private.operations ENABLE ROW LEVEL SECURITY;

--

-- Name: operations pilot_operation_self; Type: POLICY; Schema: pilot_private; Owner: -
--

CREATE POLICY pilot_operation_self ON pilot_private.operations TO pilot_profile_writer USING ((account_id = ( SELECT private.current_account() AS current_account))) WITH CHECK ((account_id = ( SELECT private.current_account() AS current_account)));


--

-- Name: creator_checkout_attributions; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.creator_checkout_attributions ENABLE ROW LEVEL SECURITY;

--

-- Name: creator_renewal_operations; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.creator_renewal_operations ENABLE ROW LEVEL SECURITY;

--

-- Name: creator_subscription_revocations; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.creator_subscription_revocations ENABLE ROW LEVEL SECURITY;

--

-- Name: founders_sale_config; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.founders_sale_config ENABLE ROW LEVEL SECURITY;

--

-- Name: founders_subscription_transitions; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.founders_subscription_transitions ENABLE ROW LEVEL SECURITY;

--

-- Name: lifetime_order_admissions; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.lifetime_order_admissions ENABLE ROW LEVEL SECURITY;

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

-- Name: devices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

--

-- Name: devices devices_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY devices_select_own ON public.devices FOR SELECT USING ((private.current_account() = user_id));


--

-- Name: user_entitlements entitlements_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY entitlements_select_own ON public.user_entitlements FOR SELECT USING ((private.current_account() = user_id));


--

-- Name: hwid_changes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hwid_changes ENABLE ROW LEVEL SECURITY;

--

-- Name: hwid_changes hwid_changes_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hwid_changes_select_own ON public.hwid_changes FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.licenses l
  WHERE ((l.id = hwid_changes.license_id) AND (l.user_id = private.current_account())))));


--

-- Name: licenses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;

--

-- Name: licenses licenses_no_public_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY licenses_no_public_delete ON public.licenses FOR DELETE USING (false);


--

-- Name: licenses licenses_no_public_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY licenses_no_public_insert ON public.licenses FOR INSERT WITH CHECK (false);


--

-- Name: licenses licenses_no_public_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY licenses_no_public_update ON public.licenses FOR UPDATE USING (false);


--

-- Name: licenses licenses_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY licenses_select_own ON public.licenses FOR SELECT USING ((private.current_account() = user_id));


--

-- Name: module_rollout; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.module_rollout ENABLE ROW LEVEL SECURITY;

--

-- Name: module_rollout module_rollout_service_role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY module_rollout_service_role ON public.module_rollout TO service_role USING (true) WITH CHECK (true);


--

-- Name: operational_access_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.operational_access_assignments ENABLE ROW LEVEL SECURITY;

--

-- Name: operational_access_audit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.operational_access_audit ENABLE ROW LEVEL SECURITY;

--

-- Name: operational_legacy_grant_retirements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.operational_legacy_grant_retirements ENABLE ROW LEVEL SECURITY;

--

-- Name: pilot_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pilot_profiles ENABLE ROW LEVEL SECURITY;

--

-- Name: pilot_profiles pilot_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pilot_self ON public.pilot_profiles TO authenticated, pilot_profile_writer USING ((account_id = ( SELECT private.current_account() AS uid))) WITH CHECK ((account_id = ( SELECT private.current_account() AS uid)));


--

-- Name: race_schedule_publications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.race_schedule_publications ENABLE ROW LEVEL SECURITY;

--

-- Name: rate_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

--

-- Name: subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

--

-- Name: subscriptions subscriptions_no_public_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subscriptions_no_public_delete ON public.subscriptions FOR DELETE USING (false);


--

-- Name: subscriptions subscriptions_no_public_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subscriptions_no_public_insert ON public.subscriptions FOR INSERT WITH CHECK (false);


--

-- Name: subscriptions subscriptions_no_public_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subscriptions_no_public_update ON public.subscriptions FOR UPDATE USING (false);


--

-- Name: subscriptions subscriptions_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subscriptions_select_own ON public.subscriptions FOR SELECT USING ((private.current_account() = user_id));


--

-- Name: supabase_heartbeat; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supabase_heartbeat ENABLE ROW LEVEL SECURITY;

--

-- Name: supabase_heartbeat supabase_heartbeat_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY supabase_heartbeat_read ON public.supabase_heartbeat FOR SELECT TO anon USING (true);


--

-- Name: user_entitlements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_entitlements ENABLE ROW LEVEL SECURITY;

--

-- Name: SCHEMA auth; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA auth TO anon;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT USAGE ON SCHEMA auth TO service_role;
GRANT USAGE ON SCHEMA auth TO pilot_profile_writer;


--

-- Name: SCHEMA extensions; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA extensions TO anon;
GRANT USAGE ON SCHEMA extensions TO authenticated;
GRANT USAGE ON SCHEMA extensions TO service_role;


--

-- Name: SCHEMA pilot_private; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA pilot_private TO authenticated;
GRANT USAGE ON SCHEMA pilot_private TO pilot_profile_writer;


--

-- Name: SCHEMA private; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA private TO authenticated;
GRANT USAGE ON SCHEMA private TO pilot_profile_writer;


--

-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT USAGE ON SCHEMA public TO vantare_roadmap_publisher;
GRANT USAGE ON SCHEMA public TO vantare_triage;
GRANT USAGE ON SCHEMA public TO pilot_profile_writer;
GRANT USAGE ON SCHEMA public TO web_purchase_erasure;


--

-- Name: SCHEMA storage; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA storage TO anon;
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT USAGE ON SCHEMA storage TO service_role;
GRANT USAGE ON SCHEMA storage TO pilot_profile_writer;


--

-- Name: FUNCTION uid(); Type: ACL; Schema: auth; Owner: -
--

GRANT ALL ON FUNCTION auth.uid() TO pilot_profile_writer;


--

-- Name: FUNCTION pilot_profile_save(p_profile jsonb, p_photo_hash text, p_expected_revision bigint, p_op_id uuid); Type: ACL; Schema: pilot_private; Owner: -
--

REVOKE ALL ON FUNCTION pilot_private.pilot_profile_save(p_profile jsonb, p_photo_hash text, p_expected_revision bigint, p_op_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION pilot_private.pilot_profile_save(p_profile jsonb, p_photo_hash text, p_expected_revision bigint, p_op_id uuid) TO authenticated;


--

-- Name: FUNCTION billing_creator_renewal_prepare_before_1593(p_environment text, p_user uuid, p_checkout text, p_subscription text, p_order text, p_product uuid, p_key text, p_initial_discount uuid, p_creator_savings integer); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.billing_creator_renewal_prepare_before_1593(p_environment text, p_user uuid, p_checkout text, p_subscription text, p_order text, p_product uuid, p_key text, p_initial_discount uuid, p_creator_savings integer) FROM PUBLIC;


--

-- Name: FUNCTION billing_creator_revocation_before_1593(p_stage text, p_environment text, p_user uuid, p_subscription text, p_order text, p_reason text, p_token uuid, p_success boolean); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.billing_creator_revocation_before_1593(p_stage text, p_environment text, p_user uuid, p_subscription text, p_order text, p_reason text, p_token uuid, p_success boolean) FROM PUBLIC;


--

-- Name: FUNCTION billing_deleted_event(p_provider text, p_environment text, p_type text, p_payload jsonb, p_hash text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.billing_deleted_event(p_provider text, p_environment text, p_type text, p_payload jsonb, p_hash text) FROM PUBLIC;


--

-- Name: FUNCTION billing_event_accounts(p_provider text, p_environment text, p_type text, p_payload jsonb); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.billing_event_accounts(p_provider text, p_environment text, p_type text, p_payload jsonb) FROM PUBLIC;


--

-- Name: FUNCTION billing_launch_checkout_before_1593_guard(p_account uuid, p_environment text, p_product text, p_discount text, p_key text, p_now timestamp with time zone, p_attempt uuid, p_replaces uuid); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.billing_launch_checkout_before_1593_guard(p_account uuid, p_environment text, p_product text, p_discount text, p_key text, p_now timestamp with time zone, p_attempt uuid, p_replaces uuid) FROM PUBLIC;


--

-- Name: FUNCTION billing_set_report_candidate_before_1593(p_environment text, p_user uuid, p_subscription text, p_discount uuid, p_savings integer, p_valid_until timestamp with time zone); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.billing_set_report_candidate_before_1593(p_environment text, p_user uuid, p_subscription text, p_discount uuid, p_savings integer, p_valid_until timestamp with time zone) FROM PUBLIC;


--

-- Name: FUNCTION checkout_was_fulfilled(p_environment text, p_order uuid, p_checkout uuid, p_product uuid, p_subscription uuid, p_capabilities text[]); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.checkout_was_fulfilled(p_environment text, p_order uuid, p_checkout uuid, p_product uuid, p_subscription uuid, p_capabilities text[]) FROM PUBLIC;


--

-- Name: FUNCTION claim_account_device(v_user_id uuid, device_fingerprint text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.claim_account_device(v_user_id uuid, device_fingerprint text) FROM PUBLIC;


--

-- Name: FUNCTION claim_checkout_compensation_unchecked(p_environment text, p_token uuid); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.claim_checkout_compensation_unchecked(p_environment text, p_token uuid) FROM PUBLIC;


--

-- Name: FUNCTION close_terminal_checkout_attempts(p_user_id uuid, p_environment text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.close_terminal_checkout_attempts(p_user_id uuid, p_environment text) FROM PUBLIC;


--

-- Name: FUNCTION current_account(); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.current_account() FROM PUBLIC;
GRANT ALL ON FUNCTION private.current_account() TO authenticated;
GRANT ALL ON FUNCTION private.current_account() TO pilot_profile_writer;


--

-- Name: FUNCTION enqueue_web_purchase_erasure(p_account uuid); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.enqueue_web_purchase_erasure(p_account uuid) FROM PUBLIC;


--

-- Name: FUNCTION guard_account_write(); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.guard_account_write() FROM PUBLIC;


--

-- Name: FUNCTION guard_founders_checkout(); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.guard_founders_checkout() FROM PUBLIC;


--

-- Name: FUNCTION install_report_creator_owner(); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.install_report_creator_owner() FROM PUBLIC;


--

-- Name: FUNCTION is_owner(p_account uuid); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.is_owner(p_account uuid) FROM PUBLIC;


--

-- Name: FUNCTION lock_account_row_write(p_account uuid); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.lock_account_row_write(p_account uuid) FROM PUBLIC;


--

-- Name: FUNCTION lock_account_write(p_account uuid); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.lock_account_write(p_account uuid) FROM PUBLIC;


--

-- Name: FUNCTION lock_accounts_before_rows(p_accounts uuid[]); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.lock_accounts_before_rows(p_accounts uuid[]) FROM PUBLIC;


--

-- Name: FUNCTION mail_admin_execute_v1(p_actor uuid, p_action text, p_params jsonb, p_environment text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.mail_admin_execute_v1(p_actor uuid, p_action text, p_params jsonb, p_environment text) FROM PUBLIC;


--

-- Name: FUNCTION mail_admin_execute_v2(p_actor uuid, p_action text, p_params jsonb, p_environment text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.mail_admin_execute_v2(p_actor uuid, p_action text, p_params jsonb, p_environment text) FROM PUBLIC;


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

-- Name: FUNCTION native_admin_account(p_account uuid, p_issuer text, p_environment text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.native_admin_account(p_account uuid, p_issuer text, p_environment text) FROM PUBLIC;


--

-- Name: FUNCTION native_admin_account_before_1593(p_account uuid, p_issuer text, p_environment text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.native_admin_account_before_1593(p_account uuid, p_issuer text, p_environment text) FROM PUBLIC;


--

-- Name: FUNCTION native_admin_account_before_1661_reports(p_account uuid, p_issuer text, p_environment text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.native_admin_account_before_1661_reports(p_account uuid, p_issuer text, p_environment text) FROM PUBLIC;


--

-- Name: FUNCTION native_admin_account_deletion(p_actor uuid, p_account uuid, p_issuer text, p_hash text, p_subject text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.native_admin_account_deletion(p_actor uuid, p_account uuid, p_issuer text, p_hash text, p_subject text) FROM PUBLIC;


--

-- Name: FUNCTION native_admin_account_summary(p_account uuid, p_issuer text, p_environment text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.native_admin_account_summary(p_account uuid, p_issuer text, p_environment text) FROM PUBLIC;


--

-- Name: FUNCTION native_admin_account_v1(p_account uuid, p_issuer text, p_environment text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.native_admin_account_v1(p_account uuid, p_issuer text, p_environment text) FROM PUBLIC;


--

-- Name: FUNCTION native_admin_commission_rate(p_period integer); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.native_admin_commission_rate(p_period integer) FROM PUBLIC;


--

-- Name: FUNCTION native_admin_creator(p_id uuid, p_environment text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.native_admin_creator(p_id uuid, p_environment text) FROM PUBLIC;


--

-- Name: FUNCTION native_admin_creator_lines(p_environment text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.native_admin_creator_lines(p_environment text) FROM PUBLIC;


--

-- Name: FUNCTION native_admin_creators(p_environment text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.native_admin_creators(p_environment text) FROM PUBLIC;


--

-- Name: FUNCTION native_admin_execute_before_creator_coupon(p_actor uuid, p_issuer text, p_action text, p_params jsonb, p_environment text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.native_admin_execute_before_creator_coupon(p_actor uuid, p_issuer text, p_action text, p_params jsonb, p_environment text) FROM PUBLIC;


--

-- Name: FUNCTION native_admin_execute_v1(p_actor uuid, p_issuer text, p_action text, p_params jsonb, p_environment text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.native_admin_execute_v1(p_actor uuid, p_issuer text, p_action text, p_params jsonb, p_environment text) FROM PUBLIC;


--

-- Name: FUNCTION native_admin_reports(p_issuer text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.native_admin_reports(p_issuer text) FROM PUBLIC;


--

-- Name: FUNCTION native_admin_require_owner(p_actor uuid); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.native_admin_require_owner(p_actor uuid) FROM PUBLIC;


--

-- Name: FUNCTION native_admin_review_report(p_actor uuid, p_id uuid, p_status text, p_version text, p_note text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.native_admin_review_report(p_actor uuid, p_id uuid, p_status text, p_version text, p_note text) FROM PUBLIC;


--

-- Name: FUNCTION observe_checkout_payment_unchecked(p_environment text, p_order_id uuid, p_checkout_id uuid, p_organization_id uuid, p_product_id uuid, p_subscription_id uuid, p_net_amount bigint, p_currency text, p_capabilities text[], p_attempt_id uuid, p_dispatch_token uuid); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.observe_checkout_payment_unchecked(p_environment text, p_order_id uuid, p_checkout_id uuid, p_organization_id uuid, p_product_id uuid, p_subscription_id uuid, p_net_amount bigint, p_currency text, p_capabilities text[], p_attempt_id uuid, p_dispatch_token uuid) FROM PUBLIC;


--

-- Name: FUNCTION record_web_purchase_erasure(); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.record_web_purchase_erasure() FROM PUBLIC;


--

-- Name: FUNCTION report_creator_block_finished(p_account uuid, p_environment text, p_now timestamp with time zone); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.report_creator_block_finished(p_account uuid, p_environment text, p_now timestamp with time zone) FROM PUBLIC;


--

-- Name: FUNCTION report_creator_bound(p_environment text, p_subscription text, p_operation jsonb, p_now timestamp with time zone); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.report_creator_bound(p_environment text, p_subscription text, p_operation jsonb, p_now timestamp with time zone) FROM PUBLIC;


--

-- Name: FUNCTION report_creator_context(p_user uuid, p_environment text, p_subscription text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.report_creator_context(p_user uuid, p_environment text, p_subscription text) FROM PUBLIC;


--

-- Name: FUNCTION report_creator_due(p_account uuid, p_environment text, p_now timestamp with time zone); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.report_creator_due(p_account uuid, p_environment text, p_now timestamp with time zone) FROM PUBLIC;


--

-- Name: FUNCTION report_creator_end(p_environment text, p_subscription text, p_now timestamp with time zone); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.report_creator_end(p_environment text, p_subscription text, p_now timestamp with time zone) FROM PUBLIC;


--

-- Name: FUNCTION report_promotion_checkout_started(); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.report_promotion_checkout_started() FROM PUBLIC;


--

-- Name: FUNCTION report_promotion_eligible(t timestamp with time zone); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.report_promotion_eligible(t timestamp with time zone) FROM PUBLIC;


--

-- Name: FUNCTION report_promotion_enrollment_open(t timestamp with time zone); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.report_promotion_enrollment_open(t timestamp with time zone) FROM PUBLIC;


--

-- Name: FUNCTION report_promotion_mark_launch(); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.report_promotion_mark_launch() FROM PUBLIC;


--

-- Name: FUNCTION report_promotion_months(t timestamp with time zone, n integer); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.report_promotion_months(t timestamp with time zone, n integer) FROM PUBLIC;


--

-- Name: FUNCTION report_promotion_progress(p_account uuid, p_environment text, p_now timestamp with time zone); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.report_promotion_progress(p_account uuid, p_environment text, p_now timestamp with time zone) FROM PUBLIC;


--

-- Name: FUNCTION require_web_erasure_credential(); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.require_web_erasure_credential() FROM PUBLIC;


--

-- Name: FUNCTION resolve_account_identity(issuer text, subject text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.resolve_account_identity(issuer text, subject text) FROM PUBLIC;


--

-- Name: FUNCTION resolve_current_account(); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.resolve_current_account() FROM PUBLIC;


--

-- Name: FUNCTION retain_checkout_binding(); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.retain_checkout_binding() FROM PUBLIC;


--

-- Name: FUNCTION storage_abort_probe(); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.storage_abort_probe() FROM PUBLIC;


--

-- Name: FUNCTION storage_owner_accounts(p_row jsonb); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.storage_owner_accounts(p_row jsonb) FROM PUBLIC;


--

-- Name: FUNCTION testing_center_v2_owner(p_reference text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.testing_center_v2_owner(p_reference text) FROM PUBLIC;


--

-- Name: FUNCTION testing_contribution_purge_evidence(); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.testing_contribution_purge_evidence() FROM PUBLIC;


--

-- Name: FUNCTION testing_contribution_review_as(p_reviewer uuid, p_id uuid, p_decision text, p_note text, p_proposal jsonb); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.testing_contribution_review_as(p_reviewer uuid, p_id uuid, p_decision text, p_note text, p_proposal jsonb) FROM PUBLIC;


--

-- Name: FUNCTION testing_contribution_submit_for_account(p_account uuid, p_id uuid, p_channel text, p_title text, p_body text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.testing_contribution_submit_for_account(p_account uuid, p_id uuid, p_channel text, p_title text, p_body text) FROM PUBLIC;


--

-- Name: FUNCTION testing_contribution_submit_v2_for_account(p_account uuid, p_id uuid, p_channel text, p_title text, p_body text, p_context jsonb, p_attachments jsonb); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.testing_contribution_submit_v2_for_account(p_account uuid, p_id uuid, p_channel text, p_title text, p_body text, p_context jsonb, p_attachments jsonb) FROM PUBLIC;


--

-- Name: FUNCTION testing_proposal_valid(p jsonb); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.testing_proposal_valid(p jsonb) FROM PUBLIC;


--

-- Name: FUNCTION testing_report_acceptance_limit(); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.testing_report_acceptance_limit() FROM PUBLIC;


--

-- Name: FUNCTION testing_report_activity(); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.testing_report_activity() FROM PUBLIC;


--

-- Name: FUNCTION testing_report_limit(); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.testing_report_limit() FROM PUBLIC;


--

-- Name: FUNCTION testing_report_purge_admitted_on_delete(); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.testing_report_purge_admitted_on_delete() FROM PUBLIC;


--

-- Name: FUNCTION testing_report_status(); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.testing_report_status() FROM PUBLIC;


--

-- Name: FUNCTION testing_report_submit_for_account(p_account uuid, p_id uuid, p_channel text, p_title text, p_body text, p_consent boolean); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.testing_report_submit_for_account(p_account uuid, p_id uuid, p_channel text, p_title text, p_body text, p_consent boolean) FROM PUBLIC;


--

-- Name: FUNCTION testing_report_v2_submit(p_account uuid, p_report jsonb); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.testing_report_v2_submit(p_account uuid, p_report jsonb) FROM PUBLIC;


--

-- Name: FUNCTION testing_system_valid(p jsonb); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.testing_system_valid(p jsonb) FROM PUBLIC;


--

-- Name: FUNCTION testing_telemetry_valid(p jsonb); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.testing_telemetry_valid(p jsonb) FROM PUBLIC;


--

-- Name: FUNCTION apply_clerk_user_event(p_event_id text, p_payload_hash text, p_issuer text, p_subject text, p_event_type text, p_event_at timestamp with time zone, p_verified_email text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.apply_clerk_user_event(p_event_id text, p_payload_hash text, p_issuer text, p_subject text, p_event_type text, p_event_at timestamp with time zone, p_verified_email text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_clerk_user_event(p_event_id text, p_payload_hash text, p_issuer text, p_subject text, p_event_type text, p_event_at timestamp with time zone, p_verified_email text) TO service_role;


--

-- Name: FUNCTION billing_admit_lifetime_order(p_user_id uuid, p_environment text, p_checkout_key text, p_order_id text, p_product_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_admit_lifetime_order(p_user_id uuid, p_environment text, p_checkout_key text, p_order_id text, p_product_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_admit_lifetime_order(p_user_id uuid, p_environment text, p_checkout_key text, p_order_id text, p_product_id text) TO service_role;


--

-- Name: FUNCTION billing_apply_reconciliation_plan(p_user_id uuid, p_environment text, p_trigger_kind text, p_snapshot_hash text, p_plan_hash text, p_observed_at timestamp with time zone, p_operations jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_apply_reconciliation_plan(p_user_id uuid, p_environment text, p_trigger_kind text, p_snapshot_hash text, p_plan_hash text, p_observed_at timestamp with time zone, p_operations jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_apply_reconciliation_plan(p_user_id uuid, p_environment text, p_trigger_kind text, p_snapshot_hash text, p_plan_hash text, p_observed_at timestamp with time zone, p_operations jsonb) TO service_role;


--

-- Name: FUNCTION billing_apply_resource_snapshot(p_provider text, p_environment text, p_resource_type text, p_resource_id text, p_user_id uuid, p_modified_at timestamp with time zone, p_snapshot_hash text, p_state text, p_grants jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_apply_resource_snapshot(p_provider text, p_environment text, p_resource_type text, p_resource_id text, p_user_id uuid, p_modified_at timestamp with time zone, p_snapshot_hash text, p_state text, p_grants jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_apply_resource_snapshot(p_provider text, p_environment text, p_resource_type text, p_resource_id text, p_user_id uuid, p_modified_at timestamp with time zone, p_snapshot_hash text, p_state text, p_grants jsonb) TO service_role;


--

-- Name: FUNCTION billing_apply_subscription_lifecycle(p_user_id uuid, p_environment text, p_subscription_id text, p_product_id text, p_status text, p_period_start timestamp with time zone, p_remote_period_end timestamp with time zone, p_paid_through timestamp with time zone, p_cancel_at_period_end boolean, p_modified_at timestamp with time zone, p_snapshot_hash text, p_recovery_action text, p_failure_at timestamp with time zone, p_cycle_paid_through timestamp with time zone, p_evaluated_at timestamp with time zone, p_capabilities text[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_apply_subscription_lifecycle(p_user_id uuid, p_environment text, p_subscription_id text, p_product_id text, p_status text, p_period_start timestamp with time zone, p_remote_period_end timestamp with time zone, p_paid_through timestamp with time zone, p_cancel_at_period_end boolean, p_modified_at timestamp with time zone, p_snapshot_hash text, p_recovery_action text, p_failure_at timestamp with time zone, p_cycle_paid_through timestamp with time zone, p_evaluated_at timestamp with time zone, p_capabilities text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_apply_subscription_lifecycle(p_user_id uuid, p_environment text, p_subscription_id text, p_product_id text, p_status text, p_period_start timestamp with time zone, p_remote_period_end timestamp with time zone, p_paid_through timestamp with time zone, p_cancel_at_period_end boolean, p_modified_at timestamp with time zone, p_snapshot_hash text, p_recovery_action text, p_failure_at timestamp with time zone, p_cycle_paid_through timestamp with time zone, p_evaluated_at timestamp with time zone, p_capabilities text[]) TO service_role;


--

-- Name: FUNCTION billing_begin_checkout_request(p_user_id uuid, p_attempt_id uuid, p_product_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_begin_checkout_request(p_user_id uuid, p_attempt_id uuid, p_product_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_begin_checkout_request(p_user_id uuid, p_attempt_id uuid, p_product_id uuid) TO service_role;


--

-- Name: FUNCTION billing_checkout_incident(p_environment text, p_correlation text, p_code text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_checkout_incident(p_environment text, p_correlation text, p_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_checkout_incident(p_environment text, p_correlation text, p_code text) TO service_role;


--

-- Name: FUNCTION billing_checkout_maintenance(p_environment text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_checkout_maintenance(p_environment text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_checkout_maintenance(p_environment text) TO service_role;


--

-- Name: FUNCTION billing_checkout_owner_alerts(p_environment text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_checkout_owner_alerts(p_environment text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_checkout_owner_alerts(p_environment text) TO service_role;


--

-- Name: FUNCTION billing_claim_checkout_compensation(p_environment text, p_token uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_claim_checkout_compensation(p_environment text, p_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_claim_checkout_compensation(p_environment text, p_token uuid) TO service_role;


--

-- Name: FUNCTION billing_claim_webhook(p_inbox_id uuid, p_lease_token uuid, p_lease_seconds integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_claim_webhook(p_inbox_id uuid, p_lease_token uuid, p_lease_seconds integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_claim_webhook(p_inbox_id uuid, p_lease_token uuid, p_lease_seconds integer) TO service_role;


--

-- Name: FUNCTION billing_claim_webhook_effect(p_inbox_id uuid, p_effect_key text, p_lease_token uuid, p_lease_seconds integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_claim_webhook_effect(p_inbox_id uuid, p_effect_key text, p_lease_token uuid, p_lease_seconds integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_claim_webhook_effect(p_inbox_id uuid, p_effect_key text, p_lease_token uuid, p_lease_seconds integer) TO service_role;


--

-- Name: FUNCTION billing_complete_founders_transition(p_environment text, p_subscription_id text, p_revision timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_complete_founders_transition(p_environment text, p_subscription_id text, p_revision timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_complete_founders_transition(p_environment text, p_subscription_id text, p_revision timestamp with time zone) TO service_role;


--

-- Name: FUNCTION billing_complete_webhook(p_inbox_id uuid, p_lease_token uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_complete_webhook(p_inbox_id uuid, p_lease_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_complete_webhook(p_inbox_id uuid, p_lease_token uuid) TO service_role;


--

-- Name: FUNCTION billing_complete_webhook_effect(p_inbox_id uuid, p_effect_key text, p_lease_token uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_complete_webhook_effect(p_inbox_id uuid, p_effect_key text, p_lease_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_complete_webhook_effect(p_inbox_id uuid, p_effect_key text, p_lease_token uuid) TO service_role;


--

-- Name: FUNCTION billing_creator_renewal_authorized(p_environment text, p_subscription text, p_token uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_creator_renewal_authorized(p_environment text, p_subscription text, p_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_creator_renewal_authorized(p_environment text, p_subscription text, p_token uuid) TO service_role;


--

-- Name: FUNCTION billing_creator_renewal_finish(p_environment text, p_subscription text, p_token uuid, p_success boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_creator_renewal_finish(p_environment text, p_subscription text, p_token uuid, p_success boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_creator_renewal_finish(p_environment text, p_subscription text, p_token uuid, p_success boolean) TO service_role;


--

-- Name: FUNCTION billing_creator_renewal_prepare(p_environment text, p_user uuid, p_checkout text, p_subscription text, p_order text, p_product uuid, p_key text, p_initial_discount uuid, p_creator_savings integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_creator_renewal_prepare(p_environment text, p_user uuid, p_checkout text, p_subscription text, p_order text, p_product uuid, p_key text, p_initial_discount uuid, p_creator_savings integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_creator_renewal_prepare(p_environment text, p_user uuid, p_checkout text, p_subscription text, p_order text, p_product uuid, p_key text, p_initial_discount uuid, p_creator_savings integer) TO service_role;


--

-- Name: FUNCTION billing_creator_revocation(p_stage text, p_environment text, p_user uuid, p_subscription text, p_order text, p_reason text, p_token uuid, p_success boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_creator_revocation(p_stage text, p_environment text, p_user uuid, p_subscription text, p_order text, p_reason text, p_token uuid, p_success boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_creator_revocation(p_stage text, p_environment text, p_user uuid, p_subscription text, p_order text, p_reason text, p_token uuid, p_success boolean) TO service_role;


--

-- Name: FUNCTION billing_expire_published_checkout(p_environment text, p_user_id uuid, p_attempt_id uuid, p_checkout_id text, p_terminal boolean, p_provider_status text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_expire_published_checkout(p_environment text, p_user_id uuid, p_attempt_id uuid, p_checkout_id text, p_terminal boolean, p_provider_status text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_expire_published_checkout(p_environment text, p_user_id uuid, p_attempt_id uuid, p_checkout_id text, p_terminal boolean, p_provider_status text) TO service_role;


--

-- Name: FUNCTION billing_expire_subscription_grants(p_evaluated_at timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_expire_subscription_grants(p_evaluated_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_expire_subscription_grants(p_evaluated_at timestamp with time zone) TO service_role;


--

-- Name: FUNCTION billing_expire_unpublished_checkouts(p_environment text, p_evaluated_at timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_expire_unpublished_checkouts(p_environment text, p_evaluated_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_expire_unpublished_checkouts(p_environment text, p_evaluated_at timestamp with time zone) TO service_role;


--

-- Name: FUNCTION billing_fail_webhook(p_inbox_id uuid, p_lease_token uuid, p_error_code text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_fail_webhook(p_inbox_id uuid, p_lease_token uuid, p_error_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_fail_webhook(p_inbox_id uuid, p_lease_token uuid, p_error_code text) TO service_role;


--

-- Name: FUNCTION billing_fail_webhook_effect(p_inbox_id uuid, p_effect_key text, p_lease_token uuid, p_error_code text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_fail_webhook_effect(p_inbox_id uuid, p_effect_key text, p_lease_token uuid, p_error_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_fail_webhook_effect(p_inbox_id uuid, p_effect_key text, p_lease_token uuid, p_error_code text) TO service_role;


--

-- Name: FUNCTION billing_finish_checkout_compensation(p_environment text, p_order_id uuid, p_token uuid, p_outcome text, p_refund_id uuid, p_code text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_finish_checkout_compensation(p_environment text, p_order_id uuid, p_token uuid, p_outcome text, p_refund_id uuid, p_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_finish_checkout_compensation(p_environment text, p_order_id uuid, p_token uuid, p_outcome text, p_refund_id uuid, p_code text) TO service_role;


--

-- Name: FUNCTION billing_finish_checkout_owner_alert(p_environment text, p_order_id uuid, p_delivered boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_finish_checkout_owner_alert(p_environment text, p_order_id uuid, p_delivered boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_finish_checkout_owner_alert(p_environment text, p_order_id uuid, p_delivered boolean) TO service_role;


--

-- Name: FUNCTION billing_finish_operational_owner_alert(p_environment text, p_order_id uuid, p_kind text, p_delivered boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_finish_operational_owner_alert(p_environment text, p_order_id uuid, p_kind text, p_delivered boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_finish_operational_owner_alert(p_environment text, p_order_id uuid, p_kind text, p_delivered boolean) TO service_role;


--

-- Name: FUNCTION billing_founders_payment_allowed(p_environment text, p_paid_at timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_founders_payment_allowed(p_environment text, p_paid_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_founders_payment_allowed(p_environment text, p_paid_at timestamp with time zone) TO service_role;


--

-- Name: FUNCTION billing_founders_subscription_transitions(p_environment text, p_order_id text, p_user_id uuid, p_subscription_id text, p_revision timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_founders_subscription_transitions(p_environment text, p_order_id text, p_user_id uuid, p_subscription_id text, p_revision timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_founders_subscription_transitions(p_environment text, p_order_id text, p_user_id uuid, p_subscription_id text, p_revision timestamp with time zone) TO service_role;


--

-- Name: FUNCTION billing_launch_checkout(p_account uuid, p_environment text, p_product text, p_discount text, p_key text, p_now timestamp with time zone, p_attempt uuid, p_replaces uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_launch_checkout(p_account uuid, p_environment text, p_product text, p_discount text, p_key text, p_now timestamp with time zone, p_attempt uuid, p_replaces uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_launch_checkout(p_account uuid, p_environment text, p_product text, p_discount text, p_key text, p_now timestamp with time zone, p_attempt uuid, p_replaces uuid) TO service_role;


--

-- Name: FUNCTION billing_observability_snapshot(p_environment text, p_now timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_observability_snapshot(p_environment text, p_now timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_observability_snapshot(p_environment text, p_now timestamp with time zone) TO service_role;


--

-- Name: FUNCTION billing_observe_checkout_payment(p_environment text, p_order_id uuid, p_checkout_id uuid, p_organization_id uuid, p_product_id uuid, p_subscription_id uuid, p_net_amount bigint, p_currency text, p_capabilities text[], p_attempt_id uuid, p_dispatch_token uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_observe_checkout_payment(p_environment text, p_order_id uuid, p_checkout_id uuid, p_organization_id uuid, p_product_id uuid, p_subscription_id uuid, p_net_amount bigint, p_currency text, p_capabilities text[], p_attempt_id uuid, p_dispatch_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_observe_checkout_payment(p_environment text, p_order_id uuid, p_checkout_id uuid, p_organization_id uuid, p_product_id uuid, p_subscription_id uuid, p_net_amount bigint, p_currency text, p_capabilities text[], p_attempt_id uuid, p_dispatch_token uuid) TO service_role;


--

-- Name: FUNCTION billing_observe_checkout_session(p_environment text, p_checkout_id uuid, p_product_id uuid, p_status text, p_attempt_id uuid, p_dispatch_token uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_observe_checkout_session(p_environment text, p_checkout_id uuid, p_product_id uuid, p_status text, p_attempt_id uuid, p_dispatch_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_observe_checkout_session(p_environment text, p_checkout_id uuid, p_product_id uuid, p_status text, p_attempt_id uuid, p_dispatch_token uuid) TO service_role;


--

-- Name: FUNCTION billing_operational_owner_alerts(p_environment text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_operational_owner_alerts(p_environment text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_operational_owner_alerts(p_environment text) TO service_role;


--

-- Name: FUNCTION billing_owner_alert_claim(p_environment text, p_type text, p_id text, p_code text, p_lease uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_owner_alert_claim(p_environment text, p_type text, p_id text, p_code text, p_lease uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_owner_alert_claim(p_environment text, p_type text, p_id text, p_code text, p_lease uuid) TO service_role;


--

-- Name: FUNCTION billing_owner_alert_finish(p_environment text, p_type text, p_id text, p_lease uuid, p_sent boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_owner_alert_finish(p_environment text, p_type text, p_id text, p_lease uuid, p_sent boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_owner_alert_finish(p_environment text, p_type text, p_id text, p_lease uuid, p_sent boolean) TO service_role;


--

-- Name: FUNCTION billing_published_checkouts_to_expire(p_environment text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_published_checkouts_to_expire(p_environment text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_published_checkouts_to_expire(p_environment text) TO service_role;


--

-- Name: FUNCTION billing_purchase_policy(p_user_id uuid, p_environment text, p_checkout_key text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_purchase_policy(p_user_id uuid, p_environment text, p_checkout_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_purchase_policy(p_user_id uuid, p_environment text, p_checkout_key text) TO service_role;


--

-- Name: FUNCTION billing_purge_webhook_payloads(p_processed_before timestamp with time zone, p_quarantined_before timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_purge_webhook_payloads(p_processed_before timestamp with time zone, p_quarantined_before timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_purge_webhook_payloads(p_processed_before timestamp with time zone, p_quarantined_before timestamp with time zone) TO service_role;


--

-- Name: FUNCTION billing_quarantine_webhook(p_inbox_id uuid, p_lease_token uuid, p_reason_code text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_quarantine_webhook(p_inbox_id uuid, p_lease_token uuid, p_reason_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_quarantine_webhook(p_inbox_id uuid, p_lease_token uuid, p_reason_code text) TO service_role;


--

-- Name: FUNCTION billing_receive_webhook(p_provider text, p_provider_event_id text, p_event_type text, p_payload_hash text, p_payload jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_receive_webhook(p_provider text, p_provider_event_id text, p_event_type text, p_payload_hash text, p_payload jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_receive_webhook(p_provider text, p_provider_event_id text, p_event_type text, p_payload_hash text, p_payload jsonb) TO service_role;


--

-- Name: FUNCTION billing_receive_webhook(p_provider text, p_environment text, p_provider_event_id text, p_event_type text, p_payload_hash text, p_payload jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_receive_webhook(p_provider text, p_environment text, p_provider_event_id text, p_event_type text, p_payload_hash text, p_payload jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_receive_webhook(p_provider text, p_environment text, p_provider_event_id text, p_event_type text, p_payload_hash text, p_payload jsonb) TO service_role;


--

-- Name: FUNCTION billing_reconciliation_item_failed(p_environment text, p_resource text, p_item_key text, p_resource_id text, p_now timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_reconciliation_item_failed(p_environment text, p_resource text, p_item_key text, p_resource_id text, p_now timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_reconciliation_item_failed(p_environment text, p_resource text, p_item_key text, p_resource_id text, p_now timestamp with time zone) TO service_role;


--

-- Name: FUNCTION billing_record_dispute_snapshot(p_environment text, p_dispute_id text, p_order_id text, p_blocked boolean, p_modified_at timestamp with time zone, p_snapshot_hash text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_record_dispute_snapshot(p_environment text, p_dispute_id text, p_order_id text, p_blocked boolean, p_modified_at timestamp with time zone, p_snapshot_hash text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_record_dispute_snapshot(p_environment text, p_dispute_id text, p_order_id text, p_blocked boolean, p_modified_at timestamp with time zone, p_snapshot_hash text) TO service_role;


--

-- Name: FUNCTION billing_record_order_snapshot(p_environment text, p_order_id text, p_user_id uuid, p_product_id text, p_checkout_id text, p_status text, p_paid boolean, p_net_amount bigint, p_currency text, p_reported_refunded_amount bigint, p_modified_at timestamp with time zone, p_snapshot_hash text, p_subscription_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_record_order_snapshot(p_environment text, p_order_id text, p_user_id uuid, p_product_id text, p_checkout_id text, p_status text, p_paid boolean, p_net_amount bigint, p_currency text, p_reported_refunded_amount bigint, p_modified_at timestamp with time zone, p_snapshot_hash text, p_subscription_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_record_order_snapshot(p_environment text, p_order_id text, p_user_id uuid, p_product_id text, p_checkout_id text, p_status text, p_paid boolean, p_net_amount bigint, p_currency text, p_reported_refunded_amount bigint, p_modified_at timestamp with time zone, p_snapshot_hash text, p_subscription_id text) TO service_role;


--

-- Name: FUNCTION billing_record_refund_snapshot(p_environment text, p_refund_id text, p_order_id text, p_payment_id text, p_status text, p_amount bigint, p_currency text, p_modified_at timestamp with time zone, p_snapshot_hash text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_record_refund_snapshot(p_environment text, p_refund_id text, p_order_id text, p_payment_id text, p_status text, p_amount bigint, p_currency text, p_modified_at timestamp with time zone, p_snapshot_hash text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_record_refund_snapshot(p_environment text, p_refund_id text, p_order_id text, p_payment_id text, p_status text, p_amount bigint, p_currency text, p_modified_at timestamp with time zone, p_snapshot_hash text) TO service_role;


--

-- Name: FUNCTION billing_refresh_entitlement_read_model(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_refresh_entitlement_read_model(p_user_id uuid) FROM PUBLIC;


--

-- Name: FUNCTION billing_refresh_entitlement_read_model_at(p_user_id uuid, p_evaluated_at timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_refresh_entitlement_read_model_at(p_user_id uuid, p_evaluated_at timestamp with time zone) FROM PUBLIC;


--

-- Name: FUNCTION billing_reject_checkout_request(p_user_id uuid, p_attempt_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_reject_checkout_request(p_user_id uuid, p_attempt_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_reject_checkout_request(p_user_id uuid, p_attempt_id uuid) TO service_role;


--

-- Name: FUNCTION billing_replay_webhook(p_inbox_id uuid, p_actor_id text, p_reason_code text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_replay_webhook(p_inbox_id uuid, p_actor_id text, p_reason_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_replay_webhook(p_inbox_id uuid, p_actor_id text, p_reason_code text) TO service_role;


--

-- Name: FUNCTION billing_resolve_checkout_non_applicable(p_environment text, p_order_id uuid, p_reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_resolve_checkout_non_applicable(p_environment text, p_order_id uuid, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_resolve_checkout_non_applicable(p_environment text, p_order_id uuid, p_reason text) TO service_role;


--

-- Name: FUNCTION billing_save_creator_attribution(p_user uuid, p_environment text, p_attempt uuid, p_code text, p_discount uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_save_creator_attribution(p_user uuid, p_environment text, p_attempt uuid, p_code text, p_discount uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_save_creator_attribution(p_user uuid, p_environment text, p_attempt uuid, p_code text, p_discount uuid) TO service_role;


--

-- Name: FUNCTION billing_set_report_renewal_candidate(p_environment text, p_user uuid, p_subscription text, p_discount uuid, p_savings integer, p_valid_until timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_set_report_renewal_candidate(p_environment text, p_user uuid, p_subscription text, p_discount uuid, p_savings integer, p_valid_until timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_set_report_renewal_candidate(p_environment text, p_user uuid, p_subscription text, p_discount uuid, p_savings integer, p_valid_until timestamp with time zone) TO service_role;


--

-- Name: FUNCTION billing_sync_order_access(p_environment text, p_order_id text, p_capabilities jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.billing_sync_order_access(p_environment text, p_order_id text, p_capabilities jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_sync_order_access(p_environment text, p_order_id text, p_capabilities jsonb) TO service_role;


--

-- Name: FUNCTION claim_active_device(device_fingerprint text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.claim_active_device(device_fingerprint text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_active_device(device_fingerprint text) TO authenticated;


--

-- Name: FUNCTION claim_billing_checkout_attempt(p_user_id uuid, p_attempt_id uuid, p_checkout_key text, p_environment text, p_catalog_version text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.claim_billing_checkout_attempt(p_user_id uuid, p_attempt_id uuid, p_checkout_key text, p_environment text, p_catalog_version text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_billing_checkout_attempt(p_user_id uuid, p_attempt_id uuid, p_checkout_key text, p_environment text, p_catalog_version text) TO service_role;


--

-- Name: FUNCTION claim_billing_creator_checkout_attempt(p_user_id uuid, p_attempt_id uuid, p_checkout_key text, p_environment text, p_catalog_version text, p_creator_code text, p_creator_discount uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.claim_billing_creator_checkout_attempt(p_user_id uuid, p_attempt_id uuid, p_checkout_key text, p_environment text, p_catalog_version text, p_creator_code text, p_creator_discount uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_billing_creator_checkout_attempt(p_user_id uuid, p_attempt_id uuid, p_checkout_key text, p_environment text, p_catalog_version text, p_creator_code text, p_creator_discount uuid) TO service_role;


--

-- Name: FUNCTION claim_billing_reconciliation(p_environment text, p_lease_token uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.claim_billing_reconciliation(p_environment text, p_lease_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_billing_reconciliation(p_environment text, p_lease_token uuid) TO service_role;


--

-- Name: FUNCTION clerk_bootstrap_account(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.clerk_bootstrap_account() FROM PUBLIC;
GRANT ALL ON FUNCTION public.clerk_bootstrap_account() TO authenticated;


--

-- Name: FUNCTION clerk_deletion_completed(p_issuer text, p_subject text, p_bucket text, p_names text[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.clerk_deletion_completed(p_issuer text, p_subject text, p_bucket text, p_names text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.clerk_deletion_completed(p_issuer text, p_subject text, p_bucket text, p_names text[]) TO service_role;


--

-- Name: FUNCTION clerk_deletion_objects(p_issuer text, p_subject text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.clerk_deletion_objects(p_issuer text, p_subject text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.clerk_deletion_objects(p_issuer text, p_subject text) TO service_role;


--

-- Name: FUNCTION clerk_deletion_upload_completed(p_issuer text, p_subject text, p_upload_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.clerk_deletion_upload_completed(p_issuer text, p_subject text, p_upload_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.clerk_deletion_upload_completed(p_issuer text, p_subject text, p_upload_id text) TO service_role;


--

-- Name: FUNCTION clerk_deletion_uploads(p_issuer text, p_subject text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.clerk_deletion_uploads(p_issuer text, p_subject text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.clerk_deletion_uploads(p_issuer text, p_subject text) TO service_role;


--

-- Name: FUNCTION complete_billing_checkout_attempt(p_user_id uuid, p_attempt_id uuid, p_provider_checkout_id text, p_checkout_url text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.complete_billing_checkout_attempt(p_user_id uuid, p_attempt_id uuid, p_provider_checkout_id text, p_checkout_url text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.complete_billing_checkout_attempt(p_user_id uuid, p_attempt_id uuid, p_provider_checkout_id text, p_checkout_url text) TO service_role;


--

-- Name: FUNCTION complete_billing_reconciliation(p_environment text, p_lease_token uuid, p_next_resource text, p_next_page integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.complete_billing_reconciliation(p_environment text, p_lease_token uuid, p_next_resource text, p_next_page integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.complete_billing_reconciliation(p_environment text, p_lease_token uuid, p_next_resource text, p_next_page integer) TO service_role;


--

-- Name: FUNCTION digest(data bytea, algorithm text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.digest(data bytea, algorithm text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.digest(data bytea, algorithm text) TO anon;
GRANT ALL ON FUNCTION public.digest(data bytea, algorithm text) TO authenticated;
GRANT ALL ON FUNCTION public.digest(data bytea, algorithm text) TO service_role;


--

-- Name: FUNCTION digest(data text, algorithm text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.digest(data text, algorithm text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.digest(data text, algorithm text) TO anon;
GRANT ALL ON FUNCTION public.digest(data text, algorithm text) TO authenticated;
GRANT ALL ON FUNCTION public.digest(data text, algorithm text) TO service_role;


--

-- Name: FUNCTION founders_sale_window(p_environment text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.founders_sale_window(p_environment text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.founders_sale_window(p_environment text) TO anon;
GRANT ALL ON FUNCTION public.founders_sale_window(p_environment text) TO authenticated;
GRANT ALL ON FUNCTION public.founders_sale_window(p_environment text) TO service_role;


--

-- Name: FUNCTION gen_random_uuid(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.gen_random_uuid() FROM PUBLIC;


--

-- Name: FUNCTION get_account_entitlements(device_fingerprint text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_account_entitlements(device_fingerprint text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_account_entitlements(device_fingerprint text) TO authenticated;


--

-- Name: FUNCTION handle_updated_at(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.handle_updated_at() FROM PUBLIC;
GRANT ALL ON FUNCTION public.handle_updated_at() TO anon;
GRANT ALL ON FUNCTION public.handle_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.handle_updated_at() TO service_role;


--

-- Name: FUNCTION install_report_creator_bridge(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.install_report_creator_bridge() FROM PUBLIC;
GRANT ALL ON FUNCTION public.install_report_creator_bridge() TO service_role;


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

-- Name: FUNCTION mark_billing_checkout_attempt_uncertain(p_user_id uuid, p_attempt_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mark_billing_checkout_attempt_uncertain(p_user_id uuid, p_attempt_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mark_billing_checkout_attempt_uncertain(p_user_id uuid, p_attempt_id uuid) TO service_role;


--

-- Name: FUNCTION native_admin_begin(p_actor uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.native_admin_begin(p_actor uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.native_admin_begin(p_actor uuid) TO service_role;


--

-- Name: FUNCTION native_admin_claim_change(p_actor uuid, p_request uuid, p_account uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.native_admin_claim_change(p_actor uuid, p_request uuid, p_account uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.native_admin_claim_change(p_actor uuid, p_request uuid, p_account uuid) TO service_role;


--

-- Name: FUNCTION native_admin_claim_mail_erasure(p_request uuid, p_effect uuid, p_actor uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.native_admin_claim_mail_erasure(p_request uuid, p_effect uuid, p_actor uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.native_admin_claim_mail_erasure(p_request uuid, p_effect uuid, p_actor uuid) TO service_role;


--

-- Name: FUNCTION native_admin_claim_mail_send(p_actor uuid, p_request uuid, p_effect uuid, p_campaign uuid, p_revision integer, p_environment text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.native_admin_claim_mail_send(p_actor uuid, p_request uuid, p_effect uuid, p_campaign uuid, p_revision integer, p_environment text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.native_admin_claim_mail_send(p_actor uuid, p_request uuid, p_effect uuid, p_campaign uuid, p_revision integer, p_environment text) TO service_role;


--

-- Name: FUNCTION native_admin_execute(p_actor uuid, p_issuer text, p_action text, p_params jsonb, p_environment text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.native_admin_execute(p_actor uuid, p_issuer text, p_action text, p_params jsonb, p_environment text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.native_admin_execute(p_actor uuid, p_issuer text, p_action text, p_params jsonb, p_environment text) TO service_role;


--

-- Name: FUNCTION native_admin_finish_change(p_actor uuid, p_issuer text, p_params jsonb, p_environment text, p_request uuid, p_token uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.native_admin_finish_change(p_actor uuid, p_issuer text, p_params jsonb, p_environment text, p_request uuid, p_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.native_admin_finish_change(p_actor uuid, p_issuer text, p_params jsonb, p_environment text, p_request uuid, p_token uuid) TO service_role;


--

-- Name: FUNCTION native_admin_gate(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.native_admin_gate() FROM PUBLIC;
GRANT ALL ON FUNCTION public.native_admin_gate() TO service_role;


--

-- Name: FUNCTION native_admin_preflight(p_issuer text, p_subject text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.native_admin_preflight(p_issuer text, p_subject text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.native_admin_preflight(p_issuer text, p_subject text) TO service_role;


--

-- Name: FUNCTION native_admin_reconcile_effect(p_reviewer uuid, p_effect uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.native_admin_reconcile_effect(p_reviewer uuid, p_effect uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.native_admin_reconcile_effect(p_reviewer uuid, p_effect uuid) TO service_role;


--

-- Name: FUNCTION native_admin_record_effect(p_actor uuid, p_event jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.native_admin_record_effect(p_actor uuid, p_event jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.native_admin_record_effect(p_actor uuid, p_event jsonb) TO service_role;


--

-- Name: FUNCTION native_admin_record_mail_erasure(p_job uuid, p_lease uuid, p_request uuid, p_effect uuid, p_outcome text, p_provider_status integer, p_actor uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.native_admin_record_mail_erasure(p_job uuid, p_lease uuid, p_request uuid, p_effect uuid, p_outcome text, p_provider_status integer, p_actor uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.native_admin_record_mail_erasure(p_job uuid, p_lease uuid, p_request uuid, p_effect uuid, p_outcome text, p_provider_status integer, p_actor uuid) TO service_role;


--

-- Name: FUNCTION native_admin_record_mail_send(p_actor uuid, p_request uuid, p_effect uuid, p_delivery uuid, p_environment text, p_outcome text, p_provider_status integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.native_admin_record_mail_send(p_actor uuid, p_request uuid, p_effect uuid, p_delivery uuid, p_environment text, p_outcome text, p_provider_status integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.native_admin_record_mail_send(p_actor uuid, p_request uuid, p_effect uuid, p_delivery uuid, p_environment text, p_outcome text, p_provider_status integer) TO service_role;


--

-- Name: FUNCTION native_admin_record_mail_sync(p_actor uuid, p_request uuid, p_effect uuid, p_kind text, p_contact uuid, p_lease uuid, p_outcome text, p_provider_status integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.native_admin_record_mail_sync(p_actor uuid, p_request uuid, p_effect uuid, p_kind text, p_contact uuid, p_lease uuid, p_outcome text, p_provider_status integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.native_admin_record_mail_sync(p_actor uuid, p_request uuid, p_effect uuid, p_kind text, p_contact uuid, p_lease uuid, p_outcome text, p_provider_status integer) TO service_role;


--

-- Name: FUNCTION native_admin_record_payment(p_environment text, p_payment jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.native_admin_record_payment(p_environment text, p_payment jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.native_admin_record_payment(p_environment text, p_payment jsonb) TO service_role;


--

-- Name: FUNCTION native_admin_record_refund(p_environment text, p_refund jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.native_admin_record_refund(p_environment text, p_refund jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.native_admin_record_refund(p_environment text, p_refund jsonb) TO service_role;


--

-- Name: FUNCTION native_admin_release_change(p_actor uuid, p_request uuid, p_account uuid, p_token uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.native_admin_release_change(p_actor uuid, p_request uuid, p_account uuid, p_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.native_admin_release_change(p_actor uuid, p_request uuid, p_account uuid, p_token uuid) TO service_role;


--

-- Name: FUNCTION native_claim_license_device(issuer text, subject text, device_fingerprint text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.native_claim_license_device(issuer text, subject text, device_fingerprint text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.native_claim_license_device(issuer text, subject text, device_fingerprint text) TO service_role;


--

-- Name: FUNCTION native_resolve_account(issuer text, subject text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.native_resolve_account(issuer text, subject text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.native_resolve_account(issuer text, subject text) TO service_role;


--

-- Name: FUNCTION operational_access_preview(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.operational_access_preview(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.operational_access_preview(p_user_id uuid) TO service_role;


--

-- Name: FUNCTION operational_access_reject_audit_mutation(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.operational_access_reject_audit_mutation() FROM PUBLIC;


--

-- Name: FUNCTION operational_access_set(p_user_id uuid, p_role text, p_action text, p_actor_ref text, p_reason text, p_correlation_id text, p_expires_at timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.operational_access_set(p_user_id uuid, p_role text, p_action text, p_actor_ref text, p_reason text, p_correlation_id text, p_expires_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.operational_access_set(p_user_id uuid, p_role text, p_action text, p_actor_ref text, p_reason text, p_correlation_id text, p_expires_at timestamp with time zone) TO service_role;


--

-- Name: FUNCTION operational_legacy_grant_preview(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.operational_legacy_grant_preview(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.operational_legacy_grant_preview(p_user_id uuid) TO service_role;


--

-- Name: FUNCTION operational_legacy_grant_retire(p_user_id uuid, p_actor_ref text, p_reason text, p_correlation_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.operational_legacy_grant_retire(p_user_id uuid, p_actor_ref text, p_reason text, p_correlation_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.operational_legacy_grant_retire(p_user_id uuid, p_actor_ref text, p_reason text, p_correlation_id text) TO service_role;


--

-- Name: FUNCTION pilot_profile_load(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pilot_profile_load() FROM PUBLIC;
GRANT ALL ON FUNCTION public.pilot_profile_load() TO authenticated;


--

-- Name: FUNCTION pilot_profile_save(p_profile jsonb, p_photo_hash text, p_expected_revision bigint, p_op_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pilot_profile_save(p_profile jsonb, p_photo_hash text, p_expected_revision bigint, p_op_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.pilot_profile_save(p_profile jsonb, p_photo_hash text, p_expected_revision bigint, p_op_id uuid) TO authenticated;


--

-- Name: FUNCTION pilot_profile_valid(document jsonb, photo_hash text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pilot_profile_valid(document jsonb, photo_hash text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.pilot_profile_valid(document jsonb, photo_hash text) TO authenticated;
GRANT ALL ON FUNCTION public.pilot_profile_valid(document jsonb, photo_hash text) TO pilot_profile_writer;


--

-- Name: FUNCTION race_schedule_current(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.race_schedule_current() FROM PUBLIC;
GRANT ALL ON FUNCTION public.race_schedule_current() TO authenticated;
GRANT ALL ON FUNCTION public.race_schedule_current() TO anon;
GRANT ALL ON FUNCTION public.race_schedule_current() TO service_role;


--

-- Name: FUNCTION race_schedule_draft_save(p_source_text text, p_schedule jsonb, p_valid_from timestamp with time zone, p_series_count integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.race_schedule_draft_save(p_source_text text, p_schedule jsonb, p_valid_from timestamp with time zone, p_series_count integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.race_schedule_draft_save(p_source_text text, p_schedule jsonb, p_valid_from timestamp with time zone, p_series_count integer) TO service_role;


--

-- Name: FUNCTION race_schedule_my_draft(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.race_schedule_my_draft() FROM PUBLIC;
GRANT ALL ON FUNCTION public.race_schedule_my_draft() TO service_role;


--

-- Name: FUNCTION race_schedule_publish(p_draft_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.race_schedule_publish(p_draft_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.race_schedule_publish(p_draft_id uuid) TO service_role;


--

-- Name: FUNCTION read_account_entitlements(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.read_account_entitlements() FROM PUBLIC;
GRANT ALL ON FUNCTION public.read_account_entitlements() TO authenticated;


--

-- Name: FUNCTION release_billing_reconciliation(p_environment text, p_lease_token uuid, p_failed boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.release_billing_reconciliation(p_environment text, p_lease_token uuid, p_failed boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.release_billing_reconciliation(p_environment text, p_lease_token uuid, p_failed boolean) TO service_role;


--

-- Name: FUNCTION report_promotion_accounts(p_environment text, p_after uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.report_promotion_accounts(p_environment text, p_after uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.report_promotion_accounts(p_environment text, p_after uuid) TO service_role;


--

-- Name: FUNCTION report_promotion_ack(p_id uuid, p_token uuid, p_now timestamp with time zone, p_observed_discount text, p_cleanup_reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.report_promotion_ack(p_id uuid, p_token uuid, p_now timestamp with time zone, p_observed_discount text, p_cleanup_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.report_promotion_ack(p_id uuid, p_token uuid, p_now timestamp with time zone, p_observed_discount text, p_cleanup_reason text) TO service_role;


--

-- Name: FUNCTION report_promotion_ack_before_1661(p_id uuid, p_token uuid, p_now timestamp with time zone, p_observed_discount text, p_cleanup_reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.report_promotion_ack_before_1661(p_id uuid, p_token uuid, p_now timestamp with time zone, p_observed_discount text, p_cleanup_reason text) FROM PUBLIC;


--

-- Name: FUNCTION report_promotion_checkout_pending(p_account uuid, p_environment text, p_now timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.report_promotion_checkout_pending(p_account uuid, p_environment text, p_now timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.report_promotion_checkout_pending(p_account uuid, p_environment text, p_now timestamp with time zone) TO service_role;


--

-- Name: FUNCTION report_promotion_claim(p_id uuid, p_token uuid, p_now timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.report_promotion_claim(p_id uuid, p_token uuid, p_now timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.report_promotion_claim(p_id uuid, p_token uuid, p_now timestamp with time zone) TO service_role;


--

-- Name: FUNCTION report_promotion_claim_before_1661(p_id uuid, p_token uuid, p_now timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.report_promotion_claim_before_1661(p_id uuid, p_token uuid, p_now timestamp with time zone) FROM PUBLIC;


--

-- Name: FUNCTION report_promotion_cleared(p_id uuid, p_token uuid, p_now timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.report_promotion_cleared(p_id uuid, p_token uuid, p_now timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.report_promotion_cleared(p_id uuid, p_token uuid, p_now timestamp with time zone) TO service_role;


--

-- Name: FUNCTION report_promotion_failed(p_account uuid, p_environment text, p_code text, p_now timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.report_promotion_failed(p_account uuid, p_environment text, p_code text, p_now timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.report_promotion_failed(p_account uuid, p_environment text, p_code text, p_now timestamp with time zone) TO service_role;


--

-- Name: FUNCTION report_promotion_invoice(p_environment text, p_order text, p_discount text, p_amount integer, p_billed timestamp with time zone, p_start timestamp with time zone, p_end timestamp with time zone, p_initial boolean, p_source text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.report_promotion_invoice(p_environment text, p_order text, p_discount text, p_amount integer, p_billed timestamp with time zone, p_start timestamp with time zone, p_end timestamp with time zone, p_initial boolean, p_source text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.report_promotion_invoice(p_environment text, p_order text, p_discount text, p_amount integer, p_billed timestamp with time zone, p_start timestamp with time zone, p_end timestamp with time zone, p_initial boolean, p_source text) TO service_role;


--

-- Name: FUNCTION report_promotion_invoice_missing(p_environment text, p_order text, p_now timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.report_promotion_invoice_missing(p_environment text, p_order text, p_now timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.report_promotion_invoice_missing(p_environment text, p_order text, p_now timestamp with time zone) TO service_role;


--

-- Name: FUNCTION report_promotion_observe(p_account uuid, p_environment text, p_subscription text, p_product text, p_started timestamp with time zone, p_modified timestamp with time zone, p_discount text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.report_promotion_observe(p_account uuid, p_environment text, p_subscription text, p_product text, p_started timestamp with time zone, p_modified timestamp with time zone, p_discount text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.report_promotion_observe(p_account uuid, p_environment text, p_subscription text, p_product text, p_started timestamp with time zone, p_modified timestamp with time zone, p_discount text) TO service_role;


--

-- Name: FUNCTION report_promotion_period(p_account uuid, p_environment text, p_subscription text, p_end timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.report_promotion_period(p_account uuid, p_environment text, p_subscription text, p_end timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.report_promotion_period(p_account uuid, p_environment text, p_subscription text, p_end timestamp with time zone) TO service_role;


--

-- Name: FUNCTION report_promotion_prepare(p_account uuid, p_environment text, p_now timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.report_promotion_prepare(p_account uuid, p_environment text, p_now timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.report_promotion_prepare(p_account uuid, p_environment text, p_now timestamp with time zone) TO service_role;


--

-- Name: FUNCTION report_promotion_renewal_failed(p_id uuid, p_token uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.report_promotion_renewal_failed(p_id uuid, p_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.report_promotion_renewal_failed(p_id uuid, p_token uuid) TO service_role;


--

-- Name: FUNCTION report_promotion_renewal_prepare(p_id uuid, p_creator_savings integer, p_creator_months integer, p_now timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.report_promotion_renewal_prepare(p_id uuid, p_creator_savings integer, p_creator_months integer, p_now timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.report_promotion_renewal_prepare(p_id uuid, p_creator_savings integer, p_creator_months integer, p_now timestamp with time zone) TO service_role;


--

-- Name: FUNCTION reset_active_device(device_fingerprint text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reset_active_device(device_fingerprint text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reset_active_device(device_fingerprint text) TO authenticated;


--

-- Name: FUNCTION testing_answer_save(p_id uuid, p_score smallint, p_note text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_answer_save(p_id uuid, p_score smallint, p_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.testing_answer_save(p_id uuid, p_score smallint, p_note text) TO authenticated;


--

-- Name: FUNCTION testing_center_agent_job_key(p_technical_issue_id text, p_report_digest text, p_nightly_base_sha text, p_policy_version text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_center_agent_job_key(p_technical_issue_id text, p_report_digest text, p_nightly_base_sha text, p_policy_version text) FROM PUBLIC;


--

-- Name: FUNCTION testing_center_agent_transition_allowed(p_from text, p_to text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_center_agent_transition_allowed(p_from text, p_to text) FROM PUBLIC;


--

-- Name: FUNCTION testing_center_assert_github_effect_unpaused(p_effect_id text, p_lease_token uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_center_assert_github_effect_unpaused(p_effect_id text, p_lease_token uuid) FROM PUBLIC;


--

-- Name: FUNCTION testing_center_assert_linear_dispatch(p_effect_id text, p_worker_id text, p_fencing_token bigint, p_source_digest text, p_projection jsonb, p_canonical_projection text, p_projection_digest text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_center_assert_linear_dispatch(p_effect_id text, p_worker_id text, p_fencing_token bigint, p_source_digest text, p_projection jsonb, p_canonical_projection text, p_projection_digest text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.testing_center_assert_linear_dispatch(p_effect_id text, p_worker_id text, p_fencing_token bigint, p_source_digest text, p_projection jsonb, p_canonical_projection text, p_projection_digest text) TO service_role;


--

-- Name: FUNCTION testing_center_authorize_codex_dispatch(p_technical_issue_id text, p_worker_id text, p_fencing_token bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_center_authorize_codex_dispatch(p_technical_issue_id text, p_worker_id text, p_fencing_token bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.testing_center_authorize_codex_dispatch(p_technical_issue_id text, p_worker_id text, p_fencing_token bigint) TO service_role;


--

-- Name: FUNCTION testing_center_bind_linear_issue(p_effect_id text, p_external_issue_id uuid, p_organization_id uuid, p_bound_by_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_center_bind_linear_issue(p_effect_id text, p_external_issue_id uuid, p_organization_id uuid, p_bound_by_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.testing_center_bind_linear_issue(p_effect_id text, p_external_issue_id uuid, p_organization_id uuid, p_bound_by_id text) TO service_role;


--

-- Name: FUNCTION testing_center_can_view_channel(p_channel text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_center_can_view_channel(p_channel text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.testing_center_can_view_channel(p_channel text) TO authenticated;


--

-- Name: FUNCTION testing_center_claim_agent_effect(p_worker_id text, p_lease_seconds integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_center_claim_agent_effect(p_worker_id text, p_lease_seconds integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.testing_center_claim_agent_effect(p_worker_id text, p_lease_seconds integer) TO service_role;


--

-- Name: FUNCTION testing_center_claim_codex_dry_run(p_technical_issue_id text, p_worker_id text, p_lease_seconds integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_center_claim_codex_dry_run(p_technical_issue_id text, p_worker_id text, p_lease_seconds integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.testing_center_claim_codex_dry_run(p_technical_issue_id text, p_worker_id text, p_lease_seconds integer) TO service_role;


--

-- Name: FUNCTION testing_center_claim_github_effect(p_effect_id text, p_lease_token uuid, p_lease_seconds integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_center_claim_github_effect(p_effect_id text, p_lease_token uuid, p_lease_seconds integer) FROM PUBLIC;


--

-- Name: FUNCTION testing_center_claim_linear_effect(p_effect_id text, p_worker_id text, p_lease_seconds integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_center_claim_linear_effect(p_effect_id text, p_worker_id text, p_lease_seconds integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.testing_center_claim_linear_effect(p_effect_id text, p_worker_id text, p_lease_seconds integer) TO service_role;


--

-- Name: FUNCTION testing_center_complete_agent_effect(p_effect_id text, p_worker_id text, p_fencing_token bigint, p_outcome text, p_outcome_digest text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_center_complete_agent_effect(p_effect_id text, p_worker_id text, p_fencing_token bigint, p_outcome text, p_outcome_digest text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.testing_center_complete_agent_effect(p_effect_id text, p_worker_id text, p_fencing_token bigint, p_outcome text, p_outcome_digest text) TO service_role;


--

-- Name: FUNCTION testing_center_complete_github_effect(p_effect_id text, p_lease_token uuid, p_issue_number bigint, p_issue_node_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_center_complete_github_effect(p_effect_id text, p_lease_token uuid, p_issue_number bigint, p_issue_node_id text) FROM PUBLIC;


--

-- Name: FUNCTION testing_center_complete_linear_dry_run(p_effect_id text, p_worker_id text, p_fencing_token bigint, p_source_digest text, p_projection jsonb, p_canonical_projection text, p_projection_digest text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_center_complete_linear_dry_run(p_effect_id text, p_worker_id text, p_fencing_token bigint, p_source_digest text, p_projection jsonb, p_canonical_projection text, p_projection_digest text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.testing_center_complete_linear_dry_run(p_effect_id text, p_worker_id text, p_fencing_token bigint, p_source_digest text, p_projection jsonb, p_canonical_projection text, p_projection_digest text) TO service_role;


--

-- Name: FUNCTION testing_center_complete_linear_pilot(p_effect_id text, p_worker_id text, p_fencing_token bigint, p_projection_digest text, p_external_issue_id uuid, p_organization_id uuid, p_external_identifier text, p_external_url text, p_bound_by_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_center_complete_linear_pilot(p_effect_id text, p_worker_id text, p_fencing_token bigint, p_projection_digest text, p_external_issue_id uuid, p_organization_id uuid, p_external_identifier text, p_external_url text, p_bound_by_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.testing_center_complete_linear_pilot(p_effect_id text, p_worker_id text, p_fencing_token bigint, p_projection_digest text, p_external_issue_id uuid, p_organization_id uuid, p_external_identifier text, p_external_url text, p_bound_by_id text) TO service_role;


--

-- Name: FUNCTION testing_center_current_role(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_center_current_role() FROM PUBLIC;
GRANT ALL ON FUNCTION public.testing_center_current_role() TO authenticated;


--

-- Name: FUNCTION testing_center_enforce_selected_effect(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_center_enforce_selected_effect() FROM PUBLIC;


--

-- Name: FUNCTION testing_center_expire_reserved_agent_effect(p_effect_id text, p_now timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_center_expire_reserved_agent_effect(p_effect_id text, p_now timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.testing_center_expire_reserved_agent_effect(p_effect_id text, p_now timestamp with time zone) TO service_role;


--

-- Name: FUNCTION testing_center_fail_codex_before_dispatch(p_technical_issue_id text, p_worker_id text, p_fencing_token bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_center_fail_codex_before_dispatch(p_technical_issue_id text, p_worker_id text, p_fencing_token bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.testing_center_fail_codex_before_dispatch(p_technical_issue_id text, p_worker_id text, p_fencing_token bigint) TO service_role;


--

-- Name: FUNCTION testing_center_fail_github_effect(p_effect_id text, p_lease_token uuid, p_error_code text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_center_fail_github_effect(p_effect_id text, p_lease_token uuid, p_error_code text) FROM PUBLIC;


--

-- Name: FUNCTION testing_center_fail_linear_effect(p_effect_id text, p_worker_id text, p_fencing_token bigint, p_error_code text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_center_fail_linear_effect(p_effect_id text, p_worker_id text, p_fencing_token bigint, p_error_code text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.testing_center_fail_linear_effect(p_effect_id text, p_worker_id text, p_fencing_token bigint, p_error_code text) TO service_role;


--

-- Name: FUNCTION testing_center_get_agent_job_state(p_report_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_center_get_agent_job_state(p_report_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.testing_center_get_agent_job_state(p_report_id text) TO authenticated;


--

-- Name: FUNCTION testing_center_queue_agent_effect(p_job_key text, p_effect_kind text, p_effect_target text, p_payload_digest text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_center_queue_agent_effect(p_job_key text, p_effect_kind text, p_effect_target text, p_payload_digest text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.testing_center_queue_agent_effect(p_job_key text, p_effect_kind text, p_effect_target text, p_payload_digest text) TO service_role;


--

-- Name: FUNCTION testing_center_queue_agent_job(p_job_key text, p_technical_issue_id text, p_execution_generation integer, p_policy_version text, p_report_digest text, p_dossier_digest text, p_nightly_base_sha text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_center_queue_agent_job(p_job_key text, p_technical_issue_id text, p_execution_generation integer, p_policy_version text, p_report_digest text, p_dossier_digest text, p_nightly_base_sha text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.testing_center_queue_agent_job(p_job_key text, p_technical_issue_id text, p_execution_generation integer, p_policy_version text, p_report_digest text, p_dossier_digest text, p_nightly_base_sha text) TO service_role;


--

-- Name: FUNCTION testing_center_reconcile_github_effect(p_effect_id text, p_issue_number bigint, p_issue_node_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_center_reconcile_github_effect(p_effect_id text, p_issue_number bigint, p_issue_node_id text) FROM PUBLIC;


--

-- Name: FUNCTION testing_center_reconcile_linear_webhook(p_delivery_id uuid, p_webhook_id uuid, p_organization_id uuid, p_external_issue_id uuid, p_event_name text, p_event_action text, p_webhook_timestamp_ms bigint, p_event_created_at timestamp with time zone, p_linear_state_id uuid, p_payload_digest text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_center_reconcile_linear_webhook(p_delivery_id uuid, p_webhook_id uuid, p_organization_id uuid, p_external_issue_id uuid, p_event_name text, p_event_action text, p_webhook_timestamp_ms bigint, p_event_created_at timestamp with time zone, p_linear_state_id uuid, p_payload_digest text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.testing_center_reconcile_linear_webhook(p_delivery_id uuid, p_webhook_id uuid, p_organization_id uuid, p_external_issue_id uuid, p_event_name text, p_event_action text, p_webhook_timestamp_ms bigint, p_event_created_at timestamp with time zone, p_linear_state_id uuid, p_payload_digest text) TO service_role;


--

-- Name: FUNCTION testing_center_record_agent_callback(p_delivery_id text, p_job_key text, p_head_sha text, p_callback_kind text, p_outcome text, p_payload_digest text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_center_record_agent_callback(p_delivery_id text, p_job_key text, p_head_sha text, p_callback_kind text, p_outcome text, p_payload_digest text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.testing_center_record_agent_callback(p_delivery_id text, p_job_key text, p_head_sha text, p_callback_kind text, p_outcome text, p_payload_digest text) TO service_role;


--

-- Name: FUNCTION testing_center_record_agent_phase_callback(p_delivery_id text, p_job_key text, p_head_sha text, p_reviewed_head_sha text, p_phase text, p_payload_digest text, p_fencing_token bigint, p_run_id bigint, p_release_tag text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_center_record_agent_phase_callback(p_delivery_id text, p_job_key text, p_head_sha text, p_reviewed_head_sha text, p_phase text, p_payload_digest text, p_fencing_token bigint, p_run_id bigint, p_release_tag text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.testing_center_record_agent_phase_callback(p_delivery_id text, p_job_key text, p_head_sha text, p_reviewed_head_sha text, p_phase text, p_payload_digest text, p_fencing_token bigint, p_run_id bigint, p_release_tag text) TO service_role;


--

-- Name: FUNCTION testing_center_record_codex_dossier(p_rejection_validation_id text, p_dossier jsonb, p_canonical_dossier text, p_dossier_digest_source text, p_dossier_digest text, p_transport_digest text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_center_record_codex_dossier(p_rejection_validation_id text, p_dossier jsonb, p_canonical_dossier text, p_dossier_digest_source text, p_dossier_digest text, p_transport_digest text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.testing_center_record_codex_dossier(p_rejection_validation_id text, p_dossier jsonb, p_canonical_dossier text, p_dossier_digest_source text, p_dossier_digest text, p_transport_digest text) TO service_role;


--

-- Name: FUNCTION testing_center_record_codex_outcome(p_technical_issue_id text, p_worker_id text, p_fencing_token bigint, p_outcome_code text, p_response_digest text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_center_record_codex_outcome(p_technical_issue_id text, p_worker_id text, p_fencing_token bigint, p_outcome_code text, p_response_digest text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.testing_center_record_codex_outcome(p_technical_issue_id text, p_worker_id text, p_fencing_token bigint, p_outcome_code text, p_response_digest text) TO service_role;


--

-- Name: FUNCTION testing_center_record_fenced_agent_callback(p_delivery_id text, p_job_key text, p_head_sha text, p_callback_kind text, p_outcome text, p_payload_digest text, p_fencing_token bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_center_record_fenced_agent_callback(p_delivery_id text, p_job_key text, p_head_sha text, p_callback_kind text, p_outcome text, p_payload_digest text, p_fencing_token bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.testing_center_record_fenced_agent_callback(p_delivery_id text, p_job_key text, p_head_sha text, p_callback_kind text, p_outcome text, p_payload_digest text, p_fencing_token bigint) TO service_role;


--

-- Name: FUNCTION testing_center_record_github_delivery(p_delivery_id text, p_event_name text, p_action text, p_payload_digest text, p_issue_number bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_center_record_github_delivery(p_delivery_id text, p_event_name text, p_action text, p_payload_digest text, p_issue_number bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.testing_center_record_github_delivery(p_delivery_id text, p_event_name text, p_action text, p_payload_digest text, p_issue_number bigint) TO service_role;


--

-- Name: FUNCTION testing_center_record_linear_ambiguity(p_effect_id text, p_worker_id text, p_fencing_token bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_center_record_linear_ambiguity(p_effect_id text, p_worker_id text, p_fencing_token bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.testing_center_record_linear_ambiguity(p_effect_id text, p_worker_id text, p_fencing_token bigint) TO service_role;


--

-- Name: FUNCTION testing_center_record_owner_disposition(p_rejection_validation_id text, p_dossier_digest text, p_disposition text, p_reason text, p_correction_issue_id text, p_target_branch text, p_nightly_sha text, p_owner_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_center_record_owner_disposition(p_rejection_validation_id text, p_dossier_digest text, p_disposition text, p_reason text, p_correction_issue_id text, p_target_branch text, p_nightly_sha text, p_owner_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.testing_center_record_owner_disposition(p_rejection_validation_id text, p_dossier_digest text, p_disposition text, p_reason text, p_correction_issue_id text, p_target_branch text, p_nightly_sha text, p_owner_user_id uuid) TO service_role;


--

-- Name: FUNCTION testing_center_record_validation_projection(p_projection jsonb, p_canonical_projection text, p_projection_digest_source text, p_projection_digest text, p_transport_digest text, p_actor_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_center_record_validation_projection(p_projection jsonb, p_canonical_projection text, p_projection_digest_source text, p_projection_digest text, p_transport_digest text, p_actor_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.testing_center_record_validation_projection(p_projection jsonb, p_canonical_projection text, p_projection_digest_source text, p_projection_digest text, p_transport_digest text, p_actor_user_id uuid) TO service_role;


--

-- Name: FUNCTION testing_center_reserve_agent_effect(p_effect_id text, p_worker_id text, p_fencing_token bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_center_reserve_agent_effect(p_effect_id text, p_worker_id text, p_fencing_token bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.testing_center_reserve_agent_effect(p_effect_id text, p_worker_id text, p_fencing_token bigint) TO service_role;


--

-- Name: FUNCTION testing_center_reserve_agent_resource(p_job_key text, p_reservation_kind text, p_reservation_key text, p_binding_digest text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_center_reserve_agent_resource(p_job_key text, p_reservation_kind text, p_reservation_key text, p_binding_digest text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.testing_center_reserve_agent_resource(p_job_key text, p_reservation_kind text, p_reservation_key text, p_binding_digest text) TO service_role;


--

-- Name: FUNCTION testing_center_retry_linear_pilot_token(p_effect_id text, p_worker_id text, p_fencing_token bigint, p_projection_digest text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_center_retry_linear_pilot_token(p_effect_id text, p_worker_id text, p_fencing_token bigint, p_projection_digest text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.testing_center_retry_linear_pilot_token(p_effect_id text, p_worker_id text, p_fencing_token bigint, p_projection_digest text) TO service_role;


--

-- Name: FUNCTION testing_center_transition_agent_job(p_job_key text, p_expected_state text, p_to_state text, p_actor text, p_operation_digest text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_center_transition_agent_job(p_job_key text, p_expected_state text, p_to_state text, p_actor text, p_operation_digest text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.testing_center_transition_agent_job(p_job_key text, p_expected_state text, p_to_state text, p_actor text, p_operation_digest text) TO service_role;


--

-- Name: FUNCTION testing_center_upsert_linear_state_mapping(p_organization_id uuid, p_linear_state_id uuid, p_coarse_state text, p_configured_by_id text, p_active boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_center_upsert_linear_state_mapping(p_organization_id uuid, p_linear_state_id uuid, p_coarse_state text, p_configured_by_id text, p_active boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.testing_center_upsert_linear_state_mapping(p_organization_id uuid, p_linear_state_id uuid, p_coarse_state text, p_configured_by_id text, p_active boolean) TO service_role;


--

-- Name: FUNCTION testing_center_validate_candidate(p_contract_version text, p_candidate_id text, p_exact_sha text, p_decision text, p_rejection_reason text, p_idempotency_key text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_center_validate_candidate(p_contract_version text, p_candidate_id text, p_exact_sha text, p_decision text, p_rejection_reason text, p_idempotency_key text) FROM PUBLIC;


--

-- Name: FUNCTION testing_center_validate_issue_destination(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_center_validate_issue_destination() FROM PUBLIC;


--

-- Name: FUNCTION testing_contribution_review(p_id uuid, p_decision text, p_note text, p_proposal jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_contribution_review(p_id uuid, p_decision text, p_note text, p_proposal jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.testing_contribution_review(p_id uuid, p_decision text, p_note text, p_proposal jsonb) TO authenticated;


--

-- Name: FUNCTION testing_contribution_submit(p_id uuid, p_channel text, p_title text, p_body text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_contribution_submit(p_id uuid, p_channel text, p_title text, p_body text) FROM PUBLIC;


--

-- Name: FUNCTION testing_contribution_submit_admitted(p_account uuid, p_id uuid, p_channel text, p_title text, p_body text, p_context jsonb, p_attachments jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_contribution_submit_admitted(p_account uuid, p_id uuid, p_channel text, p_title text, p_body text, p_context jsonb, p_attachments jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.testing_contribution_submit_admitted(p_account uuid, p_id uuid, p_channel text, p_title text, p_body text, p_context jsonb, p_attachments jsonb) TO service_role;


--

-- Name: FUNCTION testing_contribution_submit_v2(p_id uuid, p_channel text, p_title text, p_body text, p_context jsonb, p_attachments jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_contribution_submit_v2(p_id uuid, p_channel text, p_title text, p_body text, p_context jsonb, p_attachments jsonb) FROM PUBLIC;


--

-- Name: FUNCTION testing_participation_current(p_channel text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_participation_current(p_channel text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.testing_participation_current(p_channel text) TO authenticated;


--

-- Name: FUNCTION testing_participation_current_v2(p_channel text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_participation_current_v2(p_channel text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.testing_participation_current_v2(p_channel text) TO authenticated;


--

-- Name: FUNCTION testing_report_admit(p_scope text, p_subject text, p_week date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_report_admit(p_scope text, p_subject text, p_week date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.testing_report_admit(p_scope text, p_subject text, p_week date) TO service_role;


--

-- Name: FUNCTION testing_report_admit_account(p_account uuid, p_key text, p_digest text, p_week date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_report_admit_account(p_account uuid, p_key text, p_digest text, p_week date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.testing_report_admit_account(p_account uuid, p_key text, p_digest text, p_week date) TO service_role;


--

-- Name: FUNCTION testing_report_credit(p_id uuid, p_consent boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_report_credit(p_id uuid, p_consent boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.testing_report_credit(p_id uuid, p_consent boolean) TO authenticated;


--

-- Name: FUNCTION testing_report_fixed(p_id uuid, p_version text, p_reviewed_title text, p_reviewed_summary text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_report_fixed(p_id uuid, p_version text, p_reviewed_title text, p_reviewed_summary text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.testing_report_fixed(p_id uuid, p_version text, p_reviewed_title text, p_reviewed_summary text) TO authenticated;


--

-- Name: FUNCTION testing_report_notice_read(p_id uuid, p_updated_at timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_report_notice_read(p_id uuid, p_updated_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.testing_report_notice_read(p_id uuid, p_updated_at timestamp with time zone) TO authenticated;


--

-- Name: FUNCTION testing_report_patch_candidates(p_version text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_report_patch_candidates(p_version text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.testing_report_patch_candidates(p_version text) TO authenticated;


--

-- Name: FUNCTION testing_report_submit(p_id uuid, p_channel text, p_title text, p_body text, p_consent boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_report_submit(p_id uuid, p_channel text, p_title text, p_body text, p_consent boolean) FROM PUBLIC;


--

-- Name: FUNCTION testing_report_submit_admitted(p_account uuid, p_id uuid, p_channel text, p_title text, p_body text, p_consent boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_report_submit_admitted(p_account uuid, p_id uuid, p_channel text, p_title text, p_body text, p_consent boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.testing_report_submit_admitted(p_account uuid, p_id uuid, p_channel text, p_title text, p_body text, p_consent boolean) TO service_role;


--

-- Name: FUNCTION testing_report_v2_submit_admitted(p_account uuid, p_report jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.testing_report_v2_submit_admitted(p_account uuid, p_report jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.testing_report_v2_submit_admitted(p_account uuid, p_report jsonb) TO service_role;


--

-- Name: FUNCTION visual_roadmap_current(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.visual_roadmap_current() FROM PUBLIC;
GRANT ALL ON FUNCTION public.visual_roadmap_current() TO anon;
GRANT ALL ON FUNCTION public.visual_roadmap_current() TO authenticated;


--

-- Name: FUNCTION visual_roadmap_current_v2(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.visual_roadmap_current_v2() FROM PUBLIC;
GRANT ALL ON FUNCTION public.visual_roadmap_current_v2() TO anon;
GRANT ALL ON FUNCTION public.visual_roadmap_current_v2() TO authenticated;


--

-- Name: FUNCTION visual_roadmap_publish(p_document jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.visual_roadmap_publish(p_document jsonb) FROM PUBLIC;


--

-- Name: FUNCTION visual_roadmap_sync(p_document jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.visual_roadmap_sync(p_document jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.visual_roadmap_sync(p_document jsonb) TO vantare_roadmap_publisher;


--

-- Name: FUNCTION visual_roadmap_valid(p_document jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.visual_roadmap_valid(p_document jsonb) FROM PUBLIC;


--

-- Name: FUNCTION web_purchase_attempt_states(p_keys jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.web_purchase_attempt_states(p_keys jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.web_purchase_attempt_states(p_keys jsonb) TO web_purchase_erasure;


--

-- Name: FUNCTION web_purchase_erasure_ack(p_from_cursor bigint, p_to_cursor bigint, p_count integer, p_environment text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.web_purchase_erasure_ack(p_from_cursor bigint, p_to_cursor bigint, p_count integer, p_environment text) FROM PUBLIC;


--

-- Name: FUNCTION web_purchase_erasure_ack(p_from_cursor bigint, p_to_cursor bigint, p_count integer, p_environment text, p_erasure_digest text, p_remaining_rows integer, p_receipt text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.web_purchase_erasure_ack(p_from_cursor bigint, p_to_cursor bigint, p_count integer, p_environment text, p_erasure_digest text, p_remaining_rows integer, p_receipt text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.web_purchase_erasure_ack(p_from_cursor bigint, p_to_cursor bigint, p_count integer, p_environment text, p_erasure_digest text, p_remaining_rows integer, p_receipt text) TO web_purchase_erasure;


--

-- Name: FUNCTION web_purchase_erasure_failed(p_code text, p_environment text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.web_purchase_erasure_failed(p_code text, p_environment text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.web_purchase_erasure_failed(p_code text, p_environment text) TO web_purchase_erasure;


--

-- Name: FUNCTION web_purchase_erasure_pull(p_limit integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.web_purchase_erasure_pull(p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.web_purchase_erasure_pull(p_limit integer) TO web_purchase_erasure;


--

-- Name: TABLE operations; Type: ACL; Schema: pilot_private; Owner: -
--

GRANT SELECT,INSERT ON TABLE pilot_private.operations TO pilot_profile_writer;


--

-- Name: TABLE admin_effects; Type: ACL; Schema: private; Owner: -
--

GRANT SELECT ON TABLE private.admin_effects TO service_role;


--

-- Name: TABLE admin_pending_effects; Type: ACL; Schema: private; Owner: -
--

GRANT SELECT ON TABLE private.admin_pending_effects TO service_role;


--

-- Name: TABLE clerk_issuers; Type: ACL; Schema: private; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE private.clerk_issuers TO service_role;


--

-- Name: TABLE admin_audit_log; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.admin_audit_log TO service_role;


--

-- Name: TABLE billing_access_blocks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.billing_access_blocks TO service_role;


--

-- Name: TABLE billing_access_grants; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.billing_access_grants TO service_role;


--

-- Name: TABLE billing_checkout_attempts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.billing_checkout_attempts TO service_role;


--

-- Name: TABLE billing_checkout_bindings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.billing_checkout_bindings TO service_role;


--

-- Name: TABLE billing_commercial_resources; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.billing_commercial_resources TO service_role;


--

-- Name: TABLE billing_customers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.billing_customers TO service_role;


--

-- Name: TABLE billing_effective_access_grants; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.billing_effective_access_grants TO service_role;


--

-- Name: TABLE billing_orders; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.billing_orders TO service_role;


--

-- Name: TABLE billing_reconciliation_runs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.billing_reconciliation_runs TO service_role;


--

-- Name: TABLE billing_refunds; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.billing_refunds TO service_role;


--

-- Name: TABLE billing_subscription_recovery_cycles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.billing_subscription_recovery_cycles TO service_role;


--

-- Name: TABLE billing_subscriptions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.billing_subscriptions TO service_role;


--

-- Name: TABLE billing_webhook_effects; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.billing_webhook_effects TO service_role;


--

-- Name: TABLE billing_webhook_inbox; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.billing_webhook_inbox TO service_role;


--

-- Name: TABLE billing_webhook_replay_audit; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.billing_webhook_replay_audit TO service_role;


--

-- Name: TABLE devices; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.devices TO service_role;


--

-- Name: TABLE hwid_changes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hwid_changes TO service_role;


--

-- Name: TABLE license_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.license_events TO service_role;


--

-- Name: TABLE license_validations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.license_validations TO service_role;


--

-- Name: TABLE licenses; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.licenses TO service_role;


--

-- Name: TABLE module_rollout; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.module_rollout TO service_role;


--

-- Name: TABLE operational_access_assignments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.operational_access_assignments TO service_role;


--

-- Name: TABLE operational_access_audit; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.operational_access_audit TO service_role;


--

-- Name: TABLE operational_legacy_grant_retirements; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.operational_legacy_grant_retirements TO service_role;


--

-- Name: TABLE pilot_profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pilot_profiles TO service_role;
GRANT SELECT ON TABLE public.pilot_profiles TO authenticated;
GRANT SELECT,INSERT,UPDATE ON TABLE public.pilot_profiles TO pilot_profile_writer;


--

-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO service_role;
GRANT SELECT ON TABLE public.profiles TO authenticated;


--

-- Name: TABLE race_schedule_publications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.race_schedule_publications TO service_role;


--

-- Name: TABLE rate_limits; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.rate_limits TO service_role;


--

-- Name: TABLE subscriptions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.subscriptions TO service_role;


--

-- Name: TABLE supabase_heartbeat; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.supabase_heartbeat TO anon;


--

-- Name: TABLE testing_answers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.testing_answers TO service_role;
GRANT SELECT ON TABLE public.testing_answers TO authenticated;


--

-- Name: TABLE testing_center_agent_audit; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.testing_center_agent_audit TO service_role;


--

-- Name: TABLE testing_center_agent_callbacks; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.testing_center_agent_callbacks TO service_role;


--

-- Name: TABLE testing_center_agent_effect_outbox; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.testing_center_agent_effect_outbox TO service_role;


--

-- Name: TABLE testing_center_agent_jobs; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.testing_center_agent_jobs TO service_role;


--

-- Name: TABLE testing_center_agent_phase_callbacks; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.testing_center_agent_phase_callbacks TO service_role;


--

-- Name: TABLE testing_center_agent_reservations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.testing_center_agent_reservations TO service_role;


--

-- Name: TABLE testing_center_audit; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.testing_center_audit TO service_role;


--

-- Name: TABLE testing_center_build_identities; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.testing_center_build_identities TO service_role;


--

-- Name: TABLE testing_center_candidate_builds; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.testing_center_candidate_builds TO service_role;
GRANT SELECT ON TABLE public.testing_center_candidate_builds TO authenticated;


--

-- Name: TABLE testing_center_codex_dossier_snapshots; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.testing_center_codex_dossier_snapshots TO service_role;


--

-- Name: TABLE testing_center_codex_execution_control; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.testing_center_codex_execution_control TO service_role;


--

-- Name: TABLE testing_center_codex_runs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.testing_center_codex_runs TO service_role;


--

-- Name: TABLE testing_center_effect_outbox; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.testing_center_effect_outbox TO service_role;


--

-- Name: TABLE testing_center_effect_supersessions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.testing_center_effect_supersessions TO service_role;


--

-- Name: TABLE testing_center_github_deliveries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.testing_center_github_deliveries TO service_role;


--

-- Name: TABLE testing_center_idempotency; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.testing_center_idempotency TO service_role;


--

-- Name: TABLE testing_center_issue_destinations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.testing_center_issue_destinations TO service_role;


--

-- Name: TABLE testing_center_linear_issue_bindings; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.testing_center_linear_issue_bindings TO service_role;


--

-- Name: TABLE testing_center_linear_projection_snapshots; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.testing_center_linear_projection_snapshots TO service_role;


--

-- Name: TABLE testing_center_linear_reconciliations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.testing_center_linear_reconciliations TO service_role;


--

-- Name: TABLE testing_center_linear_state_mappings; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.testing_center_linear_state_mappings TO service_role;


--

-- Name: TABLE testing_center_linear_webhook_deliveries; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.testing_center_linear_webhook_deliveries TO service_role;


--

-- Name: TABLE testing_center_memberships; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.testing_center_memberships TO service_role;
GRANT SELECT ON TABLE public.testing_center_memberships TO authenticated;


--

-- Name: TABLE testing_center_owner_dispositions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.testing_center_owner_dispositions TO service_role;


--

-- Name: TABLE testing_center_pauses; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.testing_center_pauses TO service_role;


--

-- Name: TABLE testing_center_promotions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.testing_center_promotions TO service_role;


--

-- Name: TABLE testing_center_technical_issues; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.testing_center_technical_issues TO service_role;
GRANT SELECT ON TABLE public.testing_center_technical_issues TO authenticated;


--

-- Name: TABLE testing_center_validation_snapshots; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.testing_center_validation_snapshots TO service_role;


--

-- Name: TABLE testing_center_validations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.testing_center_validations TO service_role;


--

-- Name: TABLE testing_contribution_attachments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.testing_contribution_attachments TO authenticated;
GRANT SELECT ON TABLE public.testing_contribution_attachments TO vantare_triage;


--

-- Name: TABLE testing_contribution_context; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.testing_contribution_context TO authenticated;


--

-- Name: COLUMN testing_contribution_context.contribution_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(contribution_id) ON TABLE public.testing_contribution_context TO vantare_triage;


--

-- Name: COLUMN testing_contribution_context.app_version; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(app_version) ON TABLE public.testing_contribution_context TO vantare_triage;


--

-- Name: COLUMN testing_contribution_context.app_channel; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(app_channel) ON TABLE public.testing_contribution_context TO vantare_triage;


--

-- Name: COLUMN testing_contribution_context.game; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(game) ON TABLE public.testing_contribution_context TO vantare_triage;


--

-- Name: COLUMN testing_contribution_context.game_version; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(game_version) ON TABLE public.testing_contribution_context TO vantare_triage;


--

-- Name: COLUMN testing_contribution_context.system; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(system) ON TABLE public.testing_contribution_context TO vantare_triage;


--

-- Name: COLUMN testing_contribution_context.telemetry_summary; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(telemetry_summary) ON TABLE public.testing_contribution_context TO vantare_triage;


--

-- Name: COLUMN testing_contribution_context.consent; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(consent) ON TABLE public.testing_contribution_context TO vantare_triage;


--

-- Name: TABLE testing_contribution_reviews; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.testing_contribution_reviews TO authenticated;


--

-- Name: TABLE testing_contributions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.testing_contributions TO service_role;
GRANT SELECT ON TABLE public.testing_contributions TO authenticated;


--

-- Name: COLUMN testing_contributions.id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(id) ON TABLE public.testing_contributions TO vantare_triage;


--

-- Name: COLUMN testing_contributions.channel; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(channel) ON TABLE public.testing_contributions TO vantare_triage;


--

-- Name: COLUMN testing_contributions.title; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(title) ON TABLE public.testing_contributions TO vantare_triage;


--

-- Name: COLUMN testing_contributions.body; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(body) ON TABLE public.testing_contributions TO vantare_triage;


--

-- Name: COLUMN testing_contributions.state; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(state) ON TABLE public.testing_contributions TO vantare_triage;


--

-- Name: COLUMN testing_contributions.created_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(created_at) ON TABLE public.testing_contributions TO vantare_triage;


--

-- Name: TABLE testing_questionnaires; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.testing_questionnaires TO service_role;
GRANT SELECT ON TABLE public.testing_questionnaires TO authenticated;


--

-- Name: TABLE testing_report_followup; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.testing_report_followup TO service_role;
GRANT SELECT ON TABLE public.testing_report_followup TO authenticated;


--

-- Name: TABLE user_entitlements; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_entitlements TO service_role;


--

-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

-- Catalog: cron.job (0 rows)
