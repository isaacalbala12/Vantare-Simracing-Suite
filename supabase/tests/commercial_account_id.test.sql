-- #1711: direct UUID guards preserve retained rows, not live ownership changes.
begin;
select no_plan();
create temporary table ledgers(relation regclass);
insert into ledgers values ('private.creator_checkout_attributions'),('private.creator_renewal_operations'),
 ('private.creator_subscription_revocations'),('private.report_creator_terms'),
 ('private.report_renewal_candidates'),('private.billing_payment_incidents');
select ok(exists(select 1 from pg_trigger where tgrelid=relation and tgname='a_account_write_barrier'
 and tgenabled='O' and (tgtype&31)=31),relation::text||': full enabled write barrier') from ledgers;
select ok(not has_table_privilege('service_role',relation,'insert')
 and not has_table_privilege('authenticated',relation,'update'),relation::text||': direct API writes stay closed') from ledgers;

insert into private.clerk_issuers(issuer,authorized_parties,enabled)
 values('https://account-id.clerk.invalid',array['https://app.invalid'],true);
insert into public.profiles(id) values('17110000-0000-4000-8000-000000000001'),('17110000-0000-4000-8000-000000000002');
insert into public.account_identities(issuer,subject,account_id)
 values('https://account-id.clerk.invalid','user_17110000000040008000000000000001','17110000-0000-4000-8000-000000000001');
insert into private.creator_checkout_attributions values('sandbox','17110000-0000-4000-8000-000000000001',
 '17110000-0000-4000-8000-000000000002','17110000-0000-4000-8000-000000000002','FIXTURE','17110000-0000-4000-8000-000000000002',now());
insert into private.creator_renewal_operations(environment,subscription_id,account_id,creator_id,first_order_id,product_id,checkout_key,creator_discount_id)
 values('sandbox','account-id','17110000-0000-4000-8000-000000000001','17110000-0000-4000-8000-000000000002','account-id',
 '17110000-0000-4000-8000-000000000002','pro_monthly','17110000-0000-4000-8000-000000000002');
insert into private.creator_subscription_revocations values('sandbox','account-id','17110000-0000-4000-8000-000000000001','subscription_revoked',now());
insert into private.report_creator_terms(environment,subscription_id,account_id,duration_months)
 values('sandbox','account-id','17110000-0000-4000-8000-000000000001',6);
insert into private.report_renewal_candidates values('sandbox','account-id','17110000-0000-4000-8000-000000000001',
 '17110000-0000-4000-8000-000000000002',100,now()+interval '1 month');
insert into private.billing_payment_incidents(environment,account_id,resource_id,reason)
 values('sandbox','17110000-0000-4000-8000-000000000001','account-id','fixture');
select throws_ok(format('update %s set account_id=%L where account_id=%L',relation,
 '17110000-0000-4000-8000-000000000002','17110000-0000-4000-8000-000000000001'),
 '28000',null,relation::text||': live owner cannot be reassigned') from ledgers;
select public.apply_clerk_user_event('1711-delete',repeat('a',64),'https://account-id.clerk.invalid',
 'user_17110000000040008000000000000001','user.deleted',now(),null);
select throws_ok(format('update %s set account_id=account_id where account_id=%L',relation,
 '17110000-0000-4000-8000-000000000001'),'28000',null,relation::text||': late UPDATE rejects erased account') from ledgers;
create function pg_temp.retained(r regclass) returns bigint language plpgsql as $$
declare n bigint; begin execute format('select count(*) from %s where account_id=%L',r,
 '17110000-0000-4000-8000-000000000001') into n; return n; end $$;
select is(pg_temp.retained(relation),1::bigint,relation::text||': history survives account erasure') from ledgers;
select * from finish();
rollback;
