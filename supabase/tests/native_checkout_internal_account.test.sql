-- #1608: Clerk-only accounts buy using the internal UUID, with no auth.users row.
begin;
create extension if not exists pgtap;
select plan(5);
insert into public.profiles(id) values ('16080000-0000-4000-8000-000000000003');
select lives_ok($$select * from public.claim_billing_checkout_attempt('16080000-0000-4000-8000-000000000003','16080000-0000-4000-8000-000000000004','pro_monthly','sandbox','catalog-v2')$$, 'Clerk-only internal account can claim checkout');
select is((select count(*)::integer from public.billing_checkout_attempts where user_id='16080000-0000-4000-8000-000000000003'),1,'attempt is durable before Polar');
select throws_ok($$select * from public.claim_billing_checkout_attempt('16080000-0000-4000-8000-000000000099','16080000-0000-4000-8000-000000000004','pro_monthly','sandbox','catalog-v2')$$,'23503',null,'unknown account is rejected');
select ok(not has_table_privilege('authenticated','public.billing_checkout_attempts','SELECT'),'RLS surface stays private');
select ok(not has_function_privilege('authenticated','public.claim_billing_checkout_attempt(uuid,uuid,text,text,text)','EXECUTE'),'claim stays server-only');
select * from finish();
rollback;
