-- Generated from disposable PostgreSQL; read-only. Do not edit.
-- Name: report_creator_block_finished(uuid, text, timestamp with time zone); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.report_creator_block_finished(p_account uuid, p_environment text, p_now timestamp with time zone) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--

-- Name: report_creator_bound(text, text, jsonb, timestamp with time zone); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.report_creator_bound(p_environment text, p_subscription text, p_operation jsonb, p_now timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
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
end $_$;


--

-- Name: report_creator_context(uuid, text, text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.report_creator_context(p_user uuid, p_environment text, p_subscription text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare v jsonb;
begin
 if to_regclass('private.creator_renewal_operations') is null then return null; end if;
 execute 'select to_jsonb(o) from private.creator_renewal_operations o where environment=$1 and subscription_id=$2 and account_id=$3'
 into v using p_environment,p_subscription,p_user;
 if v is not null then return v; end if;
 execute 'select jsonb_build_object(''awaiting_initial'',true) from private.creator_checkout_attributions a join public.billing_checkout_bindings b on b.environment=a.environment and b.user_id=a.account_id and b.attempt_id=a.attempt_id join public.billing_orders o on o.environment=b.environment and o.user_id=b.user_id and o.provider_checkout_id=b.provider_checkout_id where a.environment=$1 and a.account_id=$2 and o.provider_subscription_id=$3 limit 1'
 into v using p_environment,p_user,p_subscription;
 return v;
end $_$;


--

-- Name: report_creator_due(uuid, text, timestamp with time zone); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.report_creator_due(p_account uuid, p_environment text, p_now timestamp with time zone) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--

-- Name: report_creator_end(text, text, timestamp with time zone); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.report_creator_end(p_environment text, p_subscription text, p_now timestamp with time zone) RETURNS timestamp with time zone
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare terms private.report_creator_terms; ctx jsonb; anchor timestamptz;
begin
 select * into terms from private.report_creator_terms where environment=p_environment and subscription_id=p_subscription;
 if not found then return null; end if;
 ctx:=private.report_creator_context(terms.account_id,p_environment,p_subscription);
 select min(i.period_start) into anchor from private.report_promotion_invoices i where i.environment=p_environment and i.subscription_id=p_subscription and not i.is_initial and i.discount_amount>0 and i.billed_at<=p_now and (i.discount_id=ctx->>'creator_discount_id' or exists(select 1 from private.report_promotion_catalog c where c.environment=p_environment and i.discount_id in (c.launch_discount,c.reward3_discount,c.reward6_discount)));
 return least(terms.ends_at,private.report_promotion_months(anchor,terms.duration_months));
end $$;


--

-- Name: report_promotion_checkout_started(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.report_promotion_checkout_started() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
 if private.lock_account_write(new.user_id) then return new; end if;
 update private.report_promotion_launch_uses set remote_pending=true,checkout_id=coalesce(new.provider_checkout_id,checkout_id)
 where account_id=new.user_id and environment=new.environment and attempt_id=new.attempt_id and consumed_at is null;
 return new;
end $$;


--

-- Name: report_promotion_eligible(timestamp with time zone); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.report_promotion_eligible(t timestamp with time zone) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$select t >= timestamp '2026-10-26 19:00' at time zone 'Europe/Madrid'
 and t < timestamp '2026-11-26 19:00' at time zone 'Europe/Madrid'$$;


--

-- Name: report_promotion_enrollment_open(timestamp with time zone); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.report_promotion_enrollment_open(t timestamp with time zone) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
 select coalesce((select enrollment_enabled and t is not null and isfinite(t)
  and t>=enrollment_starts_at and t<enrollment_ends_at
  from private.report_promotion_policy where singleton),false)
$$;


--

-- Name: report_promotion_mark_launch(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.report_promotion_mark_launch() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
 if new.provider<>'polar' or not new.paid or new.provider_subscription_id is null then return new; end if;
 if private.lock_account_write(new.user_id) then return new; end if;
 insert into private.report_promotion_launch_uses(account_id,environment,product_id,subscription_id,order_id,reserved_at,consumed_at)
 values(new.user_id,new.environment,new.provider_product_id,new.provider_subscription_id,new.provider_order_id,new.created_at,new.created_at)
 on conflict(account_id,environment) do update set consumed_at=coalesce(private.report_promotion_launch_uses.consumed_at,excluded.consumed_at),
  subscription_id=coalesce(private.report_promotion_launch_uses.subscription_id,excluded.subscription_id),order_id=coalesce(private.report_promotion_launch_uses.order_id,excluded.order_id);
 update private.report_promotion_failures set resolved_at=clock_timestamp() where account_id=new.user_id and environment=new.environment and resolved_at is null and code like 'promotion_checkout_%';
 return new;
end $$;


--

-- Name: report_promotion_months(timestamp with time zone, integer); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.report_promotion_months(t timestamp with time zone, n integer) RETURNS timestamp with time zone
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$select ((t at time zone 'Europe/Madrid')+make_interval(months=>n)) at time zone 'Europe/Madrid'$$;


--

-- Name: report_promotion_progress(uuid, text, timestamp with time zone); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.report_promotion_progress(p_account uuid, p_environment text, p_now timestamp with time zone) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
 select coalesce((
select jsonb_build_object('accepted',
  (select count(*) from public.testing_contributions c join public.testing_contribution_reviews r on r.contribution_id=c.id
   where c.account_id=p.account_id and r.decision='accepted' and c.state in ('accepted','fixed')
   and c.created_at>=p.subscribed_at and c.created_at < p.subscribed_at+interval '1080 hours'
   and r.decided_at<=p_now),
 'spam',(select count(*) from public.testing_contributions c join public.testing_contribution_reviews r on r.contribution_id=c.id
   where c.account_id=p.account_id and r.decision='spam' and c.created_at>=p.subscribed_at and r.decided_at<=p_now),
 'last_error',(select f.code from private.report_promotion_failures f where f.account_id=p.account_id and f.environment=p.environment and f.resolved_at is null),'tier',p.tier,'first_refunded',p.first_refunded,'forfeited',p.forfeited,'active_discount',p.remote_discount,'applied_at',p.applied_at,
 'reward_until',p.reward_until,'reward_expires_at',p.reward_expires_at,'reward_expired',p.reward_expires_at<=p_now,'window_end',p.subscribed_at+interval '1080 hours')
 from private.report_promotions p where account_id=p_account and environment=p_environment
 ),(
 select jsonb_build_object('accepted',0,'spam',0,'tier',0,'first_refunded',false,'forfeited',false,'active_discount',null,'last_error',f.code,'incident_at',f.last_at)
 from private.report_promotion_failures f where f.account_id=p_account and f.environment=p_environment and f.resolved_at is null
 )) where not exists(select 1 from public.account_identities i where i.account_id=p_account and i.deleted_at is not null)
$$;


--

-- Name: testing_center_v2_owner(text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.testing_center_v2_owner(p_reference text) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(i.owner_account_id,c.account_id) from public.testing_center_technical_issues i
  left join public.testing_contributions c on c.id=i.contribution_id
  left join public.testing_center_agent_jobs j on j.technical_issue_id=i.technical_issue_id
  where p_reference in (i.technical_issue_id,j.job_key,i.contribution_id::text)
  limit 1
$$;


--

-- Name: testing_contribution_purge_evidence(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.testing_contribution_purge_evidence() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  delete from public.testing_contribution_attachments a using public.testing_contributions c
    left join public.testing_contribution_reviews r on r.contribution_id = c.id
    where a.contribution_id = c.id and clock_timestamp() >= least(
      coalesce(r.decided_at + interval '90 days','infinity'::timestamptz),
      case when c.created_at >= timestamptz '2026-10-19 00:00:00+00'
        and c.created_at < timestamptz '2026-12-01 00:00:00+00'
        then timestamptz '2027-01-31 00:00:00+00' else 'infinity'::timestamptz end);
  update public.testing_contribution_context ctx set telemetry_summary = null
    from public.testing_contributions c left join public.testing_contribution_reviews r on r.contribution_id = c.id
    where ctx.contribution_id = c.id and ctx.telemetry_summary is not null and clock_timestamp() >= least(
      coalesce(r.decided_at + interval '90 days','infinity'::timestamptz),
      case when c.created_at >= timestamptz '2026-10-19 00:00:00+00'
        and c.created_at < timestamptz '2026-12-01 00:00:00+00'
        then timestamptz '2027-01-31 00:00:00+00' else 'infinity'::timestamptz end);
end $$;


--

-- Name: testing_contribution_review_as(uuid, uuid, text, text, jsonb); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.testing_contribution_review_as(p_reviewer uuid, p_id uuid, p_decision text, p_note text, p_proposal jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
    if r.reviewer = p_reviewer and r.decision = p_decision and r.note = p_note and r.proposal is not distinct from p_proposal and (c.state=p_decision or (p_decision='accepted' and c.state='fixed')) then return; end if;
    raise exception 'testing_review_conflict' using errcode = '23505'; end if;
  if c.state not in ('received','reviewing') then raise exception 'testing_review_conflict' using errcode = '23505'; end if;
  -- Serializes acceptance for different contributions of one account.
  perform pg_advisory_xact_lock(hashtextextended(c.account_id::text,1594));
  t := c.created_at;
  if p_decision = 'accepted' and (
    exists(select 1 from public.testing_contributions x where x.account_id = c.account_id and (x.state in ('accepted','fixed') or exists(select 1 from public.testing_contribution_reviews quota_review where quota_review.contribution_id=x.id and quota_review.decision='accepted'))
      and (x.created_at at time zone 'UTC')::date = (t at time zone 'UTC')::date)
    or (select count(*) from public.testing_contributions x where x.account_id = c.account_id and (x.state in ('accepted','fixed') or exists(select 1 from public.testing_contribution_reviews quota_review where quota_review.contribution_id=x.id and quota_review.decision='accepted'))
      and date_trunc('week',x.created_at at time zone 'UTC') = date_trunc('week',t at time zone 'UTC')) >= 2) then
    raise exception 'testing_acceptance_limit' using errcode = '23514'; end if;
  insert into public.testing_contribution_reviews(contribution_id,reviewer,decision,note,model_verdict,model_confidence,proposal,model)
    values(p_id,p_reviewer,p_decision,p_note,p_proposal->>'verdict',(p_proposal->>'confidence')::double precision,p_proposal,case when p_proposal is null then 'human' else 'opencode-go/deepseek-v4.1-flash' end);
  update public.testing_contributions set state = p_decision where id = p_id;
end $$;


--

-- Name: testing_contribution_submit_for_account(uuid, uuid, text, text, text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.testing_contribution_submit_for_account(p_account uuid, p_id uuid, p_channel text, p_title text, p_body text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if p_account is null then raise exception 'testing_auth_required' using errcode='42501'; end if;
  -- Same UUID lock as deletion, before membership/row locks; recheck after wait.
  if private.lock_account_write(p_account) then
    raise sqlstate '28000' using message='account_deleted'; end if;
  if not (private.is_owner(p_account) and p_channel in ('nightly','testers')) and not exists(select 1 from public.testing_center_memberships m where m.user_id=p_account and m.active
      and ((m.role = 'primary_tester' and p_channel in ('nightly','testers'))
        or (m.role='tester' and p_channel='testers'))) then
    raise exception 'testing_membership_required' using errcode = '42501';
  end if;
  insert into public.testing_contributions(id,account_id,channel,title,body)
    values(p_id,p_account,p_channel,p_title,p_body) on conflict(id) do nothing;
  -- A retry with the same UUID must represent the same payload and account.
  if not exists(select 1 from public.testing_contributions where id = p_id and account_id = p_account
    and channel = p_channel and title = p_title and body = p_body) then
    raise exception 'testing_contribution_conflict' using errcode = '23505';
  end if;
end $$;


--

-- Name: testing_contribution_submit_v2_for_account(uuid, uuid, text, text, text, jsonb, jsonb); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.testing_contribution_submit_v2_for_account(p_account uuid, p_id uuid, p_channel text, p_title text, p_body text, p_context jsonb, p_attachments jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v public.testing_contribution_context%rowtype; a jsonb; items jsonb; accepted_at timestamptz;
begin
  if p_account is null then raise exception 'testing_auth_required' using errcode='42501'; end if;
  -- Same UUID lock as deletion, before membership/row locks; recheck after wait.
  if private.lock_account_write(p_account) then
    raise sqlstate '28000' using message='account_deleted'; end if;
  perform 1 from public.testing_center_memberships where user_id = p_account and active
    and ((role = 'primary_tester' and p_channel in ('nightly','testers'))
      or (role = 'tester' and p_channel = 'testers')) for share;
  if not found and not (private.is_owner(p_account) and p_channel in ('nightly','testers')) then
    raise exception 'testing_membership_required' using errcode = '42501'; end if;
  if p_context is null or jsonb_typeof(p_context) <> 'object'
    or p_context - array['app_version','app_channel','game','game_version','system','telemetry_summary','posthog_session_id','consent'] <> '{}'::jsonb
    or not (p_context ?& array['app_version','app_channel','game','system','consent'])
    or jsonb_typeof(p_context->'app_version') <> 'string' or jsonb_typeof(p_context->'app_channel') <> 'string'
    or jsonb_typeof(p_context->'game') <> 'string' or p_context->>'app_channel' is distinct from p_channel
    or (p_context ? 'game_version' and jsonb_typeof(p_context->'game_version') not in ('string','null'))
    or (p_context ? 'posthog_session_id' and jsonb_typeof(p_context->'posthog_session_id') not in ('string','null'))
    or jsonb_typeof(p_context->'consent') <> 'object' then
    raise exception 'testing_context_invalid' using errcode = '22023'; end if;
  a := p_context->'consent'; items := a->'items';
  if a - array['version','items','accepted_at'] <> '{}'::jsonb
    or a->>'version' is distinct from 'triage-v2' or jsonb_typeof(items) is distinct from 'array'
    or jsonb_typeof(a->'accepted_at') is distinct from 'string' then
    raise exception 'testing_consent_required' using errcode = '22023'; end if;
  if jsonb_array_length(items) > 5 or exists(select 1 from jsonb_array_elements(items) x where
    jsonb_typeof(x.value) <> 'string' or x.value #>> '{}' not in
    ('system','telemetry_summary','app_log','telemetry_fragment','posthog_session'))
    or (select count(*) <> count(distinct value) from jsonb_array_elements(items)) then
    raise exception 'testing_consent_invalid' using errcode = '22023'; end if;
  accepted_at := (a->>'accepted_at')::timestamptz;
  if not isfinite(accepted_at) or accepted_at > clock_timestamp() + interval '5 minutes' then
    raise exception 'testing_consent_invalid' using errcode = '22023'; end if;
  if (not items ? 'system' and p_context->'system' <> '{}'::jsonb)
    or (not items ? 'telemetry_summary' and coalesce(p_context->'telemetry_summary','null'::jsonb) <> 'null'::jsonb)
    or (not items ? 'posthog_session' and coalesce(p_context->'posthog_session_id','null'::jsonb) <> 'null'::jsonb) then
    raise exception 'testing_unconsented_data' using errcode = '22023'; end if;
  if p_attachments is null or jsonb_typeof(p_attachments) <> 'array' then
    raise exception 'testing_attachments_invalid' using errcode = '22023'; end if;
  if jsonb_array_length(p_attachments) > 2 then raise exception 'testing_attachments_invalid' using errcode = '22023'; end if;
  for a in select value from jsonb_array_elements(p_attachments) loop
    if jsonb_typeof(a) <> 'object' or a - array['kind','content','sha256'] <> '{}'::jsonb
      or not (a ?& array['kind','content','sha256'])
      or exists(select 1 from jsonb_each(a) x where jsonb_typeof(x.value) <> 'string')
      or not items ? (a->>'kind') then
      raise exception 'testing_attachments_invalid' using errcode = '22023'; end if;
  end loop;
  -- Parent lock also serializes retries and review against this upload.
  perform private.testing_contribution_submit_for_account(p_account,p_id,p_channel,p_title,p_body);
  perform 1 from public.testing_contributions where id = p_id for update;
  select * into v from public.testing_contribution_context where contribution_id = p_id;
  if found then
    if (to_jsonb(v) - 'contribution_id') is distinct from jsonb_build_object(
      'app_version',p_context->'app_version','app_channel',p_context->'app_channel',
      'game',p_context->'game','game_version',p_context->'game_version','system',p_context->'system',
      'telemetry_summary',nullif(p_context->'telemetry_summary','null'::jsonb),
      'posthog_session_id',p_context->'posthog_session_id','consent',p_context->'consent')
      or (select coalesce(jsonb_agg(jsonb_build_object('kind',kind,'content',content,'sha256',sha256) order by kind),'[]'::jsonb)
        from public.testing_contribution_attachments where contribution_id = p_id)
        is distinct from (select coalesce(jsonb_agg(value order by value->>'kind'),'[]'::jsonb) from jsonb_array_elements(p_attachments)) then
      raise exception 'testing_contribution_conflict' using errcode = '23505'; end if;
    return;
  end if;
  if exists(select 1 from public.testing_contribution_reviews where contribution_id = p_id)
    or exists(select 1 from public.testing_contributions where id = p_id and state <> 'received') then
    raise exception 'testing_contribution_conflict' using errcode = '23505'; end if;
  insert into public.testing_contribution_context values (p_id,p_context->>'app_version',p_channel,
    p_context->>'game',p_context->>'game_version',p_context->'system',
    nullif(p_context->'telemetry_summary','null'::jsonb),p_context->>'posthog_session_id',p_context->'consent');
  insert into public.testing_contribution_attachments
    select p_id,value->>'kind',value->>'content',value->>'sha256' from jsonb_array_elements(p_attachments);
end $$;


--

-- Name: testing_proposal_valid(jsonb); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.testing_proposal_valid(p jsonb) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $_$
declare v jsonb;
begin
  if jsonb_typeof(p) is distinct from 'object' or octet_length(p::text) > 8192
    or not (p ?& array['schema','verdict','criteria','duplicate_of','severity','area','evidence_refs',
      'summary','preliminary_fix','confidence','reasons','trazable'])
    or p - array['schema','verdict','criteria','duplicate_of','severity','area','evidence_refs',
      'summary','preliminary_fix','confidence','reasons','trazable'] <> '{}'::jsonb then return false; end if;
  if p->>'schema' is distinct from 'vantare.triage.v2' or p->>'verdict' not in ('valido','dudoso','spam')
    or jsonb_typeof(p->'verdict') <> 'string' or jsonb_typeof(p->'confidence') <> 'number'
    or p->>'trazable' not in ('si','no') or jsonb_typeof(p->'trazable') <> 'string' then return false; end if;
  if (p->>'confidence')::numeric not between 0 and 1 then return false; end if;
  v := p->'criteria';
  if jsonb_typeof(v) <> 'object' or not (v ?& array['contenido_minimo','evidencia','no_duplicado'])
    or v - array['contenido_minimo','evidencia','no_duplicado'] <> '{}'::jsonb
    or v->>'contenido_minimo' not in ('si','no') or v->>'evidencia' not in ('si','debil','no')
    or v->>'no_duplicado' not in ('si','no')
    or exists(select 1 from jsonb_each(v) x where jsonb_typeof(x.value) <> 'string') then return false; end if;
  if jsonb_typeof(p->'duplicate_of') not in ('string','null') then return false; end if;
  if jsonb_typeof(p->'duplicate_of') = 'string' and p->>'duplicate_of' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  if jsonb_typeof(p->'severity') not in ('string','null') then return false; end if;
  if jsonb_typeof(p->'severity') = 'string' and p->>'severity' not in ('critica','alta','media','baja') then return false; end if;
  if jsonb_typeof(p->'area') <> 'string' or p->>'area' not in
    ('overlays','ingeniero','estrategia','launcher','calendario','testing-center','telemetria','plataforma','licencias','studio','otro')
    or jsonb_typeof(p->'summary') <> 'string' or length(p->>'summary') > 200
    or jsonb_typeof(p->'preliminary_fix') not in ('string','null') or length(p->>'preliminary_fix') > 600 then return false; end if;
  if jsonb_typeof(p->'reasons') <> 'array' or jsonb_typeof(p->'evidence_refs') <> 'array' then return false; end if;
  if jsonb_array_length(p->'reasons') > 5 or jsonb_array_length(p->'evidence_refs') > 50
    or exists(select 1 from jsonb_array_elements(p->'reasons') x where jsonb_typeof(x.value) <> 'string' or length(x.value #>> '{}') > 200)
    or exists(select 1 from jsonb_array_elements(p->'evidence_refs') x where jsonb_typeof(x.value) <> 'string' or length(x.value #>> '{}') > 120) then return false; end if;
  return true;
end $_$;


--

-- Name: testing_report_acceptance_limit(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.testing_report_acceptance_limit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if new.state='accepted' and old.state is distinct from 'accepted' then
    if current_setting('transaction_isolation') <> 'read committed' then
      raise exception 'testing_review_read_committed_required' using errcode='25000'; end if;
    perform pg_advisory_xact_lock(hashtextextended(new.account_id::text,1594));
    if exists(select 1 from public.testing_contributions x
      where x.account_id=new.account_id and x.id<>new.id and x.state in ('accepted','fixed')
        and (x.created_at at time zone 'UTC')::date=(new.created_at at time zone 'UTC')::date)
      or (select count(*) from public.testing_contributions x
        where x.account_id=new.account_id and x.id<>new.id and x.state in ('accepted','fixed')
          and date_trunc('week',x.created_at at time zone 'UTC')=date_trunc('week',new.created_at at time zone 'UTC'))>=2 then
      raise exception 'testing_acceptance_limit' using errcode='23514'; end if;
  end if;
  return new;
end $$;


--

-- Name: testing_report_activity(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.testing_report_activity() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin new.activity:=true; return new; end $$;


--

-- Name: testing_report_limit(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.testing_report_limit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare t timestamptz:=clock_timestamp();
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'testing_report_read_committed_required' using errcode='25001'; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.account_id::text,1610));
  if exists(select 1 from public.testing_contributions where id=new.id) then return new; end if;
  -- now() is the transaction start: an old transaction must not age new reports.
  t:=clock_timestamp();
  new.created_at:=t;
  if length(new.title)>120 or length(new.body)>1000
    or octet_length(new.title)>480 or octet_length(new.body)>4000 then
    raise exception 'testing_report_size' using errcode='22023'; end if;
  if (select count(*) from public.testing_contributions where account_id=new.account_id and created_at>t-interval '1 day')>=5
    or (select count(*) from public.testing_contributions where account_id=new.account_id and created_at>t-interval '7 days')>=20 then
    raise exception 'testing_report_rate_limit' using errcode='54000'; end if;
  return new;
end $$;


--

-- Name: testing_report_purge_admitted_on_delete(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.testing_report_purge_admitted_on_delete() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  delete from private.testing_report_admitted_keys where account_id = new.account_id;
  return new;
end $$;


--

-- Name: testing_report_status(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.testing_report_status() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if new.state is distinct from old.state then
    insert into public.testing_report_followup(contribution_id) values(new.id) on conflict do nothing;
    update public.testing_report_followup set updated_at=clock_timestamp() where contribution_id=new.id;
    if new.state<>'fixed' then
      update public.testing_report_followup set fixed_version=null,reviewed_title=null,reviewed_summary=null where contribution_id=new.id;
    end if;
    if new.state='fixed' and not exists(select 1 from public.testing_report_followup where contribution_id=new.id and fixed_version is not null) then
      raise exception 'testing_report_fix_requires_review' using errcode='22023'; end if;
  end if;
  return new;
end $$;


--

-- Name: testing_report_submit_for_account(uuid, uuid, text, text, text, boolean); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.testing_report_submit_for_account(p_account uuid, p_id uuid, p_channel text, p_title text, p_body text, p_consent boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if p_account is null then raise exception 'testing_auth_required' using errcode='42501'; end if;
  if private.lock_account_write(p_account) then
    raise sqlstate '28000' using message='account_deleted'; end if;
  if p_consent is distinct from true or p_id is null or p_channel not in ('nightly','testers','master') then
    raise exception 'testing_report_consent_required' using errcode='22023'; end if;
  if p_channel in ('nightly','testers') and not private.is_owner(p_account) and not exists (
    select 1 from public.testing_center_memberships m
    where m.user_id=p_account and m.active
      and ((m.role = 'primary_tester' and p_channel in ('nightly','testers'))
        or (m.role='tester' and p_channel='testers'))
    for share
  ) then
    raise exception 'testing_membership_required' using errcode='42501';
  end if;
  insert into public.testing_contributions(id,account_id,channel,title,body)
    values(p_id,p_account,p_channel,p_title,p_body) on conflict(id) do nothing;
  if not exists(select 1 from public.testing_contributions where id=p_id and account_id=p_account
    and channel=p_channel and title=p_title and body=p_body) then
    raise exception 'testing_report_conflict' using errcode='23505'; end if;
  insert into public.testing_report_followup(contribution_id,consent) values(p_id,true)
    on conflict(contribution_id) do update set consent=true;
end $$;


--

-- Name: testing_report_v2_submit(uuid, jsonb); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.testing_report_v2_submit(p_account uuid, p_report jsonb) RETURNS TABLE(report_id uuid, report_state text, idempotent boolean, created_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_id uuid;
  v_key text;
  v_variant text;
  v_digest text;
  v_existing private.testing_report_v2_keys%rowtype;
  v_fields text[] := array['contract_version','report_id','channel','title','body','consent','idempotency_key','variant'];
begin
  if p_account is null or jsonb_typeof(p_report) is distinct from 'object'
    or octet_length(p_report::text)>98304 then
    raise exception 'testing_report_v2_invalid' using errcode='22023'; end if;
  v_variant := p_report->>'variant';
  if v_variant='triage' then
    v_fields := v_fields||array['context','attachments'];
  elsif v_variant='diagnostic' then
    v_fields := v_fields||array['context'];
  elsif v_variant is distinct from 'simple' then
    raise exception 'testing_report_v2_invalid' using errcode='22023'; end if;
  if p_report->>'contract_version' is distinct from 'testing.report.v2'
    or not p_report ?& v_fields or p_report - v_fields <> '{}'::jsonb
    or (p_report->>'report_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or p_report->>'channel' not in ('nightly','testers','master')
    or p_report->'consent' is distinct from 'true'::jsonb
    or length(trim(p_report->>'title')) not between 1 and 120
    or length(trim(p_report->>'body')) not between 1 and 1000
    or (p_report->>'idempotency_key') !~ '^draft_[0-9a-f]{64}$'
    or (v_variant='diagnostic' and jsonb_typeof(p_report->'context') is distinct from 'object')
    or (v_variant='triage' and (jsonb_typeof(p_report->'context') is distinct from 'object'
      or jsonb_typeof(p_report->'attachments') is distinct from 'array')) then
    raise exception 'testing_report_v2_invalid' using errcode='22023'; end if;
  if v_variant='diagnostic' and (
    octet_length((p_report->'context')::text)>8192
    or (p_report->'context') - array['app_version','os_family','os_version','module'] <> '{}'::jsonb
    or exists(select 1 from jsonb_each(p_report->'context') x where jsonb_typeof(x.value)<>'string')) then
    raise exception 'testing_report_v2_invalid' using errcode='22023'; end if;
  if v_variant='triage' and octet_length((p_report->'context')::text)>65536 then
    raise exception 'testing_report_v2_invalid' using errcode='22023'; end if;
  v_id := (p_report->>'report_id')::uuid;
  v_key := p_report->>'idempotency_key';
  v_digest := encode(public.digest(convert_to(p_report::text,'UTF8'),'sha256'),'hex');
  if private.lock_account_write(p_account) then
    raise sqlstate '28000' using message='account_deleted'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_account::text||':'||v_key,0));
  select * into v_existing from private.testing_report_v2_keys
    where account_id=p_account and idempotency_key=v_key for update;
  if found then
    if v_existing.payload_digest<>v_digest or v_existing.report_id<>v_id then
      raise exception 'testing_report_v2_conflict' using errcode='23505'; end if;
    return query select c.id,'received'::text,true,c.created_at from public.testing_contributions c
      where c.id=v_id and c.account_id=p_account;
    if not found then raise exception 'testing_report_v2_missing' using errcode='23505'; end if;
    return;
  end if;
  if v_variant='triage' then
    perform private.testing_contribution_submit_v2_for_account(
      p_account,v_id,p_report->>'channel',p_report->>'title',p_report->>'body',
      p_report->'context',p_report->'attachments');
  end if;
  perform private.testing_report_submit_for_account(
    p_account,v_id,p_report->>'channel',p_report->>'title',p_report->>'body',true);
  if v_variant='diagnostic' then
    update public.testing_report_followup set report_metadata=p_report->'context'
      where contribution_id=v_id;
  end if;
  insert into private.testing_report_v2_keys(account_id,idempotency_key,payload_digest,report_id)
    values(p_account,v_key,v_digest,v_id);
  return query select c.id,'received'::text,false,c.created_at from public.testing_contributions c
    where c.id=v_id and c.account_id=p_account;
end $_$;


--

-- Name: testing_system_valid(jsonb); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.testing_system_valid(p jsonb) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $_$
declare v jsonb;
begin
  if jsonb_typeof(p) is distinct from 'object' or octet_length(p::text) > 4096
    or p - array['os','cpu','gpu','ram_gb','displays','overlays_active','obs_active'] <> '{}'::jsonb then return false; end if;
  if p ? 'os' then
    v := p->'os';
    if jsonb_typeof(v) is distinct from 'object' or v - array['name','version','build'] <> '{}'::jsonb
      or exists(select 1 from jsonb_each(v) x where jsonb_typeof(x.value) <> 'string' or length(x.value #>> '{}') > 120) then return false; end if;
  end if;
  if p ? 'cpu' then
    v := p->'cpu';
    if jsonb_typeof(v) is distinct from 'object' or v - array['model','cores'] <> '{}'::jsonb then return false; end if;
    if v ? 'model' and (jsonb_typeof(v->'model') <> 'string' or length(v->>'model') > 160) then return false; end if;
    if v ? 'cores' and (jsonb_typeof(v->'cores') <> 'number' or (v->>'cores') !~ '^[0-9]+$') then return false; end if;
    if v ? 'cores' and (v->>'cores')::numeric not between 1 and 1024 then return false; end if;
  end if;
  if p ? 'ram_gb' then
    if jsonb_typeof(p->'ram_gb') <> 'number' then return false; end if;
    if (p->>'ram_gb')::numeric not between 0 and 65536 then return false; end if;
  end if;
  if p ? 'obs_active' and jsonb_typeof(p->'obs_active') <> 'boolean' then return false; end if;
  if p ? 'gpu' then
    if jsonb_typeof(p->'gpu') <> 'array' then return false; end if;
    if jsonb_array_length(p->'gpu') > 8 then return false; end if;
    for v in select value from jsonb_array_elements(p->'gpu') loop
      if jsonb_typeof(v) <> 'object' or v - array['model','driver_version'] <> '{}'::jsonb
        or exists(select 1 from jsonb_each(v) x where jsonb_typeof(x.value) <> 'string' or length(x.value #>> '{}') > 160) then return false; end if;
    end loop;
  end if;
  if p ? 'displays' then
    if jsonb_typeof(p->'displays') <> 'array' then return false; end if;
    if jsonb_array_length(p->'displays') > 16 then return false; end if;
    for v in select value from jsonb_array_elements(p->'displays') loop
      if jsonb_typeof(v) <> 'object' or v - array['width','height','hz','dpi_scale','primary'] <> '{}'::jsonb then return false; end if;
      if exists(select 1 from jsonb_each(v) x where
        (x.key = 'primary' and jsonb_typeof(x.value) <> 'boolean') or
        (x.key <> 'primary' and jsonb_typeof(x.value) <> 'number')) then return false; end if;
      if exists(select 1 from jsonb_each(v) x where x.key <> 'primary' and
        (x.value #>> '{}')::numeric not between 0.01 and 65536) then return false; end if;
    end loop;
  end if;
  if p ? 'overlays_active' then
    if jsonb_typeof(p->'overlays_active') <> 'array' then return false; end if;
    if jsonb_array_length(p->'overlays_active') > 5 or exists(
      select 1 from jsonb_array_elements(p->'overlays_active') x where
      jsonb_typeof(x.value) <> 'string' or x.value #>> '{}' not in ('OBS','Streamlabs','SimHub','CrewChief','Vantare')) then return false; end if;
  end if;
  return true;
end $_$;


--

-- Name: testing_telemetry_valid(jsonb); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.testing_telemetry_valid(p jsonb) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $$
declare v jsonb; metric jsonb;
begin
  if p is null then return true; end if;
  if jsonb_typeof(p) is distinct from 'object' or octet_length(p::text) > 32768
    or p - array['errors','performance','events'] <> '{}'::jsonb then return false; end if;
  if p ? 'errors' then
    if jsonb_typeof(p->'errors') <> 'array' then return false; end if;
    if jsonb_array_length(p->'errors') > 20 then return false; end if;
    for v in select value from jsonb_array_elements(p->'errors') loop
      if jsonb_typeof(v) <> 'object' or v - array['type','message','first_line','fingerprint'] <> '{}'::jsonb
        or not (v ?& array['type','message','fingerprint'])
        or exists(select 1 from jsonb_each(v) x where jsonb_typeof(x.value) <> 'string' or length(x.value #>> '{}') > 1000) then return false; end if;
    end loop;
  end if;
  if p ? 'events' then
    if jsonb_typeof(p->'events') <> 'array' then return false; end if;
    if jsonb_array_length(p->'events') > 50 then return false; end if;
    for v in select value from jsonb_array_elements(p->'events') loop
      if jsonb_typeof(v) <> 'object' or v - array['name','at'] <> '{}'::jsonb or not (v ?& array['name','at'])
        or exists(select 1 from jsonb_each(v) x where jsonb_typeof(x.value) <> 'string' or length(x.value #>> '{}') > 120) then return false; end if;
    end loop;
  end if;
  if p ? 'performance' then
    v := p->'performance';
    if jsonb_typeof(v) <> 'object' or v - array['overlay_fps','cpu_percent','memory_mb','telemetry_latency_ms'] <> '{}'::jsonb then return false; end if;
    for metric in select value from jsonb_each(v) loop
      if jsonb_typeof(metric) <> 'object' or metric - array['p50','p95'] <> '{}'::jsonb
        or exists(select 1 from jsonb_each(metric) x where jsonb_typeof(x.value) <> 'number') then return false; end if;
    end loop;
  end if;
  return true;
end $$;


--

-- Name: report_promotion_accounts(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.report_promotion_accounts(p_environment text, p_after uuid DEFAULT NULL::uuid) RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
 select p.account_id from private.report_promotions p where environment=p_environment and (p_after is null or p.account_id>p_after)
 and not exists(select 1 from public.account_identities i where i.account_id=p.account_id and i.deleted_at is not null)
 order by p.account_id limit 50
$$;


--

-- Name: report_promotion_ack(uuid, uuid, timestamp with time zone, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.report_promotion_ack(p_id uuid, p_token uuid, p_now timestamp with time zone DEFAULT clock_timestamp(), p_observed_discount text DEFAULT NULL::text, p_cleanup_reason text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
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
end $_$;


--

-- Name: report_promotion_ack_before_1661(uuid, uuid, timestamp with time zone, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.report_promotion_ack_before_1661(p_id uuid, p_token uuid, p_now timestamp with time zone DEFAULT clock_timestamp(), p_observed_discount text DEFAULT NULL::text, p_cleanup_reason text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare op private.report_promotion_changes;
begin
 select * into op from private.report_promotion_changes where id=p_id;
 if not found or private.lock_account_write(op.account_id) then return false; end if;
 update private.report_promotion_changes set applied_at=p_now where id=p_id and applied_at is null and superseded_at is null and lease_token=p_token and lease_until>p_now;
 if not found then return false; end if;
 update private.report_promotion_failures set resolved_at=p_now where account_id=op.account_id and environment=op.environment and resolved_at is null;
 if op.kind='cleanup' then
   update private.report_promotion_transfers set cleared_at=p_now,cleanup_reason=case when p_cleanup_reason='remote_inactive' then p_cleanup_reason else 'removed' end where account_id=op.account_id and environment=op.environment and subscription_id=op.subscription_id and product_id=op.product_id and cleared_at is null;
 else
   update private.report_promotions set applied_discount=op.discount_id,applied_candidate=op.discount_id,remote_discount=coalesce(p_observed_discount,op.discount_id),applied_at=p_now,repaired_order_id=coalesce(op.repair_order_id,repaired_order_id) where account_id=op.account_id and environment=op.environment and subscription_id=op.subscription_id and product_id=op.product_id;
 end if;
 return true;
end $$;


--

-- Name: report_promotion_checkout_pending(uuid, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.report_promotion_checkout_pending(p_account uuid, p_environment text, p_now timestamp with time zone DEFAULT clock_timestamp()) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare result jsonb;
begin
 if private.lock_account_write(p_account) then raise sqlstate '28000' using message='account_deleted'; end if;
 select jsonb_build_object('attempt_id',u.attempt_id,'checkout_id',coalesce(u.checkout_id,a.provider_checkout_id),'product_id',u.product_id,'catalog_version',a.catalog_version,'retry_at',greatest(u.reserved_at+interval '30 minutes',a.expires_at)) into result
 from private.report_promotion_launch_uses u left join public.billing_checkout_attempts a on a.user_id=u.account_id and a.attempt_id=u.attempt_id and a.environment=u.environment
 where u.account_id=p_account and u.environment=p_environment and u.consumed_at is null and private.report_promotion_eligible(p_now);
 return result;
end $$;


--

-- Name: report_promotion_claim(uuid, uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.report_promotion_claim(p_id uuid, p_token uuid, p_now timestamp with time zone DEFAULT clock_timestamp()) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
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
end $_$;


--

-- Name: report_promotion_claim_before_1661(uuid, uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.report_promotion_claim_before_1661(p_id uuid, p_token uuid, p_now timestamp with time zone DEFAULT clock_timestamp()) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare op private.report_promotion_changes; prepared jsonb;
begin
 select * into op from private.report_promotion_changes where id=p_id;
 if not found or private.lock_account_write(op.account_id) then return false; end if;
 prepared:=public.report_promotion_prepare(op.account_id,op.environment,p_now);
 if prepared is null or prepared->>'id'<>p_id::text then return false; end if;
 update private.report_promotion_changes set lease_token=p_token,lease_until=p_now+interval '60 seconds'
  where id=p_id and applied_at is null and superseded_at is null and (lease_until is null or lease_until<=p_now or lease_token=p_token);
 return found;
end $$;


--

-- Name: report_promotion_cleared(uuid, uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.report_promotion_cleared(p_id uuid, p_token uuid, p_now timestamp with time zone DEFAULT clock_timestamp()) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare account uuid;
begin
 select account_id into account from private.report_promotion_changes where id=p_id;
 if account is null or private.lock_account_write(account) then return false; end if;
 update private.report_promotion_changes set phase='cleared' where id=p_id and applied_at is null and superseded_at is null and lease_token=p_token and lease_until>p_now and repair_order_id is not null;
 return found;
end $$;


--

-- Name: report_promotion_failed(uuid, text, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.report_promotion_failed(p_account uuid, p_environment text, p_code text, p_now timestamp with time zone DEFAULT clock_timestamp()) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
 if private.lock_account_write(p_account) then return; end if;
 insert into private.report_promotion_failures(account_id,environment,code,first_at,last_at) values(p_account,p_environment,p_code,p_now,p_now)
 on conflict(account_id,environment) do update set code=excluded.code,last_at=excluded.last_at,attempts=private.report_promotion_failures.attempts+1,resolved_at=null;
end $$;


--

-- Name: report_promotion_invoice(text, text, text, integer, timestamp with time zone, timestamp with time zone, timestamp with time zone, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.report_promotion_invoice(p_environment text, p_order text, p_discount text, p_amount integer, p_billed timestamp with time zone, p_start timestamp with time zone, p_end timestamp with time zone, p_initial boolean DEFAULT false, p_source text DEFAULT 'webhook'::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare o public.billing_orders;
begin
 if p_source not in ('webhook','reconciliation') then raise sqlstate '22023' using message='invalid_invoice_source'; end if;
 select * into o from public.billing_orders where provider='polar' and environment=p_environment and provider_order_id=p_order;
 if not found or o.provider_subscription_id is null or not o.paid or o.currency<>'eur' then return; end if;
 if private.lock_account_write(o.user_id) then return; end if;
 if not exists(select 1 from private.report_promotion_catalog where environment=p_environment and product_id=o.provider_product_id) then return; end if;
 if p_amount is null or p_amount<0 or p_billed is null or p_start is null or p_end is null
  or not isfinite(p_billed) or not isfinite(p_start) or not isfinite(p_end) or p_end<=p_start then return; end if;
 insert into private.report_promotion_invoices(environment,order_id,account_id,subscription_id,product_id,discount_id,discount_amount,billed_at,period_start,period_end,is_initial,source,reconciled_at)
 values(p_environment,p_order,o.user_id,o.provider_subscription_id,o.provider_product_id,p_discount,p_amount,p_billed,p_start,p_end,p_initial,p_source,case when p_source='reconciliation' then clock_timestamp() end)
 -- A refund never replenishes a spent month; repeated sources only add trace.
 on conflict(environment,order_id) do update set reconciled_at=coalesce(excluded.reconciled_at,private.report_promotion_invoices.reconciled_at);
 update private.report_promotion_invoice_gaps set resolved_at=clock_timestamp() where environment=p_environment and order_id=p_order and resolved_at is null;
 update private.report_promotion_failures set resolved_at=clock_timestamp() where account_id=o.user_id and environment=p_environment and resolved_at is null
  and code='promotion_invoice_details_missing' and not exists(select 1 from private.report_promotion_invoice_gaps g where g.account_id=o.user_id and g.environment=p_environment and g.resolved_at is null);
end $$;


--

-- Name: report_promotion_invoice_missing(text, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.report_promotion_invoice_missing(p_environment text, p_order text, p_now timestamp with time zone DEFAULT clock_timestamp()) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare o public.billing_orders;
begin
 select * into o from public.billing_orders where provider='polar' and environment=p_environment and provider_order_id=p_order;
 if not found or not o.paid or o.provider_subscription_id is null or private.lock_account_write(o.user_id) then return; end if;
 if not exists(select 1 from private.report_promotion_catalog c where c.environment=p_environment and c.product_id=o.provider_product_id)
 or exists(select 1 from private.report_promotion_invoices i where i.environment=p_environment and i.order_id=p_order) then return; end if;
 insert into private.report_promotion_invoice_gaps(environment,order_id,account_id,first_at,last_at) values(p_environment,p_order,o.user_id,p_now,p_now)
 on conflict(environment,order_id) do update set last_at=excluded.last_at,resolved_at=null;
 perform public.report_promotion_failed(o.user_id,p_environment,'promotion_invoice_details_missing',p_now);
end $$;


--

-- Name: report_promotion_observe(uuid, text, text, text, timestamp with time zone, timestamp with time zone, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.report_promotion_observe(p_account uuid, p_environment text, p_subscription text, p_product text, p_started timestamp with time zone, p_modified timestamp with time zone, p_discount text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare s public.billing_subscriptions; c private.report_promotion_catalog; existing private.report_promotions; until_time timestamptz;
begin
 if private.lock_account_write(p_account) then raise sqlstate '28000' using message='account_deleted'; end if;
 select * into c from private.report_promotion_catalog where environment=p_environment and product_id=p_product;
 if not found then return; end if;
 select * into s from public.billing_subscriptions where user_id=p_account and provider='polar'
   and environment=p_environment and provider_subscription_id=p_subscription;
 if not found or s.provider_product_id is distinct from p_product or s.status not in ('active','uncanceled') then return; end if;
 if p_modified is null or not isfinite(p_modified) or p_started is null or not isfinite(p_started) then return; end if;
 select * into existing from private.report_promotions where account_id=p_account and environment=p_environment for update;
 if found then
   -- Ignore old deliveries and an older subscription waking up after replacement.
   if p_subscription=existing.subscription_id and p_modified<=existing.observed_at then return; end if;
   if p_subscription<>existing.subscription_id and (p_started,p_subscription)<=(existing.current_started_at,existing.subscription_id)
    and exists(select 1 from public.billing_subscriptions b where b.user_id=p_account and b.environment=p_environment and b.provider='polar' and b.provider_subscription_id=existing.subscription_id and b.status in ('active','uncanceled')) then return; end if;
   if existing.subscription_id<>p_subscription or existing.product_id<>p_product then
     select greatest(p_modified,coalesce(max(lease_until),p_modified)) into until_time from private.report_promotion_changes
      where account_id=p_account and environment=p_environment and applied_at is null and superseded_at is null;
     update private.report_promotion_transfers set cleared_at=p_modified where account_id=p_account and environment=p_environment and subscription_id=p_subscription and cleared_at is null;
     insert into private.report_promotion_transfers(account_id,environment,subscription_id,product_id,next_subscription_id,next_product_id,observed_at,cleanup_after,cleared_at)
     values(p_account,p_environment,existing.subscription_id,existing.product_id,p_subscription,p_product,p_modified,until_time,
       case when existing.subscription_id=p_subscription then p_modified end);
     update private.report_promotion_changes set superseded_at=p_modified where account_id=p_account and environment=p_environment and applied_at is null and superseded_at is null;
     update private.report_promotions set subscription_id=p_subscription,product_id=p_product,current_started_at=p_started,
      remote_discount=p_discount,observed_at=p_modified,remote_period_end=null,applied_at=null,applied_discount=null,
      creator_discount=case when exists(select 1 from private.report_promotion_creators where environment=p_environment and product_id=p_product and discount_id=existing.creator_discount) then existing.creator_discount end
      where account_id=p_account and environment=p_environment;
   else
     update private.report_promotions set remote_discount=p_discount,observed_at=p_modified
      where account_id=p_account and environment=p_environment;
   end if;
 else
   if not coalesce(private.report_promotion_enrollment_open(p_started),false) then return; end if;
   insert into private.report_promotions(account_id,environment,subscription_id,original_subscription_id,product_id,subscribed_at,current_started_at,first_renewal,observed_at,creator_discount,remote_discount)
   values(p_account,p_environment,p_subscription,p_subscription,p_product,p_started,p_started,private.report_promotion_months(p_started,1),p_modified,
    case when exists(select 1 from private.report_promotion_creators where environment=p_environment and product_id=p_product and discount_id=p_discount) then p_discount end,p_discount);
 end if;
end $$;


--

-- Name: report_promotion_period(uuid, text, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.report_promotion_period(p_account uuid, p_environment text, p_subscription text, p_end timestamp with time zone) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
 if private.lock_account_write(p_account) or p_end is null or not isfinite(p_end) then return; end if;
 update private.report_promotions set remote_period_end=p_end where account_id=p_account and environment=p_environment and subscription_id=p_subscription;
end $$;


--

-- Name: report_promotion_prepare(uuid, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.report_promotion_prepare(p_account uuid, p_environment text, p_now timestamp with time zone DEFAULT clock_timestamp()) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare p private.report_promotions; s public.billing_subscriptions; c private.report_promotion_catalog;
 earned integer; desired text; op private.report_promotion_changes; prior private.report_promotion_transfers; target_sub text; target_product text; action_kind text:='apply'; spent integer; repair text; first_order public.billing_orders; spam_at timestamptz; accepted_before_spam integer; grant_at timestamptz; valid_months integer; renewal_changed boolean:=false;
begin
 if private.lock_account_write(p_account) then return null; end if;
 select * into p from private.report_promotions where account_id=p_account and environment=p_environment for update;
 if not found then return null; end if;
 select * into s from public.billing_subscriptions where user_id=p_account and provider='polar'
  and environment=p_environment and provider_subscription_id=p.subscription_id;
 if not found or s.status not in ('active','uncanceled') or s.provider_product_id is distinct from p.product_id then return null; end if;
 -- An active subscription event may precede its first invoice. Never replace
 -- the launch discount until a paid invoice for this exact subscription exists.
 select o.* into first_order from public.billing_orders o join private.report_promotion_invoices i on i.environment=o.environment and i.order_id=o.provider_order_id and i.is_initial
 where o.user_id=p_account and o.provider='polar' and o.environment=p_environment and o.provider_subscription_id=p.original_subscription_id and o.paid and o.currency='eur' order by i.billed_at,o.id limit 1;
 if not found then
   perform public.report_promotion_failed(p_account,p_environment,'promotion_initial_invoice_missing',p_now);
   return null;
 end if;
 update private.report_promotion_failures set resolved_at=p_now where account_id=p_account and environment=p_environment and code='promotion_initial_invoice_missing' and resolved_at is null;
 p.first_refunded:=p.first_refunded or first_order.status<>'paid' or first_order.reported_refunded_amount>0
  or exists(select 1 from public.billing_refunds r where r.environment=p_environment and r.provider_order_id=first_order.provider_order_id and r.status='succeeded' and r.amount>0);
 select * into c from private.report_promotion_catalog where environment=p_environment and product_id=p.product_id;
 if exists(select 1 from private.report_promotion_invoice_gaps g where g.account_id=p_account and g.environment=p_environment and g.resolved_at is null) and not p.first_refunded then
   perform public.report_promotion_failed(p_account,p_environment,'promotion_invoice_details_missing',p_now);
   return null; -- Do not rearm while a known paid cycle has incomplete accounting.
 end if;
 -- Benefits are consumed by settled recurring invoice periods, never by the mirror clock.
 select r.decided_at into spam_at from public.testing_contribution_reviews r join public.testing_contributions t on t.id=r.contribution_id
 where t.account_id=p_account and t.created_at>=p.subscribed_at and r.decision='spam' and r.decided_at<=p_now order by r.decided_at,t.id offset 1 limit 1;
 p.forfeited_at:=coalesce(p.forfeited_at,spam_at);
 p.forfeited:=p.forfeited or p.forfeited_at is not null;
 select count(*)::integer into accepted_before_spam from public.testing_contributions t join public.testing_contribution_reviews r on r.contribution_id=t.id
 where t.account_id=p_account and t.state in ('accepted','fixed') and r.decision='accepted' and t.created_at>=p.subscribed_at and t.created_at<p.subscribed_at+interval '1080 hours'
 and r.decided_at<=p_now and (p.forfeited_at is null or r.decided_at<p.forfeited_at);
 earned:=case when accepted_before_spam>=5 then 6 when accepted_before_spam>=2 then 3 else 0 end;
 if earned>p.tier and not p.first_refunded then
   select r.decided_at into grant_at from public.testing_contributions t join public.testing_contribution_reviews r on r.contribution_id=t.id
   where t.account_id=p_account and t.state in ('accepted','fixed') and r.decision='accepted' and t.created_at>=p.subscribed_at and t.created_at<p.subscribed_at+interval '1080 hours'
   and r.decided_at<=p_now and (p.forfeited_at is null or r.decided_at<p.forfeited_at) order by r.decided_at,t.id offset (case earned when 6 then 4 else 1 end) limit 1;
   p.tier:=earned; p.reward_granted_at:=coalesce(p.reward_granted_at,grant_at);
   select reward_valid_months into strict valid_months from private.report_promotion_policy where singleton;
   p.reward_expires_at:=private.report_promotion_months(grant_at,valid_months);
 end if;
 select count(distinct (i.subscription_id,i.period_start))::integer,min(i.period_start),max(i.period_end)
 into spent,p.reward_from,p.reward_until
 from private.report_promotion_invoices i join private.report_promotion_catalog x on x.environment=i.environment and x.product_id=i.product_id
 where i.account_id=p_account and i.environment=p_environment and i.billed_at>=p.reward_granted_at and i.billed_at<=p_now
 and (not i.is_initial or i.subscription_id<>p.original_subscription_id) and i.discount_amount>0 and i.discount_id in (x.launch_discount,x.reward3_discount,x.reward6_discount);
 desired:=null;
 if p.tier>0 and spent<p.tier and not p.first_refunded then
   desired:=case when p.tier-spent>=6 then c.reward6_discount when p.tier-spent>=3 then c.reward3_discount else c.launch_discount end;
 end if;
 -- A paid, undiscounted renewal after the last confirmed application proves a
 -- provider-side expiry/missed cycle. Repair exactly once for that invoice.
 select i.order_id into repair from private.report_promotion_invoices i
 where i.account_id=p_account and i.environment=p_environment and i.subscription_id=p.subscription_id
 and (not i.is_initial or i.subscription_id<>p.original_subscription_id) and i.billed_at>p.applied_at and i.billed_at<=p_now
 and (i.discount_amount=0 or (p.applied_discount=c.launch_discount and i.discount_id=p.applied_discount and i.discount_amount>0))
 and i.order_id is distinct from p.repaired_order_id order by i.billed_at desc,i.order_id desc limit 1;
 if desired is null then repair:=null; end if;
 -- Creator selection belongs exclusively to the leased #1661 renewal RPC.
 update private.report_promotions set tier=p.tier,reward_granted_at=p.reward_granted_at,reward_expires_at=p.reward_expires_at,reward_from=p.reward_from,reward_until=p.reward_until,forfeited=p.forfeited,forfeited_at=p.forfeited_at,first_refunded=p.first_refunded
  where account_id=p_account and environment=p_environment;
 -- Expiry stops new allocations and repairs; an already-confirmed finite
 -- coupon finishes naturally. Refund policy still revokes it independently.
 if p.reward_expires_at<=p_now and not p.first_refunded then
   update private.report_promotion_changes set superseded_at=p_now where account_id=p_account and environment=p_environment
    and applied_at is null and superseded_at is null and discount_id is not null and (lease_until is null or lease_until<=p_now);
   -- A finite confirmed block may outlive the award expiry. After its actual
   -- settled charges, withdraw reports and let the shared creator writer resume.
   if to_regprocedure('private.report_creator_block_finished(uuid,text,timestamptz)') is not null then
    execute 'select private.report_creator_block_finished($1,$2,$3)' into renewal_changed using p_account,p_environment,p_now;
   end if;
   if not coalesce(renewal_changed,false) then return null; end if;
   desired:=null; repair:=null;
 end if;
 target_sub:=p.subscription_id; target_product:=p.product_id;
 -- A non-billable predecessor needs no provider mutation. Keep its audit.
 update private.report_promotion_transfers t set cleared_at=p_now,cleanup_reason='mirror_inactive'
 where t.account_id=p_account and t.environment=p_environment and t.cleared_at is null and t.cleanup_after<=p_now
 and exists(select 1 from public.billing_subscriptions b where b.user_id=p_account and b.provider='polar' and b.environment=p_environment and b.provider_subscription_id=t.subscription_id and b.status in ('canceled','paused'));
 select * into prior from private.report_promotion_transfers where account_id=p_account and environment=p_environment and cleared_at is null order by id limit 1;
 if found then
   if prior.cleanup_after>p_now then return null; end if;
   target_sub:=prior.subscription_id; target_product:=prior.product_id; action_kind:='cleanup'; desired:=null; repair:=null;
   select * into c from private.report_promotion_catalog where environment=p_environment and product_id=target_product;
 end if;
 select * into op from private.report_promotion_changes where account_id=p_account and environment=p_environment and applied_at is null and superseded_at is null;
 if found and (op.discount_id is distinct from desired or op.subscription_id<>target_sub or op.product_id<>target_product or op.repair_order_id is distinct from repair) then
   if op.lease_until>p_now then return null; end if;
   update private.report_promotion_changes set superseded_at=p_now where id=op.id;
   op.id:=null;
 end if;
 if to_regprocedure('private.report_creator_due(uuid,text,timestamptz)') is not null then
  execute 'select private.report_creator_due($1,$2,$3)' into renewal_changed using p_account,p_environment,p_now;
 end if;
 if op.id is null then
   if not coalesce(renewal_changed,false) and repair is null and action_kind='apply' and p.applied_at is not null and p.applied_candidate is not distinct from desired and (p.remote_discount is not distinct from p.applied_discount or (desired is null and not exists(select 1 from private.report_promotion_catalog x where x.environment=p_environment and p.remote_discount in (x.launch_discount,x.reward3_discount,x.reward6_discount)))) then return null; end if;
   insert into private.report_promotion_changes(account_id,environment,discount_id,tier,subscription_id,product_id,kind,repair_order_id) values(p_account,p_environment,desired,p.tier,target_sub,target_product,action_kind,repair) returning * into op;
 end if;
 return jsonb_build_object('id',op.id,'subscription_id',op.subscription_id,'product_id',op.product_id,'kind',op.kind,'repair',op.repair_order_id is not null,'phase',op.phase,'remaining',greatest(0,p.tier-spent),
  'discount_id',op.discount_id,'tier',op.tier,'normal_cents',c.normal_cents,'managed_discount_ids',(select jsonb_agg(d) from (select unnest(array[x.launch_discount,x.reward3_discount,x.reward6_discount]) d from private.report_promotion_catalog x where x.environment=p_environment) discounts));
end $_$;


--

-- Name: report_promotion_renewal_failed(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.report_promotion_renewal_failed(p_id uuid, p_token uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare op private.report_promotion_changes;
begin
 select * into op from private.report_promotion_changes where id=p_id;
 if not found or private.lock_account_write(op.account_id) then return; end if;
 if op.renewal_token is not null and op.renewal_token=p_token then
  execute 'select public.billing_creator_renewal_finish($1,$2,$3,false)' using op.environment,op.subscription_id,op.renewal_token;
 end if;
end $_$;


--

-- Name: report_promotion_renewal_prepare(uuid, integer, integer, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.report_promotion_renewal_prepare(p_id uuid, p_creator_savings integer, p_creator_months integer, p_now timestamp with time zone DEFAULT clock_timestamp()) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
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
end $_$;


--

-- Name: testing_answer_save(uuid, smallint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_answer_save(p_id uuid, p_score smallint, p_note text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_channel text;
begin
  -- Lock catalog row so unpublishing cannot race with accepting an answer.
  select channel into v_channel from public.testing_questionnaires where id = p_id and published for share;
  if private.current_account() is null or v_channel is null or not public.testing_center_can_view_channel(v_channel) then
    raise exception 'testing_membership_required' using errcode = '42501';
  end if;
  insert into public.testing_answers(questionnaire_id,account_id,score,note)
    values(p_id,private.current_account(),p_score,p_note)
    on conflict(questionnaire_id,account_id) do update set score = excluded.score, note = excluded.note, updated_at = now();
end $$;


--

-- Name: testing_center_agent_job_key(text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_center_agent_job_key(p_technical_issue_id text, p_report_digest text, p_nightly_base_sha text, p_policy_version text) RETURNS text
    LANGUAGE sql IMMUTABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        p_technical_issue_id || p_report_digest || p_nightly_base_sha || p_policy_version,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
$$;


--

-- Name: testing_center_agent_transition_allowed(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_center_agent_transition_allowed(p_from text, p_to text) RETURNS boolean
    LANGUAGE sql IMMUTABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1 from (values
      ('triage_queued','triaged'),
      ('triaged','duplicate'),('triaged','needs_info'),('triaged','ineligible'),('triaged','eligible'),
      ('eligible','red_running'),('red_running','red_verified'),
      ('red_verified','green_running'),('green_running','diff_verified'),
      ('diff_verified','review_approved'),('review_approved','ci_running'),
      ('ci_running','merge_queued'),('merge_queued','merged_nightly'),
      ('merged_nightly','smoke_running'),('merged_nightly','smoke_failed'),
      ('smoke_running','nightly_tagged'),('smoke_running','smoke_failed'),
      ('nightly_tagged','completed'),('smoke_failed','revert_pr_open'),
      ('revert_pr_open','reverted')
    ) as allowed(from_state,to_state)
    where allowed.from_state = p_from and allowed.to_state = p_to
  ) or (
    p_to in ('needs_owner','stopped')
    and p_from in (
      'triage_queued','triaged','eligible','red_running','red_verified','green_running',
      'diff_verified','review_approved','ci_running','merge_queued','merged_nightly',
      'smoke_running','nightly_tagged','smoke_failed','revert_pr_open'
    )
  )
$$;


--

-- Name: testing_center_assert_github_effect_unpaused(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_center_assert_github_effect_unpaused(p_effect_id text, p_lease_token uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_issue_id text;
begin
  select technical_issue_id into v_issue_id from public.testing_center_effect_outbox
  where effect_id = p_effect_id and state = 'claimed' and lease_token = p_lease_token
    and lease_expires_at > now() for update;
  if not found then raise exception 'testing_center_github_lease_lost' using errcode = '55000'; end if;
  if exists (select 1 from public.testing_center_pauses p where p.is_paused and
    (p.scope = 'global' or (p.scope = 'flow' and p.technical_issue_id = v_issue_id))) then
    raise exception 'testing_center_paused' using errcode = '55000';
  end if;
end; $$;


--

-- Name: testing_center_assert_linear_dispatch(text, text, bigint, text, jsonb, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_center_assert_linear_dispatch(p_effect_id text, p_worker_id text, p_fencing_token bigint, p_source_digest text, p_projection jsonb, p_canonical_projection text, p_projection_digest text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_effect public.testing_center_effect_outbox%rowtype;
  v_snapshot public.testing_center_linear_projection_snapshots%rowtype;
  v_digest text;
  v_keys text[];
  v_report jsonb;
begin
  lock table public.testing_center_pauses in share mode;
  select * into v_effect from public.testing_center_effect_outbox
  where effect_id = p_effect_id for update;
  if not found or v_effect.effect_type <> 'linear_issue_create'
    or v_effect.state <> 'claimed'
    or v_effect.lease_owner is distinct from p_worker_id
    or v_effect.fencing_token is distinct from p_fencing_token
    or v_effect.lease_expires_at <= now() then
    raise exception 'testing_center_linear_lease_lost' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.testing_center_pauses pause
    where pause.is_paused and (pause.scope = 'global'
      or (pause.scope = 'flow' and pause.technical_issue_id = v_effect.technical_issue_id))
  ) then
    raise exception 'testing_center_paused' using errcode = '55000';
  end if;
  if not exists (
    select 1 from public.testing_center_issue_destinations destination
    where destination.technical_issue_id = v_effect.technical_issue_id
      and destination.destination = 'linear'
      and destination.active_effect_id = v_effect.effect_id
      and destination.decision_state = 'selected'
  ) then
    raise exception 'testing_center_linear_effect_not_selected' using errcode = '55000';
  end if;
  select * into v_snapshot from public.testing_center_linear_projection_snapshots
  where effect_id = p_effect_id for update;
  if not found then
    raise exception 'testing_center_linear_projection_not_prepared' using errcode = '55000';
  end if;
  begin
    if p_canonical_projection::jsonb is distinct from p_projection then
      raise exception 'testing_center_linear_projection_integrity_invalid'
        using errcode = '22023';
    end if;
  exception when invalid_text_representation then
    raise exception 'testing_center_linear_projection_integrity_invalid'
      using errcode = '22023';
  end;
  v_digest := pg_catalog.encode(public.digest(
    pg_catalog.convert_to(p_canonical_projection,'UTF8'),'sha256'),'hex');
  if pg_catalog.jsonb_typeof(p_projection) <> 'object' then
    raise exception 'testing_center_linear_projection_integrity_invalid'
      using errcode = '22023';
  end if;
  select pg_catalog.array_agg(key order by key) into v_keys
  from pg_catalog.jsonb_object_keys(p_projection) as keys(key);
  v_report := v_snapshot.source_snapshot->'report';
  if p_source_digest is distinct from v_snapshot.source_digest
    or v_keys is distinct from array[
      'contractVersion','description','effectId','labels','marker','operation',
      'project','serverMetadataDigest','sourceDigest','status','team',
      'technicalIssueId','title'
    ]::text[]
    or p_projection->>'contractVersion' <> 'testing-center.linear-issue.v1'
    or p_projection->>'operation' <> 'create_issue'
    or p_projection->>'effectId' <> v_snapshot.effect_id
    or p_projection->>'technicalIssueId' <> v_snapshot.technical_issue_id
    or p_projection->>'sourceDigest' <> v_snapshot.source_digest
    or p_projection->>'marker' <> v_snapshot.marker
    or p_projection->>'team' <> 'My Live'
    or p_projection->>'project' <> 'Testing Center — Feedback'
    or p_projection->>'status' <> 'Backlog'
    or p_projection->>'serverMetadataDigest'
      <> 'c1fa41d3a00740a5a0978530c6210b856d1fa28befe24a2bf64bacd45fbaf09b'
    or p_projection->'labels' is distinct from pg_catalog.jsonb_build_array(
      'testing-center','needs-triage','channel:' || (v_report->>'channel'),
      'module:' || (v_report->>'module'),'status:needs-triage')
    or pg_catalog.jsonb_typeof(p_projection->'title') <> 'string'
    or pg_catalog.octet_length(p_projection->>'title') not between 1 and 255
    or pg_catalog.jsonb_typeof(p_projection->'description') <> 'string'
    or pg_catalog.octet_length(p_projection->>'description') not between 1 and 32768
    or pg_catalog.strpos(p_projection->>'description', v_snapshot.marker) <> 1
    or p_projection_digest is distinct from v_digest
    or p_projection ?| array['assignee','assigneeId','priority','delegate',
      'instructions','commands','branch','baseBranch'] then
    raise exception 'testing_center_linear_projection_integrity_invalid'
      using errcode = '22023';
  end if;
  update public.testing_center_linear_projection_snapshots
  set sanitized_projection = p_projection,
    projection_digest = p_projection_digest,
    completed_at = coalesce(completed_at, now())
  where effect_id = p_effect_id
    and (sanitized_projection is null or (
      sanitized_projection = p_projection
      and projection_digest = p_projection_digest
    ));
  if not found then
    raise exception 'testing_center_linear_projection_conflict' using errcode = '23505';
  end if;
end $$;


--

-- Name: testing_center_authorize_codex_dispatch(text, text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_center_authorize_codex_dispatch(p_technical_issue_id text, p_worker_id text, p_fencing_token bigint) RETURNS TABLE(run_id text, request_digest text, analysis_base_sha text, nightly_head_sha text, ancestry_proof_digest text, fencing_token bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_row public.testing_center_codex_execution_control%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('testing-center.codex.global', 0)
  );
  lock table public.testing_center_pauses in share mode;
  select control.* into v_row
  from public.testing_center_codex_execution_control as control
  where control.technical_issue_id = p_technical_issue_id
  for update;
  if not found or v_row.state <> 'claimed'
    or v_row.lease_owner <> p_worker_id
    or v_row.fencing_token <> p_fencing_token
    or v_row.lease_expires_at <= pg_catalog.now() then
    raise exception 'testing_center_codex_lease_lost' using errcode = '55000';
  end if;
  if not exists (
    select 1 from public.testing_center_technical_issues as issue
    where issue.technical_issue_id = p_technical_issue_id
      and issue.state = 'open' and issue.flow_state = 'queued'
  ) then
    raise exception 'testing_center_codex_issue_not_ready' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.testing_center_pauses as pause
    where pause.is_paused and (
      pause.scope = 'global'
      or (pause.scope = 'flow' and pause.technical_issue_id = p_technical_issue_id)
    )
  ) then
    raise exception 'testing_center_paused' using errcode = '55000';
  end if;

  update public.testing_center_codex_execution_control as control
  set state = 'dispatching', dispatch_count = 1, updated_at = pg_catalog.now()
  where control.technical_issue_id = p_technical_issue_id
  returning control.* into v_row;
  run_id := v_row.run_id;
  request_digest := v_row.request_digest;
  analysis_base_sha := v_row.analysis_base_sha;
  nightly_head_sha := v_row.nightly_head_sha;
  ancestry_proof_digest := v_row.ancestry_proof_digest;
  fencing_token := v_row.fencing_token;
  return next;
end
$$;


--

-- Name: testing_center_bind_linear_issue(text, uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_center_bind_linear_issue(p_effect_id text, p_external_issue_id uuid, p_organization_id uuid, p_bound_by_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare v_effect public.testing_center_effect_outbox%rowtype;
begin
  if p_external_issue_id is null or p_organization_id is null
    or p_bound_by_id is null
    or p_bound_by_id !~ '^[a-z0-9][a-z0-9._-]{0,127}$' then
    raise exception 'testing_center_linear_binding_invalid' using errcode = '22023';
  end if;
  select * into v_effect from public.testing_center_effect_outbox
  where effect_id = p_effect_id for update;
  if not found or v_effect.effect_type <> 'linear_issue_create'
    or v_effect.state not in ('completed','dry_run_completed')
    or not exists (
      select 1 from public.testing_center_issue_destinations destination
      where destination.technical_issue_id = v_effect.technical_issue_id
        and destination.active_effect_id = v_effect.effect_id
        and destination.destination = 'linear'
    ) then
    raise exception 'testing_center_linear_binding_effect_invalid' using errcode = '55000';
  end if;
  insert into public.testing_center_linear_issue_bindings(
    external_issue_id, organization_id, technical_issue_id, effect_id, bound_by_id
  ) values (
    p_external_issue_id, p_organization_id, v_effect.technical_issue_id,
    v_effect.effect_id, p_bound_by_id
  );
  insert into public.testing_center_linear_reconciliations(
    technical_issue_id, effect_id, external_issue_id, observed_state
  ) values (
    v_effect.technical_issue_id, v_effect.effect_id, p_external_issue_id,
    'linear_created'
  );
end $_$;


--

-- Name: testing_center_can_view_channel(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_center_can_view_channel(p_channel text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select case public.testing_center_current_role()
    when 'owner' then p_channel in ('nightly', 'testers')
    when 'primary_tester' then p_channel in ('nightly', 'testers')
    when 'tester' then p_channel = 'testers'
    else false
  end
$$;


--

-- Name: testing_center_claim_agent_effect(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_center_claim_agent_effect(p_worker_id text, p_lease_seconds integer DEFAULT 60) RETURNS TABLE(effect_id text, job_key text, effect_kind text, effect_target text, payload_digest text, fencing_token bigint, lease_expires_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare v_effect public.testing_center_agent_effect_outbox%rowtype;
begin
  if p_worker_id !~ '^[a-z0-9][a-z0-9._-]{0,63}$' or p_lease_seconds not between 10 and 300 then
    raise exception 'testing_center_agent_claim_invalid' using errcode='22023';
  end if;
  lock table public.testing_center_pauses in share mode;
  select effect.* into v_effect
  from public.testing_center_agent_effect_outbox effect
  join public.testing_center_agent_jobs job on job.job_key=effect.job_key
  where (
      effect.state='queued'
      or (effect.state='claimed' and not effect.dispatch_reserved and effect.lease_expires_at<=pg_catalog.now())
    )
    and job.state not in ('duplicate','needs_info','ineligible','completed','reverted','needs_owner','stopped')
    and not exists (
      select 1 from public.testing_center_pauses pause
      where pause.is_paused and (
        pause.scope='global' or (pause.scope='flow' and pause.technical_issue_id=job.technical_issue_id)
      )
    )
  order by effect.created_at,effect.effect_id
  for update of effect skip locked limit 1;
  if not found then return; end if;
  update public.testing_center_agent_effect_outbox outbox
    set state='claimed',lease_owner=p_worker_id,
      lease_expires_at=pg_catalog.now()+pg_catalog.make_interval(secs=>p_lease_seconds),
      fencing_token=outbox.fencing_token+1,updated_at=pg_catalog.now()
    where outbox.effect_id=v_effect.effect_id returning * into v_effect;
  effect_id:=v_effect.effect_id; job_key:=v_effect.job_key; effect_kind:=v_effect.effect_kind;
  effect_target:=v_effect.effect_target; payload_digest:=v_effect.payload_digest;
  fencing_token:=v_effect.fencing_token; lease_expires_at:=v_effect.lease_expires_at;
  return next;
end $_$;


--

-- Name: testing_center_claim_codex_dry_run(text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_center_claim_codex_dry_run(p_technical_issue_id text, p_worker_id text, p_lease_seconds integer DEFAULT 60) RETURNS TABLE(claim_status text, run_id text, fencing_token bigint, lease_expires_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_row public.testing_center_codex_execution_control%rowtype;
begin
  if p_worker_id is null or p_worker_id !~ '^[a-z0-9][a-z0-9._-]{0,63}$'
    or p_lease_seconds not between 10 and 300 then
    raise exception 'testing_center_codex_claim_invalid' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('testing-center.codex.global', 0)
  );
  lock table public.testing_center_pauses in share mode;
  select control.* into v_row
  from public.testing_center_codex_execution_control as control
  where control.technical_issue_id = p_technical_issue_id
  for update;
  if not found then
    raise exception 'testing_center_codex_run_not_found' using errcode = 'P0002';
  end if;

  if v_row.state in ('completed', 'failed', 'needs_owner') then
    claim_status := v_row.state;
  elsif v_row.state = 'dispatching' then
    claim_status := 'busy';
  elsif not exists (
    select 1 from public.testing_center_technical_issues as issue
    where issue.technical_issue_id = p_technical_issue_id
      and issue.state = 'open' and issue.flow_state = 'queued'
  ) then
    claim_status := 'not_ready';
  elsif exists (
    select 1 from public.testing_center_pauses as pause
    where pause.is_paused and (
      pause.scope = 'global'
      or (pause.scope = 'flow' and pause.technical_issue_id = p_technical_issue_id)
    )
  ) then
    claim_status := 'paused';
  elsif v_row.state = 'claimed' and v_row.lease_expires_at > pg_catalog.now() then
    claim_status := 'busy';
  elsif exists (
    select 1
    from public.testing_center_codex_execution_control as active
    where active.technical_issue_id <> p_technical_issue_id
      and (
        active.state = 'dispatching'
        or (active.state = 'claimed' and active.lease_expires_at > pg_catalog.now())
      )
  ) then
    claim_status := 'global_busy';
  else
    update public.testing_center_codex_execution_control as control
    set state = 'claimed', lease_owner = p_worker_id,
      lease_expires_at = pg_catalog.now() + pg_catalog.make_interval(secs => p_lease_seconds),
      fencing_token = control.fencing_token + 1, updated_at = pg_catalog.now()
    where control.technical_issue_id = p_technical_issue_id
    returning control.* into v_row;
    update public.testing_center_codex_runs
    set state = 'running', updated_at = pg_catalog.now()
    where testing_center_codex_runs.run_id = v_row.run_id;
    claim_status := 'claimed';
  end if;
  run_id := v_row.run_id;
  fencing_token := v_row.fencing_token;
  lease_expires_at := v_row.lease_expires_at;
  return next;
end
$_$;


--

-- Name: testing_center_claim_github_effect(text, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_center_claim_github_effect(p_effect_id text, p_lease_token uuid, p_lease_seconds integer DEFAULT 60) RETURNS TABLE(claim_status text, technical_issue_id text, primary_report_id text, attempt_count smallint, lease_expires_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_row public.testing_center_effect_outbox%rowtype;
begin
  if p_lease_token is null or p_lease_seconds not between 10 and 300 then
    raise exception 'testing_center_github_claim_invalid' using errcode = '22023';
  end if;
  select * into v_row from public.testing_center_effect_outbox
  where effect_id = p_effect_id for update;
  if not found then raise exception 'testing_center_github_effect_not_found' using errcode = 'P0002'; end if;

  if v_row.state = 'completed' then claim_status := 'completed';
  elsif exists (select 1 from public.testing_center_pauses p where p.is_paused and
    (p.scope = 'global' or (p.scope = 'flow' and p.technical_issue_id = v_row.technical_issue_id))) then
    claim_status := 'paused';
  elsif v_row.state = 'claimed' and v_row.lease_expires_at > now() then claim_status := 'busy';
  elsif v_row.state = 'failed' and v_row.next_attempt_at > now() then claim_status := 'retry_scheduled';
  elsif v_row.attempt_count >= 5 then claim_status := 'exhausted';
  else
    update public.testing_center_effect_outbox as outbox set state = 'claimed',
      attempt_count = outbox.attempt_count + 1, lease_token = p_lease_token,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      next_attempt_at = null, last_error_code = null, updated_at = now()
    where outbox.effect_id = p_effect_id returning outbox.* into v_row;
    claim_status := 'claimed';
  end if;
  technical_issue_id := v_row.technical_issue_id;
  primary_report_id := v_row.primary_report_id;
  attempt_count := v_row.attempt_count;
  lease_expires_at := v_row.lease_expires_at;
  return next;
end; $$;


--

-- Name: testing_center_claim_linear_effect(text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_center_claim_linear_effect(p_effect_id text, p_worker_id text, p_lease_seconds integer DEFAULT 60) RETURNS TABLE(claim_status text, technical_issue_id text, fencing_token bigint, lease_expires_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare v_effect public.testing_center_effect_outbox%rowtype;
begin
  if p_worker_id is null
    or p_worker_id !~ '^[a-z0-9][a-z0-9._-]{0,63}$'
    or p_lease_seconds not between 10 and 300 then
    raise exception 'testing_center_linear_claim_invalid' using errcode = '22023';
  end if;
  lock table public.testing_center_pauses in share mode;
  select * into v_effect from public.testing_center_effect_outbox
  where effect_id = p_effect_id for update;
  if not found or v_effect.effect_type <> 'linear_issue_create' then
    raise exception 'testing_center_linear_effect_not_found' using errcode = 'P0002';
  end if;
  if v_effect.state = 'completed' then claim_status := 'completed';
  elsif v_effect.state = 'dry_run_completed' then claim_status := 'dry_run_completed';
  elsif v_effect.state = 'needs_owner' then claim_status := 'needs_owner';
  elsif v_effect.state = 'superseded' or not exists (
    select 1 from public.testing_center_issue_destinations as destination
    where destination.technical_issue_id = v_effect.technical_issue_id
      and destination.destination = 'linear'
      and destination.active_effect_id = v_effect.effect_id
  ) then claim_status := 'not_selected';
  elsif not exists (
    select 1 from public.testing_center_linear_projection_snapshots
    where effect_id = v_effect.effect_id
  ) then claim_status := 'not_prepared';
  elsif v_effect.state in ('claimed','failed')
    and (v_effect.state = 'failed' or v_effect.lease_expires_at <= now())
    and exists (
      select 1 from public.testing_center_linear_projection_snapshots snapshot
      where snapshot.effect_id = v_effect.effect_id
        and snapshot.sanitized_projection is not null
    ) then
    update public.testing_center_effect_outbox effect
    set state = 'needs_owner', lease_token = null, lease_expires_at = null,
      lease_owner = null, next_attempt_at = null,
      last_error_code = 'linear_response_ambiguous', updated_at = now()
    where effect.effect_id = p_effect_id returning effect.* into v_effect;
    update public.testing_center_issue_destinations
    set decision_state = 'needs_owner',
      decision_reason = 'linear_response_ambiguous', updated_at = now()
    where technical_issue_id = v_effect.technical_issue_id
      and destination = 'linear' and active_effect_id = v_effect.effect_id;
    claim_status := 'needs_owner';
  elsif exists (
    select 1 from public.testing_center_pauses pause
    where pause.is_paused and (pause.scope = 'global'
      or (pause.scope = 'flow' and pause.technical_issue_id = v_effect.technical_issue_id))
  ) then claim_status := 'paused';
  elsif v_effect.state = 'claimed' and v_effect.lease_expires_at > now()
    then claim_status := 'busy';
  elsif v_effect.state = 'failed' and v_effect.next_attempt_at > now()
    then claim_status := 'retry_scheduled';
  elsif v_effect.attempt_count >= 5 then claim_status := 'exhausted';
  else
    update public.testing_center_effect_outbox effect
    set state = 'claimed', attempt_count = effect.attempt_count + 1,
      lease_token = public.gen_random_uuid(), lease_owner = p_worker_id,
      lease_expires_at = now() + pg_catalog.make_interval(secs => p_lease_seconds),
      fencing_token = effect.fencing_token + 1,
      next_attempt_at = null, last_error_code = null, updated_at = now()
    where effect.effect_id = p_effect_id returning effect.* into v_effect;
    claim_status := 'claimed';
  end if;
  technical_issue_id := v_effect.technical_issue_id;
  fencing_token := v_effect.fencing_token;
  lease_expires_at := v_effect.lease_expires_at;
  return next;
end $_$;


--

-- Name: testing_center_complete_agent_effect(text, text, bigint, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_center_complete_agent_effect(p_effect_id text, p_worker_id text, p_fencing_token bigint, p_outcome text, p_outcome_digest text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare v_effect public.testing_center_agent_effect_outbox%rowtype; v_state text; v_job_state text;
begin
  if p_outcome not in ('delivered','ambiguous') or p_outcome_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'testing_center_agent_effect_outcome_invalid' using errcode='22023';
  end if;
  select * into v_effect from public.testing_center_agent_effect_outbox where effect_id=p_effect_id for update;
  if not found then raise exception 'testing_center_agent_effect_not_found' using errcode='P0002'; end if;
  if v_effect.state in ('completed','needs_owner') and v_effect.outcome_digest=p_outcome_digest then
    return v_effect.state;
  end if;
  if v_effect.state<>'reserved' or v_effect.lease_owner<>p_worker_id
    or v_effect.fencing_token<>p_fencing_token or v_effect.lease_expires_at<=pg_catalog.now() then
    raise exception 'testing_center_agent_effect_fencing_stale' using errcode='55000';
  end if;
  v_state := case when p_outcome='delivered' then 'completed' else 'needs_owner' end;
  update public.testing_center_agent_effect_outbox
    set state=v_state,lease_owner=null,lease_expires_at=null,outcome_digest=p_outcome_digest,updated_at=pg_catalog.now()
    where effect_id=p_effect_id;
  if p_outcome='ambiguous' then
    select state into strict v_job_state from public.testing_center_agent_jobs where job_key=v_effect.job_key;
    if public.testing_center_agent_transition_allowed(v_job_state,'needs_owner') then
      perform public.testing_center_transition_agent_job(
        v_effect.job_key,v_job_state,'needs_owner','effect-worker',p_outcome_digest
      );
    end if;
  end if;
  return v_state;
end $_$;


--

-- Name: testing_center_complete_github_effect(text, uuid, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_center_complete_github_effect(p_effect_id text, p_lease_token uuid, p_issue_number bigint, p_issue_node_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if p_issue_number <= 0 or p_issue_node_id is null or btrim(p_issue_node_id) = ''
    or octet_length(p_issue_node_id) > 256 then
    raise exception 'testing_center_github_external_invalid' using errcode = '22023';
  end if;
  update public.testing_center_effect_outbox set state = 'completed', lease_token = null,
    lease_expires_at = null, next_attempt_at = null, last_error_code = null,
    external_issue_number = p_issue_number, external_issue_node_id = p_issue_node_id,
    updated_at = now()
  where effect_id = p_effect_id and state = 'claimed' and lease_token = p_lease_token
    and lease_expires_at > now();
  if not found then raise exception 'testing_center_github_lease_lost' using errcode = '55000'; end if;
end; $$;


--

-- Name: testing_center_complete_linear_dry_run(text, text, bigint, text, jsonb, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_center_complete_linear_dry_run(p_effect_id text, p_worker_id text, p_fencing_token bigint, p_source_digest text, p_projection jsonb, p_canonical_projection text, p_projection_digest text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_effect public.testing_center_effect_outbox%rowtype;
  v_snapshot public.testing_center_linear_projection_snapshots%rowtype;
  v_digest text;
  v_keys text[];
  v_report jsonb;
begin
  lock table public.testing_center_pauses in share mode;
  select * into v_effect from public.testing_center_effect_outbox
  where effect_id = p_effect_id for update;
  if not found or v_effect.effect_type <> 'linear_issue_create'
    or v_effect.state <> 'claimed'
    or v_effect.lease_owner is distinct from p_worker_id
    or v_effect.fencing_token is distinct from p_fencing_token
    or v_effect.lease_expires_at <= now() then
    raise exception 'testing_center_linear_lease_lost' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.testing_center_pauses pause
    where pause.is_paused and (pause.scope = 'global'
      or (pause.scope = 'flow' and pause.technical_issue_id = v_effect.technical_issue_id))
  ) then
    raise exception 'testing_center_paused' using errcode = '55000';
  end if;
  select * into v_snapshot from public.testing_center_linear_projection_snapshots
  where effect_id = p_effect_id for update;
  if not found then
    raise exception 'testing_center_linear_projection_not_prepared' using errcode = '55000';
  end if;
  begin
    if p_canonical_projection::jsonb is distinct from p_projection then
      raise exception 'testing_center_linear_projection_integrity_invalid'
        using errcode = '22023';
    end if;
  exception when invalid_text_representation then
    raise exception 'testing_center_linear_projection_integrity_invalid'
      using errcode = '22023';
  end;
  v_digest := pg_catalog.encode(public.digest(
    pg_catalog.convert_to(p_canonical_projection,'UTF8'),'sha256'),'hex');
  if pg_catalog.jsonb_typeof(p_projection) <> 'object' then
    raise exception 'testing_center_linear_projection_integrity_invalid'
      using errcode = '22023';
  end if;
  select pg_catalog.array_agg(key order by key) into v_keys
  from pg_catalog.jsonb_object_keys(p_projection) as keys(key);
  v_report := v_snapshot.source_snapshot->'report';
  if p_source_digest is distinct from v_snapshot.source_digest
    or v_keys is distinct from array[
      'contractVersion','description','effectId','labels','marker','operation',
      'project','serverMetadataDigest','sourceDigest','status','team',
      'technicalIssueId','title'
    ]::text[]
    or p_projection->>'contractVersion' <> 'testing-center.linear-issue.v1'
    or p_projection->>'operation' <> 'create_issue'
    or p_projection->>'effectId' <> v_snapshot.effect_id
    or p_projection->>'technicalIssueId' <> v_snapshot.technical_issue_id
    or p_projection->>'sourceDigest' <> v_snapshot.source_digest
    or p_projection->>'marker' <> v_snapshot.marker
    or p_projection->>'team' <> 'Vantare'
    or p_projection->>'project' <> 'Testing Center'
    or p_projection->>'status' <> 'Triage'
    or p_projection->>'serverMetadataDigest'
      <> '65511d3f3ca28f43acd775c2a25902825730c892ba6e76860576dd0fdfc0caff'
    or p_projection->'labels' is distinct from pg_catalog.jsonb_build_array(
      'testing-center','needs-triage','channel:' || (v_report->>'channel'),
      'module:' || (v_report->>'module'),'status:needs-triage')
    or pg_catalog.jsonb_typeof(p_projection->'title') <> 'string'
    or pg_catalog.octet_length(p_projection->>'title') not between 1 and 255
    or pg_catalog.jsonb_typeof(p_projection->'description') <> 'string'
    or pg_catalog.octet_length(p_projection->>'description') not between 1 and 32768
    or pg_catalog.strpos(p_projection->>'description', v_snapshot.marker) <> 1
    or p_projection_digest is distinct from v_digest
    or p_projection ?| array['assignee','assigneeId','priority','delegate',
      'instructions','commands','branch','baseBranch'] then
    raise exception 'testing_center_linear_projection_integrity_invalid'
      using errcode = '22023';
  end if;
  update public.testing_center_linear_projection_snapshots
  set sanitized_projection = p_projection, projection_digest = p_projection_digest,
    completed_at = now()
  where effect_id = p_effect_id and sanitized_projection is null;
  if not found then
    raise exception 'testing_center_linear_projection_already_completed' using errcode = '55000';
  end if;
  update public.testing_center_effect_outbox
  set state = 'dry_run_completed', lease_token = null, lease_expires_at = null,
    lease_owner = null, next_attempt_at = null, last_error_code = null,
    updated_at = now()
  where effect_id = p_effect_id;
end $$;


--

-- Name: testing_center_complete_linear_pilot(text, text, bigint, text, uuid, uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_center_complete_linear_pilot(p_effect_id text, p_worker_id text, p_fencing_token bigint, p_projection_digest text, p_external_issue_id uuid, p_organization_id uuid, p_external_identifier text, p_external_url text, p_bound_by_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_effect public.testing_center_effect_outbox%rowtype;
  v_snapshot public.testing_center_linear_projection_snapshots%rowtype;
begin
  if p_external_issue_id is null or p_organization_id is null
    or p_projection_digest !~ '^[0-9a-f]{64}$'
    or p_external_identifier !~ '^[A-Z][A-Z0-9]{0,15}-[1-9][0-9]{0,9}$'
    or p_external_url !~ ('^https://linear[.]app/vantareapp/issue/'
      || p_external_identifier || '/[A-Za-z0-9._~!$&''()*+,;=:@%/-]+$')
    or p_bound_by_id is null
    or p_bound_by_id !~ '^[a-z0-9][a-z0-9._-]{0,127}$' then
    raise exception 'testing_center_linear_pilot_result_invalid' using errcode = '22023';
  end if;
  select * into v_effect from public.testing_center_effect_outbox
  where effect_id = p_effect_id for update;
  if not found or v_effect.effect_type <> 'linear_issue_create'
    or v_effect.state <> 'claimed'
    or v_effect.lease_owner is distinct from p_worker_id
    or v_effect.fencing_token is distinct from p_fencing_token
    or v_effect.lease_expires_at <= now() then
    raise exception 'testing_center_linear_lease_lost' using errcode = '55000';
  end if;
  select * into v_snapshot from public.testing_center_linear_projection_snapshots
  where effect_id = p_effect_id for update;
  if not found or v_snapshot.projection_digest is distinct from p_projection_digest
    or v_snapshot.sanitized_projection is null then
    raise exception 'testing_center_linear_projection_integrity_invalid'
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.testing_center_issue_destinations destination
    where destination.technical_issue_id = v_effect.technical_issue_id
      and destination.destination = 'linear'
      and destination.active_effect_id = v_effect.effect_id
      and destination.decision_state = 'selected'
  ) then
    raise exception 'testing_center_linear_effect_not_selected' using errcode = '55000';
  end if;
  insert into public.testing_center_linear_issue_bindings(
    external_issue_id, organization_id, technical_issue_id, effect_id,
    bound_by_id, external_identifier, external_url, projection_digest
  ) values (
    p_external_issue_id, p_organization_id, v_effect.technical_issue_id,
    v_effect.effect_id, p_bound_by_id, p_external_identifier, p_external_url,
    p_projection_digest
  );
  insert into public.testing_center_linear_reconciliations(
    technical_issue_id, effect_id, external_issue_id, observed_state
  ) values (
    v_effect.technical_issue_id, v_effect.effect_id, p_external_issue_id,
    'linear_created'
  );
  update public.testing_center_effect_outbox
  set state = 'completed', lease_token = null, lease_expires_at = null,
    lease_owner = null, next_attempt_at = null, last_error_code = null,
    updated_at = now()
  where effect_id = p_effect_id;
end $_$;


--

-- Name: testing_center_current_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_center_current_role() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select case
    when private.is_owner(private.current_account()) then 'owner'
    else (
      select m.role from public.testing_center_memberships m
      where m.user_id = private.current_account() and m.active
        and m.role in ('tester', 'primary_tester')
    )
  end
$$;


--

-- Name: testing_center_enforce_selected_effect(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_center_enforce_selected_effect() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if new.state <> 'superseded' and not exists (
    select 1 from public.testing_center_issue_destinations
    where technical_issue_id = new.technical_issue_id
      and active_effect_id = new.effect_id
  ) then
    raise exception 'testing_center_effect_has_no_selected_destination' using errcode = '23514';
  end if;
  return null;
end $$;


--

-- Name: testing_center_expire_reserved_agent_effect(text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_center_expire_reserved_agent_effect(p_effect_id text, p_now timestamp with time zone DEFAULT now()) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_effect public.testing_center_agent_effect_outbox%rowtype; v_job_state text;
begin
  if p_effect_id='' or p_now is null then
    raise exception 'testing_center_agent_effect_expiry_invalid' using errcode='22023';
  end if;
  select * into v_effect from public.testing_center_agent_effect_outbox
    where effect_id=p_effect_id for update;
  if not found then raise exception 'testing_center_agent_effect_not_found' using errcode='P0002'; end if;
  if v_effect.state='needs_owner' then return 'needs_owner'; end if;
  if v_effect.state<>'reserved' then return v_effect.state; end if;
  if v_effect.lease_expires_at>p_now then return 'busy'; end if;
  update public.testing_center_agent_effect_outbox
    set state='needs_owner',lease_owner=null,lease_expires_at=null,updated_at=pg_catalog.now()
    where effect_id=p_effect_id;
  select state into strict v_job_state from public.testing_center_agent_jobs where job_key=v_effect.job_key;
  if public.testing_center_agent_transition_allowed(v_job_state,'needs_owner') then
    perform public.testing_center_transition_agent_job(
      v_effect.job_key,v_job_state,'needs_owner','effect-reconciler',v_effect.payload_digest
    );
  end if;
  return 'needs_owner';
end $$;


--

-- Name: testing_center_fail_codex_before_dispatch(text, text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_center_fail_codex_before_dispatch(p_technical_issue_id text, p_worker_id text, p_fencing_token bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_run_id text;
begin
  update public.testing_center_codex_execution_control as control
  set state = 'failed', lease_owner = null, lease_expires_at = null,
    outcome_code = 'pre_dispatch_failure', updated_at = pg_catalog.now()
  where control.technical_issue_id = p_technical_issue_id
    and control.state = 'claimed'
    and control.lease_owner = p_worker_id
    and control.fencing_token = p_fencing_token
  returning control.run_id into v_run_id;
  if not found then
    raise exception 'testing_center_codex_fence_lost' using errcode = '55000';
  end if;
  update public.testing_center_codex_runs
  set state = 'failed', updated_at = pg_catalog.now()
  where testing_center_codex_runs.run_id = v_run_id;
end
$$;


--

-- Name: testing_center_fail_github_effect(text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_center_fail_github_effect(p_effect_id text, p_lease_token uuid, p_error_code text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
begin
  if p_error_code !~ '^[a-z0-9_]{1,64}$' then
    raise exception 'testing_center_github_error_invalid' using errcode = '22023';
  end if;
  update public.testing_center_effect_outbox set state = 'failed', lease_token = null,
    lease_expires_at = null,
    next_attempt_at = now() + make_interval(secs => least(300, 5 * (2 ^ greatest(attempt_count - 1, 0))::integer)),
    last_error_code = p_error_code, updated_at = now()
  where effect_id = p_effect_id and state = 'claimed' and lease_token = p_lease_token;
  if not found then raise exception 'testing_center_github_lease_lost' using errcode = '55000'; end if;
end; $_$;


--

-- Name: testing_center_fail_linear_effect(text, text, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_center_fail_linear_effect(p_effect_id text, p_worker_id text, p_fencing_token bigint, p_error_code text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if p_error_code not in ('linear_transport_unavailable','linear_store_rejected') then
    raise exception 'testing_center_linear_retry_error_invalid' using errcode = '22023';
  end if;
  update public.testing_center_effect_outbox
  set state = 'failed', lease_token = null, lease_expires_at = null,
    lease_owner = null,
    next_attempt_at = now() + pg_catalog.make_interval(
      secs => pg_catalog.least(300,
        5 * (2 ^ pg_catalog.greatest(attempt_count - 1,0))::integer)),
    last_error_code = p_error_code, updated_at = now()
  where effect_id = p_effect_id and effect_type = 'linear_issue_create'
    and state = 'claimed' and lease_owner = p_worker_id
    and fencing_token = p_fencing_token and lease_expires_at > now();
  if not found then
    raise exception 'testing_center_linear_lease_lost' using errcode = '55000';
  end if;
end $$;


--

-- Name: testing_center_get_agent_job_state(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_center_get_agent_job_state(p_report_id text) RETURNS TABLE(state text, updated_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select job.state,job.updated_at
  from public.testing_contributions contribution
  join public.testing_center_technical_issues issue on issue.contribution_id=contribution.id
  join public.testing_center_agent_jobs job on job.technical_issue_id=issue.technical_issue_id
  where contribution.id::text=p_report_id
    and (contribution.account_id=private.current_account() or public.testing_center_current_role()='owner')
$$;


--

-- Name: testing_center_queue_agent_effect(text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_center_queue_agent_effect(p_job_key text, p_effect_kind text, p_effect_target text, p_payload_digest text) RETURNS TABLE(queue_status text, effect_id text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare v_job public.testing_center_agent_jobs%rowtype; v_existing public.testing_center_agent_effect_outbox%rowtype;
begin
  if p_payload_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'testing_center_agent_effect_invalid' using errcode='22023';
  end if;
  select * into v_job from public.testing_center_agent_jobs where job_key=p_job_key for update;
  if not found then raise exception 'testing_center_agent_job_not_found' using errcode='P0002'; end if;
  effect_id := p_job_key || ':' || p_effect_target || ':1';
  select * into v_existing from public.testing_center_agent_effect_outbox
    where job_key=p_job_key and effect_kind=p_effect_kind and effect_target=p_effect_target and effect_generation=1;
  if found then
    if v_existing.payload_digest <> p_payload_digest then
      raise exception 'testing_center_agent_effect_conflict' using errcode='23505';
    end if;
    queue_status := 'existing'; effect_id := v_existing.effect_id; return next; return;
  end if;
  if (p_effect_target='triage' and v_job.state<>'triage_queued')
    or (p_effect_target='fix' and v_job.state<>'eligible') then
    raise exception 'testing_center_agent_effect_phase_invalid' using errcode='55000';
  end if;
  insert into public.testing_center_agent_effect_outbox(
    effect_id,job_key,effect_kind,effect_target,effect_generation,payload_digest
  ) values (effect_id,p_job_key,p_effect_kind,p_effect_target,1,p_payload_digest);
  queue_status := 'queued'; return next;
end $_$;


--

-- Name: testing_center_queue_agent_job(text, text, integer, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_center_queue_agent_job(p_job_key text, p_technical_issue_id text, p_execution_generation integer, p_policy_version text, p_report_digest text, p_dossier_digest text, p_nightly_base_sha text) RETURNS TABLE(queue_status text, job_key text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare v_existing public.testing_center_agent_jobs%rowtype;
begin
  if p_job_key !~ '^[0-9a-f]{64}$' or p_execution_generation <> 1
    or p_policy_version <> 'testing-center.autofix-policy.v2'
    or p_report_digest !~ '^[0-9a-f]{64}$' or p_dossier_digest !~ '^[0-9a-f]{64}$'
    or p_nightly_base_sha !~ '^[0-9a-f]{40}$' then
    raise exception 'testing_center_agent_job_invalid' using errcode='22023';
  end if;
  if p_job_key <> public.testing_center_agent_job_key(
    p_technical_issue_id,p_report_digest,p_nightly_base_sha,p_policy_version
  ) then
    raise exception 'testing_center_agent_job_key_mismatch' using errcode='22023';
  end if;
  if not exists (
    select 1 from public.testing_center_technical_issues
    where technical_issue_id=p_technical_issue_id and state='open' and flow_state not in ('needs_owner','stopped')
  ) then raise exception 'testing_center_agent_issue_not_ready' using errcode='55000'; end if;
  select * into v_existing from public.testing_center_agent_jobs
    where technical_issue_id=p_technical_issue_id and execution_generation=1 for update;
  if found then
    if v_existing.job_key<>p_job_key or v_existing.policy_version<>p_policy_version
      or v_existing.report_digest<>p_report_digest or v_existing.dossier_digest<>p_dossier_digest
      or v_existing.nightly_base_sha<>p_nightly_base_sha then
      raise exception 'testing_center_agent_job_conflict' using errcode='23505';
    end if;
    queue_status := 'existing'; job_key := v_existing.job_key; return next; return;
  end if;
  insert into public.testing_center_agent_jobs(
    job_key,technical_issue_id,execution_generation,policy_version,
    report_digest,dossier_digest,nightly_base_sha,state
  ) values (
    p_job_key,p_technical_issue_id,1,p_policy_version,
    p_report_digest,p_dossier_digest,p_nightly_base_sha,'triage_queued'
  );
  perform * from public.testing_center_queue_agent_effect(
    p_job_key,'github_dispatch','triage',p_dossier_digest
  );
  queue_status := 'queued'; job_key := p_job_key; return next;
end $_$;


--

-- Name: testing_center_reconcile_github_effect(text, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_center_reconcile_github_effect(p_effect_id text, p_issue_number bigint, p_issue_node_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if p_issue_number <= 0 or p_issue_node_id is null or btrim(p_issue_node_id) = ''
    or octet_length(p_issue_node_id) > 256 then
    raise exception 'testing_center_github_external_invalid' using errcode = '22023';
  end if;
  update public.testing_center_effect_outbox set state = 'completed', lease_token = null,
    lease_expires_at = null, next_attempt_at = null, last_error_code = null,
    external_issue_number = p_issue_number, external_issue_node_id = p_issue_node_id,
    updated_at = now()
  where effect_id = p_effect_id and state <> 'completed';
  if not found and not exists (select 1 from public.testing_center_effect_outbox
    where effect_id = p_effect_id and state = 'completed'
      and external_issue_number = p_issue_number and external_issue_node_id = p_issue_node_id) then
    raise exception 'testing_center_github_reconcile_conflict' using errcode = '23505';
  end if;
end; $$;


--

-- Name: testing_center_reconcile_linear_webhook(uuid, uuid, uuid, uuid, text, text, bigint, timestamp with time zone, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_center_reconcile_linear_webhook(p_delivery_id uuid, p_webhook_id uuid, p_organization_id uuid, p_external_issue_id uuid, p_event_name text, p_event_action text, p_webhook_timestamp_ms bigint, p_event_created_at timestamp with time zone, p_linear_state_id uuid, p_payload_digest text) RETURNS TABLE(delivery_status text, current_observed_state text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_binding public.testing_center_linear_issue_bindings%rowtype;
  v_reconciliation public.testing_center_linear_reconciliations%rowtype;
  v_existing public.testing_center_linear_webhook_deliveries%rowtype;
  v_target_state text;
  v_outcome text;
begin
  if p_delivery_id is null or p_webhook_id is null or p_organization_id is null
    or p_external_issue_id is null or p_event_name <> 'Issue'
    or p_event_action not in ('create','update','remove')
    or p_webhook_timestamp_ms is null or p_webhook_timestamp_ms <= 0
    or p_event_created_at is null
    or p_payload_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'testing_center_linear_webhook_invalid' using errcode = '22023';
  end if;

  select * into v_binding from public.testing_center_linear_issue_bindings
  where external_issue_id = p_external_issue_id for update;
  if not found or v_binding.organization_id <> p_organization_id then
    raise exception 'testing_center_linear_webhook_binding_mismatch'
      using errcode = '55000';
  end if;
  select * into strict v_reconciliation
  from public.testing_center_linear_reconciliations
  where technical_issue_id = v_binding.technical_issue_id for update;

  select * into v_existing from public.testing_center_linear_webhook_deliveries
  where delivery_id = p_delivery_id;
  if found then
    if v_existing.payload_digest <> p_payload_digest
      or v_existing.webhook_id <> p_webhook_id
      or v_existing.organization_id <> p_organization_id
      or v_existing.external_issue_id <> p_external_issue_id
      or v_existing.event_name <> p_event_name
      or v_existing.event_action <> p_event_action
      or v_existing.webhook_timestamp_ms <> p_webhook_timestamp_ms
      or v_existing.event_created_at <> p_event_created_at
      or v_existing.linear_state_id is distinct from p_linear_state_id then
      raise exception 'testing_center_linear_delivery_conflict'
        using errcode = '23505';
    end if;
    return query select 'duplicate'::text, v_reconciliation.observed_state;
    return;
  end if;

  insert into public.testing_center_linear_webhook_deliveries(
    delivery_id, webhook_id, organization_id, external_issue_id,
    event_name, event_action, webhook_timestamp_ms, event_created_at,
    linear_state_id, payload_digest, outcome
  ) values (
    p_delivery_id, p_webhook_id, p_organization_id, p_external_issue_id,
    p_event_name, p_event_action, p_webhook_timestamp_ms, p_event_created_at,
    p_linear_state_id, p_payload_digest, 'pending'
  );

  if v_reconciliation.last_webhook_timestamp_ms is not null
    and p_webhook_timestamp_ms <= v_reconciliation.last_webhook_timestamp_ms then
    v_outcome := 'stale';
  elsif p_event_action = 'remove' then
    v_target_state := 'stopped';
    v_outcome := 'applied';
  elsif p_event_action = 'create' then
    if p_linear_state_id is null then
      raise exception 'testing_center_linear_webhook_state_required'
        using errcode = '22023';
    end if;
    v_target_state := 'linear_created';
    v_outcome := 'applied';
  elsif p_linear_state_id is null then
    v_outcome := 'ignored';
  else
    select mapping.coarse_state into v_target_state
    from public.testing_center_linear_state_mappings mapping
    where mapping.organization_id = p_organization_id
      and mapping.linear_state_id = p_linear_state_id and mapping.active;
    v_outcome := case when found then 'applied' else 'needs_owner' end;
  end if;

  if v_outcome <> 'stale' then
    update public.testing_center_linear_reconciliations
    set observed_state = coalesce(v_target_state, observed_state),
      last_webhook_timestamp_ms = p_webhook_timestamp_ms,
      last_event_created_at = p_event_created_at,
      last_delivery_id = p_delivery_id,
      generation = generation + 1,
      updated_at = now()
    where technical_issue_id = v_binding.technical_issue_id
    returning * into v_reconciliation;
  end if;
  update public.testing_center_linear_webhook_deliveries
  set outcome = v_outcome where delivery_id = p_delivery_id;
  return query select v_outcome, v_reconciliation.observed_state;
end $_$;


--

-- Name: testing_center_record_agent_callback(text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_center_record_agent_callback(p_delivery_id text, p_job_key text, p_head_sha text, p_callback_kind text, p_outcome text, p_payload_digest text) RETURNS TABLE(callback_status text, job_state text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare v_job public.testing_center_agent_jobs%rowtype; v_callback public.testing_center_agent_callbacks%rowtype; v_target text;
begin
  if p_delivery_id='' or octet_length(p_delivery_id)>256 or p_delivery_id~'^[[:space:]]|[[:space:]]$'
    or p_head_sha!~'^[0-9a-f]{40}$' or p_callback_kind not in ('triage','fix')
    or p_outcome not in ('eligible','duplicate','needs_info','ineligible','accepted','ambiguous')
    or (p_callback_kind='triage' and p_outcome not in ('eligible','duplicate','needs_info','ineligible','ambiguous'))
    or (p_callback_kind='fix' and p_outcome not in ('accepted','ambiguous'))
    or p_payload_digest!~'^[0-9a-f]{64}$' then
    raise exception 'testing_center_agent_callback_invalid' using errcode='22023';
  end if;
  select * into v_job from public.testing_center_agent_jobs where job_key=p_job_key for update;
  if not found then raise exception 'testing_center_agent_job_not_found' using errcode='P0002'; end if;
  select * into v_callback from public.testing_center_agent_callbacks where delivery_id=p_delivery_id;
  if found then
    if v_callback.job_key=p_job_key and v_callback.head_sha=p_head_sha
      and v_callback.callback_kind=p_callback_kind and v_callback.outcome=p_outcome
      and v_callback.payload_digest=p_payload_digest then
      callback_status:='duplicate'; job_state:=v_job.state; return next; return;
    end if;
    if public.testing_center_agent_transition_allowed(v_job.state,'needs_owner') then
      perform public.testing_center_transition_agent_job(p_job_key,v_job.state,'needs_owner','callback-worker',p_payload_digest);
      v_job.state:='needs_owner';
    end if;
    callback_status:='needs_owner'; job_state:=v_job.state; return next; return;
  end if;
  if p_head_sha<>v_job.nightly_base_sha or p_outcome='ambiguous'
    or (p_callback_kind='triage' and v_job.state<>'triage_queued')
    or (p_callback_kind='fix' and v_job.state<>'eligible') then
    insert into public.testing_center_agent_callbacks(
      delivery_id,job_key,head_sha,callback_kind,outcome,payload_digest,disposition
    ) values (p_delivery_id,p_job_key,p_head_sha,p_callback_kind,p_outcome,p_payload_digest,'needs_owner');
    if public.testing_center_agent_transition_allowed(v_job.state,'needs_owner') then
      perform public.testing_center_transition_agent_job(p_job_key,v_job.state,'needs_owner','callback-worker',p_payload_digest);
      v_job.state:='needs_owner';
    end if;
    callback_status:='needs_owner'; job_state:=v_job.state; return next; return;
  end if;
  insert into public.testing_center_agent_callbacks(
    delivery_id,job_key,head_sha,callback_kind,outcome,payload_digest,disposition
  ) values (p_delivery_id,p_job_key,p_head_sha,p_callback_kind,p_outcome,p_payload_digest,'applied');
  if p_callback_kind='triage' then
    perform public.testing_center_transition_agent_job(p_job_key,'triage_queued','triaged','triage-callback',p_payload_digest);
    v_target:=p_outcome;
    perform public.testing_center_transition_agent_job(p_job_key,'triaged',v_target,'triage-callback',p_payload_digest);
    if v_target='eligible' then
      perform * from public.testing_center_queue_agent_effect(p_job_key,'github_dispatch','fix',v_job.dossier_digest);
    end if;
  else
    perform public.testing_center_transition_agent_job(p_job_key,'eligible','red_running','fix-callback',p_payload_digest);
  end if;
  callback_status:='applied'; job_state:=(select state from public.testing_center_agent_jobs where job_key=p_job_key);
  return next;
end $_$;


--

-- Name: testing_center_record_agent_phase_callback(text, text, text, text, text, text, bigint, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_center_record_agent_phase_callback(p_delivery_id text, p_job_key text, p_head_sha text, p_reviewed_head_sha text, p_phase text, p_payload_digest text, p_fencing_token bigint, p_run_id bigint, p_release_tag text DEFAULT NULL::text) RETURNS TABLE(callback_status text, job_state text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_job public.testing_center_agent_jobs%rowtype;
  v_callback public.testing_center_agent_phase_callbacks%rowtype;
  v_effect public.testing_center_agent_effect_outbox%rowtype;
  v_reservation public.testing_center_agent_reservations%rowtype;
  v_expected text;
  v_disposition text := 'applied';
  v_is_closeout boolean;
begin
  v_is_closeout := p_phase in (
    'merged_nightly','smoke_running','nightly_tagged','completed','smoke_failed',
    'revert_pr_open','reverted','closeout_failed'
  );
  if p_delivery_id='' or octet_length(p_delivery_id)>256 or p_delivery_id~'^[[:space:]]|[[:space:]]$'
    or p_head_sha!~'^[0-9a-f]{40}$'
    or (p_reviewed_head_sha is not null and p_reviewed_head_sha!~'^[0-9a-f]{40}$')
    or p_payload_digest!~'^[0-9a-f]{64}$' or p_fencing_token<1 or p_run_id<1
    or (v_is_closeout and (p_release_tag is null or p_release_tag!~'^v[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+-nightly\.[1-9][0-9]*$'))
    or (not v_is_closeout and p_release_tag is not null) then
    raise exception 'testing_center_agent_phase_callback_invalid' using errcode='22023';
  end if;
  v_expected := case p_phase
    when 'red_verified' then 'red_running'
    when 'green_running' then 'red_verified'
    when 'diff_verified' then 'green_running'
    when 'review_approved' then 'diff_verified'
    when 'ci_running' then 'review_approved'
    when 'merge_queued' then 'ci_running'
    when 'merged_nightly' then 'merge_queued'
    when 'smoke_running' then 'merged_nightly'
    when 'nightly_tagged' then 'smoke_running'
    when 'completed' then 'nightly_tagged'
    when 'smoke_failed' then 'smoke_running'
    when 'revert_pr_open' then 'smoke_failed'
    when 'reverted' then 'revert_pr_open'
    when 'closeout_failed' then '__current__'
    else null end;
  if v_expected is null then
    raise exception 'testing_center_agent_phase_callback_invalid' using errcode='22023';
  end if;
  select * into v_job from public.testing_center_agent_jobs where job_key=p_job_key for update;
  if not found then raise exception 'testing_center_agent_job_not_found' using errcode='P0002'; end if;
  select * into v_callback from public.testing_center_agent_phase_callbacks
    where delivery_id=p_delivery_id;
  if found then
    if v_callback.job_key=p_job_key and v_callback.head_sha=p_head_sha
      and v_callback.reviewed_head_sha is not distinct from p_reviewed_head_sha
      and v_callback.release_tag is not distinct from p_release_tag
      and v_callback.phase=p_phase and v_callback.payload_digest=p_payload_digest
      and v_callback.fencing_token=p_fencing_token and v_callback.run_id=p_run_id then
      callback_status:='duplicate'; job_state:=v_job.state; return next; return;
    end if;
    if public.testing_center_agent_transition_allowed(v_job.state,'needs_owner') then
      perform public.testing_center_transition_agent_job(
        p_job_key,v_job.state,'needs_owner','phase-callback',p_payload_digest
      );
      v_job.state:='needs_owner';
    end if;
    callback_status:='needs_owner'; job_state:=v_job.state; return next; return;
  end if;

  if v_is_closeout then
    select * into v_reservation from public.testing_center_agent_reservations
      where job_key=p_job_key and reservation_kind='nightly_release' for update;
    if not found or p_reviewed_head_sha is null
      or v_reservation.reviewed_head_sha is distinct from p_reviewed_head_sha
      or v_reservation.reservation_key is distinct from p_release_tag then
      v_disposition:='needs_owner';
    elsif (p_phase in ('merged_nightly','smoke_running','nightly_tagged','completed','smoke_failed')
        and v_reservation.state<>'reserved')
      or (p_phase in ('revert_pr_open','reverted') and v_reservation.state<>'annulled')
      or (p_phase='closeout_failed' and (
        v_reservation.state not in ('reserved','annulled')
        or v_job.state not in ('merged_nightly','smoke_running','nightly_tagged','smoke_failed','revert_pr_open')
      )) then
      v_disposition:='needs_owner';
    elsif p_phase='merged_nightly' then
      if p_fencing_token<>p_run_id or p_fencing_token<v_reservation.closeout_fencing_token then
        v_disposition:='needs_owner';
      elsif v_reservation.merge_sha is not null and v_reservation.merge_sha<>p_head_sha then
        v_disposition:='needs_owner';
      else
        update public.testing_center_agent_reservations set
          merge_sha=p_head_sha,closeout_fencing_token=p_fencing_token,
          closeout_run_id=p_run_id,updated_at=pg_catalog.now()
          where reservation_key=v_reservation.reservation_key;
        update public.testing_center_agent_jobs set merge_sha=p_head_sha,updated_at=pg_catalog.now()
          where job_key=p_job_key and (merge_sha is null or merge_sha=p_head_sha);
        if not found then v_disposition:='needs_owner'; end if;
      end if;
    elsif v_reservation.closeout_fencing_token<>p_fencing_token
      or (p_phase not in ('reverted','closeout_failed') and v_reservation.closeout_run_id<>p_run_id)
      or v_reservation.merge_sha is distinct from p_head_sha then
      v_disposition:='needs_owner';
    end if;
  else
    select * into v_effect from public.testing_center_agent_effect_outbox
      where job_key=p_job_key and effect_kind='github_dispatch' and effect_target='fix'
        and effect_generation=1 for update;
    if not found or v_effect.fencing_token<>p_fencing_token or v_effect.state<>'completed' then
      v_disposition:='needs_owner';
    elsif p_phase='red_verified' then
      if v_job.candidate_head_sha is null then
        update public.testing_center_agent_jobs set candidate_head_sha=p_head_sha,updated_at=pg_catalog.now()
          where job_key=p_job_key;
        v_job.candidate_head_sha:=p_head_sha;
      elsif v_job.candidate_head_sha is distinct from p_head_sha then
        v_disposition:='needs_owner';
      end if;
    elsif p_phase='green_running' and v_job.candidate_head_sha is distinct from p_head_sha then
      v_disposition:='needs_owner';
    elsif p_phase='diff_verified' then
      update public.testing_center_agent_jobs set candidate_head_sha=p_head_sha,updated_at=pg_catalog.now()
        where job_key=p_job_key;
      v_job.candidate_head_sha:=p_head_sha;
    elsif v_job.candidate_head_sha is distinct from p_head_sha then
      v_disposition:='needs_owner';
    end if;
  end if;

  if v_disposition='applied' and p_phase<>'closeout_failed' and v_job.state<>v_expected then
    v_disposition:='needs_owner';
  end if;
  insert into public.testing_center_agent_phase_callbacks(
    delivery_id,job_key,head_sha,reviewed_head_sha,release_tag,phase,payload_digest,
    fencing_token,run_id,disposition
  ) values (
    p_delivery_id,p_job_key,p_head_sha,p_reviewed_head_sha,p_release_tag,p_phase,p_payload_digest,
    p_fencing_token,p_run_id,v_disposition
  );
  if v_disposition='needs_owner' then
    if public.testing_center_agent_transition_allowed(v_job.state,'needs_owner') then
      perform public.testing_center_transition_agent_job(
        p_job_key,v_job.state,'needs_owner','phase-callback',p_payload_digest
      );
      v_job.state:='needs_owner';
    end if;
    callback_status:='needs_owner'; job_state:=v_job.state; return next; return;
  end if;

  if p_phase='closeout_failed' then
    perform public.testing_center_transition_agent_job(
      p_job_key,v_job.state,'needs_owner','phase-callback',p_payload_digest
    );
    update public.testing_center_agent_reservations set state='needs_owner',updated_at=pg_catalog.now()
      where job_key=p_job_key and reservation_kind='nightly_release'
        and state in ('reserved','annulled');
    if not found then
      raise exception 'testing_center_agent_nightly_reservation_not_escalatable' using errcode='55000';
    end if;
    callback_status:='applied'; job_state:='needs_owner'; return next; return;
  end if;

  perform public.testing_center_transition_agent_job(
    p_job_key,v_expected,p_phase,'phase-callback',p_payload_digest
  );
  if p_phase='merge_queued' then
    update public.testing_center_agent_reservations set
      reviewed_head_sha=p_head_sha,updated_at=pg_catalog.now()
      where job_key=p_job_key and reservation_kind='nightly_release'
        and state='reserved' and (reviewed_head_sha is null or reviewed_head_sha=p_head_sha);
    if not found then raise exception 'testing_center_agent_nightly_reservation_unbound' using errcode='55000'; end if;
  elsif p_phase='smoke_failed' then
    update public.testing_center_agent_reservations set state='annulled',updated_at=pg_catalog.now()
      where job_key=p_job_key and reservation_kind='nightly_release' and state='reserved';
    if not found then raise exception 'testing_center_agent_nightly_reservation_not_annullable' using errcode='55000'; end if;
  elsif p_phase='completed' then
    update public.testing_center_agent_reservations set state='confirmed',updated_at=pg_catalog.now()
      where job_key=p_job_key and reservation_kind='nightly_release' and state='reserved'
        and reservation_key=p_release_tag;
    if not found then raise exception 'testing_center_agent_nightly_reservation_not_confirmable' using errcode='55000'; end if;
  end if;
  callback_status:='applied'; job_state:=p_phase; return next;
end $_$;


--

-- Name: testing_center_record_codex_dossier(text, jsonb, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_center_record_codex_dossier(p_rejection_validation_id text, p_dossier jsonb, p_canonical_dossier text, p_dossier_digest_source text, p_dossier_digest text, p_transport_digest text) RETURNS TABLE(result_dossier_digest text, result_status text, result_idempotent boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_keys text[];
  v_validation public.testing_center_validation_snapshots%rowtype;
  v_candidate public.testing_center_candidate_builds%rowtype;
  v_existing public.testing_center_codex_dossier_snapshots%rowtype;
  v_status text;
begin
  if p_rejection_validation_id is null
    or pg_catalog.jsonb_typeof(p_dossier) <> 'object'
    or pg_catalog.octet_length(p_canonical_dossier) not between 2 and 32768
    or pg_catalog.octet_length(p_dossier_digest_source) not between 2 and 32768
    or p_dossier_digest !~ '^[0-9a-f]{64}$'
    or p_transport_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'testing_center_dossier_invalid' using errcode='22023';
  end if;
  begin
    if p_canonical_dossier::jsonb is distinct from p_dossier then
      raise exception 'testing_center_dossier_invalid' using errcode='22023';
    end if;
  exception when invalid_text_representation then
    raise exception 'testing_center_dossier_invalid' using errcode='22023';
  end;
  begin
    if p_dossier_digest_source::jsonb is distinct from
      pg_catalog.jsonb_set(p_dossier,'{dossierDigest}',pg_catalog.to_jsonb(''::text)) then
      raise exception 'testing_center_dossier_digest_invalid' using errcode='22023';
    end if;
  exception when invalid_text_representation then
    raise exception 'testing_center_dossier_digest_invalid' using errcode='22023';
  end;
  if pg_catalog.encode(public.digest(
      pg_catalog.convert_to(p_canonical_dossier,'UTF8'),'sha256'),'hex')
      is distinct from p_transport_digest
    or pg_catalog.encode(public.digest(
      pg_catalog.convert_to(p_dossier_digest_source,'UTF8'),'sha256'),'hex')
      is distinct from p_dossier_digest
    or p_dossier->>'dossierDigest' is distinct from p_dossier_digest then
    raise exception 'testing_center_dossier_digest_invalid' using errcode='22023';
  end if;
  select pg_catalog.array_agg(key order by key) into v_keys
  from pg_catalog.jsonb_object_keys(p_dossier) keys(key);
  if v_keys is distinct from array[
      'basePrSha','candidateSha','commandIds','contractVersion','criteria',
      'dossierDigest','dossierIdempotencyKey','evidence','evidenceDigest',
      'evidenceRedactedValues','evidenceTruncatedFields','files','hasReplayUrl',
      'includesRetryOrReleaseCommand','incompleteReasons','nightlyHeadSha',
      'noDeployAllowed','noMergeAllowed','noPromotionAllowed','noRetryAllowed',
      'prBaseRef','rejection','repository','source','status','strategy'
    ]::text[]
    or p_dossier->>'contractVersion' <> 'testing-center.codex-dossier.v1'
    or p_dossier->>'strategy' <> 'sub_issue_new_branch'
    or p_dossier->>'prBaseRef' <> 'nightly'
    or p_dossier->>'candidateSha' !~ '^[0-9a-f]{40}$'
    or p_dossier->>'nightlyHeadSha' !~ '^[0-9a-f]{40}$'
    or p_dossier->>'basePrSha' !~ '^[0-9a-f]{40}$'
    or p_dossier#>>'{repository,owner}' <> 'isaacalbala12'
    or p_dossier#>>'{repository,name}' <> 'Vantare-Simracing-Suite'
    or p_dossier#>>'{repository,environment}' <> 'vantare-codex-cloud'
    or p_dossier#>>'{repository,targetBranch}' !~ '^vantareapp/isa-[0-9]+-[a-z0-9-]{1,60}$'
    or (p_dossier->>'hasReplayUrl')::boolean
    or (p_dossier->>'includesRetryOrReleaseCommand')::boolean
    or not (p_dossier->>'noRetryAllowed')::boolean
    or not (p_dossier->>'noMergeAllowed')::boolean
    or not (p_dossier->>'noDeployAllowed')::boolean
    or not (p_dossier->>'noPromotionAllowed')::boolean
    or p_dossier::text ~* 'https?://' then
    raise exception 'testing_center_dossier_shape_invalid' using errcode='22023';
  end if;
  v_status := p_dossier->>'status';
  if v_status not in ('complete','incomplete')
    or (v_status='complete' and pg_catalog.jsonb_array_length(
      p_dossier->'incompleteReasons') <> 0) then
    raise exception 'testing_center_dossier_status_invalid' using errcode='22023';
  end if;

  select * into v_validation from public.testing_center_validation_snapshots
  where validation_id=p_rejection_validation_id and decision='rejected'
  for update;
  if not found then
    raise exception 'testing_center_dossier_rejection_invalid' using errcode='55000';
  end if;
  select * into strict v_candidate from public.testing_center_candidate_builds
  where candidate_id=v_validation.candidate_id;
  if p_dossier#>>'{source,originalIssue,issueId}' <> v_validation.technical_issue_id
    or p_dossier#>>'{source,candidate,candidateId}' <> v_validation.candidate_id
    or p_dossier#>>'{source,candidate,channel}' <> v_validation.channel
    or p_dossier#>>'{source,candidate,appVersion}' <> v_validation.app_version
    or p_dossier#>>'{source,candidate,candidateSha}' <> v_validation.candidate_sha
    or p_dossier->>'candidateSha' <> v_validation.candidate_sha
    or p_dossier#>>'{source,subIssue,issueId}' !~ '^issue_[0-9a-f]{64}$'
    or p_dossier#>>'{source,subIssue,issueId}' = v_validation.technical_issue_id then
    raise exception 'testing_center_dossier_binding_invalid' using errcode='55000';
  end if;
  select * into v_existing from public.testing_center_codex_dossier_snapshots
  where dossier_digest=p_dossier_digest;
  if found then
    if v_existing.transport_digest <> p_transport_digest
      or v_existing.rejection_validation_id <> p_rejection_validation_id then
      raise exception 'testing_center_dossier_conflict' using errcode='23505';
    end if;
    return query select v_existing.dossier_digest,v_existing.status,true;
    return;
  end if;
  insert into public.testing_center_codex_dossier_snapshots(
    dossier_digest,transport_digest,dossier_idempotency_key,
    rejection_validation_id,technical_issue_id,candidate_id,channel,
    candidate_sha,correction_issue_id,target_branch,nightly_sha,status,
    canonical_dossier
  ) values (
    p_dossier_digest,p_transport_digest,p_dossier->>'dossierIdempotencyKey',
    p_rejection_validation_id,v_validation.technical_issue_id,
    v_validation.candidate_id,v_validation.channel,v_validation.candidate_sha,
    p_dossier#>>'{source,subIssue,issueId}',
    p_dossier#>>'{repository,targetBranch}',p_dossier->>'nightlyHeadSha',
    v_status,p_dossier
  );
  return query select p_dossier_digest,v_status,false;
end $_$;


--

-- Name: testing_center_record_codex_outcome(text, text, bigint, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_center_record_codex_outcome(p_technical_issue_id text, p_worker_id text, p_fencing_token bigint, p_outcome_code text, p_response_digest text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_run_id text;
  v_state text;
begin
  if p_outcome_code not in ('proposed', 'needs_owner', 'not_reproduced', 'ambiguous_response')
    or (
      p_outcome_code = 'ambiguous_response'
      and p_response_digest is not null
    )
    or (
      p_outcome_code <> 'ambiguous_response'
      and (p_response_digest is null or p_response_digest !~ '^[0-9a-f]{64}$')
    ) then
    raise exception 'testing_center_codex_outcome_invalid' using errcode = '22023';
  end if;
  v_state := case when p_outcome_code = 'ambiguous_response' then 'needs_owner' else 'completed' end;
  update public.testing_center_codex_execution_control as control
  set state = v_state, lease_owner = null, lease_expires_at = null,
    outcome_code = p_outcome_code, response_digest = p_response_digest,
    updated_at = pg_catalog.now()
  where control.technical_issue_id = p_technical_issue_id
    and control.state = 'dispatching'
    and control.lease_owner = p_worker_id
    and control.fencing_token = p_fencing_token
  returning control.run_id into v_run_id;
  if not found then
    raise exception 'testing_center_codex_fence_lost' using errcode = '55000';
  end if;
  update public.testing_center_codex_runs
  set state = v_state, updated_at = pg_catalog.now()
  where testing_center_codex_runs.run_id = v_run_id;
end
$_$;


--

-- Name: testing_center_record_fenced_agent_callback(text, text, text, text, text, text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_center_record_fenced_agent_callback(p_delivery_id text, p_job_key text, p_head_sha text, p_callback_kind text, p_outcome text, p_payload_digest text, p_fencing_token bigint) RETURNS TABLE(callback_status text, job_state text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_job public.testing_center_agent_jobs%rowtype; v_target text; v_effect public.testing_center_agent_effect_outbox%rowtype;
begin
  v_target := case p_callback_kind when 'triage' then 'triage' when 'fix' then 'fix' else null end;
  if v_target is null or p_fencing_token < 1 then
    raise exception 'testing_center_agent_fenced_callback_invalid' using errcode='22023';
  end if;
  select * into v_job from public.testing_center_agent_jobs where job_key=p_job_key for update;
  if not found then raise exception 'testing_center_agent_job_not_found' using errcode='P0002'; end if;
  select * into v_effect from public.testing_center_agent_effect_outbox
    where job_key=p_job_key and effect_kind='github_dispatch' and effect_target=v_target
      and effect_generation=1 for update;
  if not found or v_effect.fencing_token<>p_fencing_token or v_effect.state<>'completed' then
    if public.testing_center_agent_transition_allowed(v_job.state,'needs_owner') then
      perform public.testing_center_transition_agent_job(
        p_job_key,v_job.state,'needs_owner','fenced-callback',p_payload_digest
      );
      v_job.state:='needs_owner';
    end if;
    callback_status:='needs_owner'; job_state:=v_job.state; return next; return;
  end if;
  return query select * from public.testing_center_record_agent_callback(
    p_delivery_id,p_job_key,
    case when p_callback_kind='fix' then v_job.nightly_base_sha else p_head_sha end,
    p_callback_kind,p_outcome,p_payload_digest
  );
end $$;


--

-- Name: testing_center_record_github_delivery(text, text, text, text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_center_record_github_delivery(p_delivery_id text, p_event_name text, p_action text, p_payload_digest text, p_issue_number bigint) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_existing public.testing_center_github_deliveries%rowtype;
begin
  insert into public.testing_center_github_deliveries(
    delivery_id, event_name, action, payload_digest, external_issue_number
  ) values (p_delivery_id, p_event_name, p_action, p_payload_digest, p_issue_number)
  on conflict (delivery_id) do nothing;
  if found then return false; end if;
  select * into v_existing from public.testing_center_github_deliveries where delivery_id = p_delivery_id;
  if v_existing.event_name <> p_event_name or v_existing.action <> p_action
    or v_existing.payload_digest <> p_payload_digest
    or v_existing.external_issue_number <> p_issue_number then
    raise exception 'testing_center_github_delivery_conflict' using errcode = '23505';
  end if;
  return true;
end; $$;


--

-- Name: testing_center_record_linear_ambiguity(text, text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_center_record_linear_ambiguity(p_effect_id text, p_worker_id text, p_fencing_token bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_issue_id text;
begin
  update public.testing_center_effect_outbox
  set state = 'needs_owner', lease_token = null, lease_expires_at = null,
    lease_owner = null, next_attempt_at = null,
    last_error_code = 'linear_response_ambiguous', updated_at = now()
  where effect_id = p_effect_id and effect_type = 'linear_issue_create'
    and state = 'claimed' and lease_owner = p_worker_id
    and fencing_token = p_fencing_token and lease_expires_at > now()
  returning technical_issue_id into v_issue_id;
  if not found then
    raise exception 'testing_center_linear_lease_lost' using errcode = '55000';
  end if;
  update public.testing_center_issue_destinations
  set decision_state = 'needs_owner', decision_reason = 'linear_response_ambiguous',
    updated_at = now()
  where technical_issue_id = v_issue_id and destination = 'linear'
    and active_effect_id = p_effect_id;
end $$;


--

-- Name: testing_center_record_owner_disposition(text, text, text, text, text, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_center_record_owner_disposition(p_rejection_validation_id text, p_dossier_digest text, p_disposition text, p_reason text, p_correction_issue_id text, p_target_branch text, p_nightly_sha text, p_owner_user_id uuid) RETURNS TABLE(result_disposition_id text, result_issue_state text, result_idempotent boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_owner public.testing_center_memberships%rowtype;
  v_validation public.testing_center_validation_snapshots%rowtype;
  v_issue public.testing_center_technical_issues%rowtype;
  v_dossier public.testing_center_codex_dossier_snapshots%rowtype;
  v_existing public.testing_center_owner_dispositions%rowtype;
  v_digest text;
  v_disposition_id text;
  v_target_state text;
begin
  if p_owner_user_id is null or p_disposition not in (
      'create_correction_subissue','environment_issue','create_separate_issue',
      'dismiss_with_reason','stop_rollout'
    ) or p_reason is null or p_reason <> btrim(p_reason)
    or pg_catalog.octet_length(p_reason) not between 3 and 2048 then
    raise exception 'testing_center_owner_disposition_invalid' using errcode='22023';
  end if;
  select * into v_owner from public.testing_center_memberships
  where user_id=p_owner_user_id and active and role='owner' for update;
  if not found then
    raise exception 'testing_center_owner_required' using errcode='42501';
  end if;
  select * into v_validation from public.testing_center_validation_snapshots
  where validation_id=p_rejection_validation_id and decision='rejected'
  for update;
  if not found then
    raise exception 'testing_center_owner_rejection_invalid' using errcode='55000';
  end if;
  select * into strict v_issue from public.testing_center_technical_issues
  where technical_issue_id=v_validation.technical_issue_id for update;
  v_digest := pg_catalog.encode(public.digest(pg_catalog.convert_to(
    p_rejection_validation_id || pg_catalog.chr(31)
    || coalesce(p_dossier_digest,'') || pg_catalog.chr(31)
    || p_disposition || pg_catalog.chr(31) || p_reason || pg_catalog.chr(31)
    || coalesce(p_correction_issue_id,'') || pg_catalog.chr(31)
    || coalesce(p_target_branch,'') || pg_catalog.chr(31)
    || coalesce(p_nightly_sha,'') || pg_catalog.chr(31)
    || v_owner.actor_id || pg_catalog.chr(31) || p_owner_user_id::text,
    'UTF8'),'sha256'),'hex');
  v_disposition_id := 'disposition_' || v_digest;
  select * into v_existing from public.testing_center_owner_dispositions
  where rejection_validation_id=p_rejection_validation_id;
  if found then
    if v_existing.disposition_digest <> v_digest then
      raise exception 'testing_center_owner_disposition_conflict' using errcode='23505';
    end if;
    return query select v_existing.disposition_id,v_issue.flow_state,true;
    return;
  end if;
  if v_issue.flow_state <> 'needs_owner' then
    raise exception 'testing_center_owner_issue_not_blocked' using errcode='55000';
  end if;
  if p_disposition='create_correction_subissue' then
    if p_dossier_digest is null or p_correction_issue_id is null
      or p_target_branch is null or p_nightly_sha is null then
      raise exception 'testing_center_owner_complete_dossier_required'
        using errcode='55000';
    end if;
    select * into v_dossier from public.testing_center_codex_dossier_snapshots
    where dossier_digest=p_dossier_digest
      and rejection_validation_id=p_rejection_validation_id
      and status='complete';
    if not found or v_dossier.correction_issue_id <> p_correction_issue_id
      or v_dossier.target_branch <> p_target_branch
      or v_dossier.nightly_sha <> p_nightly_sha then
      raise exception 'testing_center_owner_complete_dossier_required'
        using errcode='55000';
    end if;
    v_target_state := 'needs_owner';
  else
    if p_dossier_digest is not null or p_correction_issue_id is not null
      or p_target_branch is not null or p_nightly_sha is not null then
      raise exception 'testing_center_owner_disposition_fields_invalid'
        using errcode='22023';
    end if;
    v_target_state := 'stopped';
  end if;
  insert into public.testing_center_owner_dispositions(
    disposition_id,rejection_validation_id,technical_issue_id,actor_id,
    actor_user_id,disposition,reason,dossier_digest,correction_issue_id,
    target_branch,nightly_sha,disposition_digest
  ) values (
    v_disposition_id,p_rejection_validation_id,v_validation.technical_issue_id,
    v_owner.actor_id,p_owner_user_id,p_disposition,p_reason,p_dossier_digest,
    p_correction_issue_id,p_target_branch,p_nightly_sha,v_digest
  );
  if v_target_state='stopped' then
    update public.testing_center_technical_issues
    set flow_state='stopped',updated_at=now()
    where technical_issue_id=v_validation.technical_issue_id;
    insert into public.testing_center_audit(
      contract_version,audit_id,aggregate_id,from_state,to_state,origin,
      actor_id,actor_user_id,actor_role,exact_sha,operation_digest
    ) values (
      'testing-center.v1','audit_' || v_digest,v_validation.technical_issue_id,
      'needs_owner','stopped','testing_center',v_owner.actor_id,p_owner_user_id,
      'owner',v_validation.candidate_sha,v_digest
    );
  end if;
  return query select v_disposition_id,v_target_state,false;
end $$;


--

-- Name: testing_center_record_validation_projection(jsonb, text, text, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_center_record_validation_projection(p_projection jsonb, p_canonical_projection text, p_projection_digest_source text, p_projection_digest text, p_transport_digest text, p_actor_user_id uuid) RETURNS TABLE(result_validation_id text, result_decision text, result_issue_state text, result_candidate_state text, result_idempotent boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_keys text[];
  v_sanitization_keys text[];
  v_candidate public.testing_center_candidate_builds%rowtype;
  v_issue public.testing_center_technical_issues%rowtype;
  v_membership public.testing_center_memberships%rowtype;
  v_existing public.testing_center_validation_snapshots%rowtype;
  v_validation_id text;
  v_replay_key text;
  v_decision text;
  v_details text;
  v_from_state text;
  v_to_state text;
  v_candidate_state text;
  v_audit_digest text;
begin
  if p_actor_user_id is null or pg_catalog.jsonb_typeof(p_projection) <> 'object'
    or p_canonical_projection is null
    or pg_catalog.octet_length(p_canonical_projection) not between 2 and 32768
    or pg_catalog.octet_length(p_projection_digest_source) not between 2 and 32768
    or p_projection_digest !~ '^[0-9a-f]{64}$'
    or p_transport_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'testing_center_validation_projection_invalid'
      using errcode = '22023';
  end if;
  begin
    if p_canonical_projection::jsonb is distinct from p_projection then
      raise exception 'testing_center_validation_projection_invalid'
        using errcode = '22023';
    end if;
  exception when invalid_text_representation then
    raise exception 'testing_center_validation_projection_invalid'
      using errcode = '22023';
  end;
  begin
    if p_projection_digest_source::jsonb is distinct from
      p_projection - 'projectionDigest' then
      raise exception 'testing_center_validation_projection_digest_invalid'
        using errcode = '22023';
    end if;
  exception when invalid_text_representation then
    raise exception 'testing_center_validation_projection_digest_invalid'
      using errcode = '22023';
  end;
  if pg_catalog.encode(public.digest(
      pg_catalog.convert_to(p_canonical_projection,'UTF8'),'sha256'),'hex')
      is distinct from p_transport_digest
    or pg_catalog.encode(public.digest(
      pg_catalog.convert_to(p_projection_digest_source,'UTF8'),'sha256'),'hex')
      is distinct from p_projection_digest
    or p_projection->>'projectionDigest' is distinct from p_projection_digest then
    raise exception 'testing_center_validation_projection_digest_invalid'
      using errcode = '22023';
  end if;
  select pg_catalog.array_agg(key order by key) into v_keys
  from pg_catalog.jsonb_object_keys(p_projection) keys(key);
  select pg_catalog.array_agg(key order by key) into v_sanitization_keys
  from pg_catalog.jsonb_object_keys(p_projection->'sanitization') keys(key);
  if v_keys is distinct from array[
      'actorRole','appVersion','candidateId','candidateSha','channel',
      'contractVersion','decision','decisionDigest','detailsMarkdown','issueId',
      'operation','projectionDigest','replayKey','sanitization'
    ]::text[]
    or v_sanitization_keys is distinct from array['redactedValues','truncatedFields']::text[]
    or p_projection->>'contractVersion' <> 'testing-center.rejection.v1'
    or p_projection->>'operation' <> 'record_validation'
    or p_projection->>'issueId' !~ '^issue_[0-9a-f]{64}$'
    or p_projection->>'candidateId' !~ '^[A-Za-z0-9._-]{1,64}$'
    or p_projection->>'channel' not in ('nightly','testers')
    or p_projection->>'appVersion' = ''
    or pg_catalog.octet_length(p_projection->>'appVersion') > 32
    or p_projection->>'candidateSha' !~ '^[0-9a-f]{40}$'
    or p_projection->>'actorRole' not in ('tester','primary_tester','owner')
    or p_projection->>'decision' not in ('accepted','rejected','cannot_verify')
    or p_projection->>'decisionDigest' !~ '^[0-9a-f]{64}$'
    or pg_catalog.jsonb_typeof(p_projection->'sanitization') <> 'object'
    or pg_catalog.jsonb_typeof(p_projection->'sanitization'->'redactedValues') <> 'number'
    or pg_catalog.jsonb_typeof(p_projection->'sanitization'->'truncatedFields') <> 'number'
    or (p_projection#>>'{sanitization,redactedValues}')::integer < 0
    or (p_projection#>>'{sanitization,truncatedFields}')::integer < 0 then
    raise exception 'testing_center_validation_projection_shape_invalid'
      using errcode = '22023';
  end if;

  select * into v_membership from public.testing_center_memberships
  where user_id = p_actor_user_id and active for update;
  if not found
    or v_membership.actor_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or v_membership.role <> p_projection->>'actorRole' then
    raise exception 'testing_center_validation_membership_invalid'
      using errcode = '42501';
  end if;
  if (p_projection->>'channel' = 'nightly'
      and v_membership.role not in ('primary_tester','owner'))
    or (p_projection->>'channel' = 'testers'
      and v_membership.role not in ('tester','primary_tester','owner')) then
    raise exception 'testing_center_validation_role_invalid' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_projection->>'candidateId',0)
  );
  select * into v_candidate from public.testing_center_candidate_builds
  where candidate_id = p_projection->>'candidateId' for update;
  if not found
    or v_candidate.technical_issue_id <> p_projection->>'issueId'
    or v_candidate.channel <> p_projection->>'channel'
    or v_candidate.build_version <> p_projection->>'appVersion'
    or v_candidate.exact_sha <> p_projection->>'candidateSha'
    or v_candidate.author_id = v_membership.actor_id then
    raise exception 'testing_center_validation_candidate_invalid'
      using errcode = '55000';
  end if;
  select * into strict v_issue from public.testing_center_technical_issues
  where technical_issue_id = v_candidate.technical_issue_id for update;

  v_replay_key := 'validation:' || v_candidate.technical_issue_id || ':'
    || v_candidate.candidate_id || ':' || v_candidate.channel || ':'
    || v_candidate.exact_sha || ':' || v_membership.actor_id;
  if p_projection->>'replayKey' is distinct from v_replay_key then
    raise exception 'testing_center_validation_replay_key_invalid'
      using errcode = '22023';
  end if;
  select * into v_existing from public.testing_center_validation_snapshots
  where replay_key = v_replay_key;
  if found then
    if v_existing.projection_digest <> p_projection_digest
      or v_existing.actor_user_id <> p_actor_user_id then
      raise exception 'testing_center_validation_replay_conflict'
        using errcode = '23505';
    end if;
    return query select v_existing.validation_id, v_existing.decision,
      v_issue.flow_state, v_candidate.state, true;
    return;
  end if;
  if v_candidate.state not in ('pending','accepted')
    or v_issue.flow_state not in (
      'nightly_candidate','nightly_accepted','testers_candidate','testers_accepted'
    ) then
    raise exception 'testing_center_candidate_not_open_for_feedback'
      using errcode = '55000';
  end if;
  if exists (
    select 1 from public.testing_center_pauses pause
    where pause.is_paused and (pause.scope='global'
      or (pause.scope='flow' and pause.technical_issue_id=v_issue.technical_issue_id))
  ) then
    raise exception 'testing_center_paused' using errcode = '55000';
  end if;

  v_decision := p_projection->>'decision';
  v_details := case when p_projection->'detailsMarkdown' = 'null'::jsonb
    then null else p_projection->>'detailsMarkdown' end;
  if (v_decision='rejected' and (v_details is null
      or v_details !~ '^## Rechazo:' or v_details ~* 'https?://|@[A-Za-z0-9]'))
    or (v_decision in ('accepted','cannot_verify') and v_details is not null) then
    raise exception 'testing_center_validation_details_invalid'
      using errcode = '22023';
  end if;

  v_from_state := v_issue.flow_state;
  if v_decision = 'rejected' then
    v_to_state := 'needs_owner';
    v_candidate_state := 'rejected';
  elsif v_decision = 'accepted' then
    v_to_state := case v_candidate.channel
      when 'nightly' then 'nightly_accepted' else 'testers_accepted' end;
    v_candidate_state := 'accepted';
  else
    v_to_state := v_issue.flow_state;
    v_candidate_state := v_candidate.state;
  end if;
  v_validation_id := 'validation_' || p_projection_digest;

  insert into public.testing_center_validations(
    contract_version,validation_id,candidate_id,channel,exact_sha,
    candidate_author_id,decision,actor_id,actor_user_id,actor_role,
    actor_origin,rejection_reason
  ) values (
    'testing-center.v1',v_validation_id,v_candidate.candidate_id,
    v_candidate.channel,v_candidate.exact_sha,v_candidate.author_id,v_decision,
    v_membership.actor_id,p_actor_user_id,v_membership.role,'testing_center',
    case when v_decision='rejected' then 'other' else null end
  );
  insert into public.testing_center_validation_snapshots(
    validation_id,technical_issue_id,candidate_id,channel,app_version,
    candidate_sha,actor_id,actor_user_id,actor_role,decision,replay_key,
    decision_digest,projection_digest,transport_digest,sanitized_projection,details_markdown,
    redacted_values,truncated_fields
  ) values (
    v_validation_id,v_issue.technical_issue_id,v_candidate.candidate_id,
    v_candidate.channel,v_candidate.build_version,v_candidate.exact_sha,
    v_membership.actor_id,p_actor_user_id,v_membership.role,v_decision,
    v_replay_key,p_projection->>'decisionDigest',p_projection_digest,
    p_transport_digest,p_projection,
    v_details,(p_projection#>>'{sanitization,redactedValues}')::integer,
    (p_projection#>>'{sanitization,truncatedFields}')::integer
  );

  if v_candidate.state is distinct from v_candidate_state then
    update public.testing_center_candidate_builds
    set state=v_candidate_state,updated_at=now()
    where candidate_id=v_candidate.candidate_id;
  end if;
  if v_issue.flow_state is distinct from v_to_state then
    update public.testing_center_technical_issues
    set flow_state=v_to_state,updated_at=now()
    where technical_issue_id=v_issue.technical_issue_id;
    v_audit_digest := pg_catalog.encode(public.digest(pg_catalog.convert_to(
      'candidate-feedback' || pg_catalog.chr(31) || p_projection_digest,
      'UTF8'),'sha256'),'hex');
    insert into public.testing_center_audit(
      contract_version,audit_id,aggregate_id,from_state,to_state,origin,
      actor_id,actor_user_id,actor_role,exact_sha,operation_digest
    ) values (
      'testing-center.v1','audit_' || v_audit_digest,v_issue.technical_issue_id,
      v_from_state,v_to_state,'testing_center',v_membership.actor_id,
      p_actor_user_id,v_membership.role,v_candidate.exact_sha,v_audit_digest
    );
  end if;
  if v_decision='rejected' then
    update public.testing_center_promotions
    set state='blocked',authorized_by_id=null,authorized_by_user_id=null,
      authorized_by_role=null,authorized_origin=null,updated_at=now()
    where candidate_id=v_candidate.candidate_id
      and exact_sha=v_candidate.exact_sha and state in ('pending','authorized');
  end if;
  return query select v_validation_id,v_decision,v_to_state,v_candidate_state,false;
end $_$;


--

-- Name: testing_center_reserve_agent_effect(text, text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_center_reserve_agent_effect(p_effect_id text, p_worker_id text, p_fencing_token bigint) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_effect public.testing_center_agent_effect_outbox%rowtype;
  v_issue text;
  v_job_state text;
begin
  lock table public.testing_center_pauses in share mode;
  select effect.* into v_effect
  from public.testing_center_agent_effect_outbox effect
  where effect.effect_id=p_effect_id for update;
  if not found or v_effect.state<>'claimed' or v_effect.lease_owner<>p_worker_id
    or v_effect.fencing_token<>p_fencing_token or v_effect.lease_expires_at<=pg_catalog.now() then
    raise exception 'testing_center_agent_effect_fencing_stale' using errcode='55000';
  end if;
  select job.technical_issue_id,job.state into strict v_issue,v_job_state
  from public.testing_center_agent_jobs job where job.job_key=v_effect.job_key for update;
  if v_job_state in (
    'duplicate','needs_info','ineligible','completed','reverted','needs_owner','stopped'
  ) then
    raise exception 'testing_center_agent_job_not_executable' using errcode='55000';
  end if;
  if exists (
    select 1 from public.testing_center_pauses pause where pause.is_paused
      and (pause.scope='global' or (pause.scope='flow' and pause.technical_issue_id=v_issue))
  ) then raise exception 'testing_center_paused' using errcode='55000'; end if;
  if v_effect.effect_target='triage' then
    update public.testing_center_agent_jobs set triage_dispatch_count=triage_dispatch_count+1,updated_at=pg_catalog.now()
      where job_key=v_effect.job_key and triage_dispatch_count=0;
    if not found then raise exception 'testing_center_agent_dispatch_already_reserved' using errcode='55000'; end if;
  elsif v_effect.effect_target='fix' then
    update public.testing_center_agent_jobs set fix_dispatch_count=fix_dispatch_count+1,updated_at=pg_catalog.now()
      where job_key=v_effect.job_key and fix_dispatch_count=0;
    if not found then raise exception 'testing_center_agent_dispatch_already_reserved' using errcode='55000'; end if;
  end if;
  update public.testing_center_agent_effect_outbox
    set state='reserved',dispatch_reserved=true,updated_at=pg_catalog.now()
    where effect_id=p_effect_id;
  return 'reserved';
end $$;


--

-- Name: testing_center_reserve_agent_resource(text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_center_reserve_agent_resource(p_job_key text, p_reservation_kind text, p_reservation_key text, p_binding_digest text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare v_existing public.testing_center_agent_reservations%rowtype; v_job public.testing_center_agent_jobs%rowtype;
begin
  if p_reservation_kind not in ('branch','pull_request','nightly_release')
    or p_reservation_key='' or octet_length(p_reservation_key)>256
    or p_binding_digest!~'^[0-9a-f]{64}$' then
    raise exception 'testing_center_agent_reservation_invalid' using errcode='22023';
  end if;
  select * into v_job from public.testing_center_agent_jobs where job_key=p_job_key for update;
  if not found then raise exception 'testing_center_agent_job_not_found' using errcode='P0002'; end if;
  select * into v_existing from public.testing_center_agent_reservations
    where job_key=p_job_key and reservation_kind=p_reservation_kind for update;
  if found then
    if v_existing.reservation_key<>p_reservation_key or v_existing.binding_digest<>p_binding_digest then
      if public.testing_center_agent_transition_allowed(v_job.state,'needs_owner') then
        perform public.testing_center_transition_agent_job(
          p_job_key,v_job.state,'needs_owner','reservation-worker',p_binding_digest
        );
        return 'needs_owner';
      end if;
      return v_job.state;
    end if;
    return 'existing';
  end if;
  insert into public.testing_center_agent_reservations(reservation_key,job_key,reservation_kind,binding_digest)
    values(p_reservation_key,p_job_key,p_reservation_kind,p_binding_digest);
  return 'reserved';
end $_$;


--

-- Name: testing_center_retry_linear_pilot_token(text, text, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_center_retry_linear_pilot_token(p_effect_id text, p_worker_id text, p_fencing_token bigint, p_projection_digest text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_effect public.testing_center_effect_outbox%rowtype;
begin
  select * into v_effect from public.testing_center_effect_outbox
  where effect_id = p_effect_id for update;
  if not found or v_effect.effect_type <> 'linear_issue_create'
    or v_effect.state <> 'claimed'
    or v_effect.lease_owner is distinct from p_worker_id
    or v_effect.fencing_token is distinct from p_fencing_token
    or v_effect.lease_expires_at <= now() then
    raise exception 'testing_center_linear_lease_lost' using errcode = '55000';
  end if;
  update public.testing_center_linear_projection_snapshots
  set sanitized_projection = null, projection_digest = null, completed_at = null
  where effect_id = p_effect_id and projection_digest = p_projection_digest
    and sanitized_projection is not null;
  if not found then
    raise exception 'testing_center_linear_projection_integrity_invalid'
      using errcode = '22023';
  end if;
  update public.testing_center_effect_outbox
  set state = 'failed', lease_token = null, lease_expires_at = null,
    lease_owner = null,
    next_attempt_at = now() + pg_catalog.make_interval(
      secs => least(300,
        5 * (2 ^ greatest(attempt_count - 1,0))::integer)),
    last_error_code = 'linear_transport_unavailable', updated_at = now()
  where effect_id = p_effect_id;
end $$;


--

-- Name: testing_center_transition_agent_job(text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_center_transition_agent_job(p_job_key text, p_expected_state text, p_to_state text, p_actor text, p_operation_digest text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare v_job public.testing_center_agent_jobs%rowtype;
begin
  if p_job_key !~ '^[0-9a-f]{64}$'
    or p_actor !~ '^[a-z0-9][a-z0-9._-]{0,63}$'
    or p_operation_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'testing_center_agent_transition_invalid' using errcode = '22023';
  end if;
  select * into v_job from public.testing_center_agent_jobs where job_key=p_job_key for update;
  if not found then raise exception 'testing_center_agent_job_not_found' using errcode='P0002'; end if;
  if v_job.state = p_to_state then return v_job.state; end if;
  if v_job.state <> p_expected_state then
    raise exception 'testing_center_agent_job_state_stale' using errcode='55000';
  end if;
  if not public.testing_center_agent_transition_allowed(v_job.state,p_to_state) then
    raise exception 'testing_center_agent_job_transition_illegal' using errcode='55000';
  end if;
  update public.testing_center_agent_jobs
    set state=p_to_state,updated_at=pg_catalog.now() where job_key=p_job_key;
  insert into public.testing_center_agent_audit(
    job_key,execution_generation,policy_version,from_state,to_state,actor,operation_digest
  ) values (
    v_job.job_key,v_job.execution_generation,v_job.policy_version,v_job.state,p_to_state,p_actor,p_operation_digest
  );
  return p_to_state;
end $_$;


--

-- Name: testing_center_upsert_linear_state_mapping(uuid, uuid, text, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_center_upsert_linear_state_mapping(p_organization_id uuid, p_linear_state_id uuid, p_coarse_state text, p_configured_by_id text, p_active boolean DEFAULT true) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
begin
  if p_organization_id is null or p_linear_state_id is null
    or p_coarse_state not in (
      'linear_created', 'awaiting_owner', 'codex_in_progress',
      'pr_in_review', 'needs_changes', 'stopped'
    ) or p_configured_by_id is null
    or p_configured_by_id !~ '^[a-z0-9][a-z0-9._-]{0,127}$'
    or p_active is null then
    raise exception 'testing_center_linear_state_mapping_invalid'
      using errcode = '22023';
  end if;
  insert into public.testing_center_linear_state_mappings(
    organization_id, linear_state_id, coarse_state, active, configured_by_id
  ) values (
    p_organization_id, p_linear_state_id, p_coarse_state, p_active,
    p_configured_by_id
  )
  on conflict(organization_id, linear_state_id) do update
  set coarse_state = excluded.coarse_state, active = excluded.active,
    configured_by_id = excluded.configured_by_id, updated_at = now();
end $_$;


--

-- Name: testing_center_validate_candidate(text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_center_validate_candidate(p_contract_version text, p_candidate_id text, p_exact_sha text, p_decision text, p_rejection_reason text, p_idempotency_key text) RETURNS TABLE(validation_id text, candidate_id text, exact_sha text, decision text, resulting_state text, idempotent boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_user_id uuid := private.current_account();
  v_actor_id text;
  v_role text;
  v_issue_id text;
  v_channel text;
  v_candidate_sha text;
  v_candidate_author text;
  v_candidate_state text;
  v_issue_state text;
  v_from_state text;
  v_to_state text;
  v_candidate_result text;
  v_validation_id text;
  v_audit_id text;
  v_operation_digest text;
  v_existing_idempotency public.testing_center_idempotency%rowtype;
  v_existing_validation public.testing_center_validations%rowtype;
begin
  if v_user_id is null then
    raise exception 'testing_center_auth_required' using errcode = '42501';
  end if;

  select membership.actor_id, membership.role
  into v_actor_id, v_role
  from public.testing_center_memberships as membership
  where membership.user_id = v_user_id
    and membership.active;

  if not found then
    raise exception 'testing_center_membership_required' using errcode = '42501';
  end if;

  if p_contract_version is distinct from 'testing-center.v1' then
    raise exception 'testing_center_contract_version_invalid' using errcode = '22023';
  end if;
  if p_candidate_id is null
    or p_candidate_id = ''
    or p_candidate_id ~ '^[[:space:]]|[[:space:]]$'
    or octet_length(p_candidate_id) > 256 then
    raise exception 'testing_center_candidate_id_invalid' using errcode = '22023';
  end if;
  if p_exact_sha is null
    or p_exact_sha !~ '^(?:[0-9a-f]{40}|[0-9a-f]{64})$' then
    raise exception 'testing_center_sha_invalid' using errcode = '22023';
  end if;
  if p_idempotency_key is null
    or p_idempotency_key = ''
    or p_idempotency_key ~ '^[[:space:]]|[[:space:]]$'
    or octet_length(p_idempotency_key) > 256 then
    raise exception 'testing_center_idempotency_key_invalid' using errcode = '22023';
  end if;
  if p_decision not in ('accepted', 'rejected') then
    raise exception 'testing_center_decision_invalid' using errcode = '22023';
  end if;
  if (p_decision = 'accepted' and p_rejection_reason is not null)
    or (
      p_decision = 'rejected'
      and (
        p_rejection_reason is null
        or p_rejection_reason not in (
          'still_fails', 'regression', 'incomplete_fix', 'new_failure', 'other'
        )
      )
    ) then
    raise exception 'testing_center_rejection_reason_invalid' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_candidate_id, 0)
  );

  select candidate.technical_issue_id,
    candidate.channel,
    candidate.exact_sha,
    candidate.author_id,
    candidate.state,
    issue.flow_state
  into v_issue_id,
    v_channel,
    v_candidate_sha,
    v_candidate_author,
    v_candidate_state,
    v_issue_state
  from public.testing_center_candidate_builds as candidate
  join public.testing_center_technical_issues as issue
    on issue.technical_issue_id = candidate.technical_issue_id
  where candidate.candidate_id = p_candidate_id
  for update of candidate, issue;

  if not found then
    raise exception 'testing_center_candidate_not_found' using errcode = 'P0002';
  end if;
  if v_candidate_sha <> p_exact_sha then
    raise exception 'testing_center_stale_sha' using errcode = '55000';
  end if;
  if v_actor_id = v_candidate_author then
    raise exception 'testing_center_self_validation_forbidden' using errcode = '42501';
  end if;

  if v_channel = 'nightly' then
    if v_role not in ('primary_tester', 'owner') then
      raise exception 'testing_center_nightly_role_required' using errcode = '42501';
    end if;
    v_from_state := 'nightly_candidate';
    v_to_state := case p_decision
      when 'accepted' then 'nightly_accepted'
      else 'nightly_rejected'
    end;
  elsif v_channel = 'testers' then
    if v_role not in ('tester', 'primary_tester', 'owner') then
      raise exception 'testing_center_testers_role_required' using errcode = '42501';
    end if;
    v_from_state := 'testers_candidate';
    v_to_state := case p_decision
      when 'accepted' then 'testers_accepted'
      else 'testers_rejected'
    end;
  else
    raise exception 'testing_center_candidate_channel_invalid' using errcode = '22023';
  end if;

  v_candidate_result := case p_decision
    when 'accepted' then 'accepted'
    else 'rejected'
  end;
  v_operation_digest := pg_catalog.encode(
    public.digest(
      pg_catalog.convert_to(
        p_contract_version || pg_catalog.chr(31)
        || p_candidate_id || pg_catalog.chr(31)
        || p_exact_sha || pg_catalog.chr(31)
        || p_decision || pg_catalog.chr(31)
        || coalesce(p_rejection_reason, '') || pg_catalog.chr(31)
        || v_actor_id || pg_catalog.chr(31)
        || v_user_id::text || pg_catalog.chr(31)
        || v_role,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
  v_validation_id := 'validation_' || v_operation_digest;
  v_audit_id := 'audit_' || v_operation_digest;

  select idempotency.*
  into v_existing_idempotency
  from public.testing_center_idempotency as idempotency
  where idempotency.aggregate_id = v_issue_id
    and idempotency.idempotency_key = p_idempotency_key;

  if found then
    if v_existing_idempotency.payload_digest <> v_operation_digest
      or v_existing_idempotency.from_state <> v_from_state
      or v_existing_idempotency.to_state <> v_to_state
      or v_existing_idempotency.exact_sha is distinct from p_exact_sha
      or v_existing_idempotency.origin <> 'testing_center' then
      raise exception 'testing_center_idempotency_conflict' using errcode = '23505';
    end if;

    select validation.*
    into v_existing_validation
    from public.testing_center_validations as validation
    where validation.validation_id = v_validation_id
      and validation.candidate_id = p_candidate_id
      and validation.channel = v_channel
      and validation.exact_sha = p_exact_sha
      and validation.decision = p_decision
      and validation.actor_id = v_actor_id
      and validation.actor_user_id = v_user_id
      and validation.actor_role = v_role
      and validation.rejection_reason is not distinct from p_rejection_reason;

    if not found then
      raise exception 'testing_center_idempotency_result_missing' using errcode = '23505';
    end if;

    return query select
      v_existing_validation.validation_id,
      v_existing_validation.candidate_id,
      v_existing_validation.exact_sha,
      v_existing_validation.decision,
      v_to_state,
      true;
    return;
  end if;

  if v_candidate_state <> 'pending' or v_issue_state <> v_from_state then
    raise exception 'testing_center_candidate_not_pending' using errcode = '55000';
  end if;
  if exists (
    select 1
    from public.testing_center_pauses as pause
    where pause.is_paused
      and (
        pause.scope = 'global'
        or (pause.scope = 'flow' and pause.technical_issue_id = v_issue_id)
      )
  ) then
    raise exception 'testing_center_paused' using errcode = '55000';
  end if;
  if exists (
    select 1
    from public.testing_center_validations as validation
    where validation.candidate_id = p_candidate_id
      and validation.channel = v_channel
      and validation.exact_sha = p_exact_sha
      and validation.actor_id = v_actor_id
  ) then
    raise exception 'testing_center_validation_conflict' using errcode = '23505';
  end if;

  insert into public.testing_center_idempotency (
    contract_version,
    idempotency_key,
    payload_digest,
    aggregate_id,
    from_state,
    to_state,
    exact_sha,
    origin
  ) values (
    'testing-center.v1',
    p_idempotency_key,
    v_operation_digest,
    v_issue_id,
    v_from_state,
    v_to_state,
    p_exact_sha,
    'testing_center'
  );

  insert into public.testing_center_validations (
    contract_version,
    validation_id,
    candidate_id,
    channel,
    exact_sha,
    candidate_author_id,
    decision,
    actor_id,
    actor_user_id,
    actor_role,
    actor_origin,
    rejection_reason
  ) values (
    'testing-center.v1',
    v_validation_id,
    p_candidate_id,
    v_channel,
    p_exact_sha,
    v_candidate_author,
    p_decision,
    v_actor_id,
    v_user_id,
    v_role,
    'testing_center',
    p_rejection_reason
  );

  update public.testing_center_candidate_builds
  set state = v_candidate_result,
    updated_at = now()
  where testing_center_candidate_builds.candidate_id = p_candidate_id;

  update public.testing_center_technical_issues
  set flow_state = v_to_state,
    updated_at = now()
  where testing_center_technical_issues.technical_issue_id = v_issue_id;

  insert into public.testing_center_audit (
    contract_version,
    audit_id,
    aggregate_id,
    from_state,
    to_state,
    origin,
    actor_id,
    actor_user_id,
    actor_role,
    exact_sha,
    operation_digest
  ) values (
    'testing-center.v1',
    v_audit_id,
    v_issue_id,
    v_from_state,
    v_to_state,
    'testing_center',
    v_actor_id,
    v_user_id,
    v_role,
    p_exact_sha,
    v_operation_digest
  );

  return query select
    v_validation_id,
    p_candidate_id,
    p_exact_sha,
    p_decision,
    v_to_state,
    false;
end
$_$;


--

-- Name: testing_center_validate_issue_destination(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_center_validate_issue_destination() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_effect public.testing_center_effect_outbox%rowtype;
begin
  select * into v_effect from public.testing_center_effect_outbox
  where effect_id = new.active_effect_id;
  if not found or v_effect.technical_issue_id <> new.technical_issue_id then
    raise exception 'testing_center_destination_effect_mismatch' using errcode = '23514';
  end if;
  if new.destination = 'linear'
    and (v_effect.effect_type <> 'linear_issue_create' or v_effect.state = 'superseded') then
    raise exception 'testing_center_destination_linear_invalid' using errcode = '23514';
  end if;
  if new.destination = 'github_legacy'
    and (v_effect.effect_type <> 'github_issue_create' or v_effect.state <> 'completed') then
    raise exception 'testing_center_destination_github_legacy_invalid' using errcode = '23514';
  end if;
  return new;
end $$;


--

-- Name: testing_contribution_review(uuid, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_contribution_review(p_id uuid, p_decision text, p_note text, p_proposal jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare reviewer uuid:=private.current_account(); target_account uuid;
begin
 if reviewer is null then raise exception 'testing_owner_required' using errcode='42501'; end if;
 if not private.is_owner(reviewer) then raise exception 'testing_owner_required' using errcode='42501'; end if;
 select account_id into target_account from public.testing_contributions where id=p_id;
 -- Collect actor and report owner before any assignment/contribution row lock.
 perform private.lock_accounts_before_rows(array[reviewer,target_account]);
 if target_account is distinct from (select account_id from public.testing_contributions where id=p_id) then
  raise exception 'testing_report_owner_changed' using errcode='40001';
 end if;
 -- Reuse the admin's UUID-before-assignment locks and shared owner authority.
 begin
  perform private.native_admin_require_owner(reviewer);
 exception when insufficient_privilege then
  raise exception 'testing_owner_required' using errcode='42501';
 end;
 if p_proposal is null then raise exception 'testing_review_invalid' using errcode='22023'; end if;
 perform private.testing_contribution_review_as(reviewer,p_id,p_decision,p_note,p_proposal);
end $$;


--

-- Name: testing_contribution_submit(uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_contribution_submit(p_id uuid, p_channel text, p_title text, p_body text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
 select private.testing_contribution_submit_for_account(private.current_account(),p_id,p_channel,p_title,p_body)
$$;


--

-- Name: testing_contribution_submit_admitted(uuid, uuid, text, text, text, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_contribution_submit_admitted(p_account uuid, p_id uuid, p_channel text, p_title text, p_body text, p_context jsonb, p_attachments jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if p_account is null then raise exception 'testing_auth_required' using errcode='42501'; end if;
  if p_title is distinct from '[contenido retirado por privacidad]'
    or p_body is distinct from '[contenido retirado por privacidad]' then
    raise exception 'testing_context_invalid' using errcode='22023'; end if;
  -- Reuse membership, selected-item consent, attachment SHA and retry validation.
  -- Its parent INSERT also passes #1610's account/row quotas atomically.
  perform private.testing_contribution_submit_v2_for_account(p_account,p_id,p_channel,p_title,p_body,p_context,p_attachments);
  -- Preserve follow-up/notice/credit semantics; never overwrite credit on retry.
  perform private.testing_report_submit_for_account(p_account,p_id,p_channel,p_title,p_body,true);
end $$;


--

-- Name: testing_contribution_submit_v2(uuid, text, text, text, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_contribution_submit_v2(p_id uuid, p_channel text, p_title text, p_body text, p_context jsonb, p_attachments jsonb) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
 select private.testing_contribution_submit_v2_for_account(private.current_account(),p_id,p_channel,p_title,p_body,p_context,p_attachments)
$$;


--

-- Name: testing_participation_current(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_participation_current(p_channel text) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
begin
  if private.current_account() is null or not public.testing_center_can_view_channel(p_channel) then
    raise exception 'testing_membership_required' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'questionnaires', coalesce((select jsonb_agg(to_jsonb(t)) from (
      select q.id, q.version, q.title, q.question, a.score, coalesce(a.note, '') as note
      from public.testing_questionnaires q left join public.testing_answers a
        on a.questionnaire_id = q.id and a.account_id = private.current_account()
      where q.channel = p_channel order by q.created_at desc, q.id limit 10
    ) t), '[]'::jsonb),
    'contributions', coalesce((select jsonb_agg(to_jsonb(t)) from (
      select id, title, body, state from public.testing_contributions
      where channel = p_channel order by created_at desc, id limit 20
    ) t), '[]'::jsonb)
  );
end $$;


--

-- Name: testing_participation_current_v2(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_participation_current_v2(p_channel text) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
begin
  if private.current_account() is null then raise exception 'testing_auth_required' using errcode='42501'; end if;
  return jsonb_build_object(
    'questionnaires',case when public.testing_center_can_view_channel(p_channel)
      then public.testing_participation_current(p_channel)->'questionnaires' else '[]'::jsonb end,
    'contributions',coalesce((select jsonb_agg(to_jsonb(t)) from (
      select c.id,c.title,''::text as body,c.state,coalesce(f.credit,false) as credit,
        coalesce(f.updated_at,c.created_at) as updated_at,f.fixed_version,
        c.state in ('accepted','fixed') and (f.notice_read_at is null or f.notice_read_at<f.updated_at) as notice
      from public.testing_contributions c left join public.testing_report_followup f on f.contribution_id=c.id
      where c.account_id=private.current_account()
      order by c.created_at desc,c.id limit 20) t),'[]'::jsonb));
end $$;


--

-- Name: testing_report_admit(text, text, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_report_admit(p_scope text, p_subject text, p_week date) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare d date:=(clock_timestamp() at time zone 'UTC')::date;
  w date:=date_trunc('week',clock_timestamp() at time zone 'UTC')::date;
  n integer; total bigint;
begin
  if current_setting('transaction_isolation')<>'read committed' then
    raise exception 'testing_report_read_committed_required' using errcode='25001'; end if;
  if p_week is distinct from w or p_scope is null or p_subject is null
    or p_scope not in ('ip','account')
    or (p_scope='ip' and p_subject !~ '^[0-9a-f]{64}$')
    or (p_scope='account' and p_subject !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
    raise exception 'testing_report_admission_invalid' using errcode='22023'; end if;
  delete from private.testing_report_attempts where day_start<d-8;
  perform pg_advisory_xact_lock(hashtextextended(p_scope||p_subject||w::text,1611));
  insert into private.testing_report_attempts(scope,subject,week_start,day_start,attempts)
    values(p_scope,p_subject,w,d,1)
    on conflict(scope,subject,week_start,day_start) do update
      set attempts=least(private.testing_report_attempts.attempts+1,
        case when p_scope='ip' then 61 else 21 end)
    returning attempts into n;
  if p_scope='ip' then return n<=60; end if;
  select sum(attempts) into total from private.testing_report_attempts
    where scope=p_scope and subject=p_subject and week_start=w;
  return n<=5 and total<=20;
end $_$;


--

-- Name: testing_report_admit_account(uuid, text, text, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_report_admit_account(p_account uuid, p_key text, p_digest text, p_week date) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_digest text;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'testing_report_read_committed_required' using errcode = '25001';
  end if;
  if p_account is null or p_key is null or length(p_key) not between 1 and 256
    or p_digest is null or p_digest !~ '^[0-9a-f]{64}$'
    or p_week is distinct from date_trunc('week', clock_timestamp() at time zone 'UTC')::date then
    raise exception 'testing_report_admission_invalid' using errcode = '22023';
  end if;

  -- Expire only this account's keys. A concurrent admission for another
  -- account must never delete its rows or cause an unrelated write conflict.
  delete from private.testing_report_admitted_keys
    where account_id = p_account
      and admitted_at < (((clock_timestamp() at time zone 'UTC')::date - 8)::timestamp at time zone 'UTC');

  -- Serialize same-key admission, including its quota increment. A changed body
  -- cannot borrow the first body's exemption, even from the same account.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_account::text || pg_catalog.chr(31) || p_key, 1896)
  );
  select body_digest into v_digest
    from private.testing_report_admitted_keys
    where account_id = p_account and report_key = p_key;
  if found then
    if v_digest <> p_digest then
      raise exception 'testing_report_retry_body_changed' using errcode = '23505';
    end if;
    return true;
  end if;

  if not public.testing_report_admit('account', p_account::text, p_week) then
    return false;
  end if;
  insert into private.testing_report_admitted_keys(account_id, report_key, body_digest)
    values (p_account, p_key, p_digest);
  return true;
end $_$;


--

-- Name: testing_report_credit(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_report_credit(p_id uuid, p_consent boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if private.current_account() is null or p_consent is null or not exists(select 1 from public.testing_contributions
    where id=p_id and account_id=private.current_account()) then raise exception 'testing_report_denied' using errcode='42501'; end if;
  insert into public.testing_report_followup(contribution_id,credit) values(p_id,p_consent)
    on conflict(contribution_id) do update set credit=p_consent;
end $$;


--

-- Name: testing_report_fixed(uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_report_fixed(p_id uuid, p_version text, p_reviewed_title text, p_reviewed_summary text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare c public.testing_contributions%rowtype;
begin
  if private.current_account() is null or public.testing_center_current_role() is distinct from 'owner' then
    raise exception 'testing_owner_required' using errcode='42501'; end if;
  select * into c from public.testing_contributions where id=p_id for update;
  if not found or c.state not in ('accepted','fixed') then raise exception 'testing_report_not_accepted' using errcode='55000'; end if;
  if p_version is null or p_reviewed_title is null or p_reviewed_summary is null then
    raise exception 'testing_report_review_required' using errcode='22023'; end if;
  if c.state='fixed' then
    if not exists(select 1 from public.testing_report_followup where contribution_id=p_id and fixed_version=p_version
      and reviewed_title=p_reviewed_title and reviewed_summary=p_reviewed_summary) then
      raise exception 'testing_report_fix_conflict' using errcode='23505'; end if;
    return;
  end if;
  insert into public.testing_report_followup(contribution_id,fixed_version,reviewed_title,reviewed_summary)
    values(p_id,p_version,p_reviewed_title,p_reviewed_summary) on conflict(contribution_id) do update
    set fixed_version=p_version,reviewed_title=p_reviewed_title,reviewed_summary=p_reviewed_summary;
  update public.testing_contributions set state='fixed' where id=p_id;
end $$;


--

-- Name: testing_report_notice_read(uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_report_notice_read(p_id uuid, p_updated_at timestamp with time zone) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if private.current_account() is null or not exists(select 1 from public.testing_contributions
    where id=p_id and account_id=private.current_account()) then raise exception 'testing_report_denied' using errcode='42501'; end if;
  -- A delayed acknowledgement cannot hide a newer accepted/fixed transition.
  update public.testing_report_followup set notice_read_at=updated_at
    where contribution_id=p_id and updated_at=p_updated_at;
end $$;


--

-- Name: testing_report_patch_candidates(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_report_patch_candidates(p_version text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if private.current_account() is null or public.testing_center_current_role() is distinct from 'owner' then
    raise exception 'testing_owner_required' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'summary',f.reviewed_summary,'credit',f.credit) order by c.id)
    from public.testing_contributions c join public.testing_report_followup f on f.contribution_id=c.id
    where c.state='fixed' and f.fixed_version=p_version),'[]'::jsonb);
end $$;


--

-- Name: testing_report_submit(uuid, text, text, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_report_submit(p_id uuid, p_channel text, p_title text, p_body text, p_consent boolean) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
 select private.testing_report_submit_for_account(private.current_account(),p_id,p_channel,p_title,p_body,p_consent)
$$;


--

-- Name: testing_report_submit_admitted(uuid, uuid, text, text, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_report_submit_admitted(p_account uuid, p_id uuid, p_channel text, p_title text, p_body text, p_consent boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if p_account is null then raise exception 'testing_auth_required' using errcode='42501'; end if;
  perform private.testing_report_submit_for_account(p_account,p_id,p_channel,p_title,p_body,p_consent);
end $$;


--

-- Name: testing_report_v2_submit_admitted(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.testing_report_v2_submit_admitted(p_account uuid, p_report jsonb) RETURNS TABLE(report_id uuid, report_state text, idempotent boolean, created_at timestamp with time zone)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select * from private.testing_report_v2_submit(p_account,p_report)
$$;


--

-- Name: report_creator_remainders; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.report_creator_remainders (
    environment text NOT NULL,
    product_id uuid NOT NULL,
    creator_discount_id uuid NOT NULL,
    duration_months integer NOT NULL,
    discount_id uuid NOT NULL,
    validated_at timestamp with time zone NOT NULL,
    CONSTRAINT report_creator_remainders_duration_months_check CHECK (((duration_months >= 1) AND (duration_months <= 120)))
);


--

-- Name: report_creator_terms; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.report_creator_terms (
    environment text NOT NULL,
    subscription_id text NOT NULL,
    account_id uuid NOT NULL,
    duration_months integer NOT NULL,
    started_at timestamp with time zone,
    ends_at timestamp with time zone,
    CONSTRAINT report_creator_terms_duration_months_check CHECK (((duration_months >= 1) AND (duration_months <= 120)))
);


--

-- Name: report_promotion_catalog; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.report_promotion_catalog (
    environment text NOT NULL,
    product_id text NOT NULL,
    plan text NOT NULL,
    normal_cents integer NOT NULL,
    launch_cents integer NOT NULL,
    launch_discount text NOT NULL,
    reward3_discount text NOT NULL,
    reward6_discount text NOT NULL,
    CONSTRAINT report_promotion_catalog_check CHECK ((((plan = 'pro'::text) AND (normal_cents = 599) AND (launch_cents = 399)) OR ((plan = 'pro_plus'::text) AND (normal_cents = 999) AND (launch_cents = 699)))),
    CONSTRAINT report_promotion_catalog_check1 CHECK (((launch_discount <> reward3_discount) AND (launch_discount <> reward6_discount) AND (reward3_discount <> reward6_discount))),
    CONSTRAINT report_promotion_catalog_environment_check CHECK ((environment = ANY (ARRAY['sandbox'::text, 'production'::text]))),
    CONSTRAINT report_promotion_catalog_plan_check CHECK ((plan = ANY (ARRAY['pro'::text, 'pro_plus'::text])))
);


--

-- Name: report_promotion_changes; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.report_promotion_changes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    environment text NOT NULL,
    discount_id text,
    subscription_id text NOT NULL,
    product_id text NOT NULL,
    kind text DEFAULT 'apply'::text NOT NULL,
    tier integer NOT NULL,
    actor text DEFAULT 'system:1593'::text NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    applied_at timestamp with time zone,
    superseded_at timestamp with time zone,
    repair_order_id text,
    phase text DEFAULT 'pending'::text NOT NULL,
    lease_token uuid,
    lease_until timestamp with time zone,
    renewal_token uuid,
    selected_discount text,
    revocation_pending_at timestamp with time zone,
    CONSTRAINT report_promotion_changes_actor_check CHECK ((actor = 'system:1593'::text)),
    CONSTRAINT report_promotion_changes_kind_check CHECK ((kind = ANY (ARRAY['apply'::text, 'cleanup'::text]))),
    CONSTRAINT report_promotion_changes_phase_check CHECK ((phase = ANY (ARRAY['pending'::text, 'cleared'::text]))),
    CONSTRAINT report_promotion_changes_tier_check CHECK ((tier = ANY (ARRAY[0, 3, 6])))
);


--

-- Name: report_promotion_creators; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.report_promotion_creators (
    environment text NOT NULL,
    product_id text NOT NULL,
    discount_id text NOT NULL,
    basis_points integer NOT NULL,
    duration_in_months integer NOT NULL,
    validated_at timestamp with time zone NOT NULL,
    CONSTRAINT report_promotion_creators_basis_points_check CHECK (((basis_points >= 1) AND (basis_points <= 10000))),
    CONSTRAINT report_promotion_creators_duration_in_months_check CHECK ((duration_in_months = 2))
);


--

-- Name: report_promotion_failures; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.report_promotion_failures (
    account_id uuid NOT NULL,
    environment text NOT NULL,
    code text NOT NULL,
    attempts integer DEFAULT 1 NOT NULL,
    first_at timestamp with time zone NOT NULL,
    last_at timestamp with time zone NOT NULL,
    resolved_at timestamp with time zone,
    CONSTRAINT report_promotion_failures_code_check CHECK ((code = ANY (ARRAY['polar_discount_unmanaged'::text, 'polar_discount_catalog_mismatch'::text, 'polar_discount_subscription_changed'::text, 'polar_discount_not_applied'::text, 'polar_discount_invalid_response'::text, 'polar_discount_http_failed'::text, 'promotion_account_failed'::text, 'promotion_not_authorized'::text, 'promotion_repair_lease_lost'::text, 'promotion_invoice_details_missing'::text, 'promotion_initial_invoice_missing'::text, 'promotion_checkout_recovered'::text, 'promotion_checkout_recovery_required'::text, 'promotion_checkout_plan_change_pending'::text, 'promotion_checkout_owner_mismatch'::text, 'creator_renewal_initial_pending'::text, 'creator_renewal_bridge_unconfigured'::text, 'creator_renewal_remainder_unconfigured'::text, 'creator_renewal_transfer_pending'::text, 'creator_renewal_plan_changed'::text]))),
    CONSTRAINT report_promotion_failures_environment_check CHECK ((environment = ANY (ARRAY['sandbox'::text, 'production'::text])))
);


--

-- Name: report_promotion_invoice_gaps; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.report_promotion_invoice_gaps (
    environment text NOT NULL,
    order_id text NOT NULL,
    account_id uuid NOT NULL,
    first_at timestamp with time zone NOT NULL,
    last_at timestamp with time zone NOT NULL,
    resolved_at timestamp with time zone
);


--

-- Name: report_promotion_invoices; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.report_promotion_invoices (
    environment text NOT NULL,
    order_id text NOT NULL,
    account_id uuid NOT NULL,
    subscription_id text NOT NULL,
    product_id text NOT NULL,
    discount_id text,
    discount_amount integer NOT NULL,
    is_initial boolean DEFAULT false NOT NULL,
    source text DEFAULT 'webhook'::text NOT NULL,
    reconciled_at timestamp with time zone,
    billed_at timestamp with time zone NOT NULL,
    period_start timestamp with time zone NOT NULL,
    period_end timestamp with time zone NOT NULL,
    CONSTRAINT report_promotion_invoices_check CHECK ((period_end > period_start)),
    CONSTRAINT report_promotion_invoices_discount_amount_check CHECK ((discount_amount >= 0)),
    CONSTRAINT report_promotion_invoices_source_check CHECK ((source = ANY (ARRAY['webhook'::text, 'reconciliation'::text])))
);


--

-- Name: report_promotion_launch_uses; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.report_promotion_launch_uses (
    account_id uuid NOT NULL,
    environment text NOT NULL,
    product_id text NOT NULL,
    attempt_id uuid,
    checkout_id text,
    remote_pending boolean DEFAULT false NOT NULL,
    subscription_id text,
    order_id text,
    reserved_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    CONSTRAINT report_promotion_launch_uses_environment_check CHECK ((environment = ANY (ARRAY['sandbox'::text, 'production'::text])))
);


--

-- Name: report_promotion_policy; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.report_promotion_policy (
    singleton boolean DEFAULT true NOT NULL,
    reward_valid_months integer NOT NULL,
    enrollment_enabled boolean DEFAULT false NOT NULL,
    enrollment_starts_at timestamp with time zone,
    enrollment_ends_at timestamp with time zone,
    CONSTRAINT report_enrollment_requires_window CHECK (((NOT enrollment_enabled) OR ((enrollment_starts_at IS NOT NULL) AND (enrollment_ends_at IS NOT NULL)))),
    CONSTRAINT report_enrollment_window_valid CHECK ((((enrollment_starts_at IS NULL) AND (enrollment_ends_at IS NULL)) OR ((enrollment_starts_at IS NOT NULL) AND (enrollment_ends_at IS NOT NULL) AND isfinite(enrollment_starts_at) AND isfinite(enrollment_ends_at) AND (enrollment_ends_at > enrollment_starts_at)))),
    CONSTRAINT report_promotion_policy_reward_valid_months_check CHECK (((reward_valid_months >= 1) AND (reward_valid_months <= 120))),
    CONSTRAINT report_promotion_policy_singleton_check CHECK (singleton)
);


--

-- Name: report_promotion_transfers; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.report_promotion_transfers (
    id bigint NOT NULL,
    account_id uuid NOT NULL,
    environment text NOT NULL,
    subscription_id text NOT NULL,
    product_id text NOT NULL,
    next_subscription_id text NOT NULL,
    next_product_id text NOT NULL,
    observed_at timestamp with time zone NOT NULL,
    cleanup_after timestamp with time zone NOT NULL,
    cleared_at timestamp with time zone,
    cleanup_reason text,
    CONSTRAINT report_promotion_transfers_cleanup_reason_check CHECK ((cleanup_reason = ANY (ARRAY['removed'::text, 'mirror_inactive'::text, 'remote_inactive'::text])))
);


--

-- Name: report_promotion_transfers_id_seq; Type: SEQUENCE; Schema: private; Owner: -
--

ALTER TABLE private.report_promotion_transfers ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME private.report_promotion_transfers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--

-- Name: report_promotions; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.report_promotions (
    account_id uuid NOT NULL,
    environment text NOT NULL,
    subscription_id text NOT NULL,
    original_subscription_id text NOT NULL,
    product_id text NOT NULL,
    subscribed_at timestamp with time zone NOT NULL,
    current_started_at timestamp with time zone NOT NULL,
    remote_period_end timestamp with time zone,
    first_renewal timestamp with time zone NOT NULL,
    observed_at timestamp with time zone NOT NULL,
    creator_discount text,
    remote_discount text,
    tier integer DEFAULT 0 NOT NULL,
    reward_granted_at timestamp with time zone,
    reward_expires_at timestamp with time zone,
    repaired_order_id text,
    reward_from timestamp with time zone,
    reward_until timestamp with time zone,
    forfeited boolean DEFAULT false NOT NULL,
    forfeited_at timestamp with time zone,
    first_refunded boolean DEFAULT false NOT NULL,
    applied_discount text,
    applied_candidate text,
    applied_at timestamp with time zone,
    CONSTRAINT report_promotions_tier_check CHECK ((tier = ANY (ARRAY[0, 3, 6])))
);


--

-- Name: report_renewal_candidates; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.report_renewal_candidates (
    environment text NOT NULL,
    subscription_id text NOT NULL,
    account_id uuid NOT NULL,
    discount_id uuid NOT NULL,
    savings_cents integer NOT NULL,
    valid_until timestamp with time zone NOT NULL,
    CONSTRAINT report_renewal_candidates_environment_check CHECK ((environment = ANY (ARRAY['sandbox'::text, 'production'::text]))),
    CONSTRAINT report_renewal_candidates_savings_cents_check CHECK ((savings_cents > 0))
);


--

-- Name: testing_report_admitted_keys; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.testing_report_admitted_keys (
    account_id uuid NOT NULL,
    report_key text NOT NULL,
    body_digest text NOT NULL,
    admitted_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT testing_report_admitted_keys_body_digest_check CHECK ((body_digest ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT testing_report_admitted_keys_report_key_check CHECK (((length(report_key) >= 1) AND (length(report_key) <= 256)))
);


--

-- Name: testing_report_attempts; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.testing_report_attempts (
    scope text NOT NULL,
    subject text NOT NULL,
    week_start date NOT NULL,
    day_start date NOT NULL,
    attempts integer NOT NULL,
    CONSTRAINT testing_report_attempts_attempts_check CHECK (((attempts >= 1) AND (attempts <= 61))),
    CONSTRAINT testing_report_attempts_scope_check CHECK ((scope = ANY (ARRAY['ip'::text, 'account'::text])))
);


--

-- Name: testing_report_v2_keys; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.testing_report_v2_keys (
    account_id uuid NOT NULL,
    idempotency_key text NOT NULL,
    payload_digest text NOT NULL,
    report_id uuid NOT NULL,
    CONSTRAINT testing_report_v2_keys_idempotency_key_check CHECK ((idempotency_key ~ '^draft_[0-9a-f]{64}$'::text)),
    CONSTRAINT testing_report_v2_keys_payload_digest_check CHECK ((payload_digest ~ '^[0-9a-f]{64}$'::text))
);

ALTER TABLE ONLY private.testing_report_v2_keys FORCE ROW LEVEL SECURITY;


--

-- Name: testing_answers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_answers (
    questionnaire_id uuid NOT NULL,
    account_id uuid NOT NULL,
    score smallint NOT NULL,
    note text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT testing_answers_note_check CHECK ((length(note) <= 1000)),
    CONSTRAINT testing_answers_score_check CHECK (((score >= 1) AND (score <= 5)))
);

ALTER TABLE ONLY public.testing_answers FORCE ROW LEVEL SECURITY;


--

-- Name: testing_center_agent_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_center_agent_audit (
    audit_id bigint NOT NULL,
    job_key text NOT NULL,
    execution_generation smallint NOT NULL,
    policy_version text NOT NULL,
    from_state text NOT NULL,
    to_state text NOT NULL,
    actor text NOT NULL,
    operation_digest text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT testing_center_agent_audit_actor_check CHECK ((actor ~ '^[a-z0-9][a-z0-9._-]{0,63}$'::text)),
    CONSTRAINT testing_center_agent_audit_digest_check CHECK ((operation_digest ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT testing_center_agent_audit_generation_check CHECK ((execution_generation = 1)),
    CONSTRAINT testing_center_agent_audit_policy_check CHECK ((policy_version = 'testing-center.autofix-policy.v2'::text)),
    CONSTRAINT testing_center_agent_audit_transition_check CHECK ((from_state <> to_state))
);

ALTER TABLE ONLY public.testing_center_agent_audit FORCE ROW LEVEL SECURITY;


--

-- Name: testing_center_agent_audit_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.testing_center_agent_audit ALTER COLUMN audit_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.testing_center_agent_audit_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--

-- Name: testing_center_agent_callbacks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_center_agent_callbacks (
    delivery_id text NOT NULL,
    job_key text NOT NULL,
    head_sha text NOT NULL,
    callback_kind text NOT NULL,
    outcome text NOT NULL,
    payload_digest text NOT NULL,
    disposition text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT testing_center_agent_callbacks_delivery_check CHECK (((delivery_id <> ''::text) AND (delivery_id !~ '^[[:space:]]|[[:space:]]$'::text) AND (octet_length(delivery_id) <= 256))),
    CONSTRAINT testing_center_agent_callbacks_disposition_check CHECK ((disposition = ANY (ARRAY['applied'::text, 'needs_owner'::text]))),
    CONSTRAINT testing_center_agent_callbacks_kind_check CHECK ((callback_kind = ANY (ARRAY['triage'::text, 'fix'::text]))),
    CONSTRAINT testing_center_agent_callbacks_outcome_check CHECK ((outcome = ANY (ARRAY['eligible'::text, 'duplicate'::text, 'needs_info'::text, 'ineligible'::text, 'accepted'::text, 'ambiguous'::text]))),
    CONSTRAINT testing_center_agent_callbacks_pair_check CHECK ((((callback_kind = 'triage'::text) AND (outcome = ANY (ARRAY['eligible'::text, 'duplicate'::text, 'needs_info'::text, 'ineligible'::text, 'ambiguous'::text]))) OR ((callback_kind = 'fix'::text) AND (outcome = ANY (ARRAY['accepted'::text, 'ambiguous'::text]))))),
    CONSTRAINT testing_center_agent_callbacks_payload_check CHECK ((payload_digest ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT testing_center_agent_callbacks_sha_check CHECK ((head_sha ~ '^[0-9a-f]{40}$'::text))
);

ALTER TABLE ONLY public.testing_center_agent_callbacks FORCE ROW LEVEL SECURITY;


--

-- Name: testing_center_agent_effect_outbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_center_agent_effect_outbox (
    effect_id text NOT NULL,
    job_key text NOT NULL,
    effect_kind text NOT NULL,
    effect_target text NOT NULL,
    effect_generation smallint NOT NULL,
    payload_digest text NOT NULL,
    state text DEFAULT 'queued'::text NOT NULL,
    lease_owner text,
    lease_expires_at timestamp with time zone,
    fencing_token bigint DEFAULT 0 NOT NULL,
    dispatch_reserved boolean DEFAULT false NOT NULL,
    outcome_digest text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT testing_center_agent_effects_fence_check CHECK ((fencing_token >= 0)),
    CONSTRAINT testing_center_agent_effects_generation_check CHECK ((effect_generation = 1)),
    CONSTRAINT testing_center_agent_effects_id_check CHECK (((effect_id <> ''::text) AND (effect_id !~ '^[[:space:]]|[[:space:]]$'::text) AND (octet_length(effect_id) <= 160))),
    CONSTRAINT testing_center_agent_effects_kind_check CHECK ((effect_kind = ANY (ARRAY['github_dispatch'::text, 'supabase_callback'::text, 'nightly_release_reservation'::text, 'revert_pr'::text]))),
    CONSTRAINT testing_center_agent_effects_lease_check CHECK ((((state = ANY (ARRAY['claimed'::text, 'reserved'::text])) AND (lease_owner ~ '^[a-z0-9][a-z0-9._-]{0,63}$'::text) AND (lease_expires_at IS NOT NULL)) OR ((state = ANY (ARRAY['queued'::text, 'completed'::text, 'needs_owner'::text])) AND (lease_owner IS NULL) AND (lease_expires_at IS NULL)))),
    CONSTRAINT testing_center_agent_effects_outcome_check CHECK (((outcome_digest IS NULL) OR (outcome_digest ~ '^[0-9a-f]{64}$'::text))),
    CONSTRAINT testing_center_agent_effects_pair_check CHECK ((((effect_kind = 'github_dispatch'::text) AND (effect_target = ANY (ARRAY['triage'::text, 'fix'::text]))) OR ((effect_kind = 'supabase_callback'::text) AND (effect_target = 'callback'::text)) OR ((effect_kind = 'nightly_release_reservation'::text) AND (effect_target = 'release'::text)) OR ((effect_kind = 'revert_pr'::text) AND (effect_target = 'revert'::text)))),
    CONSTRAINT testing_center_agent_effects_payload_check CHECK ((payload_digest ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT testing_center_agent_effects_reservation_check CHECK ((((state = ANY (ARRAY['reserved'::text, 'completed'::text, 'needs_owner'::text])) AND dispatch_reserved) OR ((state = ANY (ARRAY['queued'::text, 'claimed'::text])) AND (NOT dispatch_reserved)))),
    CONSTRAINT testing_center_agent_effects_state_check CHECK ((state = ANY (ARRAY['queued'::text, 'claimed'::text, 'reserved'::text, 'completed'::text, 'needs_owner'::text]))),
    CONSTRAINT testing_center_agent_effects_target_check CHECK ((effect_target = ANY (ARRAY['triage'::text, 'fix'::text, 'callback'::text, 'release'::text, 'revert'::text])))
);

ALTER TABLE ONLY public.testing_center_agent_effect_outbox FORCE ROW LEVEL SECURITY;


--

-- Name: testing_center_agent_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_center_agent_jobs (
    job_key text NOT NULL,
    technical_issue_id text NOT NULL,
    execution_generation smallint NOT NULL,
    policy_version text NOT NULL,
    report_digest text NOT NULL,
    dossier_digest text NOT NULL,
    nightly_base_sha text NOT NULL,
    state text NOT NULL,
    triage_dispatch_count smallint DEFAULT 0 NOT NULL,
    fix_dispatch_count smallint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    candidate_head_sha text,
    merge_sha text,
    CONSTRAINT testing_center_agent_jobs_base_sha_check CHECK ((nightly_base_sha ~ '^[0-9a-f]{40}$'::text)),
    CONSTRAINT testing_center_agent_jobs_candidate_sha_check CHECK (((candidate_head_sha IS NULL) OR (candidate_head_sha ~ '^[0-9a-f]{40}$'::text))),
    CONSTRAINT testing_center_agent_jobs_canonical_key_check CHECK ((job_key = public.testing_center_agent_job_key(technical_issue_id, report_digest, nightly_base_sha, policy_version))),
    CONSTRAINT testing_center_agent_jobs_dossier_digest_check CHECK ((dossier_digest ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT testing_center_agent_jobs_fix_count_check CHECK (((fix_dispatch_count >= 0) AND (fix_dispatch_count <= 1))),
    CONSTRAINT testing_center_agent_jobs_generation_check CHECK ((execution_generation = 1)),
    CONSTRAINT testing_center_agent_jobs_key_check CHECK ((job_key ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT testing_center_agent_jobs_merge_sha_check CHECK (((merge_sha IS NULL) OR (merge_sha ~ '^[0-9a-f]{40}$'::text))),
    CONSTRAINT testing_center_agent_jobs_policy_check CHECK ((policy_version = 'testing-center.autofix-policy.v2'::text)),
    CONSTRAINT testing_center_agent_jobs_report_digest_check CHECK ((report_digest ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT testing_center_agent_jobs_state_check CHECK ((state = ANY (ARRAY['triage_queued'::text, 'triaged'::text, 'duplicate'::text, 'needs_info'::text, 'ineligible'::text, 'eligible'::text, 'red_running'::text, 'red_verified'::text, 'green_running'::text, 'diff_verified'::text, 'review_approved'::text, 'ci_running'::text, 'merge_queued'::text, 'merged_nightly'::text, 'smoke_running'::text, 'nightly_tagged'::text, 'completed'::text, 'smoke_failed'::text, 'revert_pr_open'::text, 'reverted'::text, 'needs_owner'::text, 'stopped'::text]))),
    CONSTRAINT testing_center_agent_jobs_triage_count_check CHECK (((triage_dispatch_count >= 0) AND (triage_dispatch_count <= 1)))
);

ALTER TABLE ONLY public.testing_center_agent_jobs FORCE ROW LEVEL SECURITY;


--

-- Name: testing_center_agent_phase_callbacks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_center_agent_phase_callbacks (
    delivery_id text NOT NULL,
    job_key text NOT NULL,
    head_sha text NOT NULL,
    reviewed_head_sha text,
    release_tag text,
    phase text NOT NULL,
    payload_digest text NOT NULL,
    fencing_token bigint NOT NULL,
    run_id bigint NOT NULL,
    disposition text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT testing_center_agent_phase_callbacks_delivery_check CHECK (((delivery_id <> ''::text) AND (delivery_id !~ '^[[:space:]]|[[:space:]]$'::text) AND (octet_length(delivery_id) <= 256))),
    CONSTRAINT testing_center_agent_phase_callbacks_digest_check CHECK ((payload_digest ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT testing_center_agent_phase_callbacks_disposition_check CHECK ((disposition = ANY (ARRAY['applied'::text, 'needs_owner'::text]))),
    CONSTRAINT testing_center_agent_phase_callbacks_fence_check CHECK ((fencing_token > 0)),
    CONSTRAINT testing_center_agent_phase_callbacks_head_check CHECK ((head_sha ~ '^[0-9a-f]{40}$'::text)),
    CONSTRAINT testing_center_agent_phase_callbacks_phase_check CHECK ((phase = ANY (ARRAY['red_verified'::text, 'green_running'::text, 'diff_verified'::text, 'review_approved'::text, 'ci_running'::text, 'merge_queued'::text, 'merged_nightly'::text, 'smoke_running'::text, 'nightly_tagged'::text, 'completed'::text, 'smoke_failed'::text, 'revert_pr_open'::text, 'reverted'::text, 'closeout_failed'::text]))),
    CONSTRAINT testing_center_agent_phase_callbacks_release_tag_check CHECK (((release_tag IS NULL) OR (release_tag ~ '^v[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+-nightly\.[1-9][0-9]*$'::text))),
    CONSTRAINT testing_center_agent_phase_callbacks_reviewed_check CHECK (((reviewed_head_sha IS NULL) OR (reviewed_head_sha ~ '^[0-9a-f]{40}$'::text))),
    CONSTRAINT testing_center_agent_phase_callbacks_run_check CHECK ((run_id > 0))
);

ALTER TABLE ONLY public.testing_center_agent_phase_callbacks FORCE ROW LEVEL SECURITY;


--

-- Name: testing_center_agent_reservations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_center_agent_reservations (
    reservation_key text NOT NULL,
    job_key text NOT NULL,
    reservation_kind text NOT NULL,
    binding_digest text NOT NULL,
    state text DEFAULT 'reserved'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_head_sha text,
    merge_sha text,
    closeout_fencing_token bigint DEFAULT 0 NOT NULL,
    closeout_run_id bigint,
    CONSTRAINT testing_center_agent_reservations_digest_check CHECK ((binding_digest ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT testing_center_agent_reservations_fence_check CHECK ((closeout_fencing_token >= 0)),
    CONSTRAINT testing_center_agent_reservations_key_check CHECK (((reservation_key <> ''::text) AND (reservation_key !~ '^[[:space:]]|[[:space:]]$'::text) AND (octet_length(reservation_key) <= 256))),
    CONSTRAINT testing_center_agent_reservations_kind_check CHECK ((reservation_kind = ANY (ARRAY['branch'::text, 'pull_request'::text, 'nightly_release'::text]))),
    CONSTRAINT testing_center_agent_reservations_merge_sha_check CHECK (((merge_sha IS NULL) OR (merge_sha ~ '^[0-9a-f]{40}$'::text))),
    CONSTRAINT testing_center_agent_reservations_reviewed_sha_check CHECK (((reviewed_head_sha IS NULL) OR (reviewed_head_sha ~ '^[0-9a-f]{40}$'::text))),
    CONSTRAINT testing_center_agent_reservations_run_check CHECK (((closeout_run_id IS NULL) OR (closeout_run_id > 0))),
    CONSTRAINT testing_center_agent_reservations_state_check CHECK ((state = ANY (ARRAY['reserved'::text, 'confirmed'::text, 'annulled'::text, 'needs_owner'::text])))
);

ALTER TABLE ONLY public.testing_center_agent_reservations FORCE ROW LEVEL SECURITY;


--

-- Name: testing_center_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_center_audit (
    contract_version text DEFAULT 'testing-center.v1'::text NOT NULL,
    audit_id text NOT NULL,
    aggregate_id text NOT NULL,
    from_state text NOT NULL,
    to_state text NOT NULL,
    origin text NOT NULL,
    actor_id text NOT NULL,
    actor_user_id uuid,
    actor_role text,
    exact_sha text,
    operation_digest text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT testing_center_audit_actor_check CHECK (((actor_id <> ''::text) AND (actor_id !~ '^[[:space:]]|[[:space:]]$'::text) AND (octet_length(actor_id) <= 256))),
    CONSTRAINT testing_center_audit_actor_origin_check CHECK ((((origin = 'testing_center'::text) AND (actor_user_id IS NOT NULL) AND (actor_role IS NOT NULL)) OR ((origin = ANY (ARRAY['orchestrator'::text, 'codex'::text, 'github_actions'::text])) AND (actor_user_id IS NULL) AND (actor_role IS NULL)))),
    CONSTRAINT testing_center_audit_aggregate_check CHECK (((aggregate_id <> ''::text) AND (aggregate_id !~ '^[[:space:]]|[[:space:]]$'::text) AND (octet_length(aggregate_id) <= 256))),
    CONSTRAINT testing_center_audit_digest_check CHECK ((operation_digest ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT testing_center_audit_id_check CHECK (((audit_id <> ''::text) AND (audit_id !~ '^[[:space:]]|[[:space:]]$'::text) AND (octet_length(audit_id) <= 256))),
    CONSTRAINT testing_center_audit_origin_check CHECK ((origin = ANY (ARRAY['testing_center'::text, 'orchestrator'::text, 'codex'::text, 'github_actions'::text]))),
    CONSTRAINT testing_center_audit_role_check CHECK (((actor_role IS NULL) OR (actor_role = ANY (ARRAY['tester'::text, 'primary_tester'::text, 'owner'::text])))),
    CONSTRAINT testing_center_audit_sha_check CHECK (((exact_sha IS NULL) OR (exact_sha ~ '^(?:[0-9a-f]{40}|[0-9a-f]{64})$'::text))),
    CONSTRAINT testing_center_audit_states_check CHECK (((from_state = ANY (ARRAY['reported'::text, 'needs_info'::text, 'queued'::text, 'codex_working'::text, 'owner_review'::text, 'nightly_candidate'::text, 'nightly_accepted'::text, 'nightly_rejected'::text, 'testers_candidate'::text, 'testers_accepted'::text, 'testers_rejected'::text, 'master_review'::text, 'released'::text, 'needs_owner'::text, 'stopped'::text])) AND (to_state = ANY (ARRAY['reported'::text, 'needs_info'::text, 'queued'::text, 'codex_working'::text, 'owner_review'::text, 'nightly_candidate'::text, 'nightly_accepted'::text, 'nightly_rejected'::text, 'testers_candidate'::text, 'testers_accepted'::text, 'testers_rejected'::text, 'master_review'::text, 'released'::text, 'needs_owner'::text, 'stopped'::text])) AND (from_state <> to_state))),
    CONSTRAINT testing_center_audit_version_check CHECK ((contract_version = 'testing-center.v1'::text))
);

ALTER TABLE ONLY public.testing_center_audit FORCE ROW LEVEL SECURITY;


--

-- Name: testing_center_build_identities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_center_build_identities (
    build_identity_id text NOT NULL,
    channel text NOT NULL,
    app_version text NOT NULL,
    candidate_sha text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    registered_by_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT testing_center_build_identities_app_version_check CHECK ((app_version ~ '^[A-Za-z0-9][A-Za-z0-9._+-]{0,31}$'::text)),
    CONSTRAINT testing_center_build_identities_build_identity_id_check CHECK ((build_identity_id ~ '^build_[0-9a-f]{64}$'::text)),
    CONSTRAINT testing_center_build_identities_candidate_sha_check CHECK ((candidate_sha ~ '^[0-9a-f]{40}$'::text)),
    CONSTRAINT testing_center_build_identities_channel_check CHECK ((channel = ANY (ARRAY['nightly'::text, 'testers'::text]))),
    CONSTRAINT testing_center_build_identities_registered_by_id_check CHECK (((registered_by_id <> ''::text) AND (registered_by_id !~ '^[[:space:]]|[[:space:]]$'::text) AND (octet_length(registered_by_id) <= 128)))
);

ALTER TABLE ONLY public.testing_center_build_identities FORCE ROW LEVEL SECURITY;


--

-- Name: testing_center_candidate_builds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_center_candidate_builds (
    contract_version text DEFAULT 'testing-center.v1'::text NOT NULL,
    candidate_id text NOT NULL,
    technical_issue_id text NOT NULL,
    channel text NOT NULL,
    build_version text NOT NULL,
    exact_sha text NOT NULL,
    author_id text NOT NULL,
    author_origin text DEFAULT 'codex'::text NOT NULL,
    state text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT testing_center_candidates_author_check CHECK (((author_id <> ''::text) AND (author_id !~ '^[[:space:]]|[[:space:]]$'::text) AND (octet_length(author_id) <= 256))),
    CONSTRAINT testing_center_candidates_build_check CHECK (((build_version <> ''::text) AND (build_version !~ '^[[:space:]]|[[:space:]]$'::text) AND (octet_length(build_version) <= 256))),
    CONSTRAINT testing_center_candidates_channel_check CHECK ((channel = ANY (ARRAY['nightly'::text, 'testers'::text]))),
    CONSTRAINT testing_center_candidates_id_check CHECK (((candidate_id <> ''::text) AND (candidate_id !~ '^[[:space:]]|[[:space:]]$'::text) AND (octet_length(candidate_id) <= 256))),
    CONSTRAINT testing_center_candidates_origin_check CHECK ((author_origin = 'codex'::text)),
    CONSTRAINT testing_center_candidates_sha_check CHECK ((exact_sha ~ '^(?:[0-9a-f]{40}|[0-9a-f]{64})$'::text)),
    CONSTRAINT testing_center_candidates_state_check CHECK ((state = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'stale'::text]))),
    CONSTRAINT testing_center_candidates_version_check CHECK ((contract_version = 'testing-center.v1'::text))
);

ALTER TABLE ONLY public.testing_center_candidate_builds FORCE ROW LEVEL SECURITY;


--

-- Name: testing_center_codex_dossier_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_center_codex_dossier_snapshots (
    dossier_digest text NOT NULL,
    transport_digest text NOT NULL,
    dossier_idempotency_key text NOT NULL,
    rejection_validation_id text NOT NULL,
    technical_issue_id text NOT NULL,
    candidate_id text NOT NULL,
    channel text NOT NULL,
    candidate_sha text NOT NULL,
    correction_issue_id text NOT NULL,
    target_branch text NOT NULL,
    nightly_sha text NOT NULL,
    status text NOT NULL,
    canonical_dossier jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT testing_center_codex_dossier_snap_dossier_idempotency_key_check CHECK (((dossier_idempotency_key <> ''::text) AND (octet_length(dossier_idempotency_key) <= 512))),
    CONSTRAINT testing_center_codex_dossier_snapshot_correction_issue_id_check CHECK ((correction_issue_id ~ '^issue_[0-9a-f]{64}$'::text)),
    CONSTRAINT testing_center_codex_dossier_snapshots_candidate_sha_check CHECK ((candidate_sha ~ '^[0-9a-f]{40}$'::text)),
    CONSTRAINT testing_center_codex_dossier_snapshots_channel_check CHECK ((channel = ANY (ARRAY['nightly'::text, 'testers'::text]))),
    CONSTRAINT testing_center_codex_dossier_snapshots_dossier_digest_check CHECK ((dossier_digest ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT testing_center_codex_dossier_snapshots_nightly_sha_check CHECK ((nightly_sha ~ '^[0-9a-f]{40}$'::text)),
    CONSTRAINT testing_center_codex_dossier_snapshots_status_check CHECK ((status = ANY (ARRAY['complete'::text, 'incomplete'::text]))),
    CONSTRAINT testing_center_codex_dossier_snapshots_target_branch_check CHECK ((target_branch ~ '^vantareapp/isa-[0-9]+-[a-z0-9-]{1,60}$'::text)),
    CONSTRAINT testing_center_codex_dossier_snapshots_transport_digest_check CHECK ((transport_digest ~ '^[0-9a-f]{64}$'::text))
);

ALTER TABLE ONLY public.testing_center_codex_dossier_snapshots FORCE ROW LEVEL SECURITY;


--

-- Name: testing_center_codex_execution_control; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_center_codex_execution_control (
    technical_issue_id text NOT NULL,
    run_id text NOT NULL,
    request_digest text NOT NULL,
    evidence_digest text NOT NULL,
    analysis_base_sha text NOT NULL,
    nightly_head_sha text NOT NULL,
    ancestry_proof_digest text NOT NULL,
    state text DEFAULT 'queued'::text NOT NULL,
    dispatch_count smallint DEFAULT 0 NOT NULL,
    lease_owner text,
    lease_expires_at timestamp with time zone,
    fencing_token bigint DEFAULT 0 NOT NULL,
    outcome_code text,
    response_digest text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT testing_center_codex_control_base_check CHECK ((analysis_base_sha ~ '^[0-9a-f]{40}$'::text)),
    CONSTRAINT testing_center_codex_control_dispatch_count_check CHECK (((dispatch_count >= 0) AND (dispatch_count <= 1))),
    CONSTRAINT testing_center_codex_control_evidence_check CHECK ((evidence_digest ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT testing_center_codex_control_fencing_check CHECK ((fencing_token >= 0)),
    CONSTRAINT testing_center_codex_control_head_check CHECK ((nightly_head_sha ~ '^[0-9a-f]{40}$'::text)),
    CONSTRAINT testing_center_codex_control_lease_check CHECK ((((state = ANY (ARRAY['claimed'::text, 'dispatching'::text])) AND (lease_owner IS NOT NULL) AND (lease_owner ~ '^[a-z0-9][a-z0-9._-]{0,63}$'::text) AND (lease_expires_at IS NOT NULL)) OR ((state <> ALL (ARRAY['claimed'::text, 'dispatching'::text])) AND (lease_owner IS NULL) AND (lease_expires_at IS NULL)))),
    CONSTRAINT testing_center_codex_control_outcome_check CHECK (((outcome_code IS NULL) OR (outcome_code = ANY (ARRAY['proposed'::text, 'needs_owner'::text, 'not_reproduced'::text, 'ambiguous_response'::text, 'pre_dispatch_failure'::text])))),
    CONSTRAINT testing_center_codex_control_proof_check CHECK ((ancestry_proof_digest ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT testing_center_codex_control_request_check CHECK ((request_digest ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT testing_center_codex_control_response_check CHECK (((response_digest IS NULL) OR (response_digest ~ '^[0-9a-f]{64}$'::text))),
    CONSTRAINT testing_center_codex_control_state_check CHECK ((state = ANY (ARRAY['queued'::text, 'claimed'::text, 'dispatching'::text, 'completed'::text, 'failed'::text, 'needs_owner'::text]))),
    CONSTRAINT testing_center_codex_control_terminal_check CHECK ((((state = ANY (ARRAY['queued'::text, 'claimed'::text])) AND (dispatch_count = 0) AND (outcome_code IS NULL) AND (response_digest IS NULL)) OR ((state = 'dispatching'::text) AND (dispatch_count = 1) AND (outcome_code IS NULL) AND (response_digest IS NULL)) OR ((state = 'completed'::text) AND (dispatch_count = 1) AND (outcome_code = ANY (ARRAY['proposed'::text, 'needs_owner'::text, 'not_reproduced'::text])) AND (response_digest IS NOT NULL)) OR ((state = 'needs_owner'::text) AND (dispatch_count = 1) AND (outcome_code = 'ambiguous_response'::text) AND (response_digest IS NULL)) OR ((state = 'failed'::text) AND (dispatch_count = 0) AND (outcome_code = 'pre_dispatch_failure'::text) AND (response_digest IS NULL))))
);

ALTER TABLE ONLY public.testing_center_codex_execution_control FORCE ROW LEVEL SECURITY;


--

-- Name: testing_center_codex_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_center_codex_runs (
    contract_version text DEFAULT 'testing-center.v1'::text NOT NULL,
    run_id text NOT NULL,
    technical_issue_id text NOT NULL,
    attempt smallint NOT NULL,
    state text NOT NULL,
    origin text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT testing_center_codex_runs_attempt_check CHECK (((attempt >= 1) AND (attempt <= 2))),
    CONSTRAINT testing_center_codex_runs_id_check CHECK (((run_id <> ''::text) AND (run_id !~ '^[[:space:]]|[[:space:]]$'::text) AND (octet_length(run_id) <= 256))),
    CONSTRAINT testing_center_codex_runs_origin_check CHECK ((origin = ANY (ARRAY['orchestrator'::text, 'codex'::text, 'github_actions'::text]))),
    CONSTRAINT testing_center_codex_runs_state_check CHECK ((state = ANY (ARRAY['queued'::text, 'running'::text, 'pr_open'::text, 'failed'::text, 'completed'::text, 'needs_owner'::text]))),
    CONSTRAINT testing_center_codex_runs_version_check CHECK ((contract_version = 'testing-center.v1'::text))
);

ALTER TABLE ONLY public.testing_center_codex_runs FORCE ROW LEVEL SECURITY;


--

-- Name: testing_center_effect_outbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_center_effect_outbox (
    effect_id text NOT NULL,
    effect_key text NOT NULL,
    effect_type text DEFAULT 'github_issue_create'::text NOT NULL,
    technical_issue_id text NOT NULL,
    primary_report_id text NOT NULL,
    state text DEFAULT 'pending'::text NOT NULL,
    attempt_count smallint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    lease_token uuid,
    lease_expires_at timestamp with time zone,
    next_attempt_at timestamp with time zone,
    last_error_code text,
    external_issue_number bigint,
    external_issue_node_id text,
    lease_owner text,
    fencing_token bigint DEFAULT 0 NOT NULL,
    CONSTRAINT testing_center_effect_outbox_attempt_check CHECK (((attempt_count >= 0) AND (attempt_count <= 5))),
    CONSTRAINT testing_center_effect_outbox_error_check CHECK (((last_error_code IS NULL) OR (last_error_code ~ '^[a-z0-9_]{1,64}$'::text))),
    CONSTRAINT testing_center_effect_outbox_external_shape_check CHECK ((((state = 'completed'::text) AND (effect_type = 'github_issue_create'::text) AND (external_issue_number > 0) AND (external_issue_node_id IS NOT NULL)) OR ((state = 'completed'::text) AND (effect_type = 'linear_issue_create'::text) AND (external_issue_number IS NULL) AND (external_issue_node_id IS NULL)) OR ((state <> 'completed'::text) AND (external_issue_number IS NULL) AND (external_issue_node_id IS NULL)))),
    CONSTRAINT testing_center_effect_outbox_fencing_check CHECK ((fencing_token >= 0)),
    CONSTRAINT testing_center_effect_outbox_id_check CHECK ((effect_id ~ '^effect_[0-9a-f]{64}$'::text)),
    CONSTRAINT testing_center_effect_outbox_key_check CHECK ((effect_key ~ '^(github|linear)_issue_create:[a-z0-9_]{1,255}$'::text)),
    CONSTRAINT testing_center_effect_outbox_lease_owner_check CHECK ((((state = 'claimed'::text) AND (lease_owner IS NOT NULL) AND (lease_owner <> ''::text) AND (lease_owner !~ '^[[:space:]]|[[:space:]]$'::text) AND (octet_length(lease_owner) <= 128)) OR ((state <> 'claimed'::text) AND (lease_owner IS NULL)))),
    CONSTRAINT testing_center_effect_outbox_lease_shape_check CHECK ((((state = 'claimed'::text) AND (lease_token IS NOT NULL) AND (lease_expires_at IS NOT NULL)) OR ((state <> 'claimed'::text) AND (lease_token IS NULL) AND (lease_expires_at IS NULL)))),
    CONSTRAINT testing_center_effect_outbox_node_check CHECK (((external_issue_node_id IS NULL) OR ((octet_length(external_issue_node_id) >= 1) AND (octet_length(external_issue_node_id) <= 256)))),
    CONSTRAINT testing_center_effect_outbox_pending_shape_check CHECK (((state <> 'pending'::text) OR (attempt_count = 0))),
    CONSTRAINT testing_center_effect_outbox_state_check CHECK ((state = ANY (ARRAY['pending'::text, 'claimed'::text, 'completed'::text, 'failed'::text, 'superseded'::text, 'dry_run_completed'::text, 'needs_owner'::text]))),
    CONSTRAINT testing_center_effect_outbox_type_check CHECK ((effect_type = ANY (ARRAY['github_issue_create'::text, 'linear_issue_create'::text])))
);

ALTER TABLE ONLY public.testing_center_effect_outbox FORCE ROW LEVEL SECURITY;


--

-- Name: testing_center_effect_supersessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_center_effect_supersessions (
    legacy_effect_id text NOT NULL,
    superseded_by_effect_id text NOT NULL,
    prior_state text NOT NULL,
    prior_attempt_count smallint NOT NULL,
    prior_last_error_code text,
    prior_next_attempt_at timestamp with time zone,
    prior_lease_token uuid,
    prior_lease_expires_at timestamp with time zone,
    prior_updated_at timestamp with time zone NOT NULL,
    superseded_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT testing_center_effect_supersessions_prior_state_check CHECK ((prior_state = ANY (ARRAY['pending'::text, 'failed'::text])))
);

ALTER TABLE ONLY public.testing_center_effect_supersessions FORCE ROW LEVEL SECURITY;


--

-- Name: testing_center_github_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_center_github_deliveries (
    delivery_id text NOT NULL,
    event_name text NOT NULL,
    action text NOT NULL,
    payload_digest text NOT NULL,
    external_issue_number bigint NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT testing_center_github_deliveries_action_check CHECK ((action = ANY (ARRAY['opened'::text, 'edited'::text, 'closed'::text, 'reopened'::text]))),
    CONSTRAINT testing_center_github_deliveries_digest_check CHECK ((payload_digest ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT testing_center_github_deliveries_event_check CHECK ((event_name = 'issues'::text)),
    CONSTRAINT testing_center_github_deliveries_external_issue_number_check CHECK ((external_issue_number > 0)),
    CONSTRAINT testing_center_github_deliveries_id_check CHECK ((delivery_id ~ '^[A-Za-z0-9_-]{1,128}$'::text))
);

ALTER TABLE ONLY public.testing_center_github_deliveries FORCE ROW LEVEL SECURITY;


--

-- Name: testing_center_idempotency; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_center_idempotency (
    contract_version text DEFAULT 'testing-center.v1'::text NOT NULL,
    idempotency_key text NOT NULL,
    payload_digest text NOT NULL,
    aggregate_id text NOT NULL,
    from_state text NOT NULL,
    to_state text NOT NULL,
    exact_sha text,
    origin text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT testing_center_idempotency_aggregate_check CHECK (((aggregate_id <> ''::text) AND (aggregate_id !~ '^[[:space:]]|[[:space:]]$'::text) AND (octet_length(aggregate_id) <= 256))),
    CONSTRAINT testing_center_idempotency_digest_check CHECK ((payload_digest ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT testing_center_idempotency_key_check CHECK (((idempotency_key <> ''::text) AND (idempotency_key !~ '^[[:space:]]|[[:space:]]$'::text) AND (octet_length(idempotency_key) <= 256))),
    CONSTRAINT testing_center_idempotency_origin_check CHECK ((origin = ANY (ARRAY['testing_center'::text, 'orchestrator'::text, 'codex'::text, 'github_actions'::text]))),
    CONSTRAINT testing_center_idempotency_sha_check CHECK (((exact_sha IS NULL) OR (exact_sha ~ '^(?:[0-9a-f]{40}|[0-9a-f]{64})$'::text))),
    CONSTRAINT testing_center_idempotency_sha_requirement_check CHECK (((to_state = ANY (ARRAY['stopped'::text, 'needs_owner'::text])) OR ((from_state <> ALL (ARRAY['owner_review'::text, 'nightly_candidate'::text, 'nightly_accepted'::text, 'nightly_rejected'::text, 'testers_candidate'::text, 'testers_accepted'::text, 'testers_rejected'::text, 'master_review'::text])) AND (to_state <> 'nightly_candidate'::text)) OR (exact_sha IS NOT NULL))),
    CONSTRAINT testing_center_idempotency_states_check CHECK (((from_state = ANY (ARRAY['reported'::text, 'needs_info'::text, 'queued'::text, 'codex_working'::text, 'owner_review'::text, 'nightly_candidate'::text, 'nightly_accepted'::text, 'nightly_rejected'::text, 'testers_candidate'::text, 'testers_accepted'::text, 'testers_rejected'::text, 'master_review'::text, 'released'::text, 'needs_owner'::text, 'stopped'::text])) AND (to_state = ANY (ARRAY['reported'::text, 'needs_info'::text, 'queued'::text, 'codex_working'::text, 'owner_review'::text, 'nightly_candidate'::text, 'nightly_accepted'::text, 'nightly_rejected'::text, 'testers_candidate'::text, 'testers_accepted'::text, 'testers_rejected'::text, 'master_review'::text, 'released'::text, 'needs_owner'::text, 'stopped'::text])) AND (from_state <> to_state))),
    CONSTRAINT testing_center_idempotency_version_check CHECK ((contract_version = 'testing-center.v1'::text))
);

ALTER TABLE ONLY public.testing_center_idempotency FORCE ROW LEVEL SECURITY;


--

-- Name: testing_center_issue_destinations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_center_issue_destinations (
    technical_issue_id text NOT NULL,
    destination text NOT NULL,
    active_effect_id text NOT NULL,
    decision_state text DEFAULT 'selected'::text NOT NULL,
    decision_reason text,
    selected_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT testing_center_issue_destinations_check CHECK ((((decision_state = 'selected'::text) AND (decision_reason IS NULL)) OR ((decision_state = 'needs_owner'::text) AND (decision_reason = ANY (ARRAY['legacy_github_completed'::text, 'linear_build_identity_missing'::text, 'linear_build_identity_ambiguous'::text, 'linear_response_ambiguous'::text]))))),
    CONSTRAINT testing_center_issue_destinations_decision_state_check CHECK ((decision_state = ANY (ARRAY['selected'::text, 'needs_owner'::text]))),
    CONSTRAINT testing_center_issue_destinations_destination_check CHECK ((destination = ANY (ARRAY['linear'::text, 'github_legacy'::text])))
);

ALTER TABLE ONLY public.testing_center_issue_destinations FORCE ROW LEVEL SECURITY;


--

-- Name: testing_center_linear_issue_bindings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_center_linear_issue_bindings (
    external_issue_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    technical_issue_id text NOT NULL,
    effect_id text NOT NULL,
    bound_by_id text NOT NULL,
    bound_at timestamp with time zone DEFAULT now() NOT NULL,
    external_identifier text,
    external_url text,
    projection_digest text,
    CONSTRAINT testing_center_linear_binding_public_metadata CHECK ((((external_identifier IS NULL) AND (external_url IS NULL) AND (projection_digest IS NULL)) OR ((external_identifier ~ '^[A-Z][A-Z0-9]{0,15}-[1-9][0-9]{0,9}$'::text) AND (external_url ~ (('^https://linear[.]app/vantareapp/issue/'::text || external_identifier) || '/[A-Za-z0-9._~!$&''()*+,;=:@%/-]+$'::text)) AND (projection_digest ~ '^[0-9a-f]{64}$'::text)))),
    CONSTRAINT testing_center_linear_issue_bindings_bound_by_id_check CHECK ((bound_by_id ~ '^[a-z0-9][a-z0-9._-]{0,127}$'::text))
);

ALTER TABLE ONLY public.testing_center_linear_issue_bindings FORCE ROW LEVEL SECURITY;


--

-- Name: testing_center_linear_migration_metadata; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_center_linear_migration_metadata (
    metadata_key text NOT NULL,
    metadata_value text NOT NULL
);

ALTER TABLE ONLY public.testing_center_linear_migration_metadata FORCE ROW LEVEL SECURITY;


--

-- Name: testing_center_linear_projection_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_center_linear_projection_snapshots (
    effect_id text NOT NULL,
    technical_issue_id text NOT NULL,
    primary_report_id text NOT NULL,
    source_snapshot jsonb NOT NULL,
    source_digest text NOT NULL,
    sanitized_projection jsonb,
    projection_digest text,
    marker text NOT NULL,
    occurrence_count bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT testing_center_linear_projection_snapsh_projection_digest_check CHECK (((projection_digest IS NULL) OR (projection_digest ~ '^[0-9a-f]{64}$'::text))),
    CONSTRAINT testing_center_linear_projection_snapsho_occurrence_count_check CHECK (((occurrence_count >= 1) AND (occurrence_count <= 1000000))),
    CONSTRAINT testing_center_linear_projection_snapshots_source_digest_check CHECK ((source_digest ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT testing_center_linear_snapshot_projection_shape CHECK ((((sanitized_projection IS NULL) AND (projection_digest IS NULL) AND (completed_at IS NULL)) OR ((sanitized_projection IS NOT NULL) AND (projection_digest IS NOT NULL) AND (completed_at IS NOT NULL))))
);

ALTER TABLE ONLY public.testing_center_linear_projection_snapshots FORCE ROW LEVEL SECURITY;


--

-- Name: testing_center_linear_reconciliations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_center_linear_reconciliations (
    technical_issue_id text NOT NULL,
    effect_id text NOT NULL,
    external_issue_id uuid NOT NULL,
    observed_state text NOT NULL,
    last_webhook_timestamp_ms bigint,
    last_event_created_at timestamp with time zone,
    last_delivery_id uuid,
    generation bigint DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT testing_center_linear_reconcili_last_webhook_timestamp_ms_check CHECK ((last_webhook_timestamp_ms > 0)),
    CONSTRAINT testing_center_linear_reconciliation_watermark CHECK ((((last_webhook_timestamp_ms IS NULL) AND (last_event_created_at IS NULL) AND (last_delivery_id IS NULL) AND (generation = 0)) OR ((last_webhook_timestamp_ms IS NOT NULL) AND (last_event_created_at IS NOT NULL) AND (last_delivery_id IS NOT NULL) AND (generation > 0)))),
    CONSTRAINT testing_center_linear_reconciliations_generation_check CHECK ((generation >= 0)),
    CONSTRAINT testing_center_linear_reconciliations_observed_state_check CHECK ((observed_state = ANY (ARRAY['linear_created'::text, 'awaiting_owner'::text, 'codex_in_progress'::text, 'pr_in_review'::text, 'needs_changes'::text, 'stopped'::text])))
);

ALTER TABLE ONLY public.testing_center_linear_reconciliations FORCE ROW LEVEL SECURITY;


--

-- Name: testing_center_linear_state_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_center_linear_state_mappings (
    organization_id uuid NOT NULL,
    linear_state_id uuid NOT NULL,
    coarse_state text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    configured_by_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT testing_center_linear_state_mappings_coarse_state_check CHECK ((coarse_state = ANY (ARRAY['linear_created'::text, 'awaiting_owner'::text, 'codex_in_progress'::text, 'pr_in_review'::text, 'needs_changes'::text, 'stopped'::text]))),
    CONSTRAINT testing_center_linear_state_mappings_configured_by_id_check CHECK ((configured_by_id ~ '^[a-z0-9][a-z0-9._-]{0,127}$'::text))
);

ALTER TABLE ONLY public.testing_center_linear_state_mappings FORCE ROW LEVEL SECURITY;


--

-- Name: testing_center_linear_webhook_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_center_linear_webhook_deliveries (
    delivery_id uuid NOT NULL,
    webhook_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    external_issue_id uuid NOT NULL,
    event_name text NOT NULL,
    event_action text NOT NULL,
    webhook_timestamp_ms bigint NOT NULL,
    event_created_at timestamp with time zone NOT NULL,
    linear_state_id uuid,
    payload_digest text NOT NULL,
    outcome text NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT testing_center_linear_webhook_delive_webhook_timestamp_ms_check CHECK ((webhook_timestamp_ms > 0)),
    CONSTRAINT testing_center_linear_webhook_deliveries_event_action_check CHECK ((event_action = ANY (ARRAY['create'::text, 'update'::text, 'remove'::text]))),
    CONSTRAINT testing_center_linear_webhook_deliveries_event_name_check CHECK ((event_name = 'Issue'::text)),
    CONSTRAINT testing_center_linear_webhook_deliveries_outcome_check CHECK ((outcome = ANY (ARRAY['pending'::text, 'applied'::text, 'stale'::text, 'ignored'::text, 'needs_owner'::text]))),
    CONSTRAINT testing_center_linear_webhook_deliveries_payload_digest_check CHECK ((payload_digest ~ '^[0-9a-f]{64}$'::text))
);

ALTER TABLE ONLY public.testing_center_linear_webhook_deliveries FORCE ROW LEVEL SECURITY;


--

-- Name: testing_center_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_center_memberships (
    user_id uuid NOT NULL,
    actor_id text NOT NULL,
    role text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT testing_center_memberships_actor_check CHECK (((actor_id <> ''::text) AND (actor_id !~ '^[[:space:]]|[[:space:]]$'::text) AND (octet_length(actor_id) <= 256))),
    CONSTRAINT testing_center_memberships_role_check CHECK ((role = ANY (ARRAY['tester'::text, 'primary_tester'::text, 'owner'::text])))
);

ALTER TABLE ONLY public.testing_center_memberships FORCE ROW LEVEL SECURITY;


--

-- Name: testing_center_owner_dispositions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_center_owner_dispositions (
    disposition_id text NOT NULL,
    rejection_validation_id text NOT NULL,
    technical_issue_id text NOT NULL,
    actor_id text NOT NULL,
    actor_user_id uuid NOT NULL,
    disposition text NOT NULL,
    reason text NOT NULL,
    dossier_digest text,
    correction_issue_id text,
    target_branch text,
    nightly_sha text,
    disposition_digest text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT testing_center_owner_disposition_correction CHECK ((((disposition = 'create_correction_subissue'::text) AND (dossier_digest IS NOT NULL) AND (correction_issue_id ~ '^issue_[0-9a-f]{64}$'::text) AND (target_branch ~ '^vantareapp/isa-[0-9]+-[a-z0-9-]{1,60}$'::text) AND (nightly_sha ~ '^[0-9a-f]{40}$'::text)) OR ((disposition <> 'create_correction_subissue'::text) AND (dossier_digest IS NULL) AND (correction_issue_id IS NULL) AND (target_branch IS NULL) AND (nightly_sha IS NULL)))),
    CONSTRAINT testing_center_owner_dispositions_disposition_check CHECK ((disposition = ANY (ARRAY['create_correction_subissue'::text, 'environment_issue'::text, 'create_separate_issue'::text, 'dismiss_with_reason'::text, 'stop_rollout'::text]))),
    CONSTRAINT testing_center_owner_dispositions_disposition_digest_check CHECK ((disposition_digest ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT testing_center_owner_dispositions_disposition_id_check CHECK ((disposition_id ~ '^disposition_[0-9a-f]{64}$'::text)),
    CONSTRAINT testing_center_owner_dispositions_reason_check CHECK (((reason = btrim(reason)) AND ((octet_length(reason) >= 3) AND (octet_length(reason) <= 2048))))
);

ALTER TABLE ONLY public.testing_center_owner_dispositions FORCE ROW LEVEL SECURITY;


--

-- Name: testing_center_pauses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_center_pauses (
    contract_version text DEFAULT 'testing-center.v1'::text NOT NULL,
    pause_id text NOT NULL,
    scope text NOT NULL,
    technical_issue_id text,
    is_paused boolean DEFAULT true NOT NULL,
    reason_code text NOT NULL,
    requested_by_id text NOT NULL,
    requested_by_user_id uuid NOT NULL,
    requested_by_role text DEFAULT 'owner'::text NOT NULL,
    origin text DEFAULT 'testing_center'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT testing_center_pauses_actor_check CHECK (((requested_by_id <> ''::text) AND (requested_by_id !~ '^[[:space:]]|[[:space:]]$'::text) AND (octet_length(requested_by_id) <= 256))),
    CONSTRAINT testing_center_pauses_id_check CHECK (((pause_id <> ''::text) AND (pause_id !~ '^[[:space:]]|[[:space:]]$'::text) AND (octet_length(pause_id) <= 256))),
    CONSTRAINT testing_center_pauses_origin_check CHECK ((origin = 'testing_center'::text)),
    CONSTRAINT testing_center_pauses_reason_check CHECK (((reason_code <> ''::text) AND (reason_code !~ '^[[:space:]]|[[:space:]]$'::text) AND (octet_length(reason_code) <= 256))),
    CONSTRAINT testing_center_pauses_role_check CHECK ((requested_by_role = 'owner'::text)),
    CONSTRAINT testing_center_pauses_scope_check CHECK ((scope = ANY (ARRAY['global'::text, 'flow'::text]))),
    CONSTRAINT testing_center_pauses_target_check CHECK ((((scope = 'global'::text) AND (technical_issue_id IS NULL)) OR ((scope = 'flow'::text) AND (technical_issue_id IS NOT NULL)))),
    CONSTRAINT testing_center_pauses_version_check CHECK ((contract_version = 'testing-center.v1'::text))
);

ALTER TABLE ONLY public.testing_center_pauses FORCE ROW LEVEL SECURITY;


--

-- Name: testing_center_promotions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_center_promotions (
    contract_version text DEFAULT 'testing-center.v1'::text NOT NULL,
    promotion_id text NOT NULL,
    candidate_id text NOT NULL,
    validation_id text NOT NULL,
    validation_decision text DEFAULT 'accepted'::text NOT NULL,
    from_channel text NOT NULL,
    to_channel text NOT NULL,
    exact_sha text NOT NULL,
    validated_sha text NOT NULL,
    state text NOT NULL,
    authorized_by_id text,
    authorized_by_user_id uuid,
    authorized_by_role text,
    authorized_origin text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT testing_center_promotions_authorization_check CHECK ((((state = ANY (ARRAY['pending'::text, 'blocked'::text])) AND (authorized_by_id IS NULL) AND (authorized_by_user_id IS NULL) AND (authorized_by_role IS NULL) AND (authorized_origin IS NULL)) OR ((state = ANY (ARRAY['authorized'::text, 'completed'::text])) AND (authorized_by_id IS NOT NULL) AND (authorized_by_id <> ''::text) AND (authorized_by_id !~ '^[[:space:]]|[[:space:]]$'::text) AND (octet_length(authorized_by_id) <= 256) AND (authorized_by_user_id IS NOT NULL) AND (authorized_origin = 'testing_center'::text) AND (((from_channel = 'nightly'::text) AND (to_channel = 'testers'::text) AND (authorized_by_role = ANY (ARRAY['primary_tester'::text, 'owner'::text]))) OR ((from_channel = 'testers'::text) AND (to_channel = 'master'::text) AND (authorized_by_role = 'owner'::text)))))),
    CONSTRAINT testing_center_promotions_from_check CHECK ((from_channel = ANY (ARRAY['nightly'::text, 'testers'::text]))),
    CONSTRAINT testing_center_promotions_id_check CHECK (((promotion_id <> ''::text) AND (promotion_id !~ '^[[:space:]]|[[:space:]]$'::text) AND (octet_length(promotion_id) <= 256))),
    CONSTRAINT testing_center_promotions_origin_check CHECK (((authorized_origin IS NULL) OR (authorized_origin = 'testing_center'::text))),
    CONSTRAINT testing_center_promotions_role_value_check CHECK (((authorized_by_role IS NULL) OR (authorized_by_role = ANY (ARRAY['primary_tester'::text, 'owner'::text])))),
    CONSTRAINT testing_center_promotions_route_check CHECK ((((from_channel = 'nightly'::text) AND (to_channel = 'testers'::text)) OR ((from_channel = 'testers'::text) AND (to_channel = 'master'::text)))),
    CONSTRAINT testing_center_promotions_sha_check CHECK ((exact_sha ~ '^(?:[0-9a-f]{40}|[0-9a-f]{64})$'::text)),
    CONSTRAINT testing_center_promotions_sha_match_check CHECK ((exact_sha = validated_sha)),
    CONSTRAINT testing_center_promotions_state_check CHECK ((state = ANY (ARRAY['pending'::text, 'authorized'::text, 'completed'::text, 'blocked'::text]))),
    CONSTRAINT testing_center_promotions_to_check CHECK ((to_channel = ANY (ARRAY['testers'::text, 'master'::text]))),
    CONSTRAINT testing_center_promotions_validated_sha_check CHECK ((validated_sha ~ '^(?:[0-9a-f]{40}|[0-9a-f]{64})$'::text)),
    CONSTRAINT testing_center_promotions_validation_check CHECK ((validation_decision = 'accepted'::text)),
    CONSTRAINT testing_center_promotions_version_check CHECK ((contract_version = 'testing-center.v1'::text))
);

ALTER TABLE ONLY public.testing_center_promotions FORCE ROW LEVEL SECURITY;


--

-- Name: testing_center_technical_issues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_center_technical_issues (
    contract_version text DEFAULT 'testing-center.v1'::text NOT NULL,
    technical_issue_id text NOT NULL,
    report_id text,
    state text NOT NULL,
    flow_state text NOT NULL,
    origin text NOT NULL,
    retry_count smallint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    contribution_id uuid,
    owner_account_id uuid,
    CONSTRAINT testing_center_issue_has_v2_lineage CHECK (((contribution_id IS NOT NULL) OR (owner_account_id IS NOT NULL))),
    CONSTRAINT testing_center_issues_flow_state_check CHECK ((flow_state = ANY (ARRAY['reported'::text, 'needs_info'::text, 'queued'::text, 'codex_working'::text, 'owner_review'::text, 'nightly_candidate'::text, 'nightly_accepted'::text, 'nightly_rejected'::text, 'testers_candidate'::text, 'testers_accepted'::text, 'testers_rejected'::text, 'master_review'::text, 'released'::text, 'needs_owner'::text, 'stopped'::text]))),
    CONSTRAINT testing_center_issues_id_check CHECK (((technical_issue_id <> ''::text) AND (technical_issue_id !~ '^[[:space:]]|[[:space:]]$'::text) AND (octet_length(technical_issue_id) <= 256))),
    CONSTRAINT testing_center_issues_origin_check CHECK ((origin = ANY (ARRAY['testing_center'::text, 'orchestrator'::text, 'codex'::text, 'github_actions'::text]))),
    CONSTRAINT testing_center_issues_retry_check CHECK (((retry_count >= 0) AND (retry_count <= 1))),
    CONSTRAINT testing_center_issues_state_check CHECK ((state = ANY (ARRAY['open'::text, 'needs_owner'::text, 'closed'::text]))),
    CONSTRAINT testing_center_issues_version_check CHECK ((contract_version = 'testing-center.v1'::text)),
    CONSTRAINT testing_center_technical_issue_no_legacy_report_id CHECK ((report_id IS NULL))
);

ALTER TABLE ONLY public.testing_center_technical_issues FORCE ROW LEVEL SECURITY;


--

-- Name: testing_center_validation_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_center_validation_snapshots (
    validation_id text NOT NULL,
    technical_issue_id text NOT NULL,
    candidate_id text NOT NULL,
    channel text NOT NULL,
    app_version text NOT NULL,
    candidate_sha text NOT NULL,
    actor_id text NOT NULL,
    actor_user_id uuid NOT NULL,
    actor_role text NOT NULL,
    decision text NOT NULL,
    replay_key text NOT NULL,
    decision_digest text NOT NULL,
    projection_digest text NOT NULL,
    transport_digest text NOT NULL,
    sanitized_projection jsonb NOT NULL,
    details_markdown text,
    redacted_values integer NOT NULL,
    truncated_fields integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT testing_center_validation_snapshot_details CHECK ((((decision = 'rejected'::text) AND (details_markdown IS NOT NULL) AND ((octet_length(details_markdown) >= 1) AND (octet_length(details_markdown) <= 16384))) OR ((decision = ANY (ARRAY['accepted'::text, 'cannot_verify'::text])) AND (details_markdown IS NULL)))),
    CONSTRAINT testing_center_validation_snapshots_actor_id_check CHECK ((actor_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::text)),
    CONSTRAINT testing_center_validation_snapshots_actor_role_check CHECK ((actor_role = ANY (ARRAY['tester'::text, 'primary_tester'::text, 'owner'::text]))),
    CONSTRAINT testing_center_validation_snapshots_app_version_check CHECK (((app_version <> ''::text) AND (app_version !~ '^[[:space:]]|[[:space:]]$'::text) AND (octet_length(app_version) <= 32))),
    CONSTRAINT testing_center_validation_snapshots_candidate_sha_check CHECK ((candidate_sha ~ '^[0-9a-f]{40}$'::text)),
    CONSTRAINT testing_center_validation_snapshots_channel_check CHECK ((channel = ANY (ARRAY['nightly'::text, 'testers'::text]))),
    CONSTRAINT testing_center_validation_snapshots_decision_check CHECK ((decision = ANY (ARRAY['accepted'::text, 'rejected'::text, 'cannot_verify'::text]))),
    CONSTRAINT testing_center_validation_snapshots_decision_digest_check CHECK ((decision_digest ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT testing_center_validation_snapshots_projection_digest_check CHECK ((projection_digest ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT testing_center_validation_snapshots_redacted_values_check CHECK ((redacted_values >= 0)),
    CONSTRAINT testing_center_validation_snapshots_replay_key_check CHECK (((replay_key <> ''::text) AND (octet_length(replay_key) <= 512))),
    CONSTRAINT testing_center_validation_snapshots_transport_digest_check CHECK ((transport_digest ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT testing_center_validation_snapshots_truncated_fields_check CHECK ((truncated_fields >= 0))
);

ALTER TABLE ONLY public.testing_center_validation_snapshots FORCE ROW LEVEL SECURITY;


--

-- Name: testing_center_validations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_center_validations (
    contract_version text DEFAULT 'testing-center.v1'::text NOT NULL,
    validation_id text NOT NULL,
    candidate_id text NOT NULL,
    channel text NOT NULL,
    exact_sha text NOT NULL,
    candidate_author_id text NOT NULL,
    decision text NOT NULL,
    actor_id text NOT NULL,
    actor_user_id uuid NOT NULL,
    actor_role text NOT NULL,
    actor_origin text DEFAULT 'testing_center'::text NOT NULL,
    rejection_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT testing_center_validations_actor_check CHECK (((actor_id <> ''::text) AND (actor_id !~ '^[[:space:]]|[[:space:]]$'::text) AND (octet_length(actor_id) <= 256))),
    CONSTRAINT testing_center_validations_author_check CHECK (((candidate_author_id <> ''::text) AND (candidate_author_id !~ '^[[:space:]]|[[:space:]]$'::text) AND (octet_length(candidate_author_id) <= 256))),
    CONSTRAINT testing_center_validations_channel_check CHECK ((channel = ANY (ARRAY['nightly'::text, 'testers'::text]))),
    CONSTRAINT testing_center_validations_channel_role_check CHECK ((((channel = 'nightly'::text) AND (actor_role = ANY (ARRAY['primary_tester'::text, 'owner'::text]))) OR ((channel = 'testers'::text) AND (actor_role = ANY (ARRAY['tester'::text, 'primary_tester'::text, 'owner'::text]))))),
    CONSTRAINT testing_center_validations_decision_check CHECK ((decision = ANY (ARRAY['accepted'::text, 'rejected'::text, 'cannot_verify'::text]))),
    CONSTRAINT testing_center_validations_id_check CHECK (((validation_id <> ''::text) AND (validation_id !~ '^[[:space:]]|[[:space:]]$'::text) AND (octet_length(validation_id) <= 256))),
    CONSTRAINT testing_center_validations_origin_check CHECK ((actor_origin = 'testing_center'::text)),
    CONSTRAINT testing_center_validations_reason_check CHECK ((((decision = ANY (ARRAY['accepted'::text, 'cannot_verify'::text])) AND (rejection_reason IS NULL)) OR ((decision = 'rejected'::text) AND (rejection_reason = ANY (ARRAY['still_fails'::text, 'regression'::text, 'incomplete_fix'::text, 'new_failure'::text, 'other'::text]))))),
    CONSTRAINT testing_center_validations_role_check CHECK ((actor_role = ANY (ARRAY['tester'::text, 'primary_tester'::text, 'owner'::text]))),
    CONSTRAINT testing_center_validations_self_check CHECK ((actor_id <> candidate_author_id)),
    CONSTRAINT testing_center_validations_sha_check CHECK ((exact_sha ~ '^(?:[0-9a-f]{40}|[0-9a-f]{64})$'::text)),
    CONSTRAINT testing_center_validations_version_check CHECK ((contract_version = 'testing-center.v1'::text))
);

ALTER TABLE ONLY public.testing_center_validations FORCE ROW LEVEL SECURITY;


--

-- Name: testing_contribution_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_contribution_attachments (
    contribution_id uuid NOT NULL,
    kind text NOT NULL,
    content text NOT NULL,
    sha256 text NOT NULL,
    CONSTRAINT testing_contribution_attachments_check CHECK (((sha256 ~ '^[0-9a-f]{64}$'::text) AND (sha256 = encode(sha256(convert_to(content, 'UTF8'::name)), 'hex'::text)))),
    CONSTRAINT testing_contribution_attachments_content_check CHECK ((octet_length(content) <= 262144)),
    CONSTRAINT testing_contribution_attachments_kind_check CHECK ((kind = ANY (ARRAY['app_log'::text, 'telemetry_fragment'::text])))
);

ALTER TABLE ONLY public.testing_contribution_attachments FORCE ROW LEVEL SECURITY;


--

-- Name: testing_contribution_context; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_contribution_context (
    contribution_id uuid NOT NULL,
    app_version text NOT NULL,
    app_channel text NOT NULL,
    game text NOT NULL,
    game_version text,
    system jsonb NOT NULL,
    telemetry_summary jsonb,
    posthog_session_id text,
    consent jsonb NOT NULL,
    CONSTRAINT testing_contribution_context_app_channel_check CHECK ((app_channel = ANY (ARRAY['stable'::text, 'testers'::text, 'nightly'::text]))),
    CONSTRAINT testing_contribution_context_app_version_check CHECK (((length(app_version) <= 60) AND (app_version ~ '^[0-9]+\.[0-9]+\.[0-9]+(-[a-z0-9.-]+)?$'::text))),
    CONSTRAINT testing_contribution_context_consent_check CHECK (((jsonb_typeof(consent) = 'object'::text) AND (pg_column_size(consent) <= 2048))),
    CONSTRAINT testing_contribution_context_game_check CHECK ((game = ANY (ARRAY['lmu'::text, 'acc'::text, 'none'::text]))),
    CONSTRAINT testing_contribution_context_game_version_check CHECK (((length(game_version) >= 1) AND (length(game_version) <= 120))),
    CONSTRAINT testing_contribution_context_posthog_session_id_check CHECK ((((length(posthog_session_id) >= 1) AND (length(posthog_session_id) <= 128)) AND (posthog_session_id ~ '^[a-zA-Z0-9_-]+$'::text))),
    CONSTRAINT testing_contribution_context_system_check CHECK (private.testing_system_valid(system)),
    CONSTRAINT testing_contribution_context_telemetry_summary_check CHECK ((private.testing_telemetry_valid(telemetry_summary) AND (pg_column_size(telemetry_summary) <= 32768)))
);

ALTER TABLE ONLY public.testing_contribution_context FORCE ROW LEVEL SECURITY;


--

-- Name: testing_contribution_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_contribution_reviews (
    contribution_id uuid NOT NULL,
    reviewer uuid,
    decision text NOT NULL,
    note text NOT NULL,
    model_verdict text,
    model_confidence double precision,
    model text DEFAULT 'opencode-go/deepseek-v4.1-flash'::text NOT NULL,
    proposal jsonb,
    decided_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT testing_contribution_reviews_decision_check CHECK ((decision = ANY (ARRAY['accepted'::text, 'declined'::text, 'spam'::text]))),
    CONSTRAINT testing_contribution_reviews_model_confidence_check CHECK (((model_confidence >= (0)::double precision) AND (model_confidence <= (1)::double precision))),
    CONSTRAINT testing_contribution_reviews_model_verdict_check CHECK ((model_verdict = ANY (ARRAY['valido'::text, 'dudoso'::text, 'spam'::text]))),
    CONSTRAINT testing_contribution_reviews_note_check CHECK (((length(TRIM(BOTH FROM note)) >= 1) AND (length(TRIM(BOTH FROM note)) <= 1000))),
    CONSTRAINT testing_reviews_proposal_check CHECK (((proposal IS NULL) OR private.testing_proposal_valid(proposal))),
    CONSTRAINT testing_reviews_source_check CHECK ((((model = 'human'::text) AND (model_verdict IS NULL) AND (model_confidence IS NULL) AND (proposal IS NULL)) OR ((model = 'opencode-go/deepseek-v4.1-flash'::text) AND (model_verdict IS NOT NULL) AND (model_confidence IS NOT NULL) AND (proposal IS NOT NULL))))
);

ALTER TABLE ONLY public.testing_contribution_reviews FORCE ROW LEVEL SECURITY;


--

-- Name: testing_contributions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_contributions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    channel text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    state text DEFAULT 'received'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    legacy_source_id text,
    CONSTRAINT testing_contributions_body_check CHECK (((length(TRIM(BOTH FROM body)) >= 1) AND (length(TRIM(BOTH FROM body)) <= 1000))),
    CONSTRAINT testing_contributions_channel_check CHECK ((channel = ANY (ARRAY['nightly'::text, 'testers'::text, 'master'::text]))),
    CONSTRAINT testing_contributions_state_check CHECK ((state = ANY (ARRAY['received'::text, 'reviewing'::text, 'accepted'::text, 'declined'::text, 'spam'::text, 'fixed'::text]))),
    CONSTRAINT testing_contributions_title_check CHECK (((length(TRIM(BOTH FROM title)) >= 1) AND (length(TRIM(BOTH FROM title)) <= 120)))
);

ALTER TABLE ONLY public.testing_contributions FORCE ROW LEVEL SECURITY;


--

-- Name: testing_questionnaires; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_questionnaires (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    version text NOT NULL,
    channel text NOT NULL,
    title text NOT NULL,
    question text NOT NULL,
    published boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT testing_questionnaires_channel_check CHECK ((channel = ANY (ARRAY['nightly'::text, 'testers'::text]))),
    CONSTRAINT testing_questionnaires_question_check CHECK (((length(TRIM(BOTH FROM question)) >= 1) AND (length(TRIM(BOTH FROM question)) <= 500))),
    CONSTRAINT testing_questionnaires_title_check CHECK (((length(TRIM(BOTH FROM title)) >= 1) AND (length(TRIM(BOTH FROM title)) <= 120))),
    CONSTRAINT testing_questionnaires_version_check CHECK (((version ~ '^[0-9]+\.[0-9]+\.[0-9]+(-[a-z0-9.-]+)?$'::text) AND (length(version) <= 60)))
);

ALTER TABLE ONLY public.testing_questionnaires FORCE ROW LEVEL SECURITY;


--

-- Name: testing_report_followup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testing_report_followup (
    contribution_id uuid NOT NULL,
    activity boolean DEFAULT true NOT NULL,
    credit boolean DEFAULT false NOT NULL,
    consent boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    notice_read_at timestamp with time zone,
    fixed_version text,
    reviewed_title text,
    reviewed_summary text,
    reject_reason text,
    report_metadata jsonb,
    CONSTRAINT testing_report_followup_check CHECK (((fixed_version IS NULL) = (reviewed_title IS NULL))),
    CONSTRAINT testing_report_followup_check1 CHECK (((fixed_version IS NULL) = (reviewed_summary IS NULL))),
    CONSTRAINT testing_report_followup_fixed_version_check CHECK (((fixed_version ~ '^[0-9]+\.[0-9]+\.[0-9]+(\.[0-9]+)?(-[a-z0-9.-]+)?$'::text) AND (length(fixed_version) <= 60))),
    CONSTRAINT testing_report_followup_reject_reason_check CHECK ((length(reject_reason) <= 500)),
    CONSTRAINT testing_report_followup_report_metadata_check CHECK (((report_metadata IS NULL) OR ((jsonb_typeof(report_metadata) = 'object'::text) AND (pg_column_size(report_metadata) <= 8192)))),
    CONSTRAINT testing_report_followup_reviewed_summary_check CHECK (((length(TRIM(BOTH FROM reviewed_summary)) >= 1) AND (length(TRIM(BOTH FROM reviewed_summary)) <= 200))),
    CONSTRAINT testing_report_followup_reviewed_title_check CHECK (((length(TRIM(BOTH FROM reviewed_title)) >= 1) AND (length(TRIM(BOTH FROM reviewed_title)) <= 120)))
);

ALTER TABLE ONLY public.testing_report_followup FORCE ROW LEVEL SECURITY;


--

-- Name: report_creator_remainders report_creator_remainders_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.report_creator_remainders
    ADD CONSTRAINT report_creator_remainders_pkey PRIMARY KEY (environment, product_id, creator_discount_id, duration_months);


--

-- Name: report_creator_terms report_creator_terms_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.report_creator_terms
    ADD CONSTRAINT report_creator_terms_pkey PRIMARY KEY (environment, subscription_id);


--

-- Name: report_promotion_catalog report_promotion_catalog_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.report_promotion_catalog
    ADD CONSTRAINT report_promotion_catalog_pkey PRIMARY KEY (environment, product_id);


--

-- Name: report_promotion_changes report_promotion_changes_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.report_promotion_changes
    ADD CONSTRAINT report_promotion_changes_pkey PRIMARY KEY (id);


--

-- Name: report_promotion_creators report_promotion_creators_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.report_promotion_creators
    ADD CONSTRAINT report_promotion_creators_pkey PRIMARY KEY (environment, product_id, discount_id);


--

-- Name: report_promotion_failures report_promotion_failures_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.report_promotion_failures
    ADD CONSTRAINT report_promotion_failures_pkey PRIMARY KEY (account_id, environment);


--

-- Name: report_promotion_invoice_gaps report_promotion_invoice_gaps_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.report_promotion_invoice_gaps
    ADD CONSTRAINT report_promotion_invoice_gaps_pkey PRIMARY KEY (environment, order_id);


--

-- Name: report_promotion_invoices report_promotion_invoices_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.report_promotion_invoices
    ADD CONSTRAINT report_promotion_invoices_pkey PRIMARY KEY (environment, order_id);


--

-- Name: report_promotion_launch_uses report_promotion_launch_uses_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.report_promotion_launch_uses
    ADD CONSTRAINT report_promotion_launch_uses_pkey PRIMARY KEY (account_id, environment);


--

-- Name: report_promotion_policy report_promotion_policy_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.report_promotion_policy
    ADD CONSTRAINT report_promotion_policy_pkey PRIMARY KEY (singleton);


--

-- Name: report_promotion_transfers report_promotion_transfers_account_id_environment_subscript_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.report_promotion_transfers
    ADD CONSTRAINT report_promotion_transfers_account_id_environment_subscript_key UNIQUE (account_id, environment, subscription_id, product_id, observed_at);


--

-- Name: report_promotion_transfers report_promotion_transfers_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.report_promotion_transfers
    ADD CONSTRAINT report_promotion_transfers_pkey PRIMARY KEY (id);


--

-- Name: report_promotions report_promotions_environment_subscription_id_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.report_promotions
    ADD CONSTRAINT report_promotions_environment_subscription_id_key UNIQUE (environment, subscription_id);


--

-- Name: report_promotions report_promotions_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.report_promotions
    ADD CONSTRAINT report_promotions_pkey PRIMARY KEY (account_id, environment);


--

-- Name: report_renewal_candidates report_renewal_candidates_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.report_renewal_candidates
    ADD CONSTRAINT report_renewal_candidates_pkey PRIMARY KEY (environment, subscription_id);


--

-- Name: testing_report_admitted_keys testing_report_admitted_keys_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.testing_report_admitted_keys
    ADD CONSTRAINT testing_report_admitted_keys_pkey PRIMARY KEY (account_id, report_key);


--

-- Name: testing_report_attempts testing_report_attempts_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.testing_report_attempts
    ADD CONSTRAINT testing_report_attempts_pkey PRIMARY KEY (scope, subject, week_start, day_start);


--

-- Name: testing_report_v2_keys testing_report_v2_keys_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.testing_report_v2_keys
    ADD CONSTRAINT testing_report_v2_keys_pkey PRIMARY KEY (account_id, idempotency_key);


--

-- Name: testing_report_v2_keys testing_report_v2_keys_report_id_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.testing_report_v2_keys
    ADD CONSTRAINT testing_report_v2_keys_report_id_key UNIQUE (report_id);


--

-- Name: testing_answers testing_answers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_answers
    ADD CONSTRAINT testing_answers_pkey PRIMARY KEY (questionnaire_id, account_id);


--

-- Name: testing_center_agent_audit testing_center_agent_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_agent_audit
    ADD CONSTRAINT testing_center_agent_audit_pkey PRIMARY KEY (audit_id);


--

-- Name: testing_center_agent_callbacks testing_center_agent_callbacks_delivery_id_job_key_head_sha_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_agent_callbacks
    ADD CONSTRAINT testing_center_agent_callbacks_delivery_id_job_key_head_sha_key UNIQUE (delivery_id, job_key, head_sha);


--

-- Name: testing_center_agent_callbacks testing_center_agent_callbacks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_agent_callbacks
    ADD CONSTRAINT testing_center_agent_callbacks_pkey PRIMARY KEY (delivery_id);


--

-- Name: testing_center_agent_effect_outbox testing_center_agent_effect_o_job_key_effect_kind_effect_ta_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_agent_effect_outbox
    ADD CONSTRAINT testing_center_agent_effect_o_job_key_effect_kind_effect_ta_key UNIQUE (job_key, effect_kind, effect_target, effect_generation);


--

-- Name: testing_center_agent_effect_outbox testing_center_agent_effect_outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_agent_effect_outbox
    ADD CONSTRAINT testing_center_agent_effect_outbox_pkey PRIMARY KEY (effect_id);


--

-- Name: testing_center_agent_jobs testing_center_agent_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_agent_jobs
    ADD CONSTRAINT testing_center_agent_jobs_pkey PRIMARY KEY (job_key);


--

-- Name: testing_center_agent_jobs testing_center_agent_jobs_technical_issue_id_execution_gene_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_agent_jobs
    ADD CONSTRAINT testing_center_agent_jobs_technical_issue_id_execution_gene_key UNIQUE (technical_issue_id, execution_generation);


--

-- Name: testing_center_agent_phase_callbacks testing_center_agent_phase_cal_delivery_id_job_key_head_sha_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_agent_phase_callbacks
    ADD CONSTRAINT testing_center_agent_phase_cal_delivery_id_job_key_head_sha_key UNIQUE (delivery_id, job_key, head_sha);


--

-- Name: testing_center_agent_phase_callbacks testing_center_agent_phase_callbacks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_agent_phase_callbacks
    ADD CONSTRAINT testing_center_agent_phase_callbacks_pkey PRIMARY KEY (delivery_id);


--

-- Name: testing_center_agent_reservations testing_center_agent_reservations_job_key_reservation_kind_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_agent_reservations
    ADD CONSTRAINT testing_center_agent_reservations_job_key_reservation_kind_key UNIQUE (job_key, reservation_kind);


--

-- Name: testing_center_agent_reservations testing_center_agent_reservations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_agent_reservations
    ADD CONSTRAINT testing_center_agent_reservations_pkey PRIMARY KEY (reservation_key);


--

-- Name: testing_center_audit testing_center_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_audit
    ADD CONSTRAINT testing_center_audit_pkey PRIMARY KEY (audit_id);


--

-- Name: testing_center_build_identities testing_center_build_identities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_build_identities
    ADD CONSTRAINT testing_center_build_identities_pkey PRIMARY KEY (build_identity_id);


--

-- Name: testing_center_candidate_builds testing_center_candidate_buil_candidate_id_channel_exact_s_key1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_candidate_builds
    ADD CONSTRAINT testing_center_candidate_buil_candidate_id_channel_exact_s_key1 UNIQUE (candidate_id, channel, exact_sha, author_id);


--

-- Name: testing_center_candidate_builds testing_center_candidate_buil_candidate_id_channel_exact_sh_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_candidate_builds
    ADD CONSTRAINT testing_center_candidate_buil_candidate_id_channel_exact_sh_key UNIQUE (candidate_id, channel, exact_sha);


--

-- Name: testing_center_candidate_builds testing_center_candidate_buil_technical_issue_id_channel_ex_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_candidate_builds
    ADD CONSTRAINT testing_center_candidate_buil_technical_issue_id_channel_ex_key UNIQUE (technical_issue_id, channel, exact_sha);


--

-- Name: testing_center_candidate_builds testing_center_candidate_builds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_candidate_builds
    ADD CONSTRAINT testing_center_candidate_builds_pkey PRIMARY KEY (candidate_id);


--

-- Name: testing_center_codex_dossier_snapshots testing_center_codex_dossier_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_codex_dossier_snapshots
    ADD CONSTRAINT testing_center_codex_dossier_snapshots_pkey PRIMARY KEY (dossier_digest);


--

-- Name: testing_center_codex_dossier_snapshots testing_center_codex_dossier_snapshots_transport_digest_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_codex_dossier_snapshots
    ADD CONSTRAINT testing_center_codex_dossier_snapshots_transport_digest_key UNIQUE (transport_digest);


--

-- Name: testing_center_codex_execution_control testing_center_codex_execution_control_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_codex_execution_control
    ADD CONSTRAINT testing_center_codex_execution_control_pkey PRIMARY KEY (technical_issue_id);


--

-- Name: testing_center_codex_execution_control testing_center_codex_execution_control_run_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_codex_execution_control
    ADD CONSTRAINT testing_center_codex_execution_control_run_id_key UNIQUE (run_id);


--

-- Name: testing_center_codex_runs testing_center_codex_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_codex_runs
    ADD CONSTRAINT testing_center_codex_runs_pkey PRIMARY KEY (run_id);


--

-- Name: testing_center_codex_runs testing_center_codex_runs_technical_issue_id_attempt_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_codex_runs
    ADD CONSTRAINT testing_center_codex_runs_technical_issue_id_attempt_key UNIQUE (technical_issue_id, attempt);


--

-- Name: testing_center_effect_outbox testing_center_effect_outbox_effect_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_effect_outbox
    ADD CONSTRAINT testing_center_effect_outbox_effect_key_key UNIQUE (effect_key);


--

-- Name: testing_center_effect_outbox testing_center_effect_outbox_issue_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_effect_outbox
    ADD CONSTRAINT testing_center_effect_outbox_issue_type_key UNIQUE (technical_issue_id, effect_type);


--

-- Name: testing_center_effect_outbox testing_center_effect_outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_effect_outbox
    ADD CONSTRAINT testing_center_effect_outbox_pkey PRIMARY KEY (effect_id);


--

-- Name: testing_center_effect_supersessions testing_center_effect_supersessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_effect_supersessions
    ADD CONSTRAINT testing_center_effect_supersessions_pkey PRIMARY KEY (legacy_effect_id);


--

-- Name: testing_center_effect_supersessions testing_center_effect_supersessions_superseded_by_effect_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_effect_supersessions
    ADD CONSTRAINT testing_center_effect_supersessions_superseded_by_effect_id_key UNIQUE (superseded_by_effect_id);


--

-- Name: testing_center_github_deliveries testing_center_github_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_github_deliveries
    ADD CONSTRAINT testing_center_github_deliveries_pkey PRIMARY KEY (delivery_id);


--

-- Name: testing_center_idempotency testing_center_idempotency_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_idempotency
    ADD CONSTRAINT testing_center_idempotency_pk PRIMARY KEY (aggregate_id, idempotency_key);


--

-- Name: testing_center_issue_destinations testing_center_issue_destinations_active_effect_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_issue_destinations
    ADD CONSTRAINT testing_center_issue_destinations_active_effect_id_key UNIQUE (active_effect_id);


--

-- Name: testing_center_issue_destinations testing_center_issue_destinations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_issue_destinations
    ADD CONSTRAINT testing_center_issue_destinations_pkey PRIMARY KEY (technical_issue_id);


--

-- Name: testing_center_linear_issue_bindings testing_center_linear_issue_bindings_effect_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_linear_issue_bindings
    ADD CONSTRAINT testing_center_linear_issue_bindings_effect_id_key UNIQUE (effect_id);


--

-- Name: testing_center_linear_issue_bindings testing_center_linear_issue_bindings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_linear_issue_bindings
    ADD CONSTRAINT testing_center_linear_issue_bindings_pkey PRIMARY KEY (external_issue_id);


--

-- Name: testing_center_linear_issue_bindings testing_center_linear_issue_bindings_technical_issue_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_linear_issue_bindings
    ADD CONSTRAINT testing_center_linear_issue_bindings_technical_issue_id_key UNIQUE (technical_issue_id);


--

-- Name: testing_center_linear_migration_metadata testing_center_linear_migration_metadata_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_linear_migration_metadata
    ADD CONSTRAINT testing_center_linear_migration_metadata_pkey PRIMARY KEY (metadata_key);


--

-- Name: testing_center_linear_projection_snapshots testing_center_linear_projection_snapsho_technical_issue_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_linear_projection_snapshots
    ADD CONSTRAINT testing_center_linear_projection_snapsho_technical_issue_id_key UNIQUE (technical_issue_id);


--

-- Name: testing_center_linear_projection_snapshots testing_center_linear_projection_snapshots_marker_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_linear_projection_snapshots
    ADD CONSTRAINT testing_center_linear_projection_snapshots_marker_key UNIQUE (marker);


--

-- Name: testing_center_linear_projection_snapshots testing_center_linear_projection_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_linear_projection_snapshots
    ADD CONSTRAINT testing_center_linear_projection_snapshots_pkey PRIMARY KEY (effect_id);


--

-- Name: testing_center_linear_reconciliations testing_center_linear_reconciliations_effect_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_linear_reconciliations
    ADD CONSTRAINT testing_center_linear_reconciliations_effect_id_key UNIQUE (effect_id);


--

-- Name: testing_center_linear_reconciliations testing_center_linear_reconciliations_external_issue_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_linear_reconciliations
    ADD CONSTRAINT testing_center_linear_reconciliations_external_issue_id_key UNIQUE (external_issue_id);


--

-- Name: testing_center_linear_reconciliations testing_center_linear_reconciliations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_linear_reconciliations
    ADD CONSTRAINT testing_center_linear_reconciliations_pkey PRIMARY KEY (technical_issue_id);


--

-- Name: testing_center_linear_state_mappings testing_center_linear_state_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_linear_state_mappings
    ADD CONSTRAINT testing_center_linear_state_mappings_pkey PRIMARY KEY (organization_id, linear_state_id);


--

-- Name: testing_center_linear_webhook_deliveries testing_center_linear_webhook_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_linear_webhook_deliveries
    ADD CONSTRAINT testing_center_linear_webhook_deliveries_pkey PRIMARY KEY (delivery_id);


--

-- Name: testing_center_memberships testing_center_memberships_actor_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_memberships
    ADD CONSTRAINT testing_center_memberships_actor_id_key UNIQUE (actor_id);


--

-- Name: testing_center_memberships testing_center_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_memberships
    ADD CONSTRAINT testing_center_memberships_pkey PRIMARY KEY (user_id);


--

-- Name: testing_center_owner_dispositions testing_center_owner_dispositions_disposition_digest_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_owner_dispositions
    ADD CONSTRAINT testing_center_owner_dispositions_disposition_digest_key UNIQUE (disposition_digest);


--

-- Name: testing_center_owner_dispositions testing_center_owner_dispositions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_owner_dispositions
    ADD CONSTRAINT testing_center_owner_dispositions_pkey PRIMARY KEY (disposition_id);


--

-- Name: testing_center_owner_dispositions testing_center_owner_dispositions_rejection_validation_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_owner_dispositions
    ADD CONSTRAINT testing_center_owner_dispositions_rejection_validation_id_key UNIQUE (rejection_validation_id);


--

-- Name: testing_center_pauses testing_center_pauses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_pauses
    ADD CONSTRAINT testing_center_pauses_pkey PRIMARY KEY (pause_id);


--

-- Name: testing_center_pauses testing_center_pauses_scope_technical_issue_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_pauses
    ADD CONSTRAINT testing_center_pauses_scope_technical_issue_id_key UNIQUE NULLS NOT DISTINCT (scope, technical_issue_id);


--

-- Name: testing_center_promotions testing_center_promotions_candidate_id_from_channel_to_chan_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_promotions
    ADD CONSTRAINT testing_center_promotions_candidate_id_from_channel_to_chan_key UNIQUE (candidate_id, from_channel, to_channel, exact_sha);


--

-- Name: testing_center_promotions testing_center_promotions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_promotions
    ADD CONSTRAINT testing_center_promotions_pkey PRIMARY KEY (promotion_id);


--

-- Name: testing_center_technical_issues testing_center_technical_issues_contribution_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_technical_issues
    ADD CONSTRAINT testing_center_technical_issues_contribution_id_key UNIQUE (contribution_id);


--

-- Name: testing_center_technical_issues testing_center_technical_issues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_technical_issues
    ADD CONSTRAINT testing_center_technical_issues_pkey PRIMARY KEY (technical_issue_id);


--

-- Name: testing_center_technical_issues testing_center_technical_issues_report_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_technical_issues
    ADD CONSTRAINT testing_center_technical_issues_report_id_key UNIQUE (report_id);


--

-- Name: testing_center_validation_snapshots testing_center_validation_sna_candidate_id_channel_candidat_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_validation_snapshots
    ADD CONSTRAINT testing_center_validation_sna_candidate_id_channel_candidat_key UNIQUE (candidate_id, channel, candidate_sha, actor_id);


--

-- Name: testing_center_validation_snapshots testing_center_validation_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_validation_snapshots
    ADD CONSTRAINT testing_center_validation_snapshots_pkey PRIMARY KEY (validation_id);


--

-- Name: testing_center_validation_snapshots testing_center_validation_snapshots_projection_digest_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_validation_snapshots
    ADD CONSTRAINT testing_center_validation_snapshots_projection_digest_key UNIQUE (projection_digest);


--

-- Name: testing_center_validation_snapshots testing_center_validation_snapshots_replay_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_validation_snapshots
    ADD CONSTRAINT testing_center_validation_snapshots_replay_key_key UNIQUE (replay_key);


--

-- Name: testing_center_validation_snapshots testing_center_validation_snapshots_transport_digest_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_validation_snapshots
    ADD CONSTRAINT testing_center_validation_snapshots_transport_digest_key UNIQUE (transport_digest);


--

-- Name: testing_center_validations testing_center_validations_candidate_id_channel_exact_sha_a_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_validations
    ADD CONSTRAINT testing_center_validations_candidate_id_channel_exact_sha_a_key UNIQUE (candidate_id, channel, exact_sha, actor_id);


--

-- Name: testing_center_validations testing_center_validations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_validations
    ADD CONSTRAINT testing_center_validations_pkey PRIMARY KEY (validation_id);


--

-- Name: testing_center_validations testing_center_validations_validation_id_candidate_id_chann_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_validations
    ADD CONSTRAINT testing_center_validations_validation_id_candidate_id_chann_key UNIQUE (validation_id, candidate_id, channel, exact_sha, decision);


--

-- Name: testing_contribution_attachments testing_contribution_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_contribution_attachments
    ADD CONSTRAINT testing_contribution_attachments_pkey PRIMARY KEY (contribution_id, kind);


--

-- Name: testing_contribution_context testing_contribution_context_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_contribution_context
    ADD CONSTRAINT testing_contribution_context_pkey PRIMARY KEY (contribution_id);


--

-- Name: testing_contribution_reviews testing_contribution_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_contribution_reviews
    ADD CONSTRAINT testing_contribution_reviews_pkey PRIMARY KEY (contribution_id);


--

-- Name: testing_contributions testing_contributions_account_id_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_contributions
    ADD CONSTRAINT testing_contributions_account_id_id_key UNIQUE (account_id, id);


--

-- Name: testing_contributions testing_contributions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_contributions
    ADD CONSTRAINT testing_contributions_pkey PRIMARY KEY (id);


--

-- Name: testing_questionnaires testing_questionnaires_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_questionnaires
    ADD CONSTRAINT testing_questionnaires_pkey PRIMARY KEY (id);


--

-- Name: testing_report_followup testing_report_followup_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_report_followup
    ADD CONSTRAINT testing_report_followup_pkey PRIMARY KEY (contribution_id);


--

-- Name: report_promotion_changes_account; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX report_promotion_changes_account ON private.report_promotion_changes USING btree (account_id, environment, created_at);


--

-- Name: report_promotion_invoice_account; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX report_promotion_invoice_account ON private.report_promotion_invoices USING btree (account_id, environment, period_start);


--

-- Name: report_promotion_one_pending; Type: INDEX; Schema: private; Owner: -
--

CREATE UNIQUE INDEX report_promotion_one_pending ON private.report_promotion_changes USING btree (account_id, environment) WHERE ((applied_at IS NULL) AND (superseded_at IS NULL));


--

-- Name: report_promotion_open_invoice_gaps; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX report_promotion_open_invoice_gaps ON private.report_promotion_invoice_gaps USING btree (account_id, environment) WHERE (resolved_at IS NULL);


--

-- Name: testing_report_admitted_keys_expiry; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX testing_report_admitted_keys_expiry ON private.testing_report_admitted_keys USING btree (admitted_at);


--

-- Name: testing_report_attempts_expiry; Type: INDEX; Schema: private; Owner: -
--

CREATE INDEX testing_report_attempts_expiry ON private.testing_report_attempts USING btree (day_start);


--

-- Name: testing_center_agent_effects_claim_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX testing_center_agent_effects_claim_idx ON public.testing_center_agent_effect_outbox USING btree (state, lease_expires_at, created_at);


--

-- Name: testing_center_audit_aggregate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX testing_center_audit_aggregate_idx ON public.testing_center_audit USING btree (aggregate_id, created_at);


--

-- Name: testing_center_build_identities_lookup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX testing_center_build_identities_lookup_idx ON public.testing_center_build_identities USING btree (channel, app_version) WHERE active;


--

-- Name: testing_center_candidates_issue_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX testing_center_candidates_issue_idx ON public.testing_center_candidate_builds USING btree (technical_issue_id, channel, state);


--

-- Name: testing_center_codex_control_claim_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX testing_center_codex_control_claim_idx ON public.testing_center_codex_execution_control USING btree (state, lease_expires_at, created_at);


--

-- Name: testing_center_codex_runs_issue_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX testing_center_codex_runs_issue_idx ON public.testing_center_codex_runs USING btree (technical_issue_id, state);


--

-- Name: testing_center_dossiers_rejection_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX testing_center_dossiers_rejection_idx ON public.testing_center_codex_dossier_snapshots USING btree (rejection_validation_id, status);


--

-- Name: testing_center_effect_outbox_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX testing_center_effect_outbox_pending_idx ON public.testing_center_effect_outbox USING btree (created_at) WHERE (state = 'pending'::text);


--

-- Name: testing_center_effect_outbox_retry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX testing_center_effect_outbox_retry_idx ON public.testing_center_effect_outbox USING btree (next_attempt_at, created_at) WHERE (state = 'failed'::text);


--

-- Name: testing_center_idempotency_aggregate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX testing_center_idempotency_aggregate_idx ON public.testing_center_idempotency USING btree (aggregate_id, created_at);


--

-- Name: testing_center_issues_flow_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX testing_center_issues_flow_idx ON public.testing_center_technical_issues USING btree (flow_state, updated_at);


--

-- Name: testing_center_linear_webhook_issue_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX testing_center_linear_webhook_issue_order_idx ON public.testing_center_linear_webhook_deliveries USING btree (external_issue_id, webhook_timestamp_ms DESC);


--

-- Name: testing_center_promotions_candidate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX testing_center_promotions_candidate_idx ON public.testing_center_promotions USING btree (candidate_id, state);


--

-- Name: testing_center_validations_actor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX testing_center_validations_actor_idx ON public.testing_center_validations USING btree (actor_user_id, created_at DESC);


--

-- Name: testing_center_validations_candidate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX testing_center_validations_candidate_idx ON public.testing_center_validations USING btree (candidate_id, channel, exact_sha);


--

-- Name: testing_contributions_legacy_source_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX testing_contributions_legacy_source_id_key ON public.testing_contributions USING btree (legacy_source_id) WHERE (legacy_source_id IS NOT NULL);


--

-- Name: testing_contributions_triage_queue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX testing_contributions_triage_queue ON public.testing_contributions USING btree (created_at, id) WHERE (state = 'received'::text);


--

-- Name: report_creator_terms a_account_write_barrier; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON private.report_creator_terms FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array[($1->>''account_id'')::uuid]', 'select false');


--

-- Name: report_promotion_changes a_account_write_barrier; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON private.report_promotion_changes FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from private.report_promotions p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''account_id'')::uuid) a(account) where p2.account_id=($1->>''account_id'')::uuid and p2.environment=($1->>''environment'')::text) owners(account)', 'select ($1->>''account_id'' is not null and $1->>''environment'' is not null and not exists(select 1 from private.report_promotions p where p.account_id=($1->>''account_id'')::uuid and p.environment=($1->>''environment'')::text))');


--

-- Name: report_promotion_failures a_account_write_barrier; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON private.report_promotion_failures FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''account_id'')::uuid) owners(account)', 'select ($1->>''account_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''account_id'')::uuid))');


--

-- Name: report_promotion_invoice_gaps a_account_write_barrier; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON private.report_promotion_invoice_gaps FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''account_id'')::uuid) owners(account)', 'select ($1->>''account_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''account_id'')::uuid))');


--

-- Name: report_promotion_invoices a_account_write_barrier; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON private.report_promotion_invoices FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''account_id'')::uuid) owners(account)', 'select ($1->>''account_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''account_id'')::uuid))');


--

-- Name: report_promotion_launch_uses a_account_write_barrier; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON private.report_promotion_launch_uses FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''account_id'')::uuid) owners(account)', 'select ($1->>''account_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''account_id'')::uuid))');


--

-- Name: report_promotion_transfers a_account_write_barrier; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON private.report_promotion_transfers FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from private.report_promotions p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''account_id'')::uuid) a(account) where p2.account_id=($1->>''account_id'')::uuid and p2.environment=($1->>''environment'')::text) owners(account)', 'select ($1->>''account_id'' is not null and $1->>''environment'' is not null and not exists(select 1 from private.report_promotions p where p.account_id=($1->>''account_id'')::uuid and p.environment=($1->>''environment'')::text))');


--

-- Name: report_promotions a_account_write_barrier; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON private.report_promotions FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''account_id'')::uuid) owners(account)', 'select ($1->>''account_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''account_id'')::uuid))');


--

-- Name: report_renewal_candidates a_account_write_barrier; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON private.report_renewal_candidates FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array[($1->>''account_id'')::uuid]', 'select false');


--

-- Name: testing_report_admitted_keys a_account_write_barrier; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON private.testing_report_admitted_keys FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array[($1->>''account_id'')::uuid]', 'select false');


--

-- Name: testing_report_attempts a_account_write_barrier; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON private.testing_report_attempts FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select case when $1->>''scope''=''account'' then ($1->>''subject'')::uuid end) owners(account)', 'select false');


--

-- Name: testing_report_v2_keys a_account_write_barrier; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON private.testing_report_v2_keys FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_remove(array[($1->>''account_id'')::uuid,
      (select account_id from public.testing_contributions where id=($1->>''report_id'')::uuid)],null)', 'select $1->>''report_id'' is not null and not exists
      (select 1 from public.testing_contributions where id=($1->>''report_id'')::uuid)');


--

-- Name: testing_answers a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_answers FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''account_id'')::uuid) owners(account)', 'select ($1->>''account_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''account_id'')::uuid))');


--

-- Name: testing_center_audit a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_audit FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('
    select array_remove(array[
      private.testing_center_v2_owner($1->>''technical_issue_id''),
      private.testing_center_v2_owner($1->>''job_key''),
      private.testing_center_v2_owner($1->>''aggregate_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''effect_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''legacy_effect_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''superseded_by_effect_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_candidate_builds c where c.candidate_id=$1->>''candidate_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_validations v
        join public.testing_center_candidate_builds c on c.candidate_id=v.candidate_id
        where v.validation_id=$1->>''validation_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_validations v
        join public.testing_center_candidate_builds c on c.candidate_id=v.candidate_id
        where v.validation_id=$1->>''rejection_validation_id''),
      (select v.actor_user_id from public.testing_center_validations v
        where v.validation_id=$1->>''validation_id''),
      (select v.actor_user_id from public.testing_center_validations v
        where v.validation_id=$1->>''rejection_validation_id''),
      (select private.testing_center_v2_owner(b.technical_issue_id)
        from public.testing_center_linear_issue_bindings b
        where b.external_issue_id::text=$1->>''external_issue_id''),
      nullif($1->>''actor_user_id'','''')::uuid,
      nullif($1->>''requested_by_user_id'','''')::uuid,
      nullif($1->>''authorized_by_user_id'','''')::uuid
    ],null)
  ', 'select false');


--

-- Name: testing_center_candidate_builds a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_candidate_builds FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('
    select array_remove(array[
      private.testing_center_v2_owner($1->>''technical_issue_id''),
      private.testing_center_v2_owner($1->>''job_key''),
      private.testing_center_v2_owner($1->>''aggregate_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''effect_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''legacy_effect_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''superseded_by_effect_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_candidate_builds c where c.candidate_id=$1->>''candidate_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_validations v
        join public.testing_center_candidate_builds c on c.candidate_id=v.candidate_id
        where v.validation_id=$1->>''validation_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_validations v
        join public.testing_center_candidate_builds c on c.candidate_id=v.candidate_id
        where v.validation_id=$1->>''rejection_validation_id''),
      (select v.actor_user_id from public.testing_center_validations v
        where v.validation_id=$1->>''validation_id''),
      (select v.actor_user_id from public.testing_center_validations v
        where v.validation_id=$1->>''rejection_validation_id''),
      (select private.testing_center_v2_owner(b.technical_issue_id)
        from public.testing_center_linear_issue_bindings b
        where b.external_issue_id::text=$1->>''external_issue_id''),
      nullif($1->>''actor_user_id'','''')::uuid,
      nullif($1->>''requested_by_user_id'','''')::uuid,
      nullif($1->>''authorized_by_user_id'','''')::uuid
    ],null)
  ', 'select false');


--

-- Name: testing_center_codex_dossier_snapshots a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_codex_dossier_snapshots FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('
    select array_remove(array[
      private.testing_center_v2_owner($1->>''technical_issue_id''),
      private.testing_center_v2_owner($1->>''job_key''),
      private.testing_center_v2_owner($1->>''aggregate_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''effect_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''legacy_effect_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''superseded_by_effect_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_candidate_builds c where c.candidate_id=$1->>''candidate_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_validations v
        join public.testing_center_candidate_builds c on c.candidate_id=v.candidate_id
        where v.validation_id=$1->>''validation_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_validations v
        join public.testing_center_candidate_builds c on c.candidate_id=v.candidate_id
        where v.validation_id=$1->>''rejection_validation_id''),
      (select v.actor_user_id from public.testing_center_validations v
        where v.validation_id=$1->>''validation_id''),
      (select v.actor_user_id from public.testing_center_validations v
        where v.validation_id=$1->>''rejection_validation_id''),
      (select private.testing_center_v2_owner(b.technical_issue_id)
        from public.testing_center_linear_issue_bindings b
        where b.external_issue_id::text=$1->>''external_issue_id''),
      nullif($1->>''actor_user_id'','''')::uuid,
      nullif($1->>''requested_by_user_id'','''')::uuid,
      nullif($1->>''authorized_by_user_id'','''')::uuid
    ],null)
  ', 'select false');


--

-- Name: testing_center_codex_execution_control a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_codex_execution_control FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('
    select array_remove(array[
      private.testing_center_v2_owner($1->>''technical_issue_id''),
      private.testing_center_v2_owner($1->>''job_key''),
      private.testing_center_v2_owner($1->>''aggregate_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''effect_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''legacy_effect_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''superseded_by_effect_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_candidate_builds c where c.candidate_id=$1->>''candidate_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_validations v
        join public.testing_center_candidate_builds c on c.candidate_id=v.candidate_id
        where v.validation_id=$1->>''validation_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_validations v
        join public.testing_center_candidate_builds c on c.candidate_id=v.candidate_id
        where v.validation_id=$1->>''rejection_validation_id''),
      (select v.actor_user_id from public.testing_center_validations v
        where v.validation_id=$1->>''validation_id''),
      (select v.actor_user_id from public.testing_center_validations v
        where v.validation_id=$1->>''rejection_validation_id''),
      (select private.testing_center_v2_owner(b.technical_issue_id)
        from public.testing_center_linear_issue_bindings b
        where b.external_issue_id::text=$1->>''external_issue_id''),
      nullif($1->>''actor_user_id'','''')::uuid,
      nullif($1->>''requested_by_user_id'','''')::uuid,
      nullif($1->>''authorized_by_user_id'','''')::uuid
    ],null)
  ', 'select false');


--

-- Name: testing_center_codex_runs a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_codex_runs FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('
    select array_remove(array[
      private.testing_center_v2_owner($1->>''technical_issue_id''),
      private.testing_center_v2_owner($1->>''job_key''),
      private.testing_center_v2_owner($1->>''aggregate_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''effect_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''legacy_effect_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''superseded_by_effect_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_candidate_builds c where c.candidate_id=$1->>''candidate_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_validations v
        join public.testing_center_candidate_builds c on c.candidate_id=v.candidate_id
        where v.validation_id=$1->>''validation_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_validations v
        join public.testing_center_candidate_builds c on c.candidate_id=v.candidate_id
        where v.validation_id=$1->>''rejection_validation_id''),
      (select v.actor_user_id from public.testing_center_validations v
        where v.validation_id=$1->>''validation_id''),
      (select v.actor_user_id from public.testing_center_validations v
        where v.validation_id=$1->>''rejection_validation_id''),
      (select private.testing_center_v2_owner(b.technical_issue_id)
        from public.testing_center_linear_issue_bindings b
        where b.external_issue_id::text=$1->>''external_issue_id''),
      nullif($1->>''actor_user_id'','''')::uuid,
      nullif($1->>''requested_by_user_id'','''')::uuid,
      nullif($1->>''authorized_by_user_id'','''')::uuid
    ],null)
  ', 'select false');


--

-- Name: testing_center_effect_outbox a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_effect_outbox FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('
    select array_remove(array[
      private.testing_center_v2_owner($1->>''technical_issue_id''),
      private.testing_center_v2_owner($1->>''job_key''),
      private.testing_center_v2_owner($1->>''aggregate_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''effect_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''legacy_effect_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''superseded_by_effect_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_candidate_builds c where c.candidate_id=$1->>''candidate_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_validations v
        join public.testing_center_candidate_builds c on c.candidate_id=v.candidate_id
        where v.validation_id=$1->>''validation_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_validations v
        join public.testing_center_candidate_builds c on c.candidate_id=v.candidate_id
        where v.validation_id=$1->>''rejection_validation_id''),
      (select v.actor_user_id from public.testing_center_validations v
        where v.validation_id=$1->>''validation_id''),
      (select v.actor_user_id from public.testing_center_validations v
        where v.validation_id=$1->>''rejection_validation_id''),
      (select private.testing_center_v2_owner(b.technical_issue_id)
        from public.testing_center_linear_issue_bindings b
        where b.external_issue_id::text=$1->>''external_issue_id''),
      nullif($1->>''actor_user_id'','''')::uuid,
      nullif($1->>''requested_by_user_id'','''')::uuid,
      nullif($1->>''authorized_by_user_id'','''')::uuid
    ],null)
  ', 'select false');


--

-- Name: testing_center_effect_supersessions a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_effect_supersessions FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('
    select array_remove(array[
      private.testing_center_v2_owner($1->>''technical_issue_id''),
      private.testing_center_v2_owner($1->>''job_key''),
      private.testing_center_v2_owner($1->>''aggregate_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''effect_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''legacy_effect_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''superseded_by_effect_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_candidate_builds c where c.candidate_id=$1->>''candidate_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_validations v
        join public.testing_center_candidate_builds c on c.candidate_id=v.candidate_id
        where v.validation_id=$1->>''validation_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_validations v
        join public.testing_center_candidate_builds c on c.candidate_id=v.candidate_id
        where v.validation_id=$1->>''rejection_validation_id''),
      (select v.actor_user_id from public.testing_center_validations v
        where v.validation_id=$1->>''validation_id''),
      (select v.actor_user_id from public.testing_center_validations v
        where v.validation_id=$1->>''rejection_validation_id''),
      (select private.testing_center_v2_owner(b.technical_issue_id)
        from public.testing_center_linear_issue_bindings b
        where b.external_issue_id::text=$1->>''external_issue_id''),
      nullif($1->>''actor_user_id'','''')::uuid,
      nullif($1->>''requested_by_user_id'','''')::uuid,
      nullif($1->>''authorized_by_user_id'','''')::uuid
    ],null)
  ', 'select false');


--

-- Name: testing_center_issue_destinations a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_issue_destinations FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('
    select array_remove(array[
      private.testing_center_v2_owner($1->>''technical_issue_id''),
      private.testing_center_v2_owner($1->>''job_key''),
      private.testing_center_v2_owner($1->>''aggregate_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''effect_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''legacy_effect_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''superseded_by_effect_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_candidate_builds c where c.candidate_id=$1->>''candidate_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_validations v
        join public.testing_center_candidate_builds c on c.candidate_id=v.candidate_id
        where v.validation_id=$1->>''validation_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_validations v
        join public.testing_center_candidate_builds c on c.candidate_id=v.candidate_id
        where v.validation_id=$1->>''rejection_validation_id''),
      (select v.actor_user_id from public.testing_center_validations v
        where v.validation_id=$1->>''validation_id''),
      (select v.actor_user_id from public.testing_center_validations v
        where v.validation_id=$1->>''rejection_validation_id''),
      (select private.testing_center_v2_owner(b.technical_issue_id)
        from public.testing_center_linear_issue_bindings b
        where b.external_issue_id::text=$1->>''external_issue_id''),
      nullif($1->>''actor_user_id'','''')::uuid,
      nullif($1->>''requested_by_user_id'','''')::uuid,
      nullif($1->>''authorized_by_user_id'','''')::uuid
    ],null)
  ', 'select false');


--

-- Name: testing_center_linear_issue_bindings a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_linear_issue_bindings FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('
    select array_remove(array[
      private.testing_center_v2_owner($1->>''technical_issue_id''),
      private.testing_center_v2_owner($1->>''job_key''),
      private.testing_center_v2_owner($1->>''aggregate_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''effect_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''legacy_effect_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''superseded_by_effect_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_candidate_builds c where c.candidate_id=$1->>''candidate_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_validations v
        join public.testing_center_candidate_builds c on c.candidate_id=v.candidate_id
        where v.validation_id=$1->>''validation_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_validations v
        join public.testing_center_candidate_builds c on c.candidate_id=v.candidate_id
        where v.validation_id=$1->>''rejection_validation_id''),
      (select v.actor_user_id from public.testing_center_validations v
        where v.validation_id=$1->>''validation_id''),
      (select v.actor_user_id from public.testing_center_validations v
        where v.validation_id=$1->>''rejection_validation_id''),
      (select private.testing_center_v2_owner(b.technical_issue_id)
        from public.testing_center_linear_issue_bindings b
        where b.external_issue_id::text=$1->>''external_issue_id''),
      nullif($1->>''actor_user_id'','''')::uuid,
      nullif($1->>''requested_by_user_id'','''')::uuid,
      nullif($1->>''authorized_by_user_id'','''')::uuid
    ],null)
  ', 'select false');


--

-- Name: testing_center_linear_projection_snapshots a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_linear_projection_snapshots FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('
    select array_remove(array[
      private.testing_center_v2_owner($1->>''technical_issue_id''),
      private.testing_center_v2_owner($1->>''job_key''),
      private.testing_center_v2_owner($1->>''aggregate_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''effect_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''legacy_effect_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''superseded_by_effect_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_candidate_builds c where c.candidate_id=$1->>''candidate_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_validations v
        join public.testing_center_candidate_builds c on c.candidate_id=v.candidate_id
        where v.validation_id=$1->>''validation_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_validations v
        join public.testing_center_candidate_builds c on c.candidate_id=v.candidate_id
        where v.validation_id=$1->>''rejection_validation_id''),
      (select v.actor_user_id from public.testing_center_validations v
        where v.validation_id=$1->>''validation_id''),
      (select v.actor_user_id from public.testing_center_validations v
        where v.validation_id=$1->>''rejection_validation_id''),
      (select private.testing_center_v2_owner(b.technical_issue_id)
        from public.testing_center_linear_issue_bindings b
        where b.external_issue_id::text=$1->>''external_issue_id''),
      nullif($1->>''actor_user_id'','''')::uuid,
      nullif($1->>''requested_by_user_id'','''')::uuid,
      nullif($1->>''authorized_by_user_id'','''')::uuid
    ],null)
  ', 'select false');


--

-- Name: testing_center_linear_reconciliations a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_linear_reconciliations FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('
    select array_remove(array[
      private.testing_center_v2_owner($1->>''technical_issue_id''),
      private.testing_center_v2_owner($1->>''job_key''),
      private.testing_center_v2_owner($1->>''aggregate_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''effect_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''legacy_effect_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''superseded_by_effect_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_candidate_builds c where c.candidate_id=$1->>''candidate_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_validations v
        join public.testing_center_candidate_builds c on c.candidate_id=v.candidate_id
        where v.validation_id=$1->>''validation_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_validations v
        join public.testing_center_candidate_builds c on c.candidate_id=v.candidate_id
        where v.validation_id=$1->>''rejection_validation_id''),
      (select v.actor_user_id from public.testing_center_validations v
        where v.validation_id=$1->>''validation_id''),
      (select v.actor_user_id from public.testing_center_validations v
        where v.validation_id=$1->>''rejection_validation_id''),
      (select private.testing_center_v2_owner(b.technical_issue_id)
        from public.testing_center_linear_issue_bindings b
        where b.external_issue_id::text=$1->>''external_issue_id''),
      nullif($1->>''actor_user_id'','''')::uuid,
      nullif($1->>''requested_by_user_id'','''')::uuid,
      nullif($1->>''authorized_by_user_id'','''')::uuid
    ],null)
  ', 'select false');


--

-- Name: testing_center_linear_webhook_deliveries a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_linear_webhook_deliveries FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('
    select array_remove(array[
      private.testing_center_v2_owner($1->>''technical_issue_id''),
      private.testing_center_v2_owner($1->>''job_key''),
      private.testing_center_v2_owner($1->>''aggregate_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''effect_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''legacy_effect_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''superseded_by_effect_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_candidate_builds c where c.candidate_id=$1->>''candidate_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_validations v
        join public.testing_center_candidate_builds c on c.candidate_id=v.candidate_id
        where v.validation_id=$1->>''validation_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_validations v
        join public.testing_center_candidate_builds c on c.candidate_id=v.candidate_id
        where v.validation_id=$1->>''rejection_validation_id''),
      (select v.actor_user_id from public.testing_center_validations v
        where v.validation_id=$1->>''validation_id''),
      (select v.actor_user_id from public.testing_center_validations v
        where v.validation_id=$1->>''rejection_validation_id''),
      (select private.testing_center_v2_owner(b.technical_issue_id)
        from public.testing_center_linear_issue_bindings b
        where b.external_issue_id::text=$1->>''external_issue_id''),
      nullif($1->>''actor_user_id'','''')::uuid,
      nullif($1->>''requested_by_user_id'','''')::uuid,
      nullif($1->>''authorized_by_user_id'','''')::uuid
    ],null)
  ', 'select false');


--

-- Name: testing_center_memberships a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_memberships FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''user_id'')::uuid) owners(account)', 'select ($1->>''user_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''user_id'')::uuid))');


--

-- Name: testing_center_owner_dispositions a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_owner_dispositions FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('
    select array_remove(array[
      private.testing_center_v2_owner($1->>''technical_issue_id''),
      private.testing_center_v2_owner($1->>''job_key''),
      private.testing_center_v2_owner($1->>''aggregate_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''effect_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''legacy_effect_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''superseded_by_effect_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_candidate_builds c where c.candidate_id=$1->>''candidate_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_validations v
        join public.testing_center_candidate_builds c on c.candidate_id=v.candidate_id
        where v.validation_id=$1->>''validation_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_validations v
        join public.testing_center_candidate_builds c on c.candidate_id=v.candidate_id
        where v.validation_id=$1->>''rejection_validation_id''),
      (select v.actor_user_id from public.testing_center_validations v
        where v.validation_id=$1->>''validation_id''),
      (select v.actor_user_id from public.testing_center_validations v
        where v.validation_id=$1->>''rejection_validation_id''),
      (select private.testing_center_v2_owner(b.technical_issue_id)
        from public.testing_center_linear_issue_bindings b
        where b.external_issue_id::text=$1->>''external_issue_id''),
      nullif($1->>''actor_user_id'','''')::uuid,
      nullif($1->>''requested_by_user_id'','''')::uuid,
      nullif($1->>''authorized_by_user_id'','''')::uuid
    ],null)
  ', 'select false');


--

-- Name: testing_center_pauses a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_pauses FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('
    select array_remove(array[
      private.testing_center_v2_owner($1->>''technical_issue_id''),
      private.testing_center_v2_owner($1->>''job_key''),
      private.testing_center_v2_owner($1->>''aggregate_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''effect_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''legacy_effect_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''superseded_by_effect_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_candidate_builds c where c.candidate_id=$1->>''candidate_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_validations v
        join public.testing_center_candidate_builds c on c.candidate_id=v.candidate_id
        where v.validation_id=$1->>''validation_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_validations v
        join public.testing_center_candidate_builds c on c.candidate_id=v.candidate_id
        where v.validation_id=$1->>''rejection_validation_id''),
      (select v.actor_user_id from public.testing_center_validations v
        where v.validation_id=$1->>''validation_id''),
      (select v.actor_user_id from public.testing_center_validations v
        where v.validation_id=$1->>''rejection_validation_id''),
      (select private.testing_center_v2_owner(b.technical_issue_id)
        from public.testing_center_linear_issue_bindings b
        where b.external_issue_id::text=$1->>''external_issue_id''),
      nullif($1->>''actor_user_id'','''')::uuid,
      nullif($1->>''requested_by_user_id'','''')::uuid,
      nullif($1->>''authorized_by_user_id'','''')::uuid
    ],null)
  ', 'select false');


--

-- Name: testing_center_promotions a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_promotions FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('
    select array_remove(array[
      private.testing_center_v2_owner($1->>''technical_issue_id''),
      private.testing_center_v2_owner($1->>''job_key''),
      private.testing_center_v2_owner($1->>''aggregate_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''effect_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''legacy_effect_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''superseded_by_effect_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_candidate_builds c where c.candidate_id=$1->>''candidate_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_validations v
        join public.testing_center_candidate_builds c on c.candidate_id=v.candidate_id
        where v.validation_id=$1->>''validation_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_validations v
        join public.testing_center_candidate_builds c on c.candidate_id=v.candidate_id
        where v.validation_id=$1->>''rejection_validation_id''),
      (select v.actor_user_id from public.testing_center_validations v
        where v.validation_id=$1->>''validation_id''),
      (select v.actor_user_id from public.testing_center_validations v
        where v.validation_id=$1->>''rejection_validation_id''),
      (select private.testing_center_v2_owner(b.technical_issue_id)
        from public.testing_center_linear_issue_bindings b
        where b.external_issue_id::text=$1->>''external_issue_id''),
      nullif($1->>''actor_user_id'','''')::uuid,
      nullif($1->>''requested_by_user_id'','''')::uuid,
      nullif($1->>''authorized_by_user_id'','''')::uuid
    ],null)
  ', 'select false');


--

-- Name: testing_center_technical_issues a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_technical_issues FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_remove(array[coalesce(($1->>''owner_account_id'')::uuid,(select account_id from public.testing_contributions where id=($1->>''contribution_id'')::uuid))],null)', 'select ($1->>''contribution_id'' is not null and not exists (select 1 from public.testing_contributions where id=($1->>''contribution_id'')::uuid)) or ($1->>''contribution_id'' is not null and $1->>''owner_account_id'' is not null and (select account_id from public.testing_contributions where id=($1->>''contribution_id'')::uuid) is distinct from ($1->>''owner_account_id'')::uuid)');


--

-- Name: testing_center_validation_snapshots a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_validation_snapshots FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('
    select array_remove(array[
      private.testing_center_v2_owner($1->>''technical_issue_id''),
      private.testing_center_v2_owner($1->>''job_key''),
      private.testing_center_v2_owner($1->>''aggregate_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''effect_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''legacy_effect_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''superseded_by_effect_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_candidate_builds c where c.candidate_id=$1->>''candidate_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_validations v
        join public.testing_center_candidate_builds c on c.candidate_id=v.candidate_id
        where v.validation_id=$1->>''validation_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_validations v
        join public.testing_center_candidate_builds c on c.candidate_id=v.candidate_id
        where v.validation_id=$1->>''rejection_validation_id''),
      (select v.actor_user_id from public.testing_center_validations v
        where v.validation_id=$1->>''validation_id''),
      (select v.actor_user_id from public.testing_center_validations v
        where v.validation_id=$1->>''rejection_validation_id''),
      (select private.testing_center_v2_owner(b.technical_issue_id)
        from public.testing_center_linear_issue_bindings b
        where b.external_issue_id::text=$1->>''external_issue_id''),
      nullif($1->>''actor_user_id'','''')::uuid,
      nullif($1->>''requested_by_user_id'','''')::uuid,
      nullif($1->>''authorized_by_user_id'','''')::uuid
    ],null)
  ', 'select false');


--

-- Name: testing_center_validations a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_validations FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('
    select array_remove(array[
      private.testing_center_v2_owner($1->>''technical_issue_id''),
      private.testing_center_v2_owner($1->>''job_key''),
      private.testing_center_v2_owner($1->>''aggregate_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''effect_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''legacy_effect_id''),
      (select private.testing_center_v2_owner(e.technical_issue_id)
        from public.testing_center_effect_outbox e where e.effect_id=$1->>''superseded_by_effect_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_candidate_builds c where c.candidate_id=$1->>''candidate_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_validations v
        join public.testing_center_candidate_builds c on c.candidate_id=v.candidate_id
        where v.validation_id=$1->>''validation_id''),
      (select private.testing_center_v2_owner(c.technical_issue_id)
        from public.testing_center_validations v
        join public.testing_center_candidate_builds c on c.candidate_id=v.candidate_id
        where v.validation_id=$1->>''rejection_validation_id''),
      (select v.actor_user_id from public.testing_center_validations v
        where v.validation_id=$1->>''validation_id''),
      (select v.actor_user_id from public.testing_center_validations v
        where v.validation_id=$1->>''rejection_validation_id''),
      (select private.testing_center_v2_owner(b.technical_issue_id)
        from public.testing_center_linear_issue_bindings b
        where b.external_issue_id::text=$1->>''external_issue_id''),
      nullif($1->>''actor_user_id'','''')::uuid,
      nullif($1->>''requested_by_user_id'','''')::uuid,
      nullif($1->>''authorized_by_user_id'','''')::uuid
    ],null)
  ', 'select false');


--

-- Name: testing_contribution_attachments a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_contribution_attachments FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.testing_contributions p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''account_id'')::uuid) a(account) where p2.id=($1->>''contribution_id'')::uuid) owners(account)', 'select ($1->>''contribution_id'' is not null and not exists(select 1 from public.testing_contributions p where p.id=($1->>''contribution_id'')::uuid))');


--

-- Name: testing_contribution_context a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_contribution_context FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.testing_contributions p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''account_id'')::uuid) a(account) where p2.id=($1->>''contribution_id'')::uuid) owners(account)', 'select ($1->>''contribution_id'' is not null and not exists(select 1 from public.testing_contributions p where p.id=($1->>''contribution_id'')::uuid))');


--

-- Name: testing_contribution_reviews a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_contribution_reviews FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''reviewer'')::uuid union select a.account from public.testing_contributions p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''account_id'')::uuid) a(account) where p2.id=($1->>''contribution_id'')::uuid) owners(account)', 'select ($1->>''contribution_id'' is not null and not exists(select 1 from public.testing_contributions p where p.id=($1->>''contribution_id'')::uuid)) or ($1->>''reviewer'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''reviewer'')::uuid))');


--

-- Name: testing_contributions a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_contributions FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=($1->>''account_id'')::uuid) owners(account)', 'select ($1->>''account_id'' is not null and not exists(select 1 from public.profiles p where p.id=($1->>''account_id'')::uuid))');


--

-- Name: testing_report_followup a_account_write_barrier; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER a_account_write_barrier BEFORE INSERT OR DELETE OR UPDATE ON public.testing_report_followup FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_agg(distinct account order by account) filter(where account is not null) from (select a.account from public.testing_contributions p2 cross join lateral (select a.account from public.profiles p1 cross join lateral (select (to_jsonb(p1)->>''id'')::uuid as account) a(account) where p1.id=(to_jsonb(p2)->>''account_id'')::uuid) a(account) where p2.id=($1->>''contribution_id'')::uuid) owners(account)', 'select ($1->>''contribution_id'' is not null and not exists(select 1 from public.testing_contributions p where p.id=($1->>''contribution_id'')::uuid))');


--

-- Name: testing_center_agent_audit b_account_write_barrier_v2; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER b_account_write_barrier_v2 BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_agent_audit FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_remove(array[private.testing_center_v2_owner($1->>''job_key'')],null)', 'select false');


--

-- Name: testing_center_agent_callbacks b_account_write_barrier_v2; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER b_account_write_barrier_v2 BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_agent_callbacks FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_remove(array[private.testing_center_v2_owner($1->>''job_key'')],null)', 'select false');


--

-- Name: testing_center_agent_effect_outbox b_account_write_barrier_v2; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER b_account_write_barrier_v2 BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_agent_effect_outbox FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_remove(array[private.testing_center_v2_owner($1->>''job_key'')],null)', 'select false');


--

-- Name: testing_center_agent_jobs b_account_write_barrier_v2; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER b_account_write_barrier_v2 BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_agent_jobs FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_remove(array[private.testing_center_v2_owner($1->>''technical_issue_id'')],null)', 'select false');


--

-- Name: testing_center_agent_phase_callbacks b_account_write_barrier_v2; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER b_account_write_barrier_v2 BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_agent_phase_callbacks FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_remove(array[private.testing_center_v2_owner($1->>''job_key'')],null)', 'select false');


--

-- Name: testing_center_agent_reservations b_account_write_barrier_v2; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER b_account_write_barrier_v2 BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_agent_reservations FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_remove(array[private.testing_center_v2_owner($1->>''job_key'')],null)', 'select false');


--

-- Name: testing_center_audit b_account_write_barrier_v2; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER b_account_write_barrier_v2 BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_audit FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_remove(array[private.testing_center_v2_owner($1->>''aggregate_id'')],null)', 'select false');


--

-- Name: testing_center_idempotency b_account_write_barrier_v2; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER b_account_write_barrier_v2 BEFORE INSERT OR DELETE OR UPDATE ON public.testing_center_idempotency FOR EACH ROW EXECUTE FUNCTION private.guard_account_write('select array_remove(array[private.testing_center_v2_owner($1->>''aggregate_id'')],null)', 'select false');


--

-- Name: testing_center_effect_outbox testing_center_effect_outbox_selected_destination; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER testing_center_effect_outbox_selected_destination AFTER INSERT OR UPDATE ON public.testing_center_effect_outbox DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.testing_center_enforce_selected_effect();


--

-- Name: testing_center_issue_destinations testing_center_issue_destinations_validate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER testing_center_issue_destinations_validate BEFORE INSERT OR UPDATE ON public.testing_center_issue_destinations FOR EACH ROW EXECUTE FUNCTION public.testing_center_validate_issue_destination();


--

-- Name: testing_contributions testing_report_acceptance_limit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER testing_report_acceptance_limit BEFORE UPDATE OF state ON public.testing_contributions FOR EACH ROW EXECUTE FUNCTION private.testing_report_acceptance_limit();


--

-- Name: testing_report_followup testing_report_activity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER testing_report_activity BEFORE UPDATE ON public.testing_report_followup FOR EACH ROW EXECUTE FUNCTION private.testing_report_activity();


--

-- Name: testing_contributions testing_report_limit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER testing_report_limit BEFORE INSERT ON public.testing_contributions FOR EACH ROW EXECUTE FUNCTION private.testing_report_limit();


--

-- Name: testing_contributions testing_report_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER testing_report_status AFTER UPDATE OF state ON public.testing_contributions FOR EACH ROW EXECUTE FUNCTION private.testing_report_status();


--

-- Name: report_promotion_changes report_promotion_changes_account_id_environment_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.report_promotion_changes
    ADD CONSTRAINT report_promotion_changes_account_id_environment_fkey FOREIGN KEY (account_id, environment) REFERENCES private.report_promotions(account_id, environment);


--

-- Name: report_promotion_creators report_promotion_creators_environment_product_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.report_promotion_creators
    ADD CONSTRAINT report_promotion_creators_environment_product_id_fkey FOREIGN KEY (environment, product_id) REFERENCES private.report_promotion_catalog(environment, product_id);


--

-- Name: report_promotion_failures report_promotion_failures_account_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.report_promotion_failures
    ADD CONSTRAINT report_promotion_failures_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.profiles(id);


--

-- Name: report_promotion_invoice_gaps report_promotion_invoice_gaps_account_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.report_promotion_invoice_gaps
    ADD CONSTRAINT report_promotion_invoice_gaps_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.profiles(id);


--

-- Name: report_promotion_invoices report_promotion_invoices_account_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.report_promotion_invoices
    ADD CONSTRAINT report_promotion_invoices_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.profiles(id);


--

-- Name: report_promotion_launch_uses report_promotion_launch_uses_account_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.report_promotion_launch_uses
    ADD CONSTRAINT report_promotion_launch_uses_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.profiles(id);


--

-- Name: report_promotion_transfers report_promotion_transfers_account_id_environment_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.report_promotion_transfers
    ADD CONSTRAINT report_promotion_transfers_account_id_environment_fkey FOREIGN KEY (account_id, environment) REFERENCES private.report_promotions(account_id, environment);


--

-- Name: report_promotions report_promotions_account_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.report_promotions
    ADD CONSTRAINT report_promotions_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.profiles(id);


--

-- Name: report_promotions report_promotions_environment_product_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.report_promotions
    ADD CONSTRAINT report_promotions_environment_product_id_fkey FOREIGN KEY (environment, product_id) REFERENCES private.report_promotion_catalog(environment, product_id);


--

-- Name: testing_report_v2_keys testing_report_v2_keys_account_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.testing_report_v2_keys
    ADD CONSTRAINT testing_report_v2_keys_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--

-- Name: testing_report_v2_keys testing_report_v2_keys_report_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.testing_report_v2_keys
    ADD CONSTRAINT testing_report_v2_keys_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.testing_contributions(id) ON DELETE CASCADE;


--

-- Name: testing_answers testing_answers_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_answers
    ADD CONSTRAINT testing_answers_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--

-- Name: testing_answers testing_answers_questionnaire_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_answers
    ADD CONSTRAINT testing_answers_questionnaire_id_fkey FOREIGN KEY (questionnaire_id) REFERENCES public.testing_questionnaires(id) ON DELETE CASCADE;


--

-- Name: testing_center_agent_audit testing_center_agent_audit_job_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_agent_audit
    ADD CONSTRAINT testing_center_agent_audit_job_key_fkey FOREIGN KEY (job_key) REFERENCES public.testing_center_agent_jobs(job_key) ON DELETE RESTRICT;


--

-- Name: testing_center_agent_callbacks testing_center_agent_callbacks_job_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_agent_callbacks
    ADD CONSTRAINT testing_center_agent_callbacks_job_key_fkey FOREIGN KEY (job_key) REFERENCES public.testing_center_agent_jobs(job_key) ON DELETE RESTRICT;


--

-- Name: testing_center_agent_effect_outbox testing_center_agent_effect_outbox_job_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_agent_effect_outbox
    ADD CONSTRAINT testing_center_agent_effect_outbox_job_key_fkey FOREIGN KEY (job_key) REFERENCES public.testing_center_agent_jobs(job_key) ON DELETE RESTRICT;


--

-- Name: testing_center_agent_jobs testing_center_agent_jobs_technical_issue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_agent_jobs
    ADD CONSTRAINT testing_center_agent_jobs_technical_issue_id_fkey FOREIGN KEY (technical_issue_id) REFERENCES public.testing_center_technical_issues(technical_issue_id) ON DELETE RESTRICT;


--

-- Name: testing_center_agent_phase_callbacks testing_center_agent_phase_callbacks_job_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_agent_phase_callbacks
    ADD CONSTRAINT testing_center_agent_phase_callbacks_job_key_fkey FOREIGN KEY (job_key) REFERENCES public.testing_center_agent_jobs(job_key) ON DELETE RESTRICT;


--

-- Name: testing_center_agent_reservations testing_center_agent_reservations_job_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_agent_reservations
    ADD CONSTRAINT testing_center_agent_reservations_job_key_fkey FOREIGN KEY (job_key) REFERENCES public.testing_center_agent_jobs(job_key) ON DELETE RESTRICT;


--

-- Name: testing_center_audit testing_center_audit_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_audit
    ADD CONSTRAINT testing_center_audit_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--

-- Name: testing_center_candidate_builds testing_center_candidate_builds_technical_issue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_candidate_builds
    ADD CONSTRAINT testing_center_candidate_builds_technical_issue_id_fkey FOREIGN KEY (technical_issue_id) REFERENCES public.testing_center_technical_issues(technical_issue_id) ON DELETE RESTRICT;


--

-- Name: testing_center_codex_dossier_snapshots testing_center_codex_dossier_snaps_rejection_validation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_codex_dossier_snapshots
    ADD CONSTRAINT testing_center_codex_dossier_snaps_rejection_validation_id_fkey FOREIGN KEY (rejection_validation_id) REFERENCES public.testing_center_validation_snapshots(validation_id) ON DELETE RESTRICT;


--

-- Name: testing_center_codex_dossier_snapshots testing_center_codex_dossier_snapshots_technical_issue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_codex_dossier_snapshots
    ADD CONSTRAINT testing_center_codex_dossier_snapshots_technical_issue_id_fkey FOREIGN KEY (technical_issue_id) REFERENCES public.testing_center_technical_issues(technical_issue_id) ON DELETE RESTRICT;


--

-- Name: testing_center_codex_execution_control testing_center_codex_execution_control_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_codex_execution_control
    ADD CONSTRAINT testing_center_codex_execution_control_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.testing_center_codex_runs(run_id) ON DELETE RESTRICT;


--

-- Name: testing_center_codex_execution_control testing_center_codex_execution_control_technical_issue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_codex_execution_control
    ADD CONSTRAINT testing_center_codex_execution_control_technical_issue_id_fkey FOREIGN KEY (technical_issue_id) REFERENCES public.testing_center_technical_issues(technical_issue_id) ON DELETE RESTRICT;


--

-- Name: testing_center_codex_runs testing_center_codex_runs_technical_issue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_codex_runs
    ADD CONSTRAINT testing_center_codex_runs_technical_issue_id_fkey FOREIGN KEY (technical_issue_id) REFERENCES public.testing_center_technical_issues(technical_issue_id) ON DELETE RESTRICT;


--

-- Name: testing_center_codex_dossier_snapshots testing_center_dossier_candidate_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_codex_dossier_snapshots
    ADD CONSTRAINT testing_center_dossier_candidate_fk FOREIGN KEY (candidate_id, channel, candidate_sha) REFERENCES public.testing_center_candidate_builds(candidate_id, channel, exact_sha) ON DELETE RESTRICT;


--

-- Name: testing_center_effect_outbox testing_center_effect_outbox_technical_issue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_effect_outbox
    ADD CONSTRAINT testing_center_effect_outbox_technical_issue_id_fkey FOREIGN KEY (technical_issue_id) REFERENCES public.testing_center_technical_issues(technical_issue_id) ON DELETE RESTRICT;


--

-- Name: testing_center_effect_supersessions testing_center_effect_supersession_superseded_by_effect_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_effect_supersessions
    ADD CONSTRAINT testing_center_effect_supersession_superseded_by_effect_id_fkey FOREIGN KEY (superseded_by_effect_id) REFERENCES public.testing_center_effect_outbox(effect_id) ON DELETE RESTRICT;


--

-- Name: testing_center_effect_supersessions testing_center_effect_supersessions_legacy_effect_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_effect_supersessions
    ADD CONSTRAINT testing_center_effect_supersessions_legacy_effect_id_fkey FOREIGN KEY (legacy_effect_id) REFERENCES public.testing_center_effect_outbox(effect_id) ON DELETE RESTRICT;


--

-- Name: testing_center_issue_destinations testing_center_issue_destinations_active_effect_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_issue_destinations
    ADD CONSTRAINT testing_center_issue_destinations_active_effect_id_fkey FOREIGN KEY (active_effect_id) REFERENCES public.testing_center_effect_outbox(effect_id) ON DELETE RESTRICT;


--

-- Name: testing_center_issue_destinations testing_center_issue_destinations_technical_issue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_issue_destinations
    ADD CONSTRAINT testing_center_issue_destinations_technical_issue_id_fkey FOREIGN KEY (technical_issue_id) REFERENCES public.testing_center_technical_issues(technical_issue_id) ON DELETE RESTRICT;


--

-- Name: testing_center_linear_issue_bindings testing_center_linear_issue_bindings_effect_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_linear_issue_bindings
    ADD CONSTRAINT testing_center_linear_issue_bindings_effect_id_fkey FOREIGN KEY (effect_id) REFERENCES public.testing_center_effect_outbox(effect_id) ON DELETE RESTRICT;


--

-- Name: testing_center_linear_issue_bindings testing_center_linear_issue_bindings_technical_issue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_linear_issue_bindings
    ADD CONSTRAINT testing_center_linear_issue_bindings_technical_issue_id_fkey FOREIGN KEY (technical_issue_id) REFERENCES public.testing_center_technical_issues(technical_issue_id) ON DELETE RESTRICT;


--

-- Name: testing_center_linear_projection_snapshots testing_center_linear_projection_snapsh_technical_issue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_linear_projection_snapshots
    ADD CONSTRAINT testing_center_linear_projection_snapsh_technical_issue_id_fkey FOREIGN KEY (technical_issue_id) REFERENCES public.testing_center_technical_issues(technical_issue_id) ON DELETE RESTRICT;


--

-- Name: testing_center_linear_projection_snapshots testing_center_linear_projection_snapshots_effect_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_linear_projection_snapshots
    ADD CONSTRAINT testing_center_linear_projection_snapshots_effect_id_fkey FOREIGN KEY (effect_id) REFERENCES public.testing_center_effect_outbox(effect_id) ON DELETE RESTRICT;


--

-- Name: testing_center_linear_reconciliations testing_center_linear_reconciliations_effect_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_linear_reconciliations
    ADD CONSTRAINT testing_center_linear_reconciliations_effect_id_fkey FOREIGN KEY (effect_id) REFERENCES public.testing_center_effect_outbox(effect_id) ON DELETE RESTRICT;


--

-- Name: testing_center_linear_reconciliations testing_center_linear_reconciliations_external_issue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_linear_reconciliations
    ADD CONSTRAINT testing_center_linear_reconciliations_external_issue_id_fkey FOREIGN KEY (external_issue_id) REFERENCES public.testing_center_linear_issue_bindings(external_issue_id) ON DELETE RESTRICT;


--

-- Name: testing_center_linear_reconciliations testing_center_linear_reconciliations_technical_issue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_linear_reconciliations
    ADD CONSTRAINT testing_center_linear_reconciliations_technical_issue_id_fkey FOREIGN KEY (technical_issue_id) REFERENCES public.testing_center_technical_issues(technical_issue_id) ON DELETE RESTRICT;


--

-- Name: testing_center_linear_webhook_deliveries testing_center_linear_webhook_deliveries_external_issue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_linear_webhook_deliveries
    ADD CONSTRAINT testing_center_linear_webhook_deliveries_external_issue_id_fkey FOREIGN KEY (external_issue_id) REFERENCES public.testing_center_linear_issue_bindings(external_issue_id) ON DELETE RESTRICT;


--

-- Name: testing_center_memberships testing_center_memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_memberships
    ADD CONSTRAINT testing_center_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--

-- Name: testing_center_owner_dispositions testing_center_owner_dispositions_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_owner_dispositions
    ADD CONSTRAINT testing_center_owner_dispositions_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--

-- Name: testing_center_owner_dispositions testing_center_owner_dispositions_dossier_digest_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_owner_dispositions
    ADD CONSTRAINT testing_center_owner_dispositions_dossier_digest_fkey FOREIGN KEY (dossier_digest) REFERENCES public.testing_center_codex_dossier_snapshots(dossier_digest) ON DELETE RESTRICT;


--

-- Name: testing_center_owner_dispositions testing_center_owner_dispositions_rejection_validation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_owner_dispositions
    ADD CONSTRAINT testing_center_owner_dispositions_rejection_validation_id_fkey FOREIGN KEY (rejection_validation_id) REFERENCES public.testing_center_validation_snapshots(validation_id) ON DELETE RESTRICT;


--

-- Name: testing_center_owner_dispositions testing_center_owner_dispositions_technical_issue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_owner_dispositions
    ADD CONSTRAINT testing_center_owner_dispositions_technical_issue_id_fkey FOREIGN KEY (technical_issue_id) REFERENCES public.testing_center_technical_issues(technical_issue_id) ON DELETE RESTRICT;


--

-- Name: testing_center_pauses testing_center_pauses_requested_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_pauses
    ADD CONSTRAINT testing_center_pauses_requested_by_user_id_fkey FOREIGN KEY (requested_by_user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--

-- Name: testing_center_pauses testing_center_pauses_technical_issue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_pauses
    ADD CONSTRAINT testing_center_pauses_technical_issue_id_fkey FOREIGN KEY (technical_issue_id) REFERENCES public.testing_center_technical_issues(technical_issue_id) ON DELETE RESTRICT;


--

-- Name: testing_center_promotions testing_center_promotions_authorized_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_promotions
    ADD CONSTRAINT testing_center_promotions_authorized_by_user_id_fkey FOREIGN KEY (authorized_by_user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--

-- Name: testing_center_promotions testing_center_promotions_candidate_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_promotions
    ADD CONSTRAINT testing_center_promotions_candidate_fk FOREIGN KEY (candidate_id, from_channel, exact_sha) REFERENCES public.testing_center_candidate_builds(candidate_id, channel, exact_sha) ON DELETE RESTRICT;


--

-- Name: testing_center_promotions testing_center_promotions_validation_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_promotions
    ADD CONSTRAINT testing_center_promotions_validation_fk FOREIGN KEY (validation_id, candidate_id, from_channel, validated_sha, validation_decision) REFERENCES public.testing_center_validations(validation_id, candidate_id, channel, exact_sha, decision) ON DELETE RESTRICT;


--

-- Name: testing_center_technical_issues testing_center_technical_issues_contribution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_technical_issues
    ADD CONSTRAINT testing_center_technical_issues_contribution_id_fkey FOREIGN KEY (contribution_id) REFERENCES public.testing_contributions(id) ON DELETE RESTRICT;


--

-- Name: testing_center_validation_snapshots testing_center_validation_snapshot_candidate_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_validation_snapshots
    ADD CONSTRAINT testing_center_validation_snapshot_candidate_fk FOREIGN KEY (candidate_id, channel, candidate_sha) REFERENCES public.testing_center_candidate_builds(candidate_id, channel, exact_sha) ON DELETE RESTRICT;


--

-- Name: testing_center_validation_snapshots testing_center_validation_snapshots_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_validation_snapshots
    ADD CONSTRAINT testing_center_validation_snapshots_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--

-- Name: testing_center_validation_snapshots testing_center_validation_snapshots_technical_issue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_validation_snapshots
    ADD CONSTRAINT testing_center_validation_snapshots_technical_issue_id_fkey FOREIGN KEY (technical_issue_id) REFERENCES public.testing_center_technical_issues(technical_issue_id) ON DELETE RESTRICT;


--

-- Name: testing_center_validation_snapshots testing_center_validation_snapshots_validation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_validation_snapshots
    ADD CONSTRAINT testing_center_validation_snapshots_validation_id_fkey FOREIGN KEY (validation_id) REFERENCES public.testing_center_validations(validation_id) ON DELETE RESTRICT;


--

-- Name: testing_center_validations testing_center_validations_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_validations
    ADD CONSTRAINT testing_center_validations_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--

-- Name: testing_center_validations testing_center_validations_candidate_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_center_validations
    ADD CONSTRAINT testing_center_validations_candidate_fk FOREIGN KEY (candidate_id, channel, exact_sha, candidate_author_id) REFERENCES public.testing_center_candidate_builds(candidate_id, channel, exact_sha, author_id) ON DELETE RESTRICT;


--

-- Name: testing_contribution_attachments testing_contribution_attachments_contribution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_contribution_attachments
    ADD CONSTRAINT testing_contribution_attachments_contribution_id_fkey FOREIGN KEY (contribution_id) REFERENCES public.testing_contributions(id) ON DELETE CASCADE;


--

-- Name: testing_contribution_context testing_contribution_context_contribution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_contribution_context
    ADD CONSTRAINT testing_contribution_context_contribution_id_fkey FOREIGN KEY (contribution_id) REFERENCES public.testing_contributions(id) ON DELETE CASCADE;


--

-- Name: testing_contribution_reviews testing_contribution_reviews_contribution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_contribution_reviews
    ADD CONSTRAINT testing_contribution_reviews_contribution_id_fkey FOREIGN KEY (contribution_id) REFERENCES public.testing_contributions(id) ON DELETE CASCADE;


--

-- Name: testing_contribution_reviews testing_contribution_reviews_reviewer_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_contribution_reviews
    ADD CONSTRAINT testing_contribution_reviews_reviewer_fkey FOREIGN KEY (reviewer) REFERENCES public.profiles(id) ON DELETE SET NULL;


--

-- Name: testing_contributions testing_contributions_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_contributions
    ADD CONSTRAINT testing_contributions_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--

-- Name: testing_report_followup testing_report_followup_contribution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testing_report_followup
    ADD CONSTRAINT testing_report_followup_contribution_id_fkey FOREIGN KEY (contribution_id) REFERENCES public.testing_contributions(id) ON DELETE CASCADE;


--

-- Name: report_creator_remainders; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.report_creator_remainders ENABLE ROW LEVEL SECURITY;

--

-- Name: report_creator_terms; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.report_creator_terms ENABLE ROW LEVEL SECURITY;

--

-- Name: report_promotion_catalog; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.report_promotion_catalog ENABLE ROW LEVEL SECURITY;

--

-- Name: report_promotion_changes; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.report_promotion_changes ENABLE ROW LEVEL SECURITY;

--

-- Name: report_promotion_creators; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.report_promotion_creators ENABLE ROW LEVEL SECURITY;

--

-- Name: report_promotion_failures; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.report_promotion_failures ENABLE ROW LEVEL SECURITY;

--

-- Name: report_promotion_invoice_gaps; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.report_promotion_invoice_gaps ENABLE ROW LEVEL SECURITY;

--

-- Name: report_promotion_invoices; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.report_promotion_invoices ENABLE ROW LEVEL SECURITY;

--

-- Name: report_promotion_launch_uses; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.report_promotion_launch_uses ENABLE ROW LEVEL SECURITY;

--

-- Name: report_promotion_policy; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.report_promotion_policy ENABLE ROW LEVEL SECURITY;

--

-- Name: report_promotion_transfers; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.report_promotion_transfers ENABLE ROW LEVEL SECURITY;

--

-- Name: report_promotions; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.report_promotions ENABLE ROW LEVEL SECURITY;

--

-- Name: report_renewal_candidates; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.report_renewal_candidates ENABLE ROW LEVEL SECURITY;

--

-- Name: testing_report_admitted_keys; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.testing_report_admitted_keys ENABLE ROW LEVEL SECURITY;

--

-- Name: testing_report_attempts; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.testing_report_attempts ENABLE ROW LEVEL SECURITY;

--

-- Name: testing_report_v2_keys; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.testing_report_v2_keys ENABLE ROW LEVEL SECURITY;

--

-- Name: testing_answers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_answers ENABLE ROW LEVEL SECURITY;

--

-- Name: testing_answers testing_answers_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY testing_answers_read ON public.testing_answers FOR SELECT TO authenticated USING (((account_id = private.current_account()) AND (EXISTS ( SELECT 1
   FROM public.testing_questionnaires q
  WHERE (q.id = testing_answers.questionnaire_id)))));


--

-- Name: testing_contribution_attachments testing_attachments_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY testing_attachments_self ON public.testing_contribution_attachments FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.testing_contributions c
  WHERE (c.id = testing_contribution_attachments.contribution_id))));


--

-- Name: testing_center_agent_audit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_center_agent_audit ENABLE ROW LEVEL SECURITY;

--

-- Name: testing_center_agent_callbacks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_center_agent_callbacks ENABLE ROW LEVEL SECURITY;

--

-- Name: testing_center_agent_effect_outbox; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_center_agent_effect_outbox ENABLE ROW LEVEL SECURITY;

--

-- Name: testing_center_agent_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_center_agent_jobs ENABLE ROW LEVEL SECURITY;

--

-- Name: testing_center_agent_phase_callbacks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_center_agent_phase_callbacks ENABLE ROW LEVEL SECURITY;

--

-- Name: testing_center_agent_reservations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_center_agent_reservations ENABLE ROW LEVEL SECURITY;

--

-- Name: testing_center_audit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_center_audit ENABLE ROW LEVEL SECURITY;

--

-- Name: testing_center_build_identities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_center_build_identities ENABLE ROW LEVEL SECURITY;

--

-- Name: testing_center_candidate_builds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_center_candidate_builds ENABLE ROW LEVEL SECURITY;

--

-- Name: testing_center_candidate_builds testing_center_candidates_select_channel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY testing_center_candidates_select_channel ON public.testing_center_candidate_builds FOR SELECT TO authenticated USING (public.testing_center_can_view_channel(channel));


--

-- Name: testing_center_codex_dossier_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_center_codex_dossier_snapshots ENABLE ROW LEVEL SECURITY;

--

-- Name: testing_center_codex_execution_control; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_center_codex_execution_control ENABLE ROW LEVEL SECURITY;

--

-- Name: testing_center_codex_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_center_codex_runs ENABLE ROW LEVEL SECURITY;

--

-- Name: testing_center_effect_outbox; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_center_effect_outbox ENABLE ROW LEVEL SECURITY;

--

-- Name: testing_center_effect_supersessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_center_effect_supersessions ENABLE ROW LEVEL SECURITY;

--

-- Name: testing_center_github_deliveries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_center_github_deliveries ENABLE ROW LEVEL SECURITY;

--

-- Name: testing_center_idempotency; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_center_idempotency ENABLE ROW LEVEL SECURITY;

--

-- Name: testing_center_issue_destinations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_center_issue_destinations ENABLE ROW LEVEL SECURITY;

--

-- Name: testing_center_technical_issues testing_center_issues_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY testing_center_issues_select_own ON public.testing_center_technical_issues FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.testing_contributions c
  WHERE ((c.id = testing_center_technical_issues.contribution_id) AND ((c.account_id = private.current_account()) OR (public.testing_center_current_role() = 'owner'::text))))));


--

-- Name: testing_center_linear_issue_bindings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_center_linear_issue_bindings ENABLE ROW LEVEL SECURITY;

--

-- Name: testing_center_linear_migration_metadata; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_center_linear_migration_metadata ENABLE ROW LEVEL SECURITY;

--

-- Name: testing_center_linear_projection_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_center_linear_projection_snapshots ENABLE ROW LEVEL SECURITY;

--

-- Name: testing_center_linear_reconciliations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_center_linear_reconciliations ENABLE ROW LEVEL SECURITY;

--

-- Name: testing_center_linear_state_mappings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_center_linear_state_mappings ENABLE ROW LEVEL SECURITY;

--

-- Name: testing_center_linear_webhook_deliveries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_center_linear_webhook_deliveries ENABLE ROW LEVEL SECURITY;

--

-- Name: testing_center_memberships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_center_memberships ENABLE ROW LEVEL SECURITY;

--

-- Name: testing_center_memberships testing_center_memberships_select_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY testing_center_memberships_select_self ON public.testing_center_memberships FOR SELECT TO authenticated USING (((user_id = private.current_account()) AND active));


--

-- Name: testing_center_owner_dispositions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_center_owner_dispositions ENABLE ROW LEVEL SECURITY;

--

-- Name: testing_center_pauses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_center_pauses ENABLE ROW LEVEL SECURITY;

--

-- Name: testing_center_promotions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_center_promotions ENABLE ROW LEVEL SECURITY;

--

-- Name: testing_center_technical_issues; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_center_technical_issues ENABLE ROW LEVEL SECURITY;

--

-- Name: testing_center_validation_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_center_validation_snapshots ENABLE ROW LEVEL SECURITY;

--

-- Name: testing_center_validations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_center_validations ENABLE ROW LEVEL SECURITY;

--

-- Name: testing_contribution_context testing_context_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY testing_context_self ON public.testing_contribution_context FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.testing_contributions c
  WHERE (c.id = testing_contribution_context.contribution_id))));


--

-- Name: testing_contribution_attachments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_contribution_attachments ENABLE ROW LEVEL SECURITY;

--

-- Name: testing_contribution_context; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_contribution_context ENABLE ROW LEVEL SECURITY;

--

-- Name: testing_contribution_reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_contribution_reviews ENABLE ROW LEVEL SECURITY;

--

-- Name: testing_contributions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_contributions ENABLE ROW LEVEL SECURITY;

--

-- Name: testing_contributions testing_contributions_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY testing_contributions_owner ON public.testing_contributions FOR SELECT TO authenticated USING ((public.testing_center_current_role() = 'owner'::text));


--

-- Name: testing_contributions testing_contributions_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY testing_contributions_read ON public.testing_contributions FOR SELECT TO authenticated USING ((account_id = private.current_account()));


--

-- Name: testing_questionnaires; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_questionnaires ENABLE ROW LEVEL SECURITY;

--

-- Name: testing_questionnaires testing_questionnaires_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY testing_questionnaires_read ON public.testing_questionnaires FOR SELECT TO authenticated USING ((published AND public.testing_center_can_view_channel(channel)));


--

-- Name: testing_report_followup; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testing_report_followup ENABLE ROW LEVEL SECURITY;

--

-- Name: testing_report_followup testing_report_followup_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY testing_report_followup_own ON public.testing_report_followup FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.testing_contributions c
  WHERE ((c.id = testing_report_followup.contribution_id) AND (c.account_id = private.current_account())))));


--

-- Name: testing_contribution_reviews testing_reviews_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY testing_reviews_self ON public.testing_contribution_reviews FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.testing_contributions c
  WHERE (c.id = testing_contribution_reviews.contribution_id))));


--

-- Name: testing_contribution_attachments triage_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY triage_read ON public.testing_contribution_attachments FOR SELECT TO vantare_triage USING ((EXISTS ( SELECT 1
   FROM public.testing_contributions c
  WHERE ((c.id = testing_contribution_attachments.contribution_id) AND (c.created_at > (statement_timestamp() - '30 days'::interval))))));


--

-- Name: testing_contribution_context triage_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY triage_read ON public.testing_contribution_context FOR SELECT TO vantare_triage USING ((EXISTS ( SELECT 1
   FROM public.testing_contributions c
  WHERE ((c.id = testing_contribution_context.contribution_id) AND (c.created_at > (statement_timestamp() - '30 days'::interval))))));


--

-- Name: testing_contributions triage_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY triage_read ON public.testing_contributions FOR SELECT TO vantare_triage USING ((created_at > (statement_timestamp() - '30 days'::interval)));


--

-- Catalog: private.report_promotion_catalog (0 rows)


-- Catalog: private.report_promotion_policy (1 rows)
-- {"reward_valid_months": 6, "singleton": true}
