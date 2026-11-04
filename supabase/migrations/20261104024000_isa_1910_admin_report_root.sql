-- VANTA-132 / #1910: admin consumes only the R6 testing_contributions root.
-- R6 owns shutdown, mapping, verification and emptying. No data writes here.
begin;
set local lock_timeout='5s';
lock table public.testing_center_reports,
 public.testing_center_evidence,
 public.testing_center_technical_issues,
 public.testing_center_screenshot_evidence,
 public.testing_center_evidence_batches,
 public.testing_center_report_payloads,
 public.testing_center_report_submission_keys,
 public.testing_center_report_events in share mode;
do $cutover$
declare
 v_table regclass;
 v_signature text;
 v_function oid;
 v_nonempty boolean;
begin
 if not exists(select 1 from pg_roles where rolname=current_user and (rolsuper or rolbypassrls)) then
  raise exception 'native_admin_cutover_requires_bypassrls' using errcode='42501';
 end if;
 foreach v_table in array array[
 'public.testing_center_reports'::regclass,
 'public.testing_center_evidence'::regclass,
 'public.testing_center_technical_issues'::regclass,
 'public.testing_center_screenshot_evidence'::regclass,
 'public.testing_center_evidence_batches'::regclass,
 'public.testing_center_report_payloads'::regclass,
 'public.testing_center_report_submission_keys'::regclass,
 'public.testing_center_report_events'::regclass] loop
  execute format('select exists(select 1 from %s)',v_table) into v_nonempty;
  if v_nonempty then
   raise exception 'native_admin_legacy_reports_require_r6_mapping'
    using errcode='55000',detail=v_table::text;
  end if;
  if exists(select 1 from (values ('service_role'),('authenticated'),('anon'),('vantare_triage')) principal(name)
    where has_table_privilege(principal.name,v_table,'INSERT,UPDATE,DELETE,TRUNCATE'))
   or exists(select 1 from pg_class c,
     lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
     where c.oid=v_table and a.grantee=0 and a.privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')) then
   raise exception 'native_admin_legacy_table_still_writable'
    using errcode='55000',detail=v_table::text;
  end if;
 end loop;
 -- Exact legacy surface closed by #1926. Do not infer writers from function
 -- text: Clerk account deletion legitimately still consumes legacy tables/FKs.
 foreach v_signature in array array[
 'public.testing_center_report_submit_admitted(uuid,text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text,uuid)',
 'public.testing_center_triage_report(text)',
 'public.testing_center_prepare_screenshot_batch(text,text,text,jsonb)',
 'public.testing_center_finalize_screenshot(uuid,uuid)',
 'public.testing_center_submit_report(text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text)',
 'public.testing_center_submit_report_with_evidence(text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text,uuid)',
 'public.testing_center_submit_report_without_transport_size(text,text,text,text,text,text,text,text,text,text,boolean,boolean,text,text,text)'] loop
  v_function=to_regprocedure(v_signature);
  if v_function is null then
   raise exception 'native_admin_legacy_rpc_missing' using errcode='55000',detail=v_signature;
  end if;
  if exists(select 1 from (values ('service_role'),('authenticated'),('anon'),('vantare_triage')) principal(name)
     where has_function_privilege(principal.name,v_function,'EXECUTE'))
   or exists(select 1 from pg_proc p,
     lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
     where p.oid=v_function and a.grantee=0 and a.privilege_type='EXECUTE') then
   raise exception 'native_admin_legacy_writers_still_callable'
    using errcode='55000',detail=v_signature;
  end if;
 end loop;
end $cutover$;
CREATE OR REPLACE FUNCTION private.native_admin_reports(p_issuer text)
 RETURNS TABLE(item jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object('report_id',c.id,'account_id',c.account_id,
  'status',case c.state when 'received' then 'submitted' when 'reviewing' then 'in_review' when 'accepted' then 'validated' when 'fixed' then 'fixed' when 'spam' then 'spam' else 'rejected' end,
  'created_at',c.created_at,'title',c.title,'action_text',c.body,'module','hub','app_version',c.channel,
  'fixed_in_version',f.fixed_version,'reject_reason',f.reject_reason,
  'clerk_subject',(select min(i.subject) from public.account_identities i where i.account_id=c.account_id and i.issuer in(p_issuer,p_issuer||'/')),
  'screenshots_count',0,'has_screenshots',false,'screenshots','[]'::jsonb)
 from public.testing_contributions c left join public.testing_report_followup f on f.contribution_id=c.id
$function$
;

CREATE OR REPLACE FUNCTION private.native_admin_account_v1(p_account uuid, p_issuer text, p_environment text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION private.native_admin_account_summary(p_account uuid, p_issuer text, p_environment text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 with base as(select private.native_admin_account_v1(p_account,p_issuer,p_environment) data),
 grants as(select * from public.billing_effective_access_grants where user_id=p_account and environment=p_environment and status='active' and(valid_until is null or valid_until>now())),
 sub as(select * from public.billing_subscriptions where user_id=p_account and environment=p_environment and provider='polar' and(status in('active','trialing','past_due') or cancel_at_period_end) order by updated_at desc limit 1),
 access as(select r.module,r.enabled_for_all rollout, (select data->'roles'<>'[]'::jsonb from base) role,
  exists(select 1 from grants where capability=r.module and provider='vantare' and source_type='support') individual,
  exists(select 1 from grants where capability in(r.module,'vantare.plan.pro','vantare.plan.founders')) plan from public.module_rollout r)
 select data||jsonb_build_object(
  'owner',exists(select 1 from public.operational_access_assignments a where a.user_id=p_account and a.role='owner' and a.status='active'),
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
$function$
;

CREATE OR REPLACE FUNCTION private.native_admin_execute_v1(p_actor uuid, p_issuer text, p_action text, p_params jsonb, p_environment text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    -- operational_access_set replaces active roles: never call grant on an owner.
    if not (v_enabled and exists(select 1 from public.operational_access_assignments
      where user_id = v_account and role = 'owner' and status = 'active')) then
      perform public.operational_access_set(v_account, 'tester', case when v_enabled then 'grant' else 'revoke' end,
        'native-admin:' || p_actor::text, 'Beta tester administration', v_corr, null);
    end if;
    select case when role = 'owner' then 'owner' when role = 'nightly_tester' then 'primary_tester' else 'tester' end
    into v_role from public.operational_access_assignments where user_id = v_account
      and status = 'active' and policy_version = 1 and (expires_at is null or expires_at > now());
    insert into public.testing_center_memberships(user_id, actor_id, role, active)
    values(v_account, 'account:' || v_account::text, coalesce(v_role, 'tester'), v_role is not null)
    on conflict(user_id) do update set role = excluded.role, active = excluded.active, updated_at = now();
    v_after := jsonb_build_object('account', private.native_admin_account_summary(v_account, p_issuer, p_environment),
      'assignment', (select to_jsonb(a) from public.operational_access_assignments a where user_id = v_account and role = 'tester'),
      'membership', (select to_jsonb(m) from public.testing_center_memberships m where user_id = v_account));
    v_result := jsonb_build_object('account_id', v_account, 'enabled', v_enabled);
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
$function$
;

CREATE OR REPLACE FUNCTION private.native_admin_execute_before_creator_coupon(p_actor uuid, p_issuer text, p_action text, p_params jsonb, p_environment text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if exists(select 1 from public.operational_access_assignments where user_id=v_account and role='owner' and status='active') or v_account=p_actor then
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
end $function$
;

create or replace trigger a_account_write_barrier before insert or update or delete on public.admin_audit_log
 for each row execute function private.guard_account_write($guard_owners$select case when $1->>'action' in ('search_accounts','get_account','get_rollout','list_reports','get_report')
     then array[($1->>'actor_account_id')::uuid] else (select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>'id')::uuid as account) a(account) where p1.id=($1->>'actor_account_id')::uuid union
        select p.id from public.profiles p where p.id=case when $1->>'target' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then ($1->>'target')::uuid end
        union select r.account_id from public.testing_contributions r where r.id=case when $1->>'target' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then ($1->>'target')::uuid end
        union select (v#>>'{}')::uuid from jsonb_path_query($1,'$.**.account_id') v
        where v#>>'{}' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') owners(account)) end$guard_owners$,$guard_unresolved$select ($1->>'actor_account_id' is not null and not exists(select 1 from public.profiles p where p.id=($1->>'actor_account_id')::uuid))$guard_unresolved$);
create index admin_effects_started_target_hash on private.admin_effects(target_hash) where outcome='started';
commit;
