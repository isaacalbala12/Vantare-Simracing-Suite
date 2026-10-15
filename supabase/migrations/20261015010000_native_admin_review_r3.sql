-- #1627 / review #1639 R1. Candidate local, sin activación ni servicios reales.

begin;

alter table public.testing_contribution_reviews drop constraint testing_contribution_reviews_model_check;
alter table public.testing_contribution_reviews drop constraint testing_contribution_reviews_proposal_check;
alter table public.testing_contribution_reviews add constraint testing_reviews_proposal_check check(proposal is null or private.testing_proposal_valid(proposal));
alter table public.testing_contribution_reviews alter column model_verdict drop not null, alter column model_confidence drop not null, alter column proposal drop not null;
alter table public.testing_contribution_reviews add constraint testing_reviews_source_check check(
 (model='human' and model_verdict is null and model_confidence is null and proposal is null) or
 (model='opencode-go/deepseek-v4.1-flash' and model_verdict is not null and model_confidence is not null and proposal is not null));

create function private.testing_contribution_review_as(p_reviewer uuid,p_id uuid,p_decision text,p_note text,p_proposal jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.testing_contributions%rowtype; r public.testing_contribution_reviews%rowtype; t timestamptz;
begin
  if p_reviewer is null then raise exception 'testing_owner_required' using errcode='42501'; end if;
  if p_decision is null or p_decision not in ('accepted','declined','spam')
    or p_note is null or length(trim(p_note)) not between 1 and 1000
    or (p_proposal is not null and not private.testing_proposal_valid(p_proposal)) then
    raise exception 'testing_review_invalid' using errcode = '22023'; end if;
  if p_decision = 'accepted' and current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'testing_review_read_committed_required' using errcode = '25000'; end if;
  select * into c from public.testing_contributions where id = p_id for update;
  if not found then raise exception 'testing_contribution_missing' using errcode = 'P0002'; end if;
  select * into r from public.testing_contribution_reviews where contribution_id = p_id;
  if found then
    if r.reviewer = p_reviewer and r.decision = p_decision and r.note = p_note and r.proposal is not distinct from p_proposal then return; end if;
    raise exception 'testing_review_conflict' using errcode = '23505'; end if;
  if c.state not in ('received','reviewing') then raise exception 'testing_review_conflict' using errcode = '23505'; end if;
  -- Serializes acceptance for different contributions of one account.
  perform pg_advisory_xact_lock(hashtextextended(c.account_id::text,1594));
  t := c.created_at;
  if p_decision = 'accepted' and (
    exists(select 1 from public.testing_contributions x where x.account_id = c.account_id and x.state = 'accepted'
      and (x.created_at at time zone 'UTC')::date = (t at time zone 'UTC')::date)
    or (select count(*) from public.testing_contributions x where x.account_id = c.account_id and x.state = 'accepted'
      and date_trunc('week',x.created_at at time zone 'UTC') = date_trunc('week',t at time zone 'UTC')) >= 2) then
    raise exception 'testing_acceptance_limit' using errcode = '23514'; end if;
  insert into public.testing_contribution_reviews(contribution_id,reviewer,decision,note,model_verdict,model_confidence,proposal,model)
    values(p_id,p_reviewer,p_decision,p_note,p_proposal->>'verdict',(p_proposal->>'confidence')::double precision,p_proposal,case when p_proposal is null then 'human' else 'opencode-go/deepseek-v4.1-flash' end);
  update public.testing_contributions set state = p_decision where id = p_id;
end $$;

revoke all on function private.testing_contribution_review_as(uuid,uuid,text,text,jsonb) from public,anon,authenticated,service_role,vantare_triage;

create or replace function public.testing_contribution_review(p_id uuid,p_decision text,p_note text,p_proposal jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'testing_owner_required' using errcode='42501'; end if;
 perform 1 from public.testing_center_memberships where user_id=auth.uid() and active and role='owner' for share;
 if not found then raise exception 'testing_owner_required' using errcode='42501'; end if;
 if p_proposal is null then raise exception 'testing_review_invalid' using errcode='22023'; end if;
 perform private.testing_contribution_review_as(auth.uid(),p_id,p_decision,p_note,p_proposal);
end $$;

-- Trusted admin adapter: same review engine, explicit human note, no invented model proposal.
create function private.native_admin_review_report(p_actor uuid,p_id uuid,p_status text,p_version text,p_note text) returns void
language plpgsql security definer set search_path='' as $$
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
  update public.testing_report_followup set fixed_version=null,reviewed_title=null,reviewed_summary=null where contribution_id=p_id;
  update public.testing_contributions set state=case p_status when 'submitted' then 'received' else 'reviewing' end where id=p_id;
 else raise exception 'native_admin_invalid' using errcode='22023'; end if;
 insert into public.testing_report_followup(contribution_id,reject_reason) values(p_id,case when p_status in ('rejected','spam') then p_note else null end)
  on conflict(contribution_id) do update set reject_reason=excluded.reject_reason;
end $$;
revoke all on function private.native_admin_review_report(uuid,uuid,text,text,text) from public,anon,authenticated,service_role;

create or replace function private.native_admin_reports(p_issuer text) returns table(item jsonb)
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
  'status',case c.state when 'received' then 'submitted' when 'reviewing' then 'in_review' when 'accepted' then 'validated' when 'fixed' then 'fixed' when 'spam' then 'spam' else 'rejected' end,
  'created_at',c.created_at,'title',c.title,'action_text',c.body,'module','hub','app_version',c.channel,
  'fixed_in_version',f.fixed_version,'reject_reason',f.reject_reason,
  'clerk_subject',(select min(i.subject) from public.account_identities i where i.account_id=c.account_id and i.issuer in(p_issuer,p_issuer||'/')),
  'screenshots_count',0,'has_screenshots',false,'screenshots','[]'::jsonb)
 from public.testing_contributions c left join public.testing_report_followup f on f.contribution_id=c.id
$$;

create function private.native_admin_commission_rate(p_period integer) returns integer
language sql immutable set search_path='' as $$ select case when p_period=1 then 3000 when p_period<=12 then 1000 else 0 end $$;
revoke all on function private.native_admin_commission_rate(integer) from public,anon,authenticated,service_role;
create index admin_payments_account_date on private.admin_payments(environment,account_id,paid_at,payment_id);
create index admin_refunds_payment on private.admin_payment_refunds(environment,payment_id,status);

-- Quarantine unparseable refund data per invoice; never assume it is safe to pay.
create table private.admin_payment_issues(environment text not null check(environment in ('sandbox','production')),
 payment_id text not null check(length(payment_id) between 1 and 200),primary key(environment,payment_id));
revoke all on private.admin_payment_issues from public,anon,authenticated,service_role;

create or replace function private.native_admin_creator_lines(p_environment text) returns table(item jsonb)
language sql stable security definer set search_path='' as $$
 with receipts as(select p.*,greatest(p.refunded_cents,coalesce((select sum(r.amount_cents) from private.admin_payment_refunds r where r.environment=p.environment and r.payment_id=p.payment_id and r.status='succeeded'),0)) refund_total,
 (p.refund_pending or exists(select 1 from private.admin_payment_issues i where i.environment=p.environment and i.payment_id=p.payment_id) or exists(select 1 from private.admin_payment_refunds r where r.environment=p.environment and r.payment_id=p.payment_id and r.status='pending')) pending from private.admin_payments p),
 firsts as(select distinct on(account_id) account_id,paid_at,discount_id from private.admin_payments where environment=p_environment order by account_id,paid_at,payment_id),
 lines as(select p.*,c.creator_id,case when (p.paid_at at time zone 'UTC')>=(f.paid_at at time zone 'UTC')+interval '12 months' then 13 else
  1+(select coalesce(max(n),0) from generate_series(0,11)n where(p.paid_at at time zone 'UTC')>=(f.paid_at at time zone 'UTC')+make_interval(months=>n)) end period_index
  from receipts p join firsts f using(account_id) left join private.admin_creators c on c.environment=p_environment and c.creator_id=coalesce(p.settled_creator_id,(select c2.creator_id from private.admin_creators c2 where c2.environment=p_environment and c2.discount_id=f.discount_id and c2.status='active')) where p.environment=p_environment),
 rated as(select *,private.native_admin_commission_rate(period_index) rate_bp from lines)
 select jsonb_build_object('creator_id',creator_id,'account_id',account_id,'payment_id',payment_id,'paid_at',paid_at,'product',product,
  'period_index',period_index,'amount_cents',amount_cents,'currency',currency,'status',case when pending then 'refund_pending' when refund_total>=amount_cents then 'refunded' when refund_total>0 then 'partially_refunded' else 'paid' end,
  'refunded_cents',refund_total,'refunded',refund_total>0,'rate_bp',rate_bp,
  'refunded_at',(select max(r.modified_at) from private.admin_payment_refunds r where r.environment=p_environment and r.payment_id=rated.payment_id and r.status='succeeded'),
  'refund_reason',(select r.reason from private.admin_payment_refunds r where r.environment=p_environment and r.payment_id=rated.payment_id and r.status in('succeeded','pending') and r.reason is not null order by r.modified_at desc,r.refund_id limit 1),
  'history_complete',exists(select 1 from private.admin_payment_history h where h.environment=p_environment and h.account_id=rated.account_id),
  'commission_cents',greatest(coalesce(settled_commission_cents,0),case when pending or not exists(select 1 from private.admin_payment_history h where h.environment=p_environment and h.account_id=rated.account_id) then 0 else floor((greatest(0,amount_cents-refund_total)::numeric*rate_bp+5000)/10000)::bigint end)) from rated
$$;

create function private.native_admin_creators(p_environment text) returns table(item jsonb)
language sql stable security definer set search_path='' as $$
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
revoke all on function private.native_admin_creators(text) from public,anon,authenticated,service_role;
create or replace function private.native_admin_creator(p_id uuid,p_environment text) returns jsonb
language sql stable security definer set search_path='' as $$
 select item from private.native_admin_creators(p_environment) where item->>'creator_id'=p_id::text
$$;

create or replace function private.native_admin_account_summary(p_account uuid,p_issuer text,p_environment text) returns jsonb
language sql stable security definer set search_path='' as $$
 with base as(select private.native_admin_account_v1(p_account,p_issuer,p_environment) data),
 grants as(select * from public.billing_access_grants where user_id=p_account and environment=p_environment and status='active' and(valid_until is null or valid_until>now())),
 sub as(select * from public.billing_subscriptions where user_id=p_account and environment=p_environment and provider='polar' and(status in('active','trialing','past_due') or cancel_at_period_end) order by updated_at desc limit 1),
 access as(select r.module,r.enabled_for_all rollout, (select data->'roles'<>'[]'::jsonb from base) role,
  exists(select 1 from grants where capability=r.module and provider='vantare' and source_type='support') individual,
  exists(select 1 from grants where capability in(r.module,'vantare.plan.pro')) plan from public.module_rollout r)
 select data||jsonb_build_object(
  'owner',exists(select 1 from public.operational_access_assignments a where a.user_id=p_account and a.role='owner' and a.status='active'),
  'blocked',coalesce((select b.blocked from private.admin_account_blocks b where b.account_id=p_account),false),'blocked_reason',(select b.reason from private.admin_account_blocks b where b.account_id=p_account),
  'plan',case when exists(select 1 from grants where capability='vantare.plan.pro') then case when exists(select 1 from grants where capability='vantare.channel.nightly') then 'pro_plus' else 'pro' end else 'free' end,
  'billing',(select case when current_period_end-current_period_start>interval '200 days' then 'yearly' else 'monthly' end from sub),
  'renews_at',(select current_period_end from sub),
  'modules',coalesce((select jsonb_agg(module order by module) from access where rollout or individual or plan or data->'roles'<>'[]'::jsonb),'[]'::jsonb),
  'module_access',(select jsonb_agg(to_jsonb(access) order by module) from access),
  'reports_count',(select count(*) from public.testing_center_reports where reporter_user_id=p_account)+(select count(*) from public.testing_contributions where account_id=p_account),
  'polar_customer_url',null) from base
$$;

revoke all on function private.native_admin_account_summary(uuid,text,text) from public,anon,authenticated,service_role;

create or replace function private.native_admin_account(p_account uuid,p_issuer text,p_environment text) returns jsonb
language sql stable security definer set search_path='' as $$
 select private.native_admin_account_summary(p_account,p_issuer,p_environment)||jsonb_build_object(
  'creator_code',(select jsonb_build_object('code',c.code,'creator_id',c.creator_id,'creator_name',c.name) from (select p.discount_id from private.admin_payments p where p.account_id=p_account and p.environment=p_environment order by p.paid_at,p.payment_id limit 1) first_payment join private.admin_creators c on c.discount_id=first_payment.discount_id and c.environment=p_environment),
  'payments',coalesce((select jsonb_agg(item order by item->>'paid_at' desc) from private.native_admin_creator_lines(p_environment) where item->>'account_id'=p_account::text),'[]'::jsonb)||coalesce((select jsonb_agg(jsonb_build_object('payment_id',o.provider_order_id,'paid_at',o.created_at,'date_source','recorded_at','amount_basis','net','product','Launch Edition','period_index',1,'amount_cents',o.net_amount,'currency',o.currency,'refunded_cents',o.reported_refunded_amount,'status',o.status) order by o.created_at desc) from public.billing_orders o where o.user_id=p_account and o.environment=p_environment and not exists(select 1 from private.admin_payments p where p.environment=p_environment and p.payment_id=o.provider_order_id)),'[]'::jsonb),
  'subscriptions',coalesce((select jsonb_agg(s.provider_subscription_id) from public.billing_subscriptions s where s.user_id=p_account and s.environment=p_environment and s.provider='polar' and(s.status in('active','trialing','past_due') or s.cancel_at_period_end)),'[]'::jsonb))
$$;

create or replace function private.native_admin_execute_v1(
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
  values(p_actor, p_action, v_target, case when p_action in ('get_account','search_accounts','get_rollout','list_reports','get_report') then null else v_before end, case when p_action in ('get_account','search_accounts','get_rollout','list_reports','get_report') then null else v_after end);
  return v_result;
end;
$$;

create or replace function public.native_admin_execute(p_actor uuid,p_issuer text,p_action text,p_params jsonb,p_environment text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_before jsonb; v_after jsonb; v_rows jsonb; v_counts jsonb; v_id text; v_status text; v_version text; v_limit integer; v_account uuid; v_creator private.admin_creators%rowtype; v_amount bigint; v_paid_at timestamptz; v_lock record; v_remaining bigint; v_applied bigint;
begin
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
  perform public.native_admin_record_refund(p_environment,p_params->'refund'); return '{}'::jsonb;
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
  perform 1 from public.testing_center_reports where report_id=v_id for update;
  if not found then perform 1 from public.testing_contributions where id::text=v_id for update; end if;
  select item into v_before from private.native_admin_reports(p_issuer) where item->>'report_id'=v_id;
  if v_before is null then raise exception 'native_admin_not_found' using errcode='P0002'; end if;
  if p_action='get_report' then v_after:=jsonb_build_object('report',v_before);
  else
   v_status:=p_params->>'status'; v_version:=p_params->>'fixed_in_version';
   if v_status is null or v_status not in('submitted','in_review','validated','rejected','spam','fixed','closed','duplicate_linked','incomplete')
    or length(p_params->>'reason')>500 or (v_status='fixed' and (v_version is null or length(v_version)>60 or v_version!~'^[0-9]+\.[0-9]+\.[0-9]+(\.[0-9]+)?(-[a-z0-9.-]+)?$')) then
    raise exception 'native_admin_invalid' using errcode='22023'; end if;
   if v_status='fixed' and v_before->>'status' not in('validated','fixed') then raise exception 'native_admin_owner_conflict' using errcode='55000'; end if;
   if exists(select 1 from public.testing_contributions where id::text=v_id) then
    perform private.native_admin_review_report(p_actor,v_id::uuid,v_status,v_version,p_params->>'reason');
   else
    update public.testing_center_reports set state=v_status,fixed_in_version=case when v_status='fixed' then v_version else null end,
      reject_reason=case when v_status='rejected' then p_params->>'reason' else null end,updated_at=now() where report_id=v_id;
   end if;
   select item into v_rows from private.native_admin_reports(p_issuer) where item->>'report_id'=v_id;
   v_after:=jsonb_build_object('report_id',v_id,'status',v_status);
  end if;
 end if;
 insert into public.admin_audit_log(actor_account_id,action,target,before_value,after_value) values(p_actor,p_action,v_id,case when p_action='set_report_status' then jsonb_build_object('status',v_before->'status') end,case when p_action='set_report_status' then v_after end);
 return v_after;
end $$;

create or replace function public.native_admin_record_payment(p_environment text,p_payment jsonb) returns void
language plpgsql security definer set search_path='' as $$
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

commit;
