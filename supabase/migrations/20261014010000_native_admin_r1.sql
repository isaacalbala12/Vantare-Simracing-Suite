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

create table private.admin_creators(
 creator_id uuid primary key default gen_random_uuid(),environment text not null check(environment in('sandbox','production')),
 name text not null check(length(trim(name)) between 1 and 120),email text not null check(length(email)<=320 and email like '%@%'),
 code text not null check(code ~ '^[A-Z0-9]{3,32}$'),status text not null default 'pending' check(status in('pending','active')),
 discount_id text,created_at timestamptz not null default now(),unique(environment,code),unique(environment,discount_id),
 check((status='active')=(discount_id is not null)));
revoke all on private.admin_creators from public,anon,authenticated,service_role;

-- Subscription receipts are an admin projection of verified Polar events. They
-- never grant access or replace the commercial ledger under review in #1622.
create table private.admin_payments(
 environment text not null check(environment in('sandbox','production')),payment_id text not null check(length(payment_id) between 1 and 200),
 account_id uuid not null references public.profiles(id) on delete restrict,subscription_id text check(subscription_id is null or length(subscription_id) between 1 and 200),
 product text not null check(length(product) between 1 and 120),paid_at timestamptz not null,amount_cents bigint not null check(amount_cents>0 and amount_cents<=100000000),
 currency text not null check(currency='eur'),discount_id text,refunded_cents bigint not null default 0 check(refunded_cents between 0 and amount_cents),
 refund_pending boolean not null default false,modified_at timestamptz not null,settled_creator_id uuid references private.admin_creators(creator_id),settled_commission_cents bigint check(settled_commission_cents>=0),
 primary key(environment,payment_id));
create table private.admin_creator_payouts(id uuid primary key default gen_random_uuid(),creator_id uuid not null references private.admin_creators(creator_id),
 amount_cents bigint not null check(amount_cents>0),paid_at timestamptz not null default clock_timestamp(),actor uuid not null references public.profiles(id));
revoke all on private.admin_payments,private.admin_creator_payouts from public,anon,authenticated,service_role;
create trigger admin_payout_append_only before update or delete on private.admin_creator_payouts for each row execute function public.operational_access_reject_audit_mutation();

create table private.admin_payment_refunds(environment text not null check(environment in('sandbox','production')),refund_id text not null check(length(refund_id) between 1 and 200),
 payment_id text not null check(length(payment_id) between 1 and 200),amount_cents bigint not null check(amount_cents>0 and amount_cents<=100000000),currency text not null check(currency='eur'),
 status text not null check(status in('pending','succeeded','failed','canceled')),reason text check(length(reason)<=500),modified_at timestamptz not null,primary key(environment,refund_id));
revoke all on private.admin_payment_refunds from public,anon,authenticated,service_role;
create table private.admin_payment_sync(environment text primary key,last_synced_at timestamptz not null);
create table private.admin_payment_history(environment text not null,account_id uuid not null references public.profiles(id),primary key(environment,account_id));
revoke all on private.admin_payment_sync,private.admin_payment_history from public,anon,authenticated,service_role;

create function public.native_admin_record_refund(p_environment text,p_refund jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
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
revoke all on function public.native_admin_record_refund(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.native_admin_record_refund(text,jsonb) to service_role;

create function public.native_admin_record_payment(p_environment text,p_payment jsonb) returns void
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
end $$;
revoke all on function public.native_admin_record_payment(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.native_admin_record_payment(text,jsonb) to service_role;

create function private.native_admin_creator_lines(p_environment text) returns table(item jsonb)
language sql stable security definer set search_path='' as $$
 with receipts as(select p.*,greatest(p.refunded_cents,coalesce((select sum(r.amount_cents) from private.admin_payment_refunds r where r.environment=p.environment and r.payment_id=p.payment_id and r.status='succeeded'),0)) refund_total,
 (p.refund_pending or exists(select 1 from private.admin_payment_refunds r where r.environment=p.environment and r.payment_id=p.payment_id and r.status='pending')) pending from private.admin_payments p),
 firsts as(select distinct on(account_id) account_id,paid_at,discount_id from private.admin_payments where environment=p_environment order by account_id,paid_at,payment_id),
 lines as(select p.*,c.creator_id,case when (p.paid_at at time zone 'UTC')>=(f.paid_at at time zone 'UTC')+interval '12 months' then 13 else
  1+(select coalesce(max(n),0) from generate_series(0,11)n where(p.paid_at at time zone 'UTC')>=(f.paid_at at time zone 'UTC')+make_interval(months=>n)) end period_index
  from receipts p join firsts f using(account_id) left join private.admin_creators c on c.environment=p_environment and c.creator_id=coalesce(p.settled_creator_id,(select c2.creator_id from private.admin_creators c2 where c2.environment=p_environment and c2.discount_id=f.discount_id and c2.status='active')) where p.environment=p_environment),
 rated as(select *,case when period_index=1 then 3000 when period_index<=12 then 1000 else 0 end rate_bp from lines)
 select jsonb_build_object('creator_id',creator_id,'account_id',account_id,'payment_id',payment_id,'paid_at',paid_at,'product',product,
  'period_index',period_index,'amount_cents',amount_cents,'currency',currency,'status',case when pending then 'refund_pending' when refund_total>=amount_cents then 'refunded' when refund_total>0 then 'partially_refunded' else 'paid' end,
  'refunded_cents',refund_total,'refunded',refund_total>0,'rate_bp',rate_bp,
  'refunded_at',(select max(r.modified_at) from private.admin_payment_refunds r where r.environment=p_environment and r.payment_id=rated.payment_id and r.status='succeeded'),
  'refund_reason',(select r.reason from private.admin_payment_refunds r where r.environment=p_environment and r.payment_id=rated.payment_id and r.status in('succeeded','pending') and r.reason is not null order by r.modified_at desc,r.refund_id limit 1),
  'history_complete',exists(select 1 from private.admin_payment_history h where h.environment=p_environment and h.account_id=rated.account_id),
  'commission_cents',greatest(coalesce(settled_commission_cents,0),case when pending or not exists(select 1 from private.admin_payment_history h where h.environment=p_environment and h.account_id=rated.account_id) then 0 else floor((greatest(0,amount_cents-refund_total)::numeric*rate_bp+5000)/10000)::bigint end)) from rated
$$;
revoke all on function private.native_admin_creator_lines(text) from public,anon,authenticated,service_role;

create function private.native_admin_creator(p_id uuid,p_environment text) returns jsonb
language sql stable security definer set search_path='' as $$
 select to_jsonb(c)-'discount_id'-'environment'||jsonb_build_object(
  'history_complete',not exists(select 1 from private.native_admin_creator_lines(p_environment) where item->>'creator_id'=p_id::text and item->>'history_complete'='false'),
  'clients_count',(select count(distinct item->>'account_id') from private.native_admin_creator_lines(p_environment) where item->>'creator_id'=p_id::text),
  'sales_cents',coalesce((select sum((item->>'amount_cents')::bigint-(item->>'refunded_cents')::bigint) from private.native_admin_creator_lines(p_environment) where item->>'creator_id'=p_id::text),0),
  'earned_cents',coalesce((select sum((item->>'commission_cents')::bigint) from private.native_admin_creator_lines(p_environment) where item->>'creator_id'=p_id::text),0),
  'paid_out_cents',coalesce((select sum(amount_cents) from private.admin_creator_payouts where creator_id=p_id),0),
  'owed_cents',greatest(0,coalesce((select sum((item->>'commission_cents')::bigint) from private.native_admin_creator_lines(p_environment) where item->>'creator_id'=p_id::text),0)-coalesce((select sum(amount_cents) from private.admin_creator_payouts where creator_id=p_id),0)),
  'payable_cents',greatest(0,coalesce((select sum((item->>'commission_cents')::bigint) from private.native_admin_creator_lines(p_environment) where item->>'creator_id'=p_id::text and(item->>'paid_at')::timestamptz<date_trunc('month',clock_timestamp() at time zone 'UTC') at time zone 'UTC'),0)-coalesce((select sum(amount_cents) from private.admin_creator_payouts where creator_id=p_id),0)),
  'last_payout_at',(select max(paid_at) from private.admin_creator_payouts where creator_id=p_id))
 from private.admin_creators c where c.creator_id=p_id and c.environment=p_environment
$$;
revoke all on function private.native_admin_creator(uuid,text) from public,anon,authenticated,service_role;

create function private.native_admin_account(p_account uuid,p_issuer text,p_environment text) returns jsonb
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
  'creator_code',(select jsonb_build_object('code',c.code,'creator_id',c.creator_id,'creator_name',c.name) from (select p.discount_id from private.admin_payments p where p.account_id=p_account and p.environment=p_environment order by p.paid_at,p.payment_id limit 1) first_payment join private.admin_creators c on c.discount_id=first_payment.discount_id and c.environment=p_environment),
  'payments',coalesce((select jsonb_agg(item order by item->>'paid_at' desc) from private.native_admin_creator_lines(p_environment) where item->>'account_id'=p_account::text),'[]'::jsonb)||coalesce((select jsonb_agg(jsonb_build_object('payment_id',o.provider_order_id,'paid_at',o.created_at,'date_source','recorded_at','amount_basis','net','product','Launch Edition','period_index',1,'amount_cents',o.net_amount,'currency',o.currency,'refunded_cents',o.reported_refunded_amount,'status',o.status) order by o.created_at desc) from public.billing_orders o where o.user_id=p_account and o.environment=p_environment and not exists(select 1 from private.admin_payments p where p.environment=p_environment and p.payment_id=o.provider_order_id)),'[]'::jsonb),
  'polar_customer_url',null,
  'subscriptions',coalesce((select jsonb_agg(s.provider_subscription_id) from public.billing_subscriptions s where s.user_id=p_account and s.environment=p_environment and s.provider='polar' and(s.status in('active','trialing','past_due') or s.cancel_at_period_end)),'[]'::jsonb)) from base
$$;
revoke all on function private.native_admin_account(uuid,text,text) from public,anon,authenticated,service_role;

create function public.native_admin_execute(p_actor uuid,p_issuer text,p_action text,p_params jsonb,p_environment text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_before jsonb; v_after jsonb; v_rows jsonb; v_counts jsonb; v_id text; v_status text; v_version text; v_state text; v_limit integer; v_account uuid; v_creator private.admin_creators%rowtype; v_amount bigint; v_paid_at timestamptz; v_lock record; v_remaining bigint; v_applied bigint;
begin
 perform private.native_admin_require_owner(p_actor);
 if p_environment is null or p_environment not in('sandbox','production') or p_issuer is null or p_issuer!~'^https://' or jsonb_typeof(p_params) is distinct from 'object' then
  raise exception 'native_admin_invalid' using errcode='22023'; end if;
 if p_action='get_payment_sync' then
  return jsonb_build_object('needs_sync',not exists(select 1 from private.admin_payment_sync where environment=p_environment) or exists(select 1 from private.admin_payments p where p.environment=p_environment and not exists(select 1 from private.admin_payment_history h where h.environment=p_environment and h.account_id=p.account_id)));
 elsif p_action='resolve_payment_account' then
  select user_id into v_account from public.billing_customers where provider='polar' and environment=p_environment and provider_customer_id=p_params->>'customer_id';
  if v_account is null and p_params->>'external_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then select id into v_account from public.profiles where id=(p_params->>'external_id')::uuid; end if;
  if v_account is null then select account_id into v_account from public.account_identities where issuer in(p_issuer,p_issuer||'/') and subject=p_params->>'external_id' order by account_id limit 1; end if;
  return jsonb_build_object('account_id',v_account);
 elsif p_action='sync_admin_payment' then
  perform public.native_admin_record_payment(p_environment,p_params->'payment'); return '{}'::jsonb;
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
  select jsonb_build_object('all',count(*),'paying',count(*) filter(where item->>'plan'<>'free'),'testers',count(*) filter(where item->'roles' @> '["tester"]'::jsonb),'blocked',count(*) filter(where item->>'blocked'='true')) into v_counts
   from(select private.native_admin_account(p.id,p_issuer,p_environment) item from public.profiles p where exists(select 1 from public.account_identities i where i.account_id=p.id and i.issuer in(p_issuer,p_issuer||'/'))) q;
  return v_after||jsonb_build_object('accounts',v_rows,'counts',v_counts);
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
  insert into public.admin_audit_log(actor_account_id,action,target,after_value) values(p_actor,p_action,p_params->>'creator_id',v_after); return v_after;
 end if;
 if p_action='list_creators' then
  select coalesce(jsonb_agg(private.native_admin_creator(c.creator_id,p_environment) order by c.name,c.creator_id),'[]'::jsonb) into v_rows from private.admin_creators c where environment=p_environment;
  select jsonb_build_object('owed_cents',coalesce(sum((c->>'owed_cents')::bigint),0),'sales_cents',coalesce(sum((c->>'sales_cents')::bigint),0),'clients_count',coalesce(sum((c->>'clients_count')::bigint),0)) into v_counts from jsonb_array_elements(v_rows)c;
  v_after:=jsonb_build_object('creators',v_rows,'totals',v_counts);
  insert into public.admin_audit_log(actor_account_id,action,target,after_value) values(p_actor,p_action,p_action,v_after); return v_after;
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
