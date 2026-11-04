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

-- Name: append_mail_effect(jsonb, uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.append_mail_effect(event jsonb, account uuid) RETURNS boolean
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare e private.admin_effects:=jsonb_populate_record(null::private.admin_effects,event);
 initial private.admin_effects; stored private.admin_effects;
begin
 if e.outcome<>'started' then
  select * into initial from private.admin_effects where effect_id=e.effect_id and outcome='started' for update;
  if not found or (initial.actor,initial.request_id,initial.action,initial.effect,initial.target_hash)
   is distinct from (e.actor,e.request_id,e.action,e.effect,e.target_hash)
  then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 end if;
 if exists(select 1 from private.admin_effects where effect_id=e.effect_id and outcome='reconciled') then
  raise exception 'native_admin_invalid' using errcode='22023'; end if;
 insert into private.admin_effects(effect_id,outcome,request_id,actor,action,effect,target_hash,provider_status,target_account)
 values(e.effect_id,e.outcome,e.request_id,e.actor,e.action,e.effect,e.target_hash,e.provider_status,account) on conflict do nothing;
 select * into stored from private.admin_effects where effect_id=e.effect_id and outcome=e.outcome;
 if not found or (stored.actor,stored.request_id,stored.action,stored.effect,stored.target_hash,stored.provider_status)
  is distinct from (e.actor,e.request_id,e.action,e.effect,e.target_hash,e.provider_status)
  or exists(select 1 from private.admin_effects where effect_id=e.effect_id and outcome='reconciled')
 then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 return true;
end $$;


--

-- Name: bind_admin_effect_account(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.bind_admin_effect_account() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare initial private.admin_effects;
begin
 if new.outcome='started' then
  if new.target_account is null then
   select target_account into new.target_account from private.admin_audit_maintenance_tx
    where transaction_id=pg_current_xact_id() and not maintenance;
  end if;
  if new.target_account is not null then
   -- Trigger fallback never waits for a UUID after the RPC has locked rows.
   new.erase_on_close:=private.lock_account_row_write(new.target_account);
   if new.erase_on_close then new.target_account:=null; end if;
  end if;
 else
  select * into initial from private.admin_effects where effect_id=new.effect_id and outcome='started';
  new.target_account:=initial.target_account; new.erase_on_close:=initial.erase_on_close;
 end if;
 return new;
end $$;


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

-- Name: minimize_admin_audit(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.minimize_admin_audit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare account uuid; target uuid;
begin
 if new.target ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then target:=new.target::uuid; end if;
 -- Nonwaiting UUID fallback serializes insert with erasure after any row locks.
 for account in select distinct a from unnest(array[(to_jsonb(new)->>tg_argv[0])::uuid,target]) a
  where a is not null order by a loop perform private.lock_account_row_write(account); end loop;
 new:=private.admin_audit_minimize(new,tg_argv[0],string_to_array(tg_argv[1],','));
 return new;
end $_$;


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

-- Name: redact_closed_admin_effect(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.redact_closed_admin_effect() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare previous boolean;
begin
 perform 1 from private.admin_effects where effect_id=new.effect_id and outcome='started' for update;
 if not exists(select 1 from private.admin_effects where effect_id=new.effect_id and erase_on_close) then return null; end if;
 select maintenance into previous from private.admin_audit_maintenance_tx where transaction_id=pg_current_xact_id();
 insert into private.admin_audit_maintenance_tx(maintenance) values(true)
 on conflict(transaction_id) do update set maintenance=true;
 update private.admin_effects set target_hash='erased',target_account=null where effect_id=new.effect_id;
 if previous is null then delete from private.admin_audit_maintenance_tx where transaction_id=pg_current_xact_id();
 else update private.admin_audit_maintenance_tx set maintenance=previous where transaction_id=pg_current_xact_id(); end if;
 return null;
end $$;


--

-- Name: redact_deleted_account_audit(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.redact_deleted_account_audit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
 perform pg_advisory_xact_lock(1910,10);
 insert into private.admin_audit_maintenance_tx default values;
 update public.admin_audit_log set target='erased'
 where target in (new.account_id::text,'sha256:'||encode(sha256(convert_to(new.account_id::text,'UTF8')),'hex'));
 -- Preserve only a nonidentifying marker on pending groups, never the UUID.
 -- Wait for in-flight closures; the following UPDATE then gets a fresh snapshot.
 perform 1 from private.admin_effects where target_account=new.account_id for update;
 update private.admin_effects e set target_account=null,erase_on_close=true,
 target_hash=case when exists(select 1 from private.admin_effects r where r.effect_id=e.effect_id
 and r.outcome in('succeeded','failed','reconciled')) then 'erased' else e.target_hash end
 where e.target_account=new.account_id;
 update public.admin_audit_log set actor_account_id=null where actor_account_id=new.account_id;
 update private.mail_audit set actor=null where actor=new.account_id;
 update private.mail_audit set target='erased'
 where target in (new.account_id::text,'sha256:'||encode(sha256(convert_to(new.account_id::text,'UTF8')),'hex'));
 delete from private.admin_audit_maintenance_tx where transaction_id=pg_current_xact_id();
 return new;
end $$;


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

-- Name: race_schedule_valid(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.race_schedule_valid(p_schedule jsonb) RETURNS boolean
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $_$
declare
  v_from timestamptz;
  v_until timestamptz;
  v_series jsonb;
  v_recurrence jsonb;
  v_item jsonb;
  v_id text;
  v_ids text[] := array[]::text[];
  v_interval bigint;
  v_time text;
  v_key text;
  v_value jsonb;
  v_number numeric;
begin
  if pg_catalog.jsonb_typeof(p_schedule) is distinct from 'object'
    or pg_catalog.jsonb_typeof(p_schedule->'version') is distinct from 'number'
    or p_schedule->>'version' is distinct from '1'
    or p_schedule->>'timezone' is distinct from 'UTC'
    or pg_catalog.jsonb_typeof(p_schedule->'validFrom') is distinct from 'string'
    or pg_catalog.jsonb_typeof(p_schedule->'validUntil') is distinct from 'string'
    or p_schedule->>'validFrom' !~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$'
    or p_schedule->>'validUntil' !~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$'
    or pg_catalog.jsonb_typeof(p_schedule->'series') is distinct from 'array' then
    return false;
  end if;
  v_from := (p_schedule->>'validFrom')::timestamptz;
  v_until := (p_schedule->>'validUntil')::timestamptz;
  if v_until <= v_from
    or pg_catalog.jsonb_array_length(p_schedule->'series') not between 1 and 256 then
    return false;
  end if;

  for v_series in select value from pg_catalog.jsonb_array_elements(p_schedule->'series') loop
    if pg_catalog.jsonb_typeof(v_series) is distinct from 'object'
      or pg_catalog.jsonb_typeof(v_series->'id') is distinct from 'string'
      or pg_catalog.jsonb_typeof(v_series->'name') is distinct from 'string'
      or pg_catalog.jsonb_typeof(v_series->'track') is distinct from 'string'
      or pg_catalog.jsonb_typeof(v_series->'vehicleClass') is distinct from 'string'
      or pg_catalog.jsonb_typeof(v_series->'licenseLabel') is distinct from 'string'
      or pg_catalog.btrim(v_series->>'id') = ''
      or pg_catalog.btrim(v_series->>'name') = '' then
      return false;
    end if;
    v_id := v_series->>'id';
    if v_id = any(v_ids) then return false; end if;
    v_ids := pg_catalog.array_append(v_ids,v_id);
    for v_key,v_value in select key,value from pg_catalog.jsonb_each(v_series) loop
      if v_key in ('tier','eventKind','format','setup','assists',
                   'safetyRating','source') then
        if pg_catalog.jsonb_typeof(v_value) <> 'string' then return false; end if;
      elsif v_key in ('raceDurationMin','eventDurationMin','tyres',
                      'splits','veLimit') and v_value <> 'null'::jsonb then
        if pg_catalog.jsonb_typeof(v_value) <> 'number'
          or v_value #>> '{}' !~ '^[0-9]+$' then return false; end if;
        v_number := (v_value #>> '{}')::numeric;
        if v_number > 4294967295 then return false; end if;
      elsif v_key='startOffsetMinute' then
        if pg_catalog.jsonb_typeof(v_value) <> 'number'
          or v_value #>> '{}' !~ '^-?[0-9]+$' then return false; end if;
        perform (v_value #>> '{}')::bigint;
      elsif v_key='tyreWarmers' then
        if pg_catalog.jsonb_typeof(v_value) <> 'boolean' then return false; end if;
      elsif v_key in ('classes','sessions','notes') then
        if pg_catalog.jsonb_typeof(v_value) <> 'array' then return false; end if;
        for v_item in select value from pg_catalog.jsonb_array_elements(v_value) loop
          if v_key='notes' then
            if pg_catalog.jsonb_typeof(v_item) <> 'string' then return false; end if;
          elsif v_key='classes' then
            if pg_catalog.jsonb_typeof(v_item) <> 'object'
              or pg_catalog.jsonb_typeof(v_item->'name') <> 'string' then
              return false;
            end if;
          else
            if pg_catalog.jsonb_typeof(v_item) <> 'object'
              or pg_catalog.jsonb_typeof(v_item->'name') <> 'string'
              or pg_catalog.jsonb_typeof(v_item->'durationMin') <> 'number'
              or v_item->>'durationMin' !~ '^[0-9]+$' then return false; end if;
            v_number := (v_item->>'durationMin')::numeric;
            if v_number > 4294967295
              or (v_item ? 'estimated'
                and pg_catalog.jsonb_typeof(v_item->'estimated') <> 'boolean') then
              return false;
            end if;
          end if;
        end loop;
      end if;
    end loop;
    v_recurrence := v_series->'recurrence';
    if pg_catalog.jsonb_typeof(v_recurrence) is distinct from 'object' then
      return false;
    end if;
    if v_recurrence ? 'intervalMinutes' then
      if pg_catalog.jsonb_typeof(v_recurrence->'intervalMinutes') <> 'number'
        or v_recurrence->>'intervalMinutes' !~ '^-?[0-9]+$' then return false; end if;
      perform (v_recurrence->>'intervalMinutes')::bigint;
    end if;
    for v_key in select unnest(array['days','timesUTC']) loop
      if v_recurrence ? v_key then
        if pg_catalog.jsonb_typeof(v_recurrence->v_key) <> 'array' then return false; end if;
        for v_item in select value from pg_catalog.jsonb_array_elements(v_recurrence->v_key) loop
          if pg_catalog.jsonb_typeof(v_item) <> 'string' then return false; end if;
        end loop;
      end if;
    end loop;
    if v_recurrence->>'kind' = 'interval' then
      if pg_catalog.jsonb_typeof(v_recurrence->'intervalMinutes') is distinct from 'number'
        or v_recurrence->>'intervalMinutes' !~ '^-?[0-9]+$' then
        return false;
      end if;
      v_interval := (v_recurrence->>'intervalMinutes')::bigint;
      if v_interval not between 1 and 10080 then return false; end if;
    elsif v_recurrence->>'kind' = 'weekly-slots' then
      if pg_catalog.jsonb_typeof(v_recurrence->'days') is distinct from 'array'
        or pg_catalog.jsonb_typeof(v_recurrence->'timesUTC') is distinct from 'array'
        or pg_catalog.jsonb_array_length(v_recurrence->'days') = 0
        or pg_catalog.jsonb_array_length(v_recurrence->'timesUTC') = 0 then
        return false;
      end if;
      for v_item in select value from pg_catalog.jsonb_array_elements(v_recurrence->'days') loop
        if pg_catalog.jsonb_typeof(v_item) is distinct from 'string'
          or v_item #>> '{}' not in ('Mon','Tue','Wed','Thu','Fri','Sat','Sun') then
          return false;
        end if;
      end loop;
      for v_item in select value from pg_catalog.jsonb_array_elements(v_recurrence->'timesUTC') loop
        v_time := v_item #>> '{}';
        if pg_catalog.jsonb_typeof(v_item) is distinct from 'string'
          or v_time !~ '^[0-9]{2}:[0-9]{2}$'
          or pg_catalog.substr(v_time,1,2)::integer > 23
          or pg_catalog.substr(v_time,4,2)::integer > 59 then
          return false;
        end if;
      end loop;
    else
      return false;
    end if;
  end loop;
  return true;
exception when invalid_text_representation or datetime_field_overflow
  or numeric_value_out_of_range then
  return false;
end $_$;


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

-- Name: pilot_profiles a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.pilot_profiles FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''account_id'')::uuid) owners(account)', 'select ($1->>''account_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''account_id'')::uuid))');


--

-- Name: race_schedule_publications a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.race_schedule_publications FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''created_by'')::uuid union select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''published_by'')::uuid) owners(account)', 'select ($1->>''created_by'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''created_by'')::uuid)) or ($1->>''published_by'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''published_by'')::uuid))');


--

-- Name: rate_limits a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.rate_limits FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.licenses p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''user_id'')::uuid) a(account) where p2.id=($1->>''license_id'')::uuid union select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''user_id'')::uuid) owners(account)', 'select ($1->>''license_id'' is not null and not exists(select 1 from public.licenses p where p.id=($1->>''license_id'')::uuid)) or ($1->>''user_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''user_id'')::uuid))');


--

-- Name: subscriptions a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''user_id'')::uuid) owners(account)', 'select ($1->>''user_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''user_id'')::uuid))');


--

-- Name: user_entitlements a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.user_entitlements FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''user_id'')::uuid) owners(account)', 'select ($1->>''user_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''user_id'')::uuid))');


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

-- Name: FUNCTION append_mail_effect(event jsonb, account uuid); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.append_mail_effect(event jsonb, account uuid) FROM PUBLIC;


--

-- Name: FUNCTION bind_admin_effect_account(); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.bind_admin_effect_account() FROM PUBLIC;


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

-- Name: FUNCTION minimize_admin_audit(); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.minimize_admin_audit() FROM PUBLIC;


--

-- Name: FUNCTION observe_checkout_payment_unchecked(p_environment text, p_order_id uuid, p_checkout_id uuid, p_organization_id uuid, p_product_id uuid, p_subscription_id uuid, p_net_amount bigint, p_currency text, p_capabilities text[], p_attempt_id uuid, p_dispatch_token uuid); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.observe_checkout_payment_unchecked(p_environment text, p_order_id uuid, p_checkout_id uuid, p_organization_id uuid, p_product_id uuid, p_subscription_id uuid, p_net_amount bigint, p_currency text, p_capabilities text[], p_attempt_id uuid, p_dispatch_token uuid) FROM PUBLIC;


--

-- Name: FUNCTION record_web_purchase_erasure(); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.record_web_purchase_erasure() FROM PUBLIC;


--

-- Name: FUNCTION redact_closed_admin_effect(); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.redact_closed_admin_effect() FROM PUBLIC;


--

-- Name: FUNCTION redact_deleted_account_audit(); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.redact_deleted_account_audit() FROM PUBLIC;


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

-- Name: FUNCTION apply_clerk_user_event(p_event_id text, p_payload_hash text, p_issuer text, p_subject text, p_event_type text, p_event_at timestamp with time zone, p_verified_email text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.apply_clerk_user_event(p_event_id text, p_payload_hash text, p_issuer text, p_subject text, p_event_type text, p_event_at timestamp with time zone, p_verified_email text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_clerk_user_event(p_event_id text, p_payload_hash text, p_issuer text, p_subject text, p_event_type text, p_event_at timestamp with time zone, p_verified_email text) TO service_role;


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

-- Name: FUNCTION mark_billing_checkout_attempt_uncertain(p_user_id uuid, p_attempt_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mark_billing_checkout_attempt_uncertain(p_user_id uuid, p_attempt_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mark_billing_checkout_attempt_uncertain(p_user_id uuid, p_attempt_id uuid) TO service_role;


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

-- Name: FUNCTION race_schedule_valid(p_schedule jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.race_schedule_valid(p_schedule jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.race_schedule_valid(p_schedule jsonb) TO service_role;


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

-- Name: FUNCTION reset_active_device(device_fingerprint text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reset_active_device(device_fingerprint text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reset_active_device(device_fingerprint text) TO authenticated;


--

-- Name: TABLE operations; Type: ACL; Schema: pilot_private; Owner: -
--

GRANT SELECT,INSERT ON TABLE pilot_private.operations TO pilot_profile_writer;


--

-- Name: TABLE devices; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.devices TO service_role;


--

-- Name: TABLE hwid_changes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.hwid_changes TO service_role;


--

-- Name: TABLE licenses; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.licenses TO service_role;


--

-- Name: TABLE module_rollout; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.module_rollout TO service_role;


--

-- Name: TABLE pilot_profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pilot_profiles TO service_role;
GRANT SELECT ON TABLE public.pilot_profiles TO authenticated;
GRANT SELECT,INSERT,UPDATE ON TABLE public.pilot_profiles TO pilot_profile_writer;


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
