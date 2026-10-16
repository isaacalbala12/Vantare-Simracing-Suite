-- Combined #1663/#1661/#1593 contract. Actual guard, offer and attribution.
begin;
select no_plan();
insert into public.profiles(id) values('16200008-0000-4000-8000-000000000001');
select is(public.billing_launch_checkout('16200008-0000-4000-8000-000000000001','sandbox','product','once','pro_monthly',
 '2026-11-01','16200008-0000-4000-8000-000000000002'),'once','web and desktop reserve the canonical first period');
select is((select guard_version from public.claim_billing_checkout_attempt('16200008-0000-4000-8000-000000000001',
 '16200008-0000-4000-8000-000000000002','pro_monthly','sandbox','merge')),2,'shared guard attests dispatch protocol');
select throws_ok($$select public.billing_launch_checkout('16200008-0000-4000-8000-000000000001','sandbox','product','once','pro_monthly',
 '2026-11-01','16200008-0000-4000-8000-000000000003')$$,'55000','promotion_checkout_pending','live app/web attempt cannot repeat offer');
select ok(public.billing_reject_checkout_request('16200008-0000-4000-8000-000000000001','16200008-0000-4000-8000-000000000002'),'certain rejection records terminal proof');
select is(public.billing_launch_checkout('16200008-0000-4000-8000-000000000001','sandbox','product','once','pro_monthly',
 '2026-11-01','16200008-0000-4000-8000-000000000003','16200008-0000-4000-8000-000000000002'),'once','terminal shared attempt releases offer without another thirty-minute hold');
select throws_ok($$select public.billing_launch_checkout('16200008-0000-4000-8000-000000000001','sandbox','product','once','pro_monthly',
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
select * from finish();
rollback;
