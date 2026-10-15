begin;
create extension if not exists pgtap;
select plan(3);
insert into public.profiles(id) values ('16080000-0000-4000-8000-000000000005');
select lives_ok($$select * from public.claim_billing_checkout_attempt('16080000-0000-4000-8000-000000000005','16080000-0000-4000-8000-000000000006','pro_annual','sandbox','catalog-v2')$$,'annual plan can claim checkout');
select is((select checkout_key from public.billing_checkout_attempts where user_id='16080000-0000-4000-8000-000000000005'),'pro_annual','annual product stays durable');
select throws_ok($$select * from public.claim_billing_checkout_attempt('16080000-0000-4000-8000-000000000005','16080000-0000-4000-8000-000000000007','unknown_product','sandbox','catalog-v2')$$,'23514',null,'unknown product stays rejected');
select * from finish();
rollback;
