-- Combined #1663/#1661/#1593 contract. Actual guard, offer and attribution.
begin;
select no_plan();
insert into public.profiles(id) values('16200008-0000-4000-8000-000000000001');
insert into private.billing_launch_offers(environment,checkout_key,product_id,discount_id,starts_at,ends_at,catalog_version)
values('sandbox','pro_monthly','16200009-0000-4000-8000-000000000001','16200009-0000-4000-8000-000000000002',
 '2026-10-26 18:00Z','2026-11-26 18:00Z','merge');
select is(public.billing_launch_checkout('16200008-0000-4000-8000-000000000001','sandbox','16200009-0000-4000-8000-000000000001','16200009-0000-4000-8000-000000000002','pro_monthly',
 '2026-11-01','16200008-0000-4000-8000-000000000002'),'16200009-0000-4000-8000-000000000002','web and desktop reserve the canonical first period');
select is((select guard_version from public.claim_billing_checkout_attempt('16200008-0000-4000-8000-000000000001',
 '16200008-0000-4000-8000-000000000002','pro_monthly','sandbox','merge')),2,'shared guard attests dispatch protocol');
select throws_ok($$select public.billing_launch_checkout('16200008-0000-4000-8000-000000000001','sandbox','16200009-0000-4000-8000-000000000001','16200009-0000-4000-8000-000000000002','pro_monthly',
 '2026-11-01','16200008-0000-4000-8000-000000000003')$$,'55000','promotion_checkout_pending','live app/web attempt cannot repeat offer');
select ok(public.billing_reject_checkout_request('16200008-0000-4000-8000-000000000001','16200008-0000-4000-8000-000000000002'),'certain rejection records terminal proof');
select is(public.billing_launch_checkout('16200008-0000-4000-8000-000000000001','sandbox','16200009-0000-4000-8000-000000000001','16200009-0000-4000-8000-000000000002','pro_monthly',
 '2026-11-01','16200008-0000-4000-8000-000000000003','16200008-0000-4000-8000-000000000002'),'16200009-0000-4000-8000-000000000002','terminal shared attempt releases offer without another thirty-minute hold');
select throws_ok($$select public.billing_launch_checkout('16200008-0000-4000-8000-000000000001','sandbox','16200009-0000-4000-8000-000000000001','16200009-0000-4000-8000-000000000002','pro_monthly',
 '2026-11-01','16200008-0000-4000-8000-000000000004','16200008-0000-4000-8000-000000000002')$$,'55000','promotion_checkout_pending','stale replacement proof cannot replace new reservation');
select is((select guard_version from public.claim_billing_checkout_attempt('16200008-0000-4000-8000-000000000001',
 '16200008-0000-4000-8000-000000000003','pro_monthly','sandbox','merge')),2,'new family member can be claimed once');
insert into private.admin_creators(creator_id,environment,name,email,code,status,discount_id)
 values('16200008-0000-4000-8000-000000000005','sandbox','Fixture','fixture@example.invalid','MERGE','active','16200008-0000-4000-8000-000000000006');
insert into public.profiles(id) values('16200008-0000-4000-8000-000000000007');
select is((select guard_version from public.claim_billing_creator_checkout_attempt('16200008-0000-4000-8000-000000000007',
 '16200008-0000-4000-8000-000000000008','pro_monthly','sandbox','merge','MERGE','16200008-0000-4000-8000-000000000006')),2,'atomic attribution carries the shared guard version');
select is((select count(*)::integer from private.creator_checkout_attributions where account_id='16200008-0000-4000-8000-000000000007'),1,'same transaction persists creator before dispatch');
select ok(not has_function_privilege('web_purchase_erasure','public.claim_billing_creator_checkout_attempt(uuid,uuid,text,text,text,text,uuid)','execute'),'D1 pull credential cannot reserve purchases');
select ok(not exists(select 1 from private.billing_compensation_policy where enabled),'integration leaves automatic compensation disabled');
-- A newly supported Founders order is observable under the same R5 policy,
-- without enabling compensation or broadening it to creator links/history.
insert into public.profiles(id) values('16200008-0000-4000-8000-000000000010');
update private.founders_sale_config set opens_at=now()-interval '1 day',sales_enabled=true where environment='sandbox';
select * from public.claim_billing_checkout_attempt('16200008-0000-4000-8000-000000000010',
 '16200008-0000-4000-8000-000000000011','founders','sandbox','merge');
select public.billing_begin_checkout_request('16200008-0000-4000-8000-000000000010',
 '16200008-0000-4000-8000-000000000011','16200008-0000-4000-8000-000000000012');
select lives_ok($$select public.billing_observe_checkout_payment('sandbox','16200008-0000-4000-8000-000000000013',
 '16200008-0000-4000-8000-000000000014','16200008-0000-4000-8000-000000000015','16200008-0000-4000-8000-000000000012',
 null,5000,'eur',array['vantare.plan.founders','vantare.channel.nightly'],'16200008-0000-4000-8000-000000000011',
 (select dispatch_token from billing_checkout_attempts where attempt_id='16200008-0000-4000-8000-000000000011'))$$,'Founders marked order uses the existing observer without invalid capability');
select is((select state from private.billing_checkout_compensations where order_id='16200008-0000-4000-8000-000000000013'),'waiting','Founders observation alone does not resolve its webhook');
select is(public.billing_claim_checkout_compensation('sandbox','16200008-0000-4000-8000-000000000016'),null::jsonb,'refunds remain OFF for Founders too');
select * from finish();
rollback;
