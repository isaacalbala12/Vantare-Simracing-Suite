-- #1456: owner-only administrative boundary. All successful actions are audited.
begin;
create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_account_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('search_accounts','get_account','set_tester','set_module',
    'get_rollout','set_rollout','list_reports','get_report','set_report_status')),
  target text not null,
  before_value jsonb,
  after_value jsonb,
  occurred_at timestamptz not null default now()
);
create index admin_audit_actor_time on public.admin_audit_log(actor_account_id, occurred_at desc);
alter table public.admin_audit_log enable row level security;
revoke all on public.admin_audit_log from public, anon, authenticated, service_role;
grant select on public.admin_audit_log to service_role;
create trigger admin_audit_append_only before update or delete on public.admin_audit_log
  for each row execute function public.operational_access_reject_audit_mutation();

create table private.native_admin_rate (
  actor uuid primary key references public.profiles(id) on delete cascade,
  window_start timestamptz not null,
  requests integer not null
);
revoke all on private.native_admin_rate from public, anon, authenticated, service_role;

create function private.native_admin_require_owner(p_actor uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  -- The active-role unique index matches normalizeOperationalAssignments.
  perform 1 from public.operational_access_assignments
  where user_id = p_actor and role = 'owner' and status = 'active' and policy_version = 1
    and (expires_at is null or expires_at > now()) for update;
  if not found then raise exception 'native_admin_forbidden' using errcode = '42501'; end if;
end;
$$;

-- Reserve a persisted minute budget before Clerk directory/Storage calls.
create function public.native_admin_begin(p_actor uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
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

create function private.native_admin_account(p_account uuid, p_issuer text, p_environment text)
returns jsonb language sql stable security definer set search_path = '' as $$
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
    'reports_count', (select count(*) from public.testing_center_reports r where r.reporter_user_id = p.id)
  ) from public.profiles p where p.id = p_account
$$;

create function public.native_admin_execute(
  p_actor uuid, p_issuer text, p_action text, p_params jsonb, p_environment text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
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
    v_before := private.native_admin_account(v_account, p_issuer, p_environment);
  end if;
  if p_action in ('set_module','set_rollout') then
    v_module := p_params->>'module';
    perform 1 from public.module_rollout where module = v_module for update;
    if not found then raise exception 'native_admin_invalid' using errcode = '22023'; end if;
  end if;
  if p_action = 'search_accounts' then
    v_limit := (p_params->>'limit')::integer;
    if v_limit is null or v_limit not between 1 and 50 or jsonb_typeof(p_params->'subjects') is distinct from 'array'
      or jsonb_array_length(p_params->'subjects') > 50 then
      raise exception 'native_admin_invalid' using errcode = '22023';
    end if;
    select coalesce(jsonb_agg(private.native_admin_account(matches.account_id, p_issuer, p_environment)), '[]'::jsonb)
    into v_after from (select distinct i.account_id from public.account_identities i
      where i.issuer in (p_issuer, p_issuer || '/')
      and i.subject in (select jsonb_array_elements_text(p_params->'subjects'))
      order by i.account_id limit v_limit) matches;
    v_result := jsonb_build_object('accounts', v_after);
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
    v_after := jsonb_build_object('account', private.native_admin_account(v_account, p_issuer, p_environment),
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
    v_after := jsonb_build_object('account', private.native_admin_account(v_account, p_issuer, p_environment),
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
  elsif p_action = 'list_reports' then
    v_limit := (p_params->>'limit')::integer;
    if v_limit is null or v_limit not between 1 and 100 then raise exception 'native_admin_invalid' using errcode = '22023'; end if;
    select coalesce(jsonb_agg(to_jsonb(rows) order by rows.report_id), '[]'::jsonb) into v_after from (
      select r.report_id, r.reporter_user_id as account_id, r.state as status, r.created_at,
        p.module, p.app_version, p.action_text, p.expected_text, p.observed_text, p.context_text,
        (select min(i.subject) from public.account_identities i where i.account_id = r.reporter_user_id
          and i.issuer in (p_issuer, p_issuer || '/')) as clerk_subject,
        exists(select 1 from public.testing_center_screenshot_evidence e where e.report_id = r.report_id and e.state = 'ready') as has_screenshots
      from public.testing_center_reports r left join public.testing_center_report_payloads p using(report_id)
      where (p_params->>'status' is null or r.state = p_params->>'status')
        and (p_params->>'cursor' is null or r.report_id > p_params->>'cursor')
      order by r.report_id limit v_limit
    ) rows;
    v_result := jsonb_build_object('reports', v_after, 'next_cursor',
      case when jsonb_array_length(v_after) = v_limit then v_after->(v_limit-1)->>'report_id' else null end);
  elsif p_action in ('get_report','set_report_status') then
    v_report := p_params->>'report_id';
    select to_jsonb(r) into v_before from public.testing_center_reports r where report_id = v_report for update;
    if not found then raise exception 'native_admin_not_found' using errcode = 'P0002'; end if;
    v_target := v_report;
    if p_action = 'set_report_status' then
      if p_params->>'status' is null or p_params->>'status' not in ('draft','submitted','validated','duplicate_linked','incomplete','closed') then
        raise exception 'native_admin_invalid' using errcode = '22023';
      end if;
      update public.testing_center_reports r set state = p_params->>'status', updated_at = now()
        where report_id = v_report returning to_jsonb(r) into v_after;
      v_result := jsonb_build_object('report_id', v_report, 'status', p_params->>'status');
    else
      select v_before || jsonb_build_object('status', v_before->>'state', 'payload', to_jsonb(p),
        'clerk_subject', (select min(i.subject) from public.account_identities i
          where i.account_id = (v_before->>'reporter_user_id')::uuid and i.issuer in (p_issuer, p_issuer || '/')),
        'screenshots', (select coalesce(jsonb_agg(jsonb_build_object('evidence_id', e.evidence_id,
          'object_path', e.object_path, 'media_type', e.media_type, 'position', e.position) order by e.position), '[]'::jsonb)
          from public.testing_center_screenshot_evidence e where e.report_id = v_report and e.state = 'ready'))
      into v_after from (select 1) singleton left join public.testing_center_report_payloads p on p.report_id = v_report;
      v_result := jsonb_build_object('report', v_after);
    end if;
  else raise exception 'native_admin_invalid' using errcode = '22023';
  end if;
  insert into public.admin_audit_log(actor_account_id, action, target, before_value, after_value)
  values(p_actor, p_action, v_target, v_before, v_after);
  return v_result;
end;
$$;

alter function private.native_admin_require_owner(uuid) owner to postgres;
alter function private.native_admin_account(uuid, text, text) owner to postgres;
alter function public.native_admin_begin(uuid) owner to postgres;
alter function public.native_admin_execute(uuid, text, text, jsonb, text) owner to postgres;
revoke all on function private.native_admin_require_owner(uuid), private.native_admin_account(uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.native_admin_begin(uuid), public.native_admin_execute(uuid, text, text, jsonb, text)
  from public, anon, authenticated, service_role;
grant execute on function public.native_admin_begin(uuid), public.native_admin_execute(uuid, text, text, jsonb, text) to service_role;
commit;
