-- Generated from disposable PostgreSQL; read-only. Do not edit.
-- Name: admin_audit_fields(jsonb, text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.admin_audit_fields(value jsonb, action text) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
 select case when value is null or value='null'::jsonb then null
 when action='audit_prune' then (select coalesce(jsonb_object_agg(k,v),'{}'::jsonb)
 from jsonb_each(case when jsonb_typeof(value)='object' then value else '{}'::jsonb end) t(k,v)
 where k in('retention_days','admin','mail','effects') and jsonb_typeof(v)='number')
 when action='set_tester' and jsonb_typeof(value->'enabled')='boolean' then jsonb_build_object('enabled',value->'enabled')
 when action='set_tester' then jsonb_build_object('enabled',coalesce(
   (coalesce(value#>'{account,roles}',value->'roles','[]'::jsonb) ? 'tester'),false))
 when action='set_module' then jsonb_build_object('modules',coalesce((
   select jsonb_agg(module) from jsonb_array_elements(case
    when jsonb_typeof(coalesce(value#>'{account,modules}',value->'modules'))='array'
    then coalesce(value#>'{account,modules}',value->'modules') else '[]'::jsonb end) module
   where module#>>'{}' in ('vantare.module.strategy','vantare.module.engineer',
     'vantare.module.analysis','vantare.module.calendar')), '[]'::jsonb))
 else jsonb_strip_nulls(jsonb_build_object(
   'blocked',case when jsonb_typeof(value->'blocked')='boolean' then value->'blocked' end,
   'enabled_for_all',case when jsonb_typeof(value->'enabled_for_all')='boolean' then value->'enabled_for_all' end,
   'consent',case when jsonb_typeof(value->'consent')='boolean' then value->'consent' end,
   'revision',case when jsonb_typeof(value->'revision')='number' then value->'revision' end,
   'status',case when value->>'status' in ('active','pending','draft','sending','sent','canceled',
     'submitted','validated','duplicate_linked','incomplete','closed','in_review','rejected','fixed','spam') then value->'status' end)) end
$$;


--

-- Name: admin_audit_maintenance(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.admin_audit_maintenance() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
 select current_user='postgres' and exists(select 1 from private.admin_audit_maintenance_tx
 where transaction_id=pg_current_xact_id() and maintenance)
$$;


--

-- Name: admin_audit_minimize(anyelement, text, text[]); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.admin_audit_minimize(entry anyelement, actor_key text, value_keys text[]) RETURNS anyelement
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
 select jsonb_populate_record(entry,to_jsonb(entry)||jsonb_build_object(
  'target',private.admin_audit_target(to_jsonb(entry)->>'target'),actor_key,
  case when exists(select 1 from public.account_identities i
   where i.account_id=(to_jsonb(entry)->>actor_key)::uuid and i.deleted_at is not null)
  then null else to_jsonb(entry)->actor_key end)||
  (select jsonb_object_agg(k,private.admin_audit_fields(to_jsonb(entry)->k,to_jsonb(entry)->>'action'))
   from unnest(value_keys) k))
$$;


--

-- Name: admin_audit_target(text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.admin_audit_target(target text) RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $_$
 select case when target='erased' then target
 when target ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
  case when exists(select 1 from public.account_identities i where i.account_id=target::uuid and i.deleted_at is not null)
  then 'erased' else 'sha256:'||encode(sha256(convert_to((target::uuid)::text,'UTF8')),'hex') end
 when target ~ '^sha256:[0-9a-f]{64}$' then case when exists(select 1 from public.account_identities i
  where i.deleted_at is not null and target='sha256:'||encode(sha256(convert_to(i.account_id::text,'UTF8')),'hex'))
  then 'erased' else target end
 when target in ('search_accounts','get_rollout','list_reports','list_creators','mail','contact','audit') then target
 else 'sha256:'||encode(sha256(convert_to(target,'UTF8')),'hex') end
$_$;


--

-- Name: native_admin_account(uuid, text, text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.native_admin_account(p_account uuid, p_issuer text, p_environment text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
 select private.native_admin_account_before_1661_reports(p_account,p_issuer,p_environment)
 ||jsonb_build_object('report_promotion',private.report_promotion_progress(p_account,p_environment,statement_timestamp()))
 $$;


--

-- Name: native_admin_account_before_1593(uuid, text, text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.native_admin_account_before_1593(p_account uuid, p_issuer text, p_environment text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
 select private.native_admin_account_summary(p_account,p_issuer,p_environment)||jsonb_build_object(
  'creator_code',(select jsonb_build_object('code',c.code,'creator_id',c.creator_id,'creator_name',c.name) from (select p.discount_id from private.admin_payments p where p.account_id=p_account and p.environment=p_environment order by p.paid_at,p.payment_id limit 1) first_payment join private.admin_creators c on c.discount_id=first_payment.discount_id and c.environment=p_environment),
  'payments',coalesce((select jsonb_agg(item order by item->>'paid_at' desc) from private.native_admin_creator_lines(p_environment) where item->>'account_id'=p_account::text),'[]'::jsonb)||coalesce((select jsonb_agg(jsonb_build_object('payment_id',o.provider_order_id,'paid_at',o.created_at,'date_source','recorded_at','amount_basis','net','product','Launch Edition','period_index',1,'amount_cents',o.net_amount,'currency',o.currency,'refunded_cents',o.reported_refunded_amount,'status',o.status) order by o.created_at desc) from public.billing_orders o where o.user_id=p_account and o.environment=p_environment and not exists(select 1 from private.admin_payments p where p.environment=p_environment and p.payment_id=o.provider_order_id)),'[]'::jsonb),
  'subscriptions',coalesce((select jsonb_agg(s.provider_subscription_id) from public.billing_subscriptions s where s.user_id=p_account and s.environment=p_environment and s.provider='polar' and(s.status in('active','trialing','past_due') or s.cancel_at_period_end)),'[]'::jsonb))
$$;


--

-- Name: native_admin_account_before_1661_reports(uuid, text, text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.native_admin_account_before_1661_reports(p_account uuid, p_issuer text, p_environment text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
 select private.native_admin_account_summary(p_account,p_issuer,p_environment)||jsonb_build_object(
  'creator_code',(select jsonb_build_object('code',c.code,'creator_id',c.creator_id,'creator_name',c.name) from (select p.discount_id from private.admin_payments p where p.account_id=p_account and p.environment=p_environment order by p.paid_at,p.payment_id limit 1) first_payment join private.admin_creators c on c.creator_id=coalesce((select a.creator_id from private.creator_renewal_operations a where a.environment=p_environment and a.account_id=p_account and a.first_order_id=(select payment_id from private.admin_payments where environment=p_environment and account_id=p_account order by paid_at,payment_id limit 1) limit 1),(select c2.creator_id from private.admin_creators c2 where c2.environment=p_environment and c2.discount_id=first_payment.discount_id)) and c.environment=p_environment),
  'payments',coalesce((select jsonb_agg(item order by item->>'paid_at' desc) from private.native_admin_creator_lines(p_environment) where item->>'account_id'=p_account::text),'[]'::jsonb)||coalesce((select jsonb_agg(jsonb_build_object('payment_id',o.provider_order_id,'paid_at',o.created_at,'date_source','recorded_at','amount_basis','net','product',case when exists(select 1 from public.billing_access_grants g where g.user_id=o.user_id and g.environment=o.environment and g.source_type='order' and g.source_id=o.provider_order_id and g.capability='vantare.plan.founders') then 'Founders' else 'Launch Edition' end,'period_index',1,'amount_cents',o.net_amount,'currency',o.currency,'refunded_cents',o.reported_refunded_amount,'status',o.status) order by o.created_at desc) from public.billing_orders o where o.user_id=p_account and o.environment=p_environment and not exists(select 1 from private.admin_payments p where p.environment=p_environment and p.payment_id=o.provider_order_id)),'[]'::jsonb),
  'subscriptions',coalesce((select jsonb_agg(s.provider_subscription_id) from public.billing_subscriptions s where s.user_id=p_account and s.environment=p_environment and s.provider='polar' and(s.status in('active','trialing','past_due') or s.cancel_at_period_end)),'[]'::jsonb))
$$;


--

-- Name: native_admin_account_deletion(uuid, uuid, text, text, text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.native_admin_account_deletion(p_actor uuid, p_account uuid, p_issuer text, p_hash text, p_subject text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
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
 if p_account=p_actor or private.is_owner(p_account) then
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
end $_$;


--

-- Name: native_admin_account_summary(uuid, text, text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.native_admin_account_summary(p_account uuid, p_issuer text, p_environment text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
 with base as(select private.native_admin_account_v1(p_account,p_issuer,p_environment) data),
 grants as(select * from public.billing_effective_access_grants where user_id=p_account and environment=p_environment and status='active' and(valid_until is null or valid_until>now())),
 sub as(select * from public.billing_subscriptions where user_id=p_account and environment=p_environment and provider='polar' and(status in('active','trialing','past_due') or cancel_at_period_end) order by updated_at desc limit 1),
 access as(select r.module,r.enabled_for_all rollout, (select data->'roles'<>'[]'::jsonb from base) role,
  exists(select 1 from grants where capability=r.module and provider='vantare' and source_type='support') individual,
  exists(select 1 from grants where capability in(r.module,'vantare.plan.pro','vantare.plan.founders')) plan from public.module_rollout r)
 select data||jsonb_build_object(
  'owner',private.is_owner(p_account),
  'blocked',coalesce((select b.blocked from private.admin_account_blocks b where b.account_id=p_account),false),'blocked_reason',(select b.reason from private.admin_account_blocks b where b.account_id=p_account),
  'plan',case when exists(select 1 from grants where capability='vantare.plan.founders') then 'founders' when exists(select 1 from grants where capability='vantare.plan.pro') then case when exists(select 1 from grants where capability='vantare.channel.nightly') then 'pro_plus' else 'pro' end else 'free' end,
  'billing',case when exists(select 1 from grants where capability='vantare.plan.founders') then 'one_time' else (select case when current_period_end-current_period_start>interval '200 days' then 'yearly' else 'monthly' end from sub) end,
  'creator_renewal_operations',coalesce((select jsonb_agg(jsonb_build_object('subscription_id',subscription_id,'state',state,'selected_discount_id',selected_discount_id,'not_applied',not_applied,'completed_at',completed_at)) from private.creator_renewal_operations where environment=p_environment and account_id=p_account),'[]'::jsonb),
  'renews_at',(select current_period_end from sub),
  'billing_incidents',coalesce((select jsonb_agg(jsonb_build_object('resource_id',i.resource_id,'reason',i.reason,'severity',i.severity) order by i.created_at desc) from private.billing_payment_incidents i where i.account_id=p_account and i.environment=p_environment),'[]'::jsonb),
  'founders_transitions',coalesce((select jsonb_agg(jsonb_build_object('subscription_id',t.subscription_id,'policy',t.policy,'state',t.state,'paid_period_end',t.paid_period_end) order by t.created_at desc) from private.founders_subscription_transitions t where t.account_id=p_account and t.environment=p_environment),'[]'::jsonb),
  'modules',coalesce((select jsonb_agg(module order by module) from access where rollout or individual or plan or data->'roles'<>'[]'::jsonb),'[]'::jsonb),
  'module_access',(select jsonb_agg(to_jsonb(access) order by module) from access),
  'reports_count',(select count(*) from public.testing_contributions where account_id=p_account),
  'polar_customer_url',null) from base
$$;


--

-- Name: native_admin_account_v1(uuid, text, text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.native_admin_account_v1(p_account uuid, p_issuer text, p_environment text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select jsonb_build_object(
    'account_id', p.id, 'created_at', p.created_at,
    'clerk_subject', (select min(i.subject) from public.account_identities i
      where i.account_id = p.id and i.issuer in (p_issuer, p_issuer || '/')),
    'roles', coalesce((select jsonb_agg(case when a.role = 'owner' then 'owner' else 'tester' end)
      from public.operational_access_assignments a where a.user_id = p.id and a.status = 'active'
      and a.policy_version = 1 and (a.expires_at is null or a.expires_at > now())), '[]'::jsonb),
    'modules', coalesce((select jsonb_agg(r.module order by r.module) from public.module_rollout r
      where r.enabled_for_all or exists(select 1 from public.operational_access_assignments a
        where a.user_id = p.id and a.status = 'active' and a.policy_version = 1
        and (a.expires_at is null or a.expires_at > now()))
      or exists(select 1 from public.billing_access_grants g where g.user_id = p.id
        and g.capability = r.module and g.status = 'active' and g.provider = 'vantare'
        and g.source_type = 'support' and g.environment = p_environment and g.valid_until is null)), '[]'::jsonb),
    'reports_count', (select count(*) from public.testing_contributions r where r.account_id = p.id)
  ) from public.profiles p where p.id = p_account
$$;


--

-- Name: native_admin_commission_rate(integer); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.native_admin_commission_rate(p_period integer) RETURNS integer
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$ select case when p_period=1 then 3000 when p_period<=12 then 1000 else 0 end $$;


--

-- Name: native_admin_creator(uuid, text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.native_admin_creator(p_id uuid, p_environment text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
 select item from private.native_admin_creators(p_environment) where item->>'creator_id'=p_id::text
$$;


--

-- Name: native_admin_creator_lines(text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.native_admin_creator_lines(p_environment text) RETURNS TABLE(item jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
 with receipts as(select p.*,greatest(p.refunded_cents,coalesce((select sum(r.amount_cents) from private.admin_payment_refunds r where r.environment=p.environment and r.payment_id=p.payment_id and r.status='succeeded'),0)) refund_total,
 (p.refund_pending or exists(select 1 from private.admin_payment_issues i where i.environment=p.environment and i.payment_id=p.payment_id) or exists(select 1 from private.admin_payment_refunds r where r.environment=p.environment and r.payment_id=p.payment_id and r.status='pending')) pending from private.admin_payments p),
 firsts as(select distinct on(account_id) account_id,paid_at,discount_id from private.admin_payments where environment=p_environment order by account_id,paid_at,payment_id),
 lines as(select p.*,c.creator_id,case when (p.paid_at at time zone 'UTC')>=(f.paid_at at time zone 'UTC')+interval '12 months' then 13 else
  1+(select coalesce(max(n),0) from generate_series(0,11)n where(p.paid_at at time zone 'UTC')>=(f.paid_at at time zone 'UTC')+make_interval(months=>n)) end period_index
  from receipts p join firsts f using(account_id) left join private.admin_creators c on c.environment=p_environment and c.creator_id=coalesce(p.settled_creator_id,coalesce((select a.creator_id from private.creator_renewal_operations a where a.environment=p_environment and a.account_id=p.account_id and a.first_order_id=(select payment_id from private.admin_payments where environment=p_environment and account_id=p.account_id order by paid_at,payment_id limit 1) order by a.first_order_id limit 1),(select c2.creator_id from private.admin_creators c2 where c2.environment=p_environment and c2.discount_id=f.discount_id and c2.status='active'))) where p.environment=p_environment),
 rated as(select *,private.native_admin_commission_rate(period_index) rate_bp from lines)
 select jsonb_build_object('creator_id',creator_id,'account_id',account_id,'payment_id',payment_id,'paid_at',paid_at,'product',product,
  'period_index',period_index,'amount_cents',amount_cents,'currency',currency,'status',case when pending then 'refund_pending' when refund_total>=amount_cents then 'refunded' when refund_total>0 then 'partially_refunded' else 'paid' end,
  'refunded_cents',refund_total,'refunded',refund_total>0,'rate_bp',rate_bp,
  'refunded_at',(select max(r.modified_at) from private.admin_payment_refunds r where r.environment=p_environment and r.payment_id=rated.payment_id and r.status='succeeded'),
  'refund_reason',(select r.reason from private.admin_payment_refunds r where r.environment=p_environment and r.payment_id=rated.payment_id and r.status in('succeeded','pending') and r.reason is not null order by r.modified_at desc,r.refund_id limit 1),
  'history_complete',exists(select 1 from private.admin_payment_history h where h.environment=p_environment and h.account_id=rated.account_id),
  'commission_cents',greatest(coalesce(settled_commission_cents,0),case when pending or not exists(select 1 from private.admin_payment_history h where h.environment=p_environment and h.account_id=rated.account_id) then 0 else floor((greatest(0,amount_cents-refund_total)::numeric*rate_bp+5000)/10000)::bigint end)) from rated
$$;


--

-- Name: native_admin_creators(text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.native_admin_creators(p_environment text) RETURNS TABLE(item jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
 with lines as materialized(select item from private.native_admin_creator_lines(p_environment)),
 totals as(select (item->>'creator_id')::uuid creator_id,
  bool_and((item->>'history_complete')::boolean) history_complete,count(distinct item->>'account_id') clients_count,
  sum((item->>'amount_cents')::bigint-(item->>'refunded_cents')::bigint) sales_cents,
  sum((item->>'commission_cents')::bigint) earned_cents,
  sum((item->>'commission_cents')::bigint) filter(where (item->>'paid_at')::timestamptz<date_trunc('month',now() at time zone 'UTC') at time zone 'UTC') payable_cents
  from lines group by 1),
 payouts as(select creator_id,sum(amount_cents) paid_out_cents,max(paid_at) last_payout_at from private.admin_creator_payouts group by 1)
 select to_jsonb(c)-'discount_id'-'environment'||jsonb_build_object(
  'history_complete',coalesce(t.history_complete,true),'clients_count',coalesce(t.clients_count,0),
  'sales_cents',coalesce(t.sales_cents,0),'earned_cents',coalesce(t.earned_cents,0),
  'paid_out_cents',coalesce(p.paid_out_cents,0),
  'owed_cents',greatest(0,coalesce(t.earned_cents,0)-coalesce(p.paid_out_cents,0)),
  'payable_cents',greatest(0,coalesce(t.payable_cents,0)-coalesce(p.paid_out_cents,0)), 'last_payout_at',p.last_payout_at)
 from private.admin_creators c left join totals t using(creator_id) left join payouts p using(creator_id) where c.environment=p_environment
$$;


--

-- Name: native_admin_execute_before_creator_coupon(uuid, text, text, jsonb, text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.native_admin_execute_before_creator_coupon(p_actor uuid, p_issuer text, p_action text, p_params jsonb, p_environment text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_lock_account uuid;
 v_before jsonb; v_after jsonb; v_rows jsonb; v_counts jsonb; v_id text; v_status text; v_version text; v_limit integer; v_account uuid; v_creator private.admin_creators%rowtype; v_amount bigint; v_paid_at timestamptz; v_lock record; v_remaining bigint; v_applied bigint;
begin

 if p_action in ('get_account_deletion','prepare_account_deletion') then
  if p_environment is distinct from 'sandbox' then raise exception 'native_admin_invalid' using errcode='22023'; end if;
  return private.native_admin_account_deletion(p_actor,(p_params->>'account_id')::uuid,p_issuer,p_params->>'confirmation_hash',
   case when p_action='prepare_account_deletion' then p_params->>'clerk_subject' end);
 end if;
 -- Preserve #1622 UUID-before-rows when replacing the older admin entry.
 if p_action in ('get_account','set_tester','set_module','set_blocked','delete_account') then
  v_account := (p_params->>'account_id')::uuid;
 elsif p_action in ('get_report','set_report_status') then
  select account_id into v_account from public.testing_contributions where id::text=p_params->>'report_id';
 end if;

  for v_lock_account in select distinct a from unnest(array[p_actor,v_account]) a where a is not null order by a loop
    if private.lock_account_write(v_lock_account) and (v_lock_account=p_actor or
      p_action not in ('search_accounts','get_account','get_rollout','list_reports','get_report')) then
      raise sqlstate '28000' using message='account_deleted';
    end if;
  end loop;

 -- #1608 R5-P2-1: do not proceed with a UUID collected before ownership changed.
 if p_action in ('get_report','set_report_status') and v_account is distinct from (select account_id from public.testing_contributions where id::text=p_params->>'report_id') then
  raise sqlstate '40001' using message='admin_report_owner_changed';
 end if;
 perform private.native_admin_require_owner(p_actor);
 if p_environment is null or p_environment not in('sandbox','production') or p_issuer is null or p_issuer!~'^https://' or jsonb_typeof(p_params) is distinct from 'object' then
  raise exception 'native_admin_invalid' using errcode='22023'; end if;
 if p_action='get_payment_sync' then
  return jsonb_build_object('needs_sync',not exists(select 1 from private.admin_payment_sync where environment=p_environment) );
 elsif p_action='resolve_payment_account' then
  select user_id into v_account from public.billing_customers where provider='polar' and environment=p_environment and provider_customer_id=p_params->>'customer_id';
  if v_account is null and p_params->>'external_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then select id into v_account from public.profiles where id=(p_params->>'external_id')::uuid; end if;
  if v_account is null then select account_id into v_account from public.account_identities where issuer in(p_issuer,p_issuer||'/') and subject=p_params->>'external_id' order by account_id limit 1; end if;
  return jsonb_build_object('account_id',v_account);
 elsif p_action='sync_admin_payment' then
  perform public.native_admin_record_payment(p_environment,p_params->'payment'); return '{}'::jsonb;
 elsif p_action='sync_admin_refund_issue' then
  if nullif(p_params->>'payment_id','') is null or length(p_params->>'payment_id')>200 then raise exception 'native_admin_invalid' using errcode='22023'; end if;
  insert into private.admin_payment_issues values(p_environment,p_params->>'payment_id') on conflict do nothing;
  return '{}'::jsonb;
 elsif p_action='sync_admin_refund' then
  begin
   perform public.native_admin_record_refund(p_environment,p_params->'refund');
  exception when data_exception or check_violation or object_not_in_prerequisite_state then
   -- Roll back this refund only; an inconsistent invoice stays unavailable for payout.
   insert into private.admin_payment_issues values(p_environment,p_params->'refund'->>'payment_id') on conflict do nothing;
  end;
  return '{}'::jsonb;
 elsif p_action='finish_payment_sync' then
  if jsonb_typeof(p_params->'account_ids') is distinct from 'array' or jsonb_array_length(p_params->'account_ids')>10000 then raise exception 'native_admin_invalid' using errcode='22023'; end if;
  insert into private.admin_payment_history(environment,account_id) select p_environment,value::uuid from jsonb_array_elements_text(p_params->'account_ids') on conflict do nothing;
  delete from private.admin_payment_history where environment=p_environment and account_id in(select value::uuid from jsonb_array_elements_text(coalesce(p_params->'incomplete_ids','[]'::jsonb)));
  insert into private.admin_payment_sync values(p_environment,clock_timestamp()) on conflict(environment) do update set last_synced_at=excluded.last_synced_at;
  return '{}'::jsonb;
 end if;
 if p_action='search_accounts' then
  v_after:=private.native_admin_execute_v1(p_actor,p_issuer,p_action,p_params,p_environment);
  select coalesce(jsonb_agg(c-'payments'-'module_access'-'subscriptions'),'[]'::jsonb) into v_rows from jsonb_array_elements(v_after->'accounts')c;
  select jsonb_build_object('all',count(*),'paying',count(*) filter(where g.user_id is not null),'testers',count(*) filter(where a.role='tester'),'blocked',count(*) filter(where b.blocked)) into v_counts
   from public.profiles p
   left join (select distinct user_id from public.billing_access_grants where environment=p_environment and capability='vantare.plan.pro' and status='active' and(valid_until is null or valid_until>now())) g on g.user_id=p.id
   left join public.operational_access_assignments a on a.user_id=p.id and a.status='active' and(a.expires_at is null or a.expires_at>now())
   left join private.admin_account_blocks b on b.account_id=p.id
   where exists(select 1 from public.account_identities i where i.account_id=p.id and i.issuer in(p_issuer,p_issuer||'/'));
  return v_after||jsonb_build_object('accounts',v_rows,'counts',v_counts);
 elsif p_action='get_account' then
  v_account:=(p_params->>'account_id')::uuid;
  if not exists(select 1 from public.profiles where id=v_account) then raise exception 'native_admin_not_found' using errcode='P0002'; end if;
  v_after:=jsonb_build_object('account',private.native_admin_account(v_account,p_issuer,p_environment));
  insert into public.admin_audit_log(actor_account_id,action,target) values(p_actor,p_action,v_account::text);
  return v_after;
 elsif p_action='get_rollout' then
  v_after:=private.native_admin_execute_v1(p_actor,p_issuer,p_action,p_params,p_environment);
  select jsonb_agg(c||jsonb_build_object('individual_count',(select count(distinct g.user_id) from public.billing_access_grants g where g.capability=c->>'module' and g.provider='vantare' and g.source_type='support' and g.environment=p_environment and g.status='active' and(g.valid_until is null or g.valid_until>now())))) into v_rows from jsonb_array_elements(v_after->'rollout')c;
  return v_after||jsonb_build_object('rollout',v_rows,'accounts_total',(select count(*) from public.profiles));
 end if;
 if p_action='record_creator_payout' then
  select * into v_creator from private.admin_creators where creator_id=(p_params->>'creator_id')::uuid and environment=p_environment for update;
  if not found then raise exception 'native_admin_not_found' using errcode='P0002'; end if;
  -- Serialize settlement with verified receipt/refund updates for these accounts.
  for v_lock in select distinct item->>'account_id' account from private.native_admin_creator_lines(p_environment) where item->>'creator_id'=v_creator.creator_id::text order by 1 loop
   perform pg_advisory_xact_lock(hashtextextended(p_environment||':'||v_lock.account,1627)); end loop;
  v_amount:=(p_params->>'amount_cents')::bigint; v_paid_at:=coalesce((p_params->>'paid_at')::timestamptz,clock_timestamp());
  v_before:=private.native_admin_creator(v_creator.creator_id,p_environment);
  if v_before->>'history_complete'='false' then raise exception 'native_admin_owner_conflict' using errcode='55000'; end if;
  if v_amount is null or v_amount<=0 or v_amount>(v_before->>'payable_cents')::bigint or v_paid_at>clock_timestamp() then raise exception 'native_admin_owner_conflict' using errcode='55000'; end if;
  -- Protect exactly the money already paid, oldest eligible commission first.
  -- Partial settlement must not freeze an unpaid line against a later refund.
  v_remaining:=v_amount;
  for v_lock in
   select p.payment_id,greatest(0,(q.item->>'commission_cents')::bigint-coalesce(p.settled_commission_cents,0)) available
   from private.native_admin_creator_lines(p_environment) q join private.admin_payments p on p.environment=p_environment and p.payment_id=q.item->>'payment_id'
   where q.item->>'creator_id'=v_creator.creator_id::text and p.paid_at<date_trunc('month',clock_timestamp() at time zone 'UTC') at time zone 'UTC' and q.item->>'status'<>'refund_pending'
   order by p.paid_at,p.payment_id
  loop
   v_applied:=least(v_remaining,v_lock.available);
   if v_applied>0 then
    update private.admin_payments set settled_commission_cents=coalesce(settled_commission_cents,0)+v_applied,settled_creator_id=v_creator.creator_id where environment=p_environment and payment_id=v_lock.payment_id;
    v_remaining:=v_remaining-v_applied;
   end if;
   exit when v_remaining=0;
  end loop;
  if v_remaining<>0 then raise exception 'native_admin_owner_conflict' using errcode='55000'; end if;
  insert into private.admin_creator_payouts(creator_id,amount_cents,paid_at,actor) values(v_creator.creator_id,v_amount,v_paid_at,p_actor);
  v_after:=private.native_admin_creator(v_creator.creator_id,p_environment);
  insert into public.admin_audit_log(actor_account_id,action,target,before_value,after_value) values(p_actor,p_action,v_creator.creator_id::text,v_before,v_after);
  return jsonb_build_object('creator',v_after);
 end if;
 if p_action='get_creator' then
  v_before:=private.native_admin_creator((p_params->>'creator_id')::uuid,p_environment);
  if v_before is null then raise exception 'native_admin_not_found' using errcode='P0002'; end if;
  select coalesce(jsonb_agg(item||jsonb_build_object('clerk_subject',(select min(i.subject) from public.account_identities i where i.account_id=(item->>'account_id')::uuid and i.issuer in(p_issuer,p_issuer||'/'))) order by item->>'paid_at'),'[]'::jsonb)
    into v_rows from private.native_admin_creator_lines(p_environment) where item->>'creator_id'=p_params->>'creator_id';
  v_after:=jsonb_build_object('creator',v_before,'lines',v_rows);
  insert into public.admin_audit_log(actor_account_id,action,target,after_value) values(p_actor,p_action,p_params->>'creator_id',null); return v_after;
 end if;
 if p_action='list_creators' then
  select coalesce(jsonb_agg(item order by item->>'name',item->>'creator_id'),'[]'::jsonb) into v_rows from private.native_admin_creators(p_environment);
  select jsonb_build_object('owed_cents',coalesce(sum((c->>'owed_cents')::bigint),0),'sales_cents',coalesce(sum((c->>'sales_cents')::bigint),0),'clients_count',coalesce(sum((c->>'clients_count')::bigint),0)) into v_counts from jsonb_array_elements(v_rows)c;
  v_after:=jsonb_build_object('creators',v_rows,'totals',v_counts);
  insert into public.admin_audit_log(actor_account_id,action,target,after_value) values(p_actor,p_action,p_action,null); return v_after;
 end if;
 if p_action in('create_creator','activate_creator') then
  if p_environment<>'sandbox' then raise exception 'native_admin_invalid' using errcode='22023'; end if;
  if p_action='create_creator' then
   if nullif(trim(p_params->>'name'),'') is null or length(p_params->>'name')>120 or nullif(p_params->>'email','') is null or length(p_params->>'email')>320 or p_params->>'email' not like '%@%' or p_params->>'code' is null or p_params->>'code' !~ '^[A-Z0-9]{3,32}$' then
    raise exception 'native_admin_invalid' using errcode='22023'; end if;
   insert into private.admin_creators(environment,name,email,code) values(p_environment,p_params->>'name',p_params->>'email',p_params->>'code') on conflict(environment,code) do nothing;
   select * into v_creator from private.admin_creators where environment=p_environment and code=p_params->>'code' for update;
   if v_creator.name is distinct from p_params->>'name' or v_creator.email is distinct from p_params->>'email' then raise exception 'native_admin_owner_conflict' using errcode='55000'; end if;
  else
   select * into v_creator from private.admin_creators where creator_id=(p_params->>'creator_id')::uuid and environment=p_environment for update;
   if not found then raise exception 'native_admin_not_found' using errcode='P0002'; end if;
   if nullif(p_params->>'discount_id','') is null or length(p_params->>'discount_id')>200 or(v_creator.discount_id is not null and v_creator.discount_id<>p_params->>'discount_id') then raise exception 'native_admin_owner_conflict' using errcode='55000'; end if;
   update private.admin_creators set discount_id=p_params->>'discount_id',status='active' where creator_id=v_creator.creator_id returning * into v_creator;
  end if;
  v_after:=to_jsonb(v_creator)-'discount_id'-'environment';
  insert into public.admin_audit_log(actor_account_id,action,target,before_value,after_value) values(p_actor,'create_creator',v_creator.creator_id::text,null,v_after);
  return jsonb_build_object('creator',v_after);
 end if;
 if p_action='set_blocked' then
  if p_environment<>'sandbox' or jsonb_typeof(p_params->'blocked') is distinct from 'boolean' or length(p_params->>'reason')>200 then raise exception 'native_admin_invalid' using errcode='22023'; end if;
  v_account:=(p_params->>'account_id')::uuid;
  perform 1 from public.profiles where id=v_account for update;
  if not found then raise exception 'native_admin_not_found' using errcode='P0002'; end if;
  if private.is_owner(v_account) or v_account=p_actor then
   raise exception 'native_admin_owner_conflict' using errcode='55000'; end if;
  v_before:=private.native_admin_account(v_account,p_issuer,p_environment);
  insert into private.admin_account_blocks(account_id,blocked,reason) values(v_account,(p_params->>'blocked')::boolean,case when (p_params->>'blocked')::boolean then p_params->>'reason' else null end) on conflict(account_id) do update set blocked=excluded.blocked,reason=excluded.reason;
  v_after:=private.native_admin_account(v_account,p_issuer,p_environment);
  insert into public.admin_audit_log(actor_account_id,action,target,before_value,after_value) values(p_actor,p_action,v_account::text,v_before,v_after);
  return jsonb_build_object('account_id',v_account,'blocked',p_params->'blocked');
 end if;
 if p_action not in('list_reports' ,'get_report','set_report_status') then
  return private.native_admin_execute_v1(p_actor,p_issuer,p_action,p_params,p_environment); end if;
 if p_action='list_reports' then
  v_limit:=(p_params->>'limit')::integer;
  if v_limit is null or v_limit not between 1 and 100 then raise exception 'native_admin_invalid' using errcode='22023'; end if;
  select coalesce(jsonb_agg(item - 'screenshots' - 'payload' order by item->>'report_id'),'[]'::jsonb) into v_rows
   from (select item from private.native_admin_reports(p_issuer) where (p_params->>'status' is null or item->>'status'=p_params->>'status')
    and(p_params->>'cursor' is null or item->>'report_id'>p_params->>'cursor') order by item->>'report_id' limit v_limit) q;
  select coalesce(jsonb_object_agg(status,n),'{}'::jsonb) into v_counts from(select item->>'status' status,count(*) n from private.native_admin_reports(p_issuer) group by 1) q;
  v_after:=jsonb_build_object('reports',v_rows,'counts',v_counts,'next_cursor',case when jsonb_array_length(v_rows)=v_limit then v_rows->(v_limit-1)->>'report_id' else null end);
  v_id:=p_action;
 else
  v_id:=p_params->>'report_id';
  -- Lock the source before reading or modifying. UUIDs identify current reports.
  perform 1 from public.testing_contributions where id::text=v_id for update;
  select item into v_before from private.native_admin_reports(p_issuer) where item->>'report_id'=v_id;
  if v_before is null then raise exception 'native_admin_not_found' using errcode='P0002'; end if;
  if p_action='get_report' then v_after:=jsonb_build_object('report',v_before);
  else
   v_status:=p_params->>'status'; v_version:=p_params->>'fixed_in_version';
   if v_status is null or v_status not in('submitted','in_review','validated','rejected','spam','fixed','closed','duplicate_linked','incomplete')
    or length(p_params->>'reason')>500 or (v_status='fixed' and (v_version is null or length(v_version)>60 or v_version!~'^[0-9]+\.[0-9]+\.[0-9]+(\.[0-9]+)?(-[a-z0-9.-]+)?$')) then
    raise exception 'native_admin_invalid' using errcode='22023'; end if;
   if v_status='fixed' and v_before->>'status' not in('validated','fixed') then raise exception 'native_admin_owner_conflict' using errcode='55000'; end if;
   perform private.native_admin_review_report(p_actor,v_id::uuid,v_status,v_version,p_params->>'reason');
   select item into v_rows from private.native_admin_reports(p_issuer) where item->>'report_id'=v_id;
   v_after:=jsonb_build_object('report_id',v_id,'status',v_status);
  end if;
 end if;
 insert into public.admin_audit_log(actor_account_id,action,target,before_value,after_value) values(p_actor,p_action,v_id,case when p_action='set_report_status' then jsonb_build_object('status',v_before->'status') end,case when p_action='set_report_status' then v_after end);
 return v_after;
end $_$;


--

-- Name: native_admin_execute_v1(uuid, text, text, jsonb, text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.native_admin_execute_v1(p_actor uuid, p_issuer text, p_action text, p_params jsonb, p_environment text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_account uuid;
  v_report text;
  v_module text;
  v_enabled boolean;
  v_before jsonb;
  v_after jsonb;
  v_result jsonb;
  v_target text;
  v_role text;
  v_limit integer;
  v_source text;
  v_cursor uuid;
  v_next text;
  v_more boolean;
  v_corr text := 'native-admin:' || gen_random_uuid()::text;
begin
  perform private.native_admin_require_owner(p_actor);
  if p_environment is null or p_environment not in ('production','sandbox')
    or p_issuer is null or p_issuer !~ '^https://' or jsonb_typeof(p_params) is distinct from 'object' then
    raise exception 'native_admin_invalid' using errcode = '22023';
  end if;
  v_target := p_action;
  if p_action in ('get_account','set_tester','set_module') then
    v_account := (p_params->>'account_id')::uuid;
    perform 1 from public.profiles where id = v_account for update;
    if not found then raise exception 'native_admin_not_found' using errcode = 'P0002'; end if;
    v_target := v_account::text;
    v_before := private.native_admin_account_summary(v_account, p_issuer, p_environment);
  end if;
  if p_action in ('set_module','set_rollout') then
    v_module := p_params->>'module';
    perform 1 from public.module_rollout where module = v_module for update;
    if not found then raise exception 'native_admin_invalid' using errcode = '22023'; end if;
  end if;
  if p_action = 'search_accounts' then
    v_limit := (p_params->>'limit')::integer;
    if v_limit is null or v_limit not between 1 and 50 then
      raise exception 'native_admin_invalid' using errcode = '22023';
    end if;
    if p_params->>'query' = '' then
      if p_params ? 'cursor' and (jsonb_typeof(p_params->'cursor') is distinct from 'string'
        or p_params->>'cursor' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
        raise exception 'native_admin_invalid' using errcode = '22023';
      end if;
      v_cursor := (p_params->>'cursor')::uuid;
      -- Only existing accounts mapped to this Clerk issuer. No bootstrap of targets.
      with page as (
        select p.id, p.created_at from public.profiles p
        where exists(select 1 from public.account_identities i where i.account_id = p.id
          and i.issuer in (p_issuer, p_issuer || '/'))
          and (v_cursor is null or (p.created_at, p.id) <
            (select c.created_at, c.id from public.profiles c where c.id = v_cursor
              and exists(select 1 from public.account_identities i where i.account_id = c.id
                and i.issuer in (p_issuer, p_issuer || '/'))))
        order by p.created_at desc, p.id desc limit v_limit + 1
      ), numbered as (
        select page.*, row_number() over(order by created_at desc, id desc) as rn from page
      )
      select coalesce(jsonb_agg(private.native_admin_account_summary(id, p_issuer, p_environment)
          order by created_at desc, id desc) filter(where rn <= v_limit), '[]'::jsonb),
        max(id::text) filter(where rn = v_limit), count(*) > v_limit
      into v_after, v_next, v_more from numbered;
      v_result := jsonb_build_object('accounts', v_after, 'next_cursor', case when v_more then v_next else null end);
    else
      if jsonb_typeof(p_params->'subjects') is distinct from 'array'
        or jsonb_array_length(p_params->'subjects') > 50 or p_params ? 'cursor' then
        raise exception 'native_admin_invalid' using errcode = '22023';
      end if;
      select coalesce(jsonb_agg(private.native_admin_account_summary(matches.account_id, p_issuer, p_environment)), '[]'::jsonb)
      into v_after from (select distinct i.account_id from public.account_identities i
        where i.issuer in (p_issuer, p_issuer || '/')
        and i.subject in (select jsonb_array_elements_text(p_params->'subjects'))
        order by i.account_id limit v_limit) matches;
      v_result := jsonb_build_object('accounts', v_after);
    end if;
  elsif p_action = 'get_account' then
    v_after := v_before;
    v_result := jsonb_build_object('account', v_after);
  elsif p_action = 'set_tester' then
    if jsonb_typeof(p_params->'enabled') is distinct from 'boolean' then
      raise exception 'native_admin_invalid' using errcode = '22023';
    end if;
    v_enabled := (p_params->>'enabled')::boolean;
    v_before := jsonb_build_object('account', v_before,
      'assignment', (select to_jsonb(a) from public.operational_access_assignments a where user_id = v_account and role = 'tester'),
      'membership', (select to_jsonb(m) from public.testing_center_memberships m where user_id = v_account));
    if v_enabled and exists(select 1 from public.operational_access_assignments
      where user_id = v_account and role = 'owner' and status = 'active' and expires_at <= now()) then
      raise exception 'native_admin_owner_conflict' using errcode = '55000';
    end if;
    -- Tester toggles never rewrite a live owner's membership or assignment.
    if not private.is_owner(v_account) then
      perform public.operational_access_set(v_account, 'tester', case when v_enabled then 'grant' else 'revoke' end,
        'native-admin:' || p_actor::text, 'Beta tester administration', v_corr, null);
      select case when role = 'nightly_tester' then 'primary_tester' else 'tester' end
      into v_role from public.operational_access_assignments where user_id = v_account
        and role <> 'owner' and status = 'active' and policy_version = 1
        and (expires_at is null or expires_at > now());
      insert into public.testing_center_memberships(user_id, actor_id, role, active)
      values(v_account, 'account:' || v_account::text, coalesce(v_role, 'tester'), v_role is not null)
      on conflict(user_id) do update set role = excluded.role, active = excluded.active, updated_at = now();
    end if;
    v_after := jsonb_build_object('account', private.native_admin_account_summary(v_account, p_issuer, p_environment),
      'assignment', (select to_jsonb(a) from public.operational_access_assignments a where user_id = v_account and role = 'tester'),
      'membership', (select to_jsonb(m) from public.testing_center_memberships m where user_id = v_account));
    v_result := case when private.is_owner(v_account) then
      jsonb_build_object('account_id',v_account,'owner',true,'unchanged',true)
      else jsonb_build_object('account_id',v_account,'enabled',v_enabled) end;
  elsif p_action = 'set_module' then
    if jsonb_typeof(p_params->'enabled') is distinct from 'boolean' then
      raise exception 'native_admin_invalid' using errcode = '22023';
    end if;
    v_enabled := (p_params->>'enabled')::boolean;
    v_source := 'beta-module:' || v_account::text || ':' || split_part(v_module, '.', 3);
    v_before := jsonb_build_object('account', v_before, 'grants', (select coalesce(jsonb_agg(to_jsonb(g) order by g.id), '[]'::jsonb)
      from public.billing_access_grants g where g.user_id = v_account and g.capability = v_module
      and g.provider = 'vantare' and g.environment = p_environment and g.source_type = 'support'));
    if not v_enabled then
      -- Revoke all support grants for this module in the selected environment.
      update public.billing_access_grants set status = 'revoked', resource_modified_at = now(), updated_at = now()
      where user_id = v_account and capability = v_module and provider = 'vantare'
        and environment = p_environment and source_type = 'support' and status = 'active';
    else
      insert into public.billing_access_grants(user_id,provider,environment,source_type,source_id,capability,
        status,valid_until,resource_modified_at,snapshot_hash,metadata)
      values(v_account,'vantare',p_environment,'support',v_source,v_module,'active',null,now(),
        encode(sha256(convert_to(v_source,'UTF8')),'hex'),jsonb_build_object('reason','beta module access'))
      on conflict(provider,environment,source_type,source_id,capability) do update set
        status = 'active', valid_until = null, resource_modified_at = now(), updated_at = now();
    end if;
    v_after := jsonb_build_object('account', private.native_admin_account_summary(v_account, p_issuer, p_environment),
      'grants', (select coalesce(jsonb_agg(to_jsonb(g) order by g.id), '[]'::jsonb) from public.billing_access_grants g
        where g.user_id = v_account and g.capability = v_module and g.provider = 'vantare'
        and g.environment = p_environment and g.source_type = 'support'));
    v_result := jsonb_build_object('account_id', v_account, 'module', v_module, 'enabled', v_enabled);
  elsif p_action = 'get_rollout' then
    select coalesce(jsonb_agg(to_jsonb(r) order by r.module), '[]'::jsonb) into v_after from public.module_rollout r;
    v_result := jsonb_build_object('rollout', v_after);
  elsif p_action = 'set_rollout' then
    if jsonb_typeof(p_params->'enabled_for_all') is distinct from 'boolean' then
      raise exception 'native_admin_invalid' using errcode = '22023';
    end if;
    v_target := v_module;
    select to_jsonb(r) into v_before from public.module_rollout r where module = v_module;
    update public.module_rollout r set enabled_for_all = (p_params->>'enabled_for_all')::boolean, updated_at = now()
      where module = v_module returning to_jsonb(r) into v_after;
    v_result := jsonb_build_object('rollout', v_after);
  else raise exception 'native_admin_invalid' using errcode = '22023';
  end if;
  insert into public.admin_audit_log(actor_account_id, action, target, before_value, after_value)
  values(p_actor, p_action, v_target, case when p_action in ('get_account','search_accounts','get_rollout','list_reports','get_report') then null else v_before end, case when p_action in ('get_account','search_accounts','get_rollout','list_reports','get_report') then null else v_after end);
  return v_result;
end;
$_$;


--

-- Name: native_admin_reports(text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.native_admin_reports(p_issuer text) RETURNS TABLE(item jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
 select jsonb_build_object('report_id',c.id,'account_id',c.account_id,
  'status',case c.state when 'received' then 'submitted' when 'reviewing' then 'in_review' when 'accepted' then 'validated' when 'fixed' then 'fixed' when 'spam' then 'spam' else 'rejected' end,
  'created_at',c.created_at,'title',c.title,'action_text',c.body,'module','hub','app_version',c.channel,
  'fixed_in_version',f.fixed_version,'reject_reason',f.reject_reason,
  'clerk_subject',(select min(i.subject) from public.account_identities i where i.account_id=c.account_id and i.issuer in(p_issuer,p_issuer||'/')),
  'screenshots_count',0,'has_screenshots',false,'screenshots','[]'::jsonb)
 from public.testing_contributions c left join public.testing_report_followup f on f.contribution_id=c.id
$$;


--

-- Name: native_admin_require_owner(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.native_admin_require_owner(p_actor uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  perform private.lock_accounts_before_rows(array[p_actor]);
  -- Preserve the UUID and assignment locks; only is_owner decides authority.
  perform 1 from public.operational_access_assignments
  where user_id = p_actor and role = 'owner' and status = 'active' and policy_version = 1
    and (expires_at is null or expires_at > now()) for update;
  if not private.is_owner(p_actor) then raise exception 'native_admin_forbidden' using errcode = '42501'; end if;
end;
$$;


--

-- Name: native_admin_review_report(uuid, uuid, text, text, text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.native_admin_review_report(p_actor uuid, p_id uuid, p_status text, p_version text, p_note text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare c public.testing_contributions%rowtype;
begin
 perform private.native_admin_require_owner(p_actor);
 select * into c from public.testing_contributions where id=p_id for update;
 if not found then raise exception 'native_admin_not_found' using errcode='P0002'; end if;
 if p_status in ('validated','rejected','spam','closed','duplicate_linked','incomplete') then
  perform private.testing_contribution_review_as(p_actor,p_id,case p_status when 'validated' then 'accepted' when 'spam' then 'spam' else 'declined' end,p_note,null);
 elsif p_status='fixed' then
  if c.state not in ('accepted','fixed') then raise exception 'native_admin_owner_conflict' using errcode='55000'; end if;
  insert into public.testing_report_followup(contribution_id,fixed_version,reviewed_title,reviewed_summary)
   values(p_id,p_version,c.title,left(c.title,200)) on conflict(contribution_id) do update
    set fixed_version=excluded.fixed_version,reviewed_title=excluded.reviewed_title,reviewed_summary=excluded.reviewed_summary;
  update public.testing_contributions set state='fixed' where id=p_id;
 elsif p_status in ('submitted','in_review') then
  if c.state not in ('received','reviewing') or exists(select 1 from public.testing_contribution_reviews where contribution_id=p_id) then
   raise exception 'testing_review_conflict' using errcode='23505'; end if;
  update public.testing_contributions set state=case p_status when 'submitted' then 'received' else 'reviewing' end where id=p_id;
 else raise exception 'native_admin_invalid' using errcode='22023'; end if;
 insert into public.testing_report_followup(contribution_id,reject_reason) values(p_id,case when p_status in ('rejected','spam') then p_note else null end)
  on conflict(contribution_id) do update set reject_reason=excluded.reject_reason;
end $$;


--

-- Name: native_admin_begin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.native_admin_begin(p_actor uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_requests integer;
begin
  perform private.native_admin_require_owner(p_actor);
  insert into private.native_admin_rate as budget(actor, window_start, requests)
  values(p_actor, date_trunc('minute', now()), 1)
  on conflict(actor) do update set
    window_start = excluded.window_start,
    requests = case when budget.window_start = excluded.window_start then budget.requests + 1 else 1 end
  returning requests into v_requests;
  return v_requests <= 60;
end;
$$;


--

-- Name: native_admin_claim_change(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.native_admin_claim_change(p_actor uuid, p_request uuid, p_account uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_token uuid;
begin
 perform private.lock_accounts_before_rows(array[p_actor,p_account]);
 perform private.native_admin_require_owner(p_actor);
 if p_request is null or p_account is null then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 -- Keep the previous request reference on release. Never overwrite it while
 -- any of its effects is unresolved, including Polar effects with another hash.
 -- The identity fallback also covers Clerk intents from pre-lease step 5a.
 if exists(select 1 from private.admin_pending_effects e where
   e.request_id=(select request_id from private.admin_change_leases where account_id=p_account)
   or e.target_hash in (select encode(sha256(convert_to(i.subject,'UTF8')),'hex')
                       from public.account_identities i where i.account_id=p_account))
 then
  if exists(select 1 from private.admin_change_leases where account_id=p_account and expires_at>clock_timestamp()) then
   raise exception 'native_admin_change_in_progress' using errcode='40001'; end if;
  raise exception 'native_admin_effects_pending' using errcode='40001'; end if;

 insert into private.admin_change_leases as l(account_id,actor,request_id,token,expires_at)
 values(p_account,p_actor,p_request,gen_random_uuid(),clock_timestamp()+interval '480 seconds')
 on conflict(account_id) do update set
 actor=excluded.actor,request_id=excluded.request_id,
 token=case when l.expires_at>clock_timestamp() and l.actor=p_actor and l.request_id=p_request then l.token else excluded.token end,
 expires_at=case when l.expires_at>clock_timestamp() and l.actor=p_actor and l.request_id=p_request then l.expires_at else clock_timestamp()+interval '480 seconds' end
 where l.expires_at<=clock_timestamp() or (l.actor=p_actor and l.request_id=p_request)
 returning token into v_token;
 if v_token is null then raise exception 'native_admin_change_in_progress' using errcode='40001'; end if;
 return v_token;
end;
$$;


--

-- Name: native_admin_claim_mail_erasure(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.native_admin_claim_mail_erasure(p_request uuid, p_effect uuid, p_actor uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare claimed jsonb; job jsonb;
begin
 if p_request is null or p_effect is null then
  raise exception 'native_admin_invalid' using errcode='22023';
 end if;
 if p_actor is not null then perform private.native_admin_require_owner(p_actor); end if;
 claimed:=public.mail_erasure_claim();
 job:=claimed->'job';
 if job is null or job='null'::jsonb then return claimed; end if;
 if public.native_admin_record_mail_erasure((job->>'id')::uuid,(job->>'lease')::uuid,
   p_request,p_effect,'started',null,p_actor) is distinct from true then
  raise exception 'mail_cleanup_audit_unavailable' using errcode='55000';
 end if;
 return claimed;
end$$;


--

-- Name: native_admin_claim_mail_send(uuid, uuid, uuid, uuid, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.native_admin_claim_mail_send(p_actor uuid, p_request uuid, p_effect uuid, p_campaign uuid, p_revision integer, p_environment text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare claimed jsonb; delivery jsonb;
begin
 if p_request is null or p_effect is null or p_campaign is null or p_revision is null or p_revision<1 then
  raise exception 'native_admin_invalid' using errcode='22023';
 end if;
 claimed:=public.mail_admin_execute(p_actor,'mail_claim',jsonb_build_object('campaign_id',p_campaign,'revision',p_revision),p_environment);
 delivery:=claimed->'delivery';
 if delivery is null or delivery='null'::jsonb then return claimed; end if;
 if public.native_admin_record_mail_send(p_actor,p_request,p_effect,(delivery->>'id')::uuid,p_environment,'started') is distinct from true then
  raise exception 'mail_send_audit_unavailable' using errcode='55000';
 end if;
 return claimed;
end$$;


--

-- Name: native_admin_execute(uuid, text, text, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.native_admin_execute(p_actor uuid, p_issuer text, p_action text, p_params jsonb, p_environment text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare v_result jsonb; v_monthly uuid; v_annual uuid; account uuid; current_enabled boolean;
begin
 if p_action='list_pending_effects' then
  perform private.lock_accounts_before_rows(array[p_actor]);
  perform private.native_admin_require_owner(p_actor);
  if p_issuer is null or p_issuer!~'^https://' or p_environment is null or p_environment not in('production','sandbox')
   or jsonb_typeof(p_params) is distinct from 'object' or p_params-array['cursor']<>'{}'
   or (p_params ? 'cursor' and (jsonb_typeof(p_params->'cursor') is distinct from 'string'
    or (p_params->>'cursor')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) then
   raise exception 'native_admin_invalid' using errcode='22023'; end if;
  with page as (
   select effect_id,request_id,action,effect,occurred_at,latest_outcome,latest_provider_status
   from private.admin_pending_effects where not(p_params ? 'cursor') or effect_id>(p_params->>'cursor')::uuid
   order by effect_id limit 51
  ), numbered as (select *,row_number() over(order by effect_id) n from page)
  select jsonb_build_object('effects',coalesce(jsonb_agg(jsonb_build_object(
   'effect_id',effect_id,'request_id',request_id,'action',action,'effect',effect,
   'occurred_at',occurred_at,'outcome',latest_outcome,'http_status',latest_provider_status) order by effect_id)
   filter(where n<=50),'[]'::jsonb),'next_cursor',
   (select effect_id from numbered where n=50 and exists(select 1 from numbered where n=51)))
  into v_result from numbered;
  return v_result;
 end if;
 if p_action in('set_module','set_rollout') then
  if jsonb_typeof(p_params->'expected_enabled') is distinct from 'boolean' then raise exception 'native_admin_invalid' using errcode='22023'; end if;
  account:=case when p_action='set_module' then (p_params->>'account_id')::uuid else null end;
  perform private.lock_accounts_before_rows(array[p_actor,account]);
  perform private.native_admin_require_owner(p_actor);
  if account is not null then
   perform 1 from public.profiles where id=account for update;
   if not found then raise exception 'native_admin_not_found' using errcode='P0002'; end if;
  end if;
  select enabled_for_all into current_enabled from public.module_rollout where module=p_params->>'module' for update;
  if not found then raise exception 'native_admin_invalid' using errcode='22023'; end if;
  if p_action='set_module' then
   select exists(select 1 from public.billing_effective_access_grants
    where user_id=account and environment=p_environment and status='active'
     and (valid_until is null or valid_until>now()) and capability=p_params->>'module'
     and provider='vantare' and source_type='support') into current_enabled;
  end if;
  if current_enabled is distinct from (p_params->>'expected_enabled')::boolean then
   raise exception 'account_conflict' using errcode='40001'; end if;
  return private.native_admin_execute_before_creator_coupon(p_actor,p_issuer,p_action,p_params-'expected_enabled',p_environment);
 end if;
 if p_action='activate_creator' and p_params ? 'annual_discount_id' then
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_environment||':creator-coupons',0));
  v_monthly:=(p_params->>'discount_id')::uuid; v_annual:=(p_params->>'annual_discount_id')::uuid;
  if v_monthly is null or v_annual is null or v_monthly=v_annual or v_monthly='00000000-0000-0000-0000-000000000000'::uuid or v_annual='00000000-0000-0000-0000-000000000000'::uuid then raise exception 'creator_coupon_mismatch'; end if;
  if exists(select 1 from private.admin_creators where environment=p_environment and creator_id<>(p_params->>'creator_id')::uuid and (discount_id in(v_monthly::text,v_annual::text) or annual_discount_id in(v_monthly,v_annual))) then raise exception 'creator_coupon_mismatch'; end if;
  if exists(select 1 from private.admin_creators where environment=p_environment and creator_id=(p_params->>'creator_id')::uuid and annual_discount_id is not null and annual_discount_id<>v_annual) then raise exception 'creator_coupon_mismatch'; end if;
  v_result:=private.native_admin_execute_before_creator_coupon(p_actor,p_issuer,p_action,p_params,p_environment);
  update private.admin_creators set annual_discount_id=v_annual where creator_id=(p_params->>'creator_id')::uuid and environment=p_environment and discount_id=v_monthly::text;
  if not found then raise exception 'creator_coupon_mismatch'; end if;
  return v_result;
 end if;
 return private.native_admin_execute_before_creator_coupon(p_actor,p_issuer,p_action,p_params,p_environment);
end $_$;


--

-- Name: native_admin_finish_change(uuid, text, jsonb, text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.native_admin_finish_change(p_actor uuid, p_issuer text, p_params jsonb, p_environment text, p_request uuid, p_token uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
 perform private.lock_accounts_before_rows(array[p_actor,(p_params->>'account_id')::uuid]);
 perform private.native_admin_require_owner(p_actor);
 perform 1 from private.admin_change_leases where account_id=(p_params->>'account_id')::uuid
  and actor=p_actor and request_id=p_request and token=p_token and expires_at>clock_timestamp() for update;
 if not found then raise exception 'native_admin_lease_conflict' using errcode='40001'; end if;
 -- Hold the lease row lock until the state write commits. A takeover cannot
 -- race the check and this write, even if the clock advances during the call.
 return public.native_admin_execute(p_actor,p_issuer,'set_blocked',p_params,p_environment);
end;
$$;


--

-- Name: native_admin_gate(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.native_admin_gate() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare used integer;
begin
 insert into private.native_admin_gate_rate as budget(singleton,window_start,requests)
 values(true,date_trunc('minute',statement_timestamp()),1)
 on conflict(singleton) do update set
  window_start=greatest(budget.window_start,excluded.window_start),
  requests=case when budget.window_start>=excluded.window_start
   then least(budget.requests+1,121) else 1 end
 returning requests into used;
 return used<=120;
end $$;


--

-- Name: native_admin_payment_sync_budget(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.native_admin_payment_sync_budget(p_actor uuid, p_environment text, p_request uuid DEFAULT gen_random_uuid()) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--

-- Name: native_admin_preflight(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.native_admin_preflight(p_issuer text, p_subject text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare actor uuid;
begin
 select i.account_id into actor from public.account_identities i
 join private.clerk_issuers c on c.issuer=i.issuer and c.enabled
 where i.issuer=p_issuer and i.subject=p_subject and i.deleted_at is null;
 if actor is null then
  raise exception 'native_admin_forbidden' using errcode='42501';
 end if;
 perform private.native_admin_require_owner(actor);
 return actor;
end $$;


--

-- Name: native_admin_prune_audit(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.native_admin_prune_audit(p_actor uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare cutoff timestamptz; ttl integer;
 admin_count integer; mail_count integer; effect_count integer;
begin
 perform private.native_admin_require_owner(p_actor);
 select closed_retention_days into strict ttl from private.admin_audit_policy where singleton for share;
 cutoff:=clock_timestamp()-make_interval(days=>ttl);
 perform pg_advisory_xact_lock(1910,10);
 insert into private.admin_audit_maintenance_tx default values;
 -- SQL/mail entries describe committed transactions; external uncertainty is in effects.
 delete from public.admin_audit_log where occurred_at<cutoff;
 get diagnostics admin_count=row_count;
 delete from private.mail_audit where occurred_at<cutoff and action<>'audit_prune';
 get diagnostics mail_count=row_count;
 with closed as materialized (
  select i.effect_id from private.admin_effects i where i.outcome='started'
   and exists(select 1 from private.admin_effects r where r.effect_id=i.effect_id and r.outcome in ('succeeded','failed','reconciled'))
   and not exists(select 1 from private.admin_effects r where r.effect_id=i.effect_id and r.occurred_at>=cutoff)
  for update of i skip locked
 ) delete from private.admin_effects e using closed c where e.effect_id=c.effect_id;
 get diagnostics effect_count=row_count;
 delete from private.admin_audit_maintenance_tx where transaction_id=pg_current_xact_id();
 insert into private.mail_audit(actor,action,target,detail) values(p_actor,'audit_prune','audit',
  jsonb_build_object('retention_days',ttl,'admin',admin_count,'mail',mail_count,'effects',effect_count));
 return jsonb_build_object('admin',admin_count,'mail',mail_count,'effects',effect_count);
end $$;


--

-- Name: native_admin_reconcile_effect(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.native_admin_reconcile_effect(p_reviewer uuid, p_effect uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_start private.admin_effects;
begin
 perform private.native_admin_require_owner(p_reviewer);
 select * into v_start from private.admin_effects where effect_id=p_effect and outcome='started' for update;
 if not found or exists(select 1 from private.admin_effects where effect_id=p_effect and outcome in ('succeeded','failed'))
  or not (v_start.occurred_at < now()-interval '480 seconds' or exists(select 1 from private.admin_effects where effect_id=p_effect and outcome='unknown'))
 then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 insert into private.admin_effects(effect_id,outcome,request_id,actor,action,effect,target_hash)
 values(p_effect,'reconciled',v_start.request_id,p_reviewer,v_start.action,v_start.effect,v_start.target_hash)
 on conflict do nothing;
 return true;
end;
$$;


--

-- Name: native_admin_record_effect(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.native_admin_record_effect(p_actor uuid, p_event jsonb) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
 v_request uuid;
 v_effect uuid;
 v_start private.admin_effects;
 v_existing private.admin_effects;
begin
 if p_event->>'outcome'='started' then perform private.native_admin_require_owner(p_actor); end if;
 if p_event is null or jsonb_typeof(p_event)<>'object'
  or (select count(*) from jsonb_object_keys(p_event))not in (6,7)
  or not (p_event ?& array['request_id','effect_id','action','effect','target_hash','outcome'])
 then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 if exists(select 1 from jsonb_object_keys(p_event) k where k not in ('request_id','effect_id','action','effect','target_hash','outcome','provider_status')) then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 if p_event ? 'provider_status' and (p_event->>'outcome'='started' or jsonb_typeof(p_event->'provider_status')<>'number' or (p_event->>'provider_status') !~ '^[1-5][0-9]{2}$') then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 if p_event->>'request_id' is null or p_event->>'effect_id' is null
  or p_event->>'action' is null or p_event->>'effect' is null
  or p_event->>'target_hash' is null or p_event->>'outcome' is null
  or p_event->>'target_hash' !~ '^[0-9a-f]{64}$'
  or p_event->>'outcome' not in ('started','succeeded','unknown','failed')
  or not ((p_event->>'action'='set_blocked' and p_event->>'effect' in ('clerk_ban','clerk_unban','polar_cancel'))
       or (p_event->>'action'='delete_account' and p_event->>'effect' in ('clerk_delete','storage_cleanup','polar_cancel')))
 then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 begin
  v_request:=(p_event->>'request_id')::uuid;
  v_effect:=(p_event->>'effect_id')::uuid;
 exception when invalid_text_representation then
  raise exception 'native_admin_invalid' using errcode='22023';
 end;
 if p_event->>'outcome'='failed' and coalesce(p_event->>'provider_status','') not in ('401','403','422') then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 if exists(select 1 from private.admin_effects where effect_id=v_effect and outcome='reconciled') then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 if p_event->>'outcome'<>'started' then
  select * into v_start from private.admin_effects where effect_id=v_effect and outcome='started' for update;
  if not found or v_start.actor<>p_actor or v_start.request_id<>v_request
   or v_start.action<>p_event->>'action' or v_start.effect<>p_event->>'effect'
   or v_start.target_hash<>p_event->>'target_hash'
   or exists(select 1 from private.admin_effects where effect_id=v_effect and outcome='reconciled')
  then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 end if;
 insert into private.admin_effects(effect_id,outcome,request_id,actor,action,effect,target_hash,provider_status)
 values(v_effect,p_event->>'outcome',v_request,p_actor,p_event->>'action',p_event->>'effect',p_event->>'target_hash',(p_event->>'provider_status')::smallint)
 on conflict do nothing;
 select * into v_existing from private.admin_effects where effect_id=v_effect and outcome=p_event->>'outcome';
 if not found or v_existing.actor<>p_actor or v_existing.request_id<>v_request
  or v_existing.action<>p_event->>'action' or v_existing.effect<>p_event->>'effect'
  or v_existing.target_hash<>p_event->>'target_hash' or v_existing.provider_status is distinct from (p_event->>'provider_status')::smallint
 then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 return true;
end;
$_$;


--

-- Name: native_admin_record_effect(uuid, jsonb, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.native_admin_record_effect(p_actor uuid, p_event jsonb, p_account uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare account uuid; result boolean;
begin
 if not exists(select 1 from public.profiles where id=p_account) then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 for account in select distinct a from unnest(array[p_actor,p_account]) a where a is not null order by a loop
  perform private.lock_account_write(account);
 end loop;
 if exists(select 1 from private.admin_effects where effect_id=(p_event->>'effect_id')::uuid
  and outcome='started' and target_account is not null and target_account<>p_account) then
  raise exception 'native_admin_invalid' using errcode='22023'; end if;
 insert into private.admin_audit_maintenance_tx(maintenance,target_account) values(false,p_account);
 result:=public.native_admin_record_effect(p_actor,p_event);
 delete from private.admin_audit_maintenance_tx where transaction_id=pg_current_xact_id();
 return result;
exception when invalid_text_representation then
 raise exception 'native_admin_invalid' using errcode='22023';
end $$;


--

-- Name: native_admin_record_mail_erasure(uuid, uuid, uuid, uuid, text, integer, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.native_admin_record_mail_erasure(p_job uuid, p_lease uuid, p_request uuid, p_effect uuid, p_outcome text, p_provider_status integer DEFAULT NULL::integer, p_actor uuid DEFAULT NULL::uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
 -- Reserved technical actor, not a fabricated owner. Migration guards collision.
 v_actor uuid:=coalesce(p_actor,'00000000-0000-0000-0000-000000000000'::uuid);
 v_hash text;
begin
 if p_job is null or p_lease is null or p_request is null or p_effect is null
  or not private.mail_effect_valid(p_outcome,p_provider_status,true)
  or p_actor='00000000-0000-0000-0000-000000000000'::uuid
 then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 v_hash:=encode(sha256(convert_to('brevo_delete:'||p_job::text||':'||p_lease::text,'UTF8')),'hex');
 if p_outcome='started' then
  if p_actor is not null then perform private.native_admin_require_owner(p_actor); end if;
  -- Service-only queue capability. No new intent on an old/replaced lease.
  perform 1 from private.mail_contact_erasures
   where id=p_job and lease=p_lease and state='processing'
    and lease_until>clock_timestamp() for update;
  if not found then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 end if;
 return private.append_mail_effect(jsonb_build_object(
  'effect_id',p_effect,'outcome',p_outcome,'request_id',p_request,'actor',v_actor,
  'action','mail_cleanup','effect','brevo_delete','target_hash',v_hash,'provider_status',p_provider_status),
  (select account_id from private.mail_contact_erasures where id=p_job));
end$$;


--

-- Name: FUNCTION native_admin_record_mail_erasure(p_job uuid, p_lease uuid, p_request uuid, p_effect uuid, p_outcome text, p_provider_status integer, p_actor uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.native_admin_record_mail_erasure(p_job uuid, p_lease uuid, p_request uuid, p_effect uuid, p_outcome text, p_provider_status integer, p_actor uuid) IS 'Existing admin journal; service queue lease proof. Null actor denotes maintenance (reserved nil UUID); owner actor rechecked for started.';


--

-- Name: native_admin_record_mail_send(uuid, uuid, uuid, uuid, text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.native_admin_record_mail_send(p_actor uuid, p_request uuid, p_effect uuid, p_delivery uuid, p_environment text, p_outcome text, p_provider_status integer DEFAULT NULL::integer) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_hash text;
begin
 if p_actor is null or p_request is null or p_effect is null or p_delivery is null
  or p_environment is null or p_environment not in('sandbox','production')
  or not private.mail_effect_valid(p_outcome,p_provider_status,false)
 then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 v_hash:=encode(sha256(convert_to('brevo_smtp_send:'||p_environment||':'||p_delivery::text,'UTF8')),'hex');
 if p_outcome='started' then
  perform private.native_admin_require_owner(p_actor);
  perform 1 from private.mail_deliveries d join private.mail_campaigns c on c.id=d.campaign_id
   where d.id=p_delivery and d.status='dispatching' and d.reserved_at is not null
    and c.environment=p_environment and c.state='sending' and c.approved_by is not null for update of d;
  if not found then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 end if;
 return private.append_mail_effect(jsonb_build_object(
  'effect_id',p_effect,'outcome',p_outcome,'request_id',p_request,'actor',p_actor,
  'action','mail_send_batch','effect','brevo_smtp_send','target_hash',v_hash,'provider_status',p_provider_status),
  (select coalesce(c.account_id,c.erasure_account) from private.mail_deliveries d join private.mail_contacts c on c.email=d.email where d.id=p_delivery));
end$$;


--

-- Name: native_admin_record_mail_sync(uuid, uuid, uuid, text, uuid, uuid, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.native_admin_record_mail_sync(p_actor uuid, p_request uuid, p_effect uuid, p_kind text, p_contact uuid, p_lease uuid, p_outcome text, p_provider_status integer DEFAULT NULL::integer) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_hash text;
begin
 if p_actor is null or p_request is null or p_effect is null or p_contact is null or p_lease is null
  or p_kind is null or p_kind not in('brevo_contact_upsert','brevo_contact_update')
  or not private.mail_effect_valid(p_outcome,p_provider_status,false)
 then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 v_hash:=encode(sha256(convert_to('brevo_contact_sync:'||p_contact::text||':'||p_lease::text,'UTF8')),'hex');
 if p_outcome='started' then
  perform private.native_admin_require_owner(p_actor);
  perform 1 from private.mail_contacts where id=p_contact and sync_lease=p_lease
   and sync_lease_until>clock_timestamp() for update;
  if not found then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 end if;
 return private.append_mail_effect(jsonb_build_object(
  'effect_id',p_effect,'outcome',p_outcome,'request_id',p_request,'actor',p_actor,
  'action','mail_sync','effect',p_kind,'target_hash',v_hash,'provider_status',p_provider_status),
  (select coalesce(account_id,erasure_account) from private.mail_contacts where id=p_contact));
end$$;


--

-- Name: native_admin_record_payment(text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.native_admin_record_payment(p_environment text, p_payment jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_old private.admin_payments%rowtype;
begin
 if p_environment is null or p_environment not in('sandbox','production') or jsonb_typeof(p_payment) is distinct from 'object' then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_environment||':'||(p_payment->>'payment_id'),1628));
 perform pg_advisory_xact_lock(hashtextextended(p_environment||':'||(p_payment->>'account_id'),1627));
 select * into v_old from private.admin_payments where environment=p_environment and payment_id=p_payment->>'payment_id' for update;
 if found then
  if (p_payment->>'modified_at')::timestamptz<v_old.modified_at then return; end if;
  if v_old.account_id is distinct from (p_payment->>'account_id')::uuid or v_old.subscription_id is distinct from p_payment->>'subscription_id'
   or v_old.amount_cents is distinct from(p_payment->>'amount_cents')::bigint or v_old.currency is distinct from p_payment->>'currency'
   or v_old.paid_at is distinct from(p_payment->>'paid_at')::timestamptz or v_old.discount_id is distinct from p_payment->>'discount_id' then
   raise exception 'native_admin_owner_conflict' using errcode='55000'; end if;
  if (p_payment->>'modified_at')::timestamptz=v_old.modified_at and ((p_payment->>'refunded_cents')::bigint is distinct from v_old.refunded_cents or coalesce((p_payment->>'refund_pending')::boolean,false) is distinct from v_old.refund_pending) then
   raise exception 'native_admin_owner_conflict' using errcode='55000'; end if;
 end if;
 insert into private.admin_payments(environment,payment_id,account_id,subscription_id,product,paid_at,amount_cents,currency,discount_id,refunded_cents,refund_pending,modified_at)
 values(p_environment,p_payment->>'payment_id',(p_payment->>'account_id')::uuid,p_payment->>'subscription_id',p_payment->>'product',
  (p_payment->>'paid_at')::timestamptz,(p_payment->>'amount_cents')::bigint,p_payment->>'currency',p_payment->>'discount_id',
  (p_payment->>'refunded_cents')::bigint,coalesce((p_payment->>'refund_pending')::boolean,false),(p_payment->>'modified_at')::timestamptz)
 on conflict(environment,payment_id) do update set refunded_cents=greatest(admin_payments.refunded_cents,excluded.refunded_cents),refund_pending=excluded.refund_pending,modified_at=excluded.modified_at;
 if (select coalesce(sum(amount_cents),0) from private.admin_payment_refunds where environment=p_environment and payment_id=p_payment->>'payment_id' and status='succeeded')>(p_payment->>'amount_cents')::bigint then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 if exists(select 1 from private.admin_payment_sync where environment=p_environment and (p_payment->>'paid_at')::timestamptz>=last_synced_at)
  and not exists(select 1 from private.admin_payments p join private.admin_payment_sync s using(environment) where p.environment=p_environment and p.account_id=(p_payment->>'account_id')::uuid and p.paid_at<s.last_synced_at) then
  insert into private.admin_payment_history values(p_environment,(p_payment->>'account_id')::uuid) on conflict do nothing;
 end if;
end $$;


--

-- Name: native_admin_record_payment_sync(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.native_admin_record_payment_sync(p_actor uuid, p_request uuid, p_outcome text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
 if p_actor is null or p_request is null or p_outcome is null or p_outcome not in('succeeded','unknown') then
  raise exception 'native_admin_invalid' using errcode='22023'; end if;
 -- Service supplies actor/request. The shared journal validates the committed
 -- intention; closure does not require an owner that may have expired meanwhile.
 return private.append_mail_effect(jsonb_build_object('request_id',p_request,'effect_id',p_request,'actor',p_actor,
  'action','sync_payments','effect','polar_payment_sync','target_hash',
  encode(sha256(convert_to('sync_payments:sandbox','UTF8')),'hex'),'outcome',p_outcome),null);
end $$;


--

-- Name: native_admin_record_refund(text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.native_admin_record_refund(p_environment text, p_refund jsonb) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_old private.admin_payment_refunds%rowtype; v_account uuid; v_subscription text;
begin
 if p_environment is null or p_environment not in('sandbox','production') or jsonb_typeof(p_refund) is distinct from 'object' then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_environment||':'||(p_refund->>'payment_id'),1628));
 select account_id,subscription_id into v_account,v_subscription from private.admin_payments where environment=p_environment and payment_id=p_refund->>'payment_id';
 if v_account is not null then perform pg_advisory_xact_lock(hashtextextended(p_environment||':'||v_account::text,1627)); end if;
 select * into v_old from private.admin_payment_refunds where environment=p_environment and refund_id=p_refund->>'refund_id' for update;
 if found then
  if (p_refund->>'modified_at')::timestamptz<v_old.modified_at then return v_account is not null and v_subscription is not null; end if;
  if v_old.payment_id is distinct from p_refund->>'payment_id' or v_old.amount_cents is distinct from(p_refund->>'amount_cents')::bigint or v_old.currency is distinct from p_refund->>'currency'
   or(v_old.status='succeeded' and p_refund->>'status'<>'succeeded') or(v_old.modified_at=(p_refund->>'modified_at')::timestamptz and v_old.status is distinct from p_refund->>'status') then raise exception 'native_admin_owner_conflict' using errcode='55000'; end if;
 end if;
 insert into private.admin_payment_refunds(environment,refund_id,payment_id,amount_cents,currency,status,reason,modified_at)
 values(p_environment,p_refund->>'refund_id',p_refund->>'payment_id',(p_refund->>'amount_cents')::bigint,p_refund->>'currency',p_refund->>'status',left(p_refund->>'reason',500),(p_refund->>'modified_at')::timestamptz)
 on conflict(environment,refund_id) do update set status=excluded.status,reason=coalesce(excluded.reason,admin_payment_refunds.reason),modified_at=excluded.modified_at;
 if exists(select 1 from private.admin_payments p where p.environment=p_environment and p.payment_id=p_refund->>'payment_id' and p.amount_cents<(select sum(r.amount_cents) from private.admin_payment_refunds r where r.environment=p_environment and r.payment_id=p.payment_id and r.status='succeeded')) then raise exception 'native_admin_invalid' using errcode='22023'; end if;
 return v_account is not null and v_subscription is not null;
end $$;


--

-- Name: native_admin_release_change(uuid, uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.native_admin_release_change(p_actor uuid, p_request uuid, p_account uuid, p_token uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
 -- Release is cleanup of an existing request, not a new owner operation.
 if private.lock_account_write(p_account) then return true; end if;
 -- Preserve the request link for pending effects; cleanup of expired leases is
 -- a separate task and must not remove a row referenced by a pending effect.
 update private.admin_change_leases set expires_at='-infinity'::timestamptz where account_id=p_account and actor=p_actor and request_id=p_request and token=p_token;
 return found;
end;
$$;


--

-- Name: admin_account_blocks; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.admin_account_blocks (
    account_id uuid NOT NULL,
    blocked boolean NOT NULL,
    reason text,
    CONSTRAINT admin_account_blocks_reason_check CHECK ((length(reason) <= 200))
);


--

-- Name: admin_account_deletions; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.admin_account_deletions (
    account_id uuid NOT NULL,
    issuer text NOT NULL,
    subject text NOT NULL,
    confirmation_hash text NOT NULL,
    deleted_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT admin_account_deletions_confirmation_hash_check CHECK ((confirmation_hash ~ '^[0-9a-f]{64}$'::text))
);


--

-- Name: admin_audit_maintenance_tx; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.admin_audit_maintenance_tx (
    transaction_id xid8 DEFAULT pg_current_xact_id() NOT NULL,
    maintenance boolean DEFAULT true NOT NULL,
    target_account uuid
);


--

-- Name: admin_audit_policy; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.admin_audit_policy (
    singleton boolean DEFAULT true NOT NULL,
    closed_retention_days integer NOT NULL,
    CONSTRAINT admin_audit_policy_closed_retention_days_check CHECK (((closed_retention_days >= 1) AND (closed_retention_days <= 36500))),
    CONSTRAINT admin_audit_policy_singleton_check CHECK (singleton)
);


--

-- Name: admin_change_leases; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.admin_change_leases (
    account_id uuid NOT NULL,
    actor uuid NOT NULL,
    request_id uuid NOT NULL,
    token uuid NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


--

-- Name: admin_creator_payouts; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.admin_creator_payouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    creator_id uuid NOT NULL,
    amount_cents bigint NOT NULL,
    paid_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    actor uuid NOT NULL,
    CONSTRAINT admin_creator_payouts_amount_cents_check CHECK ((amount_cents > 0))
);


--

-- Name: admin_creators; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.admin_creators (
    creator_id uuid DEFAULT gen_random_uuid() NOT NULL,
    environment text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    code text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    discount_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    annual_discount_id uuid,
    CONSTRAINT admin_creators_check CHECK (((status = 'active'::text) = (discount_id IS NOT NULL))),
    CONSTRAINT admin_creators_code_check CHECK ((code ~ '^[A-Z0-9]{3,32}$'::text)),
    CONSTRAINT admin_creators_email_check CHECK (((length(email) <= 320) AND (email ~~ '%@%'::text))),
    CONSTRAINT admin_creators_environment_check CHECK ((environment = ANY (ARRAY['sandbox'::text, 'production'::text]))),
    CONSTRAINT admin_creators_name_check CHECK (((length(TRIM(BOTH FROM name)) >= 1) AND (length(TRIM(BOTH FROM name)) <= 120))),
    CONSTRAINT admin_creators_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text])))
);


--

-- Name: admin_effects; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.admin_effects (
    effect_id uuid NOT NULL,
    outcome text NOT NULL,
    request_id uuid NOT NULL,
    actor uuid NOT NULL,
    action text NOT NULL,
    effect text NOT NULL,
    target_hash text NOT NULL,
    occurred_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    provider_status smallint,
    target_account uuid,
    erase_on_close boolean DEFAULT false NOT NULL,
    CONSTRAINT admin_effects_action_check CHECK ((action = ANY (ARRAY['set_blocked'::text, 'delete_account'::text, 'mail_cleanup'::text, 'mail_sync'::text, 'mail_send_batch'::text, 'sync_payments'::text]))),
    CONSTRAINT admin_effects_effect_check CHECK ((effect = ANY (ARRAY['clerk_ban'::text, 'clerk_unban'::text, 'clerk_delete'::text, 'storage_cleanup'::text, 'polar_cancel'::text, 'brevo_delete'::text, 'brevo_contact_upsert'::text, 'brevo_contact_update'::text, 'brevo_smtp_send'::text, 'polar_payment_sync'::text]))),
    CONSTRAINT admin_effects_outcome_check CHECK ((outcome = ANY (ARRAY['started'::text, 'succeeded'::text, 'unknown'::text, 'failed'::text, 'reconciled'::text]))),
    CONSTRAINT admin_effects_provider_status_check CHECK (((provider_status >= 100) AND (provider_status <= 599))),
    CONSTRAINT admin_effects_target_hash_check CHECK (((target_hash = 'erased'::text) OR (target_hash ~ '^[0-9a-f]{64}$'::text)))
);


--

-- Name: admin_payment_history; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.admin_payment_history (
    environment text NOT NULL,
    account_id uuid NOT NULL
);


--

-- Name: admin_payment_issues; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.admin_payment_issues (
    environment text NOT NULL,
    payment_id text NOT NULL,
    CONSTRAINT admin_payment_issues_environment_check CHECK ((environment = ANY (ARRAY['sandbox'::text, 'production'::text]))),
    CONSTRAINT admin_payment_issues_payment_id_check CHECK (((length(payment_id) >= 1) AND (length(payment_id) <= 200)))
);


--

-- Name: admin_payment_refunds; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.admin_payment_refunds (
    environment text NOT NULL,
    refund_id text NOT NULL,
    payment_id text NOT NULL,
    amount_cents bigint NOT NULL,
    currency text NOT NULL,
    status text NOT NULL,
    reason text,
    modified_at timestamp with time zone NOT NULL,
    CONSTRAINT admin_payment_refunds_amount_cents_check CHECK (((amount_cents > 0) AND (amount_cents <= 100000000))),
    CONSTRAINT admin_payment_refunds_currency_check CHECK ((currency = 'eur'::text)),
    CONSTRAINT admin_payment_refunds_environment_check CHECK ((environment = ANY (ARRAY['sandbox'::text, 'production'::text]))),
    CONSTRAINT admin_payment_refunds_payment_id_check CHECK (((length(payment_id) >= 1) AND (length(payment_id) <= 200))),
    CONSTRAINT admin_payment_refunds_reason_check CHECK ((length(reason) <= 500)),
    CONSTRAINT admin_payment_refunds_refund_id_check CHECK (((length(refund_id) >= 1) AND (length(refund_id) <= 200))),
    CONSTRAINT admin_payment_refunds_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'succeeded'::text, 'failed'::text, 'canceled'::text])))
);


--

-- Name: admin_payment_sync; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.admin_payment_sync (
    environment text NOT NULL,
    last_synced_at timestamp with time zone NOT NULL
);


--

-- Name: admin_payment_sync_budget; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.admin_payment_sync_budget (
    environment text NOT NULL,
    window_start timestamp with time zone NOT NULL,
    CONSTRAINT admin_payment_sync_budget_environment_check CHECK ((environment = 'sandbox'::text))
);

ALTER TABLE ONLY private.admin_payment_sync_budget FORCE ROW LEVEL SECURITY;


--

-- Name: admin_payments; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.admin_payments (
    environment text NOT NULL,
    payment_id text NOT NULL,
    account_id uuid NOT NULL,
    subscription_id text,
    product text NOT NULL,
    paid_at timestamp with time zone NOT NULL,
    amount_cents bigint NOT NULL,
    currency text NOT NULL,
    discount_id text,
    refunded_cents bigint DEFAULT 0 NOT NULL,
    refund_pending boolean DEFAULT false NOT NULL,
    modified_at timestamp with time zone NOT NULL,
    settled_creator_id uuid,
    settled_commission_cents bigint,
    CONSTRAINT admin_payments_amount_cents_check CHECK (((amount_cents > 0) AND (amount_cents <= 100000000))),
    CONSTRAINT admin_payments_check CHECK (((refunded_cents >= 0) AND (refunded_cents <= amount_cents))),
    CONSTRAINT admin_payments_currency_check CHECK ((currency = 'eur'::text)),
    CONSTRAINT admin_payments_environment_check CHECK ((environment = ANY (ARRAY['sandbox'::text, 'production'::text]))),
    CONSTRAINT admin_payments_payment_id_check CHECK (((length(payment_id) >= 1) AND (length(payment_id) <= 200))),
    CONSTRAINT admin_payments_product_check CHECK (((length(product) >= 1) AND (length(product) <= 120))),
    CONSTRAINT admin_payments_settled_commission_cents_check CHECK ((settled_commission_cents >= 0)),
    CONSTRAINT admin_payments_subscription_id_check CHECK (((subscription_id IS NULL) OR ((length(subscription_id) >= 1) AND (length(subscription_id) <= 200))))
);


--

-- Name: admin_pending_effects; Type: VIEW; Schema: private; Owner: -
--

CREATE VIEW private.admin_pending_effects WITH (security_invoker='true') AS
 SELECT i.effect_id,
    i.outcome,
    i.request_id,
    i.actor,
    i.action,
    i.effect,
    i.target_hash,
    i.occurred_at,
    i.provider_status,
    COALESCE(r.outcome, 'pending'::text) AS latest_outcome,
    r.provider_status AS latest_provider_status
   FROM (private.admin_effects i
     LEFT JOIN private.admin_effects r ON (((r.effect_id = i.effect_id) AND (r.outcome = 'unknown'::text))))
  WHERE ((i.outcome = 'started'::text) AND (NOT (EXISTS ( SELECT 1
           FROM private.admin_effects c
          WHERE ((c.effect_id = i.effect_id) AND (c.outcome = ANY (ARRAY['succeeded'::text, 'failed'::text, 'reconciled'::text])))))));


--

-- Name: native_admin_gate_rate; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.native_admin_gate_rate (
    singleton boolean DEFAULT true NOT NULL,
    window_start timestamp with time zone NOT NULL,
    requests integer NOT NULL,
    CONSTRAINT native_admin_gate_rate_requests_check CHECK (((requests >= 1) AND (requests <= 121))),
    CONSTRAINT native_admin_gate_rate_singleton_check CHECK (singleton)
);


--

-- Name: native_admin_rate; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.native_admin_rate (
    actor uuid NOT NULL,
    window_start timestamp with time zone NOT NULL,
    requests integer NOT NULL
);


--

-- Name: admin_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_account_id uuid,
    action text NOT NULL,
    target text NOT NULL,
    before_value jsonb,
    after_value jsonb,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT admin_audit_log_action_check CHECK ((action = ANY (ARRAY['search_accounts'::text, 'get_account'::text, 'set_tester'::text, 'set_module'::text, 'get_rollout'::text, 'set_rollout'::text, 'list_reports'::text, 'get_report'::text, 'set_report_status'::text, 'set_blocked'::text, 'delete_account'::text, 'list_creators'::text, 'get_creator'::text, 'create_creator'::text, 'record_creator_payout'::text])))
);


--

-- Name: admin_account_blocks admin_account_blocks_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.admin_account_blocks
    ADD CONSTRAINT admin_account_blocks_pkey PRIMARY KEY (account_id);


--

-- Name: admin_account_deletions admin_account_deletions_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.admin_account_deletions
    ADD CONSTRAINT admin_account_deletions_pkey PRIMARY KEY (account_id);


--

-- Name: admin_audit_maintenance_tx admin_audit_maintenance_tx_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.admin_audit_maintenance_tx
    ADD CONSTRAINT admin_audit_maintenance_tx_pkey PRIMARY KEY (transaction_id);


--

-- Name: admin_audit_policy admin_audit_policy_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.admin_audit_policy
    ADD CONSTRAINT admin_audit_policy_pkey PRIMARY KEY (singleton);


--

-- Name: admin_change_leases admin_change_leases_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.admin_change_leases
    ADD CONSTRAINT admin_change_leases_pkey PRIMARY KEY (account_id);


--

-- Name: admin_creator_payouts admin_creator_payouts_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.admin_creator_payouts
    ADD CONSTRAINT admin_creator_payouts_pkey PRIMARY KEY (id);


--

-- Name: admin_creators admin_creators_environment_code_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.admin_creators
    ADD CONSTRAINT admin_creators_environment_code_key UNIQUE (environment, code);


--

-- Name: admin_creators admin_creators_environment_discount_id_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.admin_creators
    ADD CONSTRAINT admin_creators_environment_discount_id_key UNIQUE (environment, discount_id);


--

-- Name: admin_creators admin_creators_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.admin_creators
    ADD CONSTRAINT admin_creators_pkey PRIMARY KEY (creator_id);


--

-- Name: admin_effects admin_effects_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.admin_effects
    ADD CONSTRAINT admin_effects_pkey PRIMARY KEY (effect_id, outcome);


--

-- Name: admin_payment_history admin_payment_history_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.admin_payment_history
    ADD CONSTRAINT admin_payment_history_pkey PRIMARY KEY (environment, account_id);


--

-- Name: admin_payment_issues admin_payment_issues_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.admin_payment_issues
    ADD CONSTRAINT admin_payment_issues_pkey PRIMARY KEY (environment, payment_id);


--

-- Name: admin_payment_refunds admin_payment_refunds_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.admin_payment_refunds
    ADD CONSTRAINT admin_payment_refunds_pkey PRIMARY KEY (environment, refund_id);


--

-- Name: admin_payment_sync_budget admin_payment_sync_budget_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.admin_payment_sync_budget
    ADD CONSTRAINT admin_payment_sync_budget_pkey PRIMARY KEY (environment);


--

-- Name: admin_payment_sync admin_payment_sync_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.admin_payment_sync
    ADD CONSTRAINT admin_payment_sync_pkey PRIMARY KEY (environment);


--

-- Name: admin_payments admin_payments_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.admin_payments
    ADD CONSTRAINT admin_payments_pkey PRIMARY KEY (environment, payment_id);


--

-- Name: native_admin_gate_rate native_admin_gate_rate_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.native_admin_gate_rate
    ADD CONSTRAINT native_admin_gate_rate_pkey PRIMARY KEY (singleton);


--

-- Name: native_admin_rate native_admin_rate_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.native_admin_rate
    ADD CONSTRAINT native_admin_rate_pkey PRIMARY KEY (actor);


--

-- Name: admin_audit_log admin_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_log
    ADD CONSTRAINT admin_audit_log_pkey PRIMARY KEY (id);


--

-- Name: admin_creator_annual_coupon; Type: INDEX; Schema: private; Owner: -
--

CREATE UNIQUE INDEX admin_creator_annual_coupon ON private.admin_creators USING btree (environment, annual_discount_id) WHERE (annual_discount_id IS NOT NULL);


--

-- Name: admin_effects_request; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX admin_effects_request ON private.admin_effects USING btree (request_id, occurred_at);


--

-- Name: admin_effects_smtp_delivery_started; Type: INDEX; Schema: private; Owner: -
--

CREATE UNIQUE INDEX admin_effects_smtp_delivery_started ON private.admin_effects USING btree (target_hash) WHERE ((effect = 'brevo_smtp_send'::text) AND (outcome = 'started'::text) AND (target_hash <> 'erased'::text));


--

-- Name: admin_effects_started_target_hash; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX admin_effects_started_target_hash ON private.admin_effects USING btree (target_hash) WHERE (outcome = 'started'::text);


--

-- Name: admin_effects_terminal; Type: INDEX; Schema: private; Owner: -
--

CREATE UNIQUE INDEX admin_effects_terminal ON private.admin_effects USING btree (effect_id) WHERE (outcome = ANY (ARRAY['succeeded'::text, 'unknown'::text, 'failed'::text]));


--

-- Name: admin_payments_account_date; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX admin_payments_account_date ON private.admin_payments USING btree (environment, account_id, paid_at, payment_id);


--

-- Name: admin_refunds_payment; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX admin_refunds_payment ON private.admin_payment_refunds USING btree (environment, payment_id, status);


--

-- Name: admin_audit_actor_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_audit_actor_time ON public.admin_audit_log USING btree (actor_account_id, occurred_at DESC);


--

-- Name: admin_audit_target_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_audit_target_lookup ON public.admin_audit_log USING btree (target);


--

-- Name: admin_account_blocks a_account_write_barrier; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON private.admin_account_blocks FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''account_id'')::uuid) owners(account)', 'select ($1->>''account_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''account_id'')::uuid))');


--

-- Name: admin_account_deletions a_account_write_barrier; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON private.admin_account_deletions FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.account_identities p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''account_id'')::uuid) a(account) where p2.issuer=($1->>''issuer'')::text and p2.subject=($1->>''subject'')::text union select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''account_id'')::uuid) owners(account)', 'select ($1->>''account_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''account_id'')::uuid)) or ($1->>''issuer'' is not null and $1->>''subject'' is not null and not exists(select 1 from public.account_identities p where p.issuer=($1->>''issuer'')::text and p.subject=($1->>''subject'')::text))');


--

-- Name: admin_change_leases a_account_write_barrier; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON private.admin_change_leases FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array[($1->>''account_id'')::uuid]', 'select false');


--

-- Name: admin_creator_payouts a_account_write_barrier; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON private.admin_creator_payouts FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''actor'')::uuid) owners(account)', 'select ($1->>''actor'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''actor'')::uuid))');


--

-- Name: admin_payment_history a_account_write_barrier; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON private.admin_payment_history FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''account_id'')::uuid) owners(account)', 'select ($1->>''account_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''account_id'')::uuid))');


--

-- Name: admin_payments a_account_write_barrier; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON private.admin_payments FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''account_id'')::uuid) owners(account)', 'select ($1->>''account_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''account_id'')::uuid))');


--

-- Name: native_admin_rate a_account_write_barrier; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON private.native_admin_rate FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''actor'')::uuid) owners(account)', 'select ($1->>''actor'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''actor'')::uuid))');


--

-- Name: admin_effects admin_effects_append_only; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER admin_effects_append_only BEFORE DELETE OR UPDATE ON private.admin_effects FOR EACH ROW WHEN ((NOT private.admin_audit_maintenance())) EXECUTE FUNCTION public.operational_access_reject_audit_mutation();


--

-- Name: admin_creator_payouts admin_payout_append_only; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER admin_payout_append_only BEFORE DELETE OR UPDATE ON private.admin_creator_payouts FOR EACH ROW EXECUTE FUNCTION public.operational_access_reject_audit_mutation();


--

-- Name: admin_effects b_bind_admin_effect_account; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER b_bind_admin_effect_account BEFORE INSERT ON private.admin_effects FOR EACH ROW EXECUTE FUNCTION private.bind_admin_effect_account();


--

-- Name: admin_effects redact_closed_admin_effect; Type: TRIGGER; Schema: private; Owner: -
--

CREATE CONSTRAINT TRIGGER redact_closed_admin_effect AFTER INSERT ON private.admin_effects DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN ((new.outcome = ANY (ARRAY['succeeded'::text, 'failed'::text, 'reconciled'::text]))) EXECUTE FUNCTION private.redact_closed_admin_effect();


--

-- Name: admin_audit_log a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.admin_audit_log FOR EACH ROW WHEN ((NOT private.admin_audit_maintenance())) EXECUTE FUNCTION private.guard_account_write('select case when $1->>''action'' in (''search_accounts'',''get_account'',''get_rollout'',''list_reports'',''get_report'')
     then array[($1->>''actor_account_id'')::uuid] else (select array_agg(distinct account order by account) filter(where account is not null) from (select (v#>>''{}'')::uuid from jsonb_path_query($1,''$.**.account_id'') v
        where v#>>''{}'' ~ ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'' union select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''actor_account_id'')::uuid union select p.id from public.profiles p where p.id=case when $1->>''target'' ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'' then ($1->>''target'')::uuid end union select r.account_id from public.testing_contributions r where r.id=case when $1->>''target'' ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'' then ($1->>''target'')::uuid end) owners(account)) end', 'select ($1->>''actor_account_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''actor_account_id'')::uuid))');


--

-- Name: admin_audit_log admin_audit_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER admin_audit_append_only BEFORE DELETE OR UPDATE ON public.admin_audit_log FOR EACH ROW WHEN ((NOT private.admin_audit_maintenance())) EXECUTE FUNCTION public.operational_access_reject_audit_mutation();


--

-- Name: admin_audit_log b_minimize_admin_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER b_minimize_admin_audit BEFORE INSERT ON public.admin_audit_log FOR EACH ROW EXECUTE FUNCTION private.minimize_admin_audit('actor_account_id', 'before_value,after_value');


--

-- Name: admin_account_blocks admin_account_blocks_account_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.admin_account_blocks
    ADD CONSTRAINT admin_account_blocks_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--

-- Name: admin_account_deletions admin_account_deletions_account_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.admin_account_deletions
    ADD CONSTRAINT admin_account_deletions_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--

-- Name: admin_account_deletions admin_account_deletions_issuer_subject_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.admin_account_deletions
    ADD CONSTRAINT admin_account_deletions_issuer_subject_fkey FOREIGN KEY (issuer, subject) REFERENCES public.account_identities(issuer, subject) ON DELETE RESTRICT;


--

-- Name: admin_creator_payouts admin_creator_payouts_actor_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.admin_creator_payouts
    ADD CONSTRAINT admin_creator_payouts_actor_fkey FOREIGN KEY (actor) REFERENCES public.profiles(id);


--

-- Name: admin_creator_payouts admin_creator_payouts_creator_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.admin_creator_payouts
    ADD CONSTRAINT admin_creator_payouts_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES private.admin_creators(creator_id);


--

-- Name: admin_payment_history admin_payment_history_account_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.admin_payment_history
    ADD CONSTRAINT admin_payment_history_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.profiles(id);


--

-- Name: admin_payments admin_payments_account_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.admin_payments
    ADD CONSTRAINT admin_payments_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--

-- Name: admin_payments admin_payments_settled_creator_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.admin_payments
    ADD CONSTRAINT admin_payments_settled_creator_id_fkey FOREIGN KEY (settled_creator_id) REFERENCES private.admin_creators(creator_id);


--

-- Name: native_admin_rate native_admin_rate_actor_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.native_admin_rate
    ADD CONSTRAINT native_admin_rate_actor_fkey FOREIGN KEY (actor) REFERENCES public.profiles(id) ON DELETE CASCADE;


--

-- Name: admin_audit_log admin_audit_log_actor_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_log
    ADD CONSTRAINT admin_audit_log_actor_account_id_fkey FOREIGN KEY (actor_account_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--

-- Name: admin_audit_maintenance_tx; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.admin_audit_maintenance_tx ENABLE ROW LEVEL SECURITY;

--

-- Name: admin_audit_policy; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.admin_audit_policy ENABLE ROW LEVEL SECURITY;

--

-- Name: admin_change_leases; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.admin_change_leases ENABLE ROW LEVEL SECURITY;

--

-- Name: admin_effects; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.admin_effects ENABLE ROW LEVEL SECURITY;

--

-- Name: admin_payment_sync_budget; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.admin_payment_sync_budget ENABLE ROW LEVEL SECURITY;

--

-- Name: native_admin_gate_rate; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.native_admin_gate_rate ENABLE ROW LEVEL SECURITY;

--

-- Name: admin_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

--

-- Name: FUNCTION admin_audit_fields(value jsonb, action text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.admin_audit_fields(value jsonb, action text) FROM PUBLIC;


--

-- Name: FUNCTION admin_audit_maintenance(); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.admin_audit_maintenance() FROM PUBLIC;


--

-- Name: FUNCTION admin_audit_minimize(entry anyelement, actor_key text, value_keys text[]); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.admin_audit_minimize(entry anyelement, actor_key text, value_keys text[]) FROM PUBLIC;


--

-- Name: FUNCTION admin_audit_target(target text); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.admin_audit_target(target text) FROM PUBLIC;


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

-- Name: FUNCTION native_admin_payment_sync_budget(p_actor uuid, p_environment text, p_request uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.native_admin_payment_sync_budget(p_actor uuid, p_environment text, p_request uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.native_admin_payment_sync_budget(p_actor uuid, p_environment text, p_request uuid) TO service_role;


--

-- Name: FUNCTION native_admin_preflight(p_issuer text, p_subject text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.native_admin_preflight(p_issuer text, p_subject text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.native_admin_preflight(p_issuer text, p_subject text) TO service_role;


--

-- Name: FUNCTION native_admin_prune_audit(p_actor uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.native_admin_prune_audit(p_actor uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.native_admin_prune_audit(p_actor uuid) TO service_role;


--

-- Name: FUNCTION native_admin_reconcile_effect(p_reviewer uuid, p_effect uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.native_admin_reconcile_effect(p_reviewer uuid, p_effect uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.native_admin_reconcile_effect(p_reviewer uuid, p_effect uuid) TO service_role;


--

-- Name: FUNCTION native_admin_record_effect(p_actor uuid, p_event jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.native_admin_record_effect(p_actor uuid, p_event jsonb) FROM PUBLIC;


--

-- Name: FUNCTION native_admin_record_effect(p_actor uuid, p_event jsonb, p_account uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.native_admin_record_effect(p_actor uuid, p_event jsonb, p_account uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.native_admin_record_effect(p_actor uuid, p_event jsonb, p_account uuid) TO service_role;


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

-- Name: FUNCTION native_admin_record_payment_sync(p_actor uuid, p_request uuid, p_outcome text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.native_admin_record_payment_sync(p_actor uuid, p_request uuid, p_outcome text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.native_admin_record_payment_sync(p_actor uuid, p_request uuid, p_outcome text) TO service_role;


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

-- Name: TABLE admin_effects; Type: ACL; Schema: private; Owner: -
--

GRANT SELECT ON TABLE private.admin_effects TO service_role;


--

-- Name: TABLE admin_pending_effects; Type: ACL; Schema: private; Owner: -
--

GRANT SELECT ON TABLE private.admin_pending_effects TO service_role;


--

-- Name: TABLE admin_audit_log; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.admin_audit_log TO service_role;


--

-- Catalog: private.admin_audit_policy (1 rows)
-- {"closed_retention_days": 365, "singleton": true}
