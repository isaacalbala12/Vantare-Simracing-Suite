begin;
select no_plan();
select ok(not private.report_promotion_eligible('2026-10-26 18:59:59 Europe/Madrid'),'before launch');
select ok(private.report_promotion_eligible('2026-10-26 19:00:00 Europe/Madrid'),'launch inclusive');
select ok(private.report_promotion_eligible('2026-11-01 23:59:59 Europe/Madrid'),'end eve included');
select ok(not private.report_promotion_eligible('2026-11-02 00:00:00 Europe/Madrid'),'end exclusive');
select is(private.report_promotion_months('2026-10-26 19:00 Europe/Madrid',1),'2026-11-26 19:00 Europe/Madrid'::timestamptz,'Madrid calendar clock');
select ok(not has_function_privilege('authenticated','public.report_promotion_observe(uuid,text,text,text,timestamptz,timestamptz,text)','execute'),'clients cannot enroll');
select ok(not has_function_privilege('anon','public.report_promotion_prepare(uuid,text,timestamptz)','execute'),'anonymous cannot plan');
select ok(not has_table_privilege('service_role','private.report_promotions','insert'),'no direct service writes');
select is((select count(*)::int from pg_class where oid in ('private.report_promotions'::regclass,'private.report_promotion_changes'::regclass,'private.report_promotion_catalog'::regclass,'private.report_promotion_creators'::regclass) and relrowsecurity),4,'all new tables RLS');
insert into private.clerk_issuers values('https://promotion.clerk.invalid',array['https://app.invalid'],true);
insert into public.profiles(id) select ('15930000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid from generate_series(1,9)i;
insert into public.account_identities(issuer,subject,account_id) select 'https://promotion.clerk.invalid','user_'||replace(id::text,'-',''),id from public.profiles where id::text like '15930000%';
insert into private.report_promotion_catalog values
 ('sandbox','pro','pro',599,399,'pro1','pro3','pro6'),('sandbox','plus','pro_plus',999,699,'plus1','plus3','plus6');
insert into private.report_promotion_creators values('sandbox','pro','creator'),('sandbox','plus','creator');
create function pg_temp.account(n int) returns uuid language sql as $$select ('15930000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
select is(public.report_promotion_checkout(pg_temp.account(1),'sandbox','pro','2026-10-26 19:00 Europe/Madrid'),'pro1','first month launch discount');
select is(public.report_promotion_checkout(pg_temp.account(1),'sandbox','plus','2026-10-26 19:00 Europe/Madrid'),'plus1','Plus first month launch discount');
select is(public.report_promotion_checkout(pg_temp.account(1),'sandbox','pro','2026-11-02 00:00 Europe/Madrid'),null::text,'no launch outside week');
select is(public.report_promotion_checkout(pg_temp.account(1),'sandbox','annual','2026-10-27'),null::text,'annual catalog not eligible');
create function pg_temp.enroll(n int,product text default 'pro',started timestamptz default '2026-10-26 19:00 Europe/Madrid',discount text default 'pro1') returns void language plpgsql as $$begin
 insert into public.billing_subscriptions(user_id,provider,environment,provider_subscription_id,provider_product_id,status,current_period_start,current_period_end)
 values(pg_temp.account(n),'polar','sandbox','sub'||n,product,'active',started,private.report_promotion_months(started,1));
 if n<>9 then
 insert into public.billing_orders(user_id,provider,environment,provider_order_id,provider_product_id,provider_subscription_id,status,paid,net_amount,currency,remote_modified_at,snapshot_hash)
 values(pg_temp.account(n),'polar','sandbox','first-invoice'||n,product,'sub'||n,'paid',true,399,'eur',started,repeat('a',64));
 end if;
 perform public.report_promotion_observe(pg_temp.account(n),'sandbox','sub'||n,product,started,started,discount);
end$$;
select pg_temp.enroll(1); select pg_temp.enroll(2,'plus','2026-10-26 19:00 Europe/Madrid','creator');
select pg_temp.enroll(3,'annual'); select pg_temp.enroll(4,'pro','2026-11-02 00:00 Europe/Madrid');
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
select is((select reward_from from private.report_promotions where account_id=pg_temp.account(1)),'2026-11-26 19:00 Europe/Madrid'::timestamptz,'reports begin next invoice, never first month');
select is((select reward_until from private.report_promotions where account_id=pg_temp.account(1)),'2027-02-26 19:00 Europe/Madrid'::timestamptz,'three calendar months');
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
select is(public.report_promotion_prepare(pg_temp.account(8),'sandbox','2026-11-01')->>'discount_id','creator','without reward creator wins next invoice');
select pg_temp.report(6,'2026-10-27 19:00 Europe/Madrid'); select pg_temp.report(6,'2026-10-28 19:00 Europe/Madrid');
select public.report_promotion_prepare(pg_temp.account(6),'sandbox','2026-11-01');
select pg_temp.report(6,'2026-11-02 19:00 Europe/Madrid','spam'); select pg_temp.report(6,'2026-11-03 19:00 Europe/Madrid','spam');
select is(public.report_promotion_prepare(pg_temp.account(6),'sandbox','2026-11-04')->>'discount_id',null::text,'two spam supersede unsent reward with removal');
select is((select count(*)::int from private.report_promotion_changes where account_id=pg_temp.account(6) and superseded_at is not null),1,'superseded attempt retained in audit');
select ok((select forfeited from private.report_promotions where account_id=pg_temp.account(6)),'spam forfeiture durable');
-- Exact 45 elapsed days: the final second counts; exact end and before signup do not.
select pg_temp.report(7,'2026-10-26 18:59 Europe/Madrid'); select pg_temp.report(7,'2026-12-10 18:59:59 Europe/Madrid'); select pg_temp.report(9,'2026-12-10 19:00 Europe/Madrid');
select is((private.report_promotion_progress(pg_temp.account(7),'sandbox','2026-12-11')->>'accepted')::int,1,'45 day window final second included');
select is((private.report_promotion_progress(pg_temp.account(9),'sandbox','2026-12-11')->>'accepted')::int,0,'exact 45 day boundary excluded');
select ok(private.report_promotion_progress(pg_temp.account(1),'production','2026-11-10') is null,'environments isolated');
select is(private.native_admin_account(pg_temp.account(1),'https://promotion.clerk.invalid','sandbox')->'report_promotion'->>'tier','6','owner account payload includes earned tier');
-- B03 deletion blocks new effects and hides the private campaign.
select public.apply_clerk_user_event('promotion-deleted',repeat('a',64),'https://promotion.clerk.invalid','user_'||replace(pg_temp.account(1)::text,'-',''),'user.deleted','2026-11-11',null);
select is(public.report_promotion_prepare(pg_temp.account(1),'sandbox','2026-11-12'),null::jsonb,'deleted account cannot prepare');
select is(private.report_promotion_progress(pg_temp.account(1),'sandbox','2026-11-12'),null::jsonb,'deleted account hidden');
select throws_ok($$select public.report_promotion_observe(pg_temp.account(1),'sandbox','sub1','pro','2026-10-26 19:00 Europe/Madrid','2026-11-12',null)$$,'28000','account_deleted','deleted webhook cannot restore campaign');
select ok(not public.report_promotion_claim((select id from private.report_promotion_changes where account_id=pg_temp.account(1) and applied_at is null and superseded_at is null),'00000000-0000-4000-8000-000000000003','2026-11-12'),'tombstone denies pending HTTP claim');
select is((select count(*)::int from private.report_promotion_changes where account_id=pg_temp.account(1) and applied_at is not null),1,'deletion preserves financial trace');
select is(public.report_promotion_checkout(pg_temp.account(2),'sandbox','plus','2026-10-30'),null::text,'existing customer cannot earn another first month');
select public.report_promotion_observe(pg_temp.account(2),'sandbox','sub2','plus','2026-10-26 19:00 Europe/Madrid','2026-10-25','old');
select is((select remote_discount from private.report_promotions where account_id=pg_temp.account(2)),'creator','stale webhook ignored');
-- End of reward and creator windows: no fresh duration from repeated selection.
update public.billing_subscriptions set current_period_end='2027-08-26 19:00 Europe/Madrid' where user_id=pg_temp.account(2);
select is(public.report_promotion_prepare(pg_temp.account(2),'sandbox','2027-08-01')->>'discount_id',null::text,'expired reward and creator never restart');
select * from finish();
rollback;
