begin;
select no_plan();
select ok((select not rolsuper and rolbypassrls from pg_roles where rolname=current_user),'P3-5 tests execute as NOSUPERUSER BYPASSRLS');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname like 'report_promotion_%' and p.prosecdef and p.proowner<>'postgres'::regrole),0,'P3-5 every promotion definer explicitly belongs to postgres');
select ok(private.report_promotion_eligible('2026-11-02 18:59 Europe/Madrid'),'P1 end 18:59 included');
select ok(not private.report_promotion_eligible('2026-11-02 19:00 Europe/Madrid'),'P1 end 19:00 excluded');
select ok(not private.report_promotion_eligible('2026-11-02 19:01 Europe/Madrid'),'P1 end 19:01 excluded');
select ok(not private.report_promotion_eligible('2026-10-25 00:30+00'),'P1 DST first 02:30 before launch');
select ok(not private.report_promotion_eligible('2026-10-25 01:30+00'),'P1 DST repeated 02:30 before launch');
select is(extract(epoch from(private.report_promotion_months('2026-09-26 19:00 Europe/Madrid',1)-timestamptz '2026-09-26 19:00 Europe/Madrid'))/3600,721::numeric,'P1 Madrid month crosses DST');
select ok(not private.report_promotion_eligible('2026-10-26 18:59:59 Europe/Madrid'),'before launch');
select ok(private.report_promotion_eligible('2026-10-26 19:00:00 Europe/Madrid'),'launch inclusive');
select ok(private.report_promotion_eligible('2026-11-01 23:59:59 Europe/Madrid'),'end eve included');
select ok(not private.report_promotion_eligible('2026-11-02 19:00:00 Europe/Madrid'),'end exclusive');
select is(private.report_promotion_months('2026-10-26 19:00 Europe/Madrid',1),'2026-11-26 19:00 Europe/Madrid'::timestamptz,'Madrid calendar clock');
select ok(not has_function_privilege('authenticated','public.report_promotion_observe(uuid,text,text,text,timestamptz,timestamptz,text)','execute'),'clients cannot enroll');
select ok(not has_function_privilege('anon','public.report_promotion_prepare(uuid,text,timestamptz)','execute'),'anonymous cannot plan');
select ok(not has_table_privilege('service_role','private.report_promotions','insert'),'no direct service writes');
select is((select count(*)::int from pg_class where oid in ('private.report_promotions'::regclass,'private.report_promotion_changes'::regclass,'private.report_promotion_catalog'::regclass,'private.report_promotion_creators'::regclass) and relrowsecurity),4,'all new tables RLS');
insert into private.clerk_issuers values('https://promotion.clerk.invalid',array['https://app.invalid'],true);
insert into public.profiles(id) select ('15930000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid from generate_series(1,40)i;
insert into public.account_identities(issuer,subject,account_id) select 'https://promotion.clerk.invalid','user_'||replace(id::text,'-',''),id from public.profiles where id::text like '15930000%';
insert into private.report_promotion_catalog values
 ('sandbox','pro','pro',599,399,'pro1','pro3','pro6'),('sandbox','plus','pro_plus',999,699,'plus1','plus3','plus6');
insert into private.report_promotion_creators values('sandbox','pro','creator',2000,2,'2026-10-01'),('sandbox','plus','creator',2000,2,'2026-10-01');
create function pg_temp.account(n int) returns uuid language sql as $$select ('15930000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
select is(public.report_promotion_checkout(pg_temp.account(1),'sandbox','pro','2026-10-26 19:00 Europe/Madrid'),'pro1','first month launch discount');
select is(public.report_promotion_checkout(pg_temp.account(1),'sandbox','plus','2026-10-26 19:00 Europe/Madrid'),'plus1','Plus first month launch discount');
select is(public.report_promotion_checkout(pg_temp.account(1),'sandbox','pro','2026-11-02 19:00 Europe/Madrid'),null::text,'no launch outside week');
select is(public.report_promotion_checkout(pg_temp.account(1),'sandbox','annual','2026-10-27'),null::text,'annual catalog not eligible');
create function pg_temp.enroll(n int,product text default 'pro',started timestamptz default '2026-10-26 19:00 Europe/Madrid',discount text default 'pro1') returns void language plpgsql as $$begin
 insert into public.billing_subscriptions(user_id,provider,environment,provider_subscription_id,provider_product_id,status,current_period_start,current_period_end)
 values(pg_temp.account(n),'polar','sandbox','sub'||n,product,'active',started,private.report_promotion_months(started,1));
 if n<>9 then
 insert into public.billing_orders(user_id,provider,environment,provider_order_id,provider_product_id,provider_subscription_id,status,paid,net_amount,currency,remote_modified_at,snapshot_hash)
 values(pg_temp.account(n),'polar','sandbox','first-invoice'||n,product,'sub'||n,'paid',true,399,'eur',started,repeat('a',64));
 perform public.report_promotion_invoice('sandbox','first-invoice'||n,discount,0,started,started,private.report_promotion_months(started,1),true);
 end if;
 perform public.report_promotion_observe(pg_temp.account(n),'sandbox','sub'||n,product,started,started,discount);
end$$;
select pg_temp.enroll(1); select pg_temp.enroll(2,'plus','2026-10-26 19:00 Europe/Madrid','creator');
select pg_temp.enroll(3,'annual'); select pg_temp.enroll(4,'pro','2026-11-02 19:00 Europe/Madrid');
select pg_temp.enroll(5,'pro','2026-10-26 18:59 Europe/Madrid'); select pg_temp.enroll(6); select pg_temp.enroll(7); select pg_temp.enroll(9); select pg_temp.enroll(8,'pro','2026-10-27 00:00 Europe/Madrid','creator');
select is(public.report_promotion_prepare(pg_temp.account(9),'sandbox','2026-11-01'),null::jsonb,'first invoice must be paid before replacing launch discount');
select is((select count(*)::int from private.report_promotions),6,'Pro/Plus allowed, annual and outside week excluded');
select public.report_promotion_observe(pg_temp.account(1),'sandbox','sub1','pro','2026-10-26 19:00 Europe/Madrid','2026-10-26 19:00 Europe/Madrid','pro1');
select is((select count(*)::int from private.report_promotions where account_id=pg_temp.account(1)),1,'duplicate webhook no second campaign');
create temporary table report_dates(id uuid primary key,created_at timestamptz);
create function pg_temp.report(n int,d timestamptz,decision text default 'accepted') returns uuid language plpgsql as $$
declare rid uuid:=gen_random_uuid(); proposal jsonb:='{"schema":"vantare.triage.v2","verdict":"valido","confidence":0.9,"summary":"Test","criteria":{"contenido_minimo":"si","evidencia":"si","no_duplicado":"si"},"trazable":"si","duplicate_of":null,"severity":"media","area":"telemetria","preliminary_fix":null,"reasons":[],"evidence_refs":[]}'::jsonb;
begin
 update public.testing_contributions c set created_at='2020-01-01' where c.id in (select id from report_dates);
 insert into public.testing_contributions(id,account_id,channel,title,body,state,created_at) values(rid,pg_temp.account(n),'testers','Test',repeat('x',210),'received',d);
 insert into report_dates values(rid,d);
 update public.testing_contributions c set created_at=x.created_at from report_dates x where c.id=x.id;
 if decision<>'received' then
 insert into public.testing_contribution_reviews(contribution_id,decision,note,model_verdict,model_confidence,proposal,decided_at) values(rid,decision,'human decision','valido',0.9,proposal,d);
 update public.testing_contributions set state=decision where id=rid;
 end if;
 return rid;
end$$;
select pg_temp.report(1,'2026-10-27 19:00 Europe/Madrid'); select pg_temp.report(1,'2026-10-28 19:00 Europe/Madrid');
select pg_temp.report(1,'2026-10-29 19:00 Europe/Madrid','received'); select pg_temp.report(1,'2026-10-30 19:00 Europe/Madrid','declined');
select is((private.report_promotion_progress(pg_temp.account(1),'sandbox','2026-11-01')->>'accepted')::int,2,'only confirmed accepted count');
create temporary table planned as select public.report_promotion_prepare(pg_temp.account(1),'sandbox','2026-11-01') as op;
select is((select op->>'discount_id' from planned),'pro3','two accepted gives three months');
select is((select reward_from from private.report_promotions where account_id=pg_temp.account(1)),null::timestamptz,'unsettled reward has no invented starting invoice');
select is((select reward_until from private.report_promotions where account_id=pg_temp.account(1)),null::timestamptz,'unsettled reward has no mirror-clock expiry');
select is(public.report_promotion_prepare(pg_temp.account(1),'sandbox','2026-11-02')->>'id',(select op->>'id' from planned),'retry retains stable operation');
select is((select count(*)::int from private.report_promotion_changes),1,'one change per retry');
select ok(public.report_promotion_claim((select (op->>'id')::uuid from planned),'00000000-0000-4000-8000-000000000001','2026-11-02'),'first worker owns operation');
select ok(not public.report_promotion_claim((select (op->>'id')::uuid from planned),'00000000-0000-4000-8000-000000000002','2026-11-02'),'second worker cannot overlap');
select ok(public.report_promotion_ack((select (op->>'id')::uuid from planned),'00000000-0000-4000-8000-000000000001','2026-11-02'),'successful ACK');
select ok(not public.report_promotion_ack((select (op->>'id')::uuid from planned),'00000000-0000-4000-8000-000000000001','2026-11-02'),'repeated ACK no duplicate');
select is(public.report_promotion_prepare(pg_temp.account(1),'sandbox','2026-11-03'),null::jsonb,'applied reward does not restart');
select pg_temp.report(1,'2026-11-02 19:00 Europe/Madrid'); select pg_temp.report(1,'2026-11-03 19:00 Europe/Madrid'); select pg_temp.report(1,'2026-11-09 19:00 Europe/Madrid');
select is(public.report_promotion_prepare(pg_temp.account(1),'sandbox','2026-11-10')->>'discount_id','pro6','five replaces three, no stacking');
select is((select tier from private.report_promotions where account_id=pg_temp.account(1)),6,'maximum tier six');
select pg_temp.report(2,'2026-10-27 19:00 Europe/Madrid'); select pg_temp.report(2,'2026-10-28 19:00 Europe/Madrid');
select is(public.report_promotion_prepare(pg_temp.account(2),'sandbox','2026-11-01')->>'discount_id','plus3','Plus reward 3 EUR beats creator 20 percent');
update private.report_promotion_creators set basis_points=4000 where product_id='plus';
select is(public.report_promotion_prepare(pg_temp.account(2),'sandbox','2026-11-01')->>'discount_id','creator','P3-1 validated 40 percent creator beats fixed Plus reward');
select public.report_promotion_period(pg_temp.account(2),'sandbox','sub2','2026-12-26 19:00 Europe/Madrid');
select is(public.report_promotion_prepare(pg_temp.account(2),'sandbox','2026-11-01')->>'discount_id','plus3','P3-1 live next cycle excludes creator after its own expiry');
select public.report_promotion_period(pg_temp.account(2),'sandbox','sub2','2026-11-26 19:00 Europe/Madrid');
update private.report_promotion_creators set basis_points=2000 where product_id='plus';
select is(public.report_promotion_prepare(pg_temp.account(8),'sandbox','2026-11-01')->>'discount_id','creator','without reward creator wins next invoice');
select pg_temp.report(6,'2026-10-27 19:00 Europe/Madrid'); select pg_temp.report(6,'2026-10-28 19:00 Europe/Madrid');
select public.report_promotion_prepare(pg_temp.account(6),'sandbox','2026-11-01');
select pg_temp.report(6,'2026-11-02 19:00 Europe/Madrid','spam'); select pg_temp.report(6,'2026-11-03 19:00 Europe/Madrid','spam');
select is(public.report_promotion_prepare(pg_temp.account(6),'sandbox','2026-11-04')->>'discount_id','pro3','two spam preserve already granted months');
select is((select count(*)::int from private.report_promotion_changes where account_id=pg_temp.account(6) and superseded_at is not null),0,'spam does not supersede an already granted award');
select ok((select forfeited from private.report_promotions where account_id=pg_temp.account(6)),'spam forfeiture durable');
-- Exact 45 elapsed days: the final second counts; exact end and before signup do not.
select pg_temp.report(7,'2026-10-26 18:59 Europe/Madrid'); select pg_temp.report(7,'2026-12-10 18:59:59 Europe/Madrid'); select pg_temp.report(9,'2026-12-10 19:00 Europe/Madrid');
select is((private.report_promotion_progress(pg_temp.account(7),'sandbox','2026-12-11')->>'accepted')::int,1,'45 day window final second included');
select is((private.report_promotion_progress(pg_temp.account(9),'sandbox','2026-12-11')->>'accepted')::int,0,'exact 45 day boundary excluded');
select ok(private.report_promotion_progress(pg_temp.account(1),'production','2026-11-10') is null,'environments isolated');
select is(private.native_admin_account(pg_temp.account(1),'https://promotion.clerk.invalid','sandbox')->'report_promotion'->>'tier','6','owner account payload includes earned tier');
-- P2-2: late PATCH and stale mirror; only actual discounted, settled periods consume months.
select pg_temp.enroll(10);
select pg_temp.report(10,'2026-10-27 19:00 Europe/Madrid'); select pg_temp.report(10,'2026-10-28 19:00 Europe/Madrid');
create temporary table late_op as select public.report_promotion_prepare(pg_temp.account(10),'sandbox','2026-11-25') op;
select ok(public.report_promotion_claim((select (op->>'id')::uuid from late_op),'00000000-0000-4000-8000-000000000010','2026-11-26 19:05 Europe/Madrid'),'P2-2 stale mirror does not freeze late PATCH');
select ok(public.report_promotion_ack((select (op->>'id')::uuid from late_op),'00000000-0000-4000-8000-000000000010','2026-11-26 19:05 Europe/Madrid'),'P2-2 late PATCH confirmed');
create function pg_temp.invoice(n int,oid text,t timestamptz,discount text,amount int) returns void language plpgsql as $$begin
 insert into public.billing_orders(user_id,provider,environment,provider_order_id,provider_product_id,provider_subscription_id,status,paid,net_amount,currency,remote_modified_at,snapshot_hash)
 values(pg_temp.account(n),'polar','sandbox',oid,'pro','sub'||n,'paid',true,599-amount,'eur',t,repeat('b',64));
 perform public.report_promotion_invoice('sandbox',oid,discount,amount,t,t,private.report_promotion_months(t,1));
end$$;
select pg_temp.invoice(10,'late-full','2026-11-26 19:00 Europe/Madrid',null,0);
select is(public.report_promotion_prepare(pg_temp.account(10),'sandbox','2026-11-27'),null::jsonb,'P2-2 invoice issued before late PATCH does not consume or restart reward');
select pg_temp.invoice(10,'late-one','2026-12-26 19:00 Europe/Madrid','pro3',200);
create temporary table remaining_op as select public.report_promotion_prepare(pg_temp.account(10),'sandbox','2026-12-27') op;
select is((select op->>'discount_id' from remaining_op),'pro1','P2-2 partial balance uses one-month coupon without granting excess months');
select public.report_promotion_claim((select (op->>'id')::uuid from remaining_op),'00000000-0000-4000-8000-000000000010','2026-12-27');
select public.report_promotion_ack((select (op->>'id')::uuid from remaining_op),'00000000-0000-4000-8000-000000000010','2026-12-27');
select is((select reward_from from private.report_promotions where account_id=pg_temp.account(10)),'2026-12-26 19:00 Europe/Madrid'::timestamptz,'P2-2 reward anchored to first settled discounted invoice');
select pg_temp.invoice(10,'late-two','2027-01-26 19:00 Europe/Madrid','pro1',200);
create temporary table rollover_op as select public.report_promotion_prepare(pg_temp.account(10),'sandbox','2027-01-27') op;
select is((select op->>'discount_id' from rollover_op),'pro1','P2-2 second paid invoice still leaves one promised month');
select is((select (op->>'repair')::boolean from rollover_op),true,'P2-2 one-month coupon is renewed only after its settled invoice');
select public.report_promotion_claim((select (op->>'id')::uuid from rollover_op),'00000000-0000-4000-8000-000000000010','2027-01-27');
select public.report_promotion_cleared((select (op->>'id')::uuid from rollover_op),'00000000-0000-4000-8000-000000000010','2027-01-27');
select public.report_promotion_ack((select (op->>'id')::uuid from rollover_op),'00000000-0000-4000-8000-000000000010','2027-01-27');
select is(public.report_promotion_prepare(pg_temp.account(10),'sandbox','2027-02-01'),null::jsonb,'P2-2 confirmed rollover cannot extend again before another real invoice');
select pg_temp.invoice(10,'late-three','2027-02-26 19:00 Europe/Madrid','pro1',200);
create temporary table spent_op as select public.report_promotion_prepare(pg_temp.account(10),'sandbox','2027-02-27') op;
select ok((select op is not null from spent_op),'P2-2 exhausted budget emits a removal operation');
select is((select op->>'discount_id' from spent_op),null::text,'P2-2 removal only after all three settled invoices');
select public.report_promotion_invoice('sandbox','late-three','pro1',200,'2027-02-26 19:00 Europe/Madrid','2027-02-26 19:00 Europe/Madrid','2027-03-26 19:00 Europe/Madrid');
select is((select count(*)::int from private.report_promotion_invoices where account_id=pg_temp.account(10)),5,'P2-2 repeated paid webhook cannot duplicate month credit');
-- P2-2 recovery of a provider-expired coupon, without consuming any missing invoice.
select ok(public.report_promotion_claim((select id from private.report_promotion_changes where account_id=pg_temp.account(6) and applied_at is null and superseded_at is null),'00000000-0000-4000-8000-000000000006','2026-11-05'),'P2-2 granted months remain claimable after spam');
select public.report_promotion_ack((select id from private.report_promotion_changes where account_id=pg_temp.account(6) and applied_at is null and superseded_at is null),'00000000-0000-4000-8000-000000000006','2026-11-05');
select pg_temp.invoice(6,'missed-benefit','2026-12-26 19:00 Europe/Madrid',null,0);
create temporary table repair_op as select public.report_promotion_prepare(pg_temp.account(6),'sandbox','2026-12-27') op;
select is((select (op->>'repair')::boolean from repair_op),true,'P2-2 paid renewal without discount schedules automatic repair');
select ok(public.report_promotion_claim((select (op->>'id')::uuid from repair_op),'00000000-0000-4000-8000-000000000006','2026-12-27'),'P2-2 repair lease');
select ok(public.report_promotion_cleared((select (op->>'id')::uuid from repair_op),'00000000-0000-4000-8000-000000000006','2026-12-27'),'P2-2 clear phase persisted before attach');
select public.report_promotion_ack((select (op->>'id')::uuid from repair_op),'00000000-0000-4000-8000-000000000006','2026-12-27');
select is(public.report_promotion_prepare(pg_temp.account(6),'sandbox','2026-12-28'),null::jsonb,'P2-2 same missing invoice cannot restart the repair twice');
-- P2-2 partial six-month award survives a plan change without issuing six fresh months.
select pg_temp.enroll(13);
select pg_temp.report(13,'2026-10-27 19:00 Europe/Madrid'); select pg_temp.report(13,'2026-10-28 19:00 Europe/Madrid');
select pg_temp.report(13,'2026-11-02 19:00 Europe/Madrid'); select pg_temp.report(13,'2026-11-03 19:00 Europe/Madrid'); select pg_temp.report(13,'2026-11-09 19:00 Europe/Madrid');
create temporary table six_op as select public.report_promotion_prepare(pg_temp.account(13),'sandbox','2026-11-10') op;
select public.report_promotion_claim((select (op->>'id')::uuid from six_op),'00000000-0000-4000-8000-000000000013','2026-11-11');
select public.report_promotion_ack((select (op->>'id')::uuid from six_op),'00000000-0000-4000-8000-000000000013','2026-11-11');
select pg_temp.invoice(13,'six-spent-one','2026-11-26 19:00 Europe/Madrid','pro6',200);
update public.billing_subscriptions set provider_product_id='plus' where provider_subscription_id='sub13';
select public.report_promotion_observe(pg_temp.account(13),'sandbox','sub13','plus','2026-10-26 19:00 Europe/Madrid','2026-11-27',null);
select is(public.report_promotion_prepare(pg_temp.account(13),'sandbox','2026-11-28')->>'remaining','5','P2-2 plan transfer preserves the actual five remaining invoices');
select is(public.report_promotion_prepare(pg_temp.account(13),'sandbox','2026-11-28')->>'discount_id','plus3','P2-2 finite coupon duration cannot exceed remaining balance after transfer');
-- Spam cutoff is the second human decision, not the time the cron happens to wake.
select pg_temp.enroll(12);
select pg_temp.report(12,'2026-10-27 19:00 Europe/Madrid'); select pg_temp.report(12,'2026-10-28 19:00 Europe/Madrid');
select pg_temp.report(12,'2026-11-02 19:00 Europe/Madrid','spam'); select pg_temp.report(12,'2026-11-03 19:00 Europe/Madrid','spam');
select is(public.report_promotion_prepare(pg_temp.account(12),'sandbox','2026-11-04')->>'discount_id','pro3','P3-7 cron delay cannot erase a tier earned before the second spam');
select is((select forfeited_at from private.report_promotions where account_id=pg_temp.account(12)),'2026-11-03 19:00 Europe/Madrid'::timestamptz,'P3-7 exact spam cutoff is durable');
-- P2-1: the award and original 45-day window survive a plan change and a later re-subscription.
update public.billing_subscriptions set provider_product_id='plus' where provider_subscription_id='sub1';
select lives_ok($$select public.report_promotion_observe(pg_temp.account(1),'sandbox','sub1','plus','2026-10-26 19:00 Europe/Madrid','2026-11-12',null)$$,'P2-1 plan change does not fail webhook');
select is((select product_id from private.report_promotions where account_id=pg_temp.account(1)),'plus','P2-1 award follows Plus');
select is(public.report_promotion_prepare(pg_temp.account(1),'sandbox','2026-11-13')->>'discount_id','plus6','P2-1 existing tier uses Plus reward');
insert into public.billing_subscriptions(user_id,provider,environment,provider_subscription_id,provider_product_id,status,current_period_end)
 values(pg_temp.account(1),'polar','sandbox','replacement','pro','active','2026-12-20');
select public.report_promotion_observe(pg_temp.account(1),'sandbox','sub1','plus','2026-10-26 19:00 Europe/Madrid','2026-11-23',null);
select lives_ok($$select public.report_promotion_observe(pg_temp.account(1),'sandbox','replacement','pro','2026-11-20','2026-11-20',null)$$,'P2-1 second signup outside launch never quarantines webhook');
select is((select subscription_id from private.report_promotions where account_id=pg_temp.account(1)),'replacement','P2-1 current subscription selected');
select is((select tier from private.report_promotions where account_id=pg_temp.account(1)),6,'P2-1 tier conserved');
select is(public.report_promotion_prepare(pg_temp.account(1),'sandbox','2026-11-21')->>'kind','cleanup','P2-1 cleanup runs before moving the reward');
select is(public.report_promotion_prepare(pg_temp.account(1),'sandbox','2026-11-21')->>'subscription_id','sub1','P2-1 cleanup targets the previous subscription');
select is((select subscribed_at from private.report_promotions where account_id=pg_temp.account(1)),'2026-10-26 19:00 Europe/Madrid'::timestamptz,'P2-1 original report window conserved');
select is((select count(*)::int from private.report_promotion_transfers where account_id=pg_temp.account(1)),2,'P2-1 both changes audited');
select public.report_promotion_observe(pg_temp.account(1),'sandbox','sub1','plus','2026-10-26 19:00 Europe/Madrid','2026-11-21',null);
select is((select subscription_id from private.report_promotions where account_id=pg_temp.account(1)),'replacement','P2-1 late old subscription cannot steal reward back');
-- B03 deletion blocks new effects and hides the private campaign.
select public.apply_clerk_user_event('promotion-deleted',repeat('a',64),'https://promotion.clerk.invalid','user_'||replace(pg_temp.account(1)::text,'-',''),'user.deleted','2026-11-11',null);
select is(public.report_promotion_prepare(pg_temp.account(1),'sandbox','2026-11-12'),null::jsonb,'deleted account cannot prepare');
select is(private.report_promotion_progress(pg_temp.account(1),'sandbox','2026-11-12'),null::jsonb,'deleted account hidden');
select throws_ok($$select public.report_promotion_observe(pg_temp.account(1),'sandbox','sub1','pro','2026-10-26 19:00 Europe/Madrid','2026-11-12',null)$$,'28000','account_deleted','deleted webhook cannot restore campaign');
select throws_ok($$select public.report_promotion_checkout(pg_temp.account(1),'sandbox','pro','2026-10-30','00000000-0000-4000-8000-000000000020')$$,'28000','account_deleted','P1-2 deleted account cannot recover a launch checkout');
select throws_ok($$select public.report_promotion_checkout_pending(pg_temp.account(1),'sandbox','2026-10-30')$$,'28000','account_deleted','P1-2 deleted account cannot read checkout recovery references');
select ok(not public.report_promotion_claim((select id from private.report_promotion_changes where account_id=pg_temp.account(1) and applied_at is null and superseded_at is null),'00000000-0000-4000-8000-000000000003','2026-11-12'),'tombstone denies pending HTTP claim');
select is((select count(*)::int from private.report_promotion_changes where account_id=pg_temp.account(1) and applied_at is not null),1,'deletion preserves financial trace');
select is(public.report_promotion_checkout(pg_temp.account(2),'sandbox','plus','2026-10-30'),null::text,'existing customer cannot earn another first month');
select public.report_promotion_observe(pg_temp.account(2),'sandbox','sub2','plus','2026-10-26 19:00 Europe/Madrid','2026-10-25','old');
select is((select remote_discount from private.report_promotions where account_id=pg_temp.account(2)),'creator','stale webhook ignored');
-- End of reward and creator windows: no fresh duration from repeated selection.
update public.billing_subscriptions set current_period_end='2027-08-26 19:00 Europe/Madrid' where user_id=pg_temp.account(2);
select is(public.report_promotion_prepare(pg_temp.account(2),'sandbox','2027-08-01'),null::jsonb,'P3-12 unspent balance expires by policy rather than mirror dates');
select public.report_promotion_failed(pg_temp.account(6),'sandbox','polar_discount_unmanaged','2027-01-01');
select public.report_promotion_failed(pg_temp.account(6),'sandbox','polar_discount_unmanaged','2027-01-02');
select is((select attempts from private.report_promotion_failures where account_id=pg_temp.account(6)),2,'P2-3 failed attempts are durable');
select is(private.report_promotion_progress(pg_temp.account(6),'sandbox','2027-01-03')->>'last_error','polar_discount_unmanaged','P2-3 owner can inspect sanitized failure');
select ok(not has_function_privilege('authenticated','public.report_promotion_failed(uuid,text,text,timestamptz)','execute'),'P2-3 client cannot forge processing status');
-- P3-6/7/8 explicit commercial policies and durable launch consumption.
select is(public.report_promotion_checkout(pg_temp.account(11),'sandbox','pro','2026-10-30','00000000-0000-4000-8000-000000000011'),'pro1','P3-8 first launch checkout reserves durable benefit');
select is(public.report_promotion_checkout(pg_temp.account(11),'sandbox','pro','2026-10-30','00000000-0000-4000-8000-000000000011'),'pro1','P3-8 same attempt retries its reservation');
select throws_ok($$select public.report_promotion_checkout(pg_temp.account(11),'sandbox','pro','2026-10-30 00:29','00000000-0000-4000-8000-000000000012')$$,'55000','promotion_checkout_pending','P1-2 concurrent attempt cannot create a second launch checkout or silently charge normal');
select is(public.report_promotion_checkout(pg_temp.account(11),'sandbox','pro','2026-10-30 00:31','00000000-0000-4000-8000-000000000012'),'pro1','P1-2 unused account right survives an expired reservation without remote checkout');
select is((select count(*)::int from private.report_promotion_launch_uses where account_id=pg_temp.account(11)),1,'P1-2 rollover keeps a single account entitlement');
select ok((select consumed_at is not null from private.report_promotion_launch_uses where account_id=pg_temp.account(5)),'P3-8 paid history consumes launch without an enrolled campaign');
select is(public.report_promotion_checkout(pg_temp.account(5),'sandbox','pro','2026-10-30'),null::text,'P3-8 flag-off historical subscription cannot re-earn launch');
select pg_temp.report(6,'2026-11-02 19:00 Europe/Madrid'); select pg_temp.report(6,'2026-11-03 19:00 Europe/Madrid'); select pg_temp.report(6,'2026-11-09 19:00 Europe/Madrid');
select public.report_promotion_prepare(pg_temp.account(6),'sandbox','2027-01-03');
select is((select tier from private.report_promotions where account_id=pg_temp.account(6)),3,'P3-7 spam blocks upgrade while keeping granted tier');
update public.billing_orders set status='partially_refunded',reported_refunded_amount=1 where provider_order_id='first-invoice2';
select public.report_promotion_prepare(pg_temp.account(2),'sandbox','2027-08-02');
select ok((select first_refunded from private.report_promotions where account_id=pg_temp.account(2)),'P3-6 refund of the original first month durably forfeits reward');
select ok(not exists(select 1 from private.report_promotion_changes where account_id=pg_temp.account(2) and applied_at is null and superseded_at is null and discount_id in ('plus3','plus6')),'P3-6 refunded first month cannot keep granting report discounts');
-- An expired local attempt with a remote checkout needs verified terminal proof.
select public.report_promotion_checkout(pg_temp.account(15),'sandbox','pro','2026-10-30','00000000-0000-4000-8000-000000000015');
insert into public.billing_checkout_attempts(user_id,attempt_id,checkout_key,environment,catalog_version,status,provider_checkout_id,checkout_url,expires_at)
 values(pg_temp.account(15),'00000000-0000-4000-8000-000000000015','pro_monthly','sandbox','fixture','open','remote15','https://sandbox.polar.sh/checkout/remote15','2026-10-30 00:30');
select throws_ok($$select public.report_promotion_checkout(pg_temp.account(15),'sandbox','pro','2026-10-30 00:31','00000000-0000-4000-8000-000000000016')$$,'55000','promotion_checkout_pending','P1-2 expired local attempt cannot bypass its possibly payable remote checkout');
delete from public.billing_checkout_attempts where user_id=pg_temp.account(15);
select is(public.report_promotion_checkout_pending(pg_temp.account(15),'sandbox','2026-10-31')->>'checkout_id','remote15','P1-2 remote recovery survives generic attempt garbage collection');
select is(public.report_promotion_checkout(pg_temp.account(15),'sandbox','pro','2026-10-31','00000000-0000-4000-8000-000000000016','00000000-0000-4000-8000-000000000015'),'pro1','P1-2 verified expired remote checkout releases the account entitlement');
select throws_ok($$select public.report_promotion_checkout(pg_temp.account(15),'sandbox','pro','2026-10-31 00:31','00000000-0000-4000-8000-000000000017','00000000-0000-4000-8000-000000000015')$$,'55000','promotion_checkout_pending','P1-2 stale terminal proof cannot win a second replacement');
-- R3: terminal cleanup never prevents the current subscription receiving its award.
select pg_temp.enroll(14);
select pg_temp.report(14,'2026-10-27 19:00 Europe/Madrid'); select pg_temp.report(14,'2026-10-28 19:00 Europe/Madrid');
select public.report_promotion_prepare(pg_temp.account(14),'sandbox','2026-11-01');
insert into public.billing_subscriptions(user_id,provider,environment,provider_subscription_id,provider_product_id,status)
 values(pg_temp.account(14),'polar','sandbox','replacement14','plus','active');
select public.report_promotion_observe(pg_temp.account(14),'sandbox','replacement14','plus','2026-11-20','2026-11-20',null);
update public.billing_subscriptions set status='canceled' where provider_subscription_id='sub14';
select is(public.report_promotion_prepare(pg_temp.account(14),'sandbox','2026-11-21')->>'discount_id','plus3','P2-4 canceled predecessor is already clean and cannot starve current award');
select ok((select cleared_at is not null and to_jsonb(t)->>'cleanup_reason'='mirror_inactive' from private.report_promotion_transfers t where account_id=pg_temp.account(14)),'P2-4 skipped cleanup has durable reason');
-- A missing first invoice is visible and resolves when reconciliation supplies it.
-- Launch accounting stays durable after payment, including a new attempt.
select pg_temp.enroll(11);
select is(public.report_promotion_checkout(pg_temp.account(11),'sandbox','pro','2026-10-31','00000000-0000-4000-8000-000000000013'),null::text,'P1-2 paid account cannot repeat intro with a new attempt');
-- P2-5 reconciliation supplies real periods once per order, with audit source.
select pg_temp.enroll(16);
select pg_temp.report(16,'2026-10-27 19:00 Europe/Madrid'); select pg_temp.report(16,'2026-10-28 19:00 Europe/Madrid');
select public.report_promotion_prepare(pg_temp.account(16),'sandbox','2026-11-01');
insert into public.billing_orders(user_id,provider,environment,provider_order_id,provider_product_id,provider_subscription_id,status,paid,net_amount,currency,remote_modified_at,snapshot_hash)
 values(pg_temp.account(16),'polar','sandbox','reconciled16','pro','sub16','paid',true,399,'eur','2026-11-26',repeat('a',64));
select public.report_promotion_invoice_missing('sandbox','reconciled16','2026-11-27');
select is(public.report_promotion_prepare(pg_temp.account(16),'sandbox','2026-11-27'),null::jsonb,'P2-5 incomplete paid invoice prevents a silent rearm');
select is(private.report_promotion_progress(pg_temp.account(16),'sandbox','2026-11-27')->>'last_error','promotion_invoice_details_missing','P2-5 missing invoice detail is owner-visible');
select public.report_promotion_invoice('sandbox','reconciled16','pro3',200,'2026-11-26','2026-11-26','2026-12-26',false,'reconciliation');
select public.report_promotion_invoice('sandbox','reconciled16','pro3',200,'2026-11-26','2026-11-26','2026-12-26',false,'webhook');
select is((select count(*)::int from private.report_promotion_invoices where order_id='reconciled16'),1,'P2-5 reconciliation and repeated webhook share one order credit');
select ok((select source='reconciliation' and reconciled_at is not null from private.report_promotion_invoices where order_id='reconciled16'),'P2-5 recovered invoice has durable reconciliation trace');
select ok((select resolved_at is not null from private.report_promotion_invoice_gaps where order_id='reconciled16'),'P2-5 repaired gap resolves durably');
select is(public.report_promotion_prepare(pg_temp.account(16),'sandbox','2026-11-27')->>'remaining','2','P2-5 reconciled renewal consumes the missing month');
select is(private.report_promotion_progress(pg_temp.account(9),'sandbox','2026-11-01')->>'last_error','promotion_initial_invoice_missing','P3-10 missing initial invoice is an owner-visible incident');
insert into public.billing_orders(user_id,provider,environment,provider_order_id,provider_product_id,provider_subscription_id,status,paid,net_amount,currency,remote_modified_at,snapshot_hash)
 values(pg_temp.account(9),'polar','sandbox','recovered-initial9','pro','sub9','paid',true,399,'eur','2026-10-26 19:00 Europe/Madrid',repeat('a',64));
select public.report_promotion_invoice('sandbox','recovered-initial9','pro1',200,'2026-10-26 19:00 Europe/Madrid','2026-10-26 19:00 Europe/Madrid','2026-11-26 19:00 Europe/Madrid',true,'reconciliation');
select public.report_promotion_prepare(pg_temp.account(9),'sandbox','2026-11-01');
select is(private.report_promotion_progress(pg_temp.account(9),'sandbox','2026-11-01')->>'last_error',null::text,'P3-10 initial invoice recovery clears the incident');
-- P3-12: expiry is six Madrid calendar months from the human grant.
select pg_temp.enroll(17);
select pg_temp.report(17,'2026-10-27 19:00 Europe/Madrid'); select pg_temp.report(17,'2026-10-28 19:00 Europe/Madrid');
create temporary table expiry_pending as select public.report_promotion_prepare(pg_temp.account(17),'sandbox','2027-04-28 18:59 Europe/Madrid') op;
select is((select op->>'discount_id' from expiry_pending),'pro3','P3-12 pending balance remains usable immediately before six-month deadline');
select is(public.report_promotion_prepare(pg_temp.account(17),'sandbox','2027-04-28 19:00 Europe/Madrid'),null::jsonb,'P3-12 no new application at exact six-month deadline');
select is(public.report_promotion_prepare(pg_temp.account(17),'sandbox','2027-04-28 19:01 Europe/Madrid'),null::jsonb,'P3-12 expired pending balance cannot rearm');
select pg_temp.enroll(18);
select pg_temp.report(18,'2026-10-27 19:00 Europe/Madrid'); select pg_temp.report(18,'2026-10-28 19:00 Europe/Madrid');
create temporary table expiry_applied as select public.report_promotion_prepare(pg_temp.account(18),'sandbox','2026-11-01') op;
select public.report_promotion_claim((select (op->>'id')::uuid from expiry_applied),'00000000-0000-4000-8000-000000000018','2026-11-01');
select public.report_promotion_ack((select (op->>'id')::uuid from expiry_applied),'00000000-0000-4000-8000-000000000018','2026-11-01');
select is(public.report_promotion_prepare(pg_temp.account(18),'sandbox','2027-04-29'),null::jsonb,'P3-12 expiry never removes or restarts a block already confirmed');
select is((select applied_discount from private.report_promotions where account_id=pg_temp.account(18)),'pro3','P3-12 already-applied tier is preserved');
select is((select reward_expires_at from private.report_promotions where account_id=pg_temp.account(17)),'2027-04-28 19:00 Europe/Madrid'::timestamptz,'P3-12 deadline follows Madrid DST from the human grant');
select ok(not exists(select 1 from private.report_promotion_changes where account_id=pg_temp.account(17) and applied_at is null and superseded_at is null),'P3-12 expired unapplied operation is superseded');
select ok(not public.report_promotion_claim((select (op->>'id')::uuid from expiry_pending),'00000000-0000-4000-8000-000000000019','2027-04-29'),'P3-12 stale operation cannot claim after deadline');
update private.report_promotion_policy set reward_valid_months=12;
select pg_temp.enroll(19);
select pg_temp.report(19,'2026-10-27 19:00 Europe/Madrid'); select pg_temp.report(19,'2026-10-28 19:00 Europe/Madrid');
select is(public.report_promotion_prepare(pg_temp.account(19),'sandbox','2027-04-29')->>'discount_id','pro3','P3-12 single configured duration governs future awards');
select is((select reward_expires_at from private.report_promotions where account_id=pg_temp.account(19)),'2027-10-28 19:00 Europe/Madrid'::timestamptz,'P3-12 custom calendar duration is snapshotted');
select is((select reward_expires_at from private.report_promotions where account_id=pg_temp.account(18)),'2027-04-28 19:00 Europe/Madrid'::timestamptz,'P3-12 policy edits cannot change an already-applied tier');
select ok(not has_table_privilege('service_role','private.report_promotion_policy','update'),'P3-12 client/worker cannot change the configured policy');
-- Known refund remains authoritative even when another renewal has missing detail.
insert into public.billing_orders(user_id,provider,environment,provider_order_id,provider_product_id,provider_subscription_id,status,paid,net_amount,currency,remote_modified_at,snapshot_hash)
 values(pg_temp.account(16),'polar','sandbox','gap-after-refund16','pro','sub16','paid',true,399,'eur','2026-12-26',repeat('a',64));
select public.report_promotion_invoice_missing('sandbox','gap-after-refund16','2026-12-27');
update public.billing_orders set status='refunded',reported_refunded_amount=net_amount where provider_order_id='first-invoice16';
select public.report_promotion_prepare(pg_temp.account(16),'sandbox','2026-12-28');
select ok((select first_refunded from private.report_promotions where account_id=pg_temp.account(16)),'P2-5 missing renewal metadata cannot suspend the original refund policy');
select ok(not exists(select 1 from private.report_promotion_changes where account_id=pg_temp.account(16) and applied_at is null and superseded_at is null and discount_id is not null),'P2-5 refund still withdraws pending report benefits despite another invoice gap');
select ok(not has_function_privilege('authenticated','public.report_promotion_checkout_pending(uuid,text,timestamptz)','execute'),'P1-2 checkout recovery is server-only');
select ok(not has_function_privilege('authenticated','public.report_promotion_invoice_missing(text,text,timestamptz)','execute'),'P2-5 client cannot forge an invoice gap');
-- R4 P2-8: the higher tier is six TOTAL discounted renewals, including earlier use.
update private.report_promotion_policy set reward_valid_months=6;
select pg_temp.enroll(21);
select pg_temp.report(21,'2026-10-27 19:00 Europe/Madrid'); select pg_temp.report(21,'2026-10-28 19:00 Europe/Madrid');
select public.report_promotion_prepare(pg_temp.account(21),'sandbox','2026-11-01');
select pg_temp.invoice(21,'between-tiers21','2026-11-26 19:00 Europe/Madrid','pro3',200);
select is(public.report_promotion_prepare(pg_temp.account(21),'sandbox','2026-11-27')->>'remaining','2','P2-8 first tier has already spent one real renewal');
create temporary table delayed_acceptances as select pg_temp.report(21,d) id from (values('2026-11-02 19:00 Europe/Madrid'::timestamptz),('2026-11-03 19:00 Europe/Madrid'::timestamptz),('2026-11-09 19:00 Europe/Madrid'::timestamptz)) dates(d);
update public.testing_contribution_reviews set decided_at='2026-12-01 19:00 Europe/Madrid' where contribution_id in (select id from delayed_acceptances);
select is(public.report_promotion_prepare(pg_temp.account(21),'sandbox','2026-12-02')->>'remaining','5','P2-8 tier upgrade preserves settled usage and grants only five remaining months');
select is((select reward_granted_at from private.report_promotions where account_id=pg_temp.account(21)),'2026-10-28 19:00 Europe/Madrid'::timestamptz,'P2-8 consumption remains anchored to the first human grant');
select is((select reward_expires_at from private.report_promotions where account_id=pg_temp.account(21)),'2027-06-01 19:00 Europe/Madrid'::timestamptz,'P2-8 expiry still belongs to the new tier grant');
select pg_temp.invoice(21,'total-two21','2026-12-26 19:00 Europe/Madrid','pro3',200);
select pg_temp.invoice(21,'total-three21','2027-01-26 19:00 Europe/Madrid','pro3',200);
select pg_temp.invoice(21,'total-four21','2027-02-26 19:00 Europe/Madrid','pro3',200);
select pg_temp.invoice(21,'total-five21','2027-03-26 19:00 Europe/Madrid','pro1',200);
select pg_temp.invoice(21,'total-six21','2027-04-26 19:00 Europe/Madrid','pro1',200);
select is(public.report_promotion_prepare(pg_temp.account(21),'sandbox','2027-04-27')->>'remaining','0','P2-8 six settled renewals exhaust both tiers together');
select is(public.report_promotion_prepare(pg_temp.account(21),'sandbox','2027-04-27')->>'discount_id',null::text,'P2-8 no seventh discounted renewal is granted');
select * from finish();
rollback;
