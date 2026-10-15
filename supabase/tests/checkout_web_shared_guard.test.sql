begin;
create extension if not exists pgtap;
select plan(20);
insert into private.clerk_issuers(issuer,authorized_parties,enabled)
values('https://checkout-fixture.clerk.invalid',array['https://app.invalid'],true);
insert into public.profiles(id) values
('42000000-0000-4000-8000-000000000001'),('42000000-0000-4000-8000-000000000002'),
('42000000-0000-4000-8000-000000000003');
insert into public.account_identities(issuer,subject,account_id)
values('https://checkout-fixture.clerk.invalid','user_checkout_live','42000000-0000-4000-8000-000000000001'),
('https://checkout-fixture.clerk.invalid','user_checkout_paid','42000000-0000-4000-8000-000000000002'),
('https://checkout-fixture.clerk.invalid','user_checkout_deleted','42000000-0000-4000-8000-000000000003');
select is((select guard_version from public.claim_billing_checkout_attempt(
'42000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000011','pro_monthly','sandbox','web-v1')),1,'shared guard has version 1');
select is((select outcome from public.claim_billing_checkout_attempt(
'42000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000012','pro_plus_annual','sandbox','app-v1')),'busy','app cannot open a second subscription family checkout');
select is(public.complete_billing_checkout_attempt(
'42000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000011',null,'https://sandbox.polar.sh/checkout/x'),false,'missing provider ID cannot complete');
select is((select count(*)::integer from public.billing_checkout_bindings where user_id='42000000-0000-4000-8000-000000000001'),0,'no binding fabricated for missing ID');
select ok(public.complete_billing_checkout_attempt(
'42000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000011','checkout-web-test','https://sandbox.polar.sh/checkout/x'),'completion acknowledges durable binding');
select is((select user_id::text from public.billing_checkout_bindings where provider_checkout_id='checkout-web-test'),'42000000-0000-4000-8000-000000000001','trigger attributes checkout to verified account');
select is((select outcome from public.claim_billing_checkout_attempt(
'42000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000011','pro_monthly','sandbox','web-v1')),'reused','only bound checkout is reused');
update public.billing_checkout_attempts set expires_at=now()-interval '2 days' where user_id='42000000-0000-4000-8000-000000000001';
select is((select outcome from public.claim_billing_checkout_attempt(
'42000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000012','pro_annual','sandbox','app-v1')),'busy','expired lease is not proof of an unpaid Polar checkout');
select is((select count(*)::integer from public.billing_checkout_attempts where user_id='42000000-0000-4000-8000-000000000001'),1,'claim never purges unresolved evidence');
insert into public.billing_access_grants(user_id,provider,environment,source_type,source_id,capability,status,resource_modified_at,snapshot_hash)
values('42000000-0000-4000-8000-000000000002','polar','sandbox','subscription','paid-sub','vantare.plan.pro','active',now(),repeat('a',64));
select is((select outcome from public.claim_billing_checkout_attempt(
'42000000-0000-4000-8000-000000000002','42000000-0000-4000-8000-000000000012','pro_plus_annual','sandbox','app-v1')),'conflict','paid account does not buy another subscription');
select is((select count(*)::integer from public.billing_checkout_attempts where user_id='42000000-0000-4000-8000-000000000002'),0,'active right causes no checkout write');
select lives_ok($$select public.apply_clerk_user_event('checkout-delete',repeat('b',64),'https://checkout-fixture.clerk.invalid','user_checkout_deleted','user.deleted',now(),null)$$,'canonical deletion is applied');
select throws_ok($$select * from public.claim_billing_checkout_attempt(
'42000000-0000-4000-8000-000000000003','42000000-0000-4000-8000-000000000013','pro_monthly','sandbox','web-v1')$$,'28000','account_deleted','deleted account cannot claim');
select throws_ok($$select public.complete_billing_checkout_attempt(
'42000000-0000-4000-8000-000000000003','42000000-0000-4000-8000-000000000013','checkout-no','https://sandbox.polar.sh/checkout/no')$$,'28000','account_deleted','deleted account cannot complete even as no-op');
select throws_ok($$select public.mark_billing_checkout_attempt_uncertain(
'42000000-0000-4000-8000-000000000003','42000000-0000-4000-8000-000000000013')$$,'28000','account_deleted','deleted account cannot mark uncertain');
select is((select count(*)::integer from public.billing_checkout_attempts where user_id='42000000-0000-4000-8000-000000000003'),0,'deleted identity creates no attempt');
select ok(not has_function_privilege('anon','public.claim_billing_checkout_attempt(uuid,uuid,text,text,text)','EXECUTE'),'anonymous claim rejected');
select ok(not has_function_privilege('authenticated','public.complete_billing_checkout_attempt(uuid,uuid,text,text)','EXECUTE'),'browser cannot complete directly');
select ok(has_function_privilege('service_role','public.claim_billing_checkout_attempt(uuid,uuid,text,text,text)','EXECUTE'),'service role retains claim access');
select is((select count(*)::integer from public.billing_checkout_bindings where provider_checkout_id='checkout-web-test'),1,'unrelated deleted account does not destroy live binding');
select * from finish();
rollback;
