-- #1627. Local candidate: no deployment or production effects authorized.
begin;
alter table public.testing_center_reports drop constraint testing_center_reports_state_check;
alter table public.testing_center_reports add constraint testing_center_reports_state_check
 check(state in ('draft','submitted','validated','duplicate_linked','incomplete','closed','in_review','rejected','fixed'));
alter table public.testing_center_reports add column fixed_in_version text
 check(fixed_in_version ~ '^[0-9]+\.[0-9]+\.[0-9]+(\.[0-9]+)?(-[a-z0-9.-]+)?$' and length(fixed_in_version)<=60);
alter table public.testing_center_reports add column reject_reason text check(length(reject_reason)<=500);
alter table public.testing_report_followup add column reject_reason text check(length(reject_reason)<=500);
create table private.admin_account_blocks(account_id uuid primary key references public.profiles(id) on delete cascade,
 blocked boolean not null,reason text check(length(reason)<=200));
revoke all on private.admin_account_blocks from public,anon,authenticated,service_role;
alter table public.admin_audit_log drop constraint admin_audit_log_action_check;
alter table public.admin_audit_log add constraint admin_audit_log_action_check check(action in
 ('search_accounts','get_account','set_tester','set_module','get_rollout','set_rollout','list_reports','get_report','set_report_status','set_blocked','delete_account','list_creators','get_creator','create_creator','record_creator_payout'));
alter function private.native_admin_account(uuid,text,text) rename to native_admin_account_v1;
create function private.native_admin_account(p_account uuid,p_issuer text,p_environment text) returns jsonb
language sql stable security definer set search_path='' as $$
 select private.native_admin_account_v1(p_account,p_issuer,p_environment)||jsonb_build_object(
  'owner',exists(select 1 from public.operational_access_assignments a where a.user_id=p_account and a.role='owner' and a.status='active'),
  'blocked',coalesce((select b.blocked from private.admin_account_blocks b where b.account_id=p.id),false),'blocked_reason',(select b.reason from private.admin_account_blocks b where b.account_id=p.id),
  'subscriptions',coalesce((select jsonb_agg(s.provider_subscription_id) from public.billing_subscriptions s where s.user_id=p_account and s.environment=p_environment and s.provider='polar' and (s.status in('active','trialing','past_due') or s.cancel_at_period_end)),'[]'::jsonb))
 from public.profiles p where p.id=p_account
$$;
revoke all on function private.native_admin_account(uuid,text,text) from public,anon,authenticated,service_role;
-- Keep the proven v1 mutations, owner gate and append-only audit.
alter function public.native_admin_execute(uuid,text,text,jsonb,text) rename to native_admin_execute_v1;
alter function public.native_admin_execute_v1(uuid,text,text,jsonb,text) set schema private;
revoke all on function private.native_admin_execute_v1(uuid,text,text,jsonb,text) from public,anon,authenticated,service_role;

create function private.native_admin_reports(p_issuer text) returns table(item jsonb)
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('report_id',r.report_id,'account_id',r.reporter_user_id,'status',r.state,
  'created_at',r.created_at,'title',coalesce(p.action_text,'Informe'), 'module',p.module,'app_version',p.app_version,
  'action_text',p.action_text,'expected_text',p.expected_text,'observed_text',p.observed_text,'context_text',p.context_text,
  'fixed_in_version',r.fixed_in_version,'reject_reason',r.reject_reason,'payload',to_jsonb(p),
  'clerk_subject',(select min(i.subject) from public.account_identities i where i.account_id=r.reporter_user_id and i.issuer in(p_issuer,p_issuer||'/')),
  'screenshots_count',(select count(*) from public.testing_center_screenshot_evidence e where e.report_id=r.report_id and e.state='ready'),
  'has_screenshots',exists(select 1 from public.testing_center_screenshot_evidence e where e.report_id=r.report_id and e.state='ready'),
  'screenshots',coalesce((select jsonb_agg(jsonb_build_object('object_path',e.object_path,'position',e.position,'media_type',e.media_type) order by e.position)
   from public.testing_center_screenshot_evidence e where e.report_id=r.report_id and e.state='ready'),'[]'::jsonb))
 from public.testing_center_reports r left join public.testing_center_report_payloads p using(report_id) where r.state<>'draft'
 union all
 select jsonb_build_object('report_id',c.id,'account_id',c.account_id,
  'status',case c.state when 'received' then 'submitted' when 'reviewing' then 'in_review' when 'accepted' then 'validated' when 'fixed' then 'fixed' else 'rejected' end,
  'created_at',c.created_at,'title',c.title,'action_text',c.body,'module','hub','app_version',c.channel,
  'fixed_in_version',f.fixed_version,'reject_reason',f.reject_reason,
  'clerk_subject',(select min(i.subject) from public.account_identities i where i.account_id=c.account_id and i.issuer in(p_issuer,p_issuer||'/')),
  'screenshots_count',0,'has_screenshots',false,'screenshots','[]'::jsonb)
 from public.testing_contributions c left join public.testing_report_followup f on f.contribution_id=c.id
$$;
revoke all on function private.native_admin_reports(text) from public,anon,authenticated,service_role;

create function public.native_admin_execute(p_actor uuid,p_issuer text,p_action text,p_params jsonb,p_environment text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_before jsonb; v_after jsonb; v_rows jsonb; v_counts jsonb; v_id text; v_status text; v_version text; v_state text; v_limit integer; v_account uuid;
begin
 perform private.native_admin_require_owner(p_actor);
 if p_environment is null or p_environment not in('sandbox','production') or p_issuer is null or p_issuer!~'^https://' or jsonb_typeof(p_params) is distinct from 'object' then
  raise exception 'native_admin_invalid' using errcode='22023'; end if;
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
  perform 1 from public.testing_center_reports where report_id=v_id for update;
  if not found then perform 1 from public.testing_contributions where id::text=v_id for update; end if;
  select item into v_before from private.native_admin_reports(p_issuer) where item->>'report_id'=v_id;
  if v_before is null then raise exception 'native_admin_not_found' using errcode='P0002'; end if;
  if p_action='get_report' then v_after:=jsonb_build_object('report',v_before);
  else
   v_status:=p_params->>'status'; v_version:=p_params->>'fixed_in_version';
   if v_status is null or v_status not in('submitted','in_review','validated','rejected','fixed','closed','duplicate_linked','incomplete')
    or length(p_params->>'reason')>500 or (v_status='fixed' and (v_version is null or length(v_version)>60 or v_version!~'^[0-9]+\.[0-9]+\.[0-9]+(\.[0-9]+)?(-[a-z0-9.-]+)?$')) then
    raise exception 'native_admin_invalid' using errcode='22023'; end if;
   if v_status='fixed' and v_before->>'status' not in('validated','fixed') then raise exception 'native_admin_owner_conflict' using errcode='55000'; end if;
   if exists(select 1 from public.testing_contributions where id::text=v_id) then
    v_state:=case v_status when 'submitted' then 'received' when 'in_review' then 'reviewing' when 'validated' then 'accepted' when 'fixed' then 'fixed' else 'declined' end;
    if v_status='fixed' then
     insert into public.testing_report_followup(contribution_id,fixed_version,reviewed_title,reviewed_summary)
      values(v_id::uuid,v_version,v_before->>'title',left(v_before->>'title',200)) on conflict(contribution_id) do update
       set fixed_version=excluded.fixed_version,reviewed_title=excluded.reviewed_title,reviewed_summary=excluded.reviewed_summary;
    end if;
    insert into public.testing_report_followup(contribution_id,reject_reason) values(v_id::uuid,p_params->>'reason') on conflict(contribution_id) do update set reject_reason=excluded.reject_reason;
    update public.testing_contributions set state=v_state where id::text=v_id;
   else
    update public.testing_center_reports set state=v_status,fixed_in_version=case when v_status='fixed' then v_version else null end,
      reject_reason=case when v_status='rejected' then p_params->>'reason' else null end,updated_at=now() where report_id=v_id;
   end if;
   select item into v_rows from private.native_admin_reports(p_issuer) where item->>'report_id'=v_id;
   v_after:=jsonb_build_object('report_id',v_id,'status',v_status);
  end if;
 end if;
 insert into public.admin_audit_log(actor_account_id,action,target,before_value,after_value) values(p_actor,p_action,v_id,v_before,coalesce(v_rows,v_after));
 return v_after;
end $$;
revoke all on function public.native_admin_execute(uuid,text,text,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.native_admin_execute(uuid,text,text,jsonb,text) to service_role;
-- ISA-1444: shared identity/device logic; native entry accepts server-verified identities only.

create or replace function private.resolve_account_identity(issuer text, subject text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_issuer text := nullif(rtrim(trim(issuer), '/'), '');
  v_subject text := nullif(trim(subject), '');
  v_account_id uuid;
  v_accounts integer;
begin
  if v_issuer is null or v_subject is null then
    raise exception 'not_authenticated';
  end if;
  if length(v_issuer) > 512 or length(v_subject) > 255 then
    raise exception 'invalid_identity';
  end if;

  if v_issuer ~ '/auth/v1$' then
    if v_subject ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and exists (
        select 1 from auth.users user_row where user_row.id = v_subject::uuid
      )
    then
      return v_subject::uuid;
    end if;
    raise exception 'not_authenticated';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_issuer || chr(31) || v_subject, 0)
  );

  select count(distinct identity_row.account_id), min(identity_row.account_id::text)::uuid
  into v_accounts, v_account_id
  from public.account_identities identity_row
  where identity_row.issuer in (v_issuer, v_issuer || '/')
    and identity_row.subject = v_subject;

  if v_accounts > 1 then raise exception 'account_conflict'; end if;
  if v_account_id is not null then
    if exists(select 1 from private.admin_account_blocks where account_id=v_account_id and blocked) then raise exception 'native_account_blocked' using errcode='42501'; end if;
    return v_account_id;
  end if;

  v_account_id := gen_random_uuid();
  insert into public.profiles (id) values (v_account_id);
  insert into public.account_identities (issuer, subject, account_id)
  values (v_issuer, v_subject, v_account_id);
  return v_account_id;
end;
$$;


commit;
