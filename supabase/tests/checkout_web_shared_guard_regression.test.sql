begin;
create extension if not exists pgtap;
select plan(3);
insert into public.profiles(id) values
('42100000-0000-4000-8000-000000000001'),('42100000-0000-4000-8000-000000000002');
select is((select outcome from claim_billing_checkout_attempt(
'42100000-0000-4000-8000-000000000001','42100000-0000-4000-8000-000000000011','pro_monthly','sandbox','app')),'claimed','first channel claims normally');
select is((select outcome from claim_billing_checkout_attempt(
'42100000-0000-4000-8000-000000000001','42100000-0000-4000-8000-000000000012','pro_plus_annual','sandbox','web')),'busy','second channel cannot create a second Polar subscription');
insert into billing_access_grants(user_id,provider,environment,source_type,source_id,capability,status,resource_modified_at,snapshot_hash)
values('42100000-0000-4000-8000-000000000002','polar','sandbox','subscription','existing-paid','vantare.plan.pro','active',now(),repeat('a',64));
select is((select outcome from claim_billing_checkout_attempt(
'42100000-0000-4000-8000-000000000002','42100000-0000-4000-8000-000000000013','pro_annual','sandbox','web')),'conflict','paid account cannot start another checkout');
select * from finish();
rollback;
