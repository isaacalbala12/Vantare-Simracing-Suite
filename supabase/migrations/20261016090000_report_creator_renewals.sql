-- VANTA-39 R6: optional #1661 bridge. Standalone reports have no creator writer.
-- Install after both candidate migrations; no remote side effects or operator IDs.
alter table private.report_promotion_changes add column renewal_token uuid;
alter table private.report_promotion_changes add column selected_discount text;
alter table private.report_promotion_changes add column revocation_pending_at timestamptz;
create table private.report_creator_terms (
 environment text not null, subscription_id text not null, account_id uuid not null,
 duration_months integer not null check(duration_months between 1 and 120),
 started_at timestamptz, ends_at timestamptz,
 primary key(environment,subscription_id)
);
-- Operator-validated remainder coupons, never created or inferred by this migration.
-- Same percentage/product as the original creator coupon; repeating duration <= remaining right.
create table private.report_creator_remainders (
 environment text not null, product_id uuid not null, creator_discount_id uuid not null,
 duration_months integer not null check(duration_months between 1 and 120),
 discount_id uuid not null, validated_at timestamptz not null,
 primary key(environment,product_id,creator_discount_id,duration_months)
);
alter table private.report_creator_terms enable row level security;
alter table private.report_creator_remainders enable row level security;
revoke all on private.report_creator_terms,private.report_creator_remainders from public,anon,authenticated,service_role;

-- Presence is derived from private checkout attribution, never remote metadata.
create function private.report_creator_context(p_user uuid,p_environment text,p_subscription text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v jsonb;
begin
 if to_regclass('private.creator_renewal_operations') is null then return null; end if;
 execute 'select to_jsonb(o) from private.creator_renewal_operations o where environment=$1 and subscription_id=$2 and account_id=$3'
 into v using p_environment,p_subscription,p_user;
 if v is not null then return v; end if;
 execute 'select jsonb_build_object(''awaiting_initial'',true) from private.creator_checkout_attributions a join public.billing_checkout_bindings b on b.environment=a.environment and b.user_id=a.account_id and b.attempt_id=a.attempt_id join public.billing_orders o on o.environment=b.environment and o.user_id=b.user_id and o.provider_checkout_id=b.provider_checkout_id where a.environment=$1 and a.account_id=$2 and o.provider_subscription_id=$3 limit 1'
 into v using p_environment,p_user,p_subscription;
 return v;
end $$;


create function private.report_creator_end(p_environment text,p_subscription text,p_now timestamptz)
returns timestamptz language plpgsql security definer set search_path='' as $$
declare terms private.report_creator_terms; ctx jsonb; anchor timestamptz;
begin
 select * into terms from private.report_creator_terms where environment=p_environment and subscription_id=p_subscription;
 if not found then return null; end if;
 ctx:=private.report_creator_context(terms.account_id,p_environment,p_subscription);
 select min(i.period_start) into anchor from private.report_promotion_invoices i where i.environment=p_environment and i.subscription_id=p_subscription and not i.is_initial and i.discount_amount>0 and i.billed_at<=p_now and (i.discount_id=ctx->>'creator_discount_id' or exists(select 1 from private.report_promotion_catalog c where c.environment=p_environment and i.discount_id in (c.launch_discount,c.reward3_discount,c.reward6_discount)));
 return least(terms.ends_at,private.report_promotion_months(anchor,terms.duration_months));
end $$;
create function private.report_creator_due(p_account uuid,p_environment text,p_now timestamptz)
returns boolean language plpgsql security definer set search_path='' as $$
declare p private.report_promotions; ctx jsonb; ends timestamptz; next_bill timestamptz;
begin
 select * into p from private.report_promotions where account_id=p_account and environment=p_environment;
 ctx:=private.report_creator_context(p_account,p_environment,p.subscription_id);
 if ctx is null or p.applied_discount is null then return false; end if;
 if p.applied_discount<>ctx->>'creator_discount_id' and not exists(select 1 from private.report_creator_remainders r where r.environment=p_environment and r.product_id::text=p.product_id and r.discount_id::text=p.applied_discount) then return false; end if;
 ends:=private.report_creator_end(p_environment,p.subscription_id,p_now);
 select max(i.period_end) into next_bill from private.report_promotion_invoices i where i.environment=p_environment and i.subscription_id=p.subscription_id and i.billed_at<=p_now;
 return ends is not null and greatest(p_now,next_bill)>=ends;
end $$;


create function private.report_creator_block_finished(p_account uuid,p_environment text,p_now timestamptz)
returns boolean language plpgsql security definer set search_path='' as $$
declare p private.report_promotions; c private.report_promotion_catalog; block_months integer; used integer;
begin
 select * into p from private.report_promotions where account_id=p_account and environment=p_environment;
 if private.report_creator_context(p_account,p_environment,p.subscription_id) is null then return false; end if;
 select * into c from private.report_promotion_catalog where environment=p_environment and product_id=p.product_id;
 -- Expired/unearned reports must not freeze a still-valid creator right.
 if coalesce(p.applied_discount,'') not in (c.launch_discount,c.reward3_discount,c.reward6_discount)
 and coalesce(p.remote_discount,'') not in (c.launch_discount,c.reward3_discount,c.reward6_discount) then return true; end if;
 if p.applied_at is null then return false; end if;
 block_months:=case p.applied_discount when c.reward6_discount then 6 when c.reward3_discount then 3 when c.launch_discount then 1 else null end;
 if block_months is null then return false; end if;
 select count(distinct i.period_start)::int into used from private.report_promotion_invoices i where i.environment=p_environment and i.subscription_id=p.subscription_id
 and not i.is_initial and i.discount_amount>0 and i.discount_id=p.applied_discount and i.billed_at>=p.applied_at and i.billed_at<=p_now;
 return used>=block_months;
end $$;
-- Post-selection bound shared by both entrypoints. The max-saving comparison is
-- still #1661 billing_creator_renewal_prepare, not a second arbitration here.
create function private.report_creator_bound(p_environment text,p_subscription text,p_operation jsonb,p_now timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare op jsonb; terms private.report_creator_terms; anchor timestamptz; next_bill timestamptz;
 remaining integer; chosen uuid; original uuid; current_id uuid; managed jsonb;
begin
 if p_operation is null or p_operation->>'busy'='true' then return p_operation; end if;
 execute 'select to_jsonb(o) from private.creator_renewal_operations o where environment=$1 and subscription_id=$2'
 into op using p_environment,p_subscription;
 select * into terms from private.report_creator_terms where environment=p_environment and subscription_id=p_subscription for update;
 if not found then return p_operation; end if; -- creator-only #1661 operation, no report interruption
 original:=(op->>'creator_discount_id')::uuid;
 select min(i.period_start) into anchor from private.report_promotion_invoices i
 where i.environment=p_environment and i.subscription_id=p_subscription and not i.is_initial and i.discount_amount>0 and i.billed_at<=p_now
 and (i.discount_id=original::text or exists(select 1 from private.report_promotion_catalog c where c.environment=p_environment and i.discount_id in (c.launch_discount,c.reward3_discount,c.reward6_discount)) or exists(select 1 from private.report_creator_remainders r where r.environment=p_environment and r.product_id=(op->>'product_id')::uuid and r.creator_discount_id=original and r.discount_id::text=i.discount_id));
 if anchor is not null and (terms.started_at is null or anchor<terms.started_at) then
  terms.started_at:=anchor; terms.ends_at:=private.report_promotion_months(anchor,terms.duration_months);
  update private.report_creator_terms set started_at=terms.started_at,ends_at=terms.ends_at where environment=p_environment and subscription_id=p_subscription;
 end if;
 -- Include old managed report/remainder IDs for safe replacement, never an unrelated campaign.
 select coalesce(jsonb_agg(d),'[]') into managed from (
  select unnest(array[c.launch_discount,c.reward3_discount,c.reward6_discount]) d from private.report_promotion_catalog c where c.environment=p_environment
  union select r.discount_id::text from private.report_creator_remainders r where r.environment=p_environment and r.product_id=(op->>'product_id')::uuid and r.creator_discount_id=original
 ) ids;
 p_operation:=p_operation||jsonb_build_object('managed_report_ids',managed);
 if exists(select 1 from public.billing_orders o where o.environment=p_environment and o.provider_order_id=op->>'first_order_id' and (not o.paid or o.status<>'paid' or o.reported_refunded_amount>0))
 or exists(select 1 from public.billing_refunds r where r.environment=p_environment and r.provider_order_id=op->>'first_order_id' and r.status='succeeded' and r.amount>0) then
  execute 'update private.creator_renewal_operations set selected_discount_id=null where environment=$1 and subscription_id=$2' using p_environment,p_subscription;
  return p_operation||jsonb_build_object('discount_id',null);
 end if;
 if p_operation->>'discount_id' is distinct from original::text then return p_operation; end if;
 chosen:=original;
 if terms.ends_at is not null then
  select max(i.period_end) into next_bill from private.report_promotion_invoices i where i.environment=p_environment and i.subscription_id=p_subscription and i.billed_at<=p_now;
  next_bill:=coalesce(next_bill,p_now);
  -- Advance over missed/unreconciled calendar boundaries without extending the original end.
  while next_bill<p_now and next_bill<terms.ends_at loop next_bill:=private.report_promotion_months(next_bill,1); end loop;
  if next_bill>=terms.ends_at then
   chosen:=null;
  else
   -- A coupon already running is not restarted. GET confirmation is enough.
   select discount_id into current_id from private.report_creator_remainders r where r.environment=p_environment and r.product_id=(op->>'product_id')::uuid and r.creator_discount_id=original and r.discount_id::text=(select remote_discount from private.report_promotions p where p.environment=p_environment and p.subscription_id=p_subscription);
   if (select remote_discount from private.report_promotions p where p.environment=p_environment and p.subscription_id=p_subscription) = original::text then current_id:=original; end if;
   if current_id is not null then chosen:=current_id;
   else
    select max(n) into remaining from generate_series(1,terms.duration_months) n where private.report_promotion_months(next_bill,n)<=terms.ends_at;
    select discount_id into chosen from private.report_creator_remainders r where r.environment=p_environment and r.product_id=(op->>'product_id')::uuid and r.creator_discount_id=original and r.duration_months=remaining;
    if chosen is null then raise exception 'creator_renewal_remainder_unconfigured'; end if;
   end if;
  end if;
 end if;
 execute 'update private.creator_renewal_operations set selected_discount_id=$3 where environment=$1 and subscription_id=$2'
 using p_environment,p_subscription,chosen;
 return p_operation||jsonb_build_object('discount_id',chosen,'creator_ends_at',terms.ends_at);
end $$;


create function private.install_report_creator_owner() returns void
language plpgsql security definer set search_path='' as $owner$
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
end $owner$;
revoke all on function private.install_report_creator_owner() from public,anon,authenticated,service_role;
alter function private.install_report_creator_owner() owner to postgres;
-- #1661 can land before or after #1593. Operator reruns this idempotent installer
-- after the second migration; readiness is checked by the adapter before PATCH.
create function public.install_report_creator_bridge() returns boolean
language plpgsql security definer set search_path='' as $install$
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
end $install$;
select public.install_report_creator_bridge();

create function public.report_promotion_renewal_prepare(p_id uuid,p_creator_savings integer,p_creator_months integer,p_now timestamptz default clock_timestamp())
returns jsonb language plpgsql security definer set search_path='' as $$
declare op private.report_promotion_changes; context jsonb; prepared jsonb; selected jsonb; c private.report_promotion_catalog;
begin
 select * into op from private.report_promotion_changes where id=p_id;
 if not found or private.lock_account_write(op.account_id) then return null; end if;
 prepared:=public.report_promotion_prepare(op.account_id,op.environment,p_now);
 if prepared is null or prepared->>'id'<>p_id::text or op.lease_until>p_now then return null; end if;
 if to_regclass('private.creator_renewal_operations') is not null and to_regprocedure('private.billing_creator_renewal_prepare_before_1593(text,uuid,text,text,text,uuid,text,uuid,integer)') is null then raise exception 'creator_renewal_bridge_unconfigured'; end if;
 context:=private.report_creator_context(op.account_id,op.environment,op.subscription_id);
 if context is not null and (context->>'lease_until')::timestamptz>clock_timestamp() then return null; end if;
 select * into c from private.report_promotion_catalog where environment=op.environment and product_id=op.product_id;
 -- Publish even without a creator operation: attribution may arrive later through
 -- reconciliation. The shared creator entrypoint also honors a report-only lease.
 if to_regclass('private.report_renewal_candidates') is not null then
 if op.discount_id is not null and op.kind='apply' then
  execute 'select public.billing_set_report_renewal_candidate($1,$2,$3,$4,$5,$6)'
  using op.environment,op.account_id,op.subscription_id,op.discount_id::uuid,c.normal_cents-c.launch_cents,
    (select reward_expires_at from private.report_promotions where account_id=op.account_id and environment=op.environment);
 else
  execute 'delete from private.report_renewal_candidates where environment=$1 and subscription_id=$2 and account_id=$3'
  using op.environment,op.subscription_id,op.account_id;
 end if;
 end if;
 if context is null then return prepared; end if;
 if context->>'awaiting_initial'='true' then raise exception 'creator_renewal_initial_pending'; end if;
 if to_regprocedure('private.billing_creator_renewal_prepare_before_1593(text,uuid,text,text,text,uuid,text,uuid,integer)') is null then raise exception 'creator_renewal_bridge_unconfigured'; end if;
 if context->>'product_id'<>op.product_id then
  -- An observed server-bound plan change is a commercial fact, even if the
  -- checkout/portal disallow initiating it. Keep the report award moving.
  -- #1661's monthly creator coupon is scoped to both normal monthly products.
  execute 'update private.creator_renewal_operations set product_id=$3,checkout_key=$4,state=''pending'',completed_at=null where environment=$1 and subscription_id=$2'
  using op.environment,op.subscription_id,op.product_id::uuid,case c.plan when 'pro' then 'pro_monthly' else 'pro_plus_monthly' end;
  context:=private.report_creator_context(op.account_id,op.environment,op.subscription_id);
 end if;
 insert into private.report_creator_terms(environment,subscription_id,account_id,duration_months)
 values(op.environment,op.subscription_id,op.account_id,p_creator_months) on conflict do nothing;
 -- A new report operation (including repair/withdrawal) re-evaluates the single
 -- selection under #1661's lease. GET skips any already-confirmed desired state.
 execute 'update private.creator_renewal_operations set state=''pending'',completed_at=null where environment=$1 and subscription_id=$2'
 using op.environment,op.subscription_id;
 -- A revoked creator cannot compete. Reports retain their independently
 -- verified balance; the SAME central lease serializes with pending withdrawal.
 if context->>'revocation_requested_at' is not null then
  selected:=jsonb_build_object('token',gen_random_uuid(),'discount_id',op.discount_id,
    'creator_discount_id',context->>'creator_discount_id','initial_discount_id',context->>'initial_discount_id');
  execute 'update private.creator_renewal_operations set lease_token=$3,lease_until=now()+interval ''60 seconds'',selected_discount_id=$4 where environment=$1 and subscription_id=$2'
   using op.environment,op.subscription_id,(selected->>'token')::uuid,op.discount_id::uuid;
 else
  -- Original RPC still owns the comparison and creator eligibility.
  execute 'select private.billing_creator_renewal_prepare_before_1593($1,$2,null,$3,$4,$5,$6,$7,$8)'
  into selected using op.environment,op.account_id,op.subscription_id,context->>'first_order_id',op.product_id::uuid,context->>'checkout_key',(context->>'initial_discount_id')::uuid,case when private.report_creator_end(op.environment,op.subscription_id,p_now)<=p_now then 0 else p_creator_savings end;
 end if;
 selected:=private.report_creator_bound(op.environment,op.subscription_id,selected,p_now);
 if selected is null or selected->>'busy'='true' then return null; end if;
 update private.report_promotion_changes set renewal_token=(selected->>'token')::uuid,selected_discount=selected->>'discount_id' where id=p_id;
 return prepared||jsonb_build_object('discount_id',selected->>'discount_id','shared_renewal',true,'renewal_token',selected->>'token',
  'repair',op.repair_order_id is not null and selected->>'discount_id'=op.discount_id,
  'managed_discount_ids',coalesce(selected->'managed_report_ids','[]')||jsonb_build_array(selected->>'creator_discount_id',selected->>'initial_discount_id',selected->>'report_discount_id'));
end $$;

alter function public.report_promotion_claim(uuid,uuid,timestamptz) rename to report_promotion_claim_before_1661;
create function public.report_promotion_claim(p_id uuid,p_token uuid,p_now timestamptz default clock_timestamp()) returns boolean
language plpgsql security definer set search_path='' as $$
declare op private.report_promotion_changes; ctx jsonb; permitted boolean;
begin
 select * into op from private.report_promotion_changes where id=p_id;
 if not found or private.lock_account_write(op.account_id) then return false; end if;
 ctx:=private.report_creator_context(op.account_id,op.environment,op.subscription_id);
 if ctx is not null then
  if op.renewal_token is null then return false; end if;
  execute 'select public.billing_creator_renewal_authorized($1,$2,$3)' into permitted using op.environment,op.subscription_id,op.renewal_token;
  -- A refunded initial invoice forbids granting discounts. Removing our managed
  -- discount is still necessary: authorize only the negative selection under
  -- that same live lease and the B03 account lock, never an attachment.
  if permitted is distinct from true and op.selected_discount is null then
   permitted:=ctx->>'state'='pending' and (ctx->>'lease_token')::uuid=op.renewal_token and (ctx->>'lease_until')::timestamptz>clock_timestamp()
    and exists(select 1 from private.report_promotions p where p.account_id=op.account_id and p.environment=op.environment and p.first_refunded);
  end if;
  if permitted is distinct from true and ctx->>'revocation_requested_at' is not null then
   permitted:=ctx->>'state'='pending' and (ctx->>'lease_token')::uuid=op.renewal_token and (ctx->>'lease_until')::timestamptz>clock_timestamp()
    and (op.selected_discount is null or (op.selected_discount=op.discount_id
     and exists(select 1 from private.report_promotion_catalog c where c.environment=op.environment and c.product_id=op.product_id and op.selected_discount in(c.launch_discount,c.reward3_discount,c.reward6_discount))))
    and not exists(select 1 from public.billing_effective_access_grants g where g.environment=op.environment and g.user_id=op.account_id and g.capability='vantare.plan.founders' and g.status='active');
  end if;
  if permitted is distinct from true then return false; end if;
 end if;
 return public.report_promotion_claim_before_1661(p_id,p_token,p_now);
end $$;
alter function public.report_promotion_ack(uuid,uuid,timestamptz,text,text) rename to report_promotion_ack_before_1661;
create function public.report_promotion_ack(p_id uuid,p_token uuid,p_now timestamptz default clock_timestamp(),p_observed_discount text default null,p_cleanup_reason text default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare op private.report_promotion_changes; done boolean; ctx jsonb;
begin
 select * into op from private.report_promotion_changes where id=p_id;
 if not found or private.lock_account_write(op.account_id) then return false; end if;
 if not public.report_promotion_ack_before_1661(p_id,p_token,p_now,p_observed_discount,p_cleanup_reason) then return false; end if;
 if op.renewal_token is not null then
  execute 'select public.billing_creator_renewal_finish($1,$2,$3,true)' into done using op.environment,op.subscription_id,op.renewal_token;
  if done is distinct from true then
    -- PATCH has a confirmed report receipt. Revocation invalidates creator
    -- completion, not the observed remote fact. Never accept an arbitrary false.
    execute 'select to_jsonb(c) from private.creator_renewal_operations c where environment=$1 and subscription_id=$2 and account_id=$3 for update'
     into ctx using op.environment,op.subscription_id,op.account_id;
    if ctx->>'revocation_requested_at' is null or (ctx->>'lease_token')::uuid is distinct from op.renewal_token
     or ctx->>'state' is distinct from 'pending' or not coalesce((ctx->>'lease_until')::timestamptz>clock_timestamp(),false) then raise exception 'creator_renewal_ack_failed'; end if;
    execute 'update private.creator_renewal_operations set lease_token=null,lease_until=null,state=''pending'',completed_at=null,not_applied=''creator:revocation_pending'' where environment=$1 and subscription_id=$2 and lease_token=$3'
     using op.environment,op.subscription_id,op.renewal_token;
    update private.report_promotion_changes set revocation_pending_at=p_now where id=p_id;
   end if;
  if op.kind='apply' then
   update private.report_promotions set applied_discount=op.selected_discount,remote_discount=coalesce(p_observed_discount,op.selected_discount) where account_id=op.account_id and environment=op.environment;
  end if;
 end if;
 return true;
end $$;
create function public.report_promotion_renewal_failed(p_id uuid,p_token uuid) returns void
language plpgsql security definer set search_path='' as $$
declare op private.report_promotion_changes;
begin
 select * into op from private.report_promotion_changes where id=p_id;
 if not found or private.lock_account_write(op.account_id) then return; end if;
 if op.renewal_token is not null and op.renewal_token=p_token then
  execute 'select public.billing_creator_renewal_finish($1,$2,$3,false)' using op.environment,op.subscription_id,op.renewal_token;
 end if;
end $$;
-- Renamed entrypoints are private implementation details, not a lease bypass.
revoke all on function public.report_promotion_claim_before_1661(uuid,uuid,timestamptz),public.report_promotion_ack_before_1661(uuid,uuid,timestamptz,text,text) from public,anon,authenticated,service_role;
revoke all on function private.report_creator_context(uuid,text,text),private.report_creator_bound(text,text,jsonb,timestamptz) from public,anon,authenticated,service_role;
revoke all on function public.install_report_creator_bridge(),public.report_promotion_renewal_prepare(uuid,integer,integer,timestamptz),public.report_promotion_renewal_failed(uuid,uuid),public.report_promotion_claim(uuid,uuid,timestamptz),public.report_promotion_ack(uuid,uuid,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.install_report_creator_bridge(),public.report_promotion_renewal_prepare(uuid,integer,integer,timestamptz),public.report_promotion_renewal_failed(uuid,uuid),public.report_promotion_claim(uuid,uuid,timestamptz),public.report_promotion_ack(uuid,uuid,timestamptz,text,text) to service_role;
alter function private.report_creator_context(uuid,text,text) owner to postgres;
alter function private.report_creator_bound(text,text,jsonb,timestamptz) owner to postgres;
alter function public.install_report_creator_bridge() owner to postgres;
alter function public.report_promotion_renewal_prepare(uuid,integer,integer,timestamptz) owner to postgres;
alter function public.report_promotion_renewal_failed(uuid,uuid) owner to postgres;
alter function public.report_promotion_claim(uuid,uuid,timestamptz) owner to postgres;
alter function public.report_promotion_ack(uuid,uuid,timestamptz,text,text) owner to postgres;

revoke all on function private.report_creator_end(text,text,timestamptz),private.report_creator_due(uuid,text,timestamptz) from public,anon,authenticated,service_role;
alter function private.report_creator_end(text,text,timestamptz) owner to postgres;
alter function private.report_creator_due(uuid,text,timestamptz) owner to postgres;

revoke all on function private.report_creator_block_finished(uuid,text,timestamptz) from public,anon,authenticated,service_role;
alter function private.report_creator_block_finished(uuid,text,timestamptz) owner to postgres;
