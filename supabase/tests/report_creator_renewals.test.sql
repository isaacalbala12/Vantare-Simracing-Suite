
begin;
select no_plan();
select ok(not has_function_privilege('authenticated','public.report_promotion_renewal_prepare(uuid,integer,integer,timestamptz)','execute'),'shared writer is service-only');
select ok(not has_function_privilege('service_role','public.report_promotion_claim_before_1661(uuid,uuid,timestamptz)','execute'),'old claim cannot bypass shared lease');
select ok(not has_function_privilege('service_role','public.report_promotion_ack_before_1661(uuid,uuid,timestamptz,text,text)','execute'),'old ACK cannot bypass shared lease');
select ok(not has_table_privilege('service_role','private.report_creator_remainders','insert'),'remainder coupons require operator validation');
select to_regclass('private.creator_renewal_operations') is not null as integrated \gset
\if :integrated
select ok(public.install_report_creator_bridge(),'shared #1661 writer installed');
select ok(public.install_report_creator_bridge(),'installer idempotent');
select ok(not has_function_privilege('service_role','private.billing_set_report_candidate_before_1593(text,uuid,text,uuid,integer,timestamptz)','execute'),'publisher alias cannot bypass the shared B03 lock');


-- Runtime lock observation, not a source-string assertion: creator-only calls
-- acquire B03 and never take the opposite legacy checkout lock afterwards.
insert into public.profiles(id) values('15936611-0000-4000-8000-000000000040');
create function pg_temp.owns_account_lock(a uuid,seed bigint) returns boolean language sql as $$
 select exists(select 1 from pg_locks where pid=pg_backend_pid() and locktype='advisory' and objsubid=1
 and ((classid::bigint<<32)|objid::bigint)=pg_catalog.hashtextextended(a::text,seed))
$$;
select ok(not pg_temp.owns_account_lock('15936611-0000-4000-8000-000000000040',0),'fresh account has no legacy checkout lock');
select public.billing_creator_renewal_prepare('sandbox','15936611-0000-4000-8000-000000000040',null,'lock-probe','none','15936611-0000-4000-8000-000000000005','pro_monthly',null,120);
select ok(pg_temp.owns_account_lock('15936611-0000-4000-8000-000000000040',1608),'creator-only selector participates in B03 account barrier');
select ok(not pg_temp.owns_account_lock('15936611-0000-4000-8000-000000000040',0),'selector never reverses lock order by acquiring legacy checkout lock');
-- Ordinary report-only client publishes a candidate before any creator attribution appears.
insert into public.profiles(id) values('15936611-0000-4000-8000-000000000020');
insert into private.report_promotion_catalog values('sandbox','15936611-0000-4000-8000-000000000021','pro_plus',999,699,'15936611-0000-4000-8000-000000000022','15936611-0000-4000-8000-000000000023','15936611-0000-4000-8000-000000000024');
insert into public.billing_subscriptions(user_id,provider,environment,provider_subscription_id,provider_product_id,status,current_period_start,current_period_end)
values('15936611-0000-4000-8000-000000000020','polar','sandbox','report-only','15936611-0000-4000-8000-000000000021','active','2026-10-26 19:00 Europe/Madrid','2026-11-26 19:00 Europe/Madrid');
select public.report_promotion_observe('15936611-0000-4000-8000-000000000020','sandbox','report-only','15936611-0000-4000-8000-000000000021','2026-10-26 19:00 Europe/Madrid','2026-10-26 19:00 Europe/Madrid',null);
select * from public.billing_record_order_snapshot('sandbox','report-only-initial','15936611-0000-4000-8000-000000000020','15936611-0000-4000-8000-000000000021',null,'paid',true,699,'eur',0,'2026-10-26 19:00 Europe/Madrid',repeat('a',64),'report-only');
select public.report_promotion_invoice('sandbox','report-only-initial',null,0,'2026-10-26 19:00 Europe/Madrid','2026-10-26 19:00 Europe/Madrid','2026-11-26 19:00 Europe/Madrid',true);
update private.report_promotions set tier=3,reward_granted_at='2026-10-28 19:00 Europe/Madrid',reward_expires_at='2027-04-28 19:00 Europe/Madrid' where subscription_id='report-only';
create temporary table only_report as select public.report_promotion_prepare('15936611-0000-4000-8000-000000000020','sandbox','2026-11-01') op;
select is(public.report_promotion_renewal_prepare((select (op->>'id')::uuid from only_report),200,11,'2026-11-01')->>'discount_id','15936611-0000-4000-8000-000000000023','only reports Plus: fixed 300 cents, no creator operation needed');
select is((select savings_cents from private.report_renewal_candidates where subscription_id='report-only'),300,'late attribution will see the already-published reports candidate');
select ok(public.report_promotion_claim((select (op->>'id')::uuid from only_report),'15936611-0000-4000-8000-000000000025','2026-11-01'),'ordinary report-only lease acquired');
select is(public.billing_creator_renewal_prepare('sandbox','15936611-0000-4000-8000-000000000020',null,'report-only','report-only-initial','15936611-0000-4000-8000-000000000021','pro_plus_monthly',null,200)->>'busy','true','late creator initialization waits for report-only lease before touching subscription');
select ok(public.report_promotion_ack((select (op->>'id')::uuid from only_report),'15936611-0000-4000-8000-000000000025','2026-11-01'),'ordinary report-only ACK');
delete from private.report_renewal_candidates where subscription_id='report-only';
-- Fixtures use real #1661 attribution/paid-order API. No forged event metadata.
insert into public.profiles(id) values('15936611-0000-4000-8000-000000000001');
insert into private.admin_creators(creator_id,environment,name,email,code,status,discount_id) values('15936611-0000-4000-8000-000000000002','sandbox','Test','fixture@example.invalid','REPORTS','active','15936611-0000-4000-8000-000000000003');
select * from public.claim_billing_checkout_attempt('15936611-0000-4000-8000-000000000001','15936611-0000-4000-8000-000000000004','pro_monthly','sandbox','joint');
select ok(public.billing_save_creator_attribution('15936611-0000-4000-8000-000000000001','sandbox','15936611-0000-4000-8000-000000000004','REPORTS','15936611-0000-4000-8000-000000000003'),'creator attribution persisted');
select ok(public.complete_billing_checkout_attempt('15936611-0000-4000-8000-000000000001','15936611-0000-4000-8000-000000000004','joint-checkout','https://sandbox.polar.sh/checkout/joint'),'checkout binding persisted');
insert into private.report_promotion_catalog values('sandbox','15936611-0000-4000-8000-000000000005','pro',599,399,'15936611-0000-4000-8000-000000000006','15936611-0000-4000-8000-000000000007','15936611-0000-4000-8000-000000000008');
insert into public.billing_subscriptions(user_id,provider,environment,provider_subscription_id,provider_product_id,status,current_period_start,current_period_end)
values('15936611-0000-4000-8000-000000000001','polar','sandbox','joint-sub','15936611-0000-4000-8000-000000000005','active','2026-10-26 19:00 Europe/Madrid','2026-11-26 19:00 Europe/Madrid');
select public.report_promotion_observe('15936611-0000-4000-8000-000000000001','sandbox','joint-sub','15936611-0000-4000-8000-000000000005','2026-10-26 19:00 Europe/Madrid','2026-10-26 19:00 Europe/Madrid','15936611-0000-4000-8000-000000000006');
select is(public.report_promotion_prepare('15936611-0000-4000-8000-000000000001','sandbox','2026-10-27'),null::jsonb,'neither reward can replace the unpaid first period');
select * from public.billing_record_order_snapshot('sandbox','joint-initial','15936611-0000-4000-8000-000000000001','15936611-0000-4000-8000-000000000005','joint-checkout','paid',true,399,'eur',0,'2026-10-26 19:00 Europe/Madrid',repeat('a',64),'joint-sub');
select public.report_promotion_invoice('sandbox','joint-initial','15936611-0000-4000-8000-000000000006',200,'2026-10-26 19:00 Europe/Madrid','2026-10-26 19:00 Europe/Madrid','2026-11-26 19:00 Europe/Madrid',true);

select is(public.billing_creator_renewal_prepare('sandbox','15936611-0000-4000-8000-000000000001','joint-checkout','joint-sub','joint-initial','15936611-0000-4000-8000-000000000005','pro_monthly','15936611-0000-4000-8000-000000000006',120),null::jsonb,'campaign webhook stages attribution and delegates external writing without error');
select is((select state from private.creator_renewal_operations where subscription_id='joint-sub'),'pending','initial creator attribution awaits the single report-campaign writer');
create temporary table creator_only_op as select public.report_promotion_prepare('15936611-0000-4000-8000-000000000001','sandbox','2026-10-27') op;
create temporary table chosen as select public.report_promotion_renewal_prepare((select (op->>'id')::uuid from creator_only_op),120,11,'2026-10-27') op;
select is((select op->>'discount_id' from chosen),'15936611-0000-4000-8000-000000000003','only creator: #1661 selects 20 percent for first renewal');
select ok(public.report_promotion_claim((select (op->>'id')::uuid from creator_only_op),'15936611-0000-4000-8000-000000000032','2026-10-27'),'creator-only shared operation claimed');
select ok(public.report_promotion_ack((select (op->>'id')::uuid from creator_only_op),'15936611-0000-4000-8000-000000000032','2026-10-27'),'creator-only shared operation acknowledged');
select is((select count(*)::int from private.report_promotion_invoices where not is_initial),0,'initial paid invoice never spends report months');
-- Later eligibility: human-reviewed tier fixtures are already tested by report_promotion.test.sql.
-- Set the persisted award here to focus integration on the real shared RPC/lease.
update private.report_promotions set tier=3,reward_granted_at='2026-10-28 19:00 Europe/Madrid',reward_expires_at='2027-04-28 19:00 Europe/Madrid' where subscription_id='joint-sub';
create temporary table report_op as select public.report_promotion_prepare('15936611-0000-4000-8000-000000000001','sandbox','2026-11-01') op;
select ok(not public.report_promotion_claim((select (op->>'id')::uuid from report_op),'15936611-0000-4000-8000-000000000099','2026-11-01'),'report writer cannot bypass creator lease by using old claim alone');
truncate chosen;
insert into chosen select public.report_promotion_renewal_prepare((select (op->>'id')::uuid from report_op),120,11,'2026-11-01');
select is((select op->>'discount_id' from chosen),'15936611-0000-4000-8000-000000000007','both: 200 cents reports beats creator 120');
select is((select not_applied from private.creator_renewal_operations where subscription_id='joint-sub'),'creator:reports_save_more_or_equal','Owner receives losing offer');
select is(public.billing_creator_renewal_prepare('sandbox','15936611-0000-4000-8000-000000000001',null,'joint-sub','joint-initial','15936611-0000-4000-8000-000000000005','pro_monthly',null,120),null::jsonb,'creator webhook delegates and cannot overlap reports writer');
select ok(public.report_promotion_claim((select (op->>'id')::uuid from report_op),'15936611-0000-4000-8000-000000000009','2026-11-01'),'report claim requires shared lease');
select ok(public.report_promotion_ack((select (op->>'id')::uuid from report_op),'15936611-0000-4000-8000-000000000009','2026-11-01'),'report ACK also finishes shared lease');
select is((select applied_discount from private.report_promotions where subscription_id='joint-sub'),'15936611-0000-4000-8000-000000000007','actual chosen discount audited');
select is(private.native_admin_account('15936611-0000-4000-8000-000000000001','fixture','sandbox')->'report_promotion'->>'tier','3','Owner preserves reports alongside #1661 plan/payments/incidents');

-- Previous rounds' commercial rules continue to hold when a creator is present.
savepoint shared_plan;
update public.billing_subscriptions set provider_product_id='15936611-0000-4000-8000-000000000021' where provider_subscription_id='joint-sub';
select lives_ok($$select public.report_promotion_observe('15936611-0000-4000-8000-000000000001','sandbox','joint-sub','15936611-0000-4000-8000-000000000021','2026-10-26 19:00 Europe/Madrid','2026-11-02',null)$$,'observed plan change with creator never quarantines webhook');
create temporary table shared_plan_op as select public.report_promotion_prepare('15936611-0000-4000-8000-000000000001','sandbox','2026-11-03') op;
select is(public.report_promotion_renewal_prepare((select (op->>'id')::uuid from shared_plan_op),200,11,'2026-11-03')->>'discount_id','15936611-0000-4000-8000-000000000023','award follows observed Plus plan under shared writer');
select is((select checkout_key from private.creator_renewal_operations where subscription_id='joint-sub'),'pro_plus_monthly','observed creator product/key updated without a new attribution');
select is((select tier from private.report_promotions where subscription_id='joint-sub'),3,'plan change preserves report tier');
rollback to shared_plan;
release shared_plan;

savepoint shared_transfer;
insert into public.billing_subscriptions(user_id,provider,environment,provider_subscription_id,provider_product_id,status,current_period_start,current_period_end)
values('15936611-0000-4000-8000-000000000001','polar','sandbox','joint-replacement','15936611-0000-4000-8000-000000000005','active','2026-11-10','2026-12-10');
select public.report_promotion_observe('15936611-0000-4000-8000-000000000001','sandbox','joint-replacement','15936611-0000-4000-8000-000000000005','2026-11-10','2026-11-10',null);
create temporary table shared_transfer_op as select public.report_promotion_prepare('15936611-0000-4000-8000-000000000001','sandbox','2026-11-11') op;
select is((select op->>'kind' from shared_transfer_op),'cleanup','second subscription first cleans the old report award');
select is(public.report_promotion_renewal_prepare((select (op->>'id')::uuid from shared_transfer_op),120,11,'2026-11-11')->>'discount_id','15936611-0000-4000-8000-000000000003','old subscription retains its valid creator instead of freezing report transfer');
select ok(public.report_promotion_claim((select (op->>'id')::uuid from shared_transfer_op),'15936611-0000-4000-8000-000000000030','2026-11-11'),'shared cleanup claimed');
select ok(public.report_promotion_ack((select (op->>'id')::uuid from shared_transfer_op),'15936611-0000-4000-8000-000000000030','2026-11-11'),'shared cleanup acknowledged');
select is((select applied_discount from private.report_promotions where subscription_id='joint-replacement'),null::text,'cleanup never records predecessor creator on the new subscription');
select is(public.report_promotion_prepare('15936611-0000-4000-8000-000000000001','sandbox','2026-11-12')->>'subscription_id','joint-replacement','award continues on current subscription after shared cleanup');
rollback to shared_transfer;
release shared_transfer;

savepoint shared_refund;
update public.billing_orders set status='partially_refunded',reported_refunded_amount=1 where provider_order_id='joint-initial';
create temporary table shared_refund_op as select public.report_promotion_prepare('15936611-0000-4000-8000-000000000001','sandbox','2026-11-02') op;
select is(public.report_promotion_renewal_prepare((select (op->>'id')::uuid from shared_refund_op),120,11,'2026-11-02')->>'discount_id',null::text,'initial refund never substitutes a fresh creator coupon');
select ok(public.report_promotion_claim((select (op->>'id')::uuid from shared_refund_op),'15936611-0000-4000-8000-000000000031','2026-11-02'),'refunded account may only remove its managed discount under shared lease');
select ok(public.report_promotion_ack((select (op->>'id')::uuid from shared_refund_op),'15936611-0000-4000-8000-000000000031','2026-11-02'),'refund cleanup durable ACK');
select is((select applied_discount from private.report_promotions where subscription_id='joint-sub'),null::text,'refund removes the granted award, never stacks another benefit');
rollback to shared_refund;
release shared_refund;

-- Invoice under creator before reports fixes its original clock; reports must not reset it.
select * from public.billing_record_order_snapshot('sandbox','joint-creator-cycle','15936611-0000-4000-8000-000000000001','15936611-0000-4000-8000-000000000005',null,'paid',true,479,'eur',0,'2026-11-26 19:00 Europe/Madrid',repeat('b',64),'joint-sub');
select public.report_promotion_invoice('sandbox','joint-creator-cycle','15936611-0000-4000-8000-000000000003',120,'2026-11-26 19:00 Europe/Madrid','2026-11-26 19:00 Europe/Madrid','2026-12-26 19:00 Europe/Madrid');
-- Three report invoices, unique ids, exactly the granted balance.
create function pg_temp.settle(n int) returns void language plpgsql as $$
declare t timestamptz:=private.report_promotion_months('2026-11-26 19:00 Europe/Madrid',n);
begin
 perform public.billing_record_order_snapshot('sandbox','joint-report-'||n,'15936611-0000-4000-8000-000000000001','15936611-0000-4000-8000-000000000005',null,'paid',true,399,'eur',0,t,repeat('c',64),'joint-sub');
 perform public.report_promotion_invoice('sandbox','joint-report-'||n,'15936611-0000-4000-8000-000000000007',200,t,t,private.report_promotion_months(t,1));
end $$;
select pg_temp.settle(n) from generate_series(1,3)n;
truncate report_op;
insert into report_op select public.report_promotion_prepare('15936611-0000-4000-8000-000000000001','sandbox','2027-02-27');
select is((select op->>'discount_id' from report_op),null::text,'three report charges exhaust only reports');

select is(public.billing_creator_renewal_prepare('sandbox','15936611-0000-4000-8000-000000000001',null,'joint-sub','joint-initial','15936611-0000-4000-8000-000000000005','pro_monthly',null,120),null::jsonb,'replayed webhook cannot reattach exhausted reports from a stale candidate');
-- Restoring the full 11-month coupon would overgrant: require exact remainder.
select throws_ok($$select public.report_promotion_renewal_prepare((select (op->>'id')::uuid from report_op),120,11,'2027-02-27')$$,'P0001','creator_renewal_remainder_unconfigured','missing bounded coupon blocks extension with explicit incident code');
select public.report_promotion_failed('15936611-0000-4000-8000-000000000001','sandbox','creator_renewal_remainder_unconfigured','2027-02-27');
select is(private.report_promotion_progress('15936611-0000-4000-8000-000000000001','sandbox','2027-02-27')->>'last_error','creator_renewal_remainder_unconfigured','missing remainder coupon is a durable Owner incident');
insert into private.report_creator_remainders values('sandbox','15936611-0000-4000-8000-000000000005','15936611-0000-4000-8000-000000000003',7,'15936611-0000-4000-8000-000000000010',now());
truncate chosen;
insert into chosen select public.report_promotion_renewal_prepare((select (op->>'id')::uuid from report_op),120,11,'2027-02-27');
select is((select op->>'discount_id' from chosen),'15936611-0000-4000-8000-000000000010','winner changes back: creator uses seven remaining months, never eleven');
select is((select ends_at from private.report_creator_terms where subscription_id='joint-sub'),'2027-10-26 19:00 Europe/Madrid'::timestamptz,'creator original end survives reports');
select is((select count(*)::int from private.report_renewal_candidates),0,'reports withdrawal is durable');
select ok(public.report_promotion_claim((select (op->>'id')::uuid from report_op),'15936611-0000-4000-8000-000000000011','2027-02-27'),'bounded restore claimed');
select ok(public.report_promotion_ack((select (op->>'id')::uuid from report_op),'15936611-0000-4000-8000-000000000011','2027-02-27'),'bounded restore acknowledged');
select is((select applied_discount from private.report_promotions where subscription_id='joint-sub'),'15936611-0000-4000-8000-000000000010','actual creator remainder visible in report audit');

select is(public.report_promotion_prepare('15936611-0000-4000-8000-000000000001','sandbox','2027-03-01'),null::jsonb,'replaying restored creator does not create another change or restart coupon');
-- A stale worker cannot release another worker's lease.
select public.report_promotion_renewal_failed((select (op->>'id')::uuid from report_op),'15936611-0000-4000-8000-000000000099');
select is((select state from private.creator_renewal_operations where subscription_id='joint-sub'),'completed','foreign token cannot release common operation');
-- Future configured rate can be greater; shared arbitration still owns the comparison.
update private.report_promotions set tier=6,reward_expires_at='2027-12-01',remote_discount='15936611-0000-4000-8000-000000000010' where subscription_id='joint-sub';
truncate report_op;
insert into report_op select public.report_promotion_prepare('15936611-0000-4000-8000-000000000001','sandbox','2027-03-02');
truncate chosen;
insert into chosen select public.report_promotion_renewal_prepare((select (op->>'id')::uuid from report_op),200,11,'2027-03-02');
select is((select op->>'discount_id' from chosen),'15936611-0000-4000-8000-000000000007','equal cents: shared arbitration favors reports');
select public.report_promotion_renewal_failed((select (op->>'id')::uuid from report_op),(select (op->>'renewal_token')::uuid from chosen));
truncate chosen;
insert into chosen select public.report_promotion_renewal_prepare((select (op->>'id')::uuid from report_op),240,11,'2027-03-02');
select is((select op->>'discount_id' from chosen),'15936611-0000-4000-8000-000000000010','both: future validated higher creator saving wins without restart');
select is((select not_applied from private.creator_renewal_operations where subscription_id='joint-sub'),'reports:creator_saves_more','losing reports remain registered');
select public.report_promotion_renewal_failed((select (op->>'id')::uuid from report_op),(select (op->>'renewal_token')::uuid from chosen));
-- After the original creator end, even a larger percentage cannot suppress valid report balance.
truncate chosen;
insert into chosen select public.report_promotion_renewal_prepare((select (op->>'id')::uuid from report_op),240,11,'2027-10-27');
select is((select op->>'discount_id' from chosen),'15936611-0000-4000-8000-000000000007','time changes winner: expired creator excluded before shared comparison');
select public.report_promotion_renewal_failed((select (op->>'id')::uuid from report_op),(select (op->>'renewal_token')::uuid from chosen));

-- A confirmed report block that crossed award expiry must finish before creator resumes.
update private.report_promotions set tier=3,reward_expires_at='2027-01-01',applied_candidate='15936611-0000-4000-8000-000000000007',applied_discount='15936611-0000-4000-8000-000000000007',remote_discount='15936611-0000-4000-8000-000000000007',applied_at='2026-11-01' where subscription_id='joint-sub';
update private.report_promotion_changes set superseded_at=now() where applied_at is null and superseded_at is null;
select is(public.report_promotion_prepare('15936611-0000-4000-8000-000000000001','sandbox','2027-01-02'),null::jsonb,'expiry respects the running report block');
select ok(public.report_promotion_prepare('15936611-0000-4000-8000-000000000001','sandbox','2027-02-27') is not null,'after all three settled charges, expiry permits shared handoff');

create temporary table expired_handoff as select public.report_promotion_prepare('15936611-0000-4000-8000-000000000001','sandbox','2027-02-27') op;
select is(public.report_promotion_renewal_prepare((select (op->>'id')::uuid from expired_handoff),120,11,'2027-02-27')->>'discount_id','15936611-0000-4000-8000-000000000010','expired report balance can actually hand off to creator, not churn pending IDs');
select ok(public.report_promotion_claim((select (op->>'id')::uuid from expired_handoff),'15936611-0000-4000-8000-000000000033','2027-02-27'),'expired reports handoff lease remains stable');
select ok(public.report_promotion_ack((select (op->>'id')::uuid from expired_handoff),'15936611-0000-4000-8000-000000000033','2027-02-27'),'expired reports handoff acknowledged');
select is(public.report_promotion_prepare('15936611-0000-4000-8000-000000000001','sandbox','2027-03-01'),null::jsonb,'expired reports do not interrupt the already-running creator');
-- Reconciled earlier invoices can shorten the cached clock, never extend it.
update private.report_creator_terms set started_at='2026-12-26 19:00 Europe/Madrid',ends_at='2027-11-26 19:00 Europe/Madrid';
select is(private.report_creator_end('sandbox','joint-sub','2027-02-27'),'2027-10-26 19:00 Europe/Madrid'::timestamptz,'earlier reconciled creator invoice shortens the cached term');
-- Reports as the first rebated renewal also start the original creator clock.
update private.report_creator_terms set started_at=null,ends_at=null;
delete from private.report_promotion_invoices where order_id='joint-creator-cycle';
select is(private.report_creator_end('sandbox','joint-sub','2027-02-27'),'2027-11-26 19:00 Europe/Madrid'::timestamptz,'first rebated renewal can be reports; creator cannot start a fresh clock afterwards');
\else
select pass('Joint #1661 scenarios require prepare-report-creator-fixture.py; standalone reports stay independent');
\endif
select * from finish();
rollback;
